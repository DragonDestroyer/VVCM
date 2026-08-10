
VV_WORKER.baseUrl = 'https://verify-bot.max7gorman.workers.dev';

window.VV_WORKER = {
  baseUrl: null,

  async request(method, path, body) {
    const url = (this.baseUrl || '') + path;
    if (!this.baseUrl) {
      console.warn('[VV Worker] baseUrl not set — placeholder only', method, path, body ?? '');
      return { ok: false, status: 0, error: 'Worker endpoint not configured', data: null };
    }
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: 'include',
      });
      let data = null;
      const text = await res.text();
      if (text) {
        try { data = JSON.parse(text); } catch { data = text; }
      }
      return { ok: res.ok, status: res.status, data, error: res.ok ? null : (data && data.error) || res.statusText };
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
 *  1. POST /auth/lookup          — citizen exists?
 *  2. POST /auth/start-challenge — Worker stores correct number, bot DMs 3 choices (e.g. 50, 86, 24)
 *  3. User picks the number shown on the site in Discord
 *  4. Bot DMs the 6-digit login code
 *  5. POST /auth/verify          — code → session
 */
window.VV_AUTH = {
  lookupCitizen(discordUsername) {
    return VV_WORKER.post('/auth/lookup', { discordUsername });
  },
  startChallenge(discordUsername) {
    return VV_WORKER.post('/auth/start-challenge', { discordUsername });
  },
  /** Optional poll: has the user picked the right number in Discord yet? */
  challengeStatus(discordUsername, challengeId) {
    const q = new URLSearchParams({ discordUsername, challengeId });
    return VV_WORKER.get('/auth/challenge-status?' + q.toString());
  },
  verifyCode(discordUsername, code) {
    return VV_WORKER.post('/auth/verify', { discordUsername, code });
  },
};
