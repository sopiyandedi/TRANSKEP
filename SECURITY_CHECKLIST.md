# TRANSKEP Security, Testing & Deploy Guardrails Checklist

Dokumen ini menjadi panduan permanen agar setiap pengembangan fitur baru di **TRANSKEP** tidak merusak kontrol keamanan, skema Firestore, maupun sinkronisasi rilis PWA.

---

## 1. Perintah Harian & Deploy CLI

| Kebutuhan | Perintah | Keterangan |
| :--- | :--- | :--- |
| Jalankan seluruh uji regresi keamanan & skema | `npm test` | Menjalankan 5 suite di [`tests/run_all.js`](tests/run_all.js) (Fase 1, Fase 2, Fase 3A, Fase 3B, serta Schema & PWA Sync) tanpa dependensi eksternal. |
| Deploy backend Google Apps Script | `npx clasp push` | Mengunggah berkas backend `.js` & `appsscript.json` saja; folder [`tests/`](tests/), [`.github/`](.github/), [`n8n/`](n8n/), [`firestore.rules`](firestore.rules), [`firebase.json`](firebase.json), [`.firebaserc`](.firebaserc), dan `*.md` dikecualikan otomatis di [`.claspignore`](.claspignore). |
| Deploy Firestore Security Rules ke Firebase (`transkep-314c0`) | `npm run deploy:rules` | Menjalankan `npx -y firebase-tools@latest deploy --only firestore:rules` langsung ke proyek default [`transkep-314c0`](.firebaserc) sesuai [`firebase.json`](firebase.json) tanpa copy-paste manual di Console. |

> [!IMPORTANT]
> **`clasp push` TIDAK menyentuh `ScriptProperties` Apps Script.** Nilai sensitif maupun pengaturan bawaan (`ST_DEFAULT_MATA_ANGGARAN`, `ST_DEFAULT_PPK`, API key, dsb.) di Google Apps Script Project Settings tetap utuh dan tidak tertimpa saat push kode.

---

## 2. 6 Aturan Wajib Sebelum Mengubah Kode

1. **Autentikasi, RBAC & Allowlist RPC (`code.js`, `api_router.js`)**
   - Setiap fungsi backend sensitif wajib memanggil `resolveCallerSession_(nip, token)` / `validateSession_()` dari server dan memeriksa hak akses via `isAdminRole_(sess.role)` atau kepemilikan `sess.nip` (jangan pernah mempercayai `role` atau `nip` dari argumen payload klien).
   - Fungsi RPC baru yang dipanggil dari frontend harus didaftarkan di `AUTHENTICATED_RPC_METHODS_` (atau `PUBLIC_RPC_METHODS_` hanya jika benar-benar publik) pada [`api_router.js`](api_router.js).
   - Dilarang mengembalikan `temp_pass` atau memasang bypass `payload.secret_key` pada handler frontend/pengguna.

2. **Anti-XSS & Anti-Formula Injection**
   - Seluruh data pegawai/input pengguna yang disisipkan ke DOM melalui HTML string wajib lolos `escHtml()` / `escapeHtml()` (atau `sanitizeUiHtml()` bila butuh markup terbatas aman) di [`core/core.js`](core/core.js). Hindari interpolasi string mentah di `onclick="..."` — gunakan atribut `data-*` (`this.dataset.*`).
   - Blokir skema `javascript:`/`data:` pada tautan URL dinamis; di backend GAS wajib memakai `escapeHtmlGas_()` untuk HTML PDF dan `sanitizeSheetCell_()` sebelum menulis nilai ke Google Sheets.

3. **Keamanan File Google Drive & Validasi Upload**
   - Dilarang keras menyetel `DriveApp.Access.ANYONE_WITH_LINK` (file sensitif wajib `DriveApp.Access.PRIVATE`).
   - Buka berkas terproteksi melalui proxy binary (`getDriveFileBlob` / `getMagicFilePreview` -> `openSecureDriveFile()`) atau viewer PDF/Flipbook di [`modules/pdf_viewer/pdf_viewer.js`](modules/pdf_viewer/pdf_viewer.js).
   - Pertahankan validasi MIME, ekstensi, ukuran maksimum, dan guard pre-mutasi sebelum mengubah baris Google Sheets.

4. **Sinkronisasi Cloud Firestore & Auth Gating ([`core/firebase.js`](core/firebase.js) ↔ [`firestore.rules`](firestore.rules))**
   - Setiap penambahan/perubahan nama field atau nilai `status` pada payload `save*ToFirestore` (atau penulisan di [`modules/pkp/pkp_data.js`](modules/pkp/pkp_data.js) / [`core/core.js`](core/core.js)) wajib diperbarui juga pada fungsi validator `isValid*` terkait di [`firestore.rules`](firestore.rules).
   - Setiap metode `getFirestore*` wajib melewati `this._ensureAuthForRead(requireAdmin)` dan setiap listener `subscribeFirestore*` wajib melewati `this._whenAuthGatedSnapshot(...)` agar pra-login & pengguna non-Admin tidak memicu error izin.

5. **Zero-Secret Git & Isolasi [`n8n/`](n8n/README.md)**
   - Jangan pernah menaruh API key, password, nomor telepon admin, ID kredensial SSH/Gemini, atau service account JSON di file yang dilacak Git.
   - Workflow operasional `n8n/*.json` sudah terisolasi di [`.gitignore`](.gitignore); hanya template `.example.json` tersanitasi yang boleh di-commit.

6. **Sinkronisasi 3 Titik Versi PWA**
   - Jika mengubah file frontend (`.html`, `.js`, `.css`), wajib memperbarui versi semver secara identik di 3 lokasi:
     1. `window.APP_BUILD_VER = 'X.Y.Z'` (bagian atas [`index.html`](index.html))
     2. `const APP_BUILD_VER = window.APP_BUILD_VER || 'X.Y.Z'` (loader modul di [`index.html`](index.html))
     3. `const CACHE_NAME = 'transkep-vX.Y.Z'` (di [`sw.js`](sw.js))

---

## 3. Otomatisasi CI (GitHub Actions)

Workflow [`.github/workflows/security-check.yml`](.github/workflows/security-check.yml) otomatis menjalankan `npm test` (5 suite di [`tests/`](tests/run_all.js)) pada setiap `push` maupun `pull_request` ke branch `main`. Jika ada regresi keamanan, ketidaksesuaian schema Firestore, kebocoran di `n8n/*.example.json`, atau selisih 3 titik versi PWA, CI akan menandai commit gagal sebelum meluncur ke produksi.

---

## 4. Inventarisasi Kunci `PropertiesService.getScriptProperties()`

Daftar di bawah ini adalah **nama kunci** yang dipakai oleh kode backend Apps Script (nilai aktual disimpan privat di **Apps Script → Project Settings → Script Properties**, bukan di Git):

### A. Keamanan, Database & Integrasi Eksternal (Rahasia — Wajib Privat)
- `TRANSKEP_DB_ID` — ID Google Spreadsheet database utama ([`code.js`](code.js), [`setup.js`](setup.js), [`backup.js`](backup.js))
- `TRANSKEP_SESSION_SECRET` — Kunci penandatangan HMAC sesi login pengguna ([`code.js`](code.js))
- `TRANSKEP_ENC_SECRET` — Kunci enkripsi vault PII server-side ([`code.js`](code.js))
- `FIREBASE_SERVICE_ACCOUNT_JSON` — JSON Service Account RS256 untuk mencetak Custom Token Firebase ([`code.js`](code.js))
- `TRANSKEP_WEBHOOK_KEY` — Secret key autentikasi webhook masuk/keluar ([`code.js`](code.js), [`permohonan/persetujuan.js`](permohonan/persetujuan.js), [`permohonan/st/st.js`](permohonan/st/st.js))
- `WAHA_API_KEY` — API key gateway WhatsApp WAHA ([`code.js`](code.js))
- `N8N_WEBHOOK_URL` / `WAHA_BASE_URL` — Endpoint gateway notifikasi WA ([`code.js`](code.js))
- `N8N_WEBHOOK_SURAT_KELUAR` — Endpoint webhook n8n generator Surat Keluar ([`permohonan/persetujuan.js`](permohonan/persetujuan.js), [`permohonan/st/st.js`](permohonan/st/st.js))
- `WAHA_SESSION` — Nama sesi WAHA (bawaan `'default'`) ([`code.js`](code.js))
- `ADMIN_TEST_PHONE` — Nomor WA admin untuk uji koneksi `testWaha` ([`code.js`](code.js))
- `TRANSKEP_EXEC_URL` — URL `/exec` Web App Apps Script produksi ([`permohonan/persetujuan.js`](permohonan/persetujuan.js), [`permohonan/st/st.js`](permohonan/st/st.js))

### B. Pengisian Otomatis Surat Tugas ([`permohonan/st/st.js`](permohonan/st/st.js))
Dikelola langsung melalui UI admin (**Pengaturan ST** → `saveSettingsST` / `getSettingsST`), sehingga tidak perlu dan tidak disarankan dikelola lewat `clasp push`:
- `ST_DEFAULT_PPK`
- `ST_DEFAULT_MENIMBANG`
- `ST_DEFAULT_DASAR`
- `ST_DEFAULT_INSTANSI`
- `ST_DEFAULT_MATA_ANGGARAN`
- `ST_DEFAULT_ANGKUTAN`
- `ST_DEFAULT_PARAGRAF_BIAYA`

### C. Konfigurasi Dokumen KGB & State Internal Sistem
- `TEMPLATE_KGB_DOC_ID` — ID template Google Docs KGB ([`eoffice/kgb.js`](eoffice/kgb.js))
- `FOLDER_KGB_DRIVE_ID` — ID folder arsip KGB Google Drive ([`code.js`](code.js), [`eoffice/kgb.js`](eoffice/kgb.js))
- `TRANSKEP_REVOKED_JTIS` — Daftar `jti` token sesi yang dicabut ([`code.js`](code.js), dikelola otomatis)
- `TRANSKEP_DATA_VERSION` — Versi perubahan data Sheets ([`code.js`](code.js), dikelola otomatis)
- `LAST_CUTI_ROLLOVER_YEAR` & `CUTI_UTUH_NIPS_<tahun>` — Penanda rollover cuti tahunan ([`code.js`](code.js), dikelola otomatis)

