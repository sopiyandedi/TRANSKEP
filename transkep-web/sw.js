// =========================================================================
// FILE: sw.js (TRANSKEP Progressive Web App Service Worker)
// DESKRIPSI: Offline Asset Caching, Fast Load & Network Pass-Through
// ENGINE: ZettBOT PWA Engine v1.0.0 (by Zettbos)
// =========================================================================

const CACHE_NAME = 'transkep-v2.8.5';

// Daftar aset inti yang di-cache saat Service Worker dipasang (Install)
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/stylesheet.css',
  './css/mobile.css',
  './css/animations.css',
  './css/custom.css',
  './img/logo.png',
  './img/logo_pengadilan.png',
  './core/view_login.html',
  './core/view_sidebar.html',
  './core/view_mobile_nav.html',
  './core/view_global_modals.html',
  './core/api.js',
  './core/particles.js',
  './core/sidebar.js',
  './core/login.js',
  './core/core.js',
  './modules/dashboard/view_dashboard.html',
  './modules/dashboard/dashboard_data.js',
  './modules/dashboard/dashboard.js',
  './modules/dashboard/dashboard_grafik.js',
  './modules/permohonan/view_permohonan.html',
  './modules/permohonan/view_modals_izin.html',
  './modules/permohonan/view_magic_approval.html',
  './modules/permohonan/cuti_data.js',
  './modules/permohonan/cuti.js',
  './modules/permohonan/st_data.js',
  './modules/permohonan/st.js',
  './modules/permohonan/persetujuan_data.js',
  './modules/permohonan/persetujuan.js',
  './modules/permohonan/magic_approval.js',
  './modules/permohonan/rekapitulasi_data.js',
  './modules/permohonan/rekapitulasi.js',
  './modules/permohonan/izin_data.js',
  './modules/permohonan/ip.js',
  './modules/permohonan/ik.js',
  './modules/permohonan/wfh.js',
  './modules/permohonan/cetak/cetak_cuti.html',
  './modules/permohonan/cetak/cetak_cuti.js',
  './modules/permohonan/cetak/cetak_st.html',
  './modules/permohonan/cetak/cetak_st.js',
  './modules/permohonan/cetak/cetak_spd.html',
  './modules/permohonan/cetak/cetak_spd.js',
  './modules/permohonan/cetak/cetak_plh.html',
  './modules/permohonan/cetak/cetak_plh.js',
  './modules/permohonan/cetak/cetak_ip.html',
  './modules/permohonan/cetak/cetak_ip.js',
  './modules/permohonan/cetak/cetak_ik.html',
  './modules/permohonan/cetak/cetak_ik.js',
  './modules/permohonan/cetak/cetak_wfh_rencana.html',
  './modules/permohonan/cetak/cetak_wfh_rencana.js',
  './modules/permohonan/cetak/cetak_wfh_laporan.html',
  './modules/permohonan/cetak/cetak_wfh_laporan.js',
  './modules/pkp/view_pkp.html',
  './modules/pkp/pkp_data.js',
  './modules/pkp/pkp.js',
  './modules/pkp/cetak/cetak_pk.html',
  './modules/pkp/cetak/cetak_pk.js',
  './modules/pkp/cetak/cetak_pck.html',
  './modules/pkp/cetak/cetak_pck.js',
  './modules/pkp/cetak/cetak_rekap_pkp.html',
  './modules/pkp/cetak/cetak_rekap_pkp.js',
  './modules/jobdes/view_jobdes.html',
  './modules/jobdes/jobdes_data.js',
  './modules/jobdes/jobdes.js',
  './modules/jobdes/cetak/cetak_jobdes.html',
  './modules/jobdes/cetak/cetak_jobdes.js',
  './modules/sk/view_sk.html',
  './modules/sk/sk_data.js',
  './modules/sk/sk.js',
  './modules/sop/view_sop.html',
  './modules/sop/sop_data.js',
  './modules/sop/sop.js',
  './modules/pdf_viewer/view_pdf_viewer.html',
  './modules/pdf_viewer/pdf_viewer.js',
  './modules/kinerja/view_kinerja.html',
  './modules/kinerja/kinerja_data.js',
  './modules/kinerja/kinerja.js',
  './modules/eoffice/view_eoffice.html',
  './modules/eoffice/eoffice_data.js',
  './modules/eoffice/eoffice.js',
  './modules/eoffice/kgb.js',
  './modules/eoffice/rapat.js',
  './modules/pegawai/view_pegawai.html',
  './modules/pegawai/pegawai_data.js',
  './modules/pegawai/pegawai.js',
  './modules/referensi/view_referensi.html',
  './modules/referensi/referensi.js'
];

// 1. EVENT: INSTALL (Pre-cache static assets)
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Menginstall & Pre-caching aset aplikasi...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn('[Service Worker] Gagal precache aset:', err);
      })
  );
});

// 2. EVENT: ACTIVATE (Bersihkan cache lama)
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Mengaktifkan versi baru & membersihkan cache lama...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[Service Worker] Menghapus cache usang:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. EVENT: FETCH (Network & Caching Strategy)
self.addEventListener('fetch', (event) => {
  const reqUrl = new URL(event.request.url);

  // A. WAJIB BYPASS: Jangan pernah cache request API backend Google Apps Script / POST
  if (
    reqUrl.hostname.includes('script.google.com') ||
    reqUrl.hostname.includes('script.googleusercontent.com') ||
    event.request.method !== 'GET'
  ) {
    return; // Serahkan sepenuhnya ke jaringan langsung (Network Only)
  }

  // B. Stale-While-Revalidate untuk aset lokal & CDN eksternal
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch((err) => {
            // Jika offline dan aset ada di cache, cachedResponse akan digunakan
            if (cachedResponse) return cachedResponse;
            // Jika navigasi halaman gagal saat offline, kembalikan index.html
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            throw err;
          });

        return cachedResponse || fetchPromise;
      });
    })
  );
});

// 4. EVENT: MESSAGE (Mendukung update instan dari UI)
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
