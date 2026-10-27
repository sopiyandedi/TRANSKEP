// =========================================================
// DUAL-ENVIRONMENT BRIDGE (ANTIGRAVITY & HEADLESS PWA BRIDGE - TAHAP 5)
// =========================================================
if (typeof window.google === 'undefined' || !window.google.script) {
  window.google = window.google || {};
  window.google.script = {
    run: new Proxy({}, {
      get: function(target, propKey) {
        if (propKey === 'withSuccessHandler') {
          return function(successCallback) {
            return new Proxy({}, {
              get: function(t, methodKey) {
                if (methodKey === 'withFailureHandler') {
                  return function(failureCallback) {
                    return new Proxy({}, {
                      get: function(tt, actionKey) {
                        return function(...args) {
                          if (typeof window.TranskepAPI !== 'undefined' && typeof window.TranskepAPI.call === 'function') {
                            window.TranskepAPI.call(actionKey, ...args)
                              .then(res => { if (typeof successCallback === 'function') successCallback(res); })
                              .catch(err => { if (typeof failureCallback === 'function') failureCallback(err); });
                          } else {
                            console.log('[PreviewBridge] google.script.run.' + actionKey + ' fallback invoked:', args);
                            setTimeout(() => {
                              if (typeof successCallback === 'function') {
                                successCallback({ status: 'success', message: '[Simulasi Preview] Aksi ' + actionKey + ' berhasil.', data: {} });
                              }
                            }, 50);
                          }
                        };
                      }
                    });
                  };
                }
                return function(...args) {
                  if (typeof window.TranskepAPI !== 'undefined' && typeof window.TranskepAPI.call === 'function') {
                    window.TranskepAPI.call(methodKey, ...args)
                      .then(res => { if (typeof successCallback === 'function') successCallback(res); })
                      .catch(err => console.warn('[PreviewBridge] Error:', err));
                  } else {
                    console.log('[PreviewBridge] google.script.run.' + methodKey + ' fallback invoked:', args);
                    setTimeout(() => {
                      if (typeof successCallback === 'function') {
                        successCallback({ status: 'success', message: '[Simulasi Preview] Aksi ' + methodKey + ' berhasil.', data: {} });
                      }
                    }, 50);
                  }
                };
              }
            });
          };
        }
        if (propKey === 'withFailureHandler') {
          return function(failureCallback) {
            return new Proxy({}, {
              get: function(t, methodKey) {
                return function(...args) {
                  if (typeof window.TranskepAPI !== 'undefined' && typeof window.TranskepAPI.call === 'function') {
                    window.TranskepAPI.call(methodKey, ...args)
                      .catch(err => { if (typeof failureCallback === 'function') failureCallback(err); });
                  } else {
                    console.log('[PreviewBridge] google.script.run.' + methodKey + ' invoked without success handler:', args);
                  }
                };
              }
            });
          };
        }
        return function(...args) {
          if (typeof window.TranskepAPI !== 'undefined' && typeof window.TranskepAPI.call === 'function') {
            return window.TranskepAPI.call(propKey, ...args);
          }
          console.log('[PreviewBridge] Direct google.script.run.' + propKey + ' invoked:', args);
        };
      }
    }),
    host: {
      close: function() { console.log('[PreviewBridge] google.script.host.close() called.'); },
      setHeight: function(h) {},
      setWidth: function(w) {}
    }
  };
}

// =========================================================================
// SECURITY CONSOLE GUARD: Peringatan Keamanan Siber Resmi Pengadilan Agama Indramayu
// =========================================================================
(function renderCyberWatchBanner() {
  const headerStyle = "color: #ffffff; background: #dc2626; font-size: 14px; font-weight: 800; padding: 8px 16px; border-radius: 4px; text-shadow: 0 1px 2px rgba(0,0,0,0.5);";
  const bodyStyle = "color: #fca5a5; background: #0f172a; font-size: 11px; font-weight: 600; line-height: 1.6; padding: 10px 14px; border-left: 4px solid #ef4444; border-radius: 0 4px 4px 0; margin-top: 4px; font-family: monospace;";

  console.log("%c🚨 PERINGATAN KEAMANAN SIBER RESMI - PENGADILAN AGAMA INDRAMAYU 🚨", headerStyle);
  console.log(
    "%cPERHATIAN: Sistem Informasi Manajemen & Transparansi Kepegawaian (TRANSKEP) dilindungi secara aktif oleh:\n" +
    "• Google Cloud Platform IAM (Enterprise Cloud Perimeter)\n" +
    "• Cloud Firestore Immutable Security Rules (Zero-Trust Data Protection)\n" +
    "• Enkripsi Data Transit TLS 1.3 & Anti-Tamper Session Guard\n\n" +
    "DILARANG KERAS melakukan manipulasi memori, injeksi skrip, perubahan LocalStorage (tampering), atau reverse-engineering tanpa izin.\n" +
    "Setiap akses ilegal dan manipulasi sesi dicatat ke Audit Trail dan dapat diproses pidana sesuai UU ITE No. 11 Tahun 2008 Pasal 30, 31, dan 32.",
    bodyStyle
  );
})();

// =========================================================================
// CRYPTOGRAPHIC CHECKSUM & SESSION INTEGRITY GUARD (ANTI-TAMPER LOCALSTORAGE)
// =========================================================================
function computeSecureChecksum(str) {
  const SALT = 'TRANSKEP_PA_INDRAMAYU_SECURE_SALT_2026_#9981';
  const combined = SALT + '::' + str + '::' + SALT;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0x811c9dc5, h4 = 0x9e3779b9;
  for (let i = 0; i < combined.length; i++) {
    const ch = combined.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 2246822519);
    h4 = Math.imul(h4 ^ ch, 3266489917);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822519) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489917);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2654435761) ^ Math.imul(h3 ^ (h3 >>> 13), 1597334677);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 1597334677) ^ Math.imul(h4 ^ (h4 >>> 13), 2246822519);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 3266489917) ^ Math.imul(h1 ^ (h1 >>> 13), 2654435761);
  return (
    (h1 >>> 0).toString(16).padStart(8, '0') +
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h3 >>> 0).toString(16).padStart(8, '0') +
    (h4 >>> 0).toString(16).padStart(8, '0')
  );
}

// Low-level storage methods referensi murni
const _rawStorageSet = Storage.prototype.setItem;
const _rawStorageRemove = Storage.prototype.removeItem;
const _rawStorageClear = Storage.prototype.clear;

let _isInternalAuthAction = false;
let _activeMemorySession = null;
let _isTamperHandling = false;

const PROTECTED_SESSION_KEYS = [
  'transkep_active_nip',
  'transkep_session_token',
  'transkep_user_role',
  'transkep_user_nama',
  'transkep_user_profile',
  'transkep_user',
  'transkep_session_sig'
];

const SessionIntegrityGuard = {
  SALT: 'TRANSKEP_PA_INDRAMAYU_SECURE_SALT_2026_#9981',

  generateSignature(nip, role, token) {
    if (!nip || !token) return '';
    const raw = `${String(nip).trim()}:${String(role || 'Pegawai').trim()}:${String(token).trim()}:${this.SALT}`;
    return computeSecureChecksum(raw);
  },

  sealSession(nip, role, token) {
    _isInternalAuthAction = true;
    try {
      const cleanNip = String(nip || '').trim();
      const cleanRole = String(role || 'Pegawai').trim();
      const cleanToken = String(token || '').trim();
      const sig = this.generateSignature(cleanNip, cleanRole, cleanToken);

      if (sig) {
        _rawStorageSet.call(localStorage, 'transkep_session_sig', sig);
        _activeMemorySession = {
          nip: cleanNip,
          role: cleanRole,
          token: cleanToken,
          sig: sig
        };
      }
    } finally {
      _isInternalAuthAction = false;
    }
  },

  resetSession() {
    _isInternalAuthAction = true;
    _activeMemorySession = null;
    setTimeout(() => { _isInternalAuthAction = false; }, 500);
  },

  verify() {
    if (_isTamperHandling) return false;

    const nip = localStorage.getItem('transkep_active_nip');
    const token = localStorage.getItem('transkep_session_token');
    const role = localStorage.getItem('transkep_user_role') || '';
    const expectedSig = localStorage.getItem('transkep_session_sig');

    // Jika belum ada sesi aktif sama sekali, lolos verifikasi
    if (!nip && !token && !expectedSig) {
      _activeMemorySession = null;
      return true;
    }

    // Jika ada data sesi parsial tetapi salah satu kunci utama hilang (signature/token/nip lenyap)
    if (!nip || !token || !expectedSig) {
      this.handleTamperingViolation('Kunci sesi LocalStorage tidak lengkap atau tanda tangan dihapus.');
      return false;
    }

    // Sesi baru dimuat dari tab/refresh: inisialisasi memori sesi jika valid
    if (!_activeMemorySession) {
      const calcSig = this.generateSignature(nip, role, token);
      if (expectedSig !== calcSig) {
        this.handleTamperingViolation('Tanda tangan sesi (Signature) tidak cocok dengan identitas pengguna.');
        return false;
      }
      _activeMemorySession = {
        nip: String(nip).trim(),
        role: String(role).trim(),
        token: String(token).trim(),
        sig: expectedSig
      };
      return true;
    }

    // Bandingkan secara absolut dengan snapshot memori aktif
    const curNip = String(nip).trim();
    const curRole = String(role).trim();
    const curToken = String(token).trim();
    const curSig = String(expectedSig).trim();

    if (curNip !== _activeMemorySession.nip ||
        curRole !== _activeMemorySession.role ||
        curToken !== _activeMemorySession.token ||
        curSig !== _activeMemorySession.sig) {

      // AUTO-REVERT INSTANT SNAP-BACK: Paksa kembalikan nilai di LocalStorage seketika (0ms)
      _isInternalAuthAction = true;
      try {
        _rawStorageSet.call(localStorage, 'transkep_active_nip', _activeMemorySession.nip);
        _rawStorageSet.call(localStorage, 'transkep_user_role', _activeMemorySession.role);
        _rawStorageSet.call(localStorage, 'transkep_session_token', _activeMemorySession.token);
        _rawStorageSet.call(localStorage, 'transkep_session_sig', _activeMemorySession.sig);
      } finally {
        _isInternalAuthAction = false;
      }

      this.handleTamperingViolation('Manipulasi data sesi LocalStorage terdeteksi! (Role/NIP dimodifikasi)');
      return false;
    }

    return true;
  },

  handleTamperingViolation(detail = 'Manipulasi Sesi Terdeteksi!') {
    if (_isTamperHandling) return;
    _isTamperHandling = true;

    console.warn(`%c🚨 [SECURITY VIOLATION] ${detail} Memaksa logout & membersihkan storage...`, 'color: #ef4444; font-weight: bold;');

    // Tampilkan Modal Peringatan Siber Keras & Un-dismissable
    try {
      const overlay = document.createElement('div');
      overlay.id = 'security-violation-overlay';
      overlay.setAttribute('style', 'position:fixed;inset:0;z-index:999999999;background:rgba(15,23,42,0.95);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;font-family:ui-sans-serif,system-ui,sans-serif;padding:20px;');
      overlay.innerHTML = `
        <div style="background:#0f172a;border:2px solid #ef4444;border-radius:24px;padding:32px;max-width:440px;width:100%;text-align:center;color:#ffffff;box-shadow:0 25px 50px -12px rgba(239,68,68,0.5);">
          <div style="font-size:48px;line-height:1;margin-bottom:16px;">🚨</div>
          <h2 style="font-size:20px;font-weight:800;color:#f87171;letter-spacing:0.025em;margin-bottom:8px;">PELANGGARAN KEAMANAN SIBER</h2>
          <p style="font-size:13px;color:#cbd5e1;line-height:1.6;margin-bottom:20px;">Manipulasi sesi LocalStorage terdeteksi! Sistem mendeteksi upaya pengubahan hak akses secara tidak sah.</p>
          <div style="font-size:11px;font-family:monospace;color:#fca5a5;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);padding:10px;border-radius:12px;margin-bottom:20px;">
            Audit Log dicatat • Sesi Anda Dibatalkan
          </div>
          <div style="font-size:12px;color:#94a3b8;">Mengalihkan kembali ke layar login...</div>
        </div>
      `;
      (document.body || document.documentElement).appendChild(overlay);
    } catch(e) {}

    // Catat insiden ke Firestore secara non-blocking (Fire-and-Forget)
    try {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
        firebase.firestore().collection('security_incidents').add({
          waktu: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
          url: window.location.href,
          userAgent: navigator.userAgent,
          jenis_pelanggaran: 'LOCALSTORAGE_TAMPERING_DETECTED',
          nip: 'SECURITY_SYSTEM',
          detail: detail,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});
      }
    } catch(e) {}

    // Hapus seluruh penyimpanan storage
    _isInternalAuthAction = true;
    try {
      _rawStorageClear.call(localStorage);
      _rawStorageClear.call(sessionStorage);
    } catch(e) {}

    setTimeout(() => {
      window.location.reload();
    }, 1500);
  },

  init() {
    // 1. Storage event listener (mendeteksi perubahan antar-tab/jendela)
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith('transkep_')) {
        this.verify();
      }
    });

    // 2. Interceptor Storage API (Mencegah modifikasi langsung via Console F12 / script injection)
    try {
      Storage.prototype.setItem = function(key, val) {
        if (this === localStorage && PROTECTED_SESSION_KEYS.includes(key) && !_isInternalAuthAction) {
          if (_activeMemorySession) {
            console.warn(`%c🚨 [SECURITY VIOLATION] Upaya modifikasi console pada '${key}' ditolak!`, 'color: #ef4444; font-weight: bold;');
            SessionIntegrityGuard.handleTamperingViolation(`Injeksi script pada kunci ${key}`);
            return;
          }
        }
        return _rawStorageSet.apply(this, arguments);
      };

      Storage.prototype.removeItem = function(key) {
        if (this === localStorage && PROTECTED_SESSION_KEYS.includes(key) && !_isInternalAuthAction) {
          if (_activeMemorySession) {
            console.warn(`%c🚨 [SECURITY VIOLATION] Upaya penghapusan console pada '${key}' ditolak!`, 'color: #ef4444; font-weight: bold;');
            SessionIntegrityGuard.handleTamperingViolation(`Penghapusan kunci ${key}`);
            return;
          }
        }
        return _rawStorageRemove.apply(this, arguments);
      };
    } catch(e) {}

    // 3. Ultra-Fast Verification Watchdog (250ms) - Mendeteksi & Revert edit DevTools Application tab seketika
    setInterval(() => {
      this.verify();
    }, 250);

    // 4. Verifikasi instan saat jendela aktif atau diklik
    window.addEventListener('focus', () => this.verify());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.verify();
    });
    window.addEventListener('click', () => this.verify(), true);
  }
};
window.SessionIntegrityGuard = SessionIntegrityGuard;

// Jalankan inisialisasi integritas sesi seketika
try {
  SessionIntegrityGuard.verify();
  SessionIntegrityGuard.init();
} catch(e) {}

// =========================================================================
// ANTI-XSS & GLOBAL INPUT SANITIZATION ENGINE
// =========================================================================
window.sanitizeInput = function(val) {
  if (typeof val !== 'string') return val;
  return val
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/data\s*:\s*text\/html/gi, '')
    .trim();
};

window.escapeHtml = function(str) {
  if (typeof str !== 'string') return str;
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return str.replace(/[&<>"']/g, m => map[m]);
};

// =========================================================================
// FILE: core.js (TRANSKEP Web Core Controller)
// DESKRIPSI: State Management, Autentikasi Login, Routing Menu, Notifikasi & Modals
// ENGINE: TRANSKEP Core v1.0.0 
// =========================================================================

console.log("🚀 TRANSKEP: Menginisialisasi sistem TRANSKEP core.js...");

let savedProfile = null;
try {
  const rawProfile = localStorage.getItem('transkep_user_profile') || localStorage.getItem('transkep_user');
  if (rawProfile) savedProfile = JSON.parse(rawProfile);
} catch(e) {}

let state = (typeof Vue !== 'undefined' && Vue.reactive) ? Vue.reactive({
  user: savedProfile,
  usersList: [],
  cutiLogs: [],
  jobdesList: [],
  skList: [],
  skAckList: [],
  kinerjaList: [],
  sopList: [],
  sopAckList: [],
  stList: [],
  masterKinerjaList: [],
  ikLogs: [],
  ipLogs: [],
  wfhLogs: [],
  currentMenu: 'dashboard',
  rendered: {},
  pendingPkpCount: 0,
  isBgSyncDone: false
}) : {
  user: savedProfile,
  usersList: [],
  cutiLogs: [],
  jobdesList: [],
  skList: [],
  skAckList: [],
  kinerjaList: [],
  sopList: [],
  sopAckList: [],
  stList: [],
  masterKinerjaList: [],
  ikLogs: [],
  ipLogs: [],
  wfhLogs: [],
  currentMenu: 'dashboard',
  rendered: {},
  pendingPkpCount: 0,
  isBgSyncDone: false
};

// Mengekspos state ke window global
window.state = state;
window.vueState = state;

const isGoogleEnv = (typeof google !== 'undefined' && google.script);

document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 TRANSKEP: Halaman berhasil dimuat (DOMContentLoaded).");

  document.body.style.display = '';
  document.body.classList.remove('hidden');
  try {
    const activeNip = localStorage.getItem('transkep_active_nip');
    const sessionToken = localStorage.getItem('transkep_session_token');
    if (activeNip && sessionToken) {
      if (!state.user) {
        try {
          const rawProfile = localStorage.getItem('transkep_user_profile') || localStorage.getItem('transkep_user');
          if (rawProfile) {
            state.user = JSON.parse(rawProfile);
            if (window.vueState) window.vueState.user = state.user;
          }
        } catch(e) {}
      }

      // TRANSKEP: Rehidrasi instan 0ms cache data absensi & peringatan
      try {
        const rawUsers = localStorage.getItem('transkep_users_cache');
        if (rawUsers) {
          state.usersList = JSON.parse(rawUsers);
          if (window.vueState) window.vueState.usersList = state.usersList;
        }
        const rawDash = localStorage.getItem('transkep_dashboard_cache');
        if (rawDash) {
          const cached = JSON.parse(rawDash);
          state.cutiLogs = cached.cutiLogs || [];
          state.stList = cached.stList || [];
          state.ipLogs = cached.ipLogs || [];
          state.ikLogs = cached.ikLogs || [];
          state.wfhLogs = cached.wfhLogs || [];
          state.isBgSyncDone = true;
          if (window.vueState) {
            window.vueState.cutiLogs = state.cutiLogs;
            window.vueState.stList = state.stList;
            window.vueState.ipLogs = state.ipLogs;
            window.vueState.ikLogs = state.ikLogs;
            window.vueState.wfhLogs = state.wfhLogs;
            window.vueState.isBgSyncDone = true;
          }
      if (typeof updateSyncStatus === 'function') updateSyncStatus('live');
        }
      } catch(e) {}
      toggleAppVisibility(true);

      if (state.user && typeof renderGlobalHeader === 'function') {
        renderGlobalHeader();
      }

      const lastMenu = localStorage.getItem('transkep_last_menu') || 'dashboard';
      if (typeof switchMenu === 'function') {
        switchMenu(lastMenu);
      }
      // Zero-Flicker Refresh: Langsung render dari cache lokal, background revalidation tanpa blocking spinner
      syncAllServerData(true);
    } else {
      toggleAppVisibility(false);
    }
  } catch (e) {
    console.error("❌ TRANSKEP Error Inisialisasi:", e);
    toggleAppVisibility(false);
  }
});

function toggleAppVisibility(isLoggedIn, animate) {
  const rootEl = document.documentElement;
  let loginSec = document.getElementById('login-section');
  let appCont = document.getElementById('app-container');
  const loader = document.getElementById('global-loader');

  const mobTop = document.getElementById('mobile-top-bar');
  const mobBottom = document.getElementById('mobile-bottom-nav');

  if (loader) {
    loader.classList.add('loader-hidden', 'hidden', 'opacity-0', 'pointer-events-none');
    loader.style.setProperty('display', 'none', 'important');
    rootEl.classList.add('app-loaded');
  }

  if (!loginSec) {
    const passInput = document.querySelector('input[type="password"]');
    if (passInput) loginSec = passInput.closest('div.min-h-screen') || (passInput.closest('form') && passInput.closest('form').parentElement && passInput.closest('form').parentElement.parentElement);
  }
  if (!appCont) {
    appCont = document.getElementById('main-content') || document.querySelector('main');
    if (appCont && appCont.tagName === 'MAIN') appCont = appCont.parentElement;
  }

  if (isLoggedIn) {
    rootEl.classList.add('app-authenticated');
    rootEl.classList.remove('app-unauthenticated');

    if (animate && loginSec && appCont) {
      loginSec.classList.add('auth-fade-out');
      appCont.classList.remove('hidden');
      appCont.style.display = '';
      appCont.classList.add('app-fade-in');
      if (mobTop) { 
        mobTop.classList.remove('hidden'); 
        mobTop.removeAttribute('v-cloak');
        mobTop.classList.add('app-fade-in'); 
      }
      if (mobBottom) { 
        mobBottom.classList.remove('hidden'); 
        mobBottom.classList.add('app-fade-in'); 
      }
      if (typeof updateMobileProfileUI === 'function') updateMobileProfileUI();

      setTimeout(() => {
        loginSec.classList.add('hidden');
        loginSec.style.display = 'none';
        loginSec.classList.remove('auth-fade-out');
        appCont.classList.remove('app-fade-in');
        if (mobTop) mobTop.classList.remove('app-fade-in');
        if (mobBottom) mobBottom.classList.remove('app-fade-in');
      }, 350);
    } else {
      if (loginSec) { loginSec.classList.add('hidden'); loginSec.style.display = 'none'; }
      if (appCont) { appCont.classList.remove('hidden'); appCont.style.display = ''; }
      if (mobTop) { 
        mobTop.classList.remove('hidden'); 
        mobTop.removeAttribute('v-cloak');
      }
      if (mobBottom) { mobBottom.classList.remove('hidden'); }
      if (typeof updateMobileProfileUI === 'function') updateMobileProfileUI();
    }
  } else {
    rootEl.classList.remove('app-authenticated');
    rootEl.classList.add('app-unauthenticated');

    if (typeof resetLoginFormUI === 'function') {
      resetLoginFormUI();
    }

    if (animate && loginSec && appCont) {
      appCont.classList.add('auth-fade-out');
      setTimeout(() => {
        if (appCont) { appCont.classList.add('hidden'); appCont.style.display = 'none'; appCont.classList.remove('auth-fade-out'); }
        if (mobTop) { mobTop.classList.add('hidden'); }
        if (mobBottom) { mobBottom.classList.add('hidden'); }
        if (loginSec) {
          loginSec.classList.remove('hidden');
          loginSec.style.display = '';
          loginSec.classList.add('app-fade-in');
          setTimeout(() => loginSec.classList.remove('app-fade-in'), 350);
        }
      }, 250);
    } else {
      if (loginSec) { loginSec.classList.remove('hidden'); loginSec.style.display = ''; }
      if (appCont) { appCont.classList.add('hidden'); appCont.style.display = 'none'; }
      if (mobTop) { mobTop.classList.add('hidden'); }
      if (mobBottom) { mobBottom.classList.add('hidden'); }
    }
  }
}

function resetLoginFormUI() {
  const btnSubmit = document.getElementById('btnLoginSubmit') || (document.getElementById('loginForm') && document.getElementById('loginForm').querySelector('button[type="submit"]'));
  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.innerHTML = 'Masuk Aplikasi <i class="fa-solid fa-arrow-right-to-bracket transition-transform duration-300 group-hover:translate-x-1"></i>';
  }
  const passInput = document.getElementById('loginPass');
  if (passInput) passInput.value = '';

  const nipInput = document.getElementById('loginNip');
  const rememberCheckbox = document.getElementById('rememberMe');
  const isRemembered = localStorage.getItem('transkep_remember_me') === 'true';
  const rememberedNip = localStorage.getItem('transkep_remember_nip') || '';

  if (rememberCheckbox) {
    rememberCheckbox.checked = isRemembered;
  }

  if (nipInput) {
    if (isRemembered && rememberedNip) {
      nipInput.value = rememberedNip;
      if (passInput) setTimeout(() => passInput.focus(), 150);
    } else {
      nipInput.value = '';
      setTimeout(() => nipInput.focus(), 150);
    }
  }
}
window.resetLoginFormUI = resetLoginFormUI;

function handleLogin(event) {
  if (event) event.preventDefault();

  let nipInput = document.getElementById('loginNip');
  let passInput = document.getElementById('loginPass');
  if (!nipInput || !passInput) {
    nipInput = document.querySelector('input[type="text"], input[type="number"]');
    passInput = document.querySelector('input[type="password"]');
  }
  if (!nipInput || !passInput) return;

  const nip = nipInput.value.trim();
  const pass = passInput.value.trim();

  if (!nip || !pass) {
    showNotify("Perhatian", "NIP dan Kata Sandi wajib diisi!", "error");
    return;
  }

  const btnSubmit = document.getElementById('btnLoginSubmit') || (document.getElementById('loginForm') && document.getElementById('loginForm').querySelector('button[type="submit"]'));
  const originalBtnHtml = btnSubmit ? btnSubmit.innerHTML : '';

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-2"></i><span>Memverifikasi...</span>';
  }

  const resetBtn = () => {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = originalBtnHtml;
    }
  };

  const handleSuccess = function (response) {
    if (response && (response.status === 'success' || response.status === 'UPDATED')) {
      if (response.version) {
        localStorage.setItem('TRANSKEP_DATA_VERSION', response.version);
      }
      if (btnSubmit) {
        btnSubmit.innerHTML = '<i class="fa-solid fa-circle-check mr-2 text-emerald-400"></i><span>Berhasil!</span>';
      }
      localStorage.setItem('transkep_active_nip', response.data.nip);
      localStorage.setItem('transkep_session_token', response.token);
      localStorage.setItem('transkep_user_nama', response.data.nama || '');
      localStorage.setItem('transkep_user_role', response.data.role || '');
      try {
        localStorage.setItem('transkep_user_profile', JSON.stringify(response.data));
        localStorage.setItem('transkep_user', JSON.stringify(response.data));
      } catch (e) {
        console.warn("Gagal menyimpan transkep_user_profile ke localStorage:", e);
      }

      // Kunci Integritas Sesi (Anti-Tamper Sealing)
      if (typeof SessionIntegrityGuard !== 'undefined') {
        SessionIntegrityGuard.sealSession(response.data.nip, response.data.role || '', response.token);
      }
      // Zero-Leakage: Bersihkan input kata sandi dari memori DOM
      if (passInput) passInput.value = '';

      window.vueState.user = response.data;
      if (typeof state !== 'undefined') state.user = response.data;
      if (typeof renderGlobalHeader === 'function') {
        renderGlobalHeader();
      }

      const isTemporary = !!(response.must_change_password || (typeof pass === 'string' && /^TR-\d{6}$/.test(pass.trim())));
      if (isTemporary) {
        localStorage.setItem('transkep_force_change_password', pass.trim());
        setTimeout(() => {
          if (typeof window.openChangePasswordModal === 'function') {
            window.openChangePasswordModal(pass.trim(), true);
          }
        }, 300);
      }

      // Tangani status Ingatkan Saya (Remember Me - Simpan NIP saja secara aman)
      const rememberCheckbox = document.getElementById('rememberMe');
      if (rememberCheckbox && rememberCheckbox.checked) {
        localStorage.setItem('transkep_remember_me', 'true');
        localStorage.setItem('transkep_remember_nip', response.data.nip);
      } else {
        localStorage.removeItem('transkep_remember_me');
        localStorage.removeItem('transkep_remember_nip');
      }

      // Transisi sinematik halus
      toggleAppVisibility(true, true);
      syncAllServerData(true);
      showNotify("Login Berhasil", `Selamat datang kembali, ${response.data.nama}`, "success");
    } else {
      resetBtn();
      showNotify("Akses Ditolak", response ? response.message : "Tidak ada respon server", "error");
    }
  };

  const handleFailure = function (error) {
    resetBtn();
    showNotify("Error Server", (error && error.message) ? error.message : "Gagal menghubungi server", "error");
  };

  if (typeof TranskepAPI !== 'undefined' && typeof TranskepAPI.call === 'function') {
    TranskepAPI.call('verifyLogin', nip, pass)
      .then(handleSuccess)
      .catch(handleFailure);
  } else if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(handleSuccess)
      .withFailureHandler(handleFailure)
      .verifyLogin(nip, pass);
  } else {
    resetBtn();
    showNotify("Error", "Koneksi server tidak terdeteksi", "error");
  }
}

function handleLogout() {
  const activeNip = localStorage.getItem('transkep_active_nip');
  const sessionToken = localStorage.getItem('transkep_session_token');

  if (activeNip && sessionToken) {
    try {
      google.script.run.logoutSession(activeNip, sessionToken);
    } catch (err) {
      console.warn("Server logout trigger error:", err);
    }
  }

  if (typeof SessionIntegrityGuard !== 'undefined' && typeof SessionIntegrityGuard.resetSession === 'function') {
    SessionIntegrityGuard.resetSession();
  }

  localStorage.removeItem('transkep_active_nip');
  localStorage.removeItem('transkep_last_menu');
  localStorage.removeItem('transkep_session_token');
  localStorage.removeItem('transkep_user_nama');
  localStorage.removeItem('transkep_user_role');
  localStorage.removeItem('transkep_user_profile');
  localStorage.removeItem('transkep_user');
  localStorage.removeItem('transkep_force_change_password');
  localStorage.removeItem('transkep_session_sig');

  window.vueState.currentMenu = 'dashboard';
  window.vueState.user = null;
  window.vueState.rendered = {};
  window.vueState.isBgSyncDone = false;

  // Reset status tombol login ke 'Masuk Aplikasi' & pulihkan NIP jika Ingatkan Saya aktif
  if (typeof resetLoginFormUI === 'function') {
    resetLoginFormUI();
  }

  toggleAppVisibility(false);
  showNotify("Sesi Berakhir", "Anda telah berhasil keluar dari sistem.", "success");
}

// =========================================================
// NON-BLOCKING SYNC STATUS BADGE (TAHAP 1)
// =========================================================
// =========================================================
// SMART DOM DIFFING & TABLE PATCHING HELPER (TAHAP 3)
// =========================================================
// =========================================================
// OPTIMISTIC UI MUTATION RUNNER (TAHAP 4)
// =========================================================
window.runOptimisticMutation = function(options) {
  const {
    applyLocal,
    rollbackLocal,
    remoteCall,
    successToast,
    onSuccess,
    onError
  } = options || {};

  try {
    if (typeof applyLocal === 'function') applyLocal();
  } catch (err) {
    console.error("❌ [OptimisticUI] Error executing applyLocal:", err);
  }

  try {
    const s = window.vueState || window.state;
    if (s) {
      localStorage.setItem('transkep_dashboard_cache', JSON.stringify({
        cutiLogs: s.cutiLogs,
        stList: s.stList,
        ipLogs: s.ipLogs,
        ikLogs: s.ikLogs,
        wfhLogs: s.wfhLogs
      }));
      if (s.usersList) localStorage.setItem('transkep_users_cache', JSON.stringify(s.usersList));
      if (s.user) localStorage.setItem('transkep_user_profile', JSON.stringify(s.user));
    }
  } catch(e) {}

  if (successToast && typeof window.showNotify === 'function') {
    if (typeof successToast === 'string') {
      window.showNotify("Tersimpan (0ms)", successToast, "success");
    } else {
      window.showNotify(successToast.title || "Tersimpan (0ms)", successToast.msg || "Perubahan diterapkan.", "success");
    }
  }

  const p = (typeof remoteCall === 'function') ? remoteCall() : remoteCall;
  if (p && typeof p.then === 'function') {
    return p
      .then((res) => {
        if (res && res.status === 'error') {
          throw new Error(res.message || 'Server mengembalikan error');
        }
        if (typeof onSuccess === 'function') onSuccess(res);
        try {
          const s = window.vueState || window.state;
          if (s) {
            localStorage.setItem('transkep_dashboard_cache', JSON.stringify({
              cutiLogs: s.cutiLogs,
              stList: s.stList,
              ipLogs: s.ipLogs,
              ikLogs: s.ikLogs,
              wfhLogs: s.wfhLogs
            }));
          }
        } catch(e) {}
        return res;
      })
      .catch((err) => {
        console.warn("⚠️ [OptimisticUI] Server call failed, performing rollback:", err);
        try {
          if (typeof rollbackLocal === 'function') rollbackLocal();
        } catch(rbErr) {
          console.error("❌ [OptimisticUI] Rollback failed:", rbErr);
        }
        try {
          const s = window.vueState || window.state;
          if (s) {
            localStorage.setItem('transkep_dashboard_cache', JSON.stringify({
              cutiLogs: s.cutiLogs,
              stList: s.stList,
              ipLogs: s.ipLogs,
              ikLogs: s.ikLogs,
              wfhLogs: s.wfhLogs
            }));
          }
        } catch(e) {}
        if (typeof onError === 'function') onError(err);
        if (typeof window.showNotify === 'function') {
          window.showNotify("Sinkronisasi Gagal", (err.message || err.toString()) + " (Perubahan dikembalikan)", "error");
        }
      });
  }
};

window.smartPatchTable = function(tbodyOrId, newItems, rowRendererFn, idKey = 'id') {
  const tbody = typeof tbodyOrId === 'string' ? document.getElementById(tbodyOrId) : tbodyOrId;
  if (!tbody) return;

  window.requestAnimationFrame(() => {
    const existingRows = Array.from(tbody.querySelectorAll('tr[data-id]'));
    const existingMap = new Map();
    existingRows.forEach(tr => existingMap.set(String(tr.dataset.id), tr));

    const container = tbody.closest('.overflow-y-auto') || tbody.closest('.overflow-auto');
    const prevScrollTop = container ? container.scrollTop : null;

    if (existingRows.length === 0) {
      let fullHtml = '';
      newItems.forEach(item => { fullHtml += rowRendererFn(item); });
      tbody.innerHTML = fullHtml;
      return;
    }

    const processedIds = new Set();
    newItems.forEach((item, index) => {
      const idVal = String(item[idKey] || item.nip || item.id_tugas || index);
      processedIds.add(idVal);

      if (existingMap.has(idVal)) {
        const existingRow = existingMap.get(idVal);
        const tempDiv = document.createElement('tbody');
        tempDiv.innerHTML = rowRendererFn(item);
        const newRow = tempDiv.firstElementChild;
        if (newRow && existingRow.innerHTML !== newRow.innerHTML) {
          existingRow.innerHTML = newRow.innerHTML;
          existingRow.classList.add('row-highlight-new');
          setTimeout(() => existingRow.classList.remove('row-highlight-new'), 2000);
        }
      } else {
        const tempDiv = document.createElement('tbody');
        tempDiv.innerHTML = rowRendererFn(item);
        const newRow = tempDiv.firstElementChild;
        if (newRow) {
          newRow.classList.add('row-highlight-new');
          if (index === 0 && tbody.firstElementChild) {
            tbody.insertBefore(newRow, tbody.firstElementChild);
          } else {
            tbody.appendChild(newRow);
          }
          setTimeout(() => newRow.classList.remove('row-highlight-new'), 2000);
        }
      }
    });

    existingRows.forEach(tr => {
      if (!processedIds.has(String(tr.dataset.id))) {
        tr.remove();
      }
    });

    if (prevScrollTop !== null && container) {
      container.scrollTop = prevScrollTop;
    }
  });
};

window.updateSyncStatus = function(status) {
  const badgeDesktop = document.getElementById('sync-status-badge');
  const badgeMobile = document.getElementById('mobile-sync-badge');

  let htmlDesktop = '';
  let htmlMobile = '';

  if (status === 'syncing') {
    // SILENT BACKGROUND SYNC: Berjalan murni di latar belakang tanpa badge kuning
    htmlDesktop = '';
    htmlMobile = '';
  } else if (status === 'live') {
    // Sinkronisasi selesai senyap & tenang
    htmlDesktop = '';
    htmlMobile = '';
  } else if (status === 'offline') {
    htmlDesktop = '<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium bg-rose-500/10 text-rose-300 border border-rose-500/20 shadow-sm shadow-rose-500/5 transition-all duration-300"><i class="fa-solid fa-triangle-exclamation text-[10px]"></i> Offline (Cache)</span>';
    htmlMobile = '<span class="inline-flex items-center gap-1 text-[9px] text-rose-300"><i class="fa-solid fa-wifi text-[8px]"></i> Offline</span>';
  }

  if (badgeDesktop) badgeDesktop.innerHTML = htmlDesktop;
  if (badgeMobile) badgeMobile.innerHTML = htmlMobile;
};

let gSyncWatchdog = null;

function syncAllServerData(silent) {
  if (gSyncWatchdog) clearTimeout(gSyncWatchdog);
  // Safe Fallback Watchdog Timer (8 detik): menjamin layar tidak pernah terjebak loading
  gSyncWatchdog = setTimeout(() => {
    console.warn("⚠️ Watchdog: Menutup paksa loader setelah 8 detik.");
    if (typeof hideLoading === 'function') hideLoading();
  }, 8000);

  const isSilent = (silent === true);
  if (!isSilent) showLoading("Menyelaraskan data sistem kepegawaian...");
  if (typeof updateSyncStatus === 'function') updateSyncStatus('syncing');
  const loginNip = localStorage.getItem('transkep_active_nip');
  const sessionToken = localStorage.getItem('transkep_session_token');
  const clientVersion = localStorage.getItem('TRANSKEP_DATA_VERSION') || '';

  if (!loginNip || !sessionToken) {
    if (gSyncWatchdog) { clearTimeout(gSyncWatchdog); gSyncWatchdog = null; }
    if (typeof hideLoading === 'function') hideLoading();
    handleLogout();
    return;
  }

  const handleSuccess = function (response) {
    if (response && response.status === 'NOT_MODIFIED') {
      console.log(`⚡ [Delta Sync] Bulk data sama dengan server (v${response.version}). Short-circuit 0ms.`);
      syncBackgroundData();
      return;
    }

    // JANGAN panggil hideLoading() di sini agar overlay menahan layar sampai syncBackgroundData selesai
    if (response && response.status === 'success') {
      state.user = response.data.user;
      if (state.user) {
        if (state.user.role) {
          localStorage.setItem('transkep_user_role', state.user.role);
        }
        try {
          localStorage.setItem('transkep_user_profile', JSON.stringify(state.user));
          localStorage.setItem('transkep_user', JSON.stringify(state.user));
        } catch (e) {
          console.warn("Gagal menyimpan transkep_user_profile ke localStorage:", e);
        }
      }
      state.usersList = response.data.usersList;
      try {
        localStorage.setItem('transkep_users_cache', JSON.stringify(state.usersList));
      } catch(e) {}
      state.pendingPkpCount = response.data.pendingPkpCount || 0;
      state.isBgSyncDone = false;

      if (window.vueState) {
        window.vueState.user = state.user;
        window.vueState.usersList = state.usersList;
        window.vueState.pendingPkpCount = state.pendingPkpCount;
        window.vueState.isBgSyncDone = false;
      }

      if (typeof renderGlobalHeader === 'function') {
        renderGlobalHeader();
      }

      initNavigationAccess();

      const currentActiveMenu = (window.vueState && window.vueState.currentMenu) || localStorage.getItem('transkep_last_menu') || 'dashboard';
      if (typeof switchMenu === 'function') {
        switchMenu(currentActiveMenu);
      }
      if (currentActiveMenu === 'dashboard' && typeof renderDashboardView === 'function') {
        renderDashboardView();
      }

      updateSidebarBadges();
      syncBackgroundData();

      // Mandat ganti sandi sementara jika terdeteksi dari server atau storage
      const tempPass = (response.data && response.data.temp_pass) || localStorage.getItem('transkep_force_change_password') || '';
      const isMustChange = !!((response.data && response.data.must_change_password) || tempPass);
      if (isMustChange) {
        if (tempPass) localStorage.setItem('transkep_force_change_password', tempPass);
        setTimeout(() => {
          if (typeof window.openChangePasswordModal === 'function') {
            window.openChangePasswordModal(tempPass, true);
          }
        }, 500);
      }

    } else {
      if (gSyncWatchdog) { clearTimeout(gSyncWatchdog); gSyncWatchdog = null; }
      hideLoading();
      if (!isSilent) {
        showNotify("Gagal Sinkronisasi", response ? response.message : "Data bermasalah", "error");
        handleLogout();
      } else {
        if (response && (response.message === 'Invalid session' || response.status === 'unauthorized' || response.code === 401)) {
          handleLogout();
        }
      }
    }
  };

  const handleFailure = function (error) {
    if (gSyncWatchdog) { clearTimeout(gSyncWatchdog); gSyncWatchdog = null; }
    hideLoading();
    if (typeof updateSyncStatus === 'function') updateSyncStatus('offline');
    if (!isSilent) {
      showNotify("Terputus dari Server", (error && error.message) ? error.message : "Gagal sinkronisasi", "error");
      handleLogout();
    }
  };

  if (typeof TranskepAPI !== 'undefined' && typeof TranskepAPI.call === 'function') {
    TranskepAPI.call('getBulkData', loginNip, sessionToken, clientVersion)
      .then(handleSuccess)
      .catch(handleFailure);
  } else if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(handleSuccess)
      .withFailureHandler(handleFailure)
      .getBulkData(loginNip, sessionToken, clientVersion);
  }
}

function syncBackgroundData() {
  const loginNip = localStorage.getItem('transkep_active_nip');
  const sessionToken = localStorage.getItem('transkep_session_token');
  const clientVersion = localStorage.getItem('TRANSKEP_DATA_VERSION') || '';
  if (!loginNip || !sessionToken) {
    if (gSyncWatchdog) { clearTimeout(gSyncWatchdog); gSyncWatchdog = null; }
    hideLoading();
    return;
  }

  const handleSuccess = function (res) {
    if (gSyncWatchdog) { clearTimeout(gSyncWatchdog); gSyncWatchdog = null; }

    // SHORT-CIRCUIT DELTA SYNC:
    if (res && res.status === 'NOT_MODIFIED') {
      console.log(`⚡ [Delta Sync] Background data sama dengan server (v${res.version}). Zero DOM redraw.`);
      state.isBgSyncDone = true;
      if (window.vueState) window.vueState.isBgSyncDone = true;
      if (typeof updateSyncStatus === 'function') updateSyncStatus('live');
      hideLoading();
      return;
    }
    if (res && (res.status === 'success' || res.status === 'UPDATED') && res.data) {
      if (res.version) {
        localStorage.setItem('TRANSKEP_DATA_VERSION', res.version);
      }
      const d = res.data;
      state.cutiLogs = d.cutiLogs || [];
      state.stList = d.stList || [];
      state.ikLogs = d.ikLogs || [];
      state.ipLogs = d.ipLogs || [];
      state.wfhLogs = d.wfhLogs || [];
      state.jobdesList = d.jobdesList || [];
      state.skList = d.skList || [];
      state.skAckList = d.skAckList || [];
      state.kinerjaList = d.kinerjaList || [];
      state.sopList = d.sopList || [];
      state.sopAckList = d.sopAckList || [];
      state.masterKinerjaList = d.masterKinerjaList || [];
      state.isBgSyncDone = true;

      if (window.vueState) {
        window.vueState.cutiLogs = state.cutiLogs;
        window.vueState.stList = state.stList;
        window.vueState.ikLogs = state.ikLogs;
        window.vueState.ipLogs = state.ipLogs;
        window.vueState.wfhLogs = state.wfhLogs;
        window.vueState.jobdesList = state.jobdesList;
        window.vueState.skList = state.skList;
        window.vueState.skAckList = state.skAckList;
        window.vueState.kinerjaList = state.kinerjaList;
        window.vueState.sopList = state.sopList;
        window.vueState.sopAckList = state.sopAckList;
        window.vueState.masterKinerjaList = state.masterKinerjaList;
        window.vueState.isBgSyncDone = true;
      }

      // Simpan snapshot offline-first ke local storage
      try {
        localStorage.setItem('transkep_dashboard_cache', JSON.stringify({
          cutiLogs: state.cutiLogs,
          stList: state.stList,
          ikLogs: state.ikLogs,
          ipLogs: state.ipLogs,
          wfhLogs: state.wfhLogs,
          timestamp: Date.now()
        }));
      } catch(e) {}

      // Sinkronisasi data ke instance vmDashboard sebelum loader ditutup
      if (window.vmDashboard && typeof window.vmDashboard.syncFromGlobal === 'function') {
        window.vmDashboard.syncFromGlobal(state);
      }

      try {
        window.dispatchEvent(new CustomEvent('transkep:sync-complete', { detail: state }));
      } catch(e) {}

      updateSidebarBadges();
      if (typeof updateBadgePermohonan === 'function') updateBadgePermohonan();

      // SMART RAF BATCH RENDERING (TAHAP 3)
      window.requestAnimationFrame(() => {
        const cm = (window.vueState && window.vueState.currentMenu) || state.currentMenu || 'dashboard';
        if (cm === 'dashboard' && typeof renderDashboardView === 'function') renderDashboardView();
        if (cm === 'permohonan' && typeof renderPermohonanView === 'function') renderPermohonanView();
        if (cm === 'persetujuan' && typeof renderPersetujuanView === 'function') renderPersetujuanView();
        if (cm === 'rekapitulasi' && typeof renderRekapitulasiView === 'function') renderRekapitulasiView();
        if (cm === 'sk' && typeof renderSkView === 'function') renderSkView();
        if (cm === 'sop' && typeof renderSopView === 'function') renderSopView();
        if (cm === 'jobdes' && typeof renderJobdesView === 'function') renderJobdesView();
        if (cm === 'kinerja' && typeof renderKinerjaView === 'function') renderKinerjaView();
        if (cm === 'pkp' && typeof initPkpModule === 'function') initPkpModule();
        if (cm === 'eoffice' && typeof renderEofficeView === 'function') renderEofficeView();
        if (cm === 'manajemen' && window.vmPegawai && typeof window.vmPegawai.fetchResetQueue === 'function') window.vmPegawai.fetchResetQueue();
      });
    }
    // TRANSKEP: Pastikan hideLoading() SELALU dipanggil saat background sync selesai!
    hideLoading();
  };

  const handleFailure = function (err) {
    if (gSyncWatchdog) { clearTimeout(gSyncWatchdog); gSyncWatchdog = null; }
    console.warn("Background Sync Gagal: " + (err ? err.message : ""));
    state.isBgSyncDone = true;
    if (window.vueState) window.vueState.isBgSyncDone = true;
    if (window.vmDashboard && typeof window.vmDashboard.syncFromGlobal === 'function') {
      window.vmDashboard.syncFromGlobal(state);
    }
    try {
      window.dispatchEvent(new CustomEvent('transkep:sync-complete', { detail: state }));
    } catch(e) {}
    const cm = (window.vueState && window.vueState.currentMenu) || state.currentMenu || 'dashboard';
    if (cm === 'dashboard' && typeof renderDashboardView === 'function') renderDashboardView();
    hideLoading();
  };

  if (typeof TranskepAPI !== 'undefined' && typeof TranskepAPI.call === 'function') {
    TranskepAPI.call('getBackgroundData', loginNip, sessionToken, clientVersion)
      .then(handleSuccess)
      .catch(handleFailure);
  } else if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(handleSuccess)
      .withFailureHandler(handleFailure)
      .getBackgroundData(loginNip, sessionToken, clientVersion);
  }
}

function switchMenu(menuId) {
  try {
    if (state.user) {
      const role = state.user.role;
      if (menuId === 'persetujuan' && role !== 'Admin' && role !== 'Atasan Langsung' && role !== 'Pejabat Berwenang') {
        menuId = 'dashboard';
      }
      if (menuId === 'manajemen' && role !== 'Admin') {
        menuId = 'dashboard';
      }
      if (menuId === 'eoffice' && role !== 'Admin') {
        if (typeof showNotify === 'function') {
          showNotify("Akses Ditolak", "Menu E-Office hanya dapat diakses oleh Administrator.", "warning");
        }
        menuId = 'dashboard';
      }
    }

    window.vueState.currentMenu = menuId;
    localStorage.setItem('transkep_last_menu', menuId);

    document.querySelectorAll('.menu-section').forEach(function (el) {
      el.classList.add('hidden');
      el.classList.remove('block');
      el.classList.remove('flex');
    });

    var activeSection = document.getElementById('section-' + menuId);
    if (activeSection) {
      activeSection.classList.remove('hidden');
      if (menuId === 'permohonan' || menuId === 'pkp' || menuId === 'eoffice') {
        activeSection.classList.add('flex');
      } else {
        activeSection.classList.add('block');
      }
    }

    var skel = document.getElementById('app-skeleton') || document.getElementById('dashboard-skeleton');
    if (skel && activeSection) {
      skel.style.setProperty('display', 'none', 'important');
    }

    const navButtons = document.querySelectorAll('button[id^="nav-"]');
    navButtons.forEach(btn => {
      btn.classList.remove('w-[calc(100%+1rem)]', 'rounded-r-none', 'bg-gradient-to-r', 'from-transparent', 'to-cyan-500/10', 'text-white', 'border-r-4', 'border-cyan-400', 'border-r-cyan-400', 'shadow-[-8px_0_20px_rgba(34,211,238,0.15)]');
      btn.classList.remove('-mr-4', 'to-cyan-500/20', 'shadow-[-8px_0_20px_rgba(34,211,238,0.2)]');
      btn.classList.add('w-full', 'text-slate-400', 'hover:bg-slate-800/50', 'hover:text-slate-200', 'border-transparent', 'transition-all', 'duration-300', 'ease-out');

      const icon = btn.querySelector('i');
      if (icon) icon.classList.remove('drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]', 'text-cyan-400');
    });

    const activeNav = document.getElementById('nav-' + menuId);
    if (activeNav) {
      activeNav.classList.remove('w-full', 'text-slate-400', 'hover:bg-slate-800/50', 'hover:text-slate-200');
      activeNav.classList.add('w-[calc(100%+1rem)]', 'rounded-r-none', 'bg-gradient-to-r', 'from-transparent', 'to-cyan-500/10', 'text-white', 'border-r-4', 'border-r-cyan-400', 'shadow-[-8px_0_20px_rgba(34,211,238,0.15)]');

      const activeIcon = activeNav.querySelector('i');
      if (activeIcon) activeIcon.classList.add('drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]', 'text-cyan-400');
    }

    if (!window.vueState.rendered[menuId]) {
      if (menuId === 'dashboard' && typeof renderDashboardView === 'function') renderDashboardView();
      else if (menuId === 'permohonan' && typeof renderPermohonanView === 'function') renderPermohonanView();
      else if (menuId === 'persetujuan' && typeof renderPersetujuanView === 'function') renderPersetujuanView();
      else if (menuId === 'rekapitulasi' && typeof renderRekapitulasiView === 'function') renderRekapitulasiView();
      else if (menuId === 'jobdes' && typeof renderJobdesView === 'function') renderJobdesView();
      else if (menuId === 'pkp' && typeof initPkpModule === 'function') initPkpModule();
      else if (menuId === 'sk' && typeof renderSkView === 'function') renderSkView();
      else if (menuId === 'sop' && typeof renderSopView === 'function') renderSopView();
      else if (menuId === 'kinerja' && typeof renderKinerjaView === 'function') renderKinerjaView();
      else if (menuId === 'eoffice' && typeof renderEofficeView === 'function') renderEofficeView();
      else if (menuId === 'manajemen' && window.vmPegawai && typeof window.vmPegawai.fetchResetQueue === 'function') window.vmPegawai.fetchResetQueue();
      window.vueState.rendered[menuId] = true;
    } else {
      if (menuId === 'dashboard' && typeof renderDashboardView === 'function') {
        renderDashboardView();
      } else if (menuId === 'eoffice' && typeof window.refreshEofficeData === 'function') {
        window.refreshEofficeData();
      } else if (menuId === 'manajemen' && window.vmPegawai && typeof window.vmPegawai.fetchResetQueue === 'function') {
        window.vmPegawai.fetchResetQueue();
      }
    }

    if (typeof closeMobileSidebar === 'function' && window.innerWidth < 1024) {
      closeMobileSidebar();
    }

    if (typeof updateMobileNavIndicator === 'function') {
      updateMobileNavIndicator(menuId);
    }

  } catch (e) {
    console.error("Routing Error: ", e);
  }
}

function updateSidebarBadges() {
  try {
    if (!state.user) return;

    const userNip = String(state.user.nip).replace(/'/g, "").trim();
    const isNotSuperAdmin = state.user.role !== 'Admin';
    let unreadSopCount = 0;

    const ackSop = state.sopAckList || [];
    if (state.sopList && isNotSuperAdmin) {
      const involvedSops = state.sopList.filter(sop => {
        try {
          const arr = JSON.parse(sop.pelaksana_json || '[]');
          if (typeof cekKeterlibatanPegawai === 'function') {
            return cekKeterlibatanPegawai(arr, userNip).terlibat;
          }
          return arr.some(p => String(p.nip).replace(/'/g, "").trim() === userNip);
        } catch (e) { return false; }
      });

      involvedSops.forEach(sop => {
        const isAck = ackSop.some(a => String(a.sop_id).replace(/'/g, "").trim() === String(sop.id).replace(/'/g, "").trim() && String(a.nip).replace(/'/g, "").trim() === userNip);
        if (!isAck) unreadSopCount++;
      });
    }

    const badgeSop = document.getElementById('badge-sop-nav');
    if (badgeSop) {
      if (unreadSopCount > 0) {
        badgeSop.innerText = unreadSopCount > 99 ? '99+' : unreadSopCount;
        badgeSop.classList.remove('hidden');
      } else {
        badgeSop.classList.add('hidden');
      }
    }

    let unreadSkCount = 0;
    const ackSk = state.skAckList || [];

    if (state.skList && isNotSuperAdmin) {
      const skMap = {};
      state.skList.forEach(sk => {
        const baseSkId = String(sk.id).replace(/'/g, "").trim().split('-').slice(0, 2).join('-');
        if (!skMap[baseSkId]) skMap[baseSkId] = [];
        skMap[baseSkId].push({ nip: String(sk.nip).replace(/'/g, "").trim(), peran: '-' });
      });

      Object.keys(skMap).forEach(baseSkId => {
        const members = skMap[baseSkId];
        const isInvolved = (typeof cekKeterlibatanPegawai === 'function')
          ? cekKeterlibatanPegawai(members, userNip).terlibat
          : members.some(m => m.nip === userNip);

        if (isInvolved) {
          const isAck = ackSk.some(a => {
            const aBaseSkId = String(a.sk_id).replace(/'/g, "").trim().split('-').slice(0, 2).join('-');
            return aBaseSkId === baseSkId && String(a.nip).replace(/'/g, "").trim() === userNip;
          });
          if (!isAck) unreadSkCount++;
        }
      });
    }

    const badgeSk = document.getElementById('badge-sk-nav');
    if (badgeSk) {
      if (unreadSkCount > 0) {
        badgeSk.innerText = unreadSkCount > 99 ? '99+' : unreadSkCount;
        badgeSk.classList.remove('hidden');
      } else {
        badgeSk.classList.add('hidden');
      }
    }

    const badgePkp = document.getElementById('badge-pkp-nav');
    if (badgePkp) {
      const pkpCount = state.pendingPkpCount || 0;
      if (pkpCount > 0) {
        badgePkp.innerText = pkpCount > 99 ? '99+' : pkpCount;
        badgePkp.classList.remove('hidden');
      } else {
        badgePkp.classList.add('hidden');
      }
    }

  } catch (e) {
    console.error("Error updating badges:", e);
  }
}

function formatNamaBersih(namaLengkap) {
  if (!namaLengkap) return "-";
  let nama = namaLengkap.split(',')[0].trim();
  nama = nama.replace(/^(H\.|Hj\.|Drs\.|Dra\.|Ir\.|Prof\.|Dr\.)\s*/i, '').trim();
  return nama;
}

function showLoading(msg) {
  const loader = document.getElementById('global-loader');
  if (loader) {
    loader.classList.remove('loader-hidden', 'hidden', 'pointer-events-none');
    const subtitle = document.getElementById('loader-subtitle') || loader.querySelector('p') || loader.querySelector('span');
    if (subtitle && msg) subtitle.innerText = msg;
    loader.classList.add('active');
  }
}

function hideLoading() {
  const loader = document.getElementById('global-loader');
  document.documentElement.classList.add('app-loaded');
  if (loader) {
    loader.classList.remove('active');
    loader.classList.add('loader-hidden', 'pointer-events-none');
    setTimeout(() => {
      loader.classList.add('hidden');
    }, 300);
  }
}

function showNotify(title, message, type = 'success') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'fixed top-5 right-5 flex flex-col gap-3 pointer-events-none';
    toastContainer.style.setProperty('z-index', '9999999', 'important');
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  const isSuccess = type === 'success';
  const isWarning = type === 'warning';

  let borderColor = isSuccess ? 'border-emerald-500/30' : 'border-rose-500/30';
  let iconColor = isSuccess ? 'text-emerald-400' : 'text-rose-400';
  let iconClass = isSuccess ? 'fa-circle-check' : 'fa-circle-xmark';
  let bgColor = isSuccess ? 'bg-emerald-500/10' : 'bg-rose-500/10';

  if (isWarning) {
    borderColor = 'border-amber-500/30';
    iconColor = 'text-amber-400';
    iconClass = 'fa-triangle-exclamation';
    bgColor = 'bg-amber-500/10';
  }

  toast.className = `glass p-4 rounded-2xl border ${borderColor} bg-slate-900/90 shadow-2xl flex items-start gap-3 w-80 transform transition-all duration-300 translate-x-full opacity-0 pointer-events-auto`;

  toast.innerHTML = `
    <div class="mt-0.5 ${iconColor} ${bgColor} p-1.5 rounded-lg shrink-0">
      <i class="fa-solid ${iconClass} text-lg"></i>
    </div>
    <div>
      <h4 class="text-sm font-bold text-slate-200">${title}</h4>
      <p class="text-xs text-slate-400 mt-1 leading-relaxed">${message}</p>
    </div>
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-x-full', 'opacity-0');
    toast.classList.add('translate-x-0', 'opacity-100');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('translate-x-0', 'opacity-100');
    toast.classList.add('translate-x-full', 'opacity-0');

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 300);
  }, 3500);
}

// TRANSKEP: Modal Konfirmasi Universal (Anti-AI Human-Crafted Look & Feel)
function showCustomConfirm(title, message, onConfirm) {
  if (typeof document === 'undefined' || !document.body) {
    if (confirm(title + "\n\n" + message)) {
      if (typeof onConfirm === 'function') onConfirm();
    }
    return;
  }

  let overlay = document.getElementById('custom-confirm-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'custom-confirm-overlay';
  overlay.className = 'fixed inset-0 z-[999999] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-200 opacity-0';

  overlay.innerHTML = `
    <div class="glass p-6 rounded-3xl border border-slate-800 bg-slate-900/95 max-w-sm w-full mx-4 shadow-2xl transform transition-all duration-200 scale-95 flex flex-col gap-4">
      <div class="flex items-center gap-3 text-rose-400">
        <div class="p-2.5 bg-rose-500/10 rounded-2xl shrink-0 border border-rose-500/20"><i class="fa-solid fa-triangle-exclamation text-xl"></i></div>
        <h3 class="text-base font-bold text-white tracking-wide">${title}</h3>
      </div>
      <p class="text-xs text-slate-300 leading-relaxed">${message}</p>
      <div class="flex justify-end gap-2.5 mt-2 pt-2 border-t border-slate-800/80">
        <button id="btn-confirm-cancel" class="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition">Batal</button>
        <button id="btn-confirm-yes" class="px-4 py-2.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 transition flex items-center gap-1.5">
          <i class="fa-solid fa-check text-[11px]"></i> Ya, Lanjutkan
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  setTimeout(() => {
    overlay.classList.remove('opacity-0');
    if (overlay.firstElementChild) overlay.firstElementChild.classList.remove('scale-95');
  }, 10);

  const cleanup = () => {
    overlay.classList.add('opacity-0');
    if (overlay.firstElementChild) overlay.firstElementChild.classList.add('scale-95');
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 200);
  };

  const cancelBtn = document.getElementById('btn-confirm-cancel');
  if (cancelBtn) cancelBtn.onclick = cleanup;

  const yesBtn = document.getElementById('btn-confirm-yes');
  if (yesBtn) {
    yesBtn.onclick = () => {
      cleanup();
      if (typeof onConfirm === 'function') onConfirm();
    };
  }
}

// Ekspos ke global window
if (typeof window !== 'undefined') {
  window.showNotify = showNotify;
  window.showCustomConfirm = showCustomConfirm;
}

function initNavigationAccess() {
  try {
    const role = state.user ? state.user.role : '';
    const menuManajemen = document.getElementById('nav-manajemen');
    const menuPersetujuan = document.getElementById('nav-persetujuan');
    const menuEoffice = document.getElementById('nav-eoffice');

    if (menuManajemen) {
      if (role === 'Admin') { menuManajemen.classList.remove('hidden'); menuManajemen.style.display = ''; }
      else { menuManajemen.classList.add('hidden'); menuManajemen.style.display = 'none'; }
    }
    if (menuPersetujuan) {
      if (role === 'Admin' || role === 'Atasan Langsung' || role === 'Pejabat Berwenang') { menuPersetujuan.classList.remove('hidden'); menuPersetujuan.style.display = ''; }
      else { menuPersetujuan.classList.add('hidden'); menuPersetujuan.style.display = 'none'; }
    }
    if (menuEoffice) {
      if (role === 'Admin') { menuEoffice.classList.remove('hidden'); menuEoffice.style.display = ''; }
      else { menuEoffice.classList.add('hidden'); menuEoffice.style.display = 'none'; }
    }
  } catch (e) { }
}

function updateThemeIcon() {
  const isLight = document.body.classList.contains('light-mode');
  const themeIcons = document.querySelectorAll('#mobile-theme-icon, .theme-toggle-icon');
  themeIcons.forEach(icon => {
    if (isLight) {
      icon.className = 'fa-solid fa-moon text-sm text-indigo-400';
    } else {
      icon.className = 'fa-solid fa-sun text-sm text-amber-400';
    }
  });

  const btnTheme = document.getElementById('btn-theme-mobile');
  if (btnTheme) {
    if (isLight) {
      btnTheme.className = 'w-9 h-9 shrink-0 flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 hover:text-indigo-300 rounded-xl transition-all duration-300 shadow-sm shadow-indigo-500/5 active:scale-95';
      btnTheme.title = 'Beralih ke Mode Gelap';
    } else {
      btnTheme.className = 'w-9 h-9 shrink-0 flex items-center justify-center bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 hover:text-amber-300 rounded-xl transition-all duration-300 shadow-sm shadow-amber-500/5 active:scale-95';
      btnTheme.title = 'Beralih ke Mode Terang';
    }
  }
}

function toggleThemeMode() {
  const body = document.body;
  body.classList.toggle('light-mode');

  if (body.classList.contains('light-mode')) {
    localStorage.setItem('transkep_theme', 'light');
    showNotify("Mode Terang Aktif", "Tampilan Light Glass yang segar telah diterapkan!", "success");
  } else {
    localStorage.setItem('transkep_theme', 'dark');
    showNotify("Mode Gelap Aktif", "Tampilan Dark Glass yang elegan telah diterapkan!", "success");
  }
  updateThemeIcon();
}

// Inisialisasi Vue untuk Modal Global (Sisa Cuti & Ubah Password)
document.addEventListener("DOMContentLoaded", () => {
  const modalContainer = document.getElementById('vue-global-modals');
  if (modalContainer) {
    window.vmGlobalModals = Vue.createApp({
      data() {
        return {
          currentUser: null,
          showModalSisaCuti: false,
          showModalPassword: false,
          isMandatory: false,
          formPass: { old: '', new: '', confirm: '' },
          showOldPass: false, showNewPass: false, showConfirmPass: false
        };
      },
      methods: {
        cancelPasswordModal() {
          if (this.isMandatory) {
            if (window.showCustomConfirm) {
              window.showCustomConfirm(
                "Tunda Buat Sandi Baru?",
                "Perhatian: Akun Anda masih menggunakan sandi sementara WhatsApp yang rentan. Yakin ingin menunda pembuatan sandi baru?",
                () => {
                  this.showModalPassword = false;
                  localStorage.removeItem('transkep_force_change_password');
                }
              );
            } else {
              this.showModalPassword = false;
              localStorage.removeItem('transkep_force_change_password');
            }
          } else {
            this.showModalPassword = false;
          }
        },
        submitPassword() {
          if (this.formPass.new !== this.formPass.confirm) {
            showNotify("Validasi Gagal", "Konfirmasi sandi baru tidak sama.", "error");
            return;
          }
          if (this.formPass.new.length < 5) {
            showNotify("Sandi Terlalu Pendek", "Gunakan minimal 5 karakter.", "warning");
            return;
          }
          if (this.formPass.old === this.formPass.new) {
            showNotify("Perhatian", "Sandi baru tidak boleh sama persis dengan sandi lama.", "warning");
            return;
          }

          showLoading("Mencocokkan kredensial di database...");

          const nip = (this.currentUser && this.currentUser.nip) || localStorage.getItem('transkep_active_nip');
          const token = localStorage.getItem('transkep_session_token');

          google.script.run
            .withSuccessHandler((res) => {
              hideLoading();
              if (res && res.status === 'success') {
                this.showModalPassword = false;
                this.isMandatory = false;
                localStorage.removeItem('transkep_force_change_password');
                showNotify("Keamanan Diperbarui", "Sandi Anda telah berhasil diubah.", "success");
                this.formPass = { old: '', new: '', confirm: '' };
              } else {
                showNotify("Ditolak Server", res ? res.message : "Gagal mengubah kata sandi", "error");
              }
            })
            .withFailureHandler((err) => {
              hideLoading();
              showNotify("Error Jaringan", "Tidak dapat terhubung ke server: " + (err.message || ''), "error");
            })
            .changeMyPassword(nip, this.formPass.old, this.formPass.new, token);
        }
      }
    }).mount('#vue-global-modals');
  }
});

window.openModalSisaCuti = function () {
  if (!state || !state.user) {
    showNotify("Data Belum Siap", "Silakan tunggu hingga data selesai dimuat.", "warning");
    return;
  }
  if (window.vmGlobalModals) {
    window.vmGlobalModals.currentUser = state.user;
    window.vmGlobalModals.showModalSisaCuti = true;
  }
};

window.openChangePasswordModal = function (oldPass, isMandatory) {
  const currentUser = (state && state.user) || (window.vueState && window.vueState.user) || {
    nip: localStorage.getItem('transkep_active_nip') || '',
    nama: localStorage.getItem('transkep_user_nama') || 'Pegawai'
  };

  const storedTemp = localStorage.getItem('transkep_force_change_password') || '';
  const finalOldPass = oldPass || storedTemp || '';

  if (window.vmGlobalModals) {
    window.vmGlobalModals.currentUser = currentUser;
    window.vmGlobalModals.formPass = { old: finalOldPass, new: '', confirm: '' };
    window.vmGlobalModals.isMandatory = (isMandatory !== undefined) ? !!isMandatory : Boolean(storedTemp);
    window.vmGlobalModals.showOldPass = false;
    window.vmGlobalModals.showNewPass = false;
    window.vmGlobalModals.showConfirmPass = false;
    window.vmGlobalModals.showModalPassword = true;
  }
};

// =========================================================
// KOMPONEN: GLOBAL HEADER PROFIL
// =========================================================
function renderGlobalHeader() {
  if (!state.user) {
    try {
      const rawUser = localStorage.getItem('transkep_user_profile') || localStorage.getItem('transkep_user');
      if (rawUser) {
        state.user = JSON.parse(rawUser);
        if (window.vueState) window.vueState.user = state.user;
      }
    } catch (e) {}
  }
  if (!state.user) return;
  const viewContainer = document.getElementById('view-container');
  if (!viewContainer) return;

  let headerDiv = document.getElementById('global-profile-header');

  if (!headerDiv) {
    headerDiv = document.createElement('div');
    headerDiv.id = 'global-profile-header';
    headerDiv.className = 'w-full mb-6 no-print';
    headerDiv.setAttribute('v-cloak', '');
    viewContainer.insertBefore(headerDiv, viewContainer.firstChild);

    headerDiv.innerHTML = `
      <div class="glass p-6 rounded-[24px] border border-slate-800/60 bg-slate-900/50 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl relative overflow-hidden">
         <div class="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent pointer-events-none"></div>
         <div class="flex items-center gap-5 w-full md:w-auto relative z-10">
            
            <div class="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-indigo-500/30 shrink-0 border border-indigo-400/30 bg-gradient-to-br from-indigo-500 to-purple-600 relative overflow-hidden group">
               <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
               <span class="relative z-10 drop-shadow-md tracking-wider">{{ userInitials }}</span>
            </div>

            <div class="flex-1">
               <h2 class="text-xl md:text-2xl font-bold text-white tracking-wide">{{ currentUser.nama }}</h2>
               <p class="text-slate-400 text-xs md:text-sm mb-2 font-medium">{{ currentUser.jabatan }}</p>
               <div class="flex flex-wrap items-center gap-3 mt-1">
                  <span class="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] font-mono font-medium text-white tracking-wide shadow-sm shadow-emerald-500/5">NIP: {{ currentUser.nip }}</span>
                  <span class="px-3 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-xl text-[11px] font-medium text-white tracking-wide shadow-sm shadow-purple-500/5">{{ currentUser.pangkat || '-' }}</span>
               </div>
            </div>
         </div>
         <div class="flex items-center gap-4 w-full md:w-auto justify-end border-t md:border-t-0 border-slate-800/60 pt-4 md:pt-0 relative z-10">
             <div id="sync-status-badge" class="inline-flex items-center"></div>
             <div class="flex items-center gap-2">
               <button @click="openMobileSidebar" title="Buka Menu" class="lg:hidden w-12 h-12 shrink-0 flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500 border border-indigo-500/20 hover:border-indigo-500 text-indigo-400 hover:text-white rounded-xl transition-all duration-300 shadow-lg shadow-indigo-500/10">
                  <i class="fa-solid fa-bars-staggered text-lg"></i>
               </button>
               <button @click="openChangePassword" title="Ganti Kata Sandi" class="w-12 h-12 shrink-0 flex items-center justify-center bg-purple-500/10 hover:bg-purple-500 border border-purple-500/20 hover:border-purple-500 text-purple-400 hover:text-white rounded-xl transition-all duration-300 shadow-lg shadow-purple-500/10">
                  <i class="fa-solid fa-key text-lg"></i>
               </button>
               <button @click="logout" title="Keluar Sistem" class="w-12 h-12 shrink-0 flex items-center justify-center bg-rose-500/10 hover:bg-rose-500 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white rounded-xl transition-all duration-300 shadow-lg shadow-rose-500/10">
                  <i class="fa-solid fa-power-off text-lg"></i>
               </button>
            </div>
         </div>
      </div>
    `;

    window.vmGlobalHeader = Vue.createApp({
      data() {
        return { currentUser: state.user };
      },
      computed: {
        userInitials() {
          if (!this.currentUser) return "ID";
          let cleanName = this.currentUser.nama.split(',')[0].replace(/\b(Drs|Dr|H|Hj)\b\.?\s*/gi, '').trim();
          let words = cleanName.split(' ');
          let initials = "";
          if (words.length > 0) initials += words[0].charAt(0).toUpperCase();
          if (words.length > 1) initials += words[1].charAt(0).toUpperCase();
          return initials || "ID";
        }
      },
      methods: {
        openMobileSidebar() { if (window.openMobileSidebar) window.openMobileSidebar(); },
        openChangePassword() { if (window.openChangePasswordModal) window.openChangePasswordModal(); },
        logout() { if (window.handleLogout) window.handleLogout(); }
      }
    }).mount('#global-profile-header');
    headerDiv.removeAttribute('v-cloak');

  } else {
    if (window.vmGlobalHeader) {
      window.vmGlobalHeader.currentUser = state.user;
    }
    headerDiv.removeAttribute('v-cloak');
  }

  // Sinkronisasi Bar Atas Mobile (Sticky Header HP)
  if (typeof updateMobileProfileUI === 'function') {
    updateMobileProfileUI();
  }
}

// -------------------------------------------------------------
// KONTROLER MOBILE TOP APP BAR & REHIDRASI PROFIL HP
// -------------------------------------------------------------
window.updateMobileProfileUI = function () {
  let user = state.user;
  if (!user) {
    try {
      const rawUser = localStorage.getItem('transkep_user_profile') || localStorage.getItem('transkep_user');
      if (rawUser) user = JSON.parse(rawUser);
    } catch (e) { }
  }
  if (!user) return;

  const topBar = document.getElementById('mobile-top-bar');
  if (!topBar) return;

  // 1. Direct DOM injection (0ms Zero-Flicker)
  let cleanName = (user.nama || 'Pegawai').split(',')[0].replace(/\b(Drs|Dr|H|Hj)\b\.?\s*/gi, '').trim();
  let words = cleanName.split(' ');
  let initials = (words[0] ? words[0].charAt(0).toUpperCase() : '') + (words[1] ? words[1].charAt(0).toUpperCase() : '');
  if (!initials) initials = 'ID';

  const avatarEl = document.getElementById('mobile-avatar');
  const nameEl = document.getElementById('mobile-user-name');
  const roleEl = document.getElementById('mobile-user-role');

  if (avatarEl) avatarEl.textContent = initials;
  if (nameEl) nameEl.textContent = cleanName;
  if (roleEl) roleEl.textContent = user.jabatan || 'Pegawai';

  topBar.removeAttribute('v-cloak');
  topBar.classList.remove('hidden');

  // 2. Vue instance binding (Reaktivitas Mulus)
  if (!window.vmMobileNav && typeof Vue !== 'undefined') {
    try {
      const { createApp } = Vue;
      window.vmMobileNav = createApp({
        data() {
          return { currentUser: user };
        },
        computed: {
          cleanName() {
            if (!this.currentUser || !this.currentUser.nama) return "Pegawai";
            return this.currentUser.nama.split(',')[0].replace(/\b(Drs|Dr|H|Hj)\b\.?\s*/gi, '').trim();
          },
          userInitials() {
            if (!this.currentUser || !this.currentUser.nama) return "ID";
            let cName = this.cleanName;
            let w = cName.split(' ');
            let ini = (w[0] ? w[0].charAt(0).toUpperCase() : '') + (w[1] ? w[1].charAt(0).toUpperCase() : '');
            return ini || "ID";
          }
        }
      }).mount('#mobile-top-bar');
      topBar.removeAttribute('v-cloak');
    } catch (err) {
      console.warn('[MobileNav] Vue mount notice:', err);
    }
  } else if (window.vmMobileNav) {
    window.vmMobileNav.currentUser = user;
    topBar.removeAttribute('v-cloak');
  }

  // 3. Update status ikon tema matahari/bulan
  if (typeof updateThemeIcon === 'function') {
    updateThemeIcon();
  }
};
