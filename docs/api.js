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
window.VV_AUTH_URL = 'https://verify-bot.vidiavault.workers.dev';
window.VV_LEDGER_URL = 'https://vault-ledger.vidiavault.workers.dev'; // change after you create it
window.VV_ADMIN_URL = 'https://vault-admin.vidiavault.workers.dev'; // change after you create it

window.VV_WORKER = {
  // legacy alias used by auth helpers — points at auth worker
  get baseUrl() {
    return window.VV_AUTH_URL;
  },
  set baseUrl(v) {
    window.VV_AUTH_URL = v;
  },

  AUTH_MS: 72 * 60 * 60 * 1000,

  _read(key) {
    try {
      const local = localStorage.getItem(key);
      if (local) return local;
      const sess = sessionStorage.getItem(key);
      if (sess) {
        localStorage.setItem(key, sess);
        sessionStorage.removeItem(key);
        return sess;
      }
    } catch {}
    return '';
  },

  getToken() {
    const token = this._read('vv_token');
    const until = Number(this._read('vv_token_exp') || 0);
    if (token && until && Date.now() > until) {
      this.clearAuth();
      return '';
    }
    return token || '';
  },

  setAuth(token, citizen) {
    try {
      if (token) {
        localStorage.setItem('vv_token', token);
        localStorage.setItem('vv_token_exp', String(Date.now() + this.AUTH_MS));
        sessionStorage.removeItem('vv_token');
      }
      if (citizen) {
        localStorage.setItem('vv_citizen', JSON.stringify(citizen));
        sessionStorage.removeItem('vv_citizen');
      }
    } catch {}
  },

  getCitizen() {
    try {
      const raw = this._read('vv_citizen');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  clearAuth() {
    try {
      localStorage.removeItem('vv_token');
      localStorage.removeItem('vv_token_exp');
      localStorage.removeItem('vv_citizen');
      sessionStorage.removeItem('vv_token');
      sessionStorage.removeItem('vv_citizen');
    } catch {}
  },

  async request(base, method, path, body, timeoutMs) {
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

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Number(timeoutMs) > 0 ? Number(timeoutMs) : 10000);
      let res;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          credentials: 'omit',
          signal: ctrl.signal,
        });
      } catch (err) {
        if (err && (err.name === 'AbortError' || /abort/i.test(String(err.message || '')))) {
          return { ok: false, status: 408, error: 'VAULT-408 · request timed out', data: null };
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
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
  adminPost(path, body, timeoutMs) {
    return this.request(window.VV_ADMIN_URL, 'POST', path, body, timeoutMs);
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


/* ---------- Vidiadollar symbol (mobile image fallback) ---------- */
(function () {
  if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = `
      .vv-currency-icon {
        display: inline-block;
        width: 0.9em;
        height: 0.9em;
        vertical-align: -0.12em;
        margin-right: 0.08em;
      }
    `;
    document.head?.appendChild(style);
    // if script loads before head is ready
    if (!document.head) {
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    }
  }
})();

window.VV_CURRENCY_IMG = 'vidiadollar.svg';

window.vvUseCurrencyImage = function () {
  try {
    return window.matchMedia('(max-width: 768px), (hover: none) and (pointer: coarse)').matches;
  } catch {
    return false;
  }
};

/** Format money. Returns HTML string when mobile (image symbol), plain text otherwise. */
window.vvMoney = function (n, opts) {
  opts = opts || {};
  if (n == null || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  const sign = num < 0 ? '−' : '';
  const body = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const forceImg = opts.forceImage === true;
  const forceText = opts.forceText === true;
  const useImg = !forceText && (forceImg || window.vvUseCurrencyImage());
  if (useImg) {
    return (
      sign +
      '<img src="' +
      window.VV_CURRENCY_IMG +
      '" class="vv-currency-icon" alt="V" />' +
      body
    );
  }
  return sign + 'Ꝟ' + body;
};


window.VV_mdLite = function (src) {
  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="text-vv-green-400">$1</code>');
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) { closeList(); continue; }
    if (/^###\s+/.test(line)) { closeList(); html += '<h3 class="text-sm font-semibold text-white mt-4 mb-1">' + inline(line.replace(/^###\s+/, '')) + '</h3>'; continue; }
    if (/^##\s+/.test(line)) { closeList(); html += '<h2 class="text-lg font-semibold text-vv-green-400 mt-5 mb-2">' + inline(line.replace(/^##\s+/, '')) + '</h2>'; continue; }
    if (/^#\s+/.test(line)) { closeList(); html += '<h1 class="text-xl font-bold text-white mb-3">' + inline(line.replace(/^#\s+/, '')) + '</h1>'; continue; }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { html += '<ul class="list-disc pl-5 space-y-1 text-sm text-white/70">'; inList = true; }
      html += '<li>' + inline(line.replace(/^[-*]\s+/, '')) + '</li>';
      continue;
    }
    closeList();
    html += '<p class="text-sm text-white/70 leading-relaxed mb-2">' + inline(line) + '</p>';
  }
  closeList();
  return html || '<p class="text-white/40 text-sm">Changelog is empty.</p>';
};

window.VV_openChangelog = async function () {
  let modal = document.getElementById('vv-changelog-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'vv-changelog-modal';
    modal.className = 'hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4';
    modal.innerHTML = '<div class="max-w-2xl mx-auto mt-16 bg-vv-blue-900 border border-white/10 rounded-2xl p-5 max-h-[80vh] overflow-y-auto">' +
      '<div class="flex items-center justify-between mb-3">' +
      '<h2 class="text-sm font-medium text-white/60 uppercase tracking-wider">Changelog</h2>' +
      '<button type="button" class="text-white/40 hover:text-white text-lg leading-none" onclick="document.getElementById(\'vv-changelog-modal\').classList.add(\'hidden\')">&times;</button>' +
      '</div><div id="vv-changelog-body" class="text-white/70">Loading…</div></div>';
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');
  const body = document.getElementById('vv-changelog-body');
  body.textContent = 'Loading…';
  try {
    const res = await fetch('CHANGELOG.md', { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not load CHANGELOG.md (' + res.status + ')');
    const text = await res.text();
    body.innerHTML = window.VV_mdLite(text);
  } catch (e) {
    body.innerHTML = '<p class="text-red-400 text-sm">' + (e.message || 'Failed to load changelog') + '</p>';
  }
};
