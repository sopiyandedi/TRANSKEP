// ==========================================
// FILE: magic_approval.js (Controller Magic Link Approval Cuti)
// Standard: TRANSKEP Modern Vue 3 Architecture 
// Deskripsi: Mengelola alur verifikasi dan eksekusi persetujuan cuti
//            berjenjang instan dari notifikasi WhatsApp tanpa perlu login
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
  const { createApp } = Vue;

  window.vmMagicApproval = createApp({
    data() {
      return {
        isOpen: false,
        isLoading: false,
        isSubmitting: false,
        token: '',
        cutiData: null,
        decisionNotes: '',
        errorMessage: '',
        successMessage: ''
      };
    },
    mounted() {
      this.checkUrlQuery();
    },
    methods: {
      checkUrlQuery() {
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const action = urlParams.get('action');
          const token = urlParams.get('token');

          if (action === 'review_cuti' && token) {
            this.token = token.trim();
            this.openReview(this.token);
          }
        } catch (e) {
          console.warn("[MagicApproval] Gagal membedah query URL:", e);
        }
      },

      async openReview(token) {
        this.isOpen = true;
        this.isLoading = true;
        this.errorMessage = '';
        this.successMessage = '';
        this.cutiData = null;
        this.decisionNotes = '';

        try {
          let res;
          if (window.TranskepAPI && typeof window.TranskepAPI.call === 'function') {
            res = await window.TranskepAPI.call('getCutiByToken', token);
          } else if (window.google && google.script && google.script.run) {
            res = await new Promise((resolve, reject) => {
              google.script.run
                .withSuccessHandler(resolve)
                .withFailureHandler(reject)
                .getCutiByToken(token);
            });
          } else {
            throw new Error("Koneksi API gateway tidak tersedia.");
          }

          if (res && res.status === 'success' && res.data) {
            this.cutiData = res.data;
          } else {
            this.errorMessage = (res && res.message) ? res.message : "Data pengajuan cuti tidak ditemukan.";
          }
        } catch (err) {
          this.errorMessage = err.message || err.toString();
        } finally {
          this.isLoading = false;
        }
      },

      async submitDecision(decision) {
        if (decision === 'Ditolak' && (!this.decisionNotes || this.decisionNotes.trim() === '')) {
          if (window.showNotify) {
            window.showNotify("Catatan Wajib", "Silakan masukkan alasan penolakan pada kolom catatan.", "warning");
          } else {
            alert("Silakan masukkan alasan penolakan pada kolom catatan.");
          }
          return;
        }

        const confirmMsg = decision === 'Disetujui'
          ? `Apakah Anda yakin ingin MENYETUJUI permohonan cuti ${this.cutiData.nama}?`
          : `Apakah Anda yakin ingin MENOLAK permohonan cuti ${this.cutiData.nama}?`;

        if (!confirm(confirmMsg)) return;

        this.isSubmitting = true;
        try {
          let res;
          if (window.TranskepAPI && typeof window.TranskepAPI.call === 'function') {
            res = await window.TranskepAPI.call('processMagicLinkApproval', this.token, decision, this.decisionNotes);
          } else if (window.google && google.script && google.script.run) {
            res = await new Promise((resolve, reject) => {
              google.script.run
                .withSuccessHandler(resolve)
                .withFailureHandler(reject)
                .processMagicLinkApproval(this.token, decision, this.decisionNotes);
            });
          } else {
            throw new Error("Koneksi API gateway tidak tersedia.");
          }

          if (res && res.status === 'success') {
            this.successMessage = res.message || "Persetujuan cuti berhasil diproses.";
            this.cutiData = null;
          } else {
            alert("Gagal: " + (res ? res.message : "Terjadi kesalahan sistem."));
          }
        } catch (err) {
          alert("Error: " + (err.message || err.toString()));
        } finally {
          this.isSubmitting = false;
        }
      },

      closeModal() {
        this.isOpen = false;
        // Bersihkan parameter URL tanpa refresh halaman agar URL kembali bersih
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('action');
          url.searchParams.delete('token');
          window.history.replaceState({}, document.title, url.pathname + (url.search ? url.search : ''));
        } catch (e) {}
      }
    }
  }).mount('#vue-magic-approval-wrapper');
});
