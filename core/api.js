// ==========================================
// FILE: api.js (TRANSKEP Web Client SDK)
// DESKRIPSI: SDK Komunikasi Frontend ke Google Apps Script Headless API
// FITUR: Anti-CORS Preflight, Auto Auth Token, Client-Side In-Memory Cache
// ENGINE: TRANSKEP Core v1.0.0 
// ==========================================

const TranskepAPI = (function () {
  // URL DEPLOYMENT RESMI WEB APP (Google Apps Script Versi 273)
  const VERIFIED_URL = 'https://script.google.com/macros/s/AKfycbzFrbQTqmVzMio7mderK-S9ntFVjXiWYFgnXfy9fW_SUKOcIxfPywP2He1flhaK_AZ0ZA/exec';

  // Validasi & Auto-Sinkronisasi URL jika tersimpan URL lama / typo di localStorage
  let savedUrl = (typeof localStorage !== 'undefined') ? localStorage.getItem('transkep_api_url') : null;
  if (!savedUrl || savedUrl.includes('SUKOclxf') || savedUrl.includes('AKfycbx...')) {
    savedUrl = VERIFIED_URL;
    if (typeof localStorage !== 'undefined') localStorage.setItem('transkep_api_url', VERIFIED_URL);
  }

  const CONFIG = {
    apiUrl: savedUrl,
    timeout: 30000 // 30 detik
  };

  // In-Memory Cache untuk perpindahan menu instan (TRANSKEP In-Memory Caching Rule)
  const memoryCache = new Map();

  /**
   * Helper Pengambilan Token & NIP dari Storage (Harmonisasi Dual-Key)
   */
  function getAuth() {
    if (typeof localStorage === 'undefined') {
      return { nip: '', token: '', user: null };
    }
    return {
      nip: localStorage.getItem('transkep_active_nip') || localStorage.getItem('transkep_user_nip') || '',
      token: localStorage.getItem('transkep_session_token') || localStorage.getItem('transkep_token') || '',
      user: JSON.parse(localStorage.getItem('transkep_user') || 'null')
    };
  }

  /**
   * Helper Rekursif Sanitasi Payload (Global Anti-XSS Interceptor)
   */
  function sanitizePayloadRecursive(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    for (let key in obj) {
      if (typeof obj[key] === 'string') {
        const lowerKey = key.toLowerCase();
        // Kecualikan atribut otentikasi/kriptografi dari pengubahan teks
        if (lowerKey.includes('pass') || lowerKey.includes('token') || lowerKey.includes('sig')) {
          continue;
        }
        if (typeof window !== 'undefined' && typeof window.sanitizeInput === 'function') {
          obj[key] = window.sanitizeInput(obj[key]);
        }
      } else if (typeof obj[key] === 'object') {
        sanitizePayloadRecursive(obj[key]);
      }
    }
    return obj;
  }

  /**
   * Inti Eksekusi HTTP Fetch ke Google Apps Script (Anti-CORS)
   */
  async function request(payload, options = {}) {
    // 1. Verifikasi Integritas Sesi (Anti-Tampering Gate)
    // Pengecualian endpoint publik: login, verifyLogin, ping, dan submitLupaPassword
    const isPublicAction = (
      payload.action === 'login' ||
      payload.action === 'ping' ||
      payload.action === 'submitLupaPassword' ||
      payload.method === 'verifyLogin' ||
      payload.method === 'ping' ||
      payload.method === 'submitLupaPassword'
    );

    if (!isPublicAction && typeof window !== 'undefined' && window.SessionIntegrityGuard && typeof window.SessionIntegrityGuard.verify === 'function') {
      if (!window.SessionIntegrityGuard.verify()) {
        throw new Error('Pelanggaran Keamanan: Integritas sesi tidak valid.');
      }
    }

    // 2. Sanitasi Rekursif Payload Outgoing (Anti-XSS Interceptor)
    sanitizePayloadRecursive(payload);

    // Sisipkan kredensial sesi jika payload belum memuatnya
    const auth = getAuth();
    if (!payload.nip && auth.nip) payload.nip = auth.nip;
    if (!payload.token && auth.token) payload.token = auth.token;

    // KUNCI ANTI-CORS GAS: Gunakan 'text/plain;charset=utf-8' agar browser
    // tidak memicu request 'OPTIONS' (CORS Preflight) yang ditolak oleh Apps Script.
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload),
      redirect: 'follow'
    };

    try {
      const response = await fetch(CONFIG.apiUrl, fetchOptions);
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const rawText = await response.text();
      try {
        return JSON.parse(rawText);
      } catch (parseErr) {
        if (rawText.includes('Maaf') || rawText.includes('Google Drive') || rawText.includes('drive-logo')) {
          throw new Error('Server Google Apps Script sedang sibuk atau URL deployment perlu diperbarui.');
        }
        throw new Error('Respon server tidak valid: ' + rawText.substring(0, 100));
      }
    } catch (err) {
      console.error('[TranskepAPI Error] Target URL:', CONFIG.apiUrl, err);
      throw err;
    }
  }

  return {
    /**
     * Konfigurasi URL Endpoint Apps Script
     */
    setApiUrl(url) {
      CONFIG.apiUrl = url;
      localStorage.setItem('transkep_api_url', url);
    },
    getApiUrl() {
      return CONFIG.apiUrl;
    },

    /**
     * Universal RPC Caller (Identik dengan google.script.run)
     * Mengembalikan objek respon murni dari Apps Script
     */
    async call(method, ...args) {
      const auth = getAuth();
      const payload = {
        action: 'call',
        method: method,
        args: args,
        nip: auth.nip,
        token: auth.token
      };

      const res = await request(payload);
      return res;
    },

    /**
     * Cek Koneksi / Ping Server (Dual Mode: POST Anti-CORS dengan fallback GET)
     */
    async ping(customUrl) {
      const url = customUrl || CONFIG.apiUrl;
      try {
        const getUrl = `${url}${url.includes('?') ? '&' : '?'}api=true&action=ping`;
        const resGet = await fetch(getUrl, { redirect: 'follow' });
        const text = await resGet.text();
        return JSON.parse(text);
      } catch (getErr) {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'ping' }),
          redirect: 'follow'
        });
        const text = await res.text();
        return JSON.parse(text);
      }
    },

    /**
     * Login Pengguna
     */
    async login(nip, pass) {
      const res = await request({
        action: 'login',
        nip: nip,
        pass: pass
      });

      if (res && res.status === 'success' && res.token) {
        if (typeof window !== 'undefined' && window.SessionIntegrityGuard && typeof window.SessionIntegrityGuard.sealSession === 'function') {
          window.SessionIntegrityGuard.sealSession(res.data.nip, res.data.role || '', res.token);
        } else {
          localStorage.setItem('transkep_active_nip', res.data.nip);
          localStorage.setItem('transkep_session_token', res.token);
          localStorage.setItem('transkep_user_role', res.data.role || '');
        }
        localStorage.setItem('transkep_user_nip', res.data.nip);
        localStorage.setItem('transkep_token', res.token);
        localStorage.setItem('transkep_user_nama', res.data.nama || '');
        localStorage.setItem('transkep_user', JSON.stringify(res.data));
        memoryCache.clear(); // Bersihkan cache lama
      }

      return res;
    },

    /**
     * Logout Pengguna & Revokasi Sesi di Server
     */
    async logout() {
      const auth = getAuth();
      try {
        if (auth.token) {
          await request({
            action: 'logout',
            nip: auth.nip,
            token: auth.token
          });
        }
      } catch (e) {
        console.warn('Gagal revokasi sesi di server:', e);
      } finally {
        if (typeof window !== 'undefined' && window.SessionIntegrityGuard && typeof window.SessionIntegrityGuard.runInternal === 'function') {
          window.SessionIntegrityGuard.runInternal(() => {
            if (typeof window.SessionIntegrityGuard.resetSession === 'function') {
              window.SessionIntegrityGuard.resetSession();
            }
            localStorage.removeItem('transkep_active_nip');
            localStorage.removeItem('transkep_user_nip');
            localStorage.removeItem('transkep_session_token');
            localStorage.removeItem('transkep_token');
            localStorage.removeItem('transkep_user_role');
            localStorage.removeItem('transkep_user_nama');
            localStorage.removeItem('transkep_user_profile');
            localStorage.removeItem('transkep_user');
            localStorage.removeItem('transkep_session_sig');
            localStorage.removeItem('transkep_last_active_time');
          });
        } else {
          if (typeof window !== 'undefined' && window.SessionIntegrityGuard && typeof window.SessionIntegrityGuard.resetSession === 'function') {
            window.SessionIntegrityGuard.resetSession();
          }
          localStorage.removeItem('transkep_active_nip');
          localStorage.removeItem('transkep_user_nip');
          localStorage.removeItem('transkep_session_token');
          localStorage.removeItem('transkep_token');
          localStorage.removeItem('transkep_user');
          localStorage.removeItem('transkep_session_sig');
        }
        memoryCache.clear();
      }
    },

    /**
     * Tarik Data Massal (Bulk Data) dengan In-Memory Cache Cerdas
     */
    async getBulkData(forceRefresh = false) {
      const auth = getAuth();
      const cacheKey = `bulk_${auth.nip}`;

      if (!forceRefresh && memoryCache.has(cacheKey)) {
        return memoryCache.get(cacheKey);
      }

      const res = await request({
        action: 'getBulkData',
        nip: auth.nip,
        token: auth.token
      });

      if (res && res.status !== 'error') {
        memoryCache.set(cacheKey, res);
      }

      return res;
    },

    /**
     * Akses Langsung State Autentikasi
     */
    getAuth,
    isAuthenticated() {
      const auth = getAuth();
      return Boolean(auth.nip && auth.token);
    },

    /**
     * Hapus Cache Memori Lokal
     */
    clearCache() {
      memoryCache.clear();
    }
  };
})();

// Ekspor ke window global
if (typeof window !== 'undefined') {
  window.TranskepAPI = TranskepAPI;

  // ==========================================================
  // TRANSKEP: GOOGLE.SCRIPT.RUN COMPATIBILITY SHIM (PROXY)
  // Menjembatani seluruh pemanggilan RPC di kode asli TRANSKEP
  // agar otomatis dialihkan ke Headless API tanpa ubah kode!
  // ==========================================================
  function createScriptRunner(successHandler, failureHandler) {
    return new Proxy({}, {
      get(target, propKey) {
        if (propKey === 'withSuccessHandler') {
          return function(fn) {
            return createScriptRunner(fn, failureHandler);
          };
        }
        if (propKey === 'withFailureHandler') {
          return function(fn) {
            return createScriptRunner(successHandler, fn);
          };
        }
        // Eksekusi fungsi backend GAS
        return function(...args) {
          setTimeout(async () => {
            try {
              let result = await window.TranskepAPI.call(propKey, ...args);
              // TRANSKEP: Jika server membungkus hasil RPC non-status (misal array) ke dalam { status: 'success', data: [...] },
              // unwrap kembali agar identik 100% dengan kembalian google.script.run asli
              if (result && typeof result === 'object' && result.status === 'success' && ('data' in result)) {
                if (Array.isArray(result.data)) {
                  result = result.data;
                }
              }
              if (typeof successHandler === 'function') {
                successHandler(result);
              }
            } catch (err) {
              console.error(`[RPC Error: ${propKey}]`, err);
              if (typeof failureHandler === 'function') {
                failureHandler(err);
              }
            }
          }, 0);
        };
      }
    });
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = createScriptRunner(null, null);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TranskepAPI };
}

