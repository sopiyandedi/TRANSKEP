// ==========================================
// FILE: eoffice.js (TRANSKEP Modular)
// DESKRIPSI: Logika Frontend E-Office (Vue.js 3 Reactive Engine)
// ENGINE: TRANSKEP Core v1.0.0
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
          status: 'all',
          start: '',
          end: ''
        },
        confirmModal: {
          open: false,
          mode: 'delete',
          target: null
        },
        searchQuery: '',
        isDropdownOpen: false,
        _allowEmptyFirestoreSnapshot: false
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
        const r = String((user && user.role) || localStorage.getItem('transkep_user_role') || '').toLowerCase().trim();
        return r.includes('admin') || r.includes('operator');
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

        // 1. MAPPING LIST KGB (Draf Aktif, Antrean TTE Pimpinan & Arsip Siklus 2 Tahunan)
        if (Array.isArray(this.rawKgbList)) {
          this.rawKgbList.forEach((k, idx) => {
            const rawStatus = k.status || 'Sedang Diproses';
            const isDone = (rawStatus === 'Selesai');
            const isWaitingTte = (rawStatus === 'Menunggu TTE Pimpinan');

            let statusText = 'Sedang Diproses';
            let statusBadgeClass = 'bg-blue-500/10 border-blue-500/30 text-blue-400';
            let statusDotClass = 'bg-blue-400 animate-pulse';

            if (isDone) {
              statusText = 'Selesai / Terbit';
              statusBadgeClass = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
              statusDotClass = 'bg-emerald-400';
            } else if (isWaitingTte) {
              statusText = 'Menunggu TTE Pimpinan';
              statusBadgeClass = 'bg-amber-500/10 border-amber-500/30 text-amber-400';
              statusDotClass = 'bg-amber-400 animate-pulse';
            }

            const pangkatLabel = k.pangkat ? (' • ' + k.pangkat) : '';
            const golLabel = (!String(k.pangkat || '').includes('(') && k.golongan) ? (' (' + k.golongan + ')') : '';

            const hasCleanNomor = k.nomor_surat && !String(k.nomor_surat).startsWith('...');
            let descText = k.is_from_dashboard ? 'Usulan Baru dari Dashboard' : 'Draf SK Sedang Disusun';
            if (hasCleanNomor && k.gaji_baru) {
              descText = 'No. SK: ' + k.nomor_surat + ' • Rp ' + k.gaji_baru;
            } else if (hasCleanNomor) {
              descText = 'No. SK: ' + k.nomor_surat;
            } else if (k.gaji_baru) {
              descText = 'Gaji Baru: Rp ' + k.gaji_baru;
            }

            result.push({
              keyId: 'kgb-' + (k.id_kgb || idx),
              itemType: 'KGB',
              itemTypeLabel: 'KGB (Berkala)',
              title: k.nama_pegawai || 'Pegawai',
              subtitle: 'NIP: ' + (k.nip || '-') + pangkatLabel + golLabel,
              userNip: String(k.nip || ''),
              datePrimary: k.tmt_baru ? ('TMT Baru: ' + k.tmt_baru) : (k.tmt_lama ? 'TMT: ' + k.tmt_lama : 'TMT Belum Diset'),
              dateSecondary: k.tmt_yad ? ('YAD: ' + k.tmt_yad) : '',
              sortDate: k.updated_at || k.tanggal_input || k.tmt_baru || '',
              filterDate: String(k.tanggal_input || k.tmt_baru || '').slice(0, 10),
              description: descText,
              rawStatus: rawStatus,
              statusText: statusText,
              statusBadgeClass: statusBadgeClass,
              statusDotClass: statusDotClass,
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
              filterDate: String(r.tanggal_input || '').slice(0, 10),
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

        // Filter Status Berkas
        if (this.filter.status && this.filter.status !== 'all') {
          list = list.filter(item => item.rawStatus === this.filter.status);
        }

        // Filter Rentang Tanggal
        if (this.filter.start) {
          list = list.filter(item => {
            const d = item.filterDate || String(item.sortDate || '').slice(0, 10);
            return !d || d >= this.filter.start;
          });
        }
        if (this.filter.end) {
          list = list.filter(item => {
            const d = item.filterDate || String(item.sortDate || '').slice(0, 10);
            return !d || d <= this.filter.end;
          });
        }

        return list;
      }
    },

    methods: {
      async triggerMigrasiSheets() {
        if (!this.isAdmin) return;
        if (typeof showLoading === 'function') {
          showLoading("Menyalin data KGB & Rapat dari Google Sheets ke Cloud Firestore...");
        }
        try {
          const res = await window.EofficeDataService.syncAllSheetsToFirestore();
          if (typeof hideLoading === 'function') hideLoading();
          if (res && res.status === 'success') {
            if (typeof showNotify === 'function') {
              showNotify("Migrasi Berhasil", res.message, "success");
            }
            this.loadData(true);
          } else {
            if (typeof showNotify === 'function') {
              showNotify("Perhatian Migrasi", (res ? res.message : "Tidak ada data yang dimigrasikan."), "warning");
            }
          }
        } catch (err) {
          if (typeof hideLoading === 'function') hideLoading();
          console.error("Gagal migrasi:", err);
          if (typeof showNotify === 'function') {
            showNotify("Gagal Migrasi", err.toString(), "error");
          }
        }
      },

      initRealtimeListeners() {
        if (this._hasSubscribed) return;
        if (typeof TranskepFirebase !== 'undefined' && TranskepFirebase.isReady && TranskepFirebase.isReady()) {
          this._hasSubscribed = true;
          TranskepFirebase.subscribeFirestoreKgbs((list) => {
            if (Array.isArray(list)) {
              // KUNCI: Jangan biarkan snapshot kosong menimpa data yang sudah ada di memori/sheets!
              if (list.length === 0 && this.rawKgbList.length > 0) {
                console.log("ℹ️ [E-Office] Snapshot Firestore kosong. Mempertahankan riwayat aktif.");
                return;
              }

              if (list.length > 0) {
                this._allowEmptyFirestoreSnapshot = true;
                const merged = (window.EofficeDataService && typeof window.EofficeDataService.mergeDashboardQueue === 'function')
                  ? window.EofficeDataService.mergeDashboardQueue(list)
                  : list;

                this.rawKgbList = merged;
                if (window.EofficeDataService && typeof window.EofficeDataService.setLocalCache === 'function') {
                  window.EofficeDataService.setLocalCache({ kgb: merged, rapat: this.rawRapatList });
                }
              }
            }
          });
          TranskepFirebase.subscribeFirestoreRapats((list) => {
            if (Array.isArray(list) && list.length > 0) {
              this.rawRapatList = list;
              if (window.EofficeDataService && typeof window.EofficeDataService.setLocalCache === 'function') {
                window.EofficeDataService.setLocalCache({ kgb: this.rawKgbList, rapat: list });
              }
            }
          });
          console.log("🔥 [E-Office] Realtime listener Cloud Firestore aktif.");
        }
      },

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

        if (!isSilent && this.rawKgbList.length === 0 && this.rawRapatList.length === 0) {
          this.isLoading = true;
        }
        this.initRealtimeListeners();

        try {
          const res = await window.EofficeDataService.getEofficeData(nip, token);
          this.isLoading = false;
          if (res && res.status === 'success' && res.data) {
            const incomingKgb = Array.isArray(res.data.kgb) ? res.data.kgb : [];
            const incomingRapat = Array.isArray(res.data.rapat) ? res.data.rapat : [];
            // Jangan timpa jika respon server kosong padahal memori lokal sudah memiliki data
            if (incomingKgb.length > 0) {
              this.rawKgbList = incomingKgb;
            }
            if (incomingRapat.length > 0) {
              this.rawRapatList = incomingRapat;
            }
          } else if (res && res.message) {
            if (res.message.includes('Akses Ditolak') || !this.isAdmin) {
              console.warn("[E-Office] Akses dibatasi untuk Administrator:", res.message);
            } else if (typeof showNotify === 'function') {
              showNotify("Perhatian E-Office", res.message, "warning");
            }
          }
        } catch (err) {
          this.isLoading = false;
          console.error("Gagal load E-Office: ", err);
          // Fallback: Tetap sintesiskan dari antrean Dashboard / cache lokal agar data muncul
          if (window.EofficeDataService && typeof window.EofficeDataService.mergeDashboardQueue === 'function') {
            const cached = (typeof window.EofficeDataService.getLocalCache === 'function') ? window.EofficeDataService.getLocalCache() : null;
            const baseList = (cached && Array.isArray(cached.kgb) && cached.kgb.length > 0) ? cached.kgb : this.rawKgbList;
            this.rawKgbList = window.EofficeDataService.mergeDashboardQueue(baseList);
          }
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
        this.filter.status = 'all';
        this.filter.start = '';
        this.filter.end = '';
      },

      // ==========================================
      // 4 KONTROL AKSI KGB: EDIT, KIRIM TTE, CETAK, DELETE
      // ==========================================
      openModalKgbDetail(item) {
        if (typeof window.openKgbModalForm === 'function') {
          window.openKgbModalForm(item.rawData);
        } else if (typeof showNotify === 'function') {
          showNotify("Modul KGB", "Membuka formulir detail KGB untuk " + item.title, "info");
        }
      },

      triggerPrintKgb(item) {
        const raw = (item && item.rawData) ? item.rawData : item;
        if (typeof window.printSuratKgb === 'function') {
          window.printSuratKgb(raw);
        } else if (typeof showNotify === 'function') {
          showNotify("Modul Cetak KGB", "Komponen cetak SK KGB belum siap dimuat.", "warning");
        }
      },

      promptSendKgbTte(item) {
        if (!item || !item.rawData) return;
        const raw = item.rawData;
        if (!raw.gaji_baru || String(raw.gaji_baru).trim() === '') {
          if (typeof showNotify === 'function') {
            showNotify("Lengkapi Data KGB", "Isi Gaji Pokok Baru & Nomor Surat terlebih dahulu melalui tombol Edit sebelum mengirim ke TTE Pimpinan.", "warning");
          }
          this.openModalKgbDetail(item);
          return;
        }
        this.confirmModal = {
          open: true,
          mode: 'tte',
          target: item
        };
      },

      promptDeleteKgb(item) {
        if (!item) return;
        this.confirmModal = {
          open: true,
          mode: 'delete',
          target: item
        };
      },

      closeConfirmModal() {
        this.confirmModal = {
          open: false,
          mode: 'delete',
          target: null
        };
      },

      async executeConfirmModal() {
        const mode = this.confirmModal.mode;
        const target = this.confirmModal.target;
        if (!target || !target.rawData) {
          this.closeConfirmModal();
          return;
        }

        const raw = target.rawData;
        const nip = (this.currentUser && this.currentUser.nip) || localStorage.getItem('transkep_active_nip') || '';
        const token = localStorage.getItem('transkep_session_token') || '';

        if (mode === 'delete') {
          this._allowEmptyFirestoreSnapshot = true;
          const targetId = String(raw.id_kgb || '');
          this.rawKgbList = this.rawKgbList.filter(k => String(k.id_kgb || '') !== targetId);
          if (window.EofficeDataService && typeof window.EofficeDataService.setLocalCache === 'function') {
            window.EofficeDataService.setLocalCache({ kgb: this.rawKgbList, rapat: this.rawRapatList });
          }
          this.closeConfirmModal();

          try {
            if (window.EofficeDataService && typeof window.EofficeDataService.deleteKgb === 'function') {
              await window.EofficeDataService.deleteKgb(targetId, raw);
            }
            if (typeof showNotify === 'function') {
              showNotify("Berkas Dihapus", "Data KGB atas nama " + (raw.nama_pegawai || target.title) + " berhasil dihapus.", "success");
            }
          } catch (err) {
            console.error("Gagal menghapus KGB:", err);
            if (typeof showNotify === 'function') {
              showNotify("Gagal Menghapus", err.toString(), "error");
            }
            this.loadData(true);
          }
          return;
        }

        if (mode === 'tte') {
          this.closeConfirmModal();
          if (typeof showLoading === 'function') {
            showLoading("Mengirim pengajuan KGB ke antrean TTE Pimpinan...");
          }
          try {
            let res = null;
            if (window.EofficeDataService && typeof window.EofficeDataService.sendKgbForTte === 'function') {
              res = await window.EofficeDataService.sendKgbForTte(raw, nip, token);
            }
            if (typeof hideLoading === 'function') hideLoading();

            if (res && res.status === 'success') {
              const updatedDoc = res.data || { ...raw, status: 'Menunggu TTE Pimpinan' };
              const oldId = String(raw.id_kgb || '');
              const idx = this.rawKgbList.findIndex(k => String(k.id_kgb || '') === oldId);
              if (idx !== -1) {
                this.rawKgbList.splice(idx, 1, updatedDoc);
              } else {
                this.rawKgbList.unshift(updatedDoc);
              }
              if (window.EofficeDataService && typeof window.EofficeDataService.setLocalCache === 'function') {
                window.EofficeDataService.setLocalCache({ kgb: this.rawKgbList, rapat: this.rawRapatList });
              }
              if (typeof showNotify === 'function') {
                showNotify("Terkirim ke Pimpinan", "Pengajuan KGB " + (raw.nama_pegawai || target.title) + " siap untuk proses TTE Ketua.", "success");
              }
            } else if (typeof showNotify === 'function') {
              showNotify("Gagal Mengirim TTE", (res && res.message) ? res.message : "Terjadi kendala saat memperbarui status TTE.", "error");
            }
          } catch (err) {
            if (typeof hideLoading === 'function') hideLoading();
            console.error("Gagal kirim TTE KGB:", err);
            if (typeof showNotify === 'function') {
              showNotify("Error Sistem", err.toString(), "error");
            }
          }
        }
      },

      triggerOpenModalRapat() {
        if (typeof window.openRapatModalForm === 'function') {
          window.openRapatModalForm();
        } else if (typeof showNotify === 'function') {
          showNotify("Paket Rapat", "Membuka formulir agenda rapat baru...", "info");
        }
      },

      openModalRapatDetail(item) {
        if (typeof window.openRapatDetailModal === 'function') {
          window.openRapatDetailModal(item.rawData);
        } else if (typeof showNotify === 'function') {
          showNotify("Detail Rapat", item.title, "info");
        }
      }
    },

    mounted() {
      // 1. 0ms Local Cache Hydration
      if (window.EofficeDataService && typeof window.EofficeDataService.getLocalCache === 'function') {
        const cached = window.EofficeDataService.getLocalCache();
        if (cached && (Array.isArray(cached.kgb) || Array.isArray(cached.rapat))) {
          const merged = (typeof window.EofficeDataService.mergeDashboardQueue === 'function')
            ? window.EofficeDataService.mergeDashboardQueue(cached.kgb || [])
            : (cached.kgb || []);
          if (merged.length > 0) this.rawKgbList = merged;
          if (Array.isArray(cached.rapat) && cached.rapat.length > 0) this.rawRapatList = cached.rapat;
        }
      }

      // 2. Dengarkan event sinkronisasi server selesai (transkep:sync-complete)
      window.addEventListener('transkep:sync-complete', () => {
        if (this.isAdmin) {
          if (window.EofficeDataService && typeof window.EofficeDataService.mergeDashboardQueue === 'function') {
            this.rawKgbList = window.EofficeDataService.mergeDashboardQueue(this.rawKgbList);
          }
          const activeMenu = (window.vueState && window.vueState.currentMenu) || localStorage.getItem('transkep_last_menu');
          if (activeMenu === 'eoffice') {
            this.loadData(true);
          }
        }
      });

      // 3. Muat data jika menu saat ini adalah E-Office
      const currentMenu = (window.vueState && window.vueState.currentMenu) || localStorage.getItem('transkep_last_menu');
      if (currentMenu === 'eoffice' && this.isAdmin) {
        this.loadData();
      }
    }
  }).mount('#vue-eoffice-app');
});
