// =========================================================================
// FILE: core.js (TRANSKEP Web Core Controller)
// DESKRIPSI: State Management, Autentikasi Login, Routing Menu, Notifikasi & Modals
// ENGINE: ZettBOT Core v1.0.0 (by Zettbos)
// =========================================================================

console.log("🚀 ZETTBOT: Menginisialisasi sistem TRANSKEP core.js...");

let state = {
  user: null,
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
window.vueState = Vue.reactive(state);

const isGoogleEnv = (typeof google !== 'undefined' && google.script);

document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 ZETTBOT: Halaman berhasil dimuat (DOMContentLoaded).");

  document.body.style.display = '';
  document.body.classList.remove('hidden');
  try {
    const activeNip = localStorage.getItem('transkep_active_nip');
    if (activeNip) {
      toggleAppVisibility(true);
      syncAllServerData();
    } else {
      toggleAppVisibility(false);
    }
  } catch (e) {
    console.error("❌ ZETTBOT Error Inisialisasi:", e);
    toggleAppVisibility(false);
  }
});

function toggleAppVisibility(isLoggedIn) {
  let loginSec = document.getElementById('login-section');
  let appCont = document.getElementById('app-container');
  const loader = document.getElementById('global-loader');

  const mobTop = document.getElementById('mobile-top-bar');
  const mobBottom = document.getElementById('mobile-bottom-nav');

  if (loader) {
    loader.classList.add('hidden');
    loader.style.display = 'none';
  }

  if (!loginSec) {
    const passInput = document.querySelector('input[type="password"]');
    if (passInput) loginSec = passInput.closest('div.min-h-screen') || passInput.closest('form').parentElement.parentElement;
  }
  if (!appCont) {
    appCont = document.getElementById('main-content') || document.querySelector('main');
    if (appCont && appCont.tagName === 'MAIN') appCont = appCont.parentElement;
  }

  if (isLoggedIn) {
    if (loginSec) { loginSec.classList.add('hidden'); loginSec.style.display = 'none'; }
    if (appCont) { appCont.classList.remove('hidden'); appCont.style.display = ''; }
    if (mobTop) { mobTop.classList.remove('hidden'); }
    if (mobBottom) { mobBottom.classList.remove('hidden'); }
  } else {
    if (loginSec) { loginSec.classList.remove('hidden'); loginSec.style.display = ''; }
    if (appCont) { appCont.classList.add('hidden'); appCont.style.display = 'none'; }
    if (mobTop) { mobTop.classList.add('hidden'); }
    if (mobBottom) { mobBottom.classList.add('hidden'); }
  }
}

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

  showLoading("Memverifikasi Kredensial...");

  google.script.run
    .withSuccessHandler(function (response) {
      if (response && response.status === 'success') {
        localStorage.setItem('transkep_active_nip', response.data.nip);
        localStorage.setItem('transkep_session_token', response.token);
        localStorage.setItem('transkep_user_nama', response.data.nama || '');
        localStorage.setItem('transkep_user_role', response.data.role || '');

        // Set user di state seketika agar tidak null saat sync berlangsung
        window.vueState.user = response.data;
        if (typeof state !== 'undefined') state.user = response.data;

        const isTemporary = !!(response.must_change_password || (typeof pass === 'string' && /^TR-\d{6}$/.test(pass.trim())));
        if (isTemporary) {
          localStorage.setItem('transkep_force_change_password', pass.trim());
          setTimeout(() => {
            if (typeof window.openChangePasswordModal === 'function') {
              window.openChangePasswordModal(pass.trim(), true);
            }
          }, 300);
        }

        toggleAppVisibility(true);
        syncAllServerData();
        showNotify("Login Berhasil", `Selamat datang kembali, ${response.data.nama}`, "success");
      } else {
        hideLoading();
        showNotify("Akses Ditolak", response ? response.message : "Tidak ada respon server", "error");
      }
    })
    .withFailureHandler(function (error) {
      hideLoading();
      showNotify("Error Server", error.message || "Gagal menghubungi server", "error");
    })
    .verifyLogin(nip, pass);
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

  localStorage.removeItem('transkep_active_nip');
  localStorage.removeItem('transkep_last_menu');
  localStorage.removeItem('transkep_session_token');
  localStorage.removeItem('transkep_user_nama');
  localStorage.removeItem('transkep_user_role');
  localStorage.removeItem('transkep_force_change_password');

  window.vueState.currentMenu = 'dashboard';
  window.vueState.user = null;
  window.vueState.rendered = {};
  window.vueState.isBgSyncDone = false;

  toggleAppVisibility(false);
  showNotify("Sesi Berakhir", "Anda telah berhasil keluar dari sistem.", "success");
}

function syncAllServerData() {
  showLoading("Menyinkronkan profil & data inti...");
  const loginNip = localStorage.getItem('transkep_active_nip');
  const sessionToken = localStorage.getItem('transkep_session_token');

  if (!loginNip || !sessionToken) {
    handleLogout();
    return;
  }

  google.script.run
    .withSuccessHandler(function (response) {
      hideLoading();
      if (response && response.status === 'success') {
        window.vueState.user = response.data.user;
        if (response.data.user && response.data.user.role) {
          localStorage.setItem('transkep_user_role', response.data.user.role);
        }
        window.vueState.usersList = response.data.usersList;
        window.vueState.pendingPkpCount = response.data.pendingPkpCount || 0;
        window.vueState.isBgSyncDone = false;

        window.vueState.cutiLogs = [];
        window.vueState.jobdesList = [];
        window.vueState.skList = [];
        window.vueState.skAckList = [];
        window.vueState.kinerjaList = [];
        window.vueState.sopList = [];
        window.vueState.sopAckList = [];
        window.vueState.stList = [];
        window.vueState.masterKinerjaList = [];
        window.vueState.ikLogs = [];
        window.vueState.ipLogs = [];
        window.vueState.wfhLogs = [];

        if (typeof renderGlobalHeader === 'function') {
          renderGlobalHeader();
        }

        initNavigationAccess();

        const lastMenu = localStorage.getItem('transkep_last_menu') || 'dashboard';
        switchMenu(lastMenu);

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
        showNotify("Gagal Sinkronisasi", response ? response.message : "Data bermasalah", "error");
        handleLogout();
      }
    })
    .withFailureHandler(function (error) {
      hideLoading();
      showNotify("Terputus dari Server", error.message || "Gagal sinkronisasi", "error");
      handleLogout();
    })
    .getBulkData(loginNip, sessionToken);
}

function syncBackgroundData() {
  const loginNip = localStorage.getItem('transkep_active_nip');
  const sessionToken = localStorage.getItem('transkep_session_token');
  if (!loginNip || !sessionToken) return;

  google.script.run
    .withSuccessHandler(function (res) {
      if (res && res.status === 'success') {
        window.vueState.cutiLogs = res.data.cutiLogs || [];
        window.vueState.stList = res.data.stList || [];
        window.vueState.ikLogs = res.data.ikLogs || [];
        window.vueState.ipLogs = res.data.ipLogs || [];
        window.vueState.wfhLogs = res.data.wfhLogs || [];
        window.vueState.jobdesList = res.data.jobdesList || [];
        window.vueState.skList = res.data.skList || [];
        window.vueState.skAckList = res.data.skAckList || [];
        window.vueState.kinerjaList = res.data.kinerjaList || [];
        window.vueState.sopList = res.data.sopList || [];
        window.vueState.sopAckList = res.data.sopAckList || [];
        window.vueState.masterKinerjaList = res.data.masterKinerjaList || [];

        window.vueState.isBgSyncDone = true;

        updateSidebarBadges();
        if (typeof updateBadgePermohonan === 'function') updateBadgePermohonan();

        const cm = state.currentMenu;
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
      }
    })
    .withFailureHandler(function (err) {
      console.warn("Background Sync Gagal: " + err.message);
      state.isBgSyncDone = true;
      if (state.currentMenu === 'dashboard' && typeof renderDashboardView === 'function') renderDashboardView();
    })
    .getBackgroundData(loginNip, sessionToken);
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
      if (menuId === 'eoffice' && typeof window.refreshEofficeData === 'function') {
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
    const span = loader.querySelector('span');
    if (span) span.innerText = msg;
    loader.classList.remove('hidden');
    loader.style.display = 'flex';
  }
}

function hideLoading() {
  const loader = document.getElementById('global-loader');
  if (loader) {
    loader.classList.add('hidden');
    loader.style.display = 'none';
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
            if (confirm("Perhatian: Akun Anda masih menggunakan sandi sementara WhatsApp yang rentan. Yakin ingin menunda pembuatan sandi baru?")) {
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
         <div class="flex items-center gap-5 w-full md:w-auto justify-end border-t md:border-t-0 border-slate-800/60 pt-4 md:pt-0 relative z-10">
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

  } else {
    if (window.vmGlobalHeader) {
      window.vmGlobalHeader.currentUser = state.user;
    }
  }
}
