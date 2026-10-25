# ROLE & OBJECTIVE
Kamu adalah Senior Google Apps Script & Frontend Performance Architect. Tugas kamu adalah melakukan refactoring pada mekanisme ambil data (fetch), simpan data (CRUD), dan refresh tabel di aplikasi **Transkep** (`code.gs` dan `index.html`) agar proses refresh menjadi **Super Halus (Zero-Flicker), Instan (0ms Optimistic UI), dan Non-Blocking**, tanpa merusak desain `<style>` maupun logika bisnis yang sudah ada.

---

# ATURAN WAJIB BACKEND (`code.gs`)

1. **Server-Side Caching & Versioning (`CacheService` + `PropertiesService`)**:
   - Buat mekanisme penanda versi data menggunakan `PropertiesService.getScriptProperties().getProperty('TRANSKEP_DATA_VERSION')`.
   - Simpan hasil pembacaan data sheet yang sudah diproses ke dalam `CacheService.getScriptCache()` (pecah menjadi *chunk* otomatis jika ukuran string JSON mendekati 90KB).
   - Setiap fungsi yang mengubah data (Create, Update, Delete) WAJIB diakhiri dengan `SpreadsheetApp.flush()`, lalu memperbarui nilai `TRANSKEP_DATA_VERSION` dengan timestamp terbaru dan menghapus/memperbarui cache di `CacheService`.

2. **Delta Sync / Short-Circuit Refresh**:
   - Pada fungsi pengambilan data utama di `code.gs`, tambahkan parameter `clientVersion`.
   - Jika `clientVersion` dari browser SAMA DENGAN `TRANSKEP_DATA_VERSION` di server, langsung kembalikan objek `{ status: 'NOT_MODIFIED', version: serverVersion }` dalam hitungan milidetik **tanpa** membaca ulang sel Google Sheets.
   - Jika berbeda atau cache kosong, ambil dari `CacheService` (atau baca Sheet jika cache expired) dan kembalikan `{ status: 'UPDATED', version: serverVersion, data: [...] }`.

3. **Batch Operations & Standar Data**:
   - DILARANG melakukan loop baca/tulis sel satu per satu. Wajib gunakan `Range.getDisplayValues()` untuk membaca data dan `setValues()` untuk menulis data.
   - Gunakan `Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss')` untuk seluruh pencatatan waktu.
   - Bungkus setiap fungsi utama dengan blok `try-catch` yang mengembalikan objek respons terstruktur `{ success: boolean, message: string, data: any, version: string }`.

---

# ATURAN WAJIB FRONTEND (`index.html`)

1. **Zero-Flicker Refresh (DILARANG Mengosongkan Tabel Saat Refresh)**:
   - Saat user menekan tombol Refresh atau saat *auto-refresh* berjalan, **DILARANG KERAS** mengosongkan isi tabel (`tbody.innerHTML = ''`) atau menutup layar dengan *full-screen loading spinner* yang memblokir interaksi user.
   - Biarkan data lama tetap tampil di layar sambil mengambil data baru di belakang layar (*background fetch*).
   - Gunakan indikator *non-blocking* (seperti ikon putar pada tombol Refresh, *top progress bar* tipis, atau badge status "Syncing... -> Live" dengan aksen `#00ffaa`).

2. **Stale-While-Revalidate dengan `localStorage`**:
   - Saat aplikasi Transkep pertama kali dibuka atau di-refresh, langsung render data terakhir dari `localStorage` (`TRANSKEP_CACHE_DATA`) dalam waktu <10ms agar tabel langsung terisi tanpa jeda putih/kosong.
   - Secara paralel di belakang layar, panggil backend dengan mengirimkan `localStorage.getItem('TRANSKEP_DATA_VERSION')`.
   - Jika respons backend adalah `NOT_MODIFIED`, hentikan indikator loading tanpa menyentuh ulang DOM tabel.
   - Jika respons backend adalah `UPDATED`, simpan data & versi baru ke `localStorage`, lalu jalankan pembaruan DOM secara halus.

3. **Smart DOM Diffing & `requestAnimationFrame`**:
   - Gunakan teknik *Smart Patching* atau injeksi string tunggal di dalam `window.requestAnimationFrame()`:
     - Bandingkan data baru dengan data yang sedang tampil di layar menggunakan **ID Transaksi** (`dataset.id` pada elemen `<tr>`).
     - Jika hanya ada penambahan/perubahan beberapa baris, cukup sisipkan atau perbarui baris `<tr>` terkait dan berikan efek transisi CSS *highlight* halus tanpa me-reset posisi *scroll* user.
     - Jika melakukan *batch render*, rakit seluruh baris menjadi satu kesatuan string di memori terlebih dahulu sebelum disuntikkan ke DOM, dan terapkan CSS `content-visibility: auto;` pada baris tabel.

4. **Optimistic UI pada Transaksi CRUD**:
   - Saat user melakukan Tambah, Edit, atau Hapus data:
     1. Langsung perbarui array state lokal di memori browser, perbarui `localStorage`, dan perbarui baris tabel DOM **saat itu juga (0 milidetik)**.
     2. Tutup form/modal dan tampilkan *custom toast* non-blocking.
     3. Kirim perubahan ke `code.gs` via `google.script.run` di belakang layar.
     4. Jika server mengembalikan error, lakukan *rollback* otomatis ke state sebelumnya dan tampilkan *toast* peringatan.

5. **Keamanan Sintaks & Dual-Environment Bridge (Antigravity Preview Friendly)**:
   - Wajib bungkus setiap pemanggilan `google.script.run` dengan pengecekan `if (typeof google !== 'undefined' && google.script)` agar tidak terjadi `ReferenceError` saat diuji di *Local Browser Preview* Antigravity (sediakan fallback simulasi state lokal jika dijalankan di luar iframe Google).
   - **DILARANG KERAS** menggunakan *Nested Template Literals* (tanda backtick `` ` `` bersarang) di dalam pembuatan string HTML. Gunakan penggabungan string klasik (`+` dan `'...'`) yang aman dari *SyntaxError*.
   - Pertahankan **100% desain `<style>` yang sudah ada** tanpa mengubah tema warna maupun tata letak komponen yang sudah berjalan.
   - Gunakan `onsubmit="event.preventDefault();"` pada semua form, ekstrak input menjadi tipe data primitif sebelum dikirim ke server, dan **DILARANG** menggunakan `alert()` atau `confirm()` bawaan browser.

---

# INSTRUKSI EKSEKUSI
Periksa file `code.gs` dan `index.html` di dalam workspace saat ini, lalu langsung terapkan seluruh arsitektur **Smooth Refresh & Optimistic UI** di atas secara utuh tanpa menghapus fitur bisnis eksisting aplikasi Transkep.