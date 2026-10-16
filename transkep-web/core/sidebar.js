// =========================================================
// KOMPONEN: JS SIDEBAR
// Fungsi: Menangani Animasi Collapse Sidebar & Mobile Overlay
// =========================================================

let isSidebarCollapsed = false;

// 1. Fungsi Collapse Desktop (SIKEP Style - Ikon Saja)
function toggleDesktopSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  if (!sidebar) return;
  const texts = document.querySelectorAll('.sidebar-text');
  const tooltips = document.querySelectorAll('.sidebar-tooltip');
  const textContainer = document.getElementById('sidebar-text-container');
  const btnToggleDesktop = document.getElementById('btn-toggle-desktop');
  const headerBox = document.getElementById('sidebar-header-box');
  const logoWrapper = document.getElementById('sidebar-logo-wrapper');
  const sectionHeaders = document.querySelectorAll('.sidebar-section-header');
  const navButtons = sidebar.querySelectorAll('button[id^="nav-"]');

  isSidebarCollapsed = !isSidebarCollapsed;

  if (isSidebarCollapsed) {
    // Perkecil Sidebar
    sidebar.classList.remove('w-72');
    sidebar.classList.add('w-[84px]'); 
    
    // Hapus semua padding horizontal agar container benar-benar netral
    if (headerBox) {
      headerBox.classList.remove('pl-5', 'pr-1', 'justify-between');
      headerBox.classList.add('px-0', 'justify-center');
    }
    
    // Hilangkan gap dan paksakan logoWrapper ke tengah
    if (logoWrapper) {
      logoWrapper.classList.remove('gap-3');
      logoWrapper.classList.add('w-full', 'justify-center');
    }
    
    if (textContainer) {
      textContainer.style.display = 'none';
      textContainer.style.opacity = '0';
    }
    if (btnToggleDesktop) {
      btnToggleDesktop.style.display = 'none';
      btnToggleDesktop.style.opacity = '0';
    }

    // Sembunyikan Header Kategori
    sectionHeaders.forEach(el => { el.style.opacity = '0'; setTimeout(() => el.style.display = 'none', 300); });
    
    // Sembunyikan Teks Menu
    texts.forEach(el => { el.style.opacity = '0'; setTimeout(() => el.style.display = 'none', 300); });
    
    // Pusatkan Ikon & Aktifkan Tooltip
    navButtons.forEach(btn => btn.classList.add('justify-center', 'px-0'));
    tooltips.forEach(el => el.classList.remove('hidden'));

  } else {
    // Lebarkan Sidebar
    sidebar.classList.add('w-72');
    sidebar.classList.remove('w-[84px]');
    
    // Kembalikan Posisi Header Normal (pl-5 dan pr-1)
    if (headerBox) {
      headerBox.classList.remove('px-0', 'justify-center');
      headerBox.classList.add('pl-5', 'pr-1', 'justify-between');
    }

    // Kembalikan gap teks dan logo
    if (logoWrapper) {
      logoWrapper.classList.add('gap-3');
      logoWrapper.classList.remove('w-full', 'justify-center');
    }

    // Munculkan kembali wujud fisik Teks & Tombol Strip 3
    if (textContainer) {
      textContainer.style.display = '';
      setTimeout(() => { textContainer.style.opacity = '1'; }, 10);
    }
    if (btnToggleDesktop) {
      btnToggleDesktop.style.display = '';
      setTimeout(() => { btnToggleDesktop.style.opacity = '1'; }, 10);
    }

    sectionHeaders.forEach(el => { el.style.display = ''; setTimeout(() => el.style.opacity = '1', 10); });
    texts.forEach(el => { el.style.display = ''; setTimeout(() => el.style.opacity = '1', 10); });
    
    // Kembalikan Posisi Normal Ikon & Matikan Tooltip
    navButtons.forEach(btn => btn.classList.remove('justify-center', 'px-0'));
    tooltips.forEach(el => el.classList.add('hidden'));
  }
}

// 2. Fungsi Buka Sidebar Mobile (SI-ASN Style - Offcanvas)
function openMobileSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar || !overlay) return;
  
  sidebar.classList.remove('-translate-x-full');
  overlay.classList.remove('hidden');
  setTimeout(() => overlay.classList.remove('opacity-0'), 10);
}

// 3. Fungsi Tutup Sidebar Mobile
function closeMobileSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar || !overlay) return;
  
  sidebar.classList.add('-translate-x-full');
  overlay.classList.add('opacity-0');
  setTimeout(() => overlay.classList.add('hidden'), 300);
}

// 4. Fungsi Navigasi Mobile Bar (Thumb Navigation)
function switchMobileMenu(menuId) {
  if (typeof switchMenu === 'function') {
    switchMenu(menuId);
  }
  updateMobileNavIndicator(menuId);
}

// 5. Fungsi Sinkronisasi Indikator Aktif Tombol Mobile Bottom Nav
function updateMobileNavIndicator(menuId) {
  const navBtns = document.querySelectorAll('.mobile-nav-btn');
  navBtns.forEach(btn => {
    const isTarget = btn.id === ('mob-nav-' + menuId);
    const indicator = btn.querySelector('div');
    if (isTarget) {
      btn.classList.add('text-indigo-400');
      btn.classList.remove('text-slate-500');
      if (indicator) {
        indicator.classList.remove('opacity-0', 'scale-x-0');
        indicator.classList.add('opacity-100', 'scale-x-100');
      }
    } else {
      btn.classList.remove('text-indigo-400');
      btn.classList.add('text-slate-500');
      if (indicator) {
        indicator.classList.add('opacity-0', 'scale-x-0');
        indicator.classList.remove('opacity-100', 'scale-x-100');
      }
    }
  });
}

