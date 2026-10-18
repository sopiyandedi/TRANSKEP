# SPESIFIKASI KEBUTUHAN PRODUK (PRD) & MASTER CONTEXT: TRANSKEP v2.1
================================================================================
DOKUMEN SPESIFIKASI RESMI SISTEM (ZETTBOT REVERSE-PRD)
Projek: TRANSKEP (Transparansi Kepegawaian)
Lingkungan: Google Apps Script Web App + Google Sheets Database
Frontend Engine: TailwindCSS + Vue.js 3 (Global CDN) + FontAwesome 6
================================================================================

--------------------------------------------------------------------------------
ZONA ATAS: SPESIFIKASI KEBUTUHAN PRODUK (BLUEPRINT SISTEM)
--------------------------------------------------------------------------------

### 1. Nama Projek & Problem Statement
- **Nama Aplikasi:** TRANSKEP (Transparansi Kepegawaian)
- **Tujuan Sistem:** Digitalisasi terpadu pengelolaan administrasi kepegawaian, pengajuan izin & cuti mandiri, penerbitan surat tugas dinas (ST/SPD/Plh), pemantauan SKP/E-Kinerja, penataan SK & SOP kedinasan, hingga penilaian kinerja berkala (PKP/PCK) yang transparan, akuntabel, dan terhubung langsung ke spreadsheet database.

### 2. Peran Pengguna (User Roles)
1. **Pegawai / PNS (User Biasa):**
   - Melihat dashboard ringkasan kuota sisa cuti, profil, status dokumen.
   - Mengajukan permohonan Cuti Tahunan, Cuti Sakit, Cuti Alasan Penting, Cuti Melahirkan, Cuti Besar, Cuti Diluar Tanggungan Negara.
   - Mengajukan Izin Pribadi (IP), Izin Keluar Kantor (IK), dan Rencana/Laporan WFH.
   - Mengisi Sasaran Kinerja Pegawai (E-Kinerja/SKP) dan Target PKP/PCK.
   - Mengunduh formulir cetak dan mengecek arsip SK/SOP kedinasan.
2. **Atasan Langsung / Verifikator:**
   - Memeriksa dan memberikan persetujuan (Setujui / Tolak / Perubahan) atas permohonan cuti, izin, WFH, dan realisasi kinerja bawahan langsung.
3. **Pejabat Berwenang / Pimpinan:**
   - Menyetujui penerbitan Surat Tugas (ST), Surat Perjalanan Dinas (SPD), dan Pelaksana Harian (Plh).
   - Menandatangani SKP dan penilaian kinerja akhir.
4. **Admin / Operator Kepegawaian:**
   - Kelola direktori pegawai (tambah, edit, nonaktifkan, upload via Excel).
   - Akses rekapitulasi global seluruh pegawai untuk cuti, kehadiran, PKP, dan SK.
   - Kelola database master SK, SOP, dan konfigurasi default surat.

### 3. Arsitektur & Lingkungan Kerja
- **Platform:** Google Apps Script (GAS) Web App (`code.js`, `setup.js`, `permohonan.js`, `pkp.js`, `st.js`).
- **Database:** Google Sheets terpusat (`DB_ID` / Script Properties).
- **Frontend Framework:** Vue 3 (Composition & Options via `Vue.createApp`), Tailwind CSS via CDN, Google Fonts (Plus Jakarta Sans).
- **Deployment:** clasp (`@google/clasp`) untuk sinkronisasi lokal ke GAS script.

### 4. Alur Kerja Aplikasi (Core User Flow)
1. Login dengan NIP & Kata Sandi -> Disimpan di `localStorage` (`transkep_user`, `transkep_token`).
2. Masuk ke Dashboard: Menampilkan ringkasan sisa cuti tahun berjalan, monitoring ketidakhadiran, grafik real-time, pencarian pegawai instan, dan jalan pintas menu.
3. Navigasi Menu: Menggunakan sidebar (desktop) atau bottom app bar (mobile) dengan perpindahan menu mulus (client-side DOM switching).

---

--------------------------------------------------------------------------------
ZONA BAWAH: MASTER CONTEXT & STATUS MIGRASI TERKINI (LIVING CONTEXT)
--------------------------------------------------------------------------------

### Status Migrasi Arsitektur Frontend: Vanilla JS -> Vue.js 3

| Modul / Menu | Lokasi File | Status Migrasi | Keterangan & Komponen |
| :--- | :--- | :---: | :--- |
| **Dashboard** | `dashboard/view_dashboard.html`, `js_dashboard.html` | ✅ **VUE.JS** | Mounted `#section-dashboard` (`window.dashboardApp`). Search bar, absensi real-time, grafik Chart.js. |
| **Permohonan Cuti (Riwayat)** | `permohonan/view_permohonan.html`, `js_permohonan_view.html` | ✅ **VUE.JS** | Mounted `#vue-riwayat-permohonan` (`window.vmRiwayatPermohonan`). |
| **Permohonan Cuti (Verifikasi)**| `permohonan/view_persetujuan.html`, `js_persetujuan.html` | ✅ **VUE.JS** | Mounted `#vue-persetujuan-wrapper` (`window.vmPersetujuan`). |
| **Permohonan Cuti (Rekapitulasi)**| `permohonan/view_rekapitulasi.html`, `js_rekapitulasi.html` | ✅ **VUE.JS** | Mounted `#vue-rekapitulasi-wrapper` (`window.vmRekapitulasi`). |
| **Formulir Pengajuan Cuti** | `permohonan/js_permohonan_form.html` | ✅ **VUE.JS** | Mounted `#vue-form-cuti-wrapper` (`window.vmFormCuti`). |
| **Surat Tugas (ST, SPD, Plh)** | `permohonan/st/view_st.html`, `js_st.html` | ✅ **VUE.JS** | Mounted `#vue-form-st-wrapper` (`window.vmFormST`). Multi-step form & auto-fill. |
| **Izin Pribadi (IP)** | `permohonan/ip/view_ip.html`, `js_ip.html` | ✅ **VUE.JS** | Mounted `#vue-form-ip-wrapper` (`window.vmFormIP`). |
| **Izin Keluar Kantor (IK)** | `permohonan/ik/view_ik.html`, `js_ik.html` | ✅ **VUE.JS** | Mounted `#vue-form-ik-wrapper` (`window.vmFormIK`). |
| **Work From Home (WFH)** | `permohonan/wfh/view_wfh.html`, `js_wfh.html` | ✅ **VUE.JS** | Mounted `#vue-form-wfh-wrapper` (`window.vmFormWFH`). Rencana & Laporan WFH. |
| **Uraian Tugas (Jobdes)** | `jobdes/view_jobdes.html`, `js_jobdes.html` | ✅ **VUE.JS** | Mounted `#vue-jobdes-app` (`window.vmJobdes`). Search & filter tugas. |
| **Surat Keputusan (SK)** | `sk/view_sk.html`, `js_sk.html` | ✅ **VUE.JS** | Mounted `#vue-sk-app` (`window.vmSkApp`). Tabulasi PJ & sorting dinamis. |
| **Manajemen SOP** | `sop/view_sop.html`, `js_sop.html` | ✅ **VUE.JS** | Mounted `#vue-sop-app` (`window.vmSopApp`). Tabulasi filter SOP & upload file. |
| **E-Kinerja (SKP)** | `kinerja/view_kinerja.html`, `js_kinerja.html` | ✅ **VUE.JS** | Mounted `#vue-kinerja-app` (`window.vmKinerja`). Arsip SKP & input dokumen. |
| **Kelola Pegawai** | `pegawai/view_manajemen_pegawai.html`, `js_manajemen_pegawai.html` | ✅ **VUE.JS** | Mounted `#vue-manajemen-pegawai` (`window.vmPegawai`). Table CRUD & Excel parser. |
| **Top App Bar Mobile** | `front_view/view_mobile_nav.html`, `js_mobile.html` | ✅ **VUE.JS** | Mounted `#mobile-top-bar` (`window.vmMobileNav`). Avatar & status user. |
| **Global Modals (Sisa Cuti & Sandi)**| `index.html`, `javascript.html` | ✅ **VUE.JS** | Mounted `#vue-global-modals` (`window.vmGlobalModals`). |
| **Penilaian Kinerja (PKP)** | `pkp/view_pkp.html`, `js_pkp_core.html`, `js_pkp_render.html`, `js_pkp_modal.html` | ✅ **VUE.JS** | Mounted `#vue-pkp-app` (`window.vmPkpApp`). Layar utama, Riwayat, Verifikasi, Rekap, Modal Target PK, dan Modal Realisasi PCK + live calculator capaian. |
| **E-Office (KGB & Paket Rapat)** | `eoffice/view_eoffice.html`, `js_eoffice.html`, `view_kgb.html`, `js_kgb.html`, `view_rapat.html`, `js_rapat.html` | ✅ **VUE.JS** | Mounted `#vue-eoffice-app` (`window.vmEoffice`). Rekapitulasi Global pekerjaan, auto-draf KGB dari Dashboard, Generator SK KGB (PP 05/2024), dan Paket Dokumen Rapat 3-in-1 (Undangan, Absensi, Notulen). |
| **Modal Referensi Kode Surat**| `dashboard/referensi/view_kode.html`, `js_kode.html` | ❌ **VANILLA JS (BELUM)** | Pencarian kode surat & render DOM menggunakan `innerHTML`. |
| **Modal Referensi Absensi** | `dashboard/referensi/view_referensi.html`, `js_referensi.html` | ❌ **VANILLA JS (BELUM)** | Modal popup statis + toggle kelas via vanilla JS. |
| **Layar Login & Lupa Password**| `index.html` (lines 37-108), `front_view/js_login.html`, `javascript.html` | ❌ **VANILLA JS (BELUM)** | Form login `handleLogin()` dan `submitLupaPassword()` menggunakan `document.getElementById`. |
| **Sidebar & Navigasi Shell** | `front_view/view_sidebar.html`, `js_sidebar.html` | ❌ **VANILLA JS (BELUM)** | `switchMenu()`, collapse sidebar desktop & mobile drawer. |
| **Iframe PDF Viewer** | `sk/view_iframepdf.html`, `js_iframepdf.html` | ❌ **VANILLA JS (BELUM)** | Modal iframe dokumen SK/SOP menggunakan vanilla DOM event. |

---

### Status Keamanan & Ketahanan Sistem (Hardened & Bug-Free)
1. **Otentikasi & Sesi (CWE-200, CWE-312, CWE-613, CWE-256):**
   - Kredensial password dihapus dari `data.usersList` untuk non-admin.
   - Sesi di-cache di `CacheService` dan dicabut instan pada `logoutSession`.
   - Dual-mode salted SHA-256 hashing aktif (`hashPassword_` & `verifyPasswordHash_`).
2. **Otorisasi & RBAC (CWE-285, CWE-306):**
   - Seluruh endpoint CRUD dan antrean reset password diproteksi dengan `cekOtorisasiAdmin`.
3. **Proteksi Fungsi Server & Webhook (CWE-749, CWE-798):**
   - Fungsi internal `setupDatabase_`, `runDailyBackup_`, `cleanupOldBackups_`, `otorisasiSistem_` dikunci dengan sufiks `_`.
   - Webhook key dipindahkan ke `PropertiesService` (`TRANSKEP_WEBHOOK_KEY`).
4. **Sanitasi Data (CWE-79, CWE-1236):**
   - Direktif `v-html` dieliminasi ke kurung kurawal aman `{{ }}` pada seluruh review permohonan.
   - Mitigasi formula injection aktif via `sanitizeRowArray` pada seluruh penulisan sheet log.
5. **Ketahanan Runtime (Self-Healing Architecture):**
   - Auto-provisioning otomatis pada sheet `log_reset_pass` dan `st_log`.
   - Fallback `localStorage` pada resolusi NIP Admin untuk mitigasi `null` pointer.
   - Koreksi referensi tabel pegawai ke `'user_data'`.
6. **Arsitektur Gateway Paralel (Parallel Run / Multi-Repo v3.0):**
   - Backend Google Apps Script resmi mendukung mode ganda (Dual Mode):
     * Mode HTML: Tetap me-render `index.html` untuk Google Sites eksisting (`doGet`).
     * Mode API: Mengembalikan respon JSON ([`api_router.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/api_router.js)) saat dipanggil dengan parameter `?api=true` atau via POST JSON payload (`doPost`).
   - Repositori frontend baru diisolasi di folder [`transkep-web/`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web) dan diamankan oleh [`.claspignore`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/.claspignore).
   - Arsitektur Frontend Murni Modular Vanilla JS (Zero-Bundler / Tanpa Node.js / Tanpa Python Build Tool):
     * Core Entry: [`transkep-web/index.html`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/index.html) (memuat 9 kontainer `#section-*` lengkap, modal terisolasi, dan template cetak).
     * Modul JS Standar: `api.js`, `particles.js`, `sidebar.js`, `login.js`, `core.js`, `dashboard.js`, `permohonan.js`, `pkp.js`, `jobdes.js`, `sk_sop.js`, `kinerja.js`, `eoffice.js`, `pegawai.js`, `referensi.js`.
     * Asset Lokal: Logo resmi Burung Hantu tersimpan di `img/logo.png` dengan Google CDN fallback anti-blokir cookies.
7. **Modul Dashboard & Analitik Demografi Pegawai (Tahap 6 - Charts Upgrade):**
   - **4 Visualisasi Interaktif Chart.js:**
     * *Jenis Kelamin*: Donat proporsional + Angka Total Pegawai di tengah kanvas + hover % rasio.
     * *Pangkat & Ruang Golongan*: Horizontal bar dengan pengurutan hierarki PNS (Gol IV/E s.d I/A) & PPPK (XVII s.d I).
     * *Posisi Jabatan*: Horizontal bar hierarkis (Ketua s.d Operator Layanan) dengan pemotongan label Y-axis (ellipsis max 20 kar) dan full title di tooltip agar bar tidak terhimpit.
     * *Distribusi Usia*: Horizontal bar distribusi rentang umur produktif (21-30 s.d 61-70).
   - **Interaktivitas & Kontrol Canggih:**
     * Data Labels Plugin: Angka nominal ditampilkan otomatis di ujung setiap bar.
     * Klik-untuk-Filter: Klik irisan donat / bar langsung mengeksekusi window.vmDashboard.externalSearch(keyword) dan auto-scroll ke panel tabel pegawai.
     * Dual Display Mode: Toggle instan antara Slider Carousel (drag/grab + tombol Prev/Next) dan Mode Grid 2x2 responsif dengan persistensi localStorage.
     * HD PNG Export: Tombol unduh kanvas dengan latar belakang gelap #090d16 dan penyematan angka total di tengah donat.
8. **Feature-Based Modular Architecture (Tahap 14, 15, 16, 17 & 18):**
   - File utama `index.html` ramping permanen (~240 baris) dengan sistem *Native Component Loader* tanpa build tool.
   - Proyek mengadopsi struktur berbasis domain fitur (*Feature-Based Architecture*) tingkat tinggi:
     * `core/`: Utilitas sentral (`api.js`, `core.js`, `particles.js`, `sidebar.js`, `login.js`, `app.js`) dan template shell (`view_login.html`, `view_sidebar.html`, `view_mobile_nav.html`, `view_global_modals.html`).
     * `modules/<fitur>/`: Seluruh 11 domain modul utama (`dashboard`, `permohonan`, `pkp`, `jobdes`, `sk`, `sop`, `kinerja`, `eoffice`, `pegawai`, `referensi`, `pdf_viewer`) mengisolasi berkas view HTML, script controller, dan template cetak ke subdirektori masing-masing.
   - PWA Service Worker `sw.js` (v1.4.0) meng-cache seluruh 74 berkas modular views, scripts, dan template cetak untuk akses offline instan tanpa error 404.
9. **Pemisahan Layer UI Controller & Data Service (Tahap 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30 & 31):**
   - Setiap domain modul diarahkan memiliki 3 berkas simetris:
     * View: `view_<modul>.html` (tampilan antarmuka murni).
     * UI Controller: `<modul>.js` (Vue app, modal form, reactive state, event click, toast).
     * Data Service Layer: `<modul>_data.js` (Promise-based data handler, FileReader Base64, payload builder, RPC dispatcher).
   - Telah berhasil diterapkan pada:
     1. **Modul Kinerja (Tahap 19)**: [`modules/kinerja/kinerja_data.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/kinerja/kinerja_data.js) & [`modules/kinerja/kinerja.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/kinerja/kinerja.js).
     2. **Modul SK (Tahap 20)**: [`modules/sk/sk_data.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/sk/sk_data.js) & [`modules/sk/sk.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/sk/sk.js).
     3. **Modul SOP (Tahap 21)**: [`modules/sop/sop_data.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/sop/sop_data.js) & [`modules/sop/sop.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/sop/sop.js).
     4. **Modul Jobdes (Tahap 22)**: [`modules/jobdes/jobdes_data.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/jobdes/jobdes_data.js) & [`modules/jobdes/jobdes.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/jobdes/jobdes.js).
     5. **Modul Pegawai (Tahap 23)**: [`modules/pegawai/pegawai_data.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/pegawai/pegawai_data.js) & [`modules/pegawai/pegawai.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/pegawai/pegawai.js).
     6. **Modul E-Office (Tahap 24)**: [`modules/eoffice/eoffice_data.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/eoffice/eoffice_data.js), [`modules/eoffice/eoffice.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/eoffice/eoffice.js), [`modules/eoffice/kgb.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/eoffice/kgb.js), & [`modules/eoffice/rapat.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/eoffice/rapat.js).
     7. **Modul PKP (Tahap 25)**: [`modules/pkp/pkp_data.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/pkp/pkp_data.js) & [`modules/pkp/pkp.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/pkp/pkp.js).
     8. **Modul Permohonan Cuti (Tahap 26)**: [`modules/permohonan/cuti_data.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/permohonan/cuti_data.js) & [`modules/permohonan/cuti.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/permohonan/cuti.js).
     9. **Modul Surat Tugas (Tahap 27)**: [`modules/permohonan/st_data.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/permohonan/st_data.js) & [`modules/permohonan/st.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/permohonan/st.js).
     10. **Modul Permohonan Izin: IP, IK & WFH (Tahap 28)**: [`modules/permohonan/izin_data.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/permohonan/izin_data.js), [`modules/permohonan/ip.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/permohonan/ip.js), [`modules/permohonan/ik.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/permohonan/ik.js), & [`modules/permohonan/wfh.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/permohonan/wfh.js).
     11. **Modul Kotak Persetujuan (Tahap 29)**: [`modules/permohonan/persetujuan_data.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/permohonan/persetujuan_data.js) & [`modules/permohonan/persetujuan.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/permohonan/persetujuan.js).
     12. **Modul Rekapitulasi Riwayat Permohonan (Tahap 30)**: [`modules/permohonan/rekapitulasi_data.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/permohonan/rekapitulasi_data.js) & [`modules/permohonan/rekapitulasi.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/permohonan/rekapitulasi.js).
     13. **Modul Dashboard Analitik & Monitoring TMT (Tahap 31)**: [`modules/dashboard/dashboard_data.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/dashboard/dashboard_data.js) & [`modules/dashboard/dashboard.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/modules/dashboard/dashboard.js).
   - PWA Service Worker sw.js diperbarui ke versi **	ranskep-v2.8.0**.
10. **Integrasi WhatsApp Gateway (WAHA + Ngrok) & Magic Link Approval (Tahap 32):**
    - **Otomatisasi WhatsApp:** Mengintegrasikan self-hosted WAHA (Core 2026.9.1 WEBJS) via tunnel Ngrok publik (supernova-endpoint-unsubtly.ngrok-free.dev) untuk pengiriman pesan otomatis berkecepatan tinggi tanpa antrean eksternal.
    - **Reset Sandi Otomatis:** Pegawai mengajukan lupa password di login screen -> sistem meng-generate kata sandi sementara 6-digit (TR-XXXXXX), Salted SHA-256 hash di user_data, dan otomatis mengirimkan kredensial via bot WhatsApp. Antrean manual di menu Admin tetap dipertahankan sebagai Plan B fallback.
    - **Persetujuan Cuti Berjenjang via Magic Link:**
      * Pegawai mengajukan cuti -> Cuti tersimpan 100% aman di database cuti_log.
      * Sistem men-generate magic_token (UUID) di kolom 19 cuti_log dan mengirimkan Magic Link ke WhatsApp Atasan Langsung.
      * Atasan mengklik Magic Link -> Popup review cuti terbuka instan tanpa login -> Atasan menyetujui -> Sistem otomatis meneruskan Magic Link ke Pejabat Berwenang via WAHA.
      * Pejabat menyetujui -> Cuti resmi berstatus Disetujui, saldo terpotong resmi, dan notifikasi konfirmasi dikirimkan ke WhatsApp pemohon.
    - **Tombol Kirim Ulang WA Cuti (Admin & Operator):** Tersedia tombol WhatsApp berwarna emerald pada kolom Aksi tabel Rekapitulasi khusus untuk baris cuti yang berstatus Menunggu, memungkinkan pengiriman ulang notifikasi kapan saja.
    - **UI Magic Link Approval Modal:** Terintegrasi di transkep-web/modules/permohonan/view_magic_approval.html dan magic_approval.js, didaftarkan pada PWA Service Worker sw.js versi **transkep-v2.8.0**.
11. **Auto Force Pop-up Modal Ganti Kata Sandi pada Login Sandi Sementara (Tahap 34):**
    - Deteksi sandi sementara: Server `verifyLogin` menandai `must_change_password: true` jika input password berformat `TR-XXXXXX`.
    - Auto pop-up frontend: Client langsung membuka modal Ganti Kata Sandi (`window.openChangePasswordModal(pass, true)`) secara otomatis dengan jeda 1.2s setelah data profil tersinkronisasi.
    - Pre-fill sandi lama: Field kata sandi lama otomatis terisi dengan kata sandi sementara `TR-XXXXXX` sehingga pengguna tidak perlu mengetik atau menghafalnya.
    - Warning banner & konfirmasi keamanan: Modal menampilkan banner peringatan amber bahwa akun sedang menggunakan sandi sementara dari WhatsApp, tombol aksi adaptif *"Simpan & Amankan"*, dan dialog konfirmasi proteksi jika pengguna mencoba memilih *"Nanti Saja"*.
    - PWA Service Worker `sw.js` diperbarui ke versi **transkep-v2.8.1**.
12. **Eliminasi Notifikasi E-Office & Penguncian Otorisasi Admin di Client-Side (Tahap 35):**
    - Meredam dan mengeliminasi notifikasi peringatan pop-up *"Akses Ditolak: Fitur E-Office hanya dapat diakses oleh Admin"* bagi seluruh pengguna non-Admin saat login atau memuat Dashboard.
    - Menambahkan guard otorisasi dini di `loadData()` pada `modules/eoffice/eoffice.js` dan `eoffice/js_eoffice.html` sehingga pemanggilan data KGB & Rapat hanya dieksekusi bila `isAdmin === true`.
    - Menghapus pemanggilan data otomatis tanpa syarat di hook `mounted()`; data E-Office kini hanya dimuat secara lazy saat Admin membuka menu E-Office.
    - Menyimpan atribut peran pengguna `transkep_user_role` ke `localStorage` secara persisten saat autentikasi dan sinkronisasi agar client-side authorization check berjalan 0ms tanpa lag.
    - PWA Service Worker `sw.js` diperbarui ke versi **transkep-v2.8.3**.

13. **Standardisasi Opsi Golongan PPPK ke Angka Romawi (XVII s.d I) (Tahap 36):**
    - Mengganti pilihan dropdown Pangkat/Golongan untuk PPPK dari angka Arab (`17` s.d `1`) menjadi angka Romawi resmi (`PPPK Golongan XVII` s.d `PPPK Golongan I`) pada `view_pegawai.html` dan `view_manajemen_pegawai.html`.
    - Menyediakan auto-normalization helper `normalizePangkat` pada controller `pegawai.js` dan `js_manajemen_pegawai.html` agar data lama dengan format angka biasa otomatis dikonversi ke Romawi saat dibuka dan disimpan.
    - PWA Service Worker `sw.js` diperbarui ke versi **transkep-v2.8.4**.

14. **Perbaikan & Pemulihan Fitur Hapus / Tarik Pengajuan Permohonan Cuti (Tahap 37):**
    - **Dialog Konfirmasi Interaktif (`showCustomConfirm`):** Mengimplementasikan modal dialog konfirmasi modern berbasis glassmorphism di `transkep-web/core/core.js` serta mengeksposnya ke `window.showCustomConfirm` dengan fallback native `confirm()` di seluruh frontend.
    - **Normalisasi Status & Dukungan Status Perubahan:** Memperbarui backend `deleteCutiLog` di `permohonan/permohonan.js` agar membersihkan spasi, *case-insensitive*, dan mengizinkan pemohon menarik mandiri berkas dengan status `'Menunggu'` maupun `'Perubahan'`.
    - **Safe Quota Refund:** Mengembalikan saldo cuti (Tahunan multi-tahun 2024, 2025, 2026 maupun cuti lainnya) secara utuh ke `user_data` dan menyinkronkan state reaktif frontend seketika.
    - **Universal RPC Bridge:** Memperbarui `cuti_data.js` untuk memanfaatkan `TranskepAPI.call` dengan fallback `google.script.run`.
    - **Usulan Pembatalan Cuti Disetujui:** Menyematkan tombol *"Usul Batal"* pada kolom aksi riwayat khusus permohonan berstatus `'Disetujui'` yang memicu modal pembatalan resmi ke Pejabat Berwenang.
    - PWA Service Worker `sw.js` diperbarui ke versi **transkep-v2.8.5**.

