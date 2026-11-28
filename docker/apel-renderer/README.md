# TRANSKEP Apel Poster Renderer (Docker Microservice)

Microservice Node.js ringan (`@napi-rs/canvas`) untuk merender poster pengumuman **Jadwal Apel PA Indramayu (`1080 x 1350 px`)** otomatis setiap **Minggu pukul 14:00 WIB** melalui **n8n**, lengkap dengan foto terbaru petugas **maupun petugas pengganti (Cuti/Surat Tugas)** tanpa membuka browser.

## Cara Pasang di Docker Kantor (`transkep-docker`)

1. Salin seluruh folder `docker/apel-renderer/` ini ke dalam folder Docker Compose Anda (mis. `D:\transkep-docker\apel-renderer`).
2. Tambahkan isi `docker-compose.snippet.yml` ke `docker-compose.yml` Anda *(di bawah `services:`, sejajar dengan `n8n` dan `waha`)*.
3. Jalankan build & start:
   ```bash
   docker compose up -d --build apel-renderer
   ```
4. Verifikasi kontainer hidup:
   ```bash
   docker exec transkep-n8n wget -qO- http://apel-renderer:3000/health
   ```
   *(Harus mengembalikan `{"ok":true,"service":"transkep-apel-renderer"}`)*

## Catatan Aset Logo
- Saat pertama kali merender, `apel-renderer` otomatis mengunduh dan men-cache 5 aset logo dari `https://sso.pa-indramayu.go.id/img/` (`Logo_PA_Imy.png`, `Logo_WBK.png`, `gedung_pa.png`, `berakhlak.png`, `bangga%20Melayani%20Bangsa.png`).
- Anda juga bisa menaruh file PNG tersebut langsung ke dalam subfolder `./assets/` di kontainer bila server tidak mengakses GitHub Pages.