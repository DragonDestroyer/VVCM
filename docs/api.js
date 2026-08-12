/**
 * VAULT API clients
 *
 * verify-bot   → Discord auth only
 * vault-ledger → UUID, balances, transactions, /me
 * vault-admin  → administrator panel APIs
 *
 * All three Workers should bind the SAME KV namespace as AUTH
 * so sessions and citizen records are shared.
 */
window.VV_AUTH_URL = 'https://verify-bot.max7gorman.workers.dev';
window.VV_LEDGER_URL = 'https://vault-ledger.max7gorman.workers.dev'; // change after you create it
window.VV_ADMIN_URL = 'https://vault-admin.max7gorman.workers.dev'; // change after you create it

window.VV_WORKER = {
  // legacy alias used by auth helpers — points at auth worker
  get baseUrl() {
    return window.VV_AUTH_URL;
  },
  set baseUrl(v) {
    window.VV_AUTH_URL = v;
  },

  getToken() {
    try {
      return sessionStorage.getItem('vv_token') || '';
    } catch {
      return '';
    }
  },

  async request(base, method, path, body) {
    if (!base) {
      console.warn('[VAULT] endpoint not set', method, path);
      return { ok: false, status: 0, error: 'Worker endpoint not configured', data: null };
    }
    const url = String(base).replace(/\/$/, '') + path;
    try {
      const headers = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      const token = this.getToken();
      if (token) headers.Authorization = 'Bearer ' + token;

      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: 'omit',
      });
      let data = null;
      const text = await res.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      return {
        ok: res.ok,
        status: res.status,
        data,
        error: res.ok ? null : (data && data.error) || res.statusText,
      };
    } catch (err) {
      console.error('[VAULT] network error', err);
      return { ok: false, status: 0, error: err.message || 'Network error', data: null };
    }
  },

  // Auth worker
  authGet(path) {
    return this.request(window.VV_AUTH_URL, 'GET', path);
  },
  authPost(path, body) {
    return this.request(window.VV_AUTH_URL, 'POST', path, body);
  },

  // Ledger worker
  get(path) {
    return this.request(window.VV_LEDGER_URL, 'GET', path);
  },
  post(path, body) {
    return this.request(window.VV_LEDGER_URL, 'POST', path, body);
  },
  patch(path, body) {
    return this.request(window.VV_LEDGER_URL, 'PATCH', path, body);
  },
  delete(path) {
    return this.request(window.VV_LEDGER_URL, 'DELETE', path);
  },

  // Admin worker
  adminGet(path) {
    return this.request(window.VV_ADMIN_URL, 'GET', path);
  },
  adminPost(path, body) {
    return this.request(window.VV_ADMIN_URL, 'POST', path, body);
  },
};

window.VV_AUTH = {
  lookupCitizen(discordUsername) {
    return VV_WORKER.authPost('/auth/lookup', { discordUsername });
  },
  startChallenge(discordUsername) {
    return VV_WORKER.authPost('/auth/start-challenge', { discordUsername });
  },
  challengeStatus(discordUsername, challengeId) {
    const q = new URLSearchParams({ discordUsername, challengeId });
    return VV_WORKER.authGet('/auth/challenge-status?' + q.toString());
  },
  verifyCode(discordUsername, code) {
    return VV_WORKER.authPost('/auth/verify', { discordUsername, code });
  },
};
