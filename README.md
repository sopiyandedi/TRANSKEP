# TRANSKEP v3.0 - Frontend Web App (Pengadilan Agama Indramayu)

Portal Transparansi Kepegawaian (TRANSKEP) versi mandiri (Modern SPA) yang dirancang untuk di-deploy ke **GitHub Pages** dan dihubungkan ke domain resmi **`transkep.pa-indramayu.go.id`**.

---

## 🚀 Keunggulan Arsitektur v3.5 (Clean & Native Modular Architecture)

1. **Struktur Kode Terpisah & Modular (Mudah Dirawat):**
   - **Backend:** Google Apps Script murni (`code.js`, `api_router.js`, Google Sheets).
   - **CSS (`css/`):** Terisolasi untuk styling (`stylesheet.css`, `mobile.css`, `animations.css`, `custom.css`).
   - **JavaScript (`js/`):** 15 modul controller Vue terpisah per fitur (`dashboard.js`, `permohonan.js`, `pkp.js`, `jobdes.js`, `sk_sop.js`, `eoffice.js`, dll.).
   - **HTML Components (`views/`):** Seluruh tampilan HTML dipecah rapi ke 17 file komponen modular (`view_dashboard.html`, `view_permohonan.html`, `view_pkp.html`, dll.). Tidak ada lagi file raksasa 7.000 baris!
   - **File `index.html` Ramping:** Berukuran hanya ~200 baris sebagai kontainer utama.
2. **Zero-Build Step (Pengeditan Instan):**
   - Tidak memerlukan Node.js build atau compiler rumit.
   - Cukup edit file di folder `views/` (misal `views/view_dashboard.html`), simpan, dan refresh browser &rarr; perubahan langsung tampil seketika!
3. **Progressive Web App (PWA) Ready:** Dilengkapi `manifest.json` dan Service Worker (`sw.js`). Pengguna dapat menginstall TRANSKEP ke layar utama (Home Screen) smartphone Android/iOS maupun desktop tanpa perlu unduh dari Play Store/App Store.
4. **Offline Asset Caching & Ultra-Fast Load:** Menggunakan strategi caching Stale-While-Revalidate untuk aset lokal dan CDN. Waktu buka aplikasi instan (0ms load time).
5. **Anti-CORS Protocol:** Menggunakan protokol `text/plain` ke Google Apps Script sehingga kebal dari blokir CORS browser.
6. **In-Memory Caching:** Navigasi cepat, minim kuota eksekusi Google Apps Script, dan waktu respon instan.
7. **Keamanan Sesi Ganda:** Token sesi tersimpan aman dan terintegrasi dengan `CacheService` server Google Apps Script.

---

## 🛠️ Langkah Pemasangan ke GitHub Pages

### 1. Buat Repositori Baru di GitHub
1. Buka [github.com/new](https://github.com/new).
2. Beri nama repositori: `transkep-web`.
3. Set visibilitas ke **Public** (agar bisa menggunakan GitHub Pages gratis) dan biarkan repositori kosong.

### 2. Push Folder Ini ke GitHub
Buka terminal di dalam folder `transkep-web` ini:
```bash
git init
git add .
git commit -m "feat: inisialisasi frontend transkep-web v3.0"
git branch -M main
git remote add origin https://github.com/<USERNAME_GITHUB>/transkep-web.git
git push -u origin main
```

### 3. Aktifkan GitHub Pages
1. Masuk ke halaman repositori di GitHub -> **Settings** -> **Pages**.
2. Pada bagian **Build and deployment**:
   - Source: **Deploy from a branch**
   - Branch: **main** / root -> Klik **Save**.
3. Dalam 1-2 menit, situs Anda akan aktif di URL:
   `https://<USERNAME_GITHUB>.github.io/transkep-web/`

### 4. Hubungkan Domain Resmi (`transkep.pa-indramayu.go.id`)
1. Di menu **Settings** -> **Pages** -> kolom **Custom domain**, masukkan: `transkep.pa-indramayu.go.id`.
2. Di panel DNS Domain Pengadilan Agama Indramayu, tambahkan record **CNAME**:
   - Host/Name: `transkep`
   - Target/Points to: `<USERNAME_GITHUB>.github.io`
3. Centang **Enforce HTTPS** setelah sertifikat SSL aktif.

### 5. Hubungkan ke Backend Google Apps Script
1. Buka website Anda di browser.
2. Klik tombol **Pengaturan API** di pojok kanan atas.
3. Tempelkan URL Web App Deployment Google Apps Script Anda (berakhiran `/exec`), lalu klik **Simpan URL**.
4. Selesai! Aplikasi kini terhubung langsung ke database Google Sheets Anda secara paralel.

---

## 🌐 Opsi Deployment Alternatif Lainnya

### A. Cloudflare Pages / Vercel (Rekomendasi Kecepatan CDN Maksimal)
1. Hubungkan akun GitHub Anda ke [Cloudflare Pages](https://pages.cloudflare.com) atau [Vercel](https://vercel.com).
2. Pilih repositori `transkep-web`.
3. Framework preset: **None / Other** (Static Site).
4. Root directory: `./` (atau `transkep-web`).
5. Klik **Deploy**. Situs akan langsung aktif dengan HTTPS otomatis dan perlindungan DDOS global.

### B. Intranet Kantor / Web Server Lokal (XAMPP / Nginx / IIS)
1. Salin seluruh isi folder `transkep-web` ke folder public web server:
   - **XAMPP:** `C:\xampp\htdocs\transkep\`
   - **Nginx:** `/var/www/html/transkep/`
   - **IIS:** `C:\inetpub\wwwroot\transkep\`
2. Akses melalui jaringan LAN kantor via IP atau domain lokal: `http://192.168.x.x/transkep/`.
3. PWA akan tetap berfungsi jika disajikan melalui `localhost` atau HTTPS lokal.

