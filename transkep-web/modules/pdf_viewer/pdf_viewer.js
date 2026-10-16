// ==========================================
// FILE: pdf_viewer.js (Modul Flipbook PDF Viewer)
// ==========================================

// --- Source: sk/js_iframepdf.html ---
// ==========================================
  // FILE: sk/js_iframepdf.html (INTEGRATED VUE & GROUP TAGS)
  // ==========================================

  window.hidePdfLoader = function() {
    try {
      var loader = document.getElementById('fbLoadingContainer');
      var iframe = document.getElementById('pdfIframe');
      if (!loader || !iframe) return;

      if (iframe.src && iframe.src !== window.location.href && iframe.src !== 'about:blank' && iframe.src !== '') {
        loader.classList.add('opacity-0');
        iframe.classList.remove('opacity-0');
        setTimeout(function() {
          loader.classList.add('hidden');
        }, 400);
      }
    } catch (e) {
      console.error("hidePdfLoader error:", e);
    }
  };

  window.formatTglIndoPdf = function(dateStr) {
    if (!dateStr || dateStr === '-') return '-';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  };

  window.resolvePdfMemberInfo = function(nip) {
    var strNip = String(nip || '').trim();
    if (strNip.indexOf('[TAG:') === 0) {
      var labelGrup = (typeof GROUP_TAGS !== 'undefined' && GROUP_TAGS[strNip]) 
        ? "[GRUP] " + GROUP_TAGS[strNip].label 
        : strNip;
      var estimasi = (typeof hitungEstimasiGrup === 'function') ? hitungEstimasiGrup(strNip) : 0;
      return {
        nama: labelGrup,
        jabatan: "Sistem mendeteksi estimasi ±" + estimasi + " pegawai",
        isGroup: true
      };
    }

    var uList = (window.vueState && window.vueState.usersList) ? window.vueState.usersList : ((typeof state !== 'undefined' && state.usersList) ? state.usersList : []);
    var pns = uList.find(function(u) { return String(u.nip).trim() === strNip; });
    return {
      nama: pns ? pns.nama : 'Data Dihapus',
      jabatan: pns ? pns.jabatan : '-',
      isGroup: false
    };
  };

  window.openFlipbook = function(driveUrl, judulDokumen) {
    try {
      var modal = document.getElementById('modalFlipbook');
      var loader = document.getElementById('fbLoadingContainer');
      var iframe = document.getElementById('pdfIframe');

      if (!modal || !iframe) {
        console.error("Modal (#modalFlipbook) atau Iframe (#pdfIframe) tidak ditemukan!");
        return;
      }

      var titleEl = document.getElementById('fbModalTitle');
      if (titleEl) titleEl.innerText = judulDokumen || "Dokumen PDF";

      var btnDl = document.getElementById('fbBtnDownloadDirect');
      if (btnDl) btnDl.href = driveUrl;

      if (loader) {
        loader.classList.remove('hidden');
        loader.classList.remove('opacity-0');
      }
      iframe.classList.add('opacity-0');

      var noSkEl = document.getElementById('fbNoSk');
      var tglSkEl = document.getElementById('fbTglSk');
      var pjSkEl = document.getElementById('fbPjSk');
      var membersListEl = document.getElementById('fbMembersList');

      if (noSkEl && tglSkEl && pjSkEl && membersListEl) {
        noSkEl.innerText = '-';
        tglSkEl.innerText = '-';
        pjSkEl.innerText = '-';
        membersListEl.innerHTML = '<div class="text-[10px] text-slate-500 italic">Mencari data...</div>';

        var cleanUrl = String(driveUrl || '').trim();
        var cleanTitle = String(judulDokumen || '').trim();
        var targetSk = null;
        var targetSop = null;

        // 1. Ambil data SK dari komponen Vue (window.vmSkApp.groupedSkData)
        var skSource = (window.vmSkApp && window.vmSkApp.groupedSkData) 
          ? window.vmSkApp.groupedSkData 
          : ((typeof groupedSkData !== 'undefined') ? groupedSkData : []);

        if (skSource && skSource.length > 0) {
          targetSk = skSource.find(function(s) {
            return String(s.link_drive || '').trim() === cleanUrl;
          });
          if (!targetSk && cleanTitle) {
            targetSk = skSource.find(function(s) {
              return String(s.judul_sk || '').trim() === cleanTitle;
            });
          }
        }

        // 2. Jika bukan SK, cek di daftar SOP (window.vueState.sopList)
        var sopSource = (window.vueState && window.vueState.sopList) 
          ? window.vueState.sopList 
          : ((typeof state !== 'undefined' && state.sopList) ? state.sopList : []);

        if (!targetSk && sopSource && sopSource.length > 0) {
          targetSop = sopSource.find(function(s) {
            return String(s.link_drive || '').trim() === cleanUrl;
          });
          if (!targetSop && cleanTitle) {
            targetSop = sopSource.find(function(s) {
              return String(s.judul_sop || '').trim() === cleanTitle;
            });
          }
        }

        if (targetSk) {
          if (noSkEl.previousElementSibling) noSkEl.previousElementSibling.innerText = "Nomor SK";
          if (tglSkEl.previousElementSibling) tglSkEl.previousElementSibling.innerText = "Tanggal SK";

          noSkEl.innerText = targetSk.no_sk || '-';
          tglSkEl.innerText = window.formatTglIndoPdf(targetSk.tgl_sk);
          pjSkEl.innerText = targetSk.pj_sk || '-';

          if (targetSk.members && targetSk.members.length > 0) {
            var skHtml = '';
            targetSk.members.forEach(function(m, idx) {
              var info = window.resolvePdfMemberInfo(m.nip);
              var prefix = info.isGroup ? '<i class="fa-solid fa-users text-emerald-400 mr-1"></i>' : (idx + 1) + '. ';
              skHtml += '<div class="bg-slate-950/80 border border-slate-800/80 p-2.5 rounded-lg hover:border-indigo-500/50 transition">' +
                          '<p class="text-[11px] font-bold text-slate-200 truncate" title="' + info.nama + '">' + prefix + info.nama + '</p>' +
                          '<p class="text-[9px] text-slate-400 truncate mt-0.5 leading-tight">' + info.jabatan + '</p>' +
                          '<p class="text-[9px] text-indigo-300 font-bold mt-1.5 bg-indigo-500/10 inline-block px-1.5 py-0.5 rounded border border-indigo-500/20">' + (m.peran || '-') + '</p>' +
                        '</div>';
            });
            membersListEl.innerHTML = skHtml;
          } else {
            membersListEl.innerHTML = '<div class="text-[10px] text-slate-500 italic bg-slate-900/50 p-3 rounded-lg border border-dashed border-slate-700">Tidak ada anggota tim yang terdaftar.</div>';
          }
        } else if (targetSop) {
          if (noSkEl.previousElementSibling) noSkEl.previousElementSibling.innerText = "Nomor SOP";
          if (tglSkEl.previousElementSibling) tglSkEl.previousElementSibling.innerText = "Tanggal Efektif";

          noSkEl.innerText = targetSop.nomor_sop || '-';
          tglSkEl.innerText = window.formatTglIndoPdf(targetSop.tanggal_efektif);
          pjSkEl.innerText = targetSop.kategori_pj || '-';

          var pelaksanaArr = [];
          try { pelaksanaArr = JSON.parse(targetSop.pelaksana_json || '[]'); } catch(e) {}

          if (pelaksanaArr.length > 0) {
            var sopHtml = '';
            pelaksanaArr.forEach(function(m, idx) {
              var info = window.resolvePdfMemberInfo(m.nip);
              var prefix = info.isGroup ? '<i class="fa-solid fa-users text-emerald-400 mr-1"></i>' : (idx + 1) + '. ';
              sopHtml += '<div class="bg-slate-950/80 border border-emerald-800/50 p-2.5 rounded-lg hover:border-emerald-500/50 transition">' +
                           '<p class="text-[11px] font-bold text-slate-200 truncate" title="' + info.nama + '">' + prefix + info.nama + '</p>' +
                           '<p class="text-[9px] text-slate-400 truncate mt-0.5 leading-tight">' + info.jabatan + '</p>' +
                           '<p class="text-[9px] text-emerald-300 font-bold mt-1.5 bg-emerald-500/10 inline-block px-1.5 py-0.5 rounded border border-emerald-500/20">' + (m.peran || '-') + '</p>' +
                         '</div>';
            });
            membersListEl.innerHTML = sopHtml;
          } else {
            membersListEl.innerHTML = '<div class="text-[10px] text-slate-500 italic bg-slate-900/50 p-3 rounded-lg border border-dashed border-slate-700">Tidak ada pelaksana yang terdaftar.</div>';
          }
        } else {
          if (noSkEl.previousElementSibling) noSkEl.previousElementSibling.innerText = "Nomor Dokumen";
          if (tglSkEl.previousElementSibling) tglSkEl.previousElementSibling.innerText = "Tanggal";
          membersListEl.innerHTML = '<div class="text-[10px] text-slate-500 italic bg-slate-900/50 p-3 rounded-lg border border-dashed border-slate-700">Data struktur tidak ditemukan untuk dokumen ini.</div>';
        }
      }

      var idMatch = String(driveUrl).match(/[-\w]{25,}/);
      if (idMatch && idMatch[0]) {
        var fileId = idMatch[0];
        iframe.src = "https://drive.google.com/file/d/" + fileId + "/preview";
      } else {
        iframe.src = driveUrl;
      }

      iframe.onload = function() {
        window.hidePdfLoader();
        
        // --- ZETTBOT: AUTO-ACKNOWLEDGE TIMER (10 DETIK) ---
        if (window.autoAckTimer) clearTimeout(window.autoAckTimer);
        
        window.autoAckTimer = setTimeout(function() {
            var currentUser = window.vueState ? window.vueState.user : null;
            if (!currentUser) return;
            var currNip = currentUser.nip;

            // Jika dokumen yang dibuka adalah SK
            if (targetSk && window.vmSkApp) {
                if (!window.vmSkApp.isSkAcknowledged(targetSk.id, currNip)) {
                    var isMember = (typeof cekKeterlibatanPegawai === 'function') 
                        ? cekKeterlibatanPegawai(targetSk.members, currNip).terlibat 
                        : targetSk.members.some(function(m) { return String(m.nip) === String(currNip); });
                    
                    if (isMember) window.vmSkApp.doAcknowledgeSk(targetSk.id, currNip, true); // true = eksekusi diam-diam
                }
            } 
            // Jika dokumen yang dibuka adalah SOP
            else if (targetSop && window.vmSopApp) {
                if (!window.vmSopApp.isSopAcknowledged(targetSop.id, currNip)) {
                    var pelaksanaArr = [];
                    try { pelaksanaArr = JSON.parse(targetSop.pelaksana_json || '[]'); } catch(e) {}
                    
                    var isSopMember = (typeof cekKeterlibatanPegawai === 'function')
                        ? cekKeterlibatanPegawai(pelaksanaArr, currNip).terlibat
                        : pelaksanaArr.some(function(m) { return String(m.nip) === String(currNip); });
                    
                    if (isSopMember) window.vmSopApp.doAcknowledgeSop(targetSop.id, currNip, true);
                }
            }
        }, 10000); // 10000 ms = 10 detik (Bisa disesuaikan angkanya bro)
        // --------------------------------------------------
      };

      modal.classList.remove('hidden');
      setTimeout(function() {
        modal.classList.remove('opacity-0');
        if (modal.firstElementChild) {
          modal.firstElementChild.classList.remove('scale-95');
        }
      }, 10);
    } catch (err) {
      console.error("Gagal membuka PDF viewer:", err);
    }
  };

  window.closeFlipbookModal = function() {
    try {
      // --- ZETTBOT: BERSIHKAN TIMER JIKA MODAL DITUTUP SEBELUM 10 DETIK ---
      if (window.autoAckTimer) {
          clearTimeout(window.autoAckTimer);
          window.autoAckTimer = null;
      }
      
      var modal = document.getElementById('modalFlipbook');
      if (!modal) return;

      modal.classList.add('opacity-0');
      if (modal.firstElementChild) {
        modal.firstElementChild.classList.add('scale-95');
      }

      setTimeout(function() {
        modal.classList.add('hidden');
        var iframe = document.getElementById('pdfIframe');
        if (iframe) iframe.src = '';
      }, 250);
    } catch (e) {
      console.error("closeFlipbookModal error:", e);
    }
  };
