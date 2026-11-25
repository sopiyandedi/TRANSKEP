// =========================================================================
// FILE: modules/aktivitas/aktivitas.js
// DESKRIPSI: Kontroler Pop-Up Log Aktivitas & Monitoring Keamanan (Khusus Admin)
// ENGINE: TRANSKEP Core v3.8.97
// =========================================================================

(function () {
  function getCallerRoleLower() {
    const u = (typeof state !== 'undefined' && state.user) ? state.user : null;
    const rawRole = (u && u.role) ||
      (typeof localStorage !== 'undefined' ? (localStorage.getItem('transkep_user_role') || '') : '');
    return String(rawRole || '').trim().toLowerCase();
  }

  function isStrictAdminUser() {
    return ['admin', 'super admin', 'administrator'].includes(getCallerRoleLower());
  }

  function resolveTimestampMs(row) {
    if (!row) return 0;
    const ts = row.timestamp;
    if (ts && typeof ts.toDate === 'function') {
      return ts.toDate().getTime();
    }
    if (ts && typeof ts.seconds === 'number') {
      return ts.seconds * 1000;
    }
    if (typeof ts === 'string' && ts.trim()) {
      const parsed = Date.parse(ts);
      if (!isNaN(parsed)) return parsed;
    }
    const w = String(row.waktu || '').trim();
    const mWib = w.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})[,\s]+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?/);
    if (mWib) {
      const dd = Number(mWib[1]);
      const mm = Number(mWib[2]) - 1;
      const yyyy = Number(mWib[3]);
      const hh = Number(mWib[4]);
      const mi = Number(mWib[5]);
      const ss = Number(mWib[6] || 0);
      return new Date(yyyy, mm, dd, hh, mi, ss).getTime();
    }
    return 0;
  }

  function getWibTodayBounds() {
    const nowWibStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
    const startMs = Date.parse(nowWibStr + 'T00:00:00+07:00');
    return {
      dateStr: nowWibStr,
      startMs: isNaN(startMs) ? (Date.now() - 86400000) : startMs
    };
  }

  function mountAktivitasModalApp() {
    const mountEl = document.getElementById('vue-modal-aktivitas');
    if (!mountEl || typeof Vue === 'undefined' || window.vmAktivitasModal) return;

    window.vmAktivitasModal = Vue.createApp({
      data() {
        return {
          showModal: false,
          activeTab: 'audit',
          isLoading: false,
          loadError: '',
          lastSyncedAt: '',
          searchQuery: '',
          filterKategori: 'ALL',
          filterRange: '7d',
          auditLogs: [],
          securityIncidents: []
        };
      },
      computed: {
        summaryStats() {
          const todayStart = getWibTodayBounds().startMs;
          let todayTotal = 0;
          let todayLogins = 0;
          let sensitiveActions = 0;
          let warnCount = 0;

          for (let i = 0; i < this.auditLogs.length; i++) {
            const r = this.auditLogs[i];
            const ms = resolveTimestampMs(r);
            if (ms >= todayStart) {
              todayTotal++;
              if (String(r.kategori || '').toUpperCase() === 'LOGIN' && String(r.aksi || '').toUpperCase() === 'LOGIN_BERHASIL') {
                todayLogins++;
              }
            }
            const kat = String(r.kategori || '').toUpperCase();
            const aks = String(r.aksi || '').toUpperCase();
            if (kat === 'PEGAWAI' || kat === 'CUTI' || kat === 'DOKUMEN' || aks === 'GANTI_SANDI' || aks === 'RESET_SANDI_WA') {
              sensitiveActions++;
            }
            const sev = String(r.severity || '').toLowerCase();
            if (sev === 'warning' || sev === 'critical') {
              warnCount++;
            }
          }

          return {
            todayTotal,
            todayLogins,
            sensitiveActions,
            securityAlerts: warnCount + this.securityIncidents.length
          };
        },
        filteredAuditLogs() {
          return this.filterList(this.auditLogs, true);
        },
        filteredIncidents() {
          return this.filterList(this.securityIncidents, false);
        },
        activeRows() {
          return this.activeTab === 'audit' ? this.filteredAuditLogs : this.filteredIncidents;
        }
      },
      methods: {
        filterList(list, isAudit) {
          const q = String(this.searchQuery || '').trim().toLowerCase();
          const kat = String(this.filterKategori || 'ALL').toUpperCase();
          const range = this.filterRange;
          const nowMs = Date.now();
          let minMs = 0;
          if (range === 'today') minMs = getWibTodayBounds().startMs;
          else if (range === '7d') minMs = nowMs - (7 * 86400000);
          else if (range === '30d') minMs = nowMs - (30 * 86400000);

          return (Array.isArray(list) ? list : []).filter((row) => {
            if (minMs > 0) {
              const rowMs = resolveTimestampMs(row);
              if (rowMs > 0 && rowMs < minMs) return false;
            }
            if (isAudit && kat !== 'ALL') {
              if (String(row.kategori || '').toUpperCase() !== kat) return false;
            }
            if (q) {
              const hay = [
                row.actor_nama,
                this.resolveActorName(row),
                row.actor_nip,
                row.actor_role,
                row.kategori,
                row.aksi,
                row.target,
                row.detail,
                row.jenis_pelanggaran,
                row.nip,
                row.url
              ].join(' ').toLowerCase();
              if (!hay.includes(q)) return false;
            }
            return true;
          });
        },
        resolveActorName(row) {
          if (row && row.actor_nama) return row.actor_nama;
          const nip = String((row && row.actor_nip) || '').replace(/['"\s]/g, '').trim();
          const list = (typeof state !== 'undefined' && Array.isArray(state.usersList)) ? state.usersList : [];
          for (let i = 0; i < list.length; i++) {
            const uNip = String(list[i].nip || '').replace(/['"\s]/g, '').trim();
            if (uNip && uNip === nip) return list[i].nama || nip;
          }
          return nip || 'Sistem';
        },
        formatRowTime(row) {
          if (row && row.waktu) return row.waktu;
          const ms = resolveTimestampMs(row);
          if (!ms) return '-';
          try {
            return new Date(ms).toLocaleString('id-ID', {
              timeZone: 'Asia/Jakarta',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            });
          } catch (e) {
            return new Date(ms).toISOString();
          }
        },
        categoryBadgeClass(kat) {
          const k = String(kat || '').toUpperCase();
          if (k === 'LOGIN') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
          if (k === 'PEGAWAI') return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
          if (k === 'CUTI') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
          if (k === 'DOKUMEN') return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
          if (k === 'KEAMANAN') return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
          return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
        },
        severityDotClass(sev) {
          const s = String(sev || 'info').toLowerCase();
          if (s === 'critical') return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
          if (s === 'warning') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
          return 'bg-slate-800/80 text-slate-300 border-slate-700';
        },
        closeModal() {
          this.showModal = false;
        },
        refreshData() {
          this.loadData(true);
        },
        async loadData(forceNotice) {
          if (!isStrictAdminUser()) {
            this.showModal = false;
            return;
          }
          if (typeof window.TranskepFirebase === 'undefined' ||
              typeof window.TranskepFirebase.getFirestoreAuditLogs !== 'function') {
            this.loadError = 'Konektor Cloud Firestore belum tersedia.';
            return;
          }

          this.isLoading = true;
          this.loadError = '';
          try {
            const [audits, incidents] = await Promise.all([
              window.TranskepFirebase.getFirestoreAuditLogs(300),
              window.TranskepFirebase.getFirestoreSecurityIncidents(150)
            ]);
            this.auditLogs = Array.isArray(audits) ? audits : [];
            this.securityIncidents = Array.isArray(incidents) ? incidents : [];
            this.lastSyncedAt = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB';
            if (forceNotice && typeof showNotify === 'function') {
              showNotify('Log Diperbarui', 'Data aktivitas & keamanan terbaru telah dimuat.', 'success');
            }
          } catch (err) {
            this.loadError = 'Gagal memuat log aktivitas: ' + (err && err.message ? err.message : String(err));
          } finally {
            this.isLoading = false;
          }
        },
        exportExcel() {
          if (typeof XLSX === 'undefined') {
            if (typeof showNotify === 'function') {
              showNotify('Library Tidak Tersedia', 'SheetJS (XLSX) belum termuat untuk ekspor Excel.', 'error');
            }
            return;
          }
          const rows = this.activeTab === 'audit'
            ? this.filteredAuditLogs.map((r, idx) => ({
                No: idx + 1,
                Waktu_WIB: this.formatRowTime(r),
                NIP: r.actor_nip || '-',
                Nama: this.resolveActorName(r),
                Role: r.actor_role || '-',
                Kategori: r.kategori || '-',
                Aksi: r.aksi || '-',
                Tingkat: r.severity || 'info',
                Sumber: r.sumber || '-',
                Target: r.target || '-',
                Detail: r.detail || '-'
              }))
            : this.filteredIncidents.map((inc, idx) => ({
                No: idx + 1,
                Waktu_WIB: this.formatRowTime(inc),
                NIP: inc.nip || 'SECURITY_SYSTEM',
                Jenis_Pelanggaran: inc.jenis_pelanggaran || '-',
                Detail: inc.detail || '-',
                URL: inc.url || '-',
                UserAgent: inc.userAgent || '-'
              }));

          const ws = XLSX.utils.json_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          const sheetTitle = this.activeTab === 'audit' ? 'Aktivitas_Sistem' : 'Insiden_Keamanan';
          XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
          const dateTag = new Date().toISOString().slice(0, 10);
          XLSX.writeFile(wb, `TRANSKEP_${sheetTitle}_${dateTag}.xlsx`);
        }
      }
    }).mount('#vue-modal-aktivitas');
  }

  window.openModalAktivitas = function () {
    if (!isStrictAdminUser()) {
      if (typeof showNotify === 'function') {
        showNotify('Akses Ditolak', 'Pop-up Log Aktivitas hanya dapat dibuka oleh Admin.', 'error');
      }
      return;
    }
    mountAktivitasModalApp();
    if (window.vmAktivitasModal) {
      window.vmAktivitasModal.showModal = true;
      window.vmAktivitasModal.loadData(false);
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', mountAktivitasModalApp);
  }
})();
