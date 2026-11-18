// ==========================================
// FILE: modules/eoffice/rapat.js
// DESKRIPSI: Controller Workspace Modal Fullscreen Paket Administrasi Rapat
// FITUR: 4 Tab Navigasi, Penomoran UND.Kode, Tujuan 1 vs 2 Lembar,
//        Daftar Hadir Kosong (1-48), & Input Notula 5 Kolom Kiri-ke-Kanan
// ENGINE: TRANSKEP Core v1.0.0
// ==========================================

(function () {
  'use strict';

  var tujuanUndanganList = [];
  var pembahasanRowsList = [];
  var isRapatFullscreen = false;
  var currentRapatTab = 'undangan';

  var HARI_INDO_RAPAT = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  var BULAN_INDO_RAPAT = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  function escRapat_(v) {
    if (typeof window.escHtml === 'function') return window.escHtml(v);
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]);
    });
  }

  function getUsersListRapat_() {
    var list = (window.vueState && Array.isArray(window.vueState.usersList))
      ? window.vueState.usersList
      : (typeof state !== 'undefined' && Array.isArray(state.usersList) ? state.usersList : []);
    return list.filter(function (u) {
      return u && u.role !== 'Admin' && u.role !== 'Operator';
    });
  }

  function getHierarchyRankRapat_(jabatan) {
    var j = String(jabatan || '').toLowerCase();
    if (j.indexOf('wakil ketua') !== -1) return 2;
    if (j.indexOf('ketua') !== -1) return 1;
    if (j.indexOf('hakim') !== -1) return 3;
    if (j.indexOf('panitera muda') !== -1 || j.indexOf('panmud') !== -1) return 6;
    if (j.indexOf('panitera') !== -1) return 4;
    if (j.indexOf('sekretaris') !== -1) return 5;
    if (j.indexOf('kasubbag') !== -1 || j.indexOf('kepala sub') !== -1) return 7;
    return 10;
  }

  function getSortedPegawaiRapat_() {
    return getUsersListRapat_().slice().sort(function (a, b) {
      var ra = getHierarchyRankRapat_(a.jabatan);
      var rb = getHierarchyRankRapat_(b.jabatan);
      if (ra !== rb) return ra - rb;
      return String(a.nama || '').localeCompare(String(b.nama || ''));
    });
  }

  function formatIsoToIndoDateOnly_(isoStr) {
    if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return '';
    var p = isoStr.split('-');
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    if (isNaN(d.getTime())) return '';
    return d.getDate() + ' ' + BULAN_INDO_RAPAT[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatIsoToHariTanggal_(isoStr) {
    if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return '';
    var p = isoStr.split('-');
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    if (isNaN(d.getTime())) return '';
    return HARI_INDO_RAPAT[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN_INDO_RAPAT[d.getMonth()] + ' ' + d.getFullYear();
  }

  function inferKodePejabatFromJabatan_(jabatan) {
    var j = String(jabatan || '').toLowerCase();
    if (j.indexOf('wakil ketua') !== -1) return 'WKPA.W10-A2';
    if (j.indexOf('ketua') !== -1) return 'KPA.W10-A2';
    if (j.indexOf('panitera') !== -1 || j.indexOf('panmud') !== -1) return 'PAN.PA.W10-A2';
    if (j.indexOf('sekretaris') !== -1 || j.indexOf('kasubbag') !== -1 || j.indexOf('kepala sub') !== -1) return 'SEK.PA.W10-A2';
    return 'KPA.W10-A2';
  }

  function getRomawiBulan_(monthIndex) {
    if (typeof formatBulanRomawi === 'function') return formatBulanRomawi(monthIndex);
    var rom = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    return rom[monthIndex] || 'I';
  }

  // ==========================================
  // MODAL FULLSCREEN & TAB NAVIGASI
  // ==========================================
  window.toggleRapatFullscreen = function (forceState) {
    isRapatFullscreen = (typeof forceState === 'boolean') ? forceState : !isRapatFullscreen;
    var overlay = document.getElementById('modalAgendaRapat');
    var box = document.getElementById('modalAgendaRapatBox');
    var icon = document.getElementById('iconRapatFullscreen');
    if (overlay) {
      overlay.className = isRapatFullscreen
        ? 'fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md transition-opacity duration-300 p-0 no-print'
        : 'fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md transition-opacity duration-300 p-2 md:p-5 no-print';
    }
    if (box) {
      box.className = isRapatFullscreen
        ? 'glass border border-slate-800 bg-slate-900/95 rounded-none w-full h-full max-w-none max-h-none flex flex-col shadow-2xl transform transition-all duration-300 scale-100 overflow-hidden'
        : 'glass border border-slate-800 bg-slate-900/95 rounded-3xl w-[96vw] max-w-6xl h-[92vh] flex flex-col shadow-2xl transform transition-all duration-300 scale-100 overflow-hidden';
    }
    if (icon) {
      icon.className = isRapatFullscreen ? 'fa-solid fa-compress text-sm' : 'fa-solid fa-expand text-sm';
    }
  };

  window.switchRapatTab = function (tabKey) {
    currentRapatTab = tabKey || 'undangan';
    var tabs = ['undangan', 'peserta', 'notula', 'media'];
    tabs.forEach(function (key) {
      var panel = document.getElementById('rapatTabPanel_' + key);
      var btn = document.getElementById('rapatTabBtn_' + key);
      if (panel) {
        if (key === currentRapatTab) panel.classList.remove('hidden');
        else panel.classList.add('hidden');
      }
      if (btn) {
        btn.className = (key === currentRapatTab)
          ? 'px-3.5 py-1.5 rounded-xl text-[11px] font-bold border transition flex items-center gap-2 bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-sm'
          : 'px-3.5 py-1.5 rounded-xl text-[11px] font-bold border transition flex items-center gap-2 bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/70';
      }
    });
  };

  window.setRapatModalStatus = function (statusVal) {
    var val = (statusVal === 'Selesai') ? 'Selesai' : 'Terjadwal';
    var el = document.getElementById('rapatFieldStatus');
    if (el) el.value = val;
    var bT = document.getElementById('btnRapatStatusTerjadwal');
    var bS = document.getElementById('btnRapatStatusSelesai');
    if (bT) {
      bT.className = (val === 'Terjadwal')
        ? 'px-3 py-1 rounded-lg text-[10px] font-bold border transition bg-amber-500/20 border-amber-500/50 text-amber-300'
        : 'px-3 py-1 rounded-lg text-[10px] font-bold border transition bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800';
    }
    if (bS) {
      bS.className = (val === 'Selesai')
        ? 'px-3 py-1 rounded-lg text-[10px] font-bold border transition bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
        : 'px-3 py-1 rounded-lg text-[10px] font-bold border transition bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800';
    }
  };

  // ==========================================
  // PENOMORAN OTOMATIS & DROPDOWN PEJABAT TTD
  // ==========================================
  function populateRapatOfficialSelects_() {
    var list = getSortedPegawaiRapat_();
    var elTtd = document.getElementById('rapatFieldPejabatTtdSelect');
    var elPem = document.getElementById('rapatFieldPemimpinSelect');
    var elNot = document.getElementById('rapatFieldNotulisSelect');

    var buildOpts = function (items, placeholder) {
      var h = '<option value="">' + escRapat_(placeholder) + '</option>';
      items.forEach(function (u) {
        h += '<option value="' + escRapat_(u.nip) + '">' + escRapat_(u.nama) + ' (' + escRapat_(u.jabatan || '-') + ')</option>';
      });
      return h;
    };

    if (elTtd) {
      var pejabatTtdList = list.filter(function (u) {
        var j = String(u.jabatan || '').toLowerCase();
        return j.indexOf('ketua') !== -1 || j.indexOf('panitera') !== -1 || j.indexOf('sekretaris') !== -1 || j.indexOf('kasubbag') !== -1 || j.indexOf('panmud') !== -1;
      });
      elTtd.innerHTML = buildOpts(pejabatTtdList.length ? pejabatTtdList : list, '-- Pilih Pejabat Penandatangan --');
    }
    if (elPem) elPem.innerHTML = buildOpts(list, '-- Pilih Pimpinan Rapat --');
    if (elNot) elNot.innerHTML = buildOpts(list, '-- Pilih Notulis Rapat --');
  }

  window.syncNomorUndanganPreview = function () {
    var noUrut = (document.getElementById('rapatFieldNoUrutSurat') || {}).value || '';
    var kodePejabat = (document.getElementById('rapatFieldKodePejabat') || {}).value || 'KPA.W10-A2';
    var kodeSurat = (document.getElementById('rapatFieldKodeSurat') || {}).value || '';
    var tglIso = (document.getElementById('rapatFieldTglSuratIso') || {}).value || '';

    var refDate = new Date();
    if (/^\d{4}-\d{2}-\d{2}$/.test(tglIso)) {
      var p = tglIso.split('-');
      refDate = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    }

    var romawi = getRomawiBulan_(refDate.getMonth());
    var tahun = refDate.getFullYear();

    var cleanNo = noUrut.trim() || '...';
    var cleanKode = kodeSurat.trim().replace(/^UND\./i, '') || 'OT.01.1';
    var assembled = cleanNo + '/' + kodePejabat.trim() + '/UND.' + cleanKode + '/' + romawi + '/' + tahun;

    var elNomor = document.getElementById('rapatFieldNomorUndangan');
    if (elNomor) elNomor.value = assembled;
  };

  window.handleRapatPejabatTtdChange = function (nip) {
    var list = getUsersListRapat_();
    var u = list.find(function (x) { return String(x.nip) === String(nip); });
    document.getElementById('rapatFieldPejabatTtdNip').value = u ? String(u.nip || '') : '';
    document.getElementById('rapatFieldPejabatTtdNama').value = u ? String(u.nama || '') : '';
    document.getElementById('rapatFieldPejabatTtdJabatan').value = u ? String(u.jabatan || '') : '';

    if (u && u.jabatan) {
      var kode = inferKodePejabatFromJabatan_(u.jabatan);
      var elKodePjb = document.getElementById('rapatFieldKodePejabat');
      if (elKodePjb) elKodePjb.value = kode;
    }
    syncNomorUndanganPreview();
  };

  window.handleTglSuratChange = function (isoVal) {
    var indo = formatIsoToIndoDateOnly_(isoVal);
    var elIndo = document.getElementById('rapatFieldTglSuratIndo');
    if (elIndo && indo) elIndo.value = indo;
    syncNomorUndanganPreview();
  };

  window.handleTglRapatIsoChange = function (isoVal) {
    var hariTgl = formatIsoToHariTanggal_(isoVal);
    var elHt = document.getElementById('rapatFieldHariTanggal');
    if (elHt && hariTgl) elHt.value = hariTgl;
  };

  window.handleRapatPemimpinChange = function (nip) {
    var list = getUsersListRapat_();
    var u = list.find(function (x) { return String(x.nip) === String(nip); });
    document.getElementById('rapatFieldPemimpinNip').value = u ? String(u.nip || '') : '';
    document.getElementById('rapatFieldPemimpinJabatan').value = u ? String(u.jabatan || '') : '';
    if (u) {
      document.getElementById('rapatFieldPemimpin').value = u.jabatan || u.nama || '';
    }
  };

  window.handleRapatNotulisChange = function (nip) {
    var list = getUsersListRapat_();
    var u = list.find(function (x) { return String(x.nip) === String(nip); });
    document.getElementById('rapatFieldNotulisNip').value = u ? String(u.nip || '') : '';
    document.getElementById('rapatFieldNotulisJabatan').value = u ? String(u.jabatan || '') : '';
    if (u) {
      document.getElementById('rapatFieldNotulis').value = u.nama || '';
    }
  };

  // ==========================================
  // DAFTAR TUJUAN UNDANGAN (1-3 vs >3 LEMBAR)
  // ==========================================
  function updateModeLembarUndanganBadge_() {
    var badge = document.getElementById('rapatModeLembarBadge');
    var countBadge = document.getElementById('rapatCountPeserta');
    var count = tujuanUndanganList.length;

    if (countBadge) countBadge.innerText = String(count);

    if (badge) {
      if (count === 0) {
        badge.innerText = 'Belum ada tujuan undangan';
        badge.className = 'px-3 py-1 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700';
      } else if (count <= 3) {
        badge.innerText = 'Mode Otomatis: 1 Lembar (' + count + ' Tujuan)';
        badge.className = 'px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
      } else {
        badge.innerText = 'Mode Otomatis: 2 Lembar + Lampiran (' + count + ' Tujuan)';
        badge.className = 'px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30';
      }
    }
  }

  function renderTujuanUndanganOrdered_() {
    var container = document.getElementById('rapatTujuanOrderedContainer');
    if (!container) return;

    if (tujuanUndanganList.length === 0) {
      container.innerHTML = '<div class="text-center py-4 text-slate-500 text-[11px]">Belum ada penerima undangan. Tambahkan dari kotak input kustom atau pilih pegawai di bawah.</div>';
      updateModeLembarUndanganBadge_();
      return;
    }

    var html = '';
    tujuanUndanganList.forEach(function (item, idx) {
      html +=
        '<div class="flex items-center gap-2 p-2 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition">' +
          '<span class="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 font-bold text-[10px] flex items-center justify-center shrink-0">' + (idx + 1) + '</span>' +
          '<input type="text" value="' + escRapat_(item.label || item.nama || '') + '" oninput="updateTujuanLabel(' + idx + ', this.value)" ' +
            'class="flex-1 min-w-0 px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 text-xs focus:ring-1 focus:ring-cyan-500 outline-none" ' +
            'placeholder="Contoh: Drs. Taufiqurrokhman, M.H. (HAWASBID...)">' +
          '<div class="flex items-center gap-1 shrink-0">' +
            '<button type="button" onclick="moveTujuanUndangan(' + idx + ', -1)" ' + (idx === 0 ? 'disabled' : '') + ' class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 flex items-center justify-center transition"><i class="fa-solid fa-arrow-up text-[10px]"></i></button>' +
            '<button type="button" onclick="moveTujuanUndangan(' + idx + ', 1)" ' + (idx === tujuanUndanganList.length - 1 ? 'disabled' : '') + ' class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 flex items-center justify-center transition"><i class="fa-solid fa-arrow-down text-[10px]"></i></button>' +
            '<button type="button" onclick="removeTujuanUndangan(' + idx + ')" class="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 flex items-center justify-center transition"><i class="fa-solid fa-trash text-[10px]"></i></button>' +
          '</div>' +
        '</div>';
    });

    container.innerHTML = html;
    updateModeLembarUndanganBadge_();
  }

  window.renderPesertaRapatCheckboxes = function (searchKw) {
    var container = document.getElementById('rapatListPesertaContainer');
    if (!container) return;

    var listPegawai = getSortedPegawaiRapat_();
    if (searchKw) {
      var q = searchKw.toLowerCase();
      listPegawai = listPegawai.filter(function (u) {
        return (u.nama && u.nama.toLowerCase().indexOf(q) !== -1) || (u.jabatan && u.jabatan.toLowerCase().indexOf(q) !== -1);
      });
    }

    var selectedNips = tujuanUndanganList.map(function (t) { return String(t.nip || ''); });
    var html = '';
    listPegawai.forEach(function (u) {
      var nipStr = String(u.nip || '');
      var safeNip = escRapat_(nipStr);
      var isChecked = selectedNips.indexOf(nipStr) !== -1;
      html +=
        '<label class="flex items-start gap-2.5 p-2 rounded-xl border cursor-pointer transition ' +
        (isChecked ? 'bg-cyan-500/10 border-cyan-500/30 text-white' : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800/60') +
        '">' +
          '<input type="checkbox" data-nip="' + safeNip + '" onchange="togglePesertaRapatCheck(this.dataset.nip)" ' + (isChecked ? 'checked' : '') + ' class="mt-0.5 rounded border-slate-700 text-cyan-500 focus:ring-0 bg-slate-950">' +
          '<div class="min-w-0 flex-1 leading-tight">' +
            '<div class="font-bold text-[11px] truncate">' + escRapat_(u.nama || '-') + '</div>' +
            '<div class="text-[9px] text-slate-500 truncate">' + escRapat_(u.jabatan || '-') + '</div>' +
          '</div>' +
        '</label>';
    });

    container.innerHTML = html || '<div class="col-span-3 text-center py-4 text-slate-500 text-xs">Tidak ada pegawai yang cocok.</div>';
  };
  var renderPesertaRapatCheckboxes = window.renderPesertaRapatCheckboxes;

  window.togglePesertaRapatCheck = function (nip) {
    var idx = tujuanUndanganList.findIndex(function (t) { return String(t.nip || '') === String(nip); });
    if (idx === -1) {
      var u = getUsersListRapat_().find(function (x) { return String(x.nip) === String(nip); });
      if (u) {
        tujuanUndanganList.push({
          label: u.nama + (u.jabatan ? ' (' + u.jabatan + ')' : ''),
          nip: String(u.nip || ''),
          nama: String(u.nama || ''),
          jabatan: String(u.jabatan || '')
        });
      }
    } else {
      tujuanUndanganList.splice(idx, 1);
    }
    renderTujuanUndanganOrdered_();
    var kw = (document.getElementById('rapatSearchPesertaInput') || {}).value || '';
    renderPesertaRapatCheckboxes(kw);
  };

  window.pilihSemuaPesertaRapat = function (pilihSemua) {
    if (pilihSemua) {
      var list = getSortedPegawaiRapat_().slice(0, 48);
      tujuanUndanganList = list.map(function (u) {
        return {
          label: u.nama + (u.jabatan ? ' (' + u.jabatan + ')' : ''),
          nip: String(u.nip || ''),
          nama: String(u.nama || ''),
          jabatan: String(u.jabatan || '')
        };
      });
    } else {
      tujuanUndanganList = [];
    }
    renderTujuanUndanganOrdered_();
    var kw = (document.getElementById('rapatSearchPesertaInput') || {}).value || '';
    renderPesertaRapatCheckboxes(kw);
  };

  window.filterPesertaListModal = function (val) {
    renderPesertaRapatCheckboxes(val);
  };

  window.addCustomTujuanUndangan = function () {
    var input = document.getElementById('rapatCustomTujuanInput');
    if (!input) return;
    var val = input.value.trim();
    if (!val) return;
    tujuanUndanganList.push({ label: val, nip: '', nama: val, jabatan: 'Tujuan Kustom' });
    input.value = '';
    renderTujuanUndanganOrdered_();
  };

  window.addPresetTujuanUndangan = function (textVal) {
    if (!textVal) return;
    tujuanUndanganList.push({ label: textVal, nip: '', nama: textVal, jabatan: textVal });
    renderTujuanUndanganOrdered_();
  };

  window.updateTujuanLabel = function (idx, val) {
    if (tujuanUndanganList[idx]) {
      tujuanUndanganList[idx].label = val;
      if (!tujuanUndanganList[idx].nip) tujuanUndanganList[idx].nama = val;
    }
  };

  window.moveTujuanUndangan = function (idx, dir) {
    var target = idx + dir;
    if (target < 0 || target >= tujuanUndanganList.length) return;
    var tmp = tujuanUndanganList[idx];
    tujuanUndanganList[idx] = tujuanUndanganList[target];
    tujuanUndanganList[target] = tmp;
    renderTujuanUndanganOrdered_();
  };

  window.removeTujuanUndangan = function (idx) {
    tujuanUndanganList.splice(idx, 1);
    renderTujuanUndanganOrdered_();
    var kw = (document.getElementById('rapatSearchPesertaInput') || {}).value || '';
    renderPesertaRapatCheckboxes(kw);
  };

  window.clearAllTujuanUndangan = function () {
    tujuanUndanganList = [];
    renderTujuanUndanganOrdered_();
    var kw = (document.getElementById('rapatSearchPesertaInput') || {}).value || '';
    renderPesertaRapatCheckboxes(kw);
  };

  window.setJumlahBarisHadir = function (n) {
    var clamped = Math.min(48, Math.max(1, parseInt(n, 10) || 15));
    var el = document.getElementById('rapatFieldJumlahBarisHadir');
    if (el) el.value = clamped;
    updateEstimasiHadir(clamped);
  };

  window.updateEstimasiHadir = function (val) {
    var n = Math.min(48, Math.max(1, parseInt(val, 10) || 15));
    var pages = Math.ceil(n / 20);
    var badge = document.getElementById('rapatEstimasiHalamanHadir');
    if (badge) {
      badge.innerText = 'Estimasi: ' + pages + ' Lembar A4 (' + n + ' baris)';
    }
  };

  // ==========================================
  // NOTULA: INPUT 5 KOLOM KIRI -> KANAN PER PEMBICARA
  // ==========================================
  function renderPembahasanRows_() {
    var container = document.getElementById('rapatPembahasanListContainer');
    var countBadge = document.getElementById('rapatCountPembicara');
    if (countBadge) countBadge.innerText = String(pembahasanRowsList.length);
    if (!container) return;

    if (pembahasanRowsList.length === 0) {
      container.innerHTML =
        '<div class="p-6 text-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 text-slate-400 text-xs">' +
          'Belum ada catatan pembicara. Klik <b>+ Tambah Pembicara / Poin</b> di kanan atas untuk mulai mengisi 5 kolom Notula.' +
        '</div>';
      return;
    }

    var sortedUsers = getSortedPegawaiRapat_();
    var userOptions = '<option value="">-- Pilih Cepat Pegawai --</option>';
    sortedUsers.forEach(function (u) {
      userOptions += '<option value="' + escRapat_(u.nip) + '">' + escRapat_(u.nama) + ' (' + escRapat_(u.jabatan || '-') + ')</option>';
    });

    var html = '';
    pembahasanRowsList.forEach(function (row, idx) {
      html +=
        '<div class="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5 shadow-sm">' +
          '<div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">' +
            '<div class="flex flex-wrap items-center gap-2 flex-1 min-w-0">' +
              '<span class="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-[10px] shrink-0">Pembicara #' + (idx + 1) + '</span>' +
              '<select onchange="pickPembahasanSpeaker(' + idx + ', this.value)" class="px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-cyan-300 text-[11px] outline-none max-w-[220px]">' +
                userOptions +
              '</select>' +
              '<input type="text" value="' + escRapat_(row.pembicara_nama || '') + '" oninput="updatePembahasanField(' + idx + ', \'pembicara_nama\', this.value)" ' +
                'placeholder="Nama &amp; Jabatan Pembicara (cth: Agus Salim, S.Ag. (Sekretaris))" ' +
                'class="flex-1 min-w-[200px] px-2.5 py-1 bg-slate-950 border border-slate-700 rounded-lg text-white font-bold text-xs focus:ring-1 focus:ring-emerald-500 outline-none">' +
            '</div>' +
            '<div class="flex items-center gap-1 shrink-0">' +
              '<button type="button" onclick="movePembahasanRow(' + idx + ', -1)" ' + (idx === 0 ? 'disabled' : '') + ' class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 flex items-center justify-center"><i class="fa-solid fa-arrow-up text-[10px]"></i></button>' +
              '<button type="button" onclick="movePembahasanRow(' + idx + ', 1)" ' + (idx === pembahasanRowsList.length - 1 ? 'disabled' : '') + ' class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 flex items-center justify-center"><i class="fa-solid fa-arrow-down text-[10px]"></i></button>' +
              '<button type="button" onclick="removePembahasanRow(' + idx + ')" class="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 flex items-center justify-center"><i class="fa-solid fa-trash text-[10px]"></i></button>' +
            '</div>' +
          '</div>' +

          '<div class="grid grid-cols-1 xl:grid-cols-[2.2fr_1.8fr_1.2fr_1.1fr_1fr] gap-2.5">' +
            '<div>' +
              '<label class="xl:hidden block text-[9px] font-bold text-slate-400 uppercase mb-1">a. Uraian Pembahasan / Laporan</label>' +
              '<textarea rows="4" oninput="updatePembahasanField(' + idx + ', \'uraian\', this.value)" placeholder="1 baris = 1 poin pembahasan..." class="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-[11px] focus:ring-1 focus:ring-emerald-500 outline-none custom-scrollbar leading-relaxed">' + escRapat_(row.uraian || '') + '</textarea>' +
            '</div>' +
            '<div>' +
              '<label class="xl:hidden block text-[9px] font-bold text-slate-400 uppercase mb-1">b. Tindak Lanjut / Tanggapan / Masukan</label>' +
              '<textarea rows="4" oninput="updatePembahasanField(' + idx + ', \'tindak_lanjut\', this.value)" placeholder="1 baris = 1 poin tindak lanjut..." class="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-[11px] focus:ring-1 focus:ring-emerald-500 outline-none custom-scrollbar leading-relaxed">' + escRapat_(row.tindak_lanjut || '') + '</textarea>' +
            '</div>' +
            '<div>' +
              '<label class="xl:hidden block text-[9px] font-bold text-slate-400 uppercase mb-1">c. Target Penyelesaian</label>' +
              '<textarea rows="4" oninput="updatePembahasanField(' + idx + ', \'target\', this.value)" placeholder="Target output..." class="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-[11px] focus:ring-1 focus:ring-emerald-500 outline-none custom-scrollbar leading-relaxed">' + escRapat_(row.target || '') + '</textarea>' +
            '</div>' +
            '<div>' +
              '<label class="xl:hidden block text-[9px] font-bold text-slate-400 uppercase mb-1">d. Penanggung Jawab</label>' +
              '<textarea rows="4" oninput="updatePembahasanField(' + idx + ', \'penanggung_jawab\', this.value)" placeholder="Pihak / jabatan PJ..." class="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-[11px] focus:ring-1 focus:ring-emerald-500 outline-none custom-scrollbar leading-relaxed">' + escRapat_(row.penanggung_jawab || '') + '</textarea>' +
            '</div>' +
            '<div>' +
              '<label class="xl:hidden block text-[9px] font-bold text-slate-400 uppercase mb-1">e. Tanggal Penyelesaian</label>' +
              '<textarea rows="4" oninput="updatePembahasanField(' + idx + ', \'tanggal_penyelesaian\', this.value)" placeholder="cth: 4 s.d. 6 Nov 2026" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-[11px] focus:ring-1 focus:ring-emerald-500 outline-none custom-scrollbar leading-relaxed">' + escRapat_(row.tanggal_penyelesaian || '') + '</textarea>' +
            '</div>' +
          '</div>' +
        '</div>';
    });

    container.innerHTML = html;
  }

  window.addPembahasanRow = function (initialObj) {
    var base = initialObj || {};
    pembahasanRowsList.push({
      pembicara_nama: String(base.pembicara_nama || ''),
      pembicara_nip: String(base.pembicara_nip || ''),
      pembicara_jabatan: String(base.pembicara_jabatan || ''),
      uraian: String(base.uraian || ''),
      tindak_lanjut: String(base.tindak_lanjut || ''),
      target: String(base.target || ''),
      penanggung_jawab: String(base.penanggung_jawab || ''),
      tanggal_penyelesaian: String(base.tanggal_penyelesaian || '')
    });
    renderPembahasanRows_();
  };

  window.removePembahasanRow = function (idx) {
    pembahasanRowsList.splice(idx, 1);
    renderPembahasanRows_();
  };

  window.movePembahasanRow = function (idx, dir) {
    var target = idx + dir;
    if (target < 0 || target >= pembahasanRowsList.length) return;
    var tmp = pembahasanRowsList[idx];
    pembahasanRowsList[idx] = pembahasanRowsList[target];
    pembahasanRowsList[target] = tmp;
    renderPembahasanRows_();
  };

  window.pickPembahasanSpeaker = function (idx, nip) {
    if (!pembahasanRowsList[idx] || !nip) return;
    var u = getUsersListRapat_().find(function (x) { return String(x.nip) === String(nip); });
    if (!u) return;
    pembahasanRowsList[idx].pembicara_nip = String(u.nip || '');
    pembahasanRowsList[idx].pembicara_jabatan = String(u.jabatan || '');
    pembahasanRowsList[idx].pembicara_nama = u.nama + (u.jabatan ? ' (' + u.jabatan + ')' : '');
    renderPembahasanRows_();
  };

  window.updatePembahasanField = function (idx, field, val) {
    if (pembahasanRowsList[idx]) {
      pembahasanRowsList[idx][field] = val;
    }
  };

  // ==========================================
  // BUKA & TUTUP MODAL WORKSPACE RAPAT
  // ==========================================
  window.openRapatModalForm = function (rapatData) {
    var modal = document.getElementById('modalAgendaRapat');
    if (!modal) return;

    rapatData = rapatData || {};
    populateRapatOfficialSelects_();
    toggleRapatFullscreen(false);
    switchRapatTab('undangan');

    var todayIso = new Date().toISOString().split('T')[0];

    document.getElementById('rapatFieldIdRapat').value = rapatData.id_rapat || rapatData.id || '';
    document.getElementById('rapatFieldDocUndanganUrl').value = rapatData.doc_undangan_url || '';
    document.getElementById('rapatFieldDocAbsenUrl').value = rapatData.doc_absen_url || '';
    document.getElementById('rapatFieldDocNotulenUrl').value = rapatData.doc_notulen_url || '';
    setRapatModalStatus(rapatData.status || 'Terjadwal');

    // Tab 1 Fields
    var tglSuratIso = /^\d{4}-\d{2}-\d{2}$/.test(String(rapatData.tgl_surat || '')) ? rapatData.tgl_surat : todayIso;
    document.getElementById('rapatFieldTglSuratIso').value = tglSuratIso;
    document.getElementById('rapatFieldTglSuratIndo').value = formatIsoToIndoDateOnly_(tglSuratIso) || String(rapatData.tgl_surat || '');

    document.getElementById('rapatFieldPejabatTtdSelect').value = rapatData.pejabat_ttd_nip || '';
    document.getElementById('rapatFieldPejabatTtdNip').value = rapatData.pejabat_ttd_nip || '';
    document.getElementById('rapatFieldPejabatTtdNama').value = rapatData.pejabat_ttd_nama || '';
    document.getElementById('rapatFieldPejabatTtdJabatan').value = rapatData.pejabat_ttd_jabatan || '';
    document.getElementById('rapatFieldKodePejabat').value = rapatData.kode_pejabat_ttd || 'KPA.W10-A2';
    document.getElementById('rapatFieldNoUrutSurat').value = rapatData.no_urut_surat || '';
    document.getElementById('rapatFieldKodeSurat').value = rapatData.kode_klasifikasi_surat || 'OT.01.1';
    document.getElementById('rapatFieldLampiranSurat').value = rapatData.lampiran_surat || '-';
    document.getElementById('rapatFieldTampilkanGelarUndangan').checked = Boolean(rapatData.tampilkan_gelar_undangan);

    if (rapatData.nomor_undangan) {
      document.getElementById('rapatFieldNomorUndangan').value = rapatData.nomor_undangan;
    } else {
      syncNomorUndanganPreview();
    }

    document.getElementById('rapatFieldAgenda').value = rapatData.agenda || '';
    document.getElementById('rapatFieldDasarNotula').value = rapatData.dasar_notula || '';
    document.getElementById('rapatFieldAgendaPoin').value = rapatData.agenda_poin || '';

    document.getElementById('rapatFieldTglRapatIso').value = '';
    document.getElementById('rapatFieldHariTanggal').value = rapatData.hari_tanggal || formatIsoToHariTanggal_(todayIso);
    document.getElementById('rapatFieldWaktuMulai').value = rapatData.waktu_mulai || '08:00 WIB';
    document.getElementById('rapatFieldWaktuSelesai').value = rapatData.waktu_selesai || 'Selesai';
    document.getElementById('rapatFieldTempat').value = rapatData.tempat || 'Ruang Rapat Pimpinan Pengadilan Agama Indramayu';

    document.getElementById('rapatFieldPemimpinSelect').value = rapatData.pemimpin_nip || '';
    document.getElementById('rapatFieldPemimpinNip').value = rapatData.pemimpin_nip || '';
    document.getElementById('rapatFieldPemimpinJabatan').value = rapatData.pemimpin_jabatan || '';
    document.getElementById('rapatFieldPemimpin').value = rapatData.pemimpin || 'Ketua Pengadilan Agama Indramayu';

    document.getElementById('rapatFieldNotulisSelect').value = rapatData.notulis_nip || '';
    document.getElementById('rapatFieldNotulisNip').value = rapatData.notulis_nip || '';
    document.getElementById('rapatFieldNotulisJabatan').value = rapatData.notulis_jabatan || '';
    document.getElementById('rapatFieldNotulis').value = rapatData.notulis || '';

    // Tab 2: Tujuan Undangan & Daftar Hadir Config
    tujuanUndanganList = [];
    if (rapatData.tujuan_undangan_json) {
      try {
        var parsedTujuan = JSON.parse(rapatData.tujuan_undangan_json);
        if (Array.isArray(parsedTujuan)) tujuanUndanganList = parsedTujuan;
      } catch (e) {}
    } else if (rapatData.peserta_json) {
      try {
        var parsedLegacy = JSON.parse(rapatData.peserta_json);
        if (Array.isArray(parsedLegacy)) {
          tujuanUndanganList = parsedLegacy.map(function (p) {
            return {
              label: (p.nama || '-') + (p.jabatan && p.jabatan !== '-' ? ' (' + p.jabatan + ')' : ''),
              nip: String(p.nip || ''),
              nama: String(p.nama || ''),
              jabatan: String(p.jabatan || '')
            };
          });
        }
      } catch (e) {}
    }

    document.getElementById('rapatFieldJenisKegiatan').value = rapatData.jenis_kegiatan || 'Rapat';
    setJumlahBarisHadir(rapatData.jumlah_baris_hadir || 15);
    if (document.getElementById('rapatSearchPesertaInput')) {
      document.getElementById('rapatSearchPesertaInput').value = '';
    }
    renderTujuanUndanganOrdered_();
    renderPesertaRapatCheckboxes('');

    // Tab 3: Notula & Pembahasan 5 Kolom
    document.getElementById('rapatFieldPengarahanUmum').value = rapatData.pengarahan_umum || '';
    document.getElementById('rapatFieldKesimpulan').value = rapatData.kesimpulan || '';

    pembahasanRowsList = [];
    if (rapatData.pembahasan_json) {
      try {
        var parsedRows = JSON.parse(rapatData.pembahasan_json);
        if (Array.isArray(parsedRows)) pembahasanRowsList = parsedRows;
      } catch (e) {}
    } else if (rapatData.pembahasan && String(rapatData.pembahasan).trim()) {
      pembahasanRowsList.push({
        pembicara_nama: rapatData.pemimpin || 'Pembahasan Umum',
        pembicara_nip: '',
        pembicara_jabatan: '',
        uraian: String(rapatData.pembahasan || ''),
        tindak_lanjut: String(rapatData.kesimpulan || ''),
        target: '',
        penanggung_jawab: '',
        tanggal_penyelesaian: ''
      });
    }
    if (pembahasanRowsList.length === 0) {
      addPembahasanRow();
    } else {
      renderPembahasanRows_();
    }

    // Tab 4: Media / AI
    var elAiTrans = document.getElementById('rapatFieldAiTranscript');
    if (elAiTrans) elAiTrans.value = rapatData.ai_transcript || '';

    modal.classList.remove('hidden');
    setTimeout(function () {
      modal.classList.remove('opacity-0');
      var box = document.getElementById('modalAgendaRapatBox');
      if (box) {
        box.classList.remove('scale-95');
        box.classList.add('scale-100');
      }
    }, 10);
  };
  window.openRapatDetailModal = window.openRapatModalForm;

  window.closeRapatModalForm = function () {
    var modal = document.getElementById('modalAgendaRapat');
    if (!modal) return;
    modal.classList.add('opacity-0');
    var box = document.getElementById('modalAgendaRapatBox');
    if (box) {
      box.classList.remove('scale-100');
      box.classList.add('scale-95');
    }
    setTimeout(function () {
      modal.classList.add('hidden');
    }, 300);
  };

  window.showRapatSuccessResultModal = function () {};
  window.closeRapatSuccessModal = function () {
    var modal = document.getElementById('modalRapatSuccessResult');
    if (modal) modal.classList.add('hidden');
  };

  // ==========================================
  // SIMPAN DATA RAPAT KE FIRESTORE (0ms)
  // ==========================================
  window.submitRapatForm = async function () {
    var agenda = (document.getElementById('rapatFieldAgenda') || {}).value || '';
    var hariTanggal = (document.getElementById('rapatFieldHariTanggal') || {}).value || '';

    if (!agenda.trim()) {
      if (typeof showNotify === 'function') showNotify('Peringatan', 'Acara / Judul Rapat wajib diisi.', 'warning');
      switchRapatTab('undangan');
      return;
    }
    if (!hariTanggal.trim()) {
      if (typeof showNotify === 'function') showNotify('Peringatan', 'Hari & Tanggal Rapat wajib diisi.', 'warning');
      switchRapatTab('undangan');
      return;
    }

    var cleanPembahasanRows = pembahasanRowsList.filter(function (r) {
      return String(r.pembicara_nama || '').trim() ||
        String(r.uraian || '').trim() ||
        String(r.tindak_lanjut || '').trim() ||
        String(r.target || '').trim();
    });

    var flatPembahasanSummary = cleanPembahasanRows.map(function (r, i) {
      return (i + 1) + '. ' + (r.pembicara_nama || 'Pembicara') + ': ' + (r.uraian || '');
    }).join('\n');

    var pesertaSimple = tujuanUndanganList.map(function (t) {
      return {
        nip: t.nip || '-',
        nama: t.nama || t.label || '',
        jabatan: t.jabatan || ''
      };
    });

    var tglSuratIso = (document.getElementById('rapatFieldTglSuratIso') || {}).value || '';
    var jumlahBaris = Math.min(48, Math.max(1, parseInt((document.getElementById('rapatFieldJumlahBarisHadir') || {}).value, 10) || 15));

    // Jika pemimpin / notulis tidak dipilih dari dropdown, coba cocokkan dari field select atau default
    var pejabatSelectVal = (document.getElementById('rapatFieldPejabatTtdSelect') || {}).value || '';
    var pjbNip = (document.getElementById('rapatFieldPejabatTtdNip') || {}).value || pejabatSelectVal || '';

    var payload = {
      id_rapat: ((document.getElementById('rapatFieldIdRapat') || {}).value || '').trim(),
      status: (document.getElementById('rapatFieldStatus') || {}).value || 'Terjadwal',
      nomor_undangan: (document.getElementById('rapatFieldNomorUndangan') || {}).value || '',
      tgl_surat: tglSuratIso,
      no_urut_surat: (document.getElementById('rapatFieldNoUrutSurat') || {}).value || '',
      kode_klasifikasi_surat: (document.getElementById('rapatFieldKodeSurat') || {}).value || '',
      kode_pejabat_ttd: (document.getElementById('rapatFieldKodePejabat') || {}).value || 'KPA.W10-A2',
      pejabat_ttd_nip: pjbNip,
      pejabat_ttd_nama: (document.getElementById('rapatFieldPejabatTtdNama') || {}).value || '',
      pejabat_ttd_jabatan: (document.getElementById('rapatFieldPejabatTtdJabatan') || {}).value || '',
      tampilkan_gelar_undangan: Boolean((document.getElementById('rapatFieldTampilkanGelarUndangan') || {}).checked),
      lampiran_surat: (document.getElementById('rapatFieldLampiranSurat') || {}).value || '-',
      tujuan_undangan_json: JSON.stringify(tujuanUndanganList),
      agenda: agenda.trim(),
      agenda_poin: (document.getElementById('rapatFieldAgendaPoin') || {}).value || '',
      dasar_notula: (document.getElementById('rapatFieldDasarNotula') || {}).value || '',
      jenis_kegiatan: (document.getElementById('rapatFieldJenisKegiatan') || {}).value || 'Rapat',
      jumlah_baris_hadir: jumlahBaris,
      hari_tanggal: hariTanggal.trim(),
      waktu_mulai: (document.getElementById('rapatFieldWaktuMulai') || {}).value || '08:00 WIB',
      waktu_selesai: (document.getElementById('rapatFieldWaktuSelesai') || {}).value || 'Selesai',
      tempat: (document.getElementById('rapatFieldTempat') || {}).value || '',
      pemimpin: (document.getElementById('rapatFieldPemimpin') || {}).value || '',
      pemimpin_nip: (document.getElementById('rapatFieldPemimpinNip') || {}).value || '',
      pemimpin_jabatan: (document.getElementById('rapatFieldPemimpinJabatan') || {}).value || '',
      notulis: (document.getElementById('rapatFieldNotulis') || {}).value || '',
      notulis_nip: (document.getElementById('rapatFieldNotulisNip') || {}).value || '',
      notulis_jabatan: (document.getElementById('rapatFieldNotulisJabatan') || {}).value || '',
      peserta_json: JSON.stringify(pesertaSimple),
      pengarahan_umum: (document.getElementById('rapatFieldPengarahanUmum') || {}).value || '',
      pembahasan: flatPembahasanSummary,
      pembahasan_json: JSON.stringify(cleanPembahasanRows),
      kesimpulan: (document.getElementById('rapatFieldKesimpulan') || {}).value || '',
      ai_transcript: (document.getElementById('rapatFieldAiTranscript') || {}).value || '',
      doc_undangan_url: (document.getElementById('rapatFieldDocUndanganUrl') || {}).value || '',
      doc_absen_url: (document.getElementById('rapatFieldDocAbsenUrl') || {}).value || '',
      doc_notulen_url: (document.getElementById('rapatFieldDocNotulenUrl') || {}).value || ''
    };

    var currentUser = (window.vueState && window.vueState.user) ? window.vueState.user : (typeof state !== 'undefined' ? state.user : null);
    var adminNip = (currentUser && currentUser.nip) || localStorage.getItem('transkep_active_nip') || '';

    var btnSubmit = document.getElementById('btnRapatSaveAgenda');
    if (btnSubmit) btnSubmit.disabled = true;

    try {
      var res = await window.EofficeDataService.saveRapatData(payload, adminNip);
      if (btnSubmit) btnSubmit.disabled = false;

      if (res && res.status === 'success') {
        var savedDoc = res.data || { ...payload, id_rapat: res.id_rapat, id: res.id_rapat };
        if (window.vmEoffice && Array.isArray(window.vmEoffice.rawRapatList)) {
          var targetId = String(savedDoc.id_rapat || savedDoc.id);
          var existingIdx = window.vmEoffice.rawRapatList.findIndex(function (r) {
            return String(r.id_rapat || r.id) === targetId;
          });
          if (existingIdx !== -1) {
            window.vmEoffice.rawRapatList.splice(existingIdx, 1, savedDoc);
          } else {
            window.vmEoffice.rawRapatList.unshift(savedDoc);
          }
        }

        closeRapatModalForm();
        if (typeof showNotify === 'function') {
          showNotify('Agenda Rapat Disimpan', 'Data rapat berhasil disimpan ke Cloud Firestore. Gunakan tombol cetak di tabel E-Office.', 'success');
        }
      } else {
        if (typeof showNotify === 'function') {
          showNotify('Gagal Menyimpan', (res ? res.message : 'Terjadi kendala saat menyimpan agenda rapat.'), 'error');
        }
      }
    } catch (err) {
      if (btnSubmit) btnSubmit.disabled = false;
      console.error('Error save rapat:', err);
      if (typeof showNotify === 'function') {
        showNotify('Error Sistem', err.toString(), 'error');
      }
    }
  };
})();
