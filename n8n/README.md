# Folder Workflow n8n TRANSKEP

Folder ini mengelompokkan seluruh berkas workflow otomatisasi n8n agar rapi dan aman:

## 1. Berkas Operasional Lokal (TIDAK Di-push ke GitHub)
Diabaikan otomatis oleh `.gitignore` (`n8n/*.json`) dan `.claspignore` (`n8n/**`) karena memuat kredensial/API key/nomor WA asli. Gunakan berkas berikut saat melakukan **Import Workflow** ke mesin n8n lokal Anda:
- `n8n_workflow_mysims_surat_keluar.json` — Otomasi Surat Keluar Cuti & ST Terpadu ke MYSIMS.
- `Waha reset Paswors dan Cuti.json` — Gateway notifikasi WhatsApp WAHA (Reset Password OTP, Usulan Cuti / Magic Link, Keputusan Cuti, & Direct Message).
- `CI CD Docker Github.json` — Webhook Auto-Update CI/CD repository & Docker + laporan admin via WAHA.
- `transkep-ai-assistant.json` — **Transkep AI Assistant** via WhatsApp/WAHA (`models/gemini-3.8-flash`): obrolan langsung AI, laporan status kontainer Docker real-time (`/docker`, `/server`, `/status`, atau pertanyaan alami *"kontainer apa saja yang jalan di docker"*), analisa Docker dengan AI (`/analisa docker`), mode spesialis (`/sk`, `/sop`, `/notulen`), serta kontrol sesi (`/menu`, `/reset`).
- `transkep-ai-notulen.json` — **Transkep AI Notulen Rapat** via Webhook n8n (`models/gemini-3.8-flash`): ekstraksi audio rekaman rapat multimodal (`audio/webm`, `.mp3`, `.m4a`, `.wav`, `.ogg`) dan/atau catatan mentah menjadi JSON Strict Notula Rapat PA Indramayu (`Pengarahan Umum` + 5 kolom `Pembahasan`).

## 2. Blueprint Template Tersanitasi (Aman di GitHub)
Seluruh API Key, ID Kredensial n8n, IP internal LAN, URL deployment, dan nomor WhatsApp pribadi telah disamarkan dengan placeholder `<GANTI_...>`:
- `n8n_workflow_mysims_surat_keluar.example.json`
- `Waha reset Paswors dan Cuti.example.json`
- `CI CD Docker Github.example.json`
- `transkep-ai-assistant.example.json`
- `transkep-ai-notulen.example.json`

> **Aturan Tambahan:** Setiap menambah berkas workflow `.json` baru ke dalam folder `n8n/`, otomatis terisolasi oleh `.gitignore`. Jika ingin mem-backup struktur barunya ke GitHub, buat versi tersanitasi dengan akhiran `.example.json`.

