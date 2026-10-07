/**
 * Working on github pages now
 * VAULT Ledger Worker (separate from verify-bot)
 *
 * Create a new Worker in Cloudflare, e.g. name: vault-ledger
 * Bind the SAME KV namespace as verify-bot, variable name: AUTH
 *
 * Secret DISCORD_BOT_TOKEN — same bot token as verify-bot (needed for live profile pictures)
 * Optional var:     CORS_ORIGIN = https://vvcm.pages.dev
 *
 * Endpoints:
 *   GET  /me
 *   GET  /me/activity
 *   GET  /me/gigs
 *   GET  /citizens
 *   GET  /account/:uuid
 *   POST /ledger/transfer
 *   POST /ledger/credit   (admin-style; protect later)
 *   POST /ledger/debit
 */

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(settleShiftPayroll(env).catch((e) => console.error("payroll", e)));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return cors(env, new Response(null, { status: 204 }));
    }

    try {
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
        return cors(env, await listCitizens(env));
      }
      if (url.pathname.startsWith("/account/") && request.method === "GET") {
        const uuid = url.pathname.slice("/account/".length);
        return cors(env, await accountByUuid(env, uuid));
      }
      if (url.pathname === "/ledger/transfer" && request.method === "POST") {
        return cors(env, await transfer(request, env));
      }
      if (url.pathname === "/ledger/credit" && request.method === "POST") {
        return cors(env, await credit(request, env));
      }
      if (url.pathname === "/ledger/debit" && request.method === "POST") {
        return cors(env, await debit(request, env));
      }
      if (url.pathname === "/companies/apply" && request.method === "POST") {
        return cors(env, await companyApply(request, env));
      }
      if (url.pathname === "/companies/application/pending" && request.method === "GET") {
        return cors(env, await myPendingCompanyApp(request, env));
      }
      if (url.pathname === "/contracts" && request.method === "POST") {
        return cors(env, await createContract(request, env));
      }
      if (url.pathname === "/contracts" && request.method === "GET") {
        return cors(env, await listMyContracts(request, env));
      }
      if (url.pathname === "/me/companies" && request.method === "GET") {
        return cors(env, await meCompanies(request, env));
      }
      if (url.pathname === "/companies" && request.method === "GET") {
        return cors(env, await listCompaniesPublic(env));
      }
      if (url.pathname.startsWith("/companies/") && request.method === "GET") {
        const rest = url.pathname.slice("/companies/".length);
        if (rest === "mine/owner") {
          return cors(env, await mineOwnerCompany(request, env));
        }
        if (rest.endsWith("/contracts")) {
          const id = rest.slice(0, -"/contracts".length);
          return cors(env, await companyContracts(request, env, id));
        }
        if (rest.endsWith("/worker-view")) {
          const id = rest.slice(0, -"/worker-view".length);
          return cors(env, await workerView(request, env, id));
        }
        if (rest.endsWith("/ledger") && request.method === "GET") {
          const id = rest.slice(0, -"/ledger".length);
          return cors(env, await companyLedgerGet(request, env, id));
        }
        if (rest.endsWith("/jobs")) {
          const id = rest.slice(0, -"/jobs".length);
          return cors(env, await listCompanyJobs(request, env, id));
        }
        if (rest.endsWith("/reports")) {
          const id = rest.slice(0, -"/reports".length);
          return cors(env, await listCompanyReports(request, env, id));
        }
        return cors(env, await getCompany(request, env, rest));
      }
      if (url.pathname.startsWith("/companies/") && url.pathname.endsWith("/ledger") && request.method === "POST") {
        const id = url.pathname.slice("/companies/".length, -"/ledger".length);
        return cors(env, await companyLedgerPost(request, env, id));
      }
      if (url.pathname.startsWith("/companies/") && url.pathname.endsWith("/pay") && request.method === "POST") {
        const id = url.pathname.slice("/companies/".length, -"/pay".length);
        return cors(env, await companyPay(request, env, id));
      }
      if (url.pathname.startsWith("/companies/") && url.pathname.endsWith("/structure") && request.method === "POST") {
        const id = url.pathname.slice("/companies/".length, -"/structure".length);
        return cors(env, await updateCompanyStructure(request, env, id));
      }
      if (url.pathname.startsWith("/contracts/") && url.pathname.endsWith("/respond") && request.method === "POST") {
        const id = url.pathname.slice("/contracts/".length, -"/respond".length);
        return cors(env, await respondContract(request, env, id));
      }
      if (url.pathname === "/jobs" && request.method === "GET") {
        return cors(env, await listMyJobs(request, env));
      }
      if (url.pathname === "/jobs/offer" && request.method === "POST") {
        return cors(env, await createJobOffer(request, env));
      }
      if (url.pathname === "/jobs/apply" && request.method === "POST") {
        return cors(env, await createJobApplication(request, env));
      }
      if (url.pathname.startsWith("/jobs/") && url.pathname.endsWith("/respond") && request.method === "POST") {
        const id = url.pathname.slice("/jobs/".length, -"/respond".length);
        return cors(env, await respondJob(request, env, id));
      }
      if (url.pathname.startsWith("/companies/") && url.pathname.endsWith("/jobs") && request.method === "GET") {
        const id = url.pathname.slice("/companies/".length, -"/jobs".length);
        return cors(env, await listCompanyJobs(request, env, id));
      }
      if (url.pathname === "/reports" && request.method === "POST") {
        return cors(env, await submitShiftReport(request, env));
      }
      if (url.pathname === "/reports/mine" && request.method === "GET") {
        return cors(env, await myShiftReports(request, env));
      }
      if (url.pathname.startsWith("/companies/") && url.pathname.endsWith("/reports") && request.method === "GET") {
        const id = url.pathname.slice("/companies/".length, -"/reports".length);
        return cors(env, await listCompanyReports(request, env, id));
      }
      if (url.pathname.startsWith("/reports/") && url.pathname.endsWith("/reject") && request.method === "POST") {
        const id = url.pathname.slice("/reports/".length, -"/reject".length);
        return cors(env, await rejectShiftReport(request, env, id));
      }
      if (url.pathname === "/payroll/run" && request.method === "POST") {
        return cors(env, await runPayrollNow(request, env));
      }
      return cors(env, json({ ok: true, service: "vault-ledger" }));
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

function avatarUrl(discordId, avatarHash) {
  if (avatarHash) {
    const ext = String(avatarHash).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=128`;
  }
  try {
    const idx = Number(BigInt(discordId) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

async function fetchDiscordUser(env, discordId) {
  if (!env.DISCORD_BOT_TOKEN || !discordId) return null;
  const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
    headers: { Authorization: `Bot ${String(env.DISCORD_BOT_TOKEN).trim()}` },
  });
  if (!res.ok) return null;
  return res.json();
}

const ADMIN_NAMES = ["dragon_destroyer", "apple"];

function normCompanyName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}


function coOwnerNames(co) {
  const list = Array.isArray(co?.coOwners) ? co.coOwners : [];
  return list
    .map((x) => String(typeof x === "string" ? x : x.username || x.handle || "").toLowerCase())
    .filter(Boolean);
}

function isCoOwnerOf(co, uname) {
  const u = String(uname || "").toLowerCase();
  if (!u) return false;
  if (String(co?.owner || "").toLowerCase() === u) return true;
  return coOwnerNames(co).includes(u);
}

async function isAdminUser(env, username) {
  const uname = String(username || "").toLowerCase();
  if (!uname) return false;
  const list = (await env.AUTH.get("directory:admins", "json")) || [];
  const allowed = new Set(
    (Array.isArray(list) ? list : []).map((a) => String(a.username || a).toLowerCase()).filter(Boolean)
  );
  for (const seed of ADMIN_NAMES) allowed.add(seed);
  if (allowed.has(uname)) return true;
  const c = await loadCitizen(env, uname);
  if (!c) return false;
  if (c.admin === true) return true;
  const names = [c.username, c.handle, c.displayName].map((n) => String(n || "").toLowerCase());
  return names.some((n) => n && allowed.has(n));
}

async function appendCityTransfer(env, entry) {
  const list = (await env.AUTH.get("city:transfers", "json")) || [];
  list.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry });
  await env.AUTH.put("city:transfers", JSON.stringify(list.slice(0, 500)));
}

async function loadCitizen(env, username) {
  return env.AUTH.get(`citizen:${String(username).toLowerCase()}`, "json");
}

async function saveCitizen(env, citizen) {
  const username = String(citizen.username || citizen.handle || "").toLowerCase();
  citizen.username = username;
  await env.AUTH.put(`citizen:${username}`, JSON.stringify(citizen));
  if (citizen.uuid) await env.AUTH.put(`uuid:${citizen.uuid}`, username);
  // keep directory in sync for admin lists / pay search
  try {
    const dir = (await env.AUTH.get("directory:citizens", "json")) || [];
    const idx = dir.findIndex((c) => String(c.username || "").toLowerCase() === username);
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
  } catch (_) {}
}

async function ensureLedgerFields(env, citizen) {
  let changed = false;
  if (!citizen.uuid) {
    citizen.uuid = crypto.randomUUID();
    changed = true;
  }
  if (typeof citizen.balance !== "number") {
    citizen.balance = 0;
    changed = true;
  }
  if (!citizen.createdAt) {
    citizen.createdAt = new Date().toISOString();
    changed = true;
  }

  // Refresh Discord profile when bot token is available
  if (citizen.discordId && env.DISCORD_BOT_TOKEN) {
    const du = await fetchDiscordUser(env, citizen.discordId);
    if (du) {
      citizen.displayName = du.global_name || du.username || citizen.displayName;
      citizen.handle = du.username || citizen.handle;
      citizen.avatarHash = du.avatar || null;
      citizen.avatar = avatarUrl(citizen.discordId, du.avatar);
      changed = true;
    }
  }
  if (!citizen.avatar && citizen.discordId) {
    citizen.avatar = avatarUrl(citizen.discordId, citizen.avatarHash);
    changed = true;
  }

  if (changed) await saveCitizen(env, citizen);
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
    joined: c.joined || (c.createdAt ? String(c.createdAt).slice(0, 10) : null),
  };
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

async function me(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  let citizen = await loadCitizen(env, s.session.discordUsername);
  if (!citizen) return json({ error: "Citizen not found" }, 404);
  citizen = await ensureLedgerFields(env, citizen);

  // Keep session uuid in sync
  if (s.session.uuid !== citizen.uuid) {
    s.session.uuid = citizen.uuid;
    await env.AUTH.put(`session:${s.token}`, JSON.stringify(s.session), {
      expirationTtl: 604800,
    });
  }

  return json(publicCitizen(citizen));
}

async function meActivity(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);

  let uuid = s.session.uuid;
  if (!uuid) {
    const c = await loadCitizen(env, s.session.discordUsername);
    uuid = c?.uuid;
  }
  if (!uuid) return json({ items: [] });

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
  let items = Array.isArray(citizen?.gigs) ? citizen.gigs.slice() : [];
  // Also surface owned companies
  const cos = Array.isArray(citizen?.companies) ? citizen.companies : [];
  for (const c of cos) {
    if (!items.some((g) => g.companyId === c.id)) {
      items.push({
        companyId: c.id,
        company: c.name,
        role: c.role || "Owner",
        href: "owner-overview?id=" + encodeURIComponent(c.id),
      });
    }
  }
  const dir = (await env.AUTH.get("directory:companies", "json")) || [];
  const uname = String(s.session.discordUsername || "").toLowerCase();
  for (const co of dir) {
    if (!co?.id) continue;
    if (items.some((g) => g.companyId === co.id)) continue;
    const owner = String(co.owner || "").toLowerCase() === uname;
    const coOwn = isCoOwnerOf(co, uname);
    if (!owner && !coOwn) continue;
    items.push({
      companyId: co.id,
      company: co.name,
      role: owner ? "Owner" : "Co-owner",
      href: "owner-overview.html?id=" + encodeURIComponent(co.id),
    });
  }
  return json({ items });
}

async function listCitizens(env) {
  const dir = (await env.AUTH.get("directory:citizens", "json")) || [];
  const items = [];
  for (const row of dir) {
    const username = String(row.username || row.handle || "").toLowerCase();
    let live = username ? await loadCitizen(env, username) : null;
    const c = live || row;
    items.push({
      username: String(c.username || username || "").toLowerCase(),
      displayName: c.displayName || c.username || row.displayName || username,
      name: c.displayName || c.username || row.displayName || username,
      handle: c.handle || username,
      uuid: c.uuid || row.uuid,
    });
  }
  return json({ items });
}

async function accountByUuid(env, uuid) {
  const username = await env.AUTH.get(`uuid:${uuid}`);
  if (!username) return json({ error: "Unknown uuid" }, 404);
  let citizen = await loadCitizen(env, username);
  if (!citizen) return json({ error: "Citizen not found" }, 404);
  citizen = await ensureLedgerFields(env, citizen);
  return json(publicCitizen(citizen));
}

async function transfer(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => ({}));
  const toUsername = String(body.toUsername || body.to || "").trim().toLowerCase();
  const amount = Number(body.amount);
  const note = String(body.note || "Transfer").slice(0, 120);
  if (!toUsername || !(amount > 0) || !Number.isFinite(amount)) {
    return json({ error: "Invalid transfer" }, 400);
  }

  const from = await loadCitizen(env, s.session.discordUsername);
  const to = await loadCitizen(env, toUsername);
  if (!from || !to) return json({ error: "Citizen not found" }, 404);

  await ensureLedgerFields(env, from);
  await ensureLedgerFields(env, to);

  if ((from.balance || 0) < amount) {
    return json({ error: "Insufficient balance" }, 400);
  }

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
    amount,
    note,
    counterparty: from.uuid,
  });
  await appendCityTransfer(env, {
    type: "citizen_transfer",
    label: `${from.displayName || from.username} → ${to.displayName || to.username}`,
    amount,
    note,
    from: from.username,
    to: to.username,
  });

  return json({ ok: true, balance: from.balance });
}

async function credit(request, env) {
  // Temporary open endpoint — lock down with admin check later
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim().toLowerCase();
  const amount = Number(body.amount);
  const label = String(body.label || "Credit").slice(0, 120);
  if (!username || !(amount > 0)) return json({ error: "Invalid credit" }, 400);

  let citizen = await loadCitizen(env, username);
  if (!citizen) return json({ error: "Citizen not found" }, 404);
  citizen = await ensureLedgerFields(env, citizen);
  citizen.balance = Number(citizen.balance || 0) + amount;
  await saveCitizen(env, citizen);
  await appendTx(env, citizen.uuid, { type: "credit", label, amount });
  return json({ ok: true, balance: citizen.balance, uuid: citizen.uuid });
}

async function debit(request, env) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim().toLowerCase();
  const amount = Number(body.amount);
  const label = String(body.label || "Debit").slice(0, 120);
  if (!username || !(amount > 0)) return json({ error: "Invalid debit" }, 400);

  let citizen = await loadCitizen(env, username);
  if (!citizen) return json({ error: "Citizen not found" }, 404);
  citizen = await ensureLedgerFields(env, citizen);
  if ((citizen.balance || 0) < amount) return json({ error: "Insufficient balance" }, 400);
  citizen.balance = Number(citizen.balance || 0) - amount;
  await saveCitizen(env, citizen);
  await appendTx(env, citizen.uuid, { type: "debit", label, amount: -amount });
  return json({ ok: true, balance: citizen.balance, uuid: citizen.uuid });
}


async function companyApply(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const username = String(s.session.discordUsername || "").toLowerCase();
  let citizen = await loadCitizen(env, username);
  if (!citizen) return json({ error: "Citizen not found" }, 404);
  citizen = await ensureLedgerFields(env, citizen);

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return json({ error: "Company name required" }, 400);
  const want = normCompanyName(name);
  const existingCos = (await env.AUTH.get("directory:companies", "json")) || [];
  if (existingCos.some((c) => normCompanyName(c.name) === want)) {
    return json({ error: "A company with that name already exists." }, 409);
  }

  const personalFunds = Math.max(0, Number(body.personalFunds || 0) || 0);
  const requested = Math.max(0, Number(body.requested || body.startingFunds || 0) || 0);

  const appsExisting = (await env.AUTH.get("directory:applications", "json")) || [];
  const nameTakenPending = appsExisting.find(
    (a) =>
      String(a.status || "pending").toLowerCase() === "pending" &&
      normCompanyName(a.companyName || a.name) === want
  );
  if (nameTakenPending) {
    return json({ error: "A pending application already uses that company name." }, 409);
  }
  const pending = appsExisting.find(
    (a) =>
      String(a.applicant || "").toLowerCase() === username &&
      String(a.status || "pending").toLowerCase() === "pending"
  );
  if (pending) {
    return json({
      error: "You already have a company application pending review. Wait for it to be approved or rejected before submitting another.",
      pendingId: pending.id,
      pendingName: pending.companyName || pending.name,
    }, 409);
  }

  if (personalFunds > 0 && Number(citizen.balance || 0) < personalFunds) {
    return json({ error: "Insufficient balance for personal contribution" }, 400);
  }

  // Hold personal funds: debit now so they can't double-spend while pending
  if (personalFunds > 0) {
    citizen.balance = Number(citizen.balance || 0) - personalFunds;
    await saveCitizen(env, citizen);
    await appendTx(env, citizen.uuid, {
      type: "company_pledge",
      label: `Company application pledge · ${name}`,
      amount: -personalFunds,
    });
  }

  const id = crypto.randomUUID();
  const app = {
    id,
    companyName: name,
    name,
    description: String(body.description || "").slice(0, 2000),
    applicant: username,
    applicantDisplay: citizen.displayName || username,
    coOwners: Array.isArray(body.coOwners) ? body.coOwners : [],
    departments: Array.isArray(body.departments) ? body.departments : [],
    application: String(body.application || "").slice(0, 4000),
    personalFunds,
    requested,
    startingFunds: personalFunds, // base capital held; admin may add more on approve
    status: "pending",
    submitted: new Date().toISOString(),
    at: new Date().toISOString(),
  };
  const logo = String(body.logo || "").trim();
  if (logo.startsWith("data:image/") && logo.length < 400000) {
    app.logo = logo;
  }

  const apps = (await env.AUTH.get("directory:applications", "json")) || [];
  const slim = { ...app };
  delete slim.logo;
  apps.unshift(slim);
  await env.AUTH.put("directory:applications", JSON.stringify(apps.slice(0, 200)));
  await env.AUTH.put(`application:${id}`, JSON.stringify(app));

  return json({ ok: true, application: app, balance: citizen.balance });
}

async function createContract(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const username = String(s.session.discordUsername || "").toLowerCase();
  const body = await request.json().catch(() => ({}));

  const target = String(body.target || "").trim();
  if (!target) return json({ error: "target required" }, 400);

  const id = crypto.randomUUID();
  const contract = {
    id,
    from: username,
    targetType: body.targetType || "resident",
    target,
    payType: body.payType || "hourly",
    rate: body.rate != null ? Number(body.rate) : null,
    total: body.total != null ? Number(body.total) : null,
    duration: Number(body.duration) || 1,
    unit: body.unit || "days",
    description: String(body.description || "").slice(0, 2000),
    access: Array.isArray(body.access) ? body.access : [],
    companyId: body.companyId || null,
    companyName: body.companyName || null,
    status: "pending",
    sentAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
  };

  const data = (await env.AUTH.get("directory:contracts", "json")) || { active: [], pending: [] };
  data.pending = data.pending || [];
  data.pending.unshift(contract);
  await env.AUTH.put("directory:contracts", JSON.stringify(data));
  await env.AUTH.put(`contract:${id}`, JSON.stringify(contract));

  return json({ ok: true, contract });
}

async function listMyContracts(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const username = String(s.session.discordUsername || "").toLowerCase();
  const data = (await env.AUTH.get("directory:contracts", "json")) || { active: [], pending: [] };
  const mine = (list) =>
    (list || []).filter(
      (c) =>
        String(c.from || "").toLowerCase() === username ||
        String(c.target || "").toLowerCase() === username
    );
  return json({
    active: mine(data.active),
    pending: mine(data.pending),
  });
}


async function meCompanies(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const citizen = await loadCitizen(env, uname);
  const items = [];
  const seen = new Set();

  const push = async (id, role) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    const co = (await env.AUTH.get(`company:${id}`, "json")) || null;
    if (co) {
      items.push({ ...co, role: role || "member" });
      return;
    }
    const dir = (await env.AUTH.get("directory:companies", "json")) || [];
    const row = dir.find((c) => c.id === id);
    if (row) items.push({ ...row, role: role || "member" });
  };

  for (const c of citizen?.companies || []) await push(c.id, c.role || "owner");
  for (const g of citizen?.gigs || []) if (g.companyId) await push(g.companyId, g.role || "member");

  const dir = (await env.AUTH.get("directory:companies", "json")) || [];
  for (const co of dir) {
    if (String(co.owner || "").toLowerCase() === uname) await push(co.id, "owner");
    else if (isCoOwnerOf(co, uname)) await push(co.id, "co-owner");
  }
  return json({ items });
}

async function listCompaniesPublic(env) {
  const dir = (await env.AUTH.get("directory:companies", "json")) || [];
  return json({
    items: dir.map((c) => ({
      id: c.id,
      name: c.name,
      owner: c.owner,
      status: c.status || "Active",
      staff: c.staff ?? 0,
    })),
  });
}

async function getCompany(request, env, id) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  id = decodeURIComponent(id);
  let co = await env.AUTH.get(`company:${id}`, "json");
  if (!co) {
    const dir = (await env.AUTH.get("directory:companies", "json")) || [];
    co = dir.find((c) => c.id === id) || null;
  }
  if (!co) return json({ error: "Company not found" }, 404);

  const uname = String(s.session.discordUsername || "").toLowerCase();
  const admin = await isAdminUser(env, uname);
  const isOwner = String(co.owner || "").toLowerCase() === uname;
  const isCo = isCoOwnerOf(co, uname);
  if (!admin && !isOwner && !isCo) {
    const citizen = await loadCitizen(env, uname);
    const linked = (citizen?.companies || []).some((c) => c.id === id) ||
      (citizen?.gigs || []).some((g) => g.companyId === id);
    if (!linked) return json({ error: "Forbidden" }, 403);
  }
  return json({
    id: co.id,
    name: co.name,
    description: co.description || "",
    owner: co.owner,
    balance: co.balance ?? 0,
    staff: co.staff ?? 1,
    status: co.status || "Active",
    departments: co.departments || [],
    coOwners: co.coOwners || [],
    createdAt: co.createdAt || null,
    role: admin || isOwner || isCo ? "owner" : "member",
    viewingAsAdmin: admin && !isOwner,
    logo: co.logo || "",
  });
}

async function mineOwnerCompany(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const dir = (await env.AUTH.get("directory:companies", "json")) || [];
  const owned = dir.filter((c) => String(c.owner || "").toLowerCase() === uname);
  if (!owned.length) return json({ error: "No owned company" }, 404);
  return getCompany(request, env, owned[0].id);
}

async function companyContracts(request, env, companyId) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const data = (await env.AUTH.get("directory:contracts", "json")) || { active: [], pending: [] };
  const match = (c) =>
    String(c.companyId || "") === companyId ||
    String(c.from || "").toLowerCase() === uname ||
    String(c.target || "").toLowerCase() === uname;
  return json({
    active: (data.active || []).filter(match),
    outgoing: (data.pending || []).filter((c) => String(c.from || "").toLowerCase() === uname),
    incoming: (data.pending || []).filter((c) => String(c.target || "").toLowerCase() === uname),
  });
}


async function workerView(request, env, id) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  id = decodeURIComponent(String(id || "").replace(/\/$/, ""));
  const uname = String(s.session.discordUsername || "").toLowerCase();
  let citizen = await loadCitizen(env, uname);
  if (!citizen) return json({ error: "Citizen not found" }, 404);

  let co = await env.AUTH.get(`company:${id}`, "json");
  if (!co) {
    const dir = (await env.AUTH.get("directory:companies", "json")) || [];
    co = dir.find((c) => c.id === id) || null;
  }
  if (!co) return json({ error: "Company not found" }, 404);

  const gig =
    (citizen.gigs || []).find((g) => g.companyId === id) ||
    (citizen.companies || []).find((c) => c.id === id) ||
    null;

  // Allow owners to open worker view too; otherwise require membership
  const isOwner = String(co.owner || "").toLowerCase() === uname;
  if (!gig && !isOwner) {
    return json({ error: "You are not a member of this company" }, 403);
  }

  const role = gig?.role || (isOwner ? "Owner" : "Worker");
  const department = gig?.department || gig?.dept || "General";
  const salary = Number(gig?.salary ?? gig?.rate ?? 0);

  // Build department roster from company departments if staff assignments exist
  let roster = [];
  const depts = Array.isArray(co.departments) ? co.departments : [];
  const dept = depts.find(
    (d) => String(d.name || "").toLowerCase() === String(department).toLowerCase()
  );
  if (dept && Array.isArray(dept.members)) {
    roster = dept.members.map((m) => ({
      name: m.name || m.displayName || m.username,
      handle: m.handle || m.username || "",
      role: m.role || "",
      rate: m.salary ?? m.rate ?? null,
      isYou: String(m.username || m.handle || "").toLowerCase() === uname,
    }));
  }
  // Always include current worker
  if (!roster.some((r) => r.isYou)) {
    roster.unshift({
      name: citizen.displayName || citizen.username,
      handle: citizen.handle || citizen.username,
      role,
      rate: salary || null,
      isYou: true,
    });
  }

  return json({
    id: co.id,
    name: co.name,
    description: co.description || "",
    logo: co.logo || "",
    role,
    department,
    salary,
    salaryNote: gig?.salaryNote || null,
    roster,
    // never expose company balance on worker view
  });
}


async function loadCompanyRecord(env, id) {
  id = decodeURIComponent(String(id || "").replace(/\/$/, ""));
  let co = await env.AUTH.get(`company:${id}`, "json");
  if (!co) {
    const dir = (await env.AUTH.get("directory:companies", "json")) || [];
    co = dir.find((c) => c.id === id) || null;
  }
  return co;
}

async function saveCompanyRecord(env, co) {
  if (!co?.id) return;
  await env.AUTH.put(`company:${co.id}`, JSON.stringify(co));
  const dir = (await env.AUTH.get("directory:companies", "json")) || [];
  const idx = dir.findIndex((c) => c.id === co.id);
  const row = {
    id: co.id,
    name: co.name,
    owner: co.owner,
    balance: co.balance ?? 0,
    staff: co.staff ?? 1,
    status: co.status || "Active",
    href: co.href || ("owner-overview?id=" + encodeURIComponent(co.id)),
    description: co.description || "",
  };
  if (idx >= 0) dir[idx] = { ...dir[idx], ...row };
  else dir.push(row);
  await env.AUTH.put("directory:companies", JSON.stringify(dir));
}

async function appendCompanyTx(env, companyId, entry) {
  const key = `ctx:${companyId}`;
  const list = (await env.AUTH.get(key, "json")) || [];
  list.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    ...entry,
  });
  await env.AUTH.put(key, JSON.stringify(list.slice(0, 200)));
  return list[0];
}

async function assertCompanyAccess(env, co, uname, { ownerOnly = false } = {}) {
  if (!co) return { error: json({ error: "Company not found" }, 404) };
  const admin = await isAdminUser(env, uname);
  const isOwner = String(co.owner || "").toLowerCase() === uname || admin;
  const cos = Array.isArray(co.coOwners)
    ? co.coOwners.map((x) => String(typeof x === "string" ? x : x.username || "").toLowerCase())
    : [];
  if (ownerOnly) {
    if (!isOwner && !cos.includes(uname) && !admin) return { error: json({ error: "Forbidden" }, 403) };
  }
  return { isOwner, admin };
}

async function companyLedgerGet(request, env, id) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const co = await loadCompanyRecord(env, id);
  const gate = await assertCompanyAccess(env, co, uname, { ownerOnly: false });
  if (gate.error) {
    // members can view? only owner for full ledger - workers use personal pay
    // allow owner and co-owners only
    return gate.error;
  }
  // require owner for full company ledger
  if (!gate.isOwner) {
    const citizen = await loadCitizen(env, uname);
    const linked = (citizen?.companies || []).some((c) => c.id === co.id && String(c.role || "").toLowerCase() === "owner");
    if (!linked && String(co.owner || "").toLowerCase() !== uname) {
      return json({ error: "Forbidden" }, 403);
    }
  }
  const list = (await env.AUTH.get(`ctx:${co.id}`, "json")) || [];
  return json({ items: list, balance: co.balance ?? 0 });
}

async function companyLedgerPost(request, env, id) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const co = await loadCompanyRecord(env, id);
  const gate = await assertCompanyAccess(env, co, uname, { ownerOnly: true });
  if (gate.error) return gate.error;

  const body = await request.json().catch(() => ({}));
  const type = String(body.type || "expense").toLowerCase();
  const label = String(body.label || body.detail || type).slice(0, 200);
  let amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount === 0) return json({ error: "Invalid amount" }, 400);

  // Owners cannot mint money. Income/seed/deposit are rejected from this endpoint.
  if (["income", "deposit", "transfer_in", "seed", "credit"].includes(type)) {
    return json({ error: "Cannot add funds from thin air. Use company pay to send existing company balance." }, 400);
  }
  if (amount > 0) amount = -Math.abs(amount);

  const next = Number(co.balance || 0) + amount;
  if (next < 0) return json({ error: "Insufficient company balance" }, 400);
  co.balance = next;
  await saveCompanyRecord(env, co);
  const entry = await appendCompanyTx(env, co.id, {
    type,
    label,
    amount,
    by: uname,
  });
  return json({ ok: true, balance: co.balance, entry });
}

async function respondContract(request, env, id) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const body = await request.json().catch(() => ({}));
  const decision = String(body.decision || "").toLowerCase(); // accept | decline
  if (!["accept", "decline"].includes(decision)) {
    return json({ error: "decision must be accept or decline" }, 400);
  }

  id = decodeURIComponent(id);
  let data = (await env.AUTH.get("directory:contracts", "json")) || { active: [], pending: [] };
  data.pending = data.pending || [];
  data.active = data.active || [];
  const idx = data.pending.findIndex((c) => c.id === id);
  if (idx < 0) return json({ error: "Pending contract not found" }, 404);
  const c = data.pending[idx];

  // Target must match (citizen username or display name)
  const target = String(c.target || "").toLowerCase();
  const citizen = await loadCitizen(env, uname);
  const aliases = [
    uname,
    String(citizen?.handle || "").toLowerCase(),
    String(citizen?.displayName || "").toLowerCase(),
  ].filter(Boolean);
  const isTarget = aliases.includes(target) || target === uname;
  if (!isTarget) {
    // also allow company-target if user owns that company
    if (c.targetType === "company") {
      const dir = (await env.AUTH.get("directory:companies", "json")) || [];
      const owned = dir.some(
        (co) =>
          String(co.name || "").toLowerCase() === target &&
          String(co.owner || "").toLowerCase() === uname
      );
      if (!owned) return json({ error: "Forbidden — not the contract target" }, 403);
    } else {
      return json({ error: "Forbidden — not the contract target" }, 403);
    }
  }

  data.pending.splice(idx, 1);
  if (decision === "accept") {
    c.status = "active";
    c.acceptedAt = new Date().toISOString();
    c.acceptedBy = uname;
    data.active.unshift(c);
  } else {
    c.status = "declined";
    c.declinedAt = new Date().toISOString();
    c.declinedBy = uname;
  }
  await env.AUTH.put("directory:contracts", JSON.stringify(data));
  await env.AUTH.put(`contract:${id}`, JSON.stringify(c));
  return json({ ok: true, contract: c, decision });
}


async function loadJobsDir(env) {
  return (
    (await env.AUTH.get("directory:jobs", "json")) || { pending: [], active: [] }
  );
}

async function saveJobsDir(env, data) {
  await env.AUTH.put("directory:jobs", JSON.stringify(data));
}

function jobAliases(citizen, uname) {
  return [
    String(uname || "").toLowerCase(),
    String(citizen?.username || "").toLowerCase(),
    String(citizen?.handle || "").toLowerCase(),
    String(citizen?.displayName || "").toLowerCase(),
  ].filter(Boolean);
}

async function listMyJobs(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const citizen = await loadCitizen(env, uname);
  const aliases = jobAliases(citizen, uname);
  const data = await loadJobsDir(env);

  const mine = (list) =>
    (list || []).filter((j) => {
      const from = String(j.from || "").toLowerCase();
      const to = String(j.toUsername || j.target || "").toLowerCase();
      const owner = String(j.companyOwner || "").toLowerCase();
      return aliases.includes(from) || aliases.includes(to) || aliases.includes(owner);
    });

  const pending = mine(data.pending);
  return json({
    incoming: pending.filter((j) => aliases.includes(String(j.toUsername || j.target || "").toLowerCase())),
    outgoing: pending.filter((j) => aliases.includes(String(j.from || "").toLowerCase())),
    incomingApplications: pending.filter(
      (j) => j.kind === "application" && aliases.includes(String(j.companyOwner || "").toLowerCase())
    ),
    active: mine(data.active),
  });
}

async function listCompanyJobs(request, env, companyId) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const co = await loadCompanyRecord(env, companyId);
  if (!co) return json({ error: "Company not found" }, 404);
  const isOwner = String(co.owner || "").toLowerCase() === uname;
  if (!isOwner) return json({ error: "Forbidden" }, 403);
  const data = await loadJobsDir(env);
  const pending = (data.pending || []).filter((j) => j.companyId === co.id);
  return json({
    offers: pending.filter((j) => j.kind === "offer"),
    applications: pending.filter((j) => j.kind === "application"),
    active: (data.active || []).filter((j) => j.companyId === co.id),
  });
}

async function createJobOffer(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.companyId || "").trim();
  const toUsername = String(body.toUsername || body.target || "").trim().toLowerCase();
  const role = String(body.role || "").trim();
  const message = String(body.message || "").slice(0, 500);
  const department = String(body.department || "").trim();
  const salary = Number(body.salary || 0) || 0;
  if (!companyId || !toUsername || !role) {
    return json({ error: "companyId, toUsername, and role required" }, 400);
  }
  const co = await loadCompanyRecord(env, companyId);
  if (!co) return json({ error: "Company not found" }, 404);
  if (String(co.owner || "").toLowerCase() !== uname) {
    return json({ error: "Only the owner can send job offers" }, 403);
  }
  const target = await loadCitizen(env, toUsername);
  if (!target) return json({ error: "Citizen not found" }, 404);

  const id = crypto.randomUUID();
  const job = {
    id,
    kind: "offer",
    companyId: co.id,
    companyName: co.name,
    companyOwner: uname,
    from: uname,
    toUsername,
    target: toUsername,
    role,
    department,
    salary,
    message,
    status: "pending",
    sentAt: new Date().toISOString(),
  };
  const data = await loadJobsDir(env);
  data.pending = data.pending || [];
  data.pending.unshift(job);
  await saveJobsDir(env, data);
  await env.AUTH.put(`job:${id}`, JSON.stringify(job));
  return json({ ok: true, job });
}

async function createJobApplication(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.companyId || "").trim();
  const role = String(body.role || "").trim();
  const message = String(body.message || "").slice(0, 500);
  if (!companyId) return json({ error: "companyId required" }, 400);
  const co = await loadCompanyRecord(env, companyId);
  if (!co) return json({ error: "Company not found" }, 404);

  const id = crypto.randomUUID();
  const job = {
    id,
    kind: "application",
    companyId: co.id,
    companyName: co.name,
    companyOwner: String(co.owner || "").toLowerCase(),
    from: uname,
    toUsername: String(co.owner || "").toLowerCase(),
    target: String(co.owner || "").toLowerCase(),
    role: role || "Open role",
    department: String(body.department || "").trim(),
    salary: Number(body.salary || 0) || 0,
    message,
    status: "pending",
    sentAt: new Date().toISOString(),
  };
  const data = await loadJobsDir(env);
  data.pending = data.pending || [];
  data.pending.unshift(job);
  await saveJobsDir(env, data);
  await env.AUTH.put(`job:${id}`, JSON.stringify(job));
  return json({ ok: true, job });
}

async function attachWorkerToCompany(env, co, citizen, job) {
  const uname = String(citizen.username || "").toLowerCase();
  citizen.gigs = Array.isArray(citizen.gigs) ? citizen.gigs : [];
  if (!citizen.gigs.some((g) => g.companyId === co.id)) {
    citizen.gigs.push({
      companyId: co.id,
      company: co.name,
      role: job.role || "Worker",
      department: job.department || "General",
      salary: job.salary || 0,
      href: "worker-overview?id=" + encodeURIComponent(co.id),
    });
  }
  await saveCitizen(env, citizen);

  co.departments = Array.isArray(co.departments) ? co.departments : [];
  let dept = co.departments.find(
    (d) => String(d.name || "").toLowerCase() === String(job.department || "General").toLowerCase()
  );
  if (!dept) {
    dept = { id: "dept_" + crypto.randomUUID().slice(0, 8), name: job.department || "General", roles: [] };
    co.departments.push(dept);
  }
  dept.roles = dept.roles || dept.jobs || [];
  let role = dept.roles.find(
    (r) => String(r.role || r.name || "").toLowerCase() === String(job.role || "").toLowerCase()
  );
  if (!role) {
    role = { role: job.role || "Worker", salary: job.salary || 0, amount: 1, members: [] };
    dept.roles.push(role);
  }
  role.members = role.members || [];
  if (!role.members.some((m) => String(m.username || "").toLowerCase() === uname)) {
    role.members.push({
      username: uname,
      displayName: citizen.displayName || uname,
      handle: citizen.handle || uname,
    });
  }
  co.staff = Number(co.staff || 1) + 1;
  await saveCompanyRecord(env, co);
}

async function respondJob(request, env, id) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const body = await request.json().catch(() => ({}));
  const decision = String(body.decision || "").toLowerCase();
  if (!["accept", "decline"].includes(decision)) {
    return json({ error: "decision must be accept or decline" }, 400);
  }
  id = decodeURIComponent(id);
  const data = await loadJobsDir(env);
  data.pending = data.pending || [];
  const idx = data.pending.findIndex((j) => j.id === id);
  if (idx < 0) return json({ error: "Job request not found" }, 404);
  const job = data.pending[idx];
  const citizen = await loadCitizen(env, uname);
  const aliases = jobAliases(citizen, uname);

  const isOfferTarget = job.kind === "offer" && aliases.includes(String(job.toUsername || "").toLowerCase());
  const isAppOwner = job.kind === "application" && aliases.includes(String(job.companyOwner || "").toLowerCase());
  if (!isOfferTarget && !isAppOwner) {
    return json({ error: "Forbidden — not the recipient of this request" }, 403);
  }

  data.pending.splice(idx, 1);
  if (decision === "accept") {
    job.status = "accepted";
    job.acceptedAt = new Date().toISOString();
    job.acceptedBy = uname;
    const workerName = job.kind === "offer" ? job.toUsername : job.from;
    const worker = await loadCitizen(env, workerName);
    const co = await loadCompanyRecord(env, job.companyId);
    if (worker && co) await attachWorkerToCompany(env, co, worker, job);
    data.active = data.active || [];
    data.active.unshift(job);
  } else {
    job.status = "declined";
    job.declinedAt = new Date().toISOString();
    job.declinedBy = uname;
  }
  await saveJobsDir(env, data);
  await env.AUTH.put(`job:${id}`, JSON.stringify(job));
  return json({ ok: true, job, decision });
}


async function companyPay(request, env, id) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const co = await loadCompanyRecord(env, id);
  const gate = await assertCompanyAccess(env, co, uname, { ownerOnly: true });
  if (gate.error) return gate.error;

  const body = await request.json().catch(() => ({}));
  const toUsername = String(body.toUsername || body.to || body.citizen || "").trim().toLowerCase();
  const amount = Number(body.amount);
  const note = String(body.note || body.label || "Company pay").slice(0, 160);
  const kind = String(body.kind || "pay").toLowerCase(); // pay | salary | transfer
  if (!toUsername || !(amount > 0) || !Number.isFinite(amount)) {
    return json({ error: "Citizen and a positive amount are required" }, 400);
  }
  const to = await loadCitizen(env, toUsername);
  if (!to) return json({ error: "Citizen not found" }, 404);
  if (!to.uuid) to.uuid = crypto.randomUUID();
  if (typeof to.balance !== "number") to.balance = 0;

  const next = Number(co.balance || 0) - amount;
  if (next < 0) return json({ error: "Insufficient company balance" }, 400);

  co.balance = next;
  to.balance = Number(to.balance || 0) + amount;
  await saveCompanyRecord(env, co);
  await saveCitizen(env, to);

  const type = kind === "salary" ? "salary" : "transfer_out";
  await appendCompanyTx(env, co.id, {
    type,
    label: `${note} · ${to.displayName || to.username}`,
    amount: -amount,
    by: uname,
    counterparty: to.username,
  });
  await appendTx(env, to.uuid, {
    type: "company_pay",
    label: `Paid by ${co.name}`,
    amount,
    note,
    counterparty: co.id,
  });
  await appendCityTransfer(env, {
    type: "company_pay",
    label: `${co.name} → ${to.displayName || to.username}`,
    amount,
    note,
    from: co.name,
    to: to.username,
    companyId: co.id,
  });

  return json({
    ok: true,
    companyBalance: co.balance,
    citizenBalance: to.balance,
    to: to.username,
  });
}


async function myPendingCompanyApp(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const username = String(s.session.discordUsername || "").toLowerCase();
  const apps = (await env.AUTH.get("directory:applications", "json")) || [];
  const pending = apps.find(
    (a) =>
      String(a.applicant || "").toLowerCase() === username &&
      String(a.status || "pending").toLowerCase() === "pending"
  );
  return json({
    pending: pending
      ? {
          id: pending.id,
          name: pending.companyName || pending.name,
          submitted: pending.submitted || pending.at,
          status: "pending",
        }
      : null,
  });
}


async function updateCompanyStructure(request, env, id) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const co = await loadCompanyRecord(env, id);
  const gate = await assertCompanyAccess(env, co, uname, { ownerOnly: true });
  if (gate.error) return gate.error;
  const body = await request.json().catch(() => ({}));
  if (Array.isArray(body.departments)) co.departments = body.departments;
  if (Array.isArray(body.coOwners)) co.coOwners = body.coOwners;
  if (typeof body.description === "string") co.description = body.description.slice(0, 2000);
  const logo = String(body.logo || "");
  if (logo.startsWith("data:image/") && logo.length < 400000) co.logo = logo;
  if (body.logo === "") delete co.logo;
  await saveCompanyRecord(env, co);
  return json({ ok: true, company: { id: co.id, departments: co.departments, logo: co.logo || "" } });
}

function utcDay(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function reportsKey(companyId) {
  return `shift-reports:${companyId}`;
}

async function loadReports(env, companyId) {
  return (await env.AUTH.get(reportsKey(companyId), "json")) || [];
}

async function saveReports(env, companyId, items) {
  await env.AUTH.put(reportsKey(companyId), JSON.stringify(items.slice(0, 400)));
}

function memberRate(citizen, co, uname) {
  const gig =
    (citizen?.gigs || []).find((g) => g.companyId === co.id) ||
    (citizen?.companies || []).find((c) => c.id === co.id) ||
    null;
  let rate = Number(gig?.salary ?? gig?.rate ?? 0);
  if (!(rate > 0) && Array.isArray(co.departments)) {
    for (const d of co.departments) {
      for (const m of d.members || []) {
        if (String(m.username || m.handle || "").toLowerCase() === uname) {
          rate = Number(m.salary ?? m.rate ?? 0);
        }
      }
    }
  }
  return { gig, rate };
}

async function submitShiftReport(request, env) {
  await settleShiftPayroll(env);
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const citizen = await loadCitizen(env, uname);
  if (!citizen) return json({ error: "Citizen not found" }, 404);
  const body = await request.json().catch(() => ({}));
  const companyId = String(body.companyId || "").trim();
  const hours = Math.round(Number(body.hours) * 100) / 100;
  const description = String(body.description || "").trim().slice(0, 280);
  if (!companyId) return json({ error: "companyId required" }, 400);
  if (!(hours > 0) || hours > 24) return json({ error: "Hours must be between 0.25 and 24" }, 400);
  if (description.length < 8) return json({ error: "Add a short description (at least 8 characters)" }, 400);
  const co = await loadCompanyRecord(env, companyId);
  if (!co) return json({ error: "Company not found" }, 404);
  const isOwner = String(co.owner || "").toLowerCase() === uname;
  const { gig, rate } = memberRate(citizen, co, uname);
  if (!gig && !isOwner) return json({ error: "You are not a member of this company" }, 403);
  if (!(rate > 0)) return json({ error: "No hourly rate is set for you at this company" }, 400);
  const day = utcDay();
  const amount = Math.round(hours * rate * 100) / 100;
  const items = await loadReports(env, co.id);
  const existing = items.find((r) => r.username === uname && r.day === day && r.status !== "rejected");
  if (existing && existing.paid) {
    return json({ error: "Today's UTC shift is already paid. Submit again after 00:00 UTC." }, 409);
  }
  const report = {
    id: existing?.id || crypto.randomUUID(),
    companyId: co.id,
    companyName: co.name,
    username: uname,
    displayName: citizen.displayName || citizen.username,
    hours,
    description,
    rate,
    amount,
    day,
    timezone: "UTC",
    status: "approved",
    paid: false,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const next = existing ? items.map((r) => (r.id === report.id ? report : r)) : [report, ...items];
  await saveReports(env, co.id, next);
  return json({ ok: true, report, payday: "00:00 UTC" });
}

async function myShiftReports(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const citizen = await loadCitizen(env, uname);
  const ids = new Set();
  for (const g of citizen?.gigs || []) if (g.companyId) ids.add(g.companyId);
  for (const c of citizen?.companies || []) if (c.id) ids.add(c.id);
  const items = [];
  for (const id of ids) {
    const list = await loadReports(env, id);
    items.push(...list.filter((r) => r.username === uname));
  }
  items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return json({ items });
}

async function listCompanyReports(request, env, companyId) {
  await settleShiftPayroll(env);
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const co = await loadCompanyRecord(env, decodeURIComponent(companyId));
  if (!co) return json({ error: "Company not found" }, 404);
  const gate = await assertCompanyAccess(env, co, uname, { ownerOnly: true });
  const citizen = await loadCitizen(env, uname);
  const member = (citizen?.gigs || []).some((g) => g.companyId === co.id) || (citizen?.companies || []).some((c) => c.id === co.id);
  if (gate.error && !member) return gate.error;
  let items = await loadReports(env, co.id);
  if (gate.error) items = items.filter((r) => r.username === uname);
  return json({ items, payday: "00:00 UTC" });
}

async function rejectShiftReport(request, env, reportId) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason || "").trim().slice(0, 240);
  if (reason.length < 3) return json({ error: "A rejection reason is required" }, 400);
  const companyId = String(body.companyId || "").trim();
  const co = await loadCompanyRecord(env, companyId);
  if (!co) return json({ error: "Company not found" }, 404);
  const gate = await assertCompanyAccess(env, co, uname, { ownerOnly: true });
  if (gate.error) return gate.error;
  const items = await loadReports(env, co.id);
  const report = items.find((r) => r.id === decodeURIComponent(reportId));
  if (!report) return json({ error: "Report not found" }, 404);
  if (report.status === "rejected") return json({ ok: true, report, already: true });
  let debt = false;
  if (report.paid && report.amount > 0) {
    const citizen = await loadCitizen(env, report.username);
    if (!citizen) return json({ error: "Citizen not found" }, 404);
    if (typeof citizen.balance !== "number") citizen.balance = 0;
    citizen.balance = Math.round((Number(citizen.balance) - Number(report.amount)) * 100) / 100;
    debt = citizen.balance < 0;
    co.balance = Math.round((Number(co.balance || 0) + Number(report.amount)) * 100) / 100;
    await saveCitizen(env, citizen);
    await saveCompanyRecord(env, co);
    await appendTx(env, citizen.uuid, {
      type: "fraud_clawback",
      label: `Fraudulent hours clawed back · ${co.name}`,
      amount: -Number(report.amount),
      note: reason,
      counterparty: co.id,
    });
    await appendCompanyTx(env, co.id, {
      type: "clawback",
      label: `Rejected shift · ${citizen.displayName || citizen.username}`,
      amount: Number(report.amount),
      by: uname,
      counterparty: citizen.username,
    });
    report.clawedBack = true;
    report.balanceAfter = citizen.balance;
  }
  report.status = "rejected";
  report.rejectReason = reason;
  report.rejectedBy = uname;
  report.rejectedAt = new Date().toISOString();
  await saveReports(env, co.id, items);
  return json({ ok: true, report, debt });
}

async function settleShiftPayroll(env) {
  const today = utcDay();
  const dir = (await env.AUTH.get("directory:companies", "json")) || [];
  const paid = [];
  for (const row of dir) {
    const co = await loadCompanyRecord(env, row.id);
    if (!co) continue;
    const items = await loadReports(env, co.id);
    let dirty = false;
    let companyDirty = false;
    for (const report of items) {
      if (report.status !== "approved" || report.paid) continue;
      if (!report.day || report.day >= today) continue;
      const amount = Number(report.amount) || 0;
      if (!(amount > 0)) continue;
      const citizen = await loadCitizen(env, report.username);
      if (!citizen) continue;
      if (!citizen.uuid) citizen.uuid = crypto.randomUUID();
      if (typeof citizen.balance !== "number") citizen.balance = 0;
      citizen.balance = Math.round((Number(citizen.balance) + amount) * 100) / 100;
      co.balance = Math.round((Number(co.balance || 0) - amount) * 100) / 100;
      report.paid = true;
      report.paidAt = new Date().toISOString();
      dirty = true;
      companyDirty = true;
      await saveCitizen(env, citizen);
      await appendTx(env, citizen.uuid, {
        type: "shift_pay",
        label: `Shift pay · ${co.name} · ${report.day}`,
        amount,
        note: `${report.hours}h @ ${report.rate}/h`,
        counterparty: co.id,
      });
      await appendCompanyTx(env, co.id, {
        type: "salary",
        label: `UTC payday · ${citizen.displayName || citizen.username} · ${report.day}`,
        amount: -amount,
        by: "payroll",
        counterparty: citizen.username,
      });
      paid.push({ id: report.id, username: report.username, amount, companyId: co.id });
    }
    if (dirty) await saveReports(env, co.id, items);
    if (companyDirty) await saveCompanyRecord(env, co);
  }
  await env.AUTH.put("payroll:last", JSON.stringify({ at: new Date().toISOString(), day: today, count: paid.length }));
  return { day: today, count: paid.length, paid };
}

async function runPayrollNow(request, env) {
  const s = await sessionFromRequest(request, env);
  if (!s) return json({ error: "Unauthorized" }, 401);
  const uname = String(s.session.discordUsername || "").toLowerCase();
  if (!(await isAdminUser(env, uname))) return json({ error: "Forbidden" }, 403);
  const result = await settleShiftPayroll(env);
  return json({ ok: true, ...result });
}
