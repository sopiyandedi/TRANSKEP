ROLE & OBJECTIVE

Kamu adalah Senior Cloud Security & Frontend Modular Architect. Tugas kamu adalah melakukan refactoring arsitektur keamanan dan koneksi Firebase pada proyek Transkep (sso.pa-indramayu.go.id) menjadi Component-Based (Satu File Pusat) tanpa merusak desain <style>, tampilan UI, maupun logika bisnis yang sudah berjalan di seluruh modul (index.html, dashboard/, eoffice/, front_view/, jobdes/, kinerja/, pegawai/, permohonan/).

INSTRUKSI EKSEKUSI WAJIB

1. Buat Modul Pusat: /core/transkep-security-core.js (atau di root /transkep-security-core.js)

Buat satu file JavaScript modular terpusat yang menangani seluruh keamanan siber dan inisialisasi Firebase untuk seluruh halaman aplikasi Transkep dengan fitur wajib berikut:

A. Centralized Firebase & App Check Ready Connector

Pusatkan konfigurasi firebaseConfig (Project ID: transkep-314c0) di dalam file ini sehingga tidak terduplikasi secara berantakan di tiap modul.

Siapkan variabel konstanta TRANSKEP_RECAPTCHA_SITE_KEY = '' di bagian paling atas file. Buat logika otomatis: jika konstanta tersebut sudah diisi string kunci, langsung aktifkan firebase.appCheck() / initializeAppCheck dengan ReCaptchaV3Provider dan isTokenAutoRefreshEnabled: true.

B. Cryptographic Session & LocalStorage Integrity Guard (Anti-Tamper Inspect Element)

Buat mekanisme Signature Hash / Checksum otomatis untuk setiap data sesi login pegawai (nip, role, nama, jabatan) yang disimpan di localStorage atau sessionStorage.

Jalankan pengecekan periodik (setInterval setiap 2 detik) dan event listener window.addEventListener('storage', ...):

Jika ada seseorang (seperti penguji IT) yang mengubah isi localStorage secara manual lewat tab Application -> LocalStorage di Inspect Element (misal mengubah NIP atau menaikkan role menjadi Admin), sistem WAJIB mendeteksi ketidakcocokan signature!

Jika manipulasi terdeteksi:

Catat insiden secara diam-diam ke koleksi Firestore security_incidents (berisi waktu kejadian Asia/Jakarta, halaman URL, userAgent, dan jenis pelanggaran: 'LOCALSTORAGE_TAMPERING_DETECTED', sertakan field nip: 'SECURITY_SYSTEM' agar lolos validasi Firestore Rules).

Hapus seluruh storage, tampilkan custom toast/modal peringatan merah menyala: "PELANGGARAN KEAMANAN SIBER: Manipulasi Sesi Terdeteksi! Akses Anda telah dicatat di Audit Log.", lalu paksa redirect ke halaman login utama (/).

C. Console Cyber Security Warning Banner (Jebakan F12 / Inspect Element)

Saat halaman dimuat atau saat Developer Tools dibuka, bersihkan log sensitif dan cetak peringatan resmi berdesain tegas menggunakan styling CSS di console.log:

Judul besar warna merah menyala: ⚠️ PERINGATAN KEAMANAN SIBER - PENGADILAN AGAMA INDRAMAYU

Isi pesan: Sistem SSO Transkep (sso.pa-indramayu.go.id) dilindungi oleh Enkripsi TLS 1.3, Google Cloud API Referrer Lock, Firestore Immutable Anti-Delete Rules, dan Session Integrity Check. Segala aktivitas injeksi skrip, manipulasi LocalStorage, atau pemindaian tidak sah dicatat secara real-time ke dalam Security Audit Log.

Nonaktifkan pencetakan data kredensial mentah (password/token) ke dalam console.log di lingkungan produksi (sso.pa-indramayu.go.id).

D. Global Anti-XSS Input Sanitizer & Domain Lock

Sediakan fungsi global window.sanitizeTranskepInput(str) yang membersihkan tag <script>, <iframe>, onload=, onerror=, dan karakter injeksi berbahaya sebelum data dikirim ke Cloud Firestore.

Pasang pengecekan hostname: pastikan aplikasi berjalan optimal di sso.pa-indramayu.go.id, transkep.github.io, atau localhost.

2. Integrasikan ke Seluruh Modul Halaman & Pasang Security Meta Tags

Hubungkan file <script src="/transkep-security-core.js"></script> ke halaman utama (index.html) dan seluruh halaman di dalam folder modul (dashboard/, eoffice/, front_view/, jobdes/, kinerja/, pegawai/, permohonan/).

Tambahkan Security Meta Tags pada <head> di setiap file HTML utama:

<meta http-equiv="X-Content-Type-Options" content="nosniff">

<meta name="referrer" content="strict-origin-when-cross-origin">

Pastikan seluruh fitur baca/tulis Firestore yang sudah ada di setiap modul tetap berjalan 100% normal dan lancar tanpa error.

3. Bersihkan Path /transkep-web/ & Pastikan File CNAME Aman

Pastikan file CNAME di root repository berisi sso.pa-indramayu.go.id.

Pastikan tidak ada lagi hardcode redirect yang memaksa URL pindah ke /transkep-web/ sehingga domain https://sso.pa-indramayu.go.id/ berjalan bersih.

Setelah seluruh perubahan selesai diverifikasi tanpa error, lakukan git add, git commit, dan git push ke GitHub.
