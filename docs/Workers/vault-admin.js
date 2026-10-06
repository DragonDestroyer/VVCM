/**
 * VAULT Admin Worker (separate from verify-bot and vault-ledger)
 *
 * Cloudflare: create Worker e.g. "vault-admin"
 * Bind SAME KV as the others, variable name: AUTH
 * Optional secret: DISCORD_BOT_TOKEN
 * Optional var: CORS_ORIGIN = https://vvcm.pages.dev
 *
 * Admin access: session token must belong to a citizen whose
 * username/displayName is in ADMINS list (or citizen.admin === true).
 *
 * Endpoints:
 *   GET  /admin/stats
 *   GET  /admin/citizens
 *   GET  /admin/citizen?username=
 *   POST /admin/citizen/upsert
 *   POST /admin/citizen/set-balance
 *   POST /admin/citizen/grant
 *   GET  /admin/companies
 *   POST /admin/company/upsert
 *   GET  /admin/applications
 *   POST /admin/application/decide
 *   GET  /admin/contracts
 *   GET  /admin/reports/latest
 *   POST /admin/events
 *   POST /admin/directory/rebuild
 */

const ADMIN_SEED = ["dragon_destroyer", "apple"]; // used only to initialize KV directory:admins

export default {
  /** Cron: Settings → Triggers → Add Cron (e.g. every 5 min) for auto role sync */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      syncCitizenRole(env, {
        guildId: env.DISCORD_GUILD_ID,
        roleId: env.DISCORD_CITIZEN_ROLE_ID,
        defaultBalance: Number(env.SYNC_DEFAULT_BALANCE || 0),
        source: "cron",
      }).catch((e) => console.error("cron sync", e))
    );
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return cors(env, new Response(null, { status: 204 }));
    }

    try {
      // ---- Overlord (password auth, not Discord) ----
      if (url.pathname.startsWith("/overlord/")) {
        if (url.pathname === "/overlord/login" && request.method === "POST") {
          return cors(env, await overlordLogin(request, env));
        }
        const gate = await requireOverlord(request, env);
        if (gate.error) return cors(env, gate.error);

        if (url.pathname === "/overlord/me" && request.method === "GET") {
          return cors(env, json({ ok: true, role: "overlord" }));
        }
        if (url.pathname === "/overlord/sync-role" && request.method === "POST") {
          return cors(env, await overlordSyncRole(request, env));
        }
        if (url.pathname === "/overlord/import-unb" && request.method === "POST") {
          return cors(env, await overlordImportUnb(request, env));
        }
        if (url.pathname === "/overlord/debug/kv" && request.method === "GET") {
          return cors(env, await overlordDebugKv(url, env));
        }
        if (url.pathname === "/overlord/debug/sessions" && request.method === "GET") {
          return cors(env, await overlordDebugMeta(env));
        }
        if (url.pathname === "/overlord/citizen/set" && request.method === "POST") {
          return cors(env, await upsertCitizen(request, env));
        }
        if (url.pathname === "/overlord/citizen/grant" && request.method === "POST") {
          return cors(env, await grantMoney(request, env));
        }
        if (url.pathname === "/overlord/citizens" && request.method === "GET") {
          return cors(env, await listCitizens(env));
        }
        if (url.pathname === "/overlord/companies" && request.method === "GET") {
          return cors(env, await listCompanies(env));
        }
        if (url.pathname === "/overlord/company/assign" && request.method === "POST") {
          return cors(env, await overlordAssignCompany(request, env));
        }
        if (url.pathname === "/overlord/admins" && request.method === "GET") {
          return cors(env, await listAdmins(env));
        }
        if (url.pathname === "/overlord/admins/add" && request.method === "POST") {
          return cors(env, await addAdmin(request, env, "overlord"));
        }
        if (url.pathname === "/overlord/admins/remove" && request.method === "POST") {
          return cors(env, await removeAdmin(request, env, "overlord"));
        }
        if (url.pathname === "/overlord/admins/audit" && request.method === "GET") {
          return cors(env, await listAdminAudit(url, env));
        }
        return cors(env, json({ error: "Not found" }, 404));
      }

      // All /admin/* routes require admin session
      if (url.pathname.startsWith("/admin/")) {
        const gate = await requireAdmin(request, env);
        if (gate.error) return cors(env, gate.error);
        const auditClone = request.method === "POST" ? request.clone() : null;
        const send = async (resPromise, action) => {
          const res = await resPromise;
          if (auditClone && action && res.status < 400) {
            const body = await auditClone.json().catch(() => ({}));
            const safe = {};
            for (const [k, v] of Object.entries(body || {})) {
              if (k === "password" || k === "token") continue;
              if (typeof v === "string" && v.startsWith("data:")) {
                safe[k] = "[omitted]";
                continue;
              }
              safe[k] = v;
            }
            await recordAdminAction(env, gate.admin, action, safe);
          }
          return cors(env, res);
        };

        if (url.pathname === "/admin/stats" && request.method === "GET") {
          return cors(env, await stats(env));
        }
        if (url.pathname === "/admin/citizens" && request.method === "GET") {
          return cors(env, await listCitizens(env));
        }
        if (url.pathname === "/admin/citizen" && request.method === "GET") {
          return cors(env, await getCitizen(url, env));
        }
        if (url.pathname === "/admin/citizen/upsert" && request.method === "POST") {
          return await send(upsertCitizen(request, env), "citizen.upsert");
        }
        if (url.pathname === "/admin/citizen/set-balance" && request.method === "POST") {
          return await send(setBalance(request, env), "citizen.set-balance");
        }
        if (url.pathname === "/admin/citizen/grant" && request.method === "POST") {
          return await send(grantMoney(request, env), "citizen.grant");
        }
        if (url.pathname === "/admin/citizen/grant-all" && request.method === "POST") {
          return await send(grantAll(request, env), "citizen.grant-all");
        }
        if (url.pathname === "/admin/companies" && request.method === "GET") {
          return cors(env, await listCompanies(env));
        }
        if (url.pathname === "/admin/company/upsert" && request.method === "POST") {
          return await send(upsertCompany(request, env), "company.upsert");
        }
        if (url.pathname === "/admin/company/delete" && request.method === "POST") {
          return await send(deleteCompany(request, env), "company.delete");
        }
        if (url.pathname === "/admin/applications" && request.method === "GET") {
          return cors(env, await listApplications(env));
        }
        if (url.pathname === "/admin/application/decide" && request.method === "POST") {
          return await send(decideApplication(request, env), "application.decide");
        }
        if (url.pathname === "/admin/contracts" && request.method === "GET") {
          return cors(env, await listContracts(env));
        }
        if (url.pathname === "/admin/reports/latest" && request.method === "GET") {
          return cors(env, await latestReports(env));
        }
        if (url.pathname === "/admin/events" && request.method === "POST") {
          return await send(logEvent(request, env, gate.admin), "event.log");
        }
        if (url.pathname === "/admin/directory/rebuild" && request.method === "POST") {
          return await send(rebuildDirectory(env), "directory.rebuild");
        }
        if (url.pathname === "/admin/transfers" && request.method === "GET") {
          return cors(env, await listCityTransfers(env));
        }
        if (url.pathname === "/admin/companies/dedupe" && request.method === "POST") {
          return await send(dedupeCompanies(env), "company.dedupe");
        }
        return cors(env, json({ error: "Not found" }, 404));
      }

      return cors(env, json({ ok: true, service: "vault-admin" }));
    } catch (e) {
      return cors(env, json({ error: String(e.message || e) }, 500));
    }
  },
};

function normCompanyName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[™®©℠]/g, "")
    .replace(/&trade;|&reg;|&copy;/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function appendCityTransfer(env, entry) {
  const list = (await env.AUTH.get("city:transfers", "json")) || [];
  list.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry });
  await env.AUTH.put("city:transfers", JSON.stringify(list.slice(0, 500)));
}

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

async function sessionFromRequest(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const session = await env.AUTH.get(`session:${token}`, "json");
  if (!session) return null;
  if (session.exp && Date.now() > session.exp) return null;
  return { token, session };
}

async function loadCitizen(env, username) {
  return env.AUTH.get(`citizen:${String(username).toLowerCase()}`, "json");
}

async function saveCitizen(env, citizen) {
  const username = String(citizen.username || citizen.handle || "").toLowerCase();
  citizen.username = username;
  await env.AUTH.put(`citizen:${username}`, JSON.stringify(citizen));
  if (citizen.uuid) await env.AUTH.put(`uuid:${citizen.uuid}`, username);
}

async function getAdminList(env) {
  let list = (await env.AUTH.get("directory:admins", "json")) || null;
  if (!Array.isArray(list) || !list.length) {
    list = ADMIN_SEED.map((username) => ({
      username,
      displayName: username,
      addedAt: new Date().toISOString(),
      addedBy: "system",
    }));
    await env.AUTH.put("directory:admins", JSON.stringify(list));
  }
  return list;
}

function adminUsernames(list) {
  return new Set(
    (list || []).map((a) => String(a.username || a).toLowerCase()).filter(Boolean)
  );
}

async function isAdminCitizen(c, env) {
  if (!c) return false;
  if (c.admin === true) return true;
  const list = env ? await getAdminList(env) : [];
  const allowed = adminUsernames(list);
  const names = [
    String(c.username || "").toLowerCase(),
    String(c.handle || "").toLowerCase(),
    String(c.displayName || "").toLowerCase(),
  ];
  return names.some((n) => n && allowed.has(n));
}

async function requireAdmin(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return { error: json({ error: "Unauthorized" }, 401) };
  const citizen = await loadCitizen(env, s.session.discordUsername);
  if (!(await isAdminCitizen(citizen, env))) {
    return { error: json({ error: "Forbidden — admin only" }, 403) };
  }
  return { admin: citizen, session: s.session };
}

async function recordAdminAction(env, admin, action, detail) {
  const by = String(admin?.username || admin?.handle || admin || "unknown").toLowerCase();
  const entry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    by,
    displayName: admin?.displayName || by,
    action: String(action || "action").slice(0, 80),
    detail: detail && typeof detail === "object" ? detail : { note: String(detail || "") },
  };
  const global = (await env.AUTH.get("admin:audit", "json")) || [];
  global.unshift(entry);
  await env.AUTH.put("admin:audit", JSON.stringify(global.slice(0, 2000)));
  const per = (await env.AUTH.get(`admin:audit:${by}`, "json")) || [];
  per.unshift(entry);
  await env.AUTH.put(`admin:audit:${by}`, JSON.stringify(per.slice(0, 800)));
  return entry;
}

async function listAdmins(env) {
  const items = await getAdminList(env);
  return json({ items });
}

async function addAdmin(request, env, actor) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || body.handle || "").trim().toLowerCase();
  if (!username) return json({ error: "username required" }, 400);
  const list = await getAdminList(env);
  if (adminUsernames(list).has(username)) {
    return json({ ok: true, already: true, items: list });
  }
  const citizen = await loadCitizen(env, username);
  const row = {
    username,
    displayName: (citizen && (citizen.displayName || citizen.username)) || body.displayName || username,
    addedAt: new Date().toISOString(),
    addedBy: actor || "overlord",
  };
  list.push(row);
  await env.AUTH.put("directory:admins", JSON.stringify(list));
  if (citizen) {
    citizen.admin = true;
    await saveCitizen(env, citizen);
    await syncCitizenDirectory(env, citizen);
  }
  await recordAdminAction(env, { username: actor }, "admins.add", { username, displayName: row.displayName });
  return json({ ok: true, items: list, added: row });
}

async function removeAdmin(request, env, actor) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || body.handle || "").trim().toLowerCase();
  if (!username) return json({ error: "username required" }, 400);
  let list = await getAdminList(env);
  if (list.length <= 1) return json({ error: "Cannot remove the last admin." }, 400);
  if (!adminUsernames(list).has(username)) return json({ error: "Not an admin" }, 404);
  list = list.filter((a) => String(a.username || "").toLowerCase() !== username);
  await env.AUTH.put("directory:admins", JSON.stringify(list));
  const citizen = await loadCitizen(env, username);
  if (citizen) {
    citizen.admin = false;
    await saveCitizen(env, citizen);
    await syncCitizenDirectory(env, citizen);
  }
  await recordAdminAction(env, { username: actor }, "admins.remove", { username });
  return json({ ok: true, items: list, removed: username });
}

async function listAdminAudit(url, env) {
  const username = String(url.searchParams.get("username") || "").trim().toLowerCase();
  const hours = Math.max(1, Number(url.searchParams.get("hours") || 24) || 24);
  const since = Date.now() - hours * 3600 * 1000;
  let items = [];
  if (username) {
    items = (await env.AUTH.get(`admin:audit:${username}`, "json")) || [];
  } else {
    items = (await env.AUTH.get("admin:audit", "json")) || [];
  }
  items = items.filter((e) => {
    const t = Date.parse(e.at || "");
    return Number.isFinite(t) && t >= since;
  });
  return json({ username: username || "all", hours, count: items.length, items });
}

async function appendTx(env, uuid, entry) {
  if (!uuid) return;
  const key = `tx:${uuid}`;
  const list = (await env.AUTH.get(key, "json")) || [];
  list.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry });
  await env.AUTH.put(key, JSON.stringify(list.slice(0, 100)));
}

/* ---------- handlers ---------- */

async function stats(env) {
  const dir = (await env.AUTH.get("directory:citizens", "json")) || [];
  const cos = (await env.AUTH.get("directory:companies", "json")) || [];
  const apps = (await env.AUTH.get("directory:applications", "json")) || [];
  const pendingApps = apps.filter((a) => a.status === "pending").length;
  let money = 0;
  for (const c of dir) money += Number(c.balance || 0);
  for (const c of cos) money += Number(c.balance || 0);
  return json({
    citizens: dir.length,
    companies: cos.length,
    pendingApps,
    moneyInMotion: money.toLocaleString("en-US", { maximumFractionDigits: 0 }),
  });
}

async function listCitizens(env) {
  const dir = (await env.AUTH.get("directory:citizens", "json")) || [];
  // Enrich from live citizen records when present
  const items = [];
  for (const row of dir) {
    const live = row.username
      ? await loadCitizen(env, row.username)
      : null;
    const c = live || row;
    items.push({
      name: c.displayName || c.username || row.name,
      handle: c.handle ? "@" + String(c.handle).replace(/^@/, "") : "",
      balance: c.balance ?? 0,
      gigs: Array.isArray(c.gigs) ? c.gigs.length : c.gigs ?? 0,
      joined: c.joined || (c.createdAt ? String(c.createdAt).slice(0, 10) : ""),
      flags: c.flags || "",
      uuid: c.uuid || row.uuid || "",
      username: c.username || row.username || "",
    });
  }
  return json({ items });
}

async function getCitizen(url, env) {
  const username = String(url.searchParams.get("username") || "").toLowerCase();
  if (!username) return json({ error: "username required" }, 400);
  const c = await loadCitizen(env, username);
  if (!c) return json({ error: "Not found" }, 404);
  return json(c);
}

async function upsertCitizen(request, env) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || body.handle || "").trim().toLowerCase();
  if (!username) return json({ error: "username required" }, 400);

  let citizen = (await loadCitizen(env, username)) || {};
  citizen.username = username;
  if (body.discordId) citizen.discordId = String(body.discordId);
  if (body.displayName) citizen.displayName = String(body.displayName);
  if (body.handle) citizen.handle = String(body.handle).replace(/^@/, "");
  if (typeof body.balance === "number") citizen.balance = body.balance;
  if (typeof body.admin === "boolean") citizen.admin = body.admin;
  if (!citizen.uuid) citizen.uuid = crypto.randomUUID();
  if (typeof citizen.balance !== "number") citizen.balance = 0;
  if (!citizen.createdAt) citizen.createdAt = new Date().toISOString();

  await saveCitizen(env, citizen);
  await syncCitizenDirectory(env, citizen);
  return json({ ok: true, citizen });
}

async function setBalance(request, env) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim().toLowerCase();
  const balance = Number(body.balance);
  if (!username || !Number.isFinite(balance)) {
    return json({ error: "username and balance required" }, 400);
  }
  const citizen = await loadCitizen(env, username);
  if (!citizen) return json({ error: "Not found" }, 404);
  const prev = Number(citizen.balance || 0);
  citizen.balance = balance;
  if (!citizen.uuid) citizen.uuid = crypto.randomUUID();
  await saveCitizen(env, citizen);
  await appendTx(env, citizen.uuid, {
    type: "admin_adjust",
    label: "Admin balance adjustment",
    amount: balance - prev,
  });
  await syncCitizenDirectory(env, citizen);
  return json({ ok: true, balance: citizen.balance, uuid: citizen.uuid });
}


async function grantMoney(request, env) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || body.handle || "").trim().toLowerCase();
  const amount = Number(body.amount);
  const note = String(body.note || "Admin grant").slice(0, 160);
  if (!username || !Number.isFinite(amount) || amount === 0) {
    return json({ error: "username and non-zero amount required" }, 400);
  }
  let citizen = await loadCitizen(env, username);
  if (!citizen) {
    // try match by displayName via directory
    const dir = (await env.AUTH.get("directory:citizens", "json")) || [];
    const hit = dir.find(
      (c) =>
        String(c.username || "").toLowerCase() === username ||
        String(c.displayName || "").toLowerCase() === username ||
        String(c.handle || "").toLowerCase() === username
    );
    if (hit?.username) citizen = await loadCitizen(env, hit.username);
  }
  if (!citizen) return json({ error: "Citizen not found" }, 404);
  if (!citizen.uuid) citizen.uuid = crypto.randomUUID();
  const prev = Number(citizen.balance || 0);
  citizen.balance = prev + amount;
  await saveCitizen(env, citizen);
  await appendTx(env, citizen.uuid, {
    type: amount > 0 ? "admin_grant" : "admin_debit",
    label: note,
    amount,
  });
  await syncCitizenDirectory(env, citizen);
  return json({
    ok: true,
    username: citizen.username,
    displayName: citizen.displayName || citizen.username,
    previousBalance: prev,
    balance: citizen.balance,
    delta: amount,
    uuid: citizen.uuid,
  });
}



async function grantAll(request, env) {
  const body = await request.json().catch(() => ({}));
  const raw = Number(body.amount);
  const mode = String(body.mode || "grant").toLowerCase();
  const note = String(body.note || "Admin grant all").slice(0, 160);
  if (!Number.isFinite(raw) || raw < 0) {
    return json({ error: "amount required" }, 400);
  }
  if (mode !== "set" && raw === 0) {
    return json({ error: "non-zero amount required" }, 400);
  }
  const dir = (await env.AUTH.get("directory:citizens", "json")) || [];
  let updated = 0;
  let skipped = 0;
  const nextDir = dir.slice();

  const writeOne = async (idx) => {
    const row = dir[idx];
    const username = String(row.username || "").toLowerCase();
    if (!username) { skipped++; return; }
    let citizen = await loadCitizen(env, username);
    if (!citizen) { skipped++; return; }
    if (!citizen.uuid) citizen.uuid = crypto.randomUUID();
    const prev = Number(citizen.balance || 0);
    if (mode === "set") citizen.balance = raw;
    else if (mode === "remove") citizen.balance = Math.max(0, prev - raw);
    else citizen.balance = prev + raw;
    citizen.username = username;
    await env.AUTH.put(`citizen:${username}`, JSON.stringify(citizen));
    if (citizen.uuid) await env.AUTH.put(`uuid:${citizen.uuid}`, username);
    nextDir[idx] = {
      ...row,
      username,
      displayName: citizen.displayName || row.displayName || username,
      uuid: citizen.uuid,
      balance: citizen.balance ?? 0,
      handle: citizen.handle || row.handle || username,
    };
    updated++;
  };

  const chunk = 8;
  for (let i = 0; i < dir.length; i += chunk) {
    const jobs = [];
    for (let j = i; j < Math.min(i + chunk, dir.length); j++) jobs.push(writeOne(j));
    await Promise.all(jobs);
  }
  await env.AUTH.put("directory:citizens", JSON.stringify(nextDir));
  return json({ ok: true, updated, skipped, amount: raw, mode, note });
}

async function syncCitizenDirectory(env, citizen) {
  const dir = (await env.AUTH.get("directory:citizens", "json")) || [];
  const username = citizen.username;
  const idx = dir.findIndex(
    (c) => String(c.username || "").toLowerCase() === username
  );
  const row = {
    username,
    displayName: citizen.displayName || username,
    uuid: citizen.uuid,
    balance: citizen.balance ?? 0,
    handle: citizen.handle || username,
  };
  if (idx >= 0) dir[idx] = { ...dir[idx], ...row };
  else dir.push(row);
  await env.AUTH.put("directory:citizens", JSON.stringify(dir));
}

function companyIsListed(c) {
  const st = String(c.status || "Active").toLowerCase();
  if (st === "pending" || st === "draft" || st === "applied" || st === "rejected") return false;
  return true;
}

async function listCompanies(env) {
  let cos = (await env.AUTH.get("directory:companies", "json")) || [];
  const apps = (await env.AUTH.get("directory:applications", "json")) || [];
  const pendingIds = new Set(
    apps.filter((a) => String(a.status || "pending").toLowerCase() === "pending").map((a) => String(a.id || ""))
  );
  const pendingNames = new Set(
    apps
      .filter((a) => String(a.status || "pending").toLowerCase() === "pending")
      .map((a) => normCompanyName(a.companyName || a.name))
  );
  // drop pending apps accidentally stored as companies, then unique names
  const seen = new Set();
  const items = [];
  let dirty = false;
  const kept = [];
  for (const c of cos) {
    if (pendingIds.has(String(c.id || "")) || (pendingNames.has(normCompanyName(c.name)) && String(c.status || "").toLowerCase() === "pending")) {
      dirty = true;
      continue;
    }
    if (!companyIsListed(c)) {
      dirty = true;
      continue;
    }
    const key = normCompanyName(c.name) || c.id;
    if (seen.has(key)) {
      dirty = true;
      continue;
    }
    seen.add(key);
    kept.push(c);
    items.push({
      name: c.name,
      owner: c.owner || "",
      balance: c.balance ?? 0,
      staff: c.staff ?? 0,
      status: c.status || "Active",
      href: "owner-overview.html?id=" + encodeURIComponent(c.id || ""),
      id: c.id || "",
    });
  }
  if (dirty) await env.AUTH.put("directory:companies", JSON.stringify(kept));
  return json({ items });
}

async function deleteCompany(request, env) {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const confirmName = String(body.confirmName || "").trim();
  if (!confirmName) return json({ error: "confirmName required" }, 400);
  const cos = (await env.AUTH.get("directory:companies", "json")) || [];
  const want = normCompanyName(confirmName);
  const targets = cos.filter((c) => {
    if (want && normCompanyName(c.name) === want) return true;
    return id && c.id === id && normCompanyName(c.name) === want;
  });
  if (!targets.length) return json({ error: "Company not found" }, 404);
  if (!targets.some((c) => normCompanyName(c.name) === want)) {
    return json({ error: "Typed name does not match the company name." }, 400);
  }
  const keep = cos.filter((c) => !targets.includes(c));
  await env.AUTH.put("directory:companies", JSON.stringify(keep));
  const deleted = [];
  for (const co of targets) {
    await env.AUTH.delete(`company:${co.id}`);
    await env.AUTH.delete(`ctx:${co.id}`);
    const ownerName = String(co.owner || "").toLowerCase();
    if (ownerName) {
      const owner = await loadCitizen(env, ownerName);
      if (owner) {
        owner.companies = (owner.companies || []).filter((c) => c.id !== co.id);
        owner.gigs = (owner.gigs || []).filter((g) => g.companyId !== co.id);
        await saveCitizen(env, owner);
        await syncCitizenDirectory(env, owner);
      }
    }
    deleted.push({ id: co.id, name: co.name });
  }
  return json({ ok: true, deleted: deleted[0], deletedAll: deleted });
}

async function upsertCompany(request, env) {
  const body = await request.json().catch(() => ({}));
  if (!body.name) return json({ error: "name required" }, 400);
  const cos = (await env.AUTH.get("directory:companies", "json")) || [];
  const id = body.id || crypto.randomUUID();
  const idx = cos.findIndex((c) => c.id === id || c.name === body.name);
  const row = {
    id,
    name: body.name,
    owner: body.owner || "",
    balance: body.balance ?? 0,
    staff: body.staff ?? 0,
    status: body.status || "Active",
    href: body.href || "owner-overview?id=" + encodeURIComponent(id),
  };
  if (idx >= 0) cos[idx] = { ...cos[idx], ...row };
  else cos.push(row);
  await env.AUTH.put("directory:companies", JSON.stringify(cos));
  await env.AUTH.put(`company:${id}`, JSON.stringify(row));
  return json({ ok: true, company: row });
}

async function listApplications(env) {
  const apps = (await env.AUTH.get("directory:applications", "json")) || [];
  const pending = apps.filter((a) => String(a.status || "pending").toLowerCase() === "pending");
  return json({
    items: pending.map((a) => ({
      id: a.id,
      companyName: a.companyName || a.name,
      name: a.companyName || a.name,
      applicant: a.applicant || "",
      applicantDisplay: a.applicantDisplay || a.applicant || "",
      status: a.status || "pending",
      personalFunds: a.personalFunds ?? 0,
      requested: a.requested ?? 0,
      startingFunds: a.startingFunds ?? a.personalFunds ?? 0,
      submitted: a.submitted || a.at || "",
      description: a.description || "",
      application: a.application || a.description || "",
      message: a.application || a.description || "",
    })),
  });
}

async function decideApplication(request, env) {
  const body = await request.json().catch(() => ({}));
  const id = body.id;
  const decision = String(body.decision || "").toLowerCase(); // approve | reject
  if (!id || !["approve", "reject"].includes(decision)) {
    return json({ error: "id and decision (approve|reject) required" }, 400);
  }
  const apps = (await env.AUTH.get("directory:applications", "json")) || [];
  const idx = apps.findIndex((a) => a.id === id);
  if (idx < 0) return json({ error: "Application not found" }, 404);
  apps[idx].status = decision === "approve" ? "approved" : "rejected";
  apps[idx].decidedAt = new Date().toISOString();
  await env.AUTH.put("directory:applications", JSON.stringify(apps));

  if (decision === "approve") {
    const app = apps[idx];
    if (apps[idx].companyId) {
      return json({ ok: true, application: apps[idx], alreadyApproved: true });
    }
    const cos = (await env.AUTH.get("directory:companies", "json")) || [];
    const want = String(app.companyName || app.name || "").trim().toLowerCase().replace(/\s+/g, " ");
    const existing = cos.find((c) => String(c.name || "").trim().toLowerCase().replace(/\s+/g, " ") === want);
    if (existing) {
      apps[idx].companyId = existing.id;
      apps[idx].finalBalance = existing.balance ?? 0;
      await env.AUTH.put("directory:applications", JSON.stringify(apps));
      return json({ ok: true, application: apps[idx], reused: existing.id, note: "Company name already existed; did not create a duplicate." });
    }
    const companyId = crypto.randomUUID();
    // personalFunds already held from applicant; optional extra city sanction from body.sanction
    const personal = Number(app.personalFunds || app.startingFunds || 0);
    const sanction = body.sanction != null ? Number(body.sanction) : Number(app.requested || 0);
    const balance = personal + (Number.isFinite(sanction) ? Math.max(0, sanction) : 0);
    const fullApp = (await env.AUTH.get(`application:${app.id}`, "json")) || app;
    const row = {
      id: companyId,
      name: app.companyName || app.name,
      owner: app.applicant || "",
      description: app.description || "",
      coOwners: app.coOwners || fullApp.coOwners || [],
      departments: app.departments || fullApp.departments || [],
      logo: fullApp.logo || app.logo || "",
      balance,
      staff: 1,
      status: "Active",
      href: "owner-overview?id=" + encodeURIComponent(companyId),
      createdAt: new Date().toISOString(),
    };
    cos.push(row);
    await env.AUTH.put("directory:companies", JSON.stringify(cos));
    await env.AUTH.put(`company:${companyId}`, JSON.stringify(row));
    // Seed company ledger entry for starting capital
    if (balance > 0) {
      const ctx = [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          type: "seed",
          label: "Starting capital (application funding)",
          amount: balance,
          by: "system",
        },
      ];
      await env.AUTH.put(`ctx:${companyId}`, JSON.stringify(ctx));
    }
    const sanctionAmt = Number.isFinite(sanction) ? Math.max(0, sanction) : 0;
    if (personal > 0 || sanctionAmt > 0) {
      await appendCityTransfer(env, {
        type: "city_funding",
        label: "City starting funds → " + (row.name || "Company"),
        amount: personal + sanctionAmt,
        from: "City VAULT",
        to: row.name,
        companyId,
        personal,
        sanction: sanctionAmt,
      });
      let treasury = Number((await env.AUTH.get("city:treasury", "json")) || 0);
      if (!Number.isFinite(treasury)) treasury = 0;
      if (sanctionAmt > 0) treasury = treasury - sanctionAmt;
      await env.AUTH.put("city:treasury", JSON.stringify(treasury));
    }
    // auto-close other pending apps with the same company name
    for (let i = 0; i < apps.length; i++) {
      if (i === idx) continue;
      if (String(apps[i].status || "pending").toLowerCase() !== "pending") continue;
      if (normCompanyName(apps[i].companyName || apps[i].name) === normCompanyName(row.name)) {
        apps[i].status = "rejected";
        apps[i].decidedAt = new Date().toISOString();
        apps[i].note = "Closed because a company with this name was approved.";
      }
    }
    await env.AUTH.put("directory:applications", JSON.stringify(apps));

    // Link company onto the owner citizen so it appears on their dashboard
    const ownerName = String(app.applicant || "").toLowerCase();
    if (ownerName) {
      let owner = await loadCitizen(env, ownerName);
      if (owner) {
        if (!owner.uuid) owner.uuid = crypto.randomUUID();
        owner.companies = Array.isArray(owner.companies) ? owner.companies : [];
        owner.gigs = Array.isArray(owner.gigs) ? owner.gigs : [];
        if (!owner.companies.some((c) => c.id === companyId)) {
          owner.companies.push({
            id: companyId,
            name: row.name,
            role: "owner",
            balance: row.balance,
          });
        }
        if (!owner.gigs.some((g) => g.companyId === companyId)) {
          owner.gigs.push({
            companyId,
            company: row.name,
            role: "Owner",
            href: row.href,
          });
        }
        await saveCitizen(env, owner);
        await syncCitizenDirectory(env, owner);
      }
    }

    const coList = Array.isArray(row.coOwners) ? row.coOwners : [];
    for (const raw of coList) {
      const key = String(typeof raw === "string" ? raw : raw.username || raw.handle || "").toLowerCase();
      if (!key || key === ownerName) continue;
      let mate = await loadCitizen(env, key);
      if (!mate) continue;
      mate.companies = Array.isArray(mate.companies) ? mate.companies : [];
      mate.gigs = Array.isArray(mate.gigs) ? mate.gigs : [];
      if (!mate.companies.some((c) => c.id === companyId)) {
        mate.companies.push({ id: companyId, name: row.name, role: "co-owner" });
      }
      if (!mate.gigs.some((g) => g.companyId === companyId)) {
        mate.gigs.push({
          companyId,
          company: row.name,
          role: "Co-owner",
          href: "owner-overview.html?id=" + encodeURIComponent(companyId),
        });
      }
      await saveCitizen(env, mate);
      await syncCitizenDirectory(env, mate);
    }

    apps[idx].companyId = companyId;
    apps[idx].finalBalance = balance;
    await env.AUTH.put("directory:applications", JSON.stringify(apps));
  } else if (decision === "reject") {
    // refund personal pledge
    const app = apps[idx];
    const personal = Number(app.personalFunds || 0);
    if (personal > 0 && app.applicant) {
      let citizen = await loadCitizen(env, app.applicant);
      if (citizen) {
        if (!citizen.uuid) citizen.uuid = crypto.randomUUID();
        citizen.balance = Number(citizen.balance || 0) + personal;
        await saveCitizen(env, citizen);
        await appendTx(env, citizen.uuid, {
          type: "company_pledge_refund",
          label: `Refund · rejected company ${app.companyName || app.name}`,
          amount: personal,
        });
        await syncCitizenDirectory(env, citizen);
      }
    }
  }
  return json({ ok: true, application: apps[idx] });
}

async function listContracts(env) {
  const data = (await env.AUTH.get("directory:contracts", "json")) || {
    active: [],
    pending: [],
  };
  return json({
    active: data.active || [],
    pending: data.pending || [],
  });
}

async function latestReports(env) {
  const items = (await env.AUTH.get("directory:reports", "json")) || [];
  return json({ items });
}

async function logEvent(request, env, admin) {
  const body = await request.json().catch(() => ({}));
  const events = (await env.AUTH.get("admin:events", "json")) || [];
  events.unshift({
    at: new Date().toISOString(),
    by: admin?.username || admin?.displayName || "admin",
    ...body,
  });
  await env.AUTH.put("admin:events", JSON.stringify(events.slice(0, 200)));
  return json({ ok: true });
}

async function rebuildDirectory(env) {
  // Placeholder: KV list() requires binding permissions; keep manual directory for now
  return json({
    ok: true,
    message:
      "Directory is maintained via upsert endpoints. Full KV scan rebuild requires list API usage from dashboard tooling.",
  });
}


/* ================= OVERLORD ================= */

async function sha256hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function overlordLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const expectedUser = env.OVERLORD_USER || "overlord";
  const expectedPass = env.OVERLORD_PASS || "";
  if (!expectedPass) {
    return json({ error: "OVERLORD_PASS secret not configured on Worker" }, 500);
  }
  if (username !== expectedUser || password !== expectedPass) {
    return json({ error: "Invalid credentials" }, 401);
  }
  const token = crypto.randomUUID() + "-" + crypto.randomUUID();
  await env.AUTH.put(
    `overlord_session:${token}`,
    JSON.stringify({ at: Date.now(), user: username }),
    { expirationTtl: 12 * 3600 }
  );
  return json({ ok: true, token, expiresIn: 12 * 3600 });
}

async function requireOverlord(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { error: json({ error: "Unauthorized" }, 401) };
  const session = await env.AUTH.get(`overlord_session:${token}`, "json");
  if (!session) return { error: json({ error: "Unauthorized" }, 401) };
  return { session };
}

async function discordGuildMembers(env, guildId) {
  if (!env.DISCORD_BOT_TOKEN) throw new Error("DISCORD_BOT_TOKEN not set");
  const members = [];
  let after = "0";
  for (let page = 0; page < 50; page++) {
    const url = `https://discord.com/api/v10/guilds/${guildId}/members?limit=1000&after=${after}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bot ${String(env.DISCORD_BOT_TOKEN).trim()}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Discord members ${res.status}: ${err.message || res.statusText}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    members.push(...batch);
    after = batch[batch.length - 1].user?.id || after;
    if (batch.length < 1000) break;
  }
  return members;
}

async function syncCitizenRole(env, opts) {
  const guildId = String(opts.guildId || env.DISCORD_GUILD_ID || "").trim();
  const roleId = String(opts.roleId || env.DISCORD_CITIZEN_ROLE_ID || "1459428814684684383").trim();
  const defaultBalance = Number(opts.defaultBalance ?? 0);
  if (!guildId || !roleId) {
    return { error: "guildId and roleId required (or set DISCORD_GUILD_ID / DISCORD_CITIZEN_ROLE_ID)" };
  }

  const members = await discordGuildMembers(env, guildId);
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
    const isNew = !citizen;
    if (!citizen) {
      citizen = {
        username,
        discordId: String(u.id),
        displayName: m.nick || u.global_name || u.username,
        guildNick: m.nick || "",
        handle: u.username,
        balance: defaultBalance,
        uuid: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        source: opts.source || "sync",
      };
      created++;
    } else {
      citizen.discordId = String(u.id);
      citizen.displayName = m.nick || u.global_name || u.username || citizen.displayName;
      citizen.guildNick = m.nick || citizen.guildNick || "";
      citizen.handle = u.username || citizen.handle;
      if (!citizen.uuid) citizen.uuid = crypto.randomUUID();
      if (typeof citizen.balance !== "number") citizen.balance = defaultBalance;
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
    });
  }

  const newDir = [...dirMap.values()];
  await env.AUTH.put("directory:citizens", JSON.stringify(newDir));
  await env.AUTH.put(
    "sync:last",
    JSON.stringify({
      at: new Date().toISOString(),
      source: opts.source || "manual",
      guildId,
      roleId,
      matched: withRole.length,
      created,
      updated,
    })
  );

  return { ok: true, matched: withRole.length, created, updated, totalDirectory: newDir.length };
}

async function overlordSyncRole(request, env) {
  const body = await request.json().catch(() => ({}));
  try {
    const result = await syncCitizenRole(env, {
      guildId: body.guildId,
      roleId: body.roleId,
      defaultBalance: body.defaultBalance,
      source: "overlord",
    });
    if (result.error) return json({ error: result.error }, 400);
    return json(result);
  } catch (e) {
    return json({ error: String(e.message || e) }, 500);
  }
}

async function overlordImportUnb(request, env) {
  const body = await request.json().catch(() => ({}));
  const unbToken = env.UNB_TOKEN || body.unbToken;
  const guildId = String(body.guildId || env.UNB_GUILD_ID || env.DISCORD_GUILD_ID || "").trim();
  const mode = String(body.mode || "set").toLowerCase(); // set | add
  const dryRun = body.dryRun === true;
  if (!unbToken) return json({ error: "UNB_TOKEN secret not set" }, 500);
  if (!guildId) return json({ error: "guildId required" }, 400);

  // Paginate UnbelievaBoat leaderboard
  const imported = [];
  let page = 1;
  let safety = 0;
  while (safety++ < 100) {
    const res = await fetch(
      `https://unbelievaboat.com/api/v1/guilds/${guildId}/users?page=${page}&limit=100&sort=total`,
      { headers: { Authorization: unbToken } }
    );
    if (!res.ok) {
      const err = await res.text();
      return json({ error: `UnbelievaBoat API ${res.status}: ${err}` }, 502);
    }
    const data = await res.json();
    const users = Array.isArray(data) ? data : data.users || data.results || [];
    if (!users.length) break;

    for (const row of users) {
      const discordId = String(row.user_id || row.id || "");
      const cash = Number(row.cash || 0);
      const bank = Number(row.bank || 0);
      const total = Number(row.total != null ? row.total : cash + bank);
      imported.push({ discordId, cash, bank, total });
    }
    if (users.length < 100) break;
    page++;
  }

  // Map discordId → citizen via directory / member scan is hard without reverse index.
  // Build id map from directory + optional full member list
  let idToUsername = {};
  const dir = (await env.AUTH.get("directory:citizens", "json")) || [];
  for (const c of dir) {
    const live = c.username ? await env.AUTH.get(`citizen:${c.username}`, "json") : null;
    if (live?.discordId) idToUsername[String(live.discordId)] = live.username;
  }

  // Enrich from Discord members if possible
  try {
    const gId = env.DISCORD_GUILD_ID || guildId;
    if (env.DISCORD_BOT_TOKEN && gId) {
      const members = await discordGuildMembers(env, gId);
      for (const m of members) {
        if (m.user?.id && m.user?.username) {
          idToUsername[String(m.user.id)] = String(m.user.username).toLowerCase();
        }
      }
    }
  } catch (e) {
    console.error("member enrich", e);
  }

  let applied = 0;
  let skipped = 0;
  const results = [];

  for (const row of imported) {
    const username = idToUsername[row.discordId];
    if (!username) {
      skipped++;
      results.push({ discordId: row.discordId, status: "no_citizen", total: row.total });
      continue;
    }
    let citizen = await env.AUTH.get(`citizen:${username}`, "json");
    if (!citizen) {
      skipped++;
      results.push({ discordId: row.discordId, username, status: "missing_kv", total: row.total });
      continue;
    }
    if (!citizen.uuid) citizen.uuid = crypto.randomUUID();
    const prev = Number(citizen.balance || 0);
    const next = mode === "add" ? prev + row.total : row.total;
    if (!dryRun) {
      citizen.balance = next;
      await env.AUTH.put(`citizen:${username}`, JSON.stringify(citizen));
      await appendTx(env, citizen.uuid, {
        type: "unb_import",
        label: "Imported from UnbelievaBoat",
        amount: next - prev,
      });
      await syncCitizenDirectory(env, citizen);
    }
    applied++;
    results.push({ username, discordId: row.discordId, previous: prev, balance: next, status: dryRun ? "dry_run" : "ok" });
  }

  return json({
    ok: true,
    dryRun,
    mode,
    scanned: imported.length,
    applied,
    skipped,
    results: results.slice(0, 200),
  });
}

async function overlordDebugKv(url, env) {
  const key = url.searchParams.get("key");
  if (!key) return json({ error: "key query required" }, 400);
  // only allow safe prefixes
  if (!/^(citizen:|uuid:|directory:|sync:|tx:)/.test(key)) {
    return json({ error: "key prefix not allowed" }, 400);
  }
  const val = await env.AUTH.get(key, "json");
  return json({ key, value: val });
}

async function overlordDebugMeta(env) {
  const last = await env.AUTH.get("sync:last", "json");
  return json({
    syncLast: last,
    hasBotToken: Boolean(env.DISCORD_BOT_TOKEN),
    hasGuild: Boolean(env.DISCORD_GUILD_ID),
    hasRole: Boolean(env.DISCORD_CITIZEN_ROLE_ID),
    hasUnb: Boolean(env.UNB_TOKEN),
  });
}



async function overlordAssignCompany(request, env) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || body.handle || "").trim().toLowerCase();
  const companyId = String(body.companyId || "").trim();
  const role = String(body.role || "Worker").trim() || "Worker";
  const department = String(body.department || "General").trim() || "General";
  const salary = Number(body.salary || 0) || 0;
  const asOwner = body.asOwner === true;
  if (!username || !companyId) return json({ error: "username and companyId required" }, 400);

  const citizen = await loadCitizen(env, username);
  if (!citizen) return json({ error: "Citizen not found — add them first" }, 404);

  let co = await env.AUTH.get(`company:${companyId}`, "json");
  if (!co) {
    const dir = (await env.AUTH.get("directory:companies", "json")) || [];
    co = dir.find((c) => c.id === companyId) || null;
  }
  if (!co) return json({ error: "Company not found" }, 404);

  citizen.gigs = Array.isArray(citizen.gigs) ? citizen.gigs : [];
  citizen.companies = Array.isArray(citizen.companies) ? citizen.companies : [];

  if (asOwner) {
    co.owner = username;
    if (!citizen.companies.some((c) => c.id === co.id)) {
      citizen.companies.push({ id: co.id, name: co.name, role: "owner", balance: co.balance ?? 0 });
    } else {
      citizen.companies = citizen.companies.map((c) =>
        c.id === co.id ? { ...c, role: "owner", name: co.name } : c
      );
    }
    const gigIdx = citizen.gigs.findIndex((g) => g.companyId === co.id);
    const gig = {
      companyId: co.id,
      company: co.name,
      role: "Owner",
      department: "Management",
      salary,
      href: "owner-overview?id=" + encodeURIComponent(co.id),
    };
    if (gigIdx >= 0) citizen.gigs[gigIdx] = { ...citizen.gigs[gigIdx], ...gig };
    else citizen.gigs.push(gig);
  } else {
    if (!citizen.gigs.some((g) => g.companyId === co.id)) {
      citizen.gigs.push({
        companyId: co.id,
        company: co.name,
        role,
        department,
        salary,
        href: "worker-overview?id=" + encodeURIComponent(co.id),
      });
    } else {
      citizen.gigs = citizen.gigs.map((g) =>
        g.companyId === co.id ? { ...g, role, department, salary } : g
      );
    }
    co.departments = Array.isArray(co.departments) ? co.departments : [];
    let dept = co.departments.find(
      (d) => String(d.name || "").toLowerCase() === department.toLowerCase()
    );
    if (!dept) {
      dept = { id: "dept_" + crypto.randomUUID().slice(0, 8), name: department, roles: [] };
      co.departments.push(dept);
    }
    dept.roles = dept.roles || [];
    let r = dept.roles.find(
      (x) => String(x.role || x.name || "").toLowerCase() === role.toLowerCase()
    );
    if (!r) {
      r = { role, salary, amount: 1, members: [] };
      dept.roles.push(r);
    }
    r.members = r.members || [];
    if (!r.members.some((m) => String(m.username || "").toLowerCase() === username)) {
      r.members.push({
        username,
        displayName: citizen.displayName || username,
        handle: citizen.handle || username,
      });
    }
    co.staff = Math.max(Number(co.staff || 1), 1) + 0;
    const staffSet = new Set();
    for (const d of co.departments) {
      for (const rr of d.roles || []) {
        for (const m of rr.members || []) staffSet.add(String(m.username || "").toLowerCase());
      }
    }
    if (co.owner) staffSet.add(String(co.owner).toLowerCase());
    co.staff = staffSet.size || 1;
  }

  await saveCitizen(env, citizen);
  await syncCitizenDirectory(env, citizen);
  await env.AUTH.put(`company:${co.id}`, JSON.stringify(co));
  const cos = (await env.AUTH.get("directory:companies", "json")) || [];
  const idx = cos.findIndex((c) => c.id === co.id);
  const row = {
    id: co.id,
    name: co.name,
    owner: co.owner,
    balance: co.balance ?? 0,
    staff: co.staff ?? 1,
    status: co.status || "Active",
    href: co.href || ("owner-overview?id=" + encodeURIComponent(co.id)),
  };
  if (idx >= 0) cos[idx] = { ...cos[idx], ...row };
  else cos.push(row);
  await env.AUTH.put("directory:companies", JSON.stringify(cos));

  return json({ ok: true, citizen: { username, displayName: citizen.displayName }, company: row, role, department, asOwner });
}


async function dedupeCompanies(env) {
  const cos = (await env.AUTH.get("directory:companies", "json")) || [];
  const seen = new Map();
  const kept = [];
  const removed = [];
  for (const c of cos) {
    const key = normCompanyName(c.name) || c.id;
    if (seen.has(key)) {
      removed.push({ id: c.id, name: c.name });
      if (c.id) {
        await env.AUTH.delete(`company:${c.id}`);
        await env.AUTH.delete(`ctx:${c.id}`);
      }
      continue;
    }
    seen.set(key, c.id);
    kept.push(c);
  }
  if (removed.length) {
    await env.AUTH.put("directory:companies", JSON.stringify(kept));
  }
  return json({ ok: true, kept: kept.length, removed });
}

async function listCityTransfers(env) {
  const city = (await env.AUTH.get("city:transfers", "json")) || [];
  const extra = [];
  const dir = (await env.AUTH.get("directory:citizens", "json")) || [];
  for (const row of dir.slice(0, 80)) {
    const uuid = row.uuid;
    if (!uuid) continue;
    const txs = (await env.AUTH.get(`tx:${uuid}`, "json")) || [];
    for (const t of txs.slice(0, 12)) {
      extra.push({
        at: t.at,
        type: t.type || "tx",
        label: t.label || t.note || "Movement",
        amount: t.amount,
        from: row.username || row.displayName,
        to: t.counterparty || "",
      });
    }
  }
  const cos = (await env.AUTH.get("directory:companies", "json")) || [];
  for (const c of cos.slice(0, 40)) {
    if (!c.id) continue;
    const txs = (await env.AUTH.get(`ctx:${c.id}`, "json")) || [];
    for (const t of txs.slice(0, 12)) {
      extra.push({
        at: t.at,
        type: t.type || "company",
        label: (c.name || "Company") + " · " + (t.label || "Movement"),
        amount: t.amount,
        from: c.name,
        to: t.counterparty || t.by || "",
      });
    }
  }
  const merged = [...city, ...extra].filter((t) => t && (t.amount != null || t.label));
  merged.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
  const seen = new Set();
  const items = [];
  for (const t of merged) {
    const k = [t.at, t.label, t.amount, t.from].join("|");
    if (seen.has(k)) continue;
    seen.add(k);
    items.push(t);
    if (items.length >= 250) break;
  }
  return json({ items });
}