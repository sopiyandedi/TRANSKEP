// ==========================================
// FILE: rekapitulasi.js (Modul Rekapitulasi Global Cuti)
// ==========================================

// --- Source: permohonan/js_rekapitulasi.html ---
// ==========================================
  // LOGIKA CLIENT-SIDE: REKAPITULASI HISTORI (VUE MIGRATED - TAHAP 4)
  // ==========================================
  
  window.renderRekapitulasiView = function() {
      if (window.vmRekapitulasi) {
          window.vmRekapitulasi.resetFilters();
      }
  };

  document.addEventListener("DOMContentLoaded", () => {
      const { createApp } = Vue;

      window.vmRekapitulasi = createApp({
          data() {
              return {
                  s: state, // Mengambil reference state global
                  filter: {
                      user: 'all',
                      userName: 'Semua Pegawai',
                      jenis: 'all',
                      start: '',
                      end: ''
                  },
                  searchQuery: '',
                  isDropdownOpen: false,
                  activeRekapDropdownId: null // TAHAP 43: ID Dropdown aksi rekap yang sedang terbuka
              };
          },
          computed: {
              isAdmin() {
                  if (!this.s || !this.s.user) return false;
                  return this.s.user.role === 'Admin' || this.s.user.role === 'Operator';
              },
              availableUsers() {
                  if (!this.s || !this.s.usersList) return [];
                  
                  let users = this.s.usersList.filter(u => u.role !== 'Admin' && u.role !== 'Operator');
                  
                  if (this.searchQuery && this.searchQuery !== 'Semua Pegawai') {
                      const q = this.searchQuery.toLowerCase();
                      users = users.filter(u => (u.nama.toLowerCase().includes(q) || u.jabatan.toLowerCase().includes(q)));
                  }
                  return users;
              },
              filteredLogs() {
                  if (!this.filter.start && !this.filter.end) return [];

                  let combinedData = [];

                  // 1. DATA CUTI
                  if (this.s.cutiLogs) {
                      combinedData.push(...this.s.cutiLogs.map(l => ({ ...l, z_type: 'Cuti' })));
                  }
                  
                  // 2. DATA SURAT TUGAS (ST)
                  if (this.s.stList) {
                      this.s.stList.forEach(st => {
                          let pesertaArr = [];
                          try { pesertaArr = JSON.parse(st.peserta || '[]'); } catch(e) {}
                          
                          pesertaArr.forEach(p => {
                              combinedData.push({
                                  is_st: true, id: st.id, nip: String(p.nip), tgl_pengajuan: st.waktu ? st.waktu.split(' ')[0] : '-',
                                  jenis: 'Dinas Luar', tgl_mulai: st.tgl_mulai, tgl_selesai: st.tgl_selesai,
                                  alasan: st.tujuan + " (di " + st.tempat + ")", status: 'Disetujui',
                                  get_spd: p.get_spd || false, plh_nip: p.plh_nip || ""
                              });
                          });
                      });
                  }

                  // 3. DATA IZIN KELUAR (IK)
                  if (this.s.ikLogs) {
                      this.s.ikLogs.forEach(log => {
                          combinedData.push({
                              z_type: 'IK', id: log.id, nip: String(log.nip), tgl_pengajuan: log.tgl_pengajuan,
                              jenis: 'Izin Keluar Kantor', 
                              tgl_mulai: log.tanggal || log.tgl_mulai, 
                              tgl_selesai: log.tanggal || log.tgl_selesai,
                              alasan: log.alasan + ` (Jam: ${log.jam_keluar || '-'} - ${log.jam_kembali || '-'})`, status: log.status || 'Menunggu'
                          });
                      });
                  }

                  // 4. DATA IZIN PRIBADI (IP)
                  if (this.s.ipLogs) {
                      this.s.ipLogs.forEach(log => {
                          combinedData.push({
                              z_type: 'IP', id: log.id, nip: String(log.nip), tgl_pengajuan: log.tgl_pengajuan,
                              jenis: 'Izin Pribadi', 
                              tgl_mulai: log.tanggal || log.tgl_mulai, 
                              tgl_selesai: log.tanggal || log.tgl_mulai,
                              alasan: log.alasan, status: log.status || 'Menunggu'
                          });
                      });
                  }

                  // 5. DATA WORK FROM HOME (WFH)
                  if (this.s.wfhLogs) {
                      this.s.wfhLogs.forEach(log => {
                          let ringkasan = "Detail WFH ada di dokumen PDF";
                          let finalStatus = log.status_rencana || 'Menunggu';
                          
                          if (log.status_rencana === 'Disetujui') {
                              if (!log.status_laporan || log.status_laporan === 'Belum Lapor') finalStatus = 'Isi Laporan';
                              else if (log.status_laporan === 'Menunggu') finalStatus = 'Laporan Diperiksa';
                              else finalStatus = log.status_laporan; 
                          }

                          try {
                              let isLaporan = (finalStatus === 'Laporan Diperiksa' || finalStatus === 'Disetujui' || finalStatus === 'Ditolak') && log.laporan_json;
                              let jsonTarget = isLaporan ? log.laporan_json : log.rencana_json;
                              let targetList = JSON.parse(jsonTarget || '[]');
                              
                              ringkasan = targetList.map((t, idx) => {
                                  if (isLaporan) return `${idx+1}. ${t.deskripsi} [Hasil: ${t.realisasi}]`;
                                  return `${idx+1}. ${t.deskripsi} [Target Qty: ${t.kuantitas}]`;
                              }).join(', ');
                          } catch(e) {}

                          combinedData.push({
                              z_type: 'WFH', id: log.id, nip: String(log.nip), tgl_pengajuan: log.tgl_pengajuan,
                              jenis: 'Work From Home', 
                              tgl_mulai: log.tanggal || log.tgl_mulai, 
                              tgl_selesai: log.tanggal || log.tgl_selesai,
                              alasan: ringkasan, status: finalStatus, wfh_rencana: log.status_rencana, wfh_laporan: log.status_laporan
                          });
                      });
                  }

                  // ==========================
                  // EKSEKUSI PENYARINGAN (FILTERING)
                  // ==========================
                  let filtered = combinedData;

                  if (this.filter.user !== 'all') {
                      filtered = filtered.filter(log => String(log.nip) === String(this.filter.user));
                  }

                  if (this.filter.jenis !== 'all') {
                      filtered = filtered.filter(log => {
                          if (['Tahunan', 'Sakit', 'Alasan Penting', 'Melahirkan', 'Besar', 'CLTN'].includes(this.filter.jenis)) {
                              return log.z_type === 'Cuti' && log.jenis === this.filter.jenis;
                          }
                          return log.jenis === this.filter.jenis;
                      });
                  }

                  if (this.filter.start || this.filter.end) {
                      let fStart = this.filter.start ? new Date(this.filter.start) : new Date(this.filter.end);
                      let fEnd = this.filter.end ? new Date(this.filter.end) : new Date(this.filter.start);
                      
                      fStart.setHours(0,0,0,0);
                      fEnd.setHours(23,59,59,999);

                      filtered = filtered.filter(log => {
                          if(!log.tgl_mulai || !log.tgl_selesai) return false;
                          let logStart = new Date(log.tgl_mulai); logStart.setHours(0,0,0,0);
                          let logEnd = new Date(log.tgl_selesai); logEnd.setHours(23,59,59,999);
                          return (logStart <= fEnd) && (logEnd >= fStart);
                      });
                  }

                  filtered.sort((a, b) => new Date(b.tgl_mulai) - new Date(a.tgl_mulai));

                  // ==========================
                  // PRESENTATION LAYER DATA BINDING
                  // ==========================
                  return filtered.map(log => {
                      const pns = this.s.usersList.find(u => String(u.nip) === String(log.nip)) || { nama: 'Unknown', jabatan: '-' };
                      
                      let statusColor = "text-amber-400 border-amber-500/30 bg-amber-500/10";
                      if (log.status === 'Disetujui') statusColor = "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
                      else if (log.status === 'Ditolak') statusColor = "text-rose-400 border-rose-500/30 bg-rose-500/10";
                      else if (log.status === 'Menunggu Pembatalan') statusColor = "text-purple-400 border-purple-500/30 bg-purple-500/10";
                      else if (log.status === 'DIBATALKAN') statusColor = "text-slate-400 border-slate-600 bg-slate-800";
                      else if (log.status === 'Isi Laporan') statusColor = "text-amber-400 border-amber-500/50 bg-amber-500/10 border-dashed animate-pulse";
                      else if (log.status === 'Laporan Diperiksa') statusColor = "text-sky-400 border-sky-500/30 bg-sky-500/10";

                      let alasanText = "*** Rahasia ***";
                      let tooltipText = "Anda tidak memiliki hak akses melihat rincian alasan";
                      
                      if (this.isAdmin || this.s.user.role === 'Atasan' || String(this.s.user.nip) === String(log.nip) || log.jenis === 'Dinas Luar') {
                          alasanText = log.alasan;
                          tooltipText = log.alasan;
                      }

                      return {
                          ...log,
                          pnsNama: pns.nama,
                          pnsJabatan: pns.jabatan,
                          tgl_mulai_indo: this.formatDateIndoRekap(log.tgl_mulai),
                          tgl_selesai_indo: this.formatDateIndoRekap(log.tgl_selesai),
                          statusColor,
                          alasanText,
                          tooltipText
                      };
                  });
              }
          },
          methods: {
              formatDateIndoRekap(dateStr) {
                  if (!dateStr) return "-";
                  const parts = dateStr.split('-');
                  if (parts.length === 3) {
                      const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
                      return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
                  }
                  return dateStr;
              },
              resetFilters() {
                  this.filter.user = 'all';
                  this.filter.userName = 'Semua Pegawai';
                  this.filter.jenis = 'all';
                  this.filter.start = '';
                  this.filter.end = '';
                  this.searchQuery = 'Semua Pegawai';
                  this.isDropdownOpen = false;
              },
              openDropdown() {
                  this.isDropdownOpen = true;
                  if (this.filter.userName === 'Semua Pegawai') this.searchQuery = '';
                  else this.searchQuery = this.filter.userName;
                  
                  this.$nextTick(() => {
                      const ref = this.$refs.searchInputBox;
                      if(ref) ref.focus();
                  });
              },
              closeDropdown() {
                  setTimeout(() => { this.isDropdownOpen = false; }, 200);
                  if (!this.searchQuery.trim()) {
                      this.filter.user = 'all';
                      this.filter.userName = 'Semua Pegawai';
                      this.searchQuery = 'Semua Pegawai';
                  }
              },
              selectUser(nip, name) {
                  this.filter.user = nip;
                  this.filter.userName = nip === 'all' ? 'Semua Pegawai' : name.split(' (')[0];
                  this.searchQuery = this.filter.userName;
                  this.isDropdownOpen = false;
              },
              clearSearch() {
                  this.filter.user = 'all';
                  this.filter.userName = 'Semua Pegawai';
                  this.searchQuery = '';
                  this.$refs.searchInputBox.focus();
              },
              cetakRekap() {
                  if (!this.filter.start && !this.filter.end) {
                      if(window.showNotify) window.showNotify("Tidak Dapat Mencetak", "Silakan pilih rentang tanggal (Dari / Sampai) terlebih dahulu untuk memunculkan data.", "error");
                      return;
                  }
                  window.print();
              },
              
              // =====================================
              // TAHAP 3: BRIDGING STANDARISASI VUE (SAFE SHORT-CIRCUIT)
              // =====================================
              execBypassCuti() { window.openFormCutiModal && window.openFormCutiModal(true); },
              execBuatST() { window.openModalST && window.openModalST(); },
              execEditST(id) { window.editST && window.editST(id); },
              
              execCetakCuti(id) { 
                  this.activeRekapDropdownId = null;
                  window.printCutiForm && window.printCutiForm(id); 
              },
              execUnduhSignedCuti(id) { 
                  this.activeRekapDropdownId = null;
                  window.downloadSignedCutiPdf && window.downloadSignedCutiPdf(id); 
              },
              toggleRekapDropdown(id) {
                  this.activeRekapDropdownId = (this.activeRekapDropdownId === id) ? null : id;
              },
              closeRekapDropdown() {
                  this.activeRekapDropdownId = null;
              },
              execCetakPlhCuti(id, nip, logHistoryStr, logPlhNip) {
                  let cutiPlhNip = logPlhNip || null;
                  if (!cutiPlhNip && logHistoryStr) {
                     try { let h = JSON.parse(logHistoryStr); if(h.plh_nip) cutiPlhNip = h.plh_nip; } catch(e){}
                  }
                  if (cutiPlhNip && window.cetakPlhCutiTahap2) {
                      window.cetakPlhCutiTahap2(id, nip, cutiPlhNip);
                  }
              },
              
              execCetakST(id) {
                  if (!this.s.stList) return;
                  const stData = this.s.stList.find(st => String(st.id) === String(id));
                  if (stData) {
                      if (window.printSuratTugas) window.printSuratTugas(id, stData);
                      else if(window.showNotify) window.showNotify("Error", "Fungsi cetak Surat Tugas belum dimuat.", "error");
                  }
              },
              execCetakSPD(id, nip) {
                  if (window.printSuratPerjalananDinas) window.printSuratPerjalananDinas(id, nip);
                  else if(window.showNotify) window.showNotify("Modul Belum Tersedia", "Fitur cetak SPD sedang dalam pengembangan.", "warning");
              },
              execCetakPlhST(id, nip) {
                  if (window.printSuratPlh) window.printSuratPlh(id, nip);
                  else if(window.showNotify) window.showNotify("Modul Belum Tersedia", "Fitur cetak Surat Penunjukan Plh sedang dalam pengembangan.", "warning");
              },
              
              execCetakIK(id) { window.cetakIzinKeluar && window.cetakIzinKeluar(id); },
              execCetakIP(id) { window.cetakIzinPribadi && window.cetakIzinPribadi(id); },
              execCetakWfhPlan(id) { window.cetakRencanaWFH && window.cetakRencanaWFH(id); },
              execCetakWfhLap(id) { window.cetakLaporanWFH && window.cetakLaporanWFH(id); },

              // =====================================
              // TINDAKAN PENGHAPUSAN (DELETE OPERATIONS VIA DATA SERVICE)
              // =====================================
              deleteRekapRecord(id) {
                  const token = localStorage.getItem('transkep_session_token');
                  if(window.showCustomConfirm) window.showCustomConfirm("Batalkan Cuti", "Apakah Anda yakin ingin membatalkan cuti ini? Statusnya akan berubah menjadi DIBATALKAN dan saldo cuti akan dikembalikan utuh ke pegawai terkait.", async () => {
                      if(window.showLoading) window.showLoading("Membatalkan data...");
                      try {
                          const res = await RekapitulasiDataService.deleteCuti(id, this.s.user.nip, token);
                          if(window.hideLoading) window.hideLoading();
                          if (res && res.status === 'success') {
                              if(window.showNotify) window.showNotify("Berhasil Dibatalkan", res.message, "success");
                              const logIndex = this.s.cutiLogs.findIndex(l => String(l.id) === String(id));
                              if (logIndex !== -1) {
                                  this.s.cutiLogs[logIndex].status = 'DIBATALKAN';
                                  this.s.cutiLogs[logIndex].status_atasan = 'DIBATALKAN';
                                  this.s.cutiLogs[logIndex].status_pejabat = 'DIBATALKAN';
                              }
                          } else { 
                              if(window.showNotify) window.showNotify("Gagal Membatalkan", res ? res.message : "Terjadi kesalahan.", "error"); 
                          }
                      } catch (err) {
                          if(window.hideLoading) window.hideLoading();
                          if(window.showNotify) window.showNotify("Error", err.message || err.toString(), "error");
                      }
                  });
              },
              deleteSTRecord(id) {
                  const token = localStorage.getItem('transkep_session_token');
                  if(window.showCustomConfirm) window.showCustomConfirm("Hapus Surat Tugas", "Apakah Anda yakin ingin menghapus dokumen Surat Tugas ini? Semua nama pegawai yang tergabung dalam rombongan dinas ini akan ikut terhapus riwayatnya.", async () => {
                      if(window.showLoading) window.showLoading("Menghapus Surat Tugas...");
                      try {
                          const res = await RekapitulasiDataService.deleteST(id, this.s.user.nip, token);
                          if(window.hideLoading) window.hideLoading();
                          if (res && res.status === 'success') {
                              if(window.showNotify) window.showNotify("Surat Tugas Dihapus", res.message, "success");
                              const logIndex = this.s.stList.findIndex(l => String(l.id) === String(id));
                              if (logIndex !== -1) this.s.stList.splice(logIndex, 1);
                          } else { 
                              if(window.showNotify) window.showNotify("Gagal Menghapus", res ? res.message : "Terjadi kesalahan.", "error"); 
                          }
                      } catch (err) {
                          if(window.hideLoading) window.hideLoading();
                          if(window.showNotify) window.showNotify("Error Jaringan", err.message || err.toString(), "error");
                      }
                  });
              },
              deleteIKFromRekap(id) {
                  const token = localStorage.getItem('transkep_session_token');
                  if(window.showCustomConfirm) window.showCustomConfirm("Hapus Permanen Izin Keluar", "Yakin ingin menghapus data Izin Keluar ini secara permanen dari sistem? Aksi ini tidak dapat dibatalkan.", async () => {
                      if(window.showLoading) window.showLoading("Menghapus data...");
                      try {
                          const res = await RekapitulasiDataService.deleteIK(id, this.s.user.nip, token);
                          if(window.hideLoading) window.hideLoading();
                          if (res && res.status === 'success') {
                              if(window.showNotify) window.showNotify("Berhasil Dihapus", res.message, "success");
                              const idx = this.s.ikLogs.findIndex(l => String(l.id) === String(id));
                              if (idx !== -1) this.s.ikLogs.splice(idx, 1);
                          } else { 
                              if(window.showNotify) window.showNotify("Gagal", res ? res.message : "Terjadi kesalahan.", "error"); 
                          }
                      } catch (err) {
                          if(window.hideLoading) window.hideLoading();
                          if(window.showNotify) window.showNotify("Error", err.message || err.toString(), "error");
                      }
                  });
              },
              deleteIPFromRekap(id) {
                  const token = localStorage.getItem('transkep_session_token');
                  if(window.showCustomConfirm) window.showCustomConfirm("Hapus Permanen Izin Pribadi", "Yakin ingin menghapus data Izin Pribadi ini secara permanen dari sistem? Aksi ini tidak dapat dibatalkan.", async () => {
                      if(window.showLoading) window.showLoading("Menghapus data...");
                      try {
                          const res = await RekapitulasiDataService.deleteIP(id, this.s.user.nip, token);
                          if(window.hideLoading) window.hideLoading();
                          if (res && res.status === 'success') {
                              if(window.showNotify) window.showNotify("Berhasil Dihapus", res.message, "success");
                              const idx = this.s.ipLogs.findIndex(l => String(l.id) === String(id));
                              if (idx !== -1) this.s.ipLogs.splice(idx, 1);
                          } else { 
                              if(window.showNotify) window.showNotify("Gagal", res ? res.message : "Terjadi kesalahan.", "error"); 
                          }
                      } catch (err) {
                          if(window.hideLoading) window.hideLoading();
                          if(window.showNotify) window.showNotify("Error", err.message || err.toString(), "error");
                      }
                  });
              },
              deleteWFHFromRekap(id) {
                  const token = localStorage.getItem('transkep_session_token');
                  if(window.showCustomConfirm) window.showCustomConfirm("Hapus Permanen WFH", "Yakin ingin menghapus data Rencana/Laporan WFH ini secara permanen dari sistem? Aksi ini tidak dapat dibatalkan.", async () => {
                      if(window.showLoading) window.showLoading("Menghapus data...");
                      try {
                          const res = await RekapitulasiDataService.deleteWFH(id, this.s.user.nip, token);
                          if(window.hideLoading) window.hideLoading();
                          if (res && res.status === 'success') {
                              if(window.showNotify) window.showNotify("Berhasil Dihapus", res.message, "success");
                              const idx = this.s.wfhLogs.findIndex(l => String(l.id) === String(id));
                              if (idx !== -1) this.s.wfhLogs.splice(idx, 1);
                          } else { 
                              if(window.showNotify) window.showNotify("Gagal", res ? res.message : "Terjadi kesalahan.", "error"); 
                          }
                      } catch (err) {
                          if(window.hideLoading) window.hideLoading();
                          if(window.showNotify) window.showNotify("Error", err.message || err.toString(), "error");
                      }
                  });
              },

              async resendCutiWA(log) {
                  if (!this.isAdmin) return;
                  const token = localStorage.getItem('transkep_session_token');
                  const adminNip = this.s.user ? this.s.user.nip : '';
                  
                  if (window.showCustomConfirm) {
                      window.showCustomConfirm(
                          "Kirim Ulang Notifikasi WA",
                          `Kirim ulang notifikasi WhatsApp & Magic Link untuk pengajuan cuti ${log.pnsNama || log.nip} ke Atasan/Pejabat terkait?`,
                          async () => {
                              if (window.showLoading) window.showLoading("Mengirim pesan WhatsApp via WAHA...");
                              try {
                                  const res = await RekapitulasiDataService.resendCutiWA(log.id, adminNip, token);
                                  if (window.hideLoading) window.hideLoading();
                                  if (res && res.status === 'success') {
                                      if (window.showNotify) window.showNotify("WhatsApp Terkirim", res.message, "success");
                                  } else {
                                      if (window.showNotify) window.showNotify("Gagal Mengirim", res ? res.message : "Terjadi kesalahan.", "error");
                                  }
                              } catch (err) {
                                  if (window.hideLoading) window.hideLoading();
                                  if (window.showNotify) window.showNotify("Error Jaringan", err.message || err.toString(), "error");
                              }
                          }
                      );
                  }
              }
          },
          mounted() {
              // TAHAP 43: Auto-close dropdown rekap saat klik di luar
              document.addEventListener('click', (e) => {
                  if (!e.target.closest('.dropdown-rekap-container')) {
                      this.activeRekapDropdownId = null;
                  }
              });
          }
      }).mount('#vue-rekapitulasi-wrapper');
  });
