/**
 * VAULT Worker API client
 */
window.VV_WORKER = {
  baseUrl: 'https://verify-bot.max7gorman.workers.dev',

  getToken() {
    try {
      return sessionStorage.getItem('vv_token') || '';
    } catch {
      return '';
    }
  },

  async request(method, path, body) {
    if (!this.baseUrl) {
      console.warn('[VV Worker] baseUrl not set', method, path);
      return { ok: false, status: 0, error: 'Worker endpoint not configured', data: null };
    }
    const url = this.baseUrl.replace(/\/$/, '') + path;
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
