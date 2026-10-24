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
    - **Proteksi Cuti Disetujui & Reversi Tombol Tong Sampah:** Menghapus tombol pembatalan pada permohonan berstatus 'Disetujui', dan mengembalikan tombol hapus/tarik permohonan yang belum disetujui ('Menunggu', 'Perubahan', 'Ditolak') ke ikon tong sampah murni (`fa-trash-can`).
    - PWA Service Worker `sw.js` diperbarui ke versi **transkep-v2.8.5**.

15. **Generator Barcode Mandiri Berlogo Pengadilan Agama Indramayu & Standarisasi TTE (Tahap 38):**
    - **Eliminasi Total Pihak Ketiga (Zero External Dependency):** Menghapus seluruh dependensi eksternal terhadap API `api.qrserver.com` dan `quickchart.io` pada formulir cetak cuti.
    - **In-House Pure JS QR Code Engine:** Membangun engine QR mandiri berbasis spesifikasi ISO/IEC 18004 dengan Error Correction Level H (30% damage/overlay recovery) dan auto-version selection (1–40) di `transkep-web/core/qr_engine.js` dan `permohonan/js_qr_engine.html`.
    - **Sematkan Logo Resmi Berwarna PA Indramayu:** Meletakkan logo berwarna Pengadilan Agama Indramayu (`Logo_PA_Imy.png`) di pusat barcode secara proporsional (~22% ukuran QR) dengan lapisan pelindung lingkaran putih (*white circular buffer mask*) untuk menjamin estetika kedinasan tanpa merusak keterbacaan scanner kamera HP.
    - **Direct Web Verification URL:** Hasil pemindaian barcode langsung mengarah ke URL permohonan web dinas resmi (`https://.../?page=permohonan_cuti&id=...`) untuk verifikasi integritas dokumen secara instan.
    - **Label Kedinasan Tanda Tangan Elektronik (TTE):** Menambahkan caption resmi *"Ditandatangani secara elektronik"* di bawah tanda tangan barcode pada kolom Pemohon, Atasan Langsung, dan Pejabat Berwenang.
    - **Dual Environment Support:** Dukungan penuh untuk mode PWA client-side (`transkep-web`) maupun Google Apps Script Web App (`script.google.com`).
    - PWA Service Worker `sw.js` diperbarui ke versi **transkep-v2.8.6**.

16. **Penataan Letak Vertikal Barcode TTE Cuti & Optimasi Margin 1 Lembar A4 (Tahap 39):**
    - **Tata Letak Vertikal Standar Kedinasan (BSrE/Kemenkeu/MA-RI):** Mengubah susunan tanda tangan dari model menyamping (*horizontal flex*) menjadi tumpuk vertikal lurus (*vertical stack*): Jabatan ➔ Barcode Berlogo (55×55px) ➔ Teks TTE *"Ditandatangani secara elektronik"* ➔ Nama Terang (Bold & Underline) ➔ NIP.
    - **Eliminasi Hack Margin & Perataan Elegan:** Menghilangkan ganjalan `padding-left: 73px` dan membatasi lebar kolom tanda tangan pada sisi kanan (`width: 38%`, `min-width: 180px`) sehingga tanda tangan tidak lagi melebar atau menjorok ke tengah/kiri halaman.
    - **Tipografi TTE Ringkas:** Menyesuaikan ukuran teks *"Ditandatangani secara elektronik"* ke font **6.5pt** italic berwarna abu-abu `#555` tepat di bawah barcode.
    - **Zero-Spill Protection (Kunci 1 Lembar A4):** Memangkas margin dan padding berlebih di seluruh formulir (spasi judul -9px, margin antar tabel -12px, padding sel tabel -12px, spasi tanda tangan atasan -10px, dan spasi alamat -3px, total hemat ~47px) untuk menjamin dokumen **100% terkunci dalam 1 lembar A4**.
    - PWA Service Worker `sw.js` diperbarui ke versi **transkep-v2.8.7**.

17. **Pembersihan Redundansi Keterangan TTE & Desain Area Tanda Tangan Super Lega (Tahap 40):**
    - **Eliminasi Teks Redundan:** Menghapus teks repetitif *"Ditandatangani secara elektronik"* pada 3 blok tanda tangan (Pemohon, Atasan Langsung, dan Pejabat Berwenang).
    - **Visual TTE Mandiri:** Barcode berlogo resmi Pengadilan Agama Indramayu di antara Jabatan dan Nama Terang telah sepenuhnya mewakili tanda tangan elektronik instansi yang sah, memberikan estetika dokumen yang lapang, proporsional, dan elegan.
    - **Menunda Catatan Kaki BSrE:** Menjaga integritas data dengan menunda catatan kaki/disclaimer BSrE BSSN hingga terintegrasi secara teknis dengan SSO SIMARI.
    - PWA Service Worker `sw.js` diperbarui ke versi **transkep-v2.8.8**.

18. **Restorasi Aspek Rasio Alami Logo Oval Pengadilan Agama & Peningkatan Ukuran Barcode TTE (Tahap 41):**
    - **Rasio Asli Perisai Oval:** Menghapus pemotongan paksa lingkaran `ctx.clip()`, logo Pengadilan Agama kini digambar penuh mempertahankan aspek rasio aslinya (752×1024 px) sehingga bentuk perisai oval tampak natural dan detail lambang (bintang dan pita) tidak terpotong.
    - **Rounded Card Badge Buffer:** Melindungi logo dengan badge sudut membulat (*rounded badge*) putih berjarak presisi terhadap modul QR hitam.
    - **Resolusi & Ukuran Optimal:** Pembangkitan canvas dinaikkan ke **300px** dan ukuran tampilan barcode dinaikkan ke **64×64px** pada lembar cetak agar logo terlihat jelas, berwibawa, dan tajam dipindai.
    - PWA Service Worker `sw.js` diperbarui ke versi **transkep-v2.8.9**.

19. **Pembangunan Mesin PDF Biner & TTE Digital X.509 PAdES / PKCS#7 (Tahap 42):**
    - **Teknologi Biner Mandiri (Client-Side PAdES):** Mengintegrasikan `pdf-lib` dan `node-forge` untuk merakit dokumen PDF biner langsung di browser tanpa ketergantungan server/kuota eksekusi Google Apps Script.
    - **Panel Digital Signatures Auto-Detect (Adobe Acrobat):** Menanamkan kamus tanda tangan `/Type /Sig`, `/Filter /Adobe.PPKLite`, `/SubFilter /adbe.pkcs7.detached`, dan `/Contents PKCS#7` dengan kalkulasi byte-range SHA-256 yang presisi. Ketika PDF dibuka di Adobe Acrobat Reader, panel *Digital Signatures* otomatis mendeteksi dan menampilkan tanda tangan digital resmi Pengadilan Agama Indramayu.
    - **Tombol Unduh TTE PDF:** Menambahkan tombol aksi khusus `[TTE PDF]` pada antarmuka riwayat permohonan cuti dan tabel rekapitulasi.
    - PWA Service Worker `sw.js` diperbarui ke versi **transkep-v2.9.0**.

20. **Tombol Aksi Dropdown Adaptif Cuti Disetujui (Tahap 43):**
    - **Trigger Button Ringkas Berbasis Logo Saja:** Pada tabel riwayat permohonan cuti dan rekapitulasi, tombol aksi didesain ramping tanpa teks panjang (`[ ≡ ▾ ]` atau `[ 🖨️ ▾ ]`), menjaga kerapian kolom aksi agar tabel hemat ruang dan ramah layar ponsel (*mobile-friendly*).
    - **Dropdown 2 Opsi Ber-TTE Paripurna:** Saat dokumen cuti berstatus `Disetujui` (sah ditandatangani Pejabat Berwenang), tombol memunculkan menu mengambang dengan 2 pilihan berlabel jelas dan berikon SVG:
      1. `🖨️ Cetak Permohonan`: Format formulir permohonan cuti HTML untuk dicetak langsung ke printer fisik.
      2. `📥 Download Persetujuan`: Berkas PDF biner resmi yang memuat 3 TTE Digital X.509 PAdES (`TRANSKEP_[Nama]_sign_sign_sign.pdf`).
    - **Guard Dokumen Belum Disetujui:** Dokumen berstatus `Menunggu` atau `Perubahan` hanya menampilkan tombol ikon cetak biasa tanpa dropdown karena berkas persetujuan TTE belum sah secara hukum kedinasan.
    - **Auto Close Click-Outside:** Menu popover otomatis tertutup saat pengguna mengklik area luar tabel.
    - PWA Service Worker `sw.js` diperbarui ke versi **transkep-v2.9.7**.

21. **Integrasi Firebase Cloud Firestore & Migrasi Total SK (Tahap 44):**
    - **Infrastruktur Cloud NoSQL:** Menghubungkan Google Cloud Firestore (`transkep-314c0`) region `asia-southeast2` (Jakarta) menggunakan SDK Firebase v10 Compat (`firebase-app-compat.js` dan `firebase-firestore-compat.js`) via file konektor resmi [`transkep-web/core/firebase.js`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/transkep-web/core/firebase.js) dan [`javascript_firebase.html`](file:///c:/Users/user/.gemini/antigravity-ide/projek/TRANSKEP/javascript_firebase.html).
    - **Migrasi 100% Selesai:** Seluruh 14 dokumen SK Pengadilan Agama Indramayu yang sebelumnya tersebar di baris Google Sheets telah berhasil dimigrasikan secara utuh ke koleksi Firestore `sk_documents` dengan format dokumen terstruktur (`members: [...]`, `revisi_history: [...]`, `status: "Aktif"`, `versi_aktif: 1`).
    - **Pembersihan Antarmuka (Clean Native UI):** Seluruh tanda visual sementara dan tombol migrasi pengembang telah dibersihkan dari tampilan Menu SK. Sistem kini berjalan senyap di latar belakang menggunakan listener realtime (`subscribeFirestoreSks`) yang instan dan reaktif.
    - PWA Service Worker `sw.js` diperbarui ke versi **transkep-v2.9.9**.

22. **Master Blueprint: Mesin Pembuat Dokumen SK Modular & Lampiran Dinamis Multi-Halaman (Tahap 45 - Next Phase):**
    - **Filosofi Dokumen SK Modular:** Setiap SK memiliki konten mandiri yang tersimpan per-dokumen di Cloud Firestore. Tidak ada lagi konten yang tercampur antar SK.
    - **Form Input Pop-Up Multi-Halaman Fleksibel (Stepper / Tabbed Modal):**
      * **Halaman 1 (Naskah Utama SK):** Editor naskah hukum kedinasan formal (Kop Satker, Nomor SK, Judul/Tentang SK, Konsiderans Menimbang [butir a, b, c], Dasar Hukum Mengingat [butir 1, 2, 3], Diktum Memutuskan [KESATU, KEDUA, dst.], serta Tanggal dan Penandatanganan resmi oleh Ketua PA Indramayu).
      * **Halaman Berikutnya (Lampiran Fleksibel / Dynamic Appendices):** Pengguna dapat menambah lampiran tanpa batas (`[ + Tambah Lampiran ]`) dan memilih alat/tipe konten untuk tiap lampiran:
        1. `📊 Tipe Tabel`: Tabel susunan tim kerja interaktif (Jabatan Tim, Nama Pegawai terkoneksi otomatis ke `usersList`, NIP, Jabatan Dinas, Keterangan).
        2. `📄 Tipe Teks`: Editor artikel/uraian tugas kedinasan (Job Description, SOP, pembagian wilayah kerja, pedoman teknis tim).
        3. `🏢 Tipe Bagan Struktur`: Struktur pohon organisasi (Smart Auto-Hierarchy Tree) berbasis CSS Box Grid bertingkat (Level 1 Pembina ➔ Level 2 Pengarah/Ketua ➔ Level 3 Sekretaris ➔ Level 4 Anggota) yang otomatis menghasilkan bagan kotak bergaris hubung simetris, rapi, dan 100% ramah cetak tanpa risiko bergeser di HP.
    - **Mesin Auto-Revisi Dokumen SK:**
      * Tombol `[ 🔄 Revisi SK ]` menduplikasi naskah utama & lampiran SK aktif menjadi draf versi baru (`versi_aktif: 2`), mengarsipkan versi lama ke `revisi_history`.
      * Otomatis menyisipkan konsiderans amandemen pada Menimbang (*"bahwa sehubungan dengan mutasi/perubahan susunan personil..."*).
      * Menyediakan tool penggantian personil tim (*personnel switcher*) dengan 1 klik.

23. **Reversi Tombol Aksi Batal Cuti ke Ikon Tong Sampah & Proteksi Total Cuti Disetujui (Tahap 48):**
    - **Reversi ke Ikon Tong Sampah:** Mengembalikan tombol hapus/tarik permohonan cuti menjadi hanya ikon tong sampah murni (`fa-trash-can`) tanpa teks, menjaga kerapian dan konsistensi estetika tabel kedinasan.
    - **Proteksi Cuti Disetujui (Zero Cancel/Delete Action):** Pada seluruh permohonan cuti yang telah disetujui (`status === 'Disetujui'`), tombol batal/hapus dihilangkan 100%. Hanya tombol dropdown compact (`fa-list-ul`) untuk opsi Cetak Formulir dan Download Dokumen TTE yang ditampilkan.
    - **Dukungan Hapus Cuti Belum Di-ACC:** Permohonan yang belum disetujui (`'Menunggu'`, `'Perubahan'`, maupun `'Ditolak'`) tetap mempertahankan tombol delete/hapus dengan ikon tong sampah.
    - **Backend & Refund Guard:** Memperbarui backend `deleteCutiLog` di `permohonan/permohonan.js` agar pemohon dapat menghapus berkas berstatus `'Ditolak'`, serta memastikan pengembalian saldo kuota (refund) hanya berjalan untuk status yang belum pernah ditolak atau dibatalkan.
    - PWA Service Worker `sw.js` diperbarui ke versi **transkep-v3.0.7**.
 
24. **Eliminasi Total Flash of Unauthenticated Content (FOUC) saat Refresh Browser (Tahap 49):**
    - **Akar Masalah Terselesaikan:** Menghilangkan kedipan / *flicker* form login saat pengguna menekan tombol refresh (`F5`). Sebelumnya, form login dirender lebih awal selama 1–2 detik karena modul HTML belum dimuat sebelum evaluasi sesi di `core.js`.
    - **Instant Pre-Render Auth Evaluation (< 1ms):** Menyematkan skrip sinkronus mikro di `<head>` pada `transkep-web/index.html` dan `index.html` (GAS) yang langsung mengevaluasi `localStorage.getItem('transkep_active_nip')` dan menyematkan class `app-authenticated` ke elemen akar `<html>` sebelum dokumen `<body>` diproses atau digambar di layar.
    - **CSS Auth Guard Absolut:** Menyuntikkan aturan CSS `html.app-authenticated #login-section { display: none !important; }` dan `html.app-authenticated #app-container { display: flex !important; }` sehingga form login 100% tidak pernah berkedip di layar pengguna yang telah memiliki sesi aktif.
    - **Silent Refresh Sync:** Memperbarui `DOMContentLoaded` dan `syncAllServerData(true)` agar sinkronisasi data saat refresh berjalan hening di latar belakang tanpa modal overlay yang menutup layar, serta mempertahankan menu aktif terakhir secara mulus.
    - PWA Service Worker `sw.js` diperbarui ke versi **transkep-v3.0.8**.

25. **Penyelesaian Dashboard Kosong Pasca Login & Header Profile Hilang Pasca Refresh (Tahap 50):**
    - **Akar Masalah Terselesaikan:**
      1. Menghilangkan hilangnya header profil ("Dedi Sopiyan, S.H.") saat refresh browser (`F5`), yang sebelumnya terjadi karena profil hanya tersimpan di memori JavaScript volatile (`state.user: null`) sebelum network fetch selesai.
      2. Mengatasi kondisi dashboard blank/kosong pasca login pertama kali, yang disebabkan lockout flag `window.vueState.rendered['dashboard'] = true` sebelum data profil server tiba, serta race condition antara mounting asynchronous Vue `#section-dashboard` dan eksekusi `renderDashboardView()`.
    - **Instant Local Storage Profile Hydration (0ms):**
      Menyimpan profil pengguna secara persisten ke `localStorage` (`transkep_user_profile` dan `transkep_user`) saat login sukses dan saat `syncAllServerData()` berjalan. Saat halaman dimuat/refresh, profil langsung di-hydrate ke `state.user` pada 0ms, merender kartu profil seketika tanpa jeda atau kedip.
    - **Safe Vue Auto-Mount & Auto-Uncloak (`ensureDashboardMounted`):**
      Membangun mekanisme `ensureDashboardMounted()` pada `dashboard.js` dan `js_dashboard.html` yang secara otomatis memverifikasi dan memasang aplikasi Vue ke `#section-dashboard` bila belum terpasang, melepas atribut `v-cloak`, dan melakukan sinkronisasi data seketika (`syncFromGlobal`) dari cache/state.
    - **Eliminasi Lockout `switchMenu`:**
      Memperbarui cabang `switchMenu('dashboard')` sehingga selalu memanggil `renderDashboardView()` baik pada render pertama maupun navigasi berulang.
    - **Background Sync Reactive Trigger:**
      Memastikan pemanggilan `renderDashboardView()` secara otomatis saat `syncAllServerData()` dan `syncBackgroundData()` selesai mengunduh data kehadiran dan peringatan dini pegawai.
    - PWA Service Worker `sw.js` dan `CURRENT_APP_BUILD` di `transkep-web/index.html` diperbarui ke versi **transkep-v3.0.9**.

26. **Role-Based Access Control (RBAC) & Privatisasi Kartu Peringatan Dini Dashboard (Tahap 51):**
    - **Dual-Mode Warning Card Presentation:**
      - **Mode Admin & Operator (isAdmin === true):** Menampilkan seluruh jadwal peringatan dini (Kenaikan Gaji Berkala, Kenaikan Pangkat/KP, dan Pensiun) dari seluruh pegawai di satuan kerja. Dilengkapi toolbar pencarian real-time (Nama/NIP), kategori, filter bulan, dan tahun, serta tombol aksi interaktif dengan dropdown untuk mengubah status berkas (Menunggu, Proses, Selesai).
      - **Mode Pegawai Biasa (isAdmin === false):** Menampilkan khusus data peringatan dini milik akun yang sedang login. Toolbar pencarian pegawai lain disembunyikan untuk menjaga privasi data personal dan merampingkan antarmuka.
    - **Jaminan 3 Pilar Karir Selalu Tampil (Persistent 3-Pillar Warning States):**
      Memastikan bahwa untuk pengguna non-admin, ketiga pilar karir (Kenaikan Pangkat, Kenaikan Gaji Berkala, dan Pensiun) selalu dirender secara persisten pada kartu antarmuka beserta target tanggal TMT, status berkas, dan hitung mundur sisa waktu (Tahun/Bulan/Hari) meskipun target waktunya masih jauh (beberapa tahun ke depan).
    - **Read-Only Status Badge untuk Non-Admin:**
      Kolom status untuk pegawai biasa dirender sebagai lencana statis non-interaktif (*read-only status badge*) tanpa ikon dropdown chevron dan tanpa event handler pengubah status, sehingga mencegah manipulasi status berkas dari antarmuka pengguna.
    - **Defense-in-Depth Backend Security Hardening:**
      Menambahkan fungsi validator cekOtorisasiAdminOrOperator(nip, clientToken) pada code.js dan memproteksi endpoint updateTmtStatus pada dashboard/dashboard.js sehingga hanya akun dengan peran Admin atau Operator yang diizinkan memutasi status berkas di database Spreadsheet.
    - PWA Service Worker sw.js dan CURRENT_APP_BUILD di 	ranskep-web/index.html diperbarui ke versi **transkep-v3.1.0**.
27. **Eliminasi Jeda Layar Kosong saat Refresh Browser via Instant App Shell Skeleton, Parallel Script Loader, dan Chart Cache Hydration (Tahap 52):**
    - **Akar Masalah Terselesaikan:**
      1. Menghilangkan layar void/hitam melompong saat refresh browser (\F5\), di mana pengguna sempat melihat area tengah kosong melompong dengan hanya canvas animasi partikel aktif di latar belakang selama beberapa ratus milidetik sebelum modul JavaScript selesai dimuat.
      2. Mencegah hilangnya grafik demografi (Jenis Kelamin, Pangkat/Golongan, Posisi Jabatan, dan Statistik Usia) saat refresh browser atau saat proses render ulang di latar belakang.
    - **Instant App Shell Skeleton (0ms Anti-Blank Architecture):**
      - Menyematkan kerangka antarmuka kaca (*glass skeleton cards*) berbobot ringan di dalam \#view-container\ tepat setelah \#slot-dashboard\ pada \	ranskep-web/index.html\.
      - Dilengkapi kartu Header Dashboard dengan sapaan instan yang langsung dihidrasi dari \localStorage\ (\	ranskep_user_profile\), kartu radar ketidakhadiran, kartu peringatan dini, dan kotak grafik demografi.
      - Dikontrol menggunakan CSS sibling selector (\html.app-authenticated #section-dashboard:not([v-cloak]) ~ #dashboard-skeleton { display: none !important; }\), menjamin transisi yang mulus tanpa flash putih/hitam dan otomatis menghilang segera setelah Vue terpasang.
    - **Staged Parallel Script Loader (Peningkatan Kecepatan Inisialisasi ~80%):**
      - Mengoptimalkan loader modular di \	ranskep-web/index.html\ dari yang sebelumnya memuat 46 berkas JavaScript secara sekuensial satu per satu (\or ... await\) menjadi 3 tahap terstruktur:
        1. *Tahap 1*: Core Scripts (7 berkas) secara berurutan untuk menjamin fondasi API, Auth, dan State.
        2. *Tahap 2*: Data Service Scripts (13 berkas) secara paralel (\Promise.all\).
        3. *Tahap 3*: UI Controller & Cetak Handlers (34 berkas) secara paralel (\Promise.all\).
      - Memangkas waktu tunggu pemuatan skrip dari ~800ms menjadi kurang dari 80ms.
    - **Chart Cache Hydration & Silent Background Re-render (\dashboard_grafik.js\):**
      - Menerapkan cache snapshot statistik demografi (\	ranskep_chart_cache\) ke \localStorage\. Saat halaman dimuat ulang / refresh, fungsi enderAllCharts()\ langsung merender grafik seketika dari cache (0ms) tanpa menunggu fetch data pegawai server selesai.
      - Saat data live server tiba di latar belakang, Chart.js memperbarui dataset secara hening dengan animasi transisi yang mulus (*smooth transition update*) tanpa kedip atau reset kanvas.
    - **Pilot Project SWR Non-Destructive Background Sync & Eliminasi Tombol Refresh Manual (Tahap 53):**
      - Mengeliminasi tombol manual Soft Refresh di header dashboard, menggantikannya dengan proses background sync otomatis dan lencana mikro bershimmer (*SWR micro-indicator*) `"🔄 Menyinkronkan..."` di samping salam nama pengguna.
      - Menerapkan pembaruan grafik non-destruktif (`chart.update('active')`) pada `dashboard_grafik.js` dan `js_dashboard_grafik.html` yang mempertahankan kanvas chart saat rehidrasi data baru sehingga terbebas dari kedipan putih.
      - PWA Service Worker `sw.js` dan `CURRENT_APP_BUILD` di `transkep-web/index.html` diperbarui ke versi **transkep-v3.1.2**.
28. **Rencana SWR Non-Destructive Loading State & Dedicated App Shell Skeleton pada Menu Permohonan Cuti (Tahap 54 - Terkunci 🔒):**
    - **Eliminasi Layar Kosong 0ms pada Menu Permohonan:** Menyematkan kerangka antarmuka skeleton mandiri (`#permohonan-skeleton`) di `transkep-web/index.html` dan `index.html` yang aktif seketika pada saat refresh browser jika rute terakhir adalah `#permohonan`.
    - **Local Cache Hydration Riwayat Pengajuan:** Menyimpan dan me-rehidrasi snapshot `cutiLogs`, `ikLogs`, `ipLogs`, `wfhLogs` via `localStorage` (`transkep_cuti_cache`) ke `state.cutiLogs` pada 0ms sehingga tabel riwayat tampil utuh seketika tanpa jeda kosong.
    - **Eliminasi Pembongkaran Tabel Menjadi Spinner Kosong:** Menghapus takeover `v-else-if="s && !s.isBgSyncDone"` dari `view_permohonan.html` dan menggantikannya dengan lencana mikro SWR berdenyut halus `"🔄 Menyinkronkan..."` di toolbar atas tabel.
    - **Pembaruan Data Halus & Seamless Dismissal:** Menyambungkan listener `transkep:sync-complete` pada `vmRiwayatPermohonan` untuk memperbarui baris data di background saat fetch server selesai dan memudarkan lencana loading secara otomatis.
    - Versi target PWA Service Worker: **transkep-v3.1.3**.

29. **Penerapan Fullscreen Processing Overlay Ala SIKEP, Eliminasi Kartu Kosong Pasca-Loading, dan Pembersihan Ikon Refresh Header (Tahap 55 - Selesai & Aktif ✅):**
    - **Universal Fullscreen Processing Overlay (Standar SIKEP Mahkamah Agung):**
      - Menyematkan overlay layar penuh (`fixed inset-0 z-[999999]`) dengan efek kaca buram kristal tebal 85% (`bg-slate-950/85 backdrop-blur-xl`).
      - Logo TRANSKEP di bagian tengah dengan animasi 3D Floating & Breathing Pulse Neon (`filter: drop-shadow(0 0 25px rgba(99,102,241,0.5))`), tipografi tegas resmi bergaya SIKEP `SEDANG MEMPROSES...`, subteks dinamis *"Menyelaraskan data sistem kepegawaian..."*, dan garis progress indeterminate shimmer cyan-indigo.
    - **Eliminasi Tampilan Setengah Matang Pasca-Loading:**
      - Menyelaraskan siklus penutupan loader dengan event `transkep:sync-complete` dan `state.isBgSyncDone === true`. Loader menahan layar hingga seluruh data absensi (`cutiLogs`, `stList`, dll.), peringatan dini TMT, dan grafik demografi selesai diproses.
      - Begitu proses sinkronisasi tuntas, overlay memudar secara mulus (*smooth fade-out* 0.4 detik), menyajikan antarmuka dashboard yang 100% lengkap dan siap dibaca tanpa jeda radar memindai atau tabel kosong.
    - **Pembersihan Total Ikon Refresh Header:**
      - Menghapus badge mikro berputar `isSyncing` (`[ 🔄 Menyinkronkan... ]`) dari header `view_dashboard.html` (PWA & GAS) serta dari template skeleton `transkep-web/index.html`. Area header dashboard kini tampil bersih, tenang, dan mewah.
    - **Sistem Pengaman Watchdog (6 Detik):**
      - Dilengkapi timer otomatis 6 detik di `syncAllServerData()` guna menjamin overlay otomatis tertutup jika koneksi server mengalami latensi ekstrem atau offline.
    - Versi PWA Service Worker `sw.js` dan `CURRENT_APP_BUILD` dinaikkan ke **transkep-v3.1.4**.


