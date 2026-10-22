// ==========================================
// FILE: cuti.js (Modul Cuti Pegawai)
// ==========================================

// ==========================================
// FILE: permohonan.js (TRANSKEP Modular)
// ENGINE: ZettBOT Core v1.0.0
// ==========================================

// --- Source: permohonan/js_permohonan_view.html ---
// =========================================================================
  // LOGIKA CLIENT-SIDE: RENDER VIEW & TABEL PERMOHONAN (MIGRATED TO VUE)
  // =========================================================================

  // 1. FUNGSI VANILLA EKSISTING (DIBIARKAN AGAR NAVIGASI AMAN - TAHAP 2 NANTI)
  function switchCutiTab(tabId) {
      document.querySelectorAll('.cuti-tab-content').forEach(function(el) {
          el.classList.add('hidden');
          el.classList.remove('block'); 
          el.style.opacity = '0';
          el.style.transition = 'none';
      });
      
      const targetContent = document.getElementById('tab-' + tabId);
      if (targetContent) {
          targetContent.classList.remove('hidden');
          targetContent.classList.add('block');
          
          setTimeout(() => {
              targetContent.style.transition = 'opacity 0.4s ease-in-out';
              targetContent.style.opacity = '1';
          }, 20);
      }

      const tabs = ['riwayat', 'verifikasi', 'rekapitulasi'];
      tabs.forEach(function(id) {
          const btn = document.getElementById('btn-tab-' + id);
          if (!btn) return;
          
          if (id === tabId) {
              btn.classList.add('bg-indigo-600', 'text-white', 'shadow-lg', 'shadow-indigo-600/20');
              btn.classList.remove('text-slate-400', 'hover:text-slate-200', 'hover:bg-slate-800');
          } else {
              btn.classList.remove('bg-indigo-600', 'text-white', 'shadow-lg', 'shadow-indigo-600/20');
              btn.classList.add('text-slate-400', 'hover:text-slate-200', 'hover:bg-slate-800');
          }
      });
      
      if (tabId === 'verifikasi' && typeof renderPersetujuanView === 'function') renderPersetujuanView();
      if (tabId === 'rekapitulasi' && typeof renderRekapitulasiView === 'function') renderRekapitulasiView();
  }

  function updateBadgePermohonan() {
      if (!state || !state.user) return;
      const myRole = state.user.role;
      const myNip = String(state.user.nip);
      const isAdmin = (myRole === 'Admin' || myRole === 'Operator');

      let pendingCount = 0;
      let countAtasan = 0;
      let countPejabat = 0;

      if (state.cutiLogs) {
          state.cutiLogs.forEach(function(log) {
              const isPendingBatal = (log.status === 'Menunggu Pembatalan');
              if (log.status !== 'Menunggu' && !isPendingBatal) return;
              
              if (isAdmin) {
                  pendingCount++;
                  if (log.status_atasan === 'Menunggu') countAtasan++;
                  if (log.status_pejabat === 'Menunggu' && log.status_atasan === 'Disetujui') countPejabat++;
                  if (isPendingBatal) countPejabat++; 
              } else {
                  if (isPendingBatal && String(log.pejabat_nip) === myNip) pendingCount++;
                  else if (!isPendingBatal && String(log.atasan_nip) === myNip && log.status_atasan === 'Menunggu') pendingCount++;
                  else if (!isPendingBatal && String(log.pejabat_nip) === myNip && log.status_pejabat === 'Menunggu' && log.status_atasan === 'Disetujui') pendingCount++;
              }
          });
      }

      if (state.ikLogs) {
          state.ikLogs.forEach(function(log) {
              if (log.status !== 'Menunggu') return;
              if (isAdmin) { pendingCount++; countAtasan++; }
              else if (String(log.atasan_nip) === myNip) pendingCount++;
          });
      }

      if (state.ipLogs) {
          state.ipLogs.forEach(function(log) {
              if (log.status !== 'Menunggu') return;
              if (isAdmin) { pendingCount++; countAtasan++; }
              else if (String(log.atasan_nip) === myNip) pendingCount++;
          });
      }

      if (state.wfhLogs) {
          state.wfhLogs.forEach(function(log) {
              if (log.status_rencana === 'Menunggu' || log.status_laporan === 'Menunggu') {
                  if (isAdmin) { pendingCount++; countAtasan++; }
                  else if (String(log.atasan_nip) === myNip) pendingCount++;
              }
          });
      }

      const badgeVerifikasi = document.getElementById('badge-verifikasi');
      if (badgeVerifikasi) {
          if (pendingCount > 0) {
              badgeVerifikasi.innerText = pendingCount;
              badgeVerifikasi.classList.remove('hidden');
          } else {
              badgeVerifikasi.classList.add('hidden');
          }
      }

      if (isAdmin) {
          const btnAtasan = document.getElementById('btnBypassAtasan');
          const btnPejabat = document.getElementById('btnBypassPejabat');
          if (btnAtasan) btnAtasan.innerText = `Atasan Langsung (${countAtasan})`;
          if (btnPejabat) btnPejabat.innerText = `Pejabat Berwenang (${countPejabat})`;
      }

      const navPermohonan = document.getElementById('nav-permohonan');
      if (navPermohonan) {
          let badgeSidebar = document.getElementById('badge-permohonan-nav');
          if (!badgeSidebar) {
              navPermohonan.classList.add('relative');
              badgeSidebar = document.createElement('span');
              badgeSidebar.id = 'badge-permohonan-nav';
              badgeSidebar.className = 'absolute top-2 left-[28px] z-10 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] text-white font-bold shadow-[0_0_10px_rgba(244,63,94,0.8)] border-[1.5px] border-slate-900 animate-pulse hidden pointer-events-none';
              navPermohonan.appendChild(badgeSidebar);
          }
          if (pendingCount > 0) {
              badgeSidebar.innerText = pendingCount > 99 ? '99+' : pendingCount;
              badgeSidebar.classList.remove('hidden');
          } else {
              badgeSidebar.classList.add('hidden');
          }
      }
  }

  function calculateDuration(start, end) {
      const d1 = new Date(start); const d2 = new Date(end);
      let count = 0;
      for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
          if (d.getDay() !== 0 && d.getDay() !== 6) count++;
      }
      return count;
  }

  function renderPermohonanView() {
      const btnVerifikasi = document.getElementById('btn-tab-verifikasi');
      if (state && state.user && btnVerifikasi) {
          const myRole = state.user.role;
          if (['Admin', 'Operator', 'Atasan Langsung', 'Pejabat Berwenang'].includes(myRole)) {
              btnVerifikasi.classList.remove('hidden');
          } else {
              btnVerifikasi.classList.add('hidden');
              const tabVerifikasi = document.getElementById('tab-verifikasi');
              if (tabVerifikasi && !tabVerifikasi.classList.contains('hidden')) switchCutiTab('riwayat');
          }
      }
      if(typeof updateBadgePermohonan === 'function') updateBadgePermohonan();
  }


  // 2. VUE COMPONENT INITIALIZATION
  document.addEventListener("DOMContentLoaded", () => {
      const { createApp } = Vue;

      window.vmRiwayatPermohonan = createApp({
          data() {
              return {
                  s: window.vueState || state, // Mengikat variabel global state/vueState ke dalam lokal Vue
                  activeDropdownId: null, // ZETTBOT TAHAP 43: ID Dropdown aksi yang sedang terbuka
                  isRefreshing: false
              };
          },
          computed: {
              // Engine Pengolah Data Otomatis
              formattedLogs() {
                  const userObj = (this.s && this.s.user) || (window.vueState && window.vueState.user) || state.user;
                  if (!userObj || !userObj.nip) return [];

                  const myLogs = [];
                  const myNipClean = String(userObj.nip).replace(/[^0-9]/g, '');
                  
                  const cutiList = (this.s && this.s.cutiLogs && this.s.cutiLogs.length > 0) ? this.s.cutiLogs : ((window.vueState && window.vueState.cutiLogs) || state.cutiLogs || []);
                  if (cutiList && cutiList.length > 0) {
                      cutiList.filter(l => {
                          const lNip = String(l.nip || '').replace(/[^0-9]/g, '');
                          return lNip === myNipClean;
                      }).forEach(l => {
                          let idSort = 0;
                          if (l.id) {
                            const parts = String(l.id).split('-');
                            idSort = parseInt(parts[1] || parts[0]) || 0;
                          }
                          myLogs.push(Object.assign({}, l, { z_type: 'Cuti', z_sort: idSort }));
                      });
                  }

                  const ikList = (this.s && this.s.ikLogs && this.s.ikLogs.length > 0) ? this.s.ikLogs : ((window.vueState && window.vueState.ikLogs) || state.ikLogs || []);
                  if (ikList && ikList.length > 0) {
                      ikList.filter(l => String(l.nip || '').replace(/[^0-9]/g, '') === myNipClean).forEach(l => {
                          let idSort = 0;
                          if (l.id) {
                            const parts = String(l.id).split('-');
                            idSort = parseInt(parts[1] || parts[0]) || 0;
                          }
                          myLogs.push(Object.assign({}, l, { z_type: 'IK', z_sort: idSort }));
                      });
                  }

                  const ipList = (this.s && this.s.ipLogs && this.s.ipLogs.length > 0) ? this.s.ipLogs : ((window.vueState && window.vueState.ipLogs) || state.ipLogs || []);
                  if (ipList && ipList.length > 0) {
                      ipList.filter(l => String(l.nip || '').replace(/[^0-9]/g, '') === myNipClean).forEach(l => {
                          let idSort = 0;
                          if (l.id) {
                            const parts = String(l.id).split('-');
                            idSort = parseInt(parts[1] || parts[0]) || 0;
                          }
                          myLogs.push(Object.assign({}, l, { z_type: 'IP', z_sort: idSort }));
                      });
                  }

                  const wfhList = (this.s && this.s.wfhLogs && this.s.wfhLogs.length > 0) ? this.s.wfhLogs : ((window.vueState && window.vueState.wfhLogs) || state.wfhLogs || []);
                  if (wfhList && wfhList.length > 0) {
                      wfhList.filter(l => String(l.nip || '').replace(/[^0-9]/g, '') === myNipClean).forEach(l => {
                          let idSort = 0;
                          if (l.id) {
                            const parts = String(l.id).split('-');
                            idSort = parseInt(parts[1] || parts[0]) || 0;
                          }
                          myLogs.push(Object.assign({}, l, { z_type: 'WFH', z_sort: idSort }));
                      });
                  }

                  myLogs.sort((a, b) => b.z_sort - a.z_sort);

                  // Translasi Data Mentah ke Objek View
                  return myLogs.map((log) => {
                      let atasan = this.s.usersList.find(u => u.nip === log.atasan_nip) || { nama: 'Tidak Diketahui' };
                      let pejabat = { nama: '-' };

                      let jenisText = "";
                      let tgl_1 = "", tgl_2 = "";
                      let durasiObj = { text: '', class: '' };
                      let statusAkhir = log.status;
                      let statusColor = "text-amber-400 bg-amber-500/10 border-amber-500/20";
                      let atasanDot = "text-amber-500";
                      let pejabatDot = "text-slate-600";
                      let hasDropdown = false;
                      let actions = [];

                      // --- LOGIKA CUTI ---
                      if (log.z_type === 'Cuti') {
                          jenisText = log.jenis;
                          tgl_1 = log.tgl_mulai; tgl_2 = `s.d ${log.tgl_selesai}`;
                          pejabat = this.s.usersList.find(u => u.nip === log.pejabat_nip) || { nama: 'Tidak Diketahui' };
                          
                          durasiObj = { text: `Durasi: ${log.sisa_cuti || calculateDuration(log.tgl_mulai, log.tgl_selesai)} Hari`, class: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-400' };
                          
                          atasanDot = log.status_atasan === 'Disetujui' ? 'text-emerald-500' : (log.status_atasan === 'Ditolak' ? 'text-rose-500' : 'text-amber-500');
                          pejabatDot = log.status_pejabat === 'Disetujui' ? 'text-emerald-500' : (log.status_pejabat === 'Ditolak' ? 'text-rose-500' : 'text-amber-500');
                          
                          const sNorm = String(log.status || '').trim().toLowerCase();
                          hasDropdown = false;
                          if (log.jenis !== 'Dinas Luar') {
                              if (sNorm === 'disetujui') {
                                  hasDropdown = true; // ZETTBOT TAHAP 43: 1 Tombol Ikon Compact mengeluarkan 2 opsi (Cetak & Unduh TTE)
                              } else {
                                  actions.push({ actionType: 'cetakCuti', icon: 'fa-print', text: '', css: 'p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg transition shadow-md shadow-slate-900/30 text-xs', tooltip: 'Cetak Formulir' });
                              }
                          }
                          
                          if (sNorm === 'menunggu' || sNorm === 'perubahan') {
                              actions.push({ actionType: 'editCuti', icon: 'fa-pen-to-square', text: '', css: 'px-2 py-1.5 bg-indigo-500/10 hover:bg-indigo-500 border border-indigo-500/20 hover:border-indigo-500 text-indigo-400 hover:text-white rounded-lg transition', tooltip: 'Ubah Pengajuan' });
                              actions.push({ actionType: 'batalCuti', icon: 'fa-trash-can', text: '', css: 'px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white rounded-lg transition', tooltip: 'Tarik Pengajuan' });
                          } else if (sNorm === 'disetujui') {
                              actions.push({ actionType: 'usulBatalCuti', icon: 'fa-ban', text: 'Usul Batal', css: 'px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white rounded-lg transition text-xs font-semibold', tooltip: 'Usulkan Pembatalan Resmi' });
                          }
                      } 
                      // --- LOGIKA IZIN KELUAR ---
                      else if (log.z_type === 'IK') {
                          jenisText = "Izin Keluar Kantor";
                          tgl_1 = log.tanggal; tgl_2 = `Jam: ${log.jam_keluar || "-"} - ${log.jam_kembali || "-"}`;
                          
                          durasiObj = { text: 'IK (Short Leave)', class: 'border-sky-500/20 bg-sky-500/10 text-sky-400' };
                          atasanDot = log.status === 'Disetujui' ? 'text-emerald-500' : (log.status === 'Ditolak' ? 'text-rose-500' : 'text-amber-500');
                          
                          actions.push({ actionType: 'cetakIK', icon: 'fa-print', text: 'Cetak IK', css: 'px-3 py-1.5 bg-sky-900/50 hover:bg-sky-700 text-sky-300 border border-sky-700 rounded-lg transition shadow-md shadow-sky-900/20', tooltip: 'Cetak IK' });
                          
                          if (log.status === 'Menunggu') {
                              actions.push({ actionType: 'editIK', icon: 'fa-pen-to-square', text: '', css: 'px-2 py-1.5 bg-indigo-500/10 hover:bg-indigo-500 border border-indigo-500/20 hover:border-indigo-500 text-indigo-400 hover:text-white rounded-lg transition', tooltip: 'Ubah Pengajuan' });
                              actions.push({ actionType: 'batalIK', icon: 'fa-trash-can', text: '', css: 'px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white rounded-lg transition', tooltip: 'Tarik Pengajuan' });
                          }
                      }
                      // --- LOGIKA IZIN PRIBADI ---
                      else if (log.z_type === 'IP') {
                          jenisText = "Izin Pribadi";
                          tgl_1 = log.tanggal || log.tgl_mulai; tgl_2 = ``; 
                          
                          durasiObj = { text: 'Izin Pribadi', class: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' };
                          pejabat = this.s.usersList.find(u => String(u.nip) === String(log.pejabat_nip)) || { nama: 'Menunggu/Tidak Diisi' };
                          
                          atasanDot = log.status === 'Disetujui' ? 'text-emerald-500' : (log.status === 'Ditolak' ? 'text-rose-500' : 'text-amber-500');
                          pejabatDot = log.status === 'Disetujui' ? 'text-emerald-500' : (log.status === 'Ditolak' ? 'text-rose-500' : 'text-amber-500');
                          
                          actions.push({ actionType: 'cetakIP', icon: 'fa-print', text: 'Cetak IP', css: 'px-3 py-1.5 bg-emerald-900/50 hover:bg-emerald-700 text-emerald-300 border border-emerald-700 rounded-lg transition shadow-md shadow-emerald-900/20', tooltip: 'Cetak IP' });
                          
                          if (log.status === 'Menunggu') {
                              actions.push({ actionType: 'editIP', icon: 'fa-pen-to-square', text: '', css: 'px-2 py-1.5 bg-indigo-500/10 hover:bg-indigo-500 border border-indigo-500/20 hover:border-indigo-500 text-indigo-400 hover:text-white rounded-lg transition', tooltip: 'Ubah Pengajuan' });
                              actions.push({ actionType: 'batalIP', icon: 'fa-trash-can', text: '', css: 'px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white rounded-lg transition', tooltip: 'Tarik Pengajuan' });
                          }
                      }
                      // --- LOGIKA WORK FROM HOME ---
                      else if (log.z_type === 'WFH') {
                          jenisText = "Work From Home (WFH)";
                          tgl_1 = log.tanggal; tgl_2 = `Pekerjaan Remote`;
                          
                          durasiObj = { text: 'WFH', class: 'border-amber-500/20 bg-amber-500/10 text-amber-400' };
                          
                          if (log.status_rencana === 'Menunggu' || log.status_rencana === 'Ditolak') {
                              statusAkhir = log.status_rencana;
                              atasanDot = log.status_rencana === 'Ditolak' ? 'text-rose-500' : 'text-amber-500';
                              
                              actions.push({ actionType: 'cetakWFHPlan', icon: 'fa-print', text: 'Plan', css: 'px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition shadow-md shadow-slate-900/30', tooltip: 'Cetak Plan' });
                              
                              if (log.status_rencana === 'Menunggu') {
                                  actions.push({ actionType: 'editWFHPlan', icon: 'fa-pen-to-square', text: '', css: 'px-2 py-1.5 bg-indigo-500/10 hover:bg-indigo-500 border border-indigo-500/20 hover:border-indigo-500 text-indigo-400 hover:text-white rounded-lg transition', tooltip: 'Ubah Rencana' });
                                  actions.push({ actionType: 'batalWFH', icon: 'fa-trash-can', text: '', css: 'px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500 border border-rose-500/20 hover:border-rose-500 text-rose-400 hover:text-white rounded-lg transition', tooltip: 'Tarik Plan' });
                              }
                          } else {
                              atasanDot = 'text-emerald-500'; 
                              
                              if (log.status_laporan === 'Belum Lapor') {
                                  statusAkhir = 'Isi Laporan';
                                  actions.push({ actionType: 'cetakWFHPlan', icon: 'fa-print', text: 'Plan', css: 'px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition shadow-md shadow-slate-900/30', tooltip: 'Cetak Plan' });
                                  actions.push({ actionType: 'laporWFH', icon: 'fa-pen-to-square', text: 'Lapor', css: 'px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white border border-amber-500 rounded-lg transition shadow-lg shadow-amber-500/30 animate-pulse', tooltip: 'Isi Laporan WFH' });
                              } else if (log.status_laporan === 'Menunggu') {
                                  statusAkhir = 'Laporan Diperiksa';
                                  actions.push({ actionType: 'cetakWFHPlan', icon: 'fa-print', text: 'Plan', css: 'px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition shadow-md shadow-slate-900/30', tooltip: 'Cetak Plan' });
                                  actions.push({ actionType: 'cetakWFHLap', icon: 'fa-print', text: 'Lap.', css: 'px-2 py-1.5 bg-emerald-700/50 hover:bg-emerald-600 text-emerald-300 border border-emerald-600 rounded-lg transition shadow-md shadow-emerald-900/20', tooltip: 'Cetak Lap.' });
                                  actions.push({ actionType: 'editWFHLap', icon: 'fa-pen-to-square', text: '', css: 'px-2 py-1.5 bg-indigo-500/10 hover:bg-indigo-500 border border-indigo-500/20 hover:border-indigo-500 text-indigo-400 hover:text-white rounded-lg transition', tooltip: 'Ubah Laporan' });
                              } else if (log.status_laporan === 'Ditolak') {
                                  statusAkhir = 'Laporan Ditolak';
                                  actions.push({ actionType: 'cetakWFHPlan', icon: 'fa-print', text: 'Plan', css: 'px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition shadow-md shadow-slate-900/30', tooltip: 'Cetak Plan' });
                                  actions.push({ actionType: 'editWFHLap', icon: 'fa-pen-to-square', text: 'Revisi', css: 'px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white border border-amber-500 rounded-lg transition shadow-lg shadow-amber-500/30', tooltip: 'Revisi Laporan' });
                              } else {
                                  statusAkhir = 'Disetujui';
                                  actions.push({ actionType: 'cetakWFHPlan', icon: 'fa-print', text: 'Plan', css: 'px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition shadow-md shadow-slate-900/30', tooltip: 'Cetak Plan' });
                                  actions.push({ actionType: 'cetakWFHLap', icon: 'fa-print', text: 'Lap.', css: 'px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-600 rounded-lg transition shadow-lg shadow-emerald-600/30', tooltip: 'Cetak Lap.' });
                              }
                          }
                      }

                      // --- PEWARNAAN BADGE STATUS ---
                      if (statusAkhir === 'Disetujui') statusColor = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
                      else if (statusAkhir === 'Ditolak' || statusAkhir === 'Laporan Ditolak') statusColor = "text-rose-400 bg-rose-500/10 border-rose-500/20";
                      else if (statusAkhir === 'Menunggu Pembatalan') statusColor = "text-purple-400 bg-purple-500/10 border-purple-500/20";
                      else if (statusAkhir === 'DIBATALKAN') statusColor = "text-slate-400 bg-slate-800 border-slate-700";
                      else if (statusAkhir === 'Isi Laporan') statusColor = "text-amber-400 bg-amber-500/10 border-amber-500/50 border-dashed animate-pulse";
                      else if (statusAkhir === 'Laporan Diperiksa') statusColor = "text-sky-400 bg-sky-500/10 border-sky-500/20";

                      let tglDecor = statusAkhir === 'DIBATALKAN' ? 'line-through text-slate-500' : 'text-slate-300';
                      
                      let pejabatHtml = '';
                      if (log.z_type === 'Cuti' || log.z_type === 'IP') {
                          pejabatHtml = `<div class="flex items-center gap-1.5"><i class="fa-solid fa-circle text-[8px] ${pejabatDot}"></i><span class="text-slate-400 truncate max-w-[120px]" title="${pejabat.nama}">Pejabat: ${pejabat.nama}</span></div>`;
                      } else {
                          pejabatHtml = `<div class="flex items-center gap-1.5 opacity-50"><i class="fa-solid fa-minus text-[8px] text-slate-600"></i><span class="text-slate-500">Tanpa Pejabat</span></div>`;
                      }

                      return {
                          ...log,
                          atasanNama: atasan.nama,
                          pejabatNama: pejabat.nama,
                          jenisText, tgl_1, tgl_2, tglDecor,
                          durasiObj, statusAkhir, statusColor,
                          atasanDot, pejabatDot, pejabatHtml,
                          hasDropdown,
                          actions
                      };
                  });
              }
          },
          methods: {
              // ZETTBOT TAHAP 46: Trigger Refresh Sinkronisasi Riwayat Cuti
              async refreshData() {
                  if (this.isRefreshing) return;
                  this.isRefreshing = true;
                  try {
                      if (typeof syncBackgroundData === 'function') {
                          syncBackgroundData();
                      } else if (typeof syncAllServerData === 'function') {
                          syncAllServerData(true);
                      }
                      setTimeout(() => {
                          this.isRefreshing = false;
                      }, 1500);
                  } catch (err) {
                      this.isRefreshing = false;
                  }
              },

              // ZETTBOT TAHAP 43: Kontroler Dropdown Aksi Cuti Disetujui
              toggleActionDropdown(id) {
                  this.activeDropdownId = (this.activeDropdownId === id) ? null : id;
              },
              closeActionDropdown() {
                  this.activeDropdownId = null;
              },

              // ZETTBOT TAHAP 3: Membersihkan Pemanggil Eksternal (Safe Short-Circuit Standarisasi Vue)
              executeAction(actionType, id) {
                  this.activeDropdownId = null;
                  // --- FUNGSI EDIT / TAMPIL ---
                  if (actionType === 'editCuti') this.editCuti(id);
                  if (actionType === 'editIK') window.openModalIK && window.openModalIK(id);
                  if (actionType === 'editIP') window.openModalIP && window.openModalIP(id);
                  if (actionType === 'editWFHPlan') window.openModalWFH && window.openModalWFH(id);
                  if (actionType === 'laporWFH' || actionType === 'editWFHLap') window.openModalLaporanWFH && window.openModalLaporanWFH(id);
                  
                  // --- FUNGSI DELETE / BATAL (NATIVE VUE) ---
                  if (actionType === 'batalCuti') this.deleteCutiRecord(id);
                  if (actionType === 'batalIK') this.deleteIK(id);
                  if (actionType === 'batalIP') this.deleteIP(id);
                  if (actionType === 'batalWFH') this.deleteWFH(id);
                  if (actionType === 'usulBatalCuti') {
                      if (typeof window.openCancelModal === 'function') {
                          window.openCancelModal(id);
                      } else if (window.vmFormCuti && typeof window.vmFormCuti.openCancelModal === 'function') {
                          window.vmFormCuti.openCancelModal(id);
                      }
                  }
                  
                  // --- FUNGSI CETAK ---
                  if (actionType === 'cetakCuti') window.printCutiForm && window.printCutiForm(id);
                  if (actionType === 'unduhSignedCuti') window.downloadSignedCutiPdf && window.downloadSignedCutiPdf(id);
                  if (actionType === 'cetakIK') window.cetakIzinKeluar && window.cetakIzinKeluar(id);
                  if (actionType === 'cetakIP') window.cetakIzinPribadi && window.cetakIzinPribadi(id);
                  if (actionType === 'cetakWFHPlan') window.cetakRencanaWFH && window.cetakRencanaWFH(id);
                  if (actionType === 'cetakWFHLap') window.cetakLaporanWFH && window.cetakLaporanWFH(id);
              },

              // ----------------------------------------------------
              // INJEKSI NATIVE VUE: LOGIKA DELETE DAN REFUND SALDO
              // ----------------------------------------------------
              editCuti(id) {
                  const log = this.s.cutiLogs.find(l => String(l.id) === String(id));
                  if (!log) {
                      if (window.showNotify) window.showNotify("Error", "Data pengajuan cuti tidak ditemukan.", "error");
                      return;
                  }
                  if (window.vmFormCuti) {
                      window.vmFormCuti.openModal(false, log);
                  } else {
                      if (window.showNotify) window.showNotify("Error Modul", "Sistem Vue Form belum termuat. Coba muat ulang halaman.", "error");
                  }
              },
              
              deleteCutiRecord(id) {
                  const token = localStorage.getItem('transkep_session_token');
                  const currentNip = this.s && this.s.user ? this.s.user.nip : '';
                  const confirmFn = window.showCustomConfirm || function(t, m, cb) {
                      if (confirm(`${t}\n\n${m}`)) cb();
                  };

                  confirmFn("Tarik Pengajuan", "Batalkan dan tarik pengajuan ini? Saldo cuti Anda akan dikembalikan utuh.", () => {
                      if (window.showLoading) window.showLoading("Menarik data...");
                      const delPromise = (typeof CutiDataService !== 'undefined')
                          ? CutiDataService.deleteCutiLog(id, false, currentNip, token)
                          : new Promise((resolve, reject) => {
                              if (typeof google !== 'undefined' && google.script) {
                                  google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).deleteCutiLog(id, false, currentNip, token);
                              } else {
                                  resolve({ status: 'success', message: 'Pengajuan ditarik [Demo]' });
                              }
                          });

                      delPromise
                          .then((res) => {
                              if (window.hideLoading) window.hideLoading();
                              if (res && res.status === 'success') {
                                  if (window.showNotify) window.showNotify("Ditarik", res.message, "success");
                                  
                                  const logIndex = this.s.cutiLogs.findIndex(l => String(l.id) === String(id));
                                  if (logIndex !== -1) {
                                      const logToCancel = this.s.cutiLogs[logIndex];
                                      // Proses Refund Saldo
                                      if (logToCancel.jenis === 'Tahunan') {
                                          try {
                                              let h = JSON.parse(logToCancel.history || "{}");
                                              this.s.user.s_tahunan_2024 = Number(this.s.user.s_tahunan_2024 || 0) + (Number(h.y24) || 0);
                                              this.s.user.s_tahunan_2025 = Number(this.s.user.s_tahunan_2025 || 0) + (Number(h.y25) || 0);
                                              this.s.user.s_tahunan_2026 = Number(this.s.user.s_tahunan_2026 || 0) + (Number(h.y26) || 0);
                                          } catch(e) {}
                                      } else {
                                          let field = "";
                                          if(logToCancel.jenis === 'Sakit') field = 's_sakit';
                                          else if(logToCancel.jenis === 'Alasan Penting' || logToCancel.jenis === 'Penting') field = 's_penting';
                                          else if(logToCancel.jenis === 'Besar') field = 's_besar';
                                          else if(logToCancel.jenis === 'Melahirkan') field = 's_melahirkan';
                                          else if(logToCancel.jenis === 'CLTN') field = 's_cltn';
                                          if (field !== "") this.s.user[field] = Number(this.s.user[field] || 0) + Number(logToCancel.sisa_cuti || 0);
                                      }
                                      
                                      // Update juga referensi di usersList agar data admin tidak desinkronisasi
                                      if (this.s.usersList) {
                                          const uIdx = this.s.usersList.findIndex(u => String(u.nip) === String(this.s.user.nip));
                                          if (uIdx !== -1) this.s.usersList[uIdx] = Object.assign({}, this.s.user);
                                      }
                                      
                                      // Secara Reaktif hapus dari UI
                                      this.s.cutiLogs.splice(logIndex, 1);
                                  }

                                  // Background server sync jika fungsi tersedia
                                  if (typeof syncAllServerData === 'function') {
                                      syncAllServerData(true);
                                  }
                              } else { 
                                  if (window.showNotify) window.showNotify("Gagal Membatalkan", res ? res.message : "Gagal membatalkan cuti.", "error"); 
                              }
                          })
                          .catch((err) => {
                              if (window.hideLoading) window.hideLoading();
                              if (window.showNotify) window.showNotify("Error Jaringan", err.message || err.toString(), "error");
                          });
                  });
              },
              
              deleteIK(id) {
                  const token = localStorage.getItem('transkep_session_token'); 
                  const currentNip = this.s && this.s.user ? this.s.user.nip : '';
                  const confirmFn = window.showCustomConfirm || function(t, m, cb) {
                      if (confirm(`${t}\n\n${m}`)) cb();
                  };
                  confirmFn("Tarik Pengajuan", "Batalkan dan tarik pengajuan Izin Keluar ini?", () => {
                      if (window.showLoading) window.showLoading("Menarik data...");
                      const delPromise = (typeof CutiDataService !== 'undefined')
                          ? CutiDataService.deleteIzinKeluarLog(id, false, currentNip, token)
                          : new Promise((resolve, reject) => {
                              if (typeof google !== 'undefined' && google.script) {
                                  google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).deleteIzinKeluarLog(id, false, currentNip, token);
                              } else {
                                  resolve({ status: 'success', message: 'Izin Keluar ditarik [Demo]' });
                              }
                          });

                      delPromise
                          .then((res) => {
                              if (window.hideLoading) window.hideLoading();
                              if (res && res.status === 'success') {
                                  if (window.showNotify) window.showNotify("Ditarik", res.message, "success");
                                  const idx = this.s.ikLogs.findIndex(l => String(l.id) === String(id));
                                  if (idx !== -1) this.s.ikLogs.splice(idx, 1);
                                  if (typeof syncAllServerData === 'function') syncAllServerData(true);
                              } else { 
                                  if (window.showNotify) window.showNotify("Gagal Membatalkan", res ? res.message : "Gagal membatalkan IK.", "error"); 
                              }
                          })
                          .catch((err) => {
                              if (window.hideLoading) window.hideLoading();
                              if (window.showNotify) window.showNotify("Error Jaringan", err.message || err.toString(), "error");
                          });
                  });
              },
              
              deleteIP(id) {
                  const token = localStorage.getItem('transkep_session_token'); 
                  const currentNip = this.s && this.s.user ? this.s.user.nip : '';
                  const confirmFn = window.showCustomConfirm || function(t, m, cb) {
                      if (confirm(`${t}\n\n${m}`)) cb();
                  };
                  confirmFn("Tarik Pengajuan", "Batalkan dan tarik pengajuan Izin Pribadi ini?", () => {
                      if (window.showLoading) window.showLoading("Menarik data...");
                      const delPromise = (typeof CutiDataService !== 'undefined')
                          ? CutiDataService.deleteIzinPribadiLog(id, false, currentNip, token)
                          : new Promise((resolve, reject) => {
                              if (typeof google !== 'undefined' && google.script) {
                                  google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).deleteIzinPribadiLog(id, false, currentNip, token);
                              } else {
                                  resolve({ status: 'success', message: 'Izin Pribadi ditarik [Demo]' });
                              }
                          });

                      delPromise
                          .then((res) => {
                              if (window.hideLoading) window.hideLoading();
                              if (res && res.status === 'success') {
                                  if (window.showNotify) window.showNotify("Ditarik", res.message, "success");
                                  const idx = this.s.ipLogs.findIndex(l => String(l.id) === String(id));
                                  if (idx !== -1) this.s.ipLogs.splice(idx, 1);
                                  if (typeof syncAllServerData === 'function') syncAllServerData(true);
                              } else { 
                                  if (window.showNotify) window.showNotify("Gagal Membatalkan", res ? res.message : "Gagal membatalkan IP.", "error"); 
                              }
                          })
                          .catch((err) => {
                              if (window.hideLoading) window.hideLoading();
                              if (window.showNotify) window.showNotify("Error Jaringan", err.message || err.toString(), "error");
                          });
                  });
              },
              
              deleteWFH(id) {
                  const token = localStorage.getItem('transkep_session_token'); 
                  const currentNip = this.s && this.s.user ? this.s.user.nip : '';
                  const confirmFn = window.showCustomConfirm || function(t, m, cb) {
                      if (confirm(`${t}\n\n${m}`)) cb();
                  };
                  confirmFn("Tarik Pengajuan", "Batalkan dan tarik pengajuan WFH ini?", () => {
                      if (window.showLoading) window.showLoading("Menarik data...");
                      const delPromise = (typeof CutiDataService !== 'undefined')
                          ? CutiDataService.deleteWfhLog(id, false, currentNip, token)
                          : new Promise((resolve, reject) => {
                              if (typeof google !== 'undefined' && google.script) {
                                  google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).deleteWfhLog(id, false, currentNip, token);
                              } else {
                                  resolve({ status: 'success', message: 'WFH ditarik [Demo]' });
                              }
                          });

                      delPromise
                          .then((res) => {
                              if (window.hideLoading) window.hideLoading();
                              if (res && res.status === 'success') {
                                  if (window.showNotify) window.showNotify("Ditarik", res.message, "success");
                                  const idx = this.s.wfhLogs.findIndex(l => String(l.id) === String(id));
                                  if (idx !== -1) this.s.wfhLogs.splice(idx, 1);
                                  if (typeof syncAllServerData === 'function') syncAllServerData(true);
                              } else { 
                                  if (window.showNotify) window.showNotify("Gagal Membatalkan", res ? res.message : "Gagal membatalkan WFH.", "error"); 
                              }
                          })
                          .catch((err) => {
                              if (window.hideLoading) window.hideLoading();
                              if (window.showNotify) window.showNotify("Error Jaringan", err.message || err.toString(), "error");
                          });
                  });
              }
          },
          mounted() {
              // ZETTBOT TAHAP 43: Auto-close dropdown saat pengguna klik di luar container
              document.addEventListener('click', (e) => {
                  if (!e.target.closest('.dropdown-action-container')) {
                      this.activeDropdownId = null;
                  }
              });
          }
      }).mount('#vue-riwayat-permohonan');
  });

// --- Source: permohonan/js_permohonan_form.html ---
// =========================================================================
  // LOGIKA CLIENT-SIDE: FORM PENGAJUAN CUTI & BYPASS (VUE MIGRATED - TAHAP 5)
  // =========================================================================

  document.addEventListener("DOMContentLoaded", () => {
      const { createApp } = Vue;

      window.vmFormCuti = createApp({
          data() {
              return {
                  s: state, // Mengambil reference state global dari javascript.html
                  isBypassMode: false,
                  currentEditId: null,
                  form: {
                      bypassNip: '',
                      jenis: 'Tahunan',
                      mulai: '',
                      selesai: '',
                      alasan: '',
                      alamat: '',
                      plh: '',
                      atasan: '',
                      pejabat: ''
                  },
                  fileData: null,
                  fileName: null,
                  fileMimeType: null,
                  
                  // Variabel untuk Modal Pembatalan Cuti
                  cancelForm: { id: '', alasan: '' },

                  // ZETTBOT FIX: Variabel untuk Searchable Dropdown Bypass
                  bypassSearchQuery: '',
                  isBypassDropdownOpen: false
              };
          },
          computed: {
              targetUser() {
                  if (this.isBypassMode && this.form.bypassNip) {
                      return this.s.usersList.find(u => String(u.nip) === String(this.form.bypassNip));
                  }
                  return this.s.user;
              },
              // ZETTBOT FIX: Logika filtering untuk kolom pencarian bypass
              filteredBypassUsers() {
                  if (!this.s || !this.s.usersList) return [];
                  let users = this.s.usersList;
                  if (this.bypassSearchQuery) {
                      const q = this.bypassSearchQuery.toLowerCase();
                      users = users.filter(u => 
                          u.nama.toLowerCase().includes(q) || 
                          u.jabatan.toLowerCase().includes(q) ||
                          String(u.nip).includes(q)
                      );
                  }
                  return users;
              },
              opsi() {
                  const u = this.targetUser;
                  if (!u) return { atasanOpts: [], pejabatOpts: [], plhOpts: [], adaPlh: false };

                  const j = u.jabatan.toLowerCase();
                  let atasanOpts = [];
                  let pejabatOpts = [];
                  let plhOpts = [];
                  let adaPlh = false;

                  const getPegawai = (keyword) => this.s.usersList.filter(x => x.nip !== u.nip && x.jabatan.toLowerCase().includes(keyword));

                  let ketua = getPegawai("ketua").find(x => x.jabatan.toLowerCase() === "ketua");
                  if (ketua && !this.isPegawaiAbsent(ketua.nip)) {
                      pejabatOpts.push(ketua);
                  } else {
                      adaPlh = true;
                      let wakil = getPegawai("wakil ketua").find(x => x.jabatan.toLowerCase() === "wakil ketua");
                      if (wakil && !this.isPegawaiAbsent(wakil.nip)) pejabatOpts.push(wakil);
                      else {
                          let hakims = getPegawai("hakim").filter(x => !this.isPegawaiAbsent(x.nip));
                          pejabatOpts.push(...hakims);
                      }
                  }

                  if (j === "ketua") { atasanOpts = this.s.usersList.filter(x => x.nip !== u.nip); }
                  else if (j.includes("wakil ketua") || j.includes("hakim") || (j.includes("panitera") && !j.includes("muda") && !j.includes("pengganti")) || j === "sekretaris") {
                      atasanOpts = [...pejabatOpts];
                  }
                  else if (j.includes("panitera muda") || j.includes("panitera pengganti") || j.includes("jurusita") || j.includes("juru sita")) {
                      let panitera = getPegawai("panitera").find(x => x.jabatan.toLowerCase() === "panitera");
                      if (panitera && !this.isPegawaiAbsent(panitera.nip)) { atasanOpts.push(panitera); }
                      else {
                          adaPlh = true;
                          let panmuds = getPegawai("panitera muda").filter(x => !this.isPegawaiAbsent(x.nip));
                          atasanOpts.push(...panmuds);
                      }
                  }
                  else if (j.includes("kepala sub bagian") || j.includes("kasubbag")) {
                      let sekretaris = getPegawai("sekretaris").find(x => x.jabatan.toLowerCase() === "sekretaris");
                      if (sekretaris && !this.isPegawaiAbsent(sekretaris.nip)) { atasanOpts.push(sekretaris); }
                      else {
                          adaPlh = true;
                          let kasubbags = getPegawai("kepala sub bagian").filter(x => !this.isPegawaiAbsent(x.nip));
                          if(kasubbags.length === 0) kasubbags = getPegawai("kasubbag").filter(x => !this.isPegawaiAbsent(x.nip));
                          atasanOpts.push(...kasubbags);
                      }
                  }
                  else {
                      let panmuds = getPegawai("panitera muda").filter(x => !this.isPegawaiAbsent(x.nip));
                      let kasubbags = getPegawai("kepala sub bagian").filter(x => !this.isPegawaiAbsent(x.nip));
                      if(kasubbags.length === 0) kasubbags = getPegawai("kasubbag").filter(x => !this.isPegawaiAbsent(x.nip));
                      atasanOpts.push(...panmuds); atasanOpts.push(...kasubbags);
                      let panitera = getPegawai("panitera").find(x => x.jabatan.toLowerCase() === "panitera");
                      if (panitera && !this.isPegawaiAbsent(panitera.nip)) atasanOpts.push(panitera);
                      let sekretaris = getPegawai("sekretaris").find(x => x.jabatan.toLowerCase() === "sekretaris");
                      if (sekretaris && !this.isPegawaiAbsent(sekretaris.nip)) atasanOpts.push(sekretaris);
                  }

                  atasanOpts = [...new Map(atasanOpts.map(item => [item.nip, item])).values()];
                  pejabatOpts = [...new Map(pejabatOpts.map(item => [item.nip, item])).values()];

                  let isPanitera = j === "panitera";
                  let isSekretaris = j === "sekretaris";

                  if (isPanitera) {
                       plhOpts = getPegawai("panitera muda").filter(x => !this.isPegawaiAbsent(x.nip));
                  } else if (isSekretaris) {
                       plhOpts = getPegawai("kepala sub bagian").filter(x => !this.isPegawaiAbsent(x.nip));
                       if(plhOpts.length === 0) plhOpts = getPegawai("kasubbag").filter(x => !this.isPegawaiAbsent(x.nip));
                  }

                  return { atasanOpts, pejabatOpts, plhOpts, adaPlh };
              }
          },
          watch: {
              'opsi.atasanOpts'(newVal) {
                  if (newVal.length === 1 && !this.form.atasan) this.form.atasan = newVal[0].nip;
              },
              'opsi.pejabatOpts'(newVal) {
                  if (newVal.length === 1 && !this.form.pejabat) this.form.pejabat = newVal[0].nip;
              },
              targetUser(newVal) {
                  if (newVal && !this.currentEditId) this.form.alamat = newVal.alamat || '';
                  else if (!newVal) this.form.alamat = '';
              }
          },
          methods: {
              // ZETTBOT FIX: Fungsi interaksi Searchable Dropdown Bypass
              openBypassDropdown() {
                  this.isBypassDropdownOpen = true;
                  // Jika pengguna ingin mencari orang lain, kosongkan query tapi simpan NIP lama sementara
                  if (this.form.bypassNip !== '') {
                      this.bypassSearchQuery = ''; 
                  }
              },
              closeBypassDropdown() {
                  setTimeout(() => { 
                      this.isBypassDropdownOpen = false; 
                      // Kembalikan nama ke input jika tidak jadi mengganti
                      if (this.form.bypassNip) {
                          const u = this.s.usersList.find(x => String(x.nip) === String(this.form.bypassNip));
                          if(u) this.bypassSearchQuery = u.nama;
                      } else {
                          this.bypassSearchQuery = '';
                      }
                  }, 200);
              },
              selectBypassUser(user) {
                  this.form.bypassNip = user.nip;
                  this.bypassSearchQuery = user.nama;
                  this.isBypassDropdownOpen = false;
              },
              clearBypassSearch() {
                  this.form.bypassNip = '';
                  this.bypassSearchQuery = '';
                  if (this.$refs.bypassSearchInput) this.$refs.bypassSearchInput.focus();
              },

              isPegawaiAbsent(nip) {
                  const today = new Date();
                  today.setHours(0,0,0,0);
                  return this.s.cutiLogs.some(log => {
                      if (String(log.nip) === String(nip) && log.status === 'Disetujui') {
                          const start = new Date(log.tgl_mulai);
                          start.setHours(0,0,0,0);
                          const end = new Date(log.tgl_selesai);
                          end.setHours(0,0,0,0);
                          return today >= start && today <= end;
                      }
                      return false;
                  });
              },
              resetForm() {
                  this.form = { bypassNip: '', jenis: 'Tahunan', mulai: '', selesai: '', alasan: '', alamat: '', plh: '', atasan: '', pejabat: '' };
                  this.fileData = null; this.fileName = null; this.fileMimeType = null;
                  
                  // Reset search bypass
                  this.bypassSearchQuery = '';
                  this.isBypassDropdownOpen = false;

                  const fileInput = document.getElementById('cutiBukti');
                  if (fileInput) fileInput.value = '';
              },
              handleFileUpload(e) {
                  const file = e.target.files[0];
                  if (!file) return;
                  if (file.size > 2 * 1024 * 1024) { 
                      if(window.showNotify) window.showNotify("File Besar", "Maksimal 2MB.", "error"); 
                      e.target.value = ''; return; 
                  }
                  if(window.showLoading) window.showLoading("Membaca dokumen lampiran...");
                  const readPromise = (typeof CutiDataService !== 'undefined')
                      ? CutiDataService.readFileAsBase64(file)
                      : new Promise((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve({ fileData: reader.result.split(',')[1], fileName: file.name, fileMimeType: file.type });
                          reader.onerror = reject;
                          reader.readAsDataURL(file);
                      });

                  readPromise
                      .then((res) => {
                          this.fileData = res.fileData;
                          this.fileName = res.fileName;
                          this.fileMimeType = res.fileMimeType;
                          if(window.hideLoading) window.hideLoading();
                      })
                      .catch((err) => {
                          if(window.hideLoading) window.hideLoading();
                          if(window.showNotify) window.showNotify("Error", "Gagal memproses file: " + (err.message || String(err)), "error");
                      });
              },
              openModal(isBypass = false, editLog = null) {
                  if (!this.s || !this.s.user) {
                      if(window.showNotify) window.showNotify("Sistem Memuat", "Silakan tunggu, data belum siap.", "error"); return;
                  }

                  this.resetForm();
                  this.isBypassMode = isBypass;
                  
                  if (editLog) {
                      this.currentEditId = editLog.id;
                      this.form.jenis = editLog.jenis;
                      this.form.mulai = editLog.tgl_mulai;
                      this.form.selesai = editLog.tgl_selesai;
                      this.form.alasan = editLog.alasan;
                      this.form.alamat = editLog.alamat;
                      
                      setTimeout(() => {
                         this.form.atasan = editLog.atasan_nip;
                         this.form.pejabat = editLog.pejabat_nip;
                         if(editLog.plh_nip) this.form.plh = editLog.plh_nip;
                      }, 50); 
                  } else {
                      this.currentEditId = null;
                      if (!isBypass && this.s.user) this.form.alamat = this.s.user.alamat || "";
                  }

                  const modal = document.getElementById('modalFormCuti');
                  if (modal) {
                      if (modal.parentNode !== document.body) document.body.appendChild(modal);
                      modal.classList.remove('hidden');
                      setTimeout(() => { if (modal.firstElementChild) modal.firstElementChild.classList.remove('scale-95'); }, 10);
                  }
              },
              closeModal() {
                  const modal = document.getElementById('modalFormCuti');
                  if (modal) {
                      if (modal.firstElementChild) modal.firstElementChild.classList.add('scale-95');
                      setTimeout(() => { modal.classList.add('hidden'); }, 200);
                  }
              },
              submitCuti() {
                  if(!this.s.user) { if(window.showNotify) window.showNotify("Error Sesi", "Harap login ulang", "error"); return; }
                  
                  let isEditMode = (this.currentEditId !== null);
                  if (this.form.jenis !== 'Tahunan' && !isEditMode && !this.fileData) {
                      if(window.showNotify) window.showNotify("Validasi", "Bukti dukung wajib dilampirkan!", "error"); return;
                  }

                  let finalNip = this.s.user.nip;
                  if (this.isBypassMode) {
                      finalNip = this.form.bypassNip;
                      if (!finalNip) { if(window.showNotify) window.showNotify("Validasi", "Pilih pegawai pemohon terlebih dahulu!", "error"); return; }
                  }

                  const payload = {
                      id: this.currentEditId, nip: finalNip, jenis: this.form.jenis,
                      tgl_mulai: this.form.mulai, tgl_selesai: this.form.selesai, alasan: this.form.alasan,
                      alamat: this.form.alamat, atasan_nip: this.form.atasan, pejabat_nip: this.form.pejabat,
                      plh_nip: this.opsi.plhOpts.length > 0 ? this.form.plh : "",
                      fileData: this.fileData, fileName: this.fileName, fileMimeType: this.fileMimeType
                  };

                  if (new Date(payload.tgl_selesai) < new Date(payload.tgl_mulai)) {
                     if(window.showNotify) window.showNotify("Tanggal Invalid", "Selesai pelaksanaan tidak boleh sebelum tanggal mulai.", "error"); return;
                  }

                  const newStart = new Date(payload.tgl_mulai); newStart.setHours(0,0,0,0);
                  const newEnd = new Date(payload.tgl_selesai); newEnd.setHours(0,0,0,0);

                  const isOverlap = this.s.cutiLogs.some(log => {
                      if (String(log.nip) === String(payload.nip) && log.status !== 'Ditolak' && log.status !== 'DIBATALKAN' && String(log.id) !== String(payload.id)) {
                          const existingStart = new Date(log.tgl_mulai); existingStart.setHours(0,0,0,0);
                          const existingEnd = new Date(log.tgl_selesai); existingEnd.setHours(0,0,0,0);
                          return (newStart <= existingEnd && newEnd >= existingStart);
                      }
                      return false;
                  });

                  if (isOverlap) {
                      if(window.showNotify) window.showNotify("Tanggal Bentrok", "Pengajuan gagal! Anda (atau pegawai ini) sudah memiliki izin/cuti yang aktif pada rentang tanggal tersebut.", "warning"); return;
                  }

                  let d1 = new Date(payload.tgl_mulai); let d2 = new Date(payload.tgl_selesai);
                  let durasi = 0;
                  for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
                      if (d.getDay() !== 0 && d.getDay() !== 6) durasi++;
                  }

                  let tUser = this.targetUser;
                  if (tUser && payload.jenis !== 'Dinas Luar' && payload.jenis !== 'CLTN') {
                      let refundDurasiLama = 0;
                      if (payload.id) {
                          let logLama = this.s.cutiLogs.find(l => String(l.id) === String(payload.id));
                          if (logLama) refundDurasiLama = Number(logLama.sisa_cuti || 0);
                      }

                      if (payload.jenis === 'Tahunan') {
                          let totalTahunan = Number(tUser.s_tahunan_2024 || 0) + Number(tUser.s_tahunan_2025 || 0) + Number(tUser.s_tahunan_2026 || 0) + refundDurasiLama;
                          if (totalTahunan < durasi) {
                              if(window.showNotify) window.showNotify("Saldo Habis/Kurang", "Maaf, sisa kuota Cuti Tahunan Anda ("+totalTahunan+" Hari) tidak mencukupi untuk pengajuan durasi "+durasi+" Hari.", "error"); return;
                          }
                      } else {
                          let field = "";
                          if(payload.jenis === 'Sakit') field = 's_sakit'; else if(payload.jenis === 'Alasan Penting' || payload.jenis === 'Penting') field = 's_penting';
                          else if(payload.jenis === 'Besar') field = 's_besar'; else if(payload.jenis === 'Melahirkan') field = 's_melahirkan';
                          
                          if (field !== "") {
                              let sisa = Number(tUser[field] || 0) + refundDurasiLama;
                              if (sisa < durasi) {
                                  if(window.showNotify) window.showNotify("Saldo Habis/Kurang", "Maaf, sisa kuota Cuti " + payload.jenis + " ("+sisa+" Hari) tidak mencukupi untuk pengajuan "+durasi+" Hari.", "error"); return;
                              }
                          }
                      }
                  }

                  if(window.showLoading) window.showLoading("Memverifikasi ketersediaan Pejabat...");
                  const token = localStorage.getItem('transkep_session_token');
                  const currentNip = this.s.user.nip;

                  const routingPromise = (typeof CutiDataService !== 'undefined')
                      ? CutiDataService.getSmartRouting(payload.atasan_nip, payload.pejabat_nip, payload.tgl_mulai, payload.tgl_selesai, currentNip, token)
                      : new Promise((resolve, reject) => {
                          if (typeof google !== 'undefined' && google.script) {
                              google.script.run
                                  .withSuccessHandler(resolve)
                                  .withFailureHandler(reject)
                                  .getSmartRouting(payload.atasan_nip, payload.pejabat_nip, payload.tgl_mulai, payload.tgl_selesai, currentNip, token);
                          } else {
                              resolve({ status: 'success', data: { atasan_nip: payload.atasan_nip, pejabat_nip: payload.pejabat_nip, pesan: '' } });
                          }
                      });

                  routingPromise
                      .then((routeRes) => {
                          if (routeRes && routeRes.status === 'success') {
                              payload.atasan_nip = routeRes.data.atasan_nip; payload.pejabat_nip = routeRes.data.pejabat_nip;
                              let routingMsg = routeRes.data.pesan;
                              
                              if(window.showLoading) window.showLoading(payload.id ? "Memperbarui data cuti..." : "Mengirimkan usulan cuti...");
                              
                              const savePromise = (typeof CutiDataService !== 'undefined')
                                  ? (payload.id ? CutiDataService.updateCutiLog(payload, currentNip, token) : CutiDataService.addCutiLog(payload, currentNip, token))
                                  : new Promise((resolve, reject) => {
                                      if (typeof google !== 'undefined' && google.script) {
                                          const runner = google.script.run.withSuccessHandler(resolve).withFailureHandler(reject);
                                          if (payload.id) runner.updateCutiLog(payload, currentNip, token);
                                          else runner.addCutiLog(payload, currentNip, token);
                                      } else {
                                          resolve({ status: 'success', message: 'Data cuti tersimpan [Demo]', data: { id: 'CUTI-DEMO-' + Date.now(), tgl_pengajuan: new Date().toISOString(), status: 'Menunggu', durasi: 1 } });
                                      }
                                  });

                              return savePromise.then((res) => {
                                  if(window.hideLoading) window.hideLoading();
                                  this.closeModal();
                                  if (res && res.status === 'success') {
                                      if(routingMsg) window.showNotify("Berhasil Disimpan", res.message + "<br><br><span class='text-[10px] text-amber-400'>Info Pengalihan:</span><br><span class='text-[10px] leading-relaxed'>" + routingMsg + "</span>", "success");
                                      else window.showNotify("Berhasil Disimpan", res.message, "success");
                                      
                                      if (res.data) {
                                          if (payload.id) {
                                              const existIdx = this.s.cutiLogs.findIndex(l => String(l.id) === String(payload.id));
                                              if (existIdx > -1) {
                                                  this.s.cutiLogs[existIdx].jenis = payload.jenis; this.s.cutiLogs[existIdx].tgl_mulai = payload.tgl_mulai;
                                                  this.s.cutiLogs[existIdx].tgl_selesai = payload.tgl_selesai; this.s.cutiLogs[existIdx].alasan = payload.alasan;
                                                  this.s.cutiLogs[existIdx].alamat = payload.alamat; this.s.cutiLogs[existIdx].atasan_nip = payload.atasan_nip;
                                                  this.s.cutiLogs[existIdx].pejabat_nip = payload.pejabat_nip; this.s.cutiLogs[existIdx].plh_nip = payload.plh_nip;
                                                  if (res.data.fileUrl) this.s.cutiLogs[existIdx].bukti_url = res.data.fileUrl;
                                              }
                                          } else {
                                               // ZETTBOT TAHAP 37: Potong kuota cuti lokal secara reaktif & instan
                                               const durasiNumber = Number(res.data.durasi || durasi || 0);
                                               const targetPegawai = (String(payload.nip) === String(this.s.user.nip)) ? this.s.user : (this.s.usersList ? this.s.usersList.find(u => String(u.nip) === String(payload.nip)) : null);
                                               if (targetPegawai && payload.jenis !== 'Dinas Luar' && payload.jenis !== 'CLTN') {
                                                   if (payload.jenis === 'Tahunan') {
                                                       try {
                                                           let h = (typeof res.data.history === 'string') ? JSON.parse(res.data.history || '{}') : (res.data.history || {});
                                                           targetPegawai.s_tahunan_2024 = Math.max(0, Number(targetPegawai.s_tahunan_2024 || 0) - (Number(h.y24) || 0));
                                                           targetPegawai.s_tahunan_2025 = Math.max(0, Number(targetPegawai.s_tahunan_2025 || 0) - (Number(h.y25) || 0));
                                                           targetPegawai.s_tahunan_2026 = Math.max(0, Number(targetPegawai.s_tahunan_2026 || 0) - (Number(h.y26) || 0));
                                                       } catch(e) {}
                                                   } else {
                                                       let field = "";
                                                       if (payload.jenis === 'Sakit') field = 's_sakit';
                                                       else if (payload.jenis === 'Alasan Penting' || payload.jenis === 'Penting') field = 's_penting';
                                                       else if (payload.jenis === 'Besar') field = 's_besar';
                                                       else if (payload.jenis === 'Melahirkan') field = 's_melahirkan';
                                                       if (field !== "" && targetPegawai[field] !== undefined) {
                                                           targetPegawai[field] = Math.max(0, Number(targetPegawai[field] || 0) - durasiNumber);
                                                       }
                                                   }
                                                   if (this.s.usersList && targetPegawai.nip) {
                                                       const uIdx = this.s.usersList.findIndex(u => String(u.nip) === String(targetPegawai.nip));
                                                       if (uIdx !== -1) this.s.usersList[uIdx] = Object.assign({}, targetPegawai);
                                                   }
                                               }

                                               const logVirtual = {
                                                   id: res.data.id, tgl_pengajuan: res.data.tgl_pengajuan, nip: payload.nip,
                                                   jenis: payload.jenis, tgl_mulai: payload.tgl_mulai, tgl_selesai: payload.tgl_selesai,
                                                   alasan: payload.alasan, status: res.data.status, status_atasan: res.data.status,
                                                   atasan_nip: payload.atasan_nip, pejabat_nip: payload.pejabat_nip, sisa_cuti: durasiNumber,
                                                   status_pejabat: res.data.status, alamat: payload.alamat, history: res.data.history, bukti_url: res.data.fileUrl,
                                                   plh_nip: payload.plh_nip
                                               };
                                               if (this.s && this.s.cutiLogs) this.s.cutiLogs.unshift(logVirtual);
                                           }
                                           // ZETTBOT TAHAP 37: Jalankan silent sync tanpa dialog blocking & tanpa kedip
                                           if (typeof syncAllServerData === 'function') {
                                               syncAllServerData(true);
                                           } else if (typeof syncBackgroundData === 'function') {
                                               syncBackgroundData();
                                           }
                                      }
                                  } else {
                                      if(window.showNotify) window.showNotify("Gagal", res ? res.message : "Gagal menyimpan cuti.", "error");
                                  }
                              });
                          } else {
                              if(window.hideLoading) window.hideLoading();
                              if(window.showNotify) window.showNotify("Error Routing", routeRes ? routeRes.message : "Error routing pejabat.", "error");
                          }
                      })
                      .catch((err) => {
                          if(window.hideLoading) window.hideLoading();
                          if(window.showNotify) window.showNotify("Error Koneksi", "Gagal memproses pengajuan cuti: " + (err.message || err.toString()), "error");
                      });
              },
              
              // ===============================================
              // FUNGSI MODAL PEMBATALAN CUTI
              // ===============================================
              openCancelModal(id) {
                  this.cancelForm.id = id;
                  this.cancelForm.alasan = '';
                  const modal = document.getElementById('modalCancelCuti');
                  if (modal) {
                      if (modal.parentNode !== document.body) document.body.appendChild(modal);
                      modal.classList.remove('hidden');
                      setTimeout(() => { if(modal.firstElementChild) modal.firstElementChild.classList.remove('scale-95'); }, 10);
                  }
              },
              closeCancelModal() {
                  const modal = document.getElementById('modalCancelCuti');
                  if (modal) {
                      if(modal.firstElementChild) modal.firstElementChild.classList.add('scale-95');
                      setTimeout(() => { modal.classList.add('hidden'); }, 200);
                  }
              },
              submitCancelCuti() {
                  const id = this.cancelForm.id;
                  const alasanBatal = this.cancelForm.alasan;
                  
                  if (!alasanBatal.trim()) { 
                      if(window.showNotify) window.showNotify("Validasi", "Alasan pembatalan wajib diisi!", "error"); 
                      return; 
                  }

                  const token = localStorage.getItem('transkep_session_token');
                  const currentNip = this.s && this.s.user ? this.s.user.nip : '';
                  if(window.showLoading) window.showLoading("Mengajukan pembatalan ke Pejabat...");
                  
                  const cancelPromise = (typeof CutiDataService !== 'undefined')
                      ? CutiDataService.requestCancelCuti(id, alasanBatal, currentNip, token)
                      : new Promise((resolve, reject) => {
                          if (typeof google !== 'undefined' && google.script) {
                              google.script.run.withSuccessHandler(resolve).withFailureHandler(reject).requestCancelCuti(id, alasanBatal, currentNip, token);
                          } else {
                              resolve({ status: 'success', message: 'Usulan pembatalan terkirim [Demo]' });
                          }
                      });

                  cancelPromise
                    .then((res) => {
                        if(window.hideLoading) window.hideLoading();
                        this.closeCancelModal();
                        if (res && res.status === 'success') {
                            if(window.showNotify) window.showNotify("Berhasil Diajukan", "Usulan pembatalan menunggu persetujuan Pejabat.", "success");
                            if (this.s && this.s.cutiLogs) {
                                const logIndex = this.s.cutiLogs.findIndex(l => String(l.id) === String(id));
                                if (logIndex !== -1) {
                                    this.s.cutiLogs[logIndex].status = 'Menunggu Pembatalan';
                                    this.s.cutiLogs[logIndex].alasan += "\n\n[USULAN PEMBATALAN]: " + alasanBatal;
                                }
                            }
                        } else { 
                            if(window.showNotify) window.showNotify("Gagal", res ? res.message : "Gagal membatalkan.", "error"); 
                        }
                    })
                    .catch((err) => { 
                        if(window.hideLoading) window.hideLoading(); 
                        if(window.showNotify) window.showNotify("Error", err.message || err.toString(), "error"); 
                    });
              }
          }
      }).mount('#vue-form-cuti-wrapper');

      // ---------------------------------------------------------
      // BRIDGING KE TOMBOL VANILLA HTML
      // ---------------------------------------------------------
      window.openFormCutiModal = function(isBypass = false) {
          if (window.vmFormCuti) window.vmFormCuti.openModal(isBypass, null);
      };
      
      window.closeFormCutiModal = function() {
          if (window.vmFormCuti) window.vmFormCuti.closeModal();
      };
      
      window.openCancelModal = function(id) {
          if (window.vmFormCuti) window.vmFormCuti.openCancelModal(id);
      };
  });

// Logika Cetak Cuti dipisahkan ke js/cetak/cetak_cuti.js
