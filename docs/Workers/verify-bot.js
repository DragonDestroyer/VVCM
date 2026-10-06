/**
 * Working on github pages now
 * VAULT verify-bot + ledger
 * Paste entire file into Cloudflare Worker verify-bot → Save and deploy
 *
 * KV AUTH keys:
 *   citizen:<username>     → profile + uuid + balance
 *   uuid:<uuid>            → username (reverse index)
 *   session:<token>        → { discordUsername, uuid, exp }
 *   tx:<uuid>              → JSON array of recent transactions (capped)
 *   challenge:*, code:*    → auth flow
 *
 * Compatibility date: 2024-09-23+
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return cors(env, new Response(null, { status: 204 }));
    }
    try {
      if (url.pathname === "/discord/interactions" && request.method === "POST") {
        return await handleDiscordInteraction(request, env, ctx);
      }
      if (url.pathname === "/discord/register-commands" && request.method === "POST") {
        return cors(env, await registerSlashCommands(env));
      }
      if (url.pathname === "/auth/lookup" && request.method === "POST") {
        return cors(env, await lookup(request, env));
      }
      if (url.pathname === "/auth/start-challenge" && request.method === "POST") {
        return cors(env, await startChallenge(request, env));
      }
      if (url.pathname === "/auth/challenge-status" && request.method === "GET") {
        return cors(env, await challengeStatus(url, env));
      }
      if (url.pathname === "/auth/verify" && request.method === "POST") {
        return cors(env, await verify(request, env));
      }
      if (url.pathname === "/me" && request.method === "GET") {
        return cors(env, await me(request, env));
      }
      if (url.pathname === "/me/activity" && request.method === "GET") {
        return cors(env, await meActivity(request, env));
      }
      if (url.pathname === "/me/gigs" && request.method === "GET") {
        return cors(env, await meGigs(request, env));
      }
      if (url.pathname === "/citizens" && request.method === "GET") {
        return cors(env, await listCitizens(request, env));
      }
      if (url.pathname === "/ledger/transfer" && request.method === "POST") {
        return cors(env, await transfer(request, env));
      }
      return cors(env, json({ ok: true, service: "verify-bot" }));
    } catch (e) {
      return cors(env, json({ error: String(e.message || e) }, 500));
    }
  },
};

function json(data, status = 200) {
  return Response.json(data, { status });
}

function cors(env, res) {
  const origin = env.CORS_ORIGIN || "*";
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(res.body, { status: res.status, headers });
}

function randomInt(min, max) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return min + (buf[0] % (max - min + 1));
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const clean = String(hex || "").replace(/^0x/, "").trim();
  if (!clean || clean.length % 2 !== 0) throw new Error("Invalid hex");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  return bytes;
}

function makeChoices() {
  const correct = randomInt(10, 99);
  const set = new Set([correct]);
  while (set.size < 3) set.add(randomInt(10, 99));
  const arr = [...set];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return { correctNumber: correct, choices: arr };
}

async function verifyDiscordSignature(publicKeyHex, signatureHex, timestamp, body) {
  try {
    if (!publicKeyHex || !signatureHex || timestamp == null) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKeyHex),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      hexToBytes(signatureHex),
      new TextEncoder().encode(String(timestamp) + body)
    );
  } catch (e) {
    console.error("signature verify error", e);
    return false;
  }
}

/* ---------- citizen / ledger helpers ---------- */

function avatarUrl(discordId, avatarHash) {
  if (avatarHash) {
    const ext = String(avatarHash).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=128`;
  }
  const idx = Number(BigInt(discordId) >> 22n) % 6;
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

async function fetchDiscordUser(env, discordId) {
  const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
    headers: { Authorization: `Bot ${String(env.DISCORD_BOT_TOKEN).trim()}` },
  });
  if (!res.ok) return null;
  return res.json();
}

async function loadCitizen(env, username) {
  const key = `citizen:${String(username).toLowerCase()}`;
  return env.AUTH.get(key, "json");
}

async function saveCitizen(env, citizen) {
  const username = String(citizen.username || citizen.handle || "").toLowerCase();
  citizen.username = username;
  await env.AUTH.put(`citizen:${username}`, JSON.stringify(citizen));
  if (citizen.uuid) {
    await env.AUTH.put(`uuid:${citizen.uuid}`, username);
  }
}

/** Ensure uuid + balance; refresh Discord profile fields */
async function ensureCitizenProfile(env, citizen) {
  if (!citizen.uuid) citizen.uuid = crypto.randomUUID();
  if (typeof citizen.balance !== "number") citizen.balance = 0;
  if (!citizen.createdAt) citizen.createdAt = new Date().toISOString();

  if (citizen.discordId && env.DISCORD_BOT_TOKEN) {
    const du = await fetchDiscordUser(env, citizen.discordId);
    if (du) {
      citizen.displayName = du.global_name || du.username || citizen.displayName;
      citizen.handle = du.username || citizen.handle;
      citizen.avatarHash = du.avatar || null;
      citizen.avatar = avatarUrl(citizen.discordId, du.avatar);
    }
  }
  if (!citizen.avatar && citizen.discordId) {
    citizen.avatar = avatarUrl(citizen.discordId, citizen.avatarHash);
  }
  await saveCitizen(env, citizen);
  return citizen;
}

function publicCitizen(c) {
  return {
    uuid: c.uuid,
    displayName: c.displayName || c.username,
    handle: c.handle || c.username,
    avatar: c.avatar,
    balance: c.balance ?? 0,
    discordId: c.discordId,
    joined: c.joined || (c.createdAt ? c.createdAt.slice(0, 10) : null),
  };
}

async function sessionFromRequest(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const session = await env.AUTH.get(`session:${token}`, "json");
  if (!session || (session.exp && Date.now() > session.exp)) return null;
  return { token, session };
}

async function appendTx(env, uuid, entry) {
  const key = `tx:${uuid}`;
  const list = (await env.AUTH.get(key, "json")) || [];
  list.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...entry,
  });
  await env.AUTH.put(key, JSON.stringify(list.slice(0, 100)));
}

/* ---------- auth ---------- */

async function lookup(request, env) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.discordUsername || "").trim().toLowerCase();
  if (!username) return json({ error: "discordUsername required" }, 400);
  const citizen = await loadCitizen(env, username);
  if (!citizen) return json({ exists: false, error: "Not a registered citizen" }, 404);
  return json({ exists: true, displayName: citizen.displayName || username });
}

async function startChallenge(request, env) {
  if (!env.DISCORD_BOT_TOKEN) return json({ error: "DISCORD_BOT_TOKEN secret is not set" }, 500);
  const body = await request.json().catch(() => ({}));
  const username = String(body.discordUsername || "").trim().toLowerCase();
  if (!username) return json({ error: "discordUsername required" }, 400);
  const citizen = await loadCitizen(env, username);
  if (!citizen?.discordId) return json({ error: "Not a registered citizen" }, 404);

  const { correctNumber, choices } = makeChoices();
  const challengeId = crypto.randomUUID();
  const record = {
    id: challengeId,
    discordUsername: username,
    discordId: String(citizen.discordId),
    correctNumber,
    choices,
    status: "pending",
    createdAt: Date.now(),
  };
  await env.AUTH.put(`challenge:${challengeId}`, JSON.stringify(record), { expirationTtl: 600 });
  await env.AUTH.put(`user_challenge:${username}`, challengeId, { expirationTtl: 600 });
  await discordDmChallenge(env, record.discordId, challengeId, choices);
  return json({
    challengeId,
    correctNumber,
    displayName: citizen.displayName || username,
  });
}

async function challengeStatus(url, env) {
  const username = String(url.searchParams.get("discordUsername") || "").trim().toLowerCase();
  const challengeId = url.searchParams.get("challengeId");
  if (!username || !challengeId) return json({ status: "expired" });
  const raw = await env.AUTH.get(`challenge:${challengeId}`, "json");
  if (!raw || raw.discordUsername !== username) return json({ status: "expired" });
  return json({ status: raw.status, codeSent: raw.status === "matched" });
}

async function verify(request, env) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.discordUsername || "").trim().toLowerCase();
  const code = String(body.code || "").trim();
  if (!username || !code) return json({ error: "Missing fields" }, 400);

  const row = await env.AUTH.get(`code:${username}`, "json");
  if (!row || Date.now() > row.expiresAt) return json({ error: "Code expired or missing" }, 400);
  const hash = await sha256(code);
  if (hash !== row.codeHash) return json({ error: "Invalid code" }, 401);
  await env.AUTH.delete(`code:${username}`);

  let citizen = await loadCitizen(env, username);
  if (!citizen) return json({ error: "Citizen not found" }, 404);
  citizen = await ensureCitizenProfile(env, citizen);

  const token = crypto.randomUUID();
  await env.AUTH.put(
    `session:${token}`,
    JSON.stringify({
      discordUsername: username,
      uuid: citizen.uuid,
      exp: Date.now() + 72 * 3600 * 1000,
    }),
    { expirationTtl: 72 * 3600 }
  );

  return json({ citizen: publicCitizen(citizen), token });
}

/* ---------- me / ledger ---------- */

async function me(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  let citizen = await loadCitizen(env, s.session.discordUsername);
  if (!citizen) return json({ error: "Citizen not found" }, 404);
  citizen = await ensureCitizenProfile(env, citizen);
  return json(publicCitizen(citizen));
}

async function meActivity(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uuid = s.session.uuid;
  const list = (await env.AUTH.get(`tx:${uuid}`, "json")) || [];
  return json({
    items: list.map((t) => ({
      label: t.label || t.type || "Transaction",
      when: t.at ? new Date(t.at).toLocaleString() : "",
      amount: t.amount,
    })),
  });
}

async function meGigs(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const citizen = await loadCitizen(env, s.session.discordUsername);
  const items = Array.isArray(citizen?.gigs) ? citizen.gigs : [];
  return json({ items });
}

async function listCitizens(request, env) {
  // lightweight: only for pay search — scan not available on KV without list
  // Return empty until admin seeds a directory key
  const dir = (await env.AUTH.get("directory:citizens", "json")) || [];
  return json({
    items: dir.map((c) => ({
      displayName: c.displayName || c.username,
      name: c.displayName || c.username,
      uuid: c.uuid,
    })),
  });
}

async function transfer(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const body = await request.json().catch(() => ({}));
  const toUsername = String(body.toUsername || body.to || "").trim().toLowerCase();
  const amount = Number(body.amount);
  const note = String(body.note || "Transfer").slice(0, 120);
  if (!toUsername || !(amount > 0)) return json({ error: "Invalid transfer" }, 400);

  const from = await loadCitizen(env, s.session.discordUsername);
  const to = await loadCitizen(env, toUsername);
  if (!from || !to) return json({ error: "Citizen not found" }, 404);
  if ((from.balance || 0) < amount) return json({ error: "Insufficient balance" }, 400);

  from.balance = Number(from.balance || 0) - amount;
  to.balance = Number(to.balance || 0) + amount;
  await saveCitizen(env, from);
  await saveCitizen(env, to);

  await appendTx(env, from.uuid, {
    type: "transfer_out",
    label: `Transfer to ${to.displayName || to.username}`,
    amount: -amount,
    note,
    counterparty: to.uuid,
  });
  await appendTx(env, to.uuid, {
    type: "transfer_in",
    label: `Transfer from ${from.displayName || from.username}`,
    amount: amount,
    note,
    counterparty: from.uuid,
  });

  return json({ ok: true, balance: from.balance });
}

/* ---------- Discord REST ---------- */

async function discordApi(env, path, init = {}) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${String(env.DISCORD_BOT_TOKEN).trim()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status}: ${data.message || res.statusText}`);
  return data;
}

async function discordDmChallenge(env, discordId, challengeId, choices) {
  const channel = await discordApi(env, "/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: String(discordId) }),
  });
  await discordApi(env, `/channels/${channel.id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: "**VAULT sign-in**\nPick the number shown on the website.",
      components: [
        {
          type: 1,
          components: choices.map((n) => ({
            type: 2,
            style: 2,
            label: String(n),
            custom_id: `auth_pick:${challengeId}:${n}`,
          })),
        },
      ],
    }),
  });
}

async function discordDmText(env, discordId, content) {
  const channel = await discordApi(env, "/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: String(discordId) }),
  });
  await discordApi(env, `/channels/${channel.id}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

/* ---------- interactions ---------- */

async function handleDiscordInteraction(request, env, ctx) {
  const signature = request.headers.get("X-Signature-Ed25519") || "";
  const timestamp = request.headers.get("X-Signature-Timestamp") || "";
  const bodyText = await request.text();
  const valid = await verifyDiscordSignature(env.DISCORD_PUBLIC_KEY, signature, timestamp, bodyText);
  if (!valid) return new Response("Bad signature", { status: 401 });

  const interaction = JSON.parse(bodyText);
  if (interaction.type === 1) return Response.json({ type: 1 });

  if (interaction.type === 2) {
    const name = interaction.data?.name || "";
    if (name === "syncmembers") {
      ctx.waitUntil(processSyncMembers(env, interaction));
      return Response.json({
        type: 5,
        data: { flags: 64 },
      });
    }
    return Response.json({ type: 4, data: { content: "Unknown command.", flags: 64 } });
  }

  if (interaction.type === 3) {
    const customId = interaction.data?.custom_id || "";
    if (!customId.startsWith("auth_pick:")) {
      return Response.json({ type: 4, data: { content: "Unknown button." } });
    }
    const parts = customId.split(":");
    ctx.waitUntil(processAuthPick(env, interaction, parts[1], Number(parts[2])));
    return Response.json({ type: 4, data: { content: "Checking your selection…" } });
  }
  return Response.json({ type: 4, data: { content: "Unsupported interaction." } });
}

async function processAuthPick(env, interaction, challengeId, picked) {
  const appId = interaction.application_id;
  const token = interaction.token;
  const userId = String(interaction.user?.id || interaction.member?.user?.id || "");
  const edit = async (content) => {
    await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  };
  try {
    const challenge = await env.AUTH.get(`challenge:${challengeId}`, "json");
    if (!challenge) return edit("Challenge expired. Start again on the website.");
    if (userId !== String(challenge.discordId)) return edit("This challenge is not for your account.");
    if (challenge.status !== "pending") return edit("This challenge was already used.");
    if (picked !== challenge.correctNumber) {
      challenge.status = "failed";
      await env.AUTH.put(`challenge:${challengeId}`, JSON.stringify(challenge), { expirationTtl: 600 });
      return edit("Wrong number. Start over on the website.");
    }
    const code = String(randomInt(100000, 999999));
    const codeHash = await sha256(code);
    await env.AUTH.put(
      `code:${challenge.discordUsername}`,
      JSON.stringify({ codeHash, challengeId, expiresAt: Date.now() + 5 * 60 * 1000 }),
      { expirationTtl: 300 }
    );
    challenge.status = "matched";
    await env.AUTH.put(`challenge:${challengeId}`, JSON.stringify(challenge), { expirationTtl: 600 });
    await discordDmText(
      env,
      challenge.discordId,
      `Your **VAULT** login code is: **${code}**\nIt expires in 5 minutes. Enter it on the website.`
    );
    await edit("Correct. Check your DMs for the login code.");
  } catch (e) {
    console.error(e);
    try {
      await edit("Something went wrong. Try signing in again on the website.");
    } catch (_) {}
  }
}


const CITIZEN_ROLE_ID = "1459428814684684383";

async function registerSlashCommands(env) {
  const appId = env.DISCORD_APPLICATION_ID || env.APPLICATION_ID;
  const token = env.DISCORD_BOT_TOKEN;
  if (!appId || !token) {
    return json({ error: "DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN required" }, 500);
  }
  const guildId = env.DISCORD_GUILD_ID;
  const body = [
    {
      name: "syncmembers",
      description: "Scan this server and create VAULT accounts for everyone with the citizen role.",
      type: 1,
    },
  ];
  const path = guildId
    ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${appId}/commands`;
  const res = await fetch(path, {
    method: "PUT",
    headers: {
      Authorization: "Bot " + String(token).trim(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: data.message || res.statusText, data }, res.status);
  return json({ ok: true, commands: data });
}

async function processSyncMembers(env, interaction) {
  const appId = interaction.application_id;
  const token = interaction.token;
  const edit = async (content) => {
    await fetch(`https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  };
  try {
    const guildId = String(interaction.guild_id || env.DISCORD_GUILD_ID || "").trim();
    const roleId = String(env.DISCORD_CITIZEN_ROLE_ID || CITIZEN_ROLE_ID).trim();
    if (!guildId) return edit("This command must be used inside the VidiaVille server.");
    if (!env.DISCORD_BOT_TOKEN) return edit("Bot token is not configured on the worker.");

    const result = await syncGuildRoleToCitizens(env, guildId, roleId);
    await edit(
      `VAULT sync complete.\n` +
        `Role \`${roleId}\`\n` +
        `Matched **${result.matched}** members\n` +
        `Created **${result.created}** new accounts\n` +
        `Updated **${result.updated}** existing accounts\n` +
        `Directory size: **${result.totalDirectory}**`
    );
  } catch (e) {
    await edit("Sync failed: " + String(e.message || e));
  }
}

async function syncGuildRoleToCitizens(env, guildId, roleId) {
  const members = [];
  let after = "0";
  for (let page = 0; page < 50; page++) {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/members?limit=1000&after=${after}`,
      { headers: { Authorization: "Bot " + String(env.DISCORD_BOT_TOKEN).trim() } }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Discord members ${res.status}: ${err.message || res.statusText}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;
    members.push(...batch);
    after = batch[batch.length - 1].user?.id || after;
    if (batch.length < 1000) break;
  }

  const withRole = members.filter(
    (m) => Array.isArray(m.roles) && m.roles.includes(roleId) && m.user && !m.user.bot
  );

  let created = 0;
  let updated = 0;
  const dir = (await env.AUTH.get("directory:citizens", "json")) || [];
  const dirMap = new Map(dir.map((c) => [String(c.username || "").toLowerCase(), c]));

  for (const m of withRole) {
    const u = m.user;
    const username = String(u.username || "").toLowerCase();
    if (!username) continue;
    let citizen = (await env.AUTH.get(`citizen:${username}`, "json")) || null;
    if (!citizen) {
      citizen = {
        username,
        discordId: String(u.id),
        displayName: m.nick || u.global_name || u.username,
        guildNick: m.nick || "",
        handle: u.username,
        balance: 0,
        uuid: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        source: "syncmembers",
        gigs: [],
        companies: [],
      };
      created++;
    } else {
      citizen.discordId = String(u.id);
      citizen.displayName = m.nick || u.global_name || u.username || citizen.displayName;
      citizen.guildNick = m.nick || citizen.guildNick || "";
      citizen.handle = u.username || citizen.handle;
      if (!citizen.uuid) citizen.uuid = crypto.randomUUID();
      if (typeof citizen.balance !== "number") citizen.balance = 0;
      updated++;
    }
    await env.AUTH.put(`citizen:${username}`, JSON.stringify(citizen));
    if (citizen.uuid) await env.AUTH.put(`uuid:${citizen.uuid}`, username);
    dirMap.set(username, {
      username,
      displayName: citizen.displayName,
      uuid: citizen.uuid,
      balance: citizen.balance ?? 0,
      handle: citizen.handle,
      discordId: citizen.discordId,
    });
  }

  const newDir = [...dirMap.values()];
  await env.AUTH.put("directory:citizens", JSON.stringify(newDir));
  await env.AUTH.put(
    "sync:last",
    JSON.stringify({
      at: new Date().toISOString(),
      source: "syncmembers",
      guildId,
      roleId,
      matched: withRole.length,
      created,
      updated,
    })
  );
  return { ok: true, matched: withRole.length, created, updated, totalDirectory: newDir.length };
}