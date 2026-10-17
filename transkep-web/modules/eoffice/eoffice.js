// ==========================================
// FILE: eoffice.js (TRANSKEP Modular)
// ENGINE: ZettBOT Core v1.0.0
// ==========================================

// --- Source: eoffice/js_eoffice.html ---
// ==========================================
  // FILE: eoffice/js_eoffice.html
  // DESKRIPSI: Logika Frontend E-Office (Vue.js 3 Reactive Engine)
  // ENGINE: ZettBOT Core v1.0.0 (by Zettbos)
  // ==========================================

  window.renderEofficeView = function() {
    if (window.vmEoffice && window.vmEoffice.isAdmin) {
      window.vmEoffice.loadData();
    }
  };

  window.refreshEofficeData = function() {
    if (window.vmEoffice && window.vmEoffice.isAdmin) {
      window.vmEoffice.loadData(true);
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    const { createApp } = Vue;

    window.vmEoffice = createApp({
      data() {
        return {
          s: window.vueState || (typeof state !== 'undefined' ? state : {}),
          isLoading: false,
          rawKgbList: [],
          rawRapatList: [],
          filter: {
            userNip: 'all',
            userName: 'Semua Pegawai',
            jenis: 'all',
            start: '',
            end: ''
          },
          searchQuery: '',
          isDropdownOpen: false
        };
      },

      computed: {
        currentUser() {
          if (this.s && this.s.user) return this.s.user;
          if (typeof state !== 'undefined' && state.user) return state.user;
          if (window.vueState && window.vueState.user) return window.vueState.user;
          return null;
        },

        isAdmin() {
          const user = this.currentUser;
          if (user && user.role) {
            return user.role === 'Admin';
          }
          const storedRole = localStorage.getItem('transkep_user_role');
          if (storedRole) {
            return storedRole === 'Admin';
          }
          return false;
        },

        availableUsers() {
          if (!this.s || !this.s.usersList) return [];
          let list = this.s.usersList.filter(u => u.role !== 'Admin' && u.role !== 'Operator');
          if (this.searchQuery && this.searchQuery !== 'Semua Pegawai') {
            const q = this.searchQuery.toLowerCase();
            list = list.filter(u => (u.nama && u.nama.toLowerCase().includes(q)) || (u.nip && String(u.nip).includes(q)));
          }
          return list;
        },

        unifiedList() {
          const result = [];

          // 1. MAPPING LIST KGB
          if (Array.isArray(this.rawKgbList)) {
            this.rawKgbList.forEach((k, idx) => {
              const isDone = (k.status === 'Selesai');
              result.push({
                keyId: 'kgb-' + (k.id_kgb || idx),
                itemType: 'KGB',
                itemTypeLabel: 'KGB (Berkala)',
                title: k.nama_pegawai || 'Pegawai',
                subtitle: 'NIP: ' + (k.nip || '-') + (k.pangkat ? ' • ' + k.pangkat : ''),
                userNip: String(k.nip || ''),
                datePrimary: k.tmt_baru ? ('TMT Baru: ' + k.tmt_baru) : (k.tmt_lama ? 'TMT: ' + k.tmt_lama : 'TMT Belum Diset'),
                dateSecondary: k.tmt_yad ? ('YAD: ' + k.tmt_yad) : '',
                sortDate: k.tanggal_input || k.tmt_baru || '',
                description: k.nomor_surat ? ('No. SK: ' + k.nomor_surat) : (k.is_from_dashboard ? 'Usulan Baru dari Dashboard' : 'Draf SK Sedang Disusun'),
                rawStatus: k.status || 'Sedang Diproses',
                statusText: isDone ? 'Selesai / Terbit' : 'Sedang Diproses',
                statusBadgeClass: isDone ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-blue-500/10 border-blue-500/30 text-blue-400 animate-pulse',
                statusDotClass: isDone ? 'bg-emerald-400' : 'bg-blue-400',
                fileDocUrl: k.file_doc_url || '',
                filePdfUrl: k.file_pdf_url || '',
                rawData: k
              });
            });
          }

          // 2. MAPPING LIST RAPAT
          if (Array.isArray(this.rawRapatList)) {
            this.rawRapatList.forEach((r, idx) => {
              const isDone = (r.status === 'Selesai');
              result.push({
                keyId: 'rapat-' + (r.id_rapat || idx),
                itemType: 'Rapat',
                itemTypeLabel: 'Paket Rapat',
                title: r.agenda || 'Agenda Rapat',
                subtitle: (r.tempat ? r.tempat : 'Ruang Rapat') + (r.pemimpin ? ' • Pimpinan: ' + r.pemimpin : ''),
                userNip: '',
                datePrimary: r.hari_tanggal || 'Tanggal Belum Diset',
                dateSecondary: (r.waktu_mulai ? r.waktu_mulai : '') + (r.waktu_selesai ? ' - ' + r.waktu_selesai : ''),
                sortDate: r.tanggal_input || '',
                description: r.notulis ? ('Notulis: ' + r.notulis) : (r.nomor_undangan ? 'No: ' + r.nomor_undangan : 'Paket Dokumen Rapat'),
                rawStatus: r.status || 'Terjadwal',
                statusText: isDone ? 'Selesai' : 'Terjadwal',
                statusBadgeClass: isDone ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400',
                statusDotClass: isDone ? 'bg-emerald-400' : 'bg-amber-400',
                docUndanganUrl: r.doc_undangan_url || '',
                docAbsenUrl: r.doc_absen_url || '',
                docNotulenUrl: r.doc_notulen_url || '',
                rawData: r
              });
            });
          }

          // Urutkan paling baru di atas
          return result.sort((a, b) => (b.sortDate || '').localeCompare(a.sortDate || ''));
        },

        filteredList() {
          let list = this.unifiedList;

          // Filter Pegawai
          if (this.filter.userNip && this.filter.userNip !== 'all') {
            list = list.filter(item => item.userNip === this.filter.userNip);
          }

          // Filter Jenis Layanan
          if (this.filter.jenis && this.filter.jenis !== 'all') {
            list = list.filter(item => item.itemType === this.filter.jenis);
          }

          // Filter Rentang Tanggal
          if (this.filter.start) {
            list = list.filter(item => !item.sortDate || item.sortDate >= this.filter.start);
          }
          if (this.filter.end) {
            list = list.filter(item => !item.sortDate || item.sortDate <= this.filter.end);
          }

          return list;
        }
      },

      methods: {
        async loadData(isSilent) {
          if (!this.currentUser && typeof state !== 'undefined' && state.user) {
            this.s.user = state.user;
          }

          // GUARD: Fitur E-Office hanya untuk Administrator
          if (!this.isAdmin) {
            this.isLoading = false;
            return;
          }

          const nip = (this.currentUser && this.currentUser.nip) || localStorage.getItem('transkep_active_nip') || '';
          const token = localStorage.getItem('transkep_session_token') || '';

          if (!nip || !token) return;

          if (!isSilent) this.isLoading = true;

          try {
            const res = await window.EofficeDataService.getEofficeData(nip, token);
            this.isLoading = false;
            if (res && res.status === 'success' && res.data) {
              this.rawKgbList = res.data.kgb || [];
              this.rawRapatList = res.data.rapat || [];
            } else if (res && res.message) {
              // Jika bukan admin atau respon akses ditolak, abaikan secara silent (tanpa toast notifikasi)
              if (res.message.includes('Akses Ditolak') || !this.isAdmin) {
                console.warn("[E-Office] Akses dibatasi untuk Administrator:", res.message);
              } else if (typeof showNotify === 'function') {
                showNotify("Perhatian E-Office", res.message, "warning");
              }
            }
          } catch (err) {
            this.isLoading = false;
            console.error("Gagal load E-Office: ", err);
          }
        },

        refreshData() {
          this.loadData();
          if (typeof showNotify === 'function') {
            showNotify("Memperbarui Data", "Menyinkronkan berkas E-Office...", "info");
          }
        },

        selectUser(nip, name) {
          this.filter.userNip = nip;
          this.filter.userName = name;
          this.searchQuery = (nip === 'all') ? '' : name;
          this.isDropdownOpen = false;
        },

        handleBlurDropdown() {
          setTimeout(() => {
            this.isDropdownOpen = false;
          }, 200);
        },

        clearSearch() {
          this.searchQuery = '';
          this.filter.userNip = 'all';
          this.filter.userName = 'Semua Pegawai';
        },

        resetAllFilters() {
          this.clearSearch();
          this.filter.jenis = 'all';
          this.filter.start = '';
          this.filter.end = '';
        },

        openModalKgbDetail(item) {
          if (typeof window.openKgbModalForm === 'function') {
            window.openKgbModalForm(item.rawData);
          } else {
            if (typeof showNotify === 'function') {
              showNotify("Modul KGB", "Membuka formulir detail KGB untuk " + item.title, "info");
            }
          }
        },

        triggerOpenModalRapat() {
          if (typeof window.openRapatModalForm === 'function') {
            window.openRapatModalForm();
          } else {
            if (typeof showNotify === 'function') {
              showNotify("Paket Rapat", "Membuka formulir agenda rapat baru...", "info");
            }
          }
        },

        openModalRapatDetail(item) {
          if (typeof window.openRapatDetailModal === 'function') {
            window.openRapatDetailModal(item.rawData);
          } else {
            if (typeof showNotify === 'function') {
              showNotify("Detail Rapat", item.title, "info");
            }
          }
        }
      },

      mounted() {
        // Hanya muat data otomatis jika menu saat ini adalah E-Office dan pengguna adalah Admin
        const currentMenu = (window.vueState && window.vueState.currentMenu) || localStorage.getItem('transkep_last_menu');
        if (currentMenu === 'eoffice' && this.isAdmin) {
          this.loadData();
        }
      }
    }).mount('#vue-eoffice-app');
  });
