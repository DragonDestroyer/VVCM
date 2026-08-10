/**
 * VAULT Worker API client
 * Point baseUrl at your Cloudflare Worker, e.g. verify-bot.
 */
window.VV_WORKER = {
  // Set this to your Worker URL (no trailing slash)
  baseUrl: 'https://verify-bot.max7gorman.workers.dev',

  async request(method, path, body) {
    if (!this.baseUrl) {
      console.warn('[VV Worker] baseUrl not set — placeholder only', method, path, body ?? '');
      return { ok: false, status: 0, error: 'Worker endpoint not configured', data: null };
    }
    const url = this.baseUrl.replace(/\/$/, '') + path;
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        // omit: Worker uses Access-Control-Allow-Origin: * (credentials + * is blocked by browsers)
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
      console.error('[VV Worker] network error', err);
      return { ok: false, status: 0, error: err.message || 'Network error', data: null };
    }
  },

  get(path) {
    return this.request('GET', path);
  },

  post(path, body) {
    return this.request('POST', path, body);
  },

  patch(path, body) {
    return this.request('PATCH', path, body);
  },

  delete(path) {
    return this.request('DELETE', path);
  },
};

/**
 * Auth helpers (Worker + Discord bot)
 *
 * Flow:
 *  1. POST /auth/lookup
 *  2. POST /auth/start-challenge → site shows correctNumber; bot DMs 3 choices
 *  3. User picks matching number in Discord → bot DMs 6-digit code
 *  4. GET  /auth/challenge-status
 *  5. POST /auth/verify
 */
window.VV_AUTH = {
  lookupCitizen(discordUsername) {
    return VV_WORKER.post('/auth/lookup', { discordUsername });
  },
  startChallenge(discordUsername) {
    return VV_WORKER.post('/auth/start-challenge', { discordUsername });
  },
  challengeStatus(discordUsername, challengeId) {
    const q = new URLSearchParams({ discordUsername, challengeId });
    return VV_WORKER.get('/auth/challenge-status?' + q.toString());
  },
  verifyCode(discordUsername, code) {
    return VV_WORKER.post('/auth/verify', { discordUsername, code });
  },
};
