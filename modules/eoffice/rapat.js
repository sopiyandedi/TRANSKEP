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
  var fotoRapatList = [];
  var isRapatFullscreen = false;
  var currentRapatTab = 'undangan';
  var isSubmittingRapat = false;
  var isProcessingAiNotulen = false;
  var tujuanSearchActiveIdx = 0;
  var tujuanSearchMatches = [];
  var tujuanDropCheckedMap = {};
  var speakerDropActiveMap = {};
  var speakerDropMatchesMap = {};
  var officialDropActiveMap = { pejabatTtd: 0, pemimpin: 0, notulis: 0 };
  var officialDropMatchesMap = { pejabatTtd: [], pemimpin: [], notulis: [] };
  var rapatLastKeyShiftTab = false;

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('keydown', function (ev) {
      if (ev && ev.key === 'Tab') {
        rapatLastKeyShiftTab = Boolean(ev.shiftKey);
      }
    }, true);
  }
  var rapatAudioState = {
    dataUri: '',
    mimeType: '',
    fileName: '',
    sizeBytes: 0,
    objectUrl: '',
    file: null,
    driveFileId: '',
    driveUrl: '',
    isLargeFile: false,
    uploading: false,
    uploadPromise: null,
    uploadError: '',
    uploadSeq: 0,
    activeJobId: '',
    recorder: null,
    stream: null,
    chunks: [],
    recording: false,
    timerId: null,
    startedAt: 0
  };

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
        ? 'glass border border-slate-800 bg-slate-900/95 rounded-none w-full h-full max-w-none max-h-none flex flex-col shadow-2xl transform transition-all duration-300 scale-100 overflow-clip'
        : 'glass border border-slate-800 bg-slate-900/95 rounded-3xl w-[96vw] max-w-6xl h-[92vh] flex flex-col shadow-2xl transform transition-all duration-300 scale-100 overflow-clip';
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
    var hdrAddBtn = document.getElementById('btnRapatHeaderAddPembicara');
    if (hdrAddBtn) {
      if (currentRapatTab === 'notula') hdrAddBtn.classList.remove('hidden');
      else hdrAddBtn.classList.add('hidden');
    }
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
  // PENOMORAN OTOMATIS & SEARCHABLE PEJABAT TTD / PIMPINAN / NOTULIS
  // ==========================================
  function setElValRapat_(id, val) {
    if (!id || typeof document === 'undefined') return;
    var el = document.getElementById(id);
    if (el) el.value = (val == null) ? '' : String(val);
  }

  var OFFICIAL_SEARCH_CONFIG_ = {
    pejabatTtd: {
      inputId: 'rapatPejabatTtdSearch',
      clearId: 'btnClearRapatPejabatTtd',
      dropId: 'rapatPejabatTtdDrop',
      nipId: 'rapatFieldPejabatTtdNip',
      namaId: 'rapatFieldPejabatTtdNama',
      jabatanId: 'rapatFieldPejabatTtdJabatan',
      accentClass: 'bg-amber-600 text-white',
      hoverClass: 'text-slate-300 hover:bg-amber-600 hover:text-white',
      emptyText: 'Tidak ditemukan pejabat/pegawai yang cocok.',
      preferPejabat: true
    },
    pemimpin: {
      inputId: 'rapatPemimpinSearch',
      clearId: 'btnClearRapatPemimpin',
      dropId: 'rapatPemimpinDrop',
      nipId: 'rapatFieldPemimpinNip',
      namaId: null,
      jabatanId: 'rapatFieldPemimpinJabatan',
      accentClass: 'bg-cyan-600 text-white',
      hoverClass: 'text-slate-300 hover:bg-cyan-600 hover:text-white',
      emptyText: 'Pegawai tidak ditemukan. Isi manual Label Jabatan Pimpinan di kolom sebelahnya.',
      preferPejabat: false
    },
    notulis: {
      inputId: 'rapatNotulisSearch',
      clearId: 'btnClearRapatNotulis',
      dropId: 'rapatNotulisDrop',
      nipId: 'rapatFieldNotulisNip',
      namaId: null,
      jabatanId: 'rapatFieldNotulisJabatan',
      accentClass: 'bg-emerald-600 text-white',
      hoverClass: 'text-slate-300 hover:bg-emerald-600 hover:text-white',
      emptyText: 'Pegawai tidak ditemukan. Isi manual Nama Notulis di kolom sebelahnya.',
      preferPejabat: false
    }
  };

  function resolveOfficialDisplay_(nipVal, namaVal, jabVal) {
    var cleanNip = String(nipVal || '').trim();
    if (cleanNip) {
      var matched = getUsersListRapat_().find(function (u) { return String(u.nip) === cleanNip; });
      if (matched) return matched.nama + (matched.jabatan ? ' (' + matched.jabatan + ')' : '');
    }
    var cleanNama = String(namaVal || '').trim();
    var cleanJab = String(jabVal || '').trim();
    if (cleanNama) {
      return (cleanJab && cleanJab !== cleanNama && cleanNama.indexOf('(') === -1) ? (cleanNama + ' (' + cleanJab + ')') : cleanNama;
    }
    return '';
  }

  function populateRapatOfficialSelects_() {
    var list = getSortedPegawaiRapat_();
    var elTtd = document.getElementById('rapatFieldPejabatTtdSelect');
    var elPem = document.getElementById('rapatFieldPemimpinSelect');
    var elNot = document.getElementById('rapatFieldNotulisSelect');
    if (!elTtd && !elPem && !elNot) return;

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

  window.syncNoUrutFromNomorUndangan = function (fullVal) {
    var s = String(fullVal == null ? '' : fullVal).trim();
    var extracted = '';
    if (s && s.indexOf('/') !== -1) {
      var seg0 = s.split('/')[0].trim();
      if (seg0 && seg0 !== '...' && seg0 !== '......' && seg0 !== '-') {
        extracted = seg0;
      }
    }
    setElValRapat_('rapatFieldNoUrutSurat', extracted);
    return extracted;
  };

  window.handleRapatPejabatTtdChange = function (nip) {
    var list = getUsersListRapat_();
    var u = list.find(function (x) { return String(x.nip) === String(nip); });
    setElValRapat_('rapatFieldPejabatTtdNip', u ? String(u.nip || '') : '');
    setElValRapat_('rapatFieldPejabatTtdNama', u ? String(u.nama || '') : '');
    setElValRapat_('rapatFieldPejabatTtdJabatan', u ? String(u.jabatan || '') : '');

    if (u && u.jabatan) {
      setElValRapat_('rapatFieldKodePejabat', inferKodePejabatFromJabatan_(u.jabatan));
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
    setElValRapat_('rapatFieldPemimpinNip', u ? String(u.nip || '') : '');
    setElValRapat_('rapatFieldPemimpinJabatan', u ? String(u.jabatan || '') : '');
    if (u) {
      setElValRapat_('rapatFieldPemimpin', u.jabatan || u.nama || '');
    }
  };

  window.handleRapatNotulisChange = function (nip) {
    var list = getUsersListRapat_();
    var u = list.find(function (x) { return String(x.nip) === String(nip); });
    setElValRapat_('rapatFieldNotulisNip', u ? String(u.nip || '') : '');
    setElValRapat_('rapatFieldNotulisJabatan', u ? String(u.jabatan || '') : '');
    if (u) {
      setElValRapat_('rapatFieldNotulis', u.nama || '');
    }
  };

  function getFilteredOfficialPegawai_(kind, kw) {
    var cfg = OFFICIAL_SEARCH_CONFIG_[kind];
    var sorted = getSortedPegawaiRapat_();
    var q = String(kw || '').toLowerCase().trim();
    if (!q) {
      if (cfg && cfg.preferPejabat) {
        var pejabatOnly = sorted.filter(function (u) {
          var j = String(u.jabatan || '').toLowerCase();
          return j.indexOf('ketua') !== -1 || j.indexOf('panitera') !== -1 || j.indexOf('sekretaris') !== -1 || j.indexOf('kasubbag') !== -1 || j.indexOf('panmud') !== -1;
        });
        if (pejabatOnly.length > 0) return pejabatOnly;
      }
      return sorted;
    }
    return sorted.filter(function (u) {
      return (u.nama && u.nama.toLowerCase().indexOf(q) !== -1) ||
        (u.jabatan && u.jabatan.toLowerCase().indexOf(q) !== -1) ||
        (u.nip && String(u.nip).toLowerCase().indexOf(q) !== -1);
    });
  }

  function renderOfficialSearchDropdown_(kind, kw) {
    var cfg = OFFICIAL_SEARCH_CONFIG_[kind];
    if (!cfg) return;
    var inp = document.getElementById(cfg.inputId);
    var clearBtn = document.getElementById(cfg.clearId);
    var drop = document.getElementById(cfg.dropId);
    var hasText = Boolean((inp && String(inp.value || '').trim()) || String(kw || '').trim());
    if (clearBtn) {
      if (hasText) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }
    if (!drop) return;

    var matches = getFilteredOfficialPegawai_(kind, kw);
    officialDropMatchesMap[kind] = matches;
    var curIdx = officialDropActiveMap[kind];
    if (typeof curIdx !== 'number' || curIdx >= matches.length || curIdx < 0) {
      curIdx = 0;
      officialDropActiveMap[kind] = 0;
    }

    if (matches.length === 0) {
      drop.innerHTML = '<div class="px-3 py-2 text-[11px] text-slate-400 italic text-center">' + escRapat_(cfg.emptyText) + '</div>';
      drop.classList.remove('hidden');
      return;
    }

    var h = '';
    matches.slice(0, 40).forEach(function (u, mIdx) {
      var isAct = (mIdx === curIdx);
      h +=
        '<div data-nip="' + escRapat_(String(u.nip || '')) + '" onmousedown="event.preventDefault(); selectOfficialPegawai(\'' + kind + '\', this.dataset.nip)" ' +
          'class="px-3 py-2 text-[11px] cursor-pointer transition border-b border-slate-700/50 ' +
          (isAct ? cfg.accentClass : cfg.hoverClass) + '">' +
          '<div class="font-bold">' + escRapat_(u.nama || '-') + '</div>' +
          '<div class="text-[9px] opacity-75">' + escRapat_(u.jabatan || '-') + '</div>' +
        '</div>';
    });
    drop.innerHTML = h;
    drop.classList.remove('hidden');
  }

  var OFFICIAL_HANDLER_MAP_ = {
    pejabatTtd: function (nip) { if (typeof window.handleRapatPejabatTtdChange === 'function') window.handleRapatPejabatTtdChange(nip); },
    pemimpin: function (nip) { if (typeof window.handleRapatPemimpinChange === 'function') window.handleRapatPemimpinChange(nip); },
    notulis: function (nip) { if (typeof window.handleRapatNotulisChange === 'function') window.handleRapatNotulisChange(nip); }
  };

  window.openOfficialSearchDrop = function (kind) {
    var cfg = OFFICIAL_SEARCH_CONFIG_[kind];
    if (!cfg) return;
    officialDropActiveMap[kind] = 0;
    var inp = document.getElementById(cfg.inputId);
    var rawVal = inp ? String(inp.value || '').trim() : '';
    var curNipEl = document.getElementById(cfg.nipId);
    var curNip = curNipEl ? String(curNipEl.value || '').trim() : '';
    var kw = rawVal;
    if (curNip && rawVal) {
      var matched = getUsersListRapat_().find(function (u) { return String(u.nip) === curNip; });
      if (matched) {
        var expectedDisp = matched.nama + (matched.jabatan ? ' (' + matched.jabatan + ')' : '');
        if (rawVal === expectedDisp) kw = '';
      }
    }
    renderOfficialSearchDropdown_(kind, kw);
  };

  window.filterOfficialSearchDrop = function (kind, val) {
    var cfg = OFFICIAL_SEARCH_CONFIG_[kind];
    if (!cfg) return;
    officialDropActiveMap[kind] = 0;
    if (String(val || '').trim() === '') {
      setElValRapat_(cfg.nipId, '');
      setElValRapat_(cfg.jabatanId, '');
      if (cfg.namaId) setElValRapat_(cfg.namaId, '');
    }
    renderOfficialSearchDropdown_(kind, val);
  };

  window.closeOfficialSearchDrop = function (kind) {
    var cfg = OFFICIAL_SEARCH_CONFIG_[kind];
    if (!cfg) return;
    setTimeout(function () {
      var drop = document.getElementById(cfg.dropId);
      if (drop) drop.classList.add('hidden');
    }, 160);
  };

  window.clearOfficialSearch = function (kind) {
    var cfg = OFFICIAL_SEARCH_CONFIG_[kind];
    if (!cfg) return;
    setElValRapat_(cfg.inputId, '');
    setElValRapat_(cfg.nipId, '');
    setElValRapat_(cfg.jabatanId, '');
    if (cfg.namaId) setElValRapat_(cfg.namaId, '');
    if (kind === 'pejabatTtd') syncNomorUndanganPreview();
    var inp = document.getElementById(cfg.inputId);
    if (inp && typeof inp.focus === 'function') inp.focus();
    officialDropActiveMap[kind] = 0;
    renderOfficialSearchDropdown_(kind, '');
  };

  window.selectOfficialPegawai = function (kind, nip) {
    var cfg = OFFICIAL_SEARCH_CONFIG_[kind];
    if (!cfg || !nip) return;
    var u = getUsersListRapat_().find(function (x) { return String(x.nip) === String(nip); });
    if (!u) return;
    var disp = u.nama + (u.jabatan ? ' (' + u.jabatan + ')' : '');
    setElValRapat_(cfg.inputId, disp);
    var clearBtn = document.getElementById(cfg.clearId);
    if (clearBtn) clearBtn.classList.remove('hidden');
    var drop = document.getElementById(cfg.dropId);
    if (drop) drop.classList.add('hidden');
    if (typeof OFFICIAL_HANDLER_MAP_[kind] === 'function') {
      OFFICIAL_HANDLER_MAP_[kind](u.nip);
    }
  };

  window.handleOfficialSearchKeydown = function (ev, kind) {
    var cfg = OFFICIAL_SEARCH_CONFIG_[kind];
    if (!ev || !cfg) return;
    var matches = officialDropMatchesMap[kind] || [];
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (matches.length > 0) {
        officialDropActiveMap[kind] = ((officialDropActiveMap[kind] || 0) + 1) % matches.length;
        var inpD = document.getElementById(cfg.inputId);
        renderOfficialSearchDropdown_(kind, inpD ? inpD.value : '');
      }
      return;
    }
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (matches.length > 0) {
        officialDropActiveMap[kind] = ((officialDropActiveMap[kind] || 0) - 1 + matches.length) % matches.length;
        var inpU = document.getElementById(cfg.inputId);
        renderOfficialSearchDropdown_(kind, inpU ? inpU.value : '');
      }
      return;
    }
    if (ev.key === 'Escape') {
      var drop = document.getElementById(cfg.dropId);
      if (drop) drop.classList.add('hidden');
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (matches.length > 0) {
        var idx = officialDropActiveMap[kind] || 0;
        var picked = matches[idx] || matches[0];
        if (picked && picked.nip) {
          window.selectOfficialPegawai(kind, picked.nip);
        }
      }
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
      container.innerHTML = '<div class="text-center py-4 text-slate-500 text-[11px]">Belum ada penerima undangan. Ketik nama pegawai atau tujuan di kotak pencarian atas lalu tekan Enter.</div>';
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

  function getFilteredTujuanPegawai_(kw) {
    var listPegawai = getSortedPegawaiRapat_();
    var selectedNips = {};
    tujuanUndanganList.forEach(function (t) {
      if (t && t.nip) selectedNips[String(t.nip)] = true;
    });
    var q = String(kw || '').toLowerCase().trim();
    return listPegawai.filter(function (u) {
      var nipStr = String(u.nip || '');
      if (nipStr && selectedNips[nipStr]) return false;
      if (!q) return true;
      return (u.nama && u.nama.toLowerCase().indexOf(q) !== -1) ||
        (u.jabatan && u.jabatan.toLowerCase().indexOf(q) !== -1) ||
        (nipStr && nipStr.toLowerCase().indexOf(q) !== -1);
    });
  }

  function renderTujuanSearchDropdown_(kw) {
    var drop = document.getElementById('rapatTujuanSearchDropdown');
    var clearBtn = document.getElementById('btnClearRapatTujuanInput');
    var cleanKw = String(kw || '').trim();
    if (clearBtn) {
      if (cleanKw) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }
    if (!drop) return;

    tujuanSearchMatches = getFilteredTujuanPegawai_(cleanKw);
    if (tujuanSearchActiveIdx >= tujuanSearchMatches.length) tujuanSearchActiveIdx = 0;
    if (tujuanSearchActiveIdx < 0) tujuanSearchActiveIdx = 0;

    if (tujuanSearchMatches.length === 0) {
      drop.innerHTML = cleanKw
        ? '<div class="px-3 py-2.5 text-[11px] text-slate-400 italic text-center">Pegawai tidak ditemukan. Tekan <b class="text-cyan-300">Enter</b> atau klik <b class="text-cyan-300">+ Tambah</b> untuk memasukkan "<span class="text-white font-semibold">' + escRapat_(cleanKw) + '</span>" sebagai tujuan kustom.</div>'
        : '<div class="px-3 py-2.5 text-[11px] text-slate-500 italic text-center">Semua pegawai sudah ada di daftar urutan atau data pegawai kosong.</div>';
      drop.classList.remove('hidden');
      return;
    }

    var sliced = tujuanSearchMatches.slice(0, 40);
    var checkedCount = sliced.filter(function (u) {
      return Boolean(u.nip && tujuanDropCheckedMap[String(u.nip)]);
    }).length;
    var totalChecked = Object.keys(tujuanDropCheckedMap).filter(function (k) {
      return Boolean(tujuanDropCheckedMap[k]);
    }).length;
    var allSlicedChecked = (sliced.length > 0 && checkedCount === sliced.length);

    var h =
      '<div class="sticky top-0 z-10 px-3 py-1.5 bg-slate-900/95 border-b border-slate-700 flex items-center justify-between gap-2 text-[10px]">' +
        '<span class="text-slate-400">' + sliced.length + ' kandidat ditemukan' +
          (totalChecked > 0 ? ' &bull; <b class="text-cyan-300">' + totalChecked + ' diceklis (Enter)</b>' : '') +
        '</span>' +
        '<button type="button" onmousedown="event.preventDefault(); event.stopPropagation(); toggleAllTujuanDropChecks();" ' +
          'class="px-2 py-0.5 rounded-md border font-bold transition ' +
          (allSlicedChecked
            ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
            : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300') + '">' +
          (allSlicedChecked ? 'Batal Ceklis Semua' : 'Pilih Semua Hasil') +
        '</button>' +
      '</div>';

    sliced.forEach(function (u, index) {
      var isActive = (index === tujuanSearchActiveIdx);
      var nipStr = String(u.nip || '');
      var isChecked = Boolean(nipStr && tujuanDropCheckedMap[nipStr]);
      h +=
        '<div class="flex items-center justify-between gap-2 px-3 py-2 text-[11px] border-b border-slate-700/50 transition ' +
          (isChecked
            ? 'bg-cyan-500/20 text-white'
            : (isActive ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-cyan-600/80 hover:text-white')) + '">' +
          '<div data-nip="' + escRapat_(nipStr) + '" onmousedown="event.preventDefault(); selectTujuanPegawai(this.dataset.nip)" ' +
            'class="flex-1 min-w-0 cursor-pointer">' +
            '<div class="font-bold truncate">' + escRapat_(u.nama || '-') + '</div>' +
            '<div class="text-[9px] opacity-75 truncate">' + escRapat_(u.jabatan || '-') + (nipStr ? ' | ' + escRapat_(nipStr) : '') + '</div>' +
          '</div>' +
          '<button type="button" data-nip="' + escRapat_(nipStr) + '" ' +
            'onmousedown="event.preventDefault(); event.stopPropagation(); toggleTujuanDropCheck(this.dataset.nip);" ' +
            'title="Ceklis untuk tambah banyak lalu tekan Enter" ' +
            'class="w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ' +
            (isChecked
              ? 'bg-cyan-400 border-cyan-300 text-slate-950 shadow-sm'
              : 'bg-slate-950/80 border-slate-600 text-transparent hover:border-cyan-400') + '">' +
            '<i class="fa-solid fa-check text-[10px]"></i>' +
          '</button>' +
        '</div>';
    });
    drop.innerHTML = h;
    drop.classList.remove('hidden');
  }

  window.openTujuanSearchDrop = function () {
    tujuanSearchActiveIdx = 0;
    var input = document.getElementById('rapatCustomTujuanInput');
    renderTujuanSearchDropdown_(input ? input.value : '');
  };

  window.filterTujuanSearchDrop = function (val) {
    tujuanSearchActiveIdx = 0;
    renderTujuanSearchDropdown_(val);
  };

  window.closeTujuanSearchDrop = function () {
    setTimeout(function () {
      var drop = document.getElementById('rapatTujuanSearchDropdown');
      if (drop) drop.classList.add('hidden');
    }, 160);
  };

  window.clearTujuanSearchInput = function () {
    tujuanDropCheckedMap = {};
    var input = document.getElementById('rapatCustomTujuanInput');
    if (input) {
      input.value = '';
      if (typeof input.focus === 'function') input.focus();
    }
    tujuanSearchActiveIdx = 0;
    renderTujuanSearchDropdown_('');
  };

  window.toggleTujuanDropCheck = function (nip) {
    var cleanNip = String(nip || '').trim();
    if (!cleanNip) return;
    tujuanDropCheckedMap[cleanNip] = !tujuanDropCheckedMap[cleanNip];
    if (!tujuanDropCheckedMap[cleanNip]) delete tujuanDropCheckedMap[cleanNip];
    var inp = document.getElementById('rapatCustomTujuanInput');
    renderTujuanSearchDropdown_(inp ? inp.value : '');
  };

  window.toggleAllTujuanDropChecks = function () {
    var sliced = (tujuanSearchMatches || []).slice(0, 40);
    if (sliced.length === 0) return;
    var allChecked = sliced.every(function (u) { return Boolean(u.nip && tujuanDropCheckedMap[String(u.nip)]); });
    sliced.forEach(function (u) {
      var n = String(u.nip || '').trim();
      if (!n) return;
      if (allChecked) delete tujuanDropCheckedMap[n];
      else tujuanDropCheckedMap[n] = true;
    });
    var inp = document.getElementById('rapatCustomTujuanInput');
    renderTujuanSearchDropdown_(inp ? inp.value : '');
  };

  window.commitCheckedTujuanPegawai = function () {
    var checkedSet = tujuanDropCheckedMap || {};
    var nips = Object.keys(checkedSet).filter(function (k) { return Boolean(checkedSet[k]); });
    if (nips.length === 0) return 0;

    var added = 0;
    var users = getSortedPegawaiRapat_();
    users.forEach(function (u) {
      var uNip = String(u.nip || '').trim();
      if (!uNip || !checkedSet[uNip]) return;
      var already = tujuanUndanganList.some(function (t) { return String(t.nip || '') === uNip; });
      if (!already) {
        tujuanUndanganList.push({
          label: u.nama + (u.jabatan ? ' (' + u.jabatan + ')' : ''),
          nip: uNip,
          nama: String(u.nama || ''),
          jabatan: String(u.jabatan || '')
        });
        added += 1;
      }
    });

    tujuanDropCheckedMap = {};
    renderTujuanUndanganOrdered_();
    var input = document.getElementById('rapatCustomTujuanInput');
    if (input) input.value = '';
    var drop = document.getElementById('rapatTujuanSearchDropdown');
    if (drop) drop.classList.add('hidden');
    var clearBtn = document.getElementById('btnClearRapatTujuanInput');
    if (clearBtn) clearBtn.classList.add('hidden');
    tujuanSearchActiveIdx = 0;
    tujuanSearchMatches = [];
    return added;
  };

  window.selectTujuanPegawai = function (nip) {
    var u = getUsersListRapat_().find(function (x) { return String(x.nip) === String(nip); });
    if (!u) return;
    var cleanNip = String(u.nip || '');
    if (cleanNip) delete tujuanDropCheckedMap[cleanNip];
    var already = tujuanUndanganList.some(function (t) { return String(t.nip || '') === cleanNip; });
    if (!already) {
      tujuanUndanganList.push({
        label: u.nama + (u.jabatan ? ' (' + u.jabatan + ')' : ''),
        nip: cleanNip,
        nama: String(u.nama || ''),
        jabatan: String(u.jabatan || '')
      });
      renderTujuanUndanganOrdered_();
    }
    var input = document.getElementById('rapatCustomTujuanInput');
    if (input) input.value = '';
    var drop = document.getElementById('rapatTujuanSearchDropdown');
    if (drop) drop.classList.add('hidden');
    var clearBtn = document.getElementById('btnClearRapatTujuanInput');
    if (clearBtn) clearBtn.classList.add('hidden');
    tujuanSearchActiveIdx = 0;
    tujuanSearchMatches = [];
  };

  window.handleTujuanSearchKeydown = function (ev) {
    if (!ev) return;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (tujuanSearchMatches.length > 0) {
        tujuanSearchActiveIdx = (tujuanSearchActiveIdx + 1) % tujuanSearchMatches.length;
        var inpDown = document.getElementById('rapatCustomTujuanInput');
        renderTujuanSearchDropdown_(inpDown ? inpDown.value : '');
      }
      return;
    }
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (tujuanSearchMatches.length > 0) {
        tujuanSearchActiveIdx = (tujuanSearchActiveIdx - 1 + tujuanSearchMatches.length) % tujuanSearchMatches.length;
        var inpUp = document.getElementById('rapatCustomTujuanInput');
        renderTujuanSearchDropdown_(inpUp ? inpUp.value : '');
      }
      return;
    }
    if (ev.key === 'Escape') {
      var dropEsc = document.getElementById('rapatTujuanSearchDropdown');
      if (dropEsc) dropEsc.classList.add('hidden');
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      var checkedCount = Object.keys(tujuanDropCheckedMap).filter(function (k) { return Boolean(tujuanDropCheckedMap[k]); }).length;
      if (checkedCount > 0) {
        window.commitCheckedTujuanPegawai();
        return;
      }
      var inp = document.getElementById('rapatCustomTujuanInput');
      var val = inp ? String(inp.value || '').trim() : '';
      if (!val) return;
      if (!tujuanSearchMatches || tujuanSearchMatches.length === 0) {
        tujuanSearchMatches = getFilteredTujuanPegawai_(val);
      }
      if (tujuanSearchMatches.length > 0) {
        var picked = tujuanSearchMatches[tujuanSearchActiveIdx] || tujuanSearchMatches[0];
        window.selectTujuanPegawai(picked.nip);
      } else {
        window.addCustomTujuanUndangan();
      }
    }
  };

  window.renderPesertaRapatCheckboxes = function () {};
  var renderPesertaRapatCheckboxes = window.renderPesertaRapatCheckboxes;
  window.filterPesertaListModal = function () {};

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
  };

  window.addCustomTujuanUndangan = function () {
    var checkedCount = Object.keys(tujuanDropCheckedMap).filter(function (k) { return Boolean(tujuanDropCheckedMap[k]); }).length;
    if (checkedCount > 0) {
      window.commitCheckedTujuanPegawai();
      return;
    }
    var input = document.getElementById('rapatCustomTujuanInput');
    if (!input) return;
    var val = input.value.trim();
    if (!val) return;
    tujuanUndanganList.push({ label: val, nip: '', nama: val, jabatan: 'Tujuan Kustom' });
    input.value = '';
    var drop = document.getElementById('rapatTujuanSearchDropdown');
    if (drop) drop.classList.add('hidden');
    var clearBtn = document.getElementById('btnClearRapatTujuanInput');
    if (clearBtn) clearBtn.classList.add('hidden');
    tujuanSearchMatches = [];
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
  };

  window.clearAllTujuanUndangan = function () {
    tujuanUndanganList = [];
    renderTujuanUndanganOrdered_();
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
  // NOTULA: SEARCHABLE PEMBICARA & MULTI-BARIS 5 KOLOM + INPUT TANGGAL + AUTO-TAB
  // ==========================================
  var BULAN_PARSE_MAP_RAPAT = {
    januari: '01', jan: '01',
    februari: '02', feb: '02',
    maret: '03', mar: '03',
    april: '04', apr: '04',
    mei: '05',
    juni: '06', jun: '06',
    juli: '07', jul: '07',
    agustus: '08', agu: '08', ags: '08', agt: '08',
    september: '09', sep: '09', sept: '09',
    oktober: '10', okt: '10',
    november: '11', nov: '11', nop: '11',
    desember: '12', des: '12'
  };

  function toIsoDateInput_(val) {
    var s = String(val == null ? '' : val).trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m = s.match(/^(\d{1,2})\s+([A-Za-z.]+)\s+(\d{4})$/);
    if (m) {
      var dd = String(parseInt(m[1], 10)).padStart(2, '0');
      var monKey = m[2].replace(/\./g, '').toLowerCase();
      var mm = BULAN_PARSE_MAP_RAPAT[monKey];
      if (mm) return m[3] + '-' + mm + '-' + dd;
    }
    return '';
  }

  function createEmptyPembahasanSubItem_(base) {
    var b = (base && typeof base === 'object') ? base : {};
    return {
      uraian: String(b.uraian || ''),
      tindak_lanjut: String(b.tindak_lanjut || ''),
      target: String(b.target || ''),
      penanggung_jawab: String(b.penanggung_jawab || ''),
      tanggal_penyelesaian: String(b.tanggal_penyelesaian || '')
    };
  }

  function syncPembahasanFlatFields_(row) {
    if (!row) return;
    var items = Array.isArray(row.items) && row.items.length > 0 ? row.items : [createEmptyPembahasanSubItem_(row)];
    row.items = items;

    var collectJoined = function (key, isDate) {
      var lines = [];
      items.forEach(function (sub) {
        var v = String((sub && sub[key]) || '').trim();
        if (!v) return;
        if (isDate) {
          lines.push(v);
        } else if (items.length === 1) {
          lines.push(v);
        } else {
          v.split(/\r?\n/).forEach(function (ln) {
            var cleanLn = String(ln || '').trim().replace(/^[0-9]+[.)]\s*/, '').trim();
            if (cleanLn) lines.push(cleanLn);
          });
        }
      });
      if (items.length === 1) return lines[0] || '';
      if (lines.length === 0) return '';
      if (lines.length === 1) return lines[0];
      return lines.map(function (ln, i) { return (i + 1) + '. ' + ln; }).join('\n');
    };

    row.uraian = collectJoined('uraian', false);
    row.tindak_lanjut = collectJoined('tindak_lanjut', false);
    row.target = collectJoined('target', true);
    row.penanggung_jawab = collectJoined('penanggung_jawab', false);
    row.tanggal_penyelesaian = collectJoined('tanggal_penyelesaian', true);
  }

  function normalizePembahasanRow_(raw) {
    var base = (raw && typeof raw === 'object') ? raw : {};
    var subItems = [];
    if (Array.isArray(base.items) && base.items.length > 0) {
      subItems = base.items.map(function (it) { return createEmptyPembahasanSubItem_(it); });
    } else {
      subItems = [createEmptyPembahasanSubItem_(base)];
    }
    var out = {
      pembicara_nama: String(base.pembicara_nama || ''),
      pembicara_nip: String(base.pembicara_nip || ''),
      pembicara_jabatan: String(base.pembicara_jabatan || ''),
      items: subItems
    };
    syncPembahasanFlatFields_(out);
    return out;
  }

  function getFilteredSpeakerPegawai_(kw) {
    var sortedUsers = getSortedPegawaiRapat_();
    var q = String(kw || '').toLowerCase().trim();
    if (!q) return sortedUsers;
    return sortedUsers.filter(function (u) {
      return (u.nama && u.nama.toLowerCase().indexOf(q) !== -1) ||
        (u.jabatan && u.jabatan.toLowerCase().indexOf(q) !== -1) ||
        (u.nip && String(u.nip).toLowerCase().indexOf(q) !== -1);
    });
  }

  function renderPembahasanSpeakerDropdown_(idx, kw) {
    var drop = document.getElementById('rapatSpeakerDrop_' + idx);
    var clearBtn = document.getElementById('btnClearSpeaker_' + idx);
    if (clearBtn) {
      if (String(kw || '').trim()) clearBtn.classList.remove('hidden');
      else clearBtn.classList.add('hidden');
    }
    if (!drop) return;

    var matches = getFilteredSpeakerPegawai_(kw);
    speakerDropMatchesMap[idx] = matches;
    if (typeof speakerDropActiveMap[idx] !== 'number' || speakerDropActiveMap[idx] >= matches.length || speakerDropActiveMap[idx] < 0) {
      speakerDropActiveMap[idx] = 0;
    }

    if (matches.length === 0) {
      drop.innerHTML = '<div class="px-3 py-2 text-[11px] text-slate-400 italic text-center">Tidak ditemukan di daftar pegawai. Teks tetap tersimpan sebagai nama pembicara kustom.</div>';
      drop.classList.remove('hidden');
      return;
    }

    var activeIdx = speakerDropActiveMap[idx];
    var h = '';
    matches.slice(0, 35).forEach(function (u, mIdx) {
      var isAct = (mIdx === activeIdx);
      h +=
        '<div data-nip="' + escRapat_(String(u.nip || '')) + '" onmousedown="event.preventDefault(); selectPembahasanSpeaker(' + idx + ', this.dataset.nip)" ' +
          'class="px-3 py-2 text-[11px] cursor-pointer transition border-b border-slate-700/50 ' +
          (isAct ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-emerald-600 hover:text-white') + '">' +
          '<div class="font-bold">' + escRapat_(u.nama || '-') + '</div>' +
          '<div class="text-[9px] opacity-75">' + escRapat_(u.jabatan || '-') + '</div>' +
        '</div>';
    });
    drop.innerHTML = h;
    drop.classList.remove('hidden');
  }

  function renderPembahasanRows_() {
    var container = document.getElementById('rapatPembahasanListContainer');
    var countBadge = document.getElementById('rapatCountPembicara');
    if (countBadge) countBadge.innerText = String(pembahasanRowsList.length);
    if (!container) return;

    if (pembahasanRowsList.length === 0) {
      container.innerHTML =
        '<div class="p-6 text-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 text-slate-400 text-xs">' +
          'Belum ada catatan pembicara. Klik <b>+ Tambah Pembicara</b> di kanan atas header modal untuk mulai mengisi 5 kolom Notula.' +
        '</div>';
      return;
    }

    var html = '';
    pembahasanRowsList.forEach(function (row, idx) {
      if (!row || !Array.isArray(row.items) || row.items.length === 0) {
        row = normalizePembahasanRow_(row);
        pembahasanRowsList[idx] = row;
      }
      var items = row.items;
      var speakerVal = String(row.pembicara_nama || '');

      var subRowsHtml = '';
      items.forEach(function (sub, subIdx) {
        var isoTarget = toIsoDateInput_(sub.target);
        var isoTanggal = toIsoDateInput_(sub.tanggal_penyelesaian);
        var isLastSub = (subIdx === items.length - 1);
        var legacyTargetHint = (sub.target && !isoTarget)
          ? '<div class="text-[9px] text-amber-400/80 mt-1 truncate" title="' + escRapat_(sub.target) + '">Teks lama: ' + escRapat_(sub.target) + '</div>'
          : '';
        var legacyTglHint = (sub.tanggal_penyelesaian && !isoTanggal)
          ? '<div class="text-[9px] text-amber-400/80 mt-1 truncate" title="' + escRapat_(sub.tanggal_penyelesaian) + '">Teks lama: ' + escRapat_(sub.tanggal_penyelesaian) + '</div>'
          : '';

        subRowsHtml +=
          '<div class="grid grid-cols-1 xl:grid-cols-[2.4fr_2fr_148px_1.2fr_148px_36px] gap-2.5 items-start' + (subIdx > 0 ? ' pt-2 border-t border-slate-800/60' : '') + '">' +
            '<div>' +
              '<label class="xl:hidden block text-[9px] font-bold text-slate-400 uppercase mb-1">a. Uraian Pembahasan / Laporan</label>' +
              '<textarea id="rapatPembahasanUraian_' + idx + '_' + subIdx + '" rows="3" oninput="updatePembahasanSubField(' + idx + ', ' + subIdx + ', \'uraian\', this.value)" placeholder="Uraian pembahasan / laporan..." class="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-[11px] focus:ring-1 focus:ring-emerald-500 outline-none custom-scrollbar leading-relaxed">' + escRapat_(sub.uraian || '') + '</textarea>' +
            '</div>' +
            '<div>' +
              '<label class="xl:hidden block text-[9px] font-bold text-slate-400 uppercase mb-1">b. Tindak Lanjut / Tanggapan / Masukan</label>' +
              '<textarea id="rapatPembahasanTindak_' + idx + '_' + subIdx + '" rows="3" oninput="updatePembahasanSubField(' + idx + ', ' + subIdx + ', \'tindak_lanjut\', this.value)" placeholder="Tindak lanjut / tanggapan..." class="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-[11px] focus:ring-1 focus:ring-emerald-500 outline-none custom-scrollbar leading-relaxed">' + escRapat_(sub.tindak_lanjut || '') + '</textarea>' +
            '</div>' +
            '<div>' +
              '<label class="xl:hidden block text-[9px] font-bold text-slate-400 uppercase mb-1">c. Tgl. Target</label>' +
              '<input type="date" id="rapatPembahasanTarget_' + idx + '_' + subIdx + '" value="' + escRapat_(isoTarget) + '" onchange="updatePembahasanSubField(' + idx + ', ' + subIdx + ', \'target\', this.value)" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-[11px] focus:ring-1 focus:ring-emerald-500 outline-none">' +
              legacyTargetHint +
            '</div>' +
            '<div>' +
              '<label class="xl:hidden block text-[9px] font-bold text-slate-400 uppercase mb-1">d. Penanggung Jawab</label>' +
              '<textarea id="rapatPembahasanPj_' + idx + '_' + subIdx + '" rows="3" oninput="updatePembahasanSubField(' + idx + ', ' + subIdx + ', \'penanggung_jawab\', this.value)" placeholder="Pihak / jabatan PJ..." class="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-[11px] focus:ring-1 focus:ring-emerald-500 outline-none custom-scrollbar leading-relaxed">' + escRapat_(sub.penanggung_jawab || '') + '</textarea>' +
            '</div>' +
            '<div>' +
              '<label class="xl:hidden block text-[9px] font-bold text-slate-400 uppercase mb-1">e. Tgl. Penyelesaian</label>' +
              '<input type="date" id="rapatPembahasanTanggal_' + idx + '_' + subIdx + '" value="' + escRapat_(isoTanggal) + '" onchange="updatePembahasanSubField(' + idx + ', ' + subIdx + ', \'tanggal_penyelesaian\', this.value)" class="w-full px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-[11px] focus:ring-1 focus:ring-emerald-500 outline-none">' +
              legacyTglHint +
            '</div>' +
            '<div class="flex flex-col items-center justify-start gap-1.5 pt-0.5">' +
              (isLastSub
                ? '<button type="button" tabindex="-1" onclick="addPembahasanSubRow(' + idx + ', true)" title="Tambah baris baru untuk pembicara ini" class="w-7 h-7 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-md shadow-indigo-500/40 transition-all hover:scale-110 group"><i class="fa-solid fa-plus text-[11px] group-hover:rotate-90 transition-transform duration-300"></i></button>'
                : '') +
              '<button type="button" tabindex="-1" onclick="removePembahasanSubRow(' + idx + ', ' + subIdx + ')" title="' + (items.length > 1 ? 'Hapus baris ini' : 'Kosongkan baris ini') + '" class="w-7 h-7 flex items-center justify-center bg-slate-950 border border-slate-800 hover:bg-rose-500/20 text-slate-500 hover:border-rose-500/50 hover:text-rose-400 rounded-lg transition-all mx-auto"><i class="fa-solid fa-trash text-[10px]"></i></button>' +
            '</div>' +
          '</div>';
      });

      html +=
        '<div class="relative p-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5 shadow-sm">' +
          '<div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">' +
            '<div class="flex items-center gap-2 flex-1 min-w-0">' +
              '<span class="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center justify-center shrink-0">' + (idx + 1) + '</span>' +
              '<div class="relative flex-1 min-w-[220px]">' +
                '<div class="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none">' +
                  '<i class="fa-solid fa-magnifying-glass text-slate-500 text-[11px]"></i>' +
                '</div>' +
                '<input type="text" id="rapatSpeakerSearch_' + idx + '" value="' + escRapat_(speakerVal) + '" autocomplete="off" ' +
                  'onfocus="openPembahasanSpeakerDrop(' + idx + ')" ' +
                  'oninput="filterPembahasanSpeakerDrop(' + idx + ', this.value)" ' +
                  'onblur="closePembahasanSpeakerDrop(' + idx + ')" ' +
                  'onkeydown="handlePembahasanSpeakerKeydown(event, ' + idx + ')" ' +
                  'placeholder="Ketik nama / jabatan pembicara lalu tekan Enter..." ' +
                  'class="w-full pl-8 pr-8 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-white font-bold text-xs focus:ring-1 focus:ring-emerald-500 outline-none">' +
                '<button type="button" tabindex="-1" id="btnClearSpeaker_' + idx + '" onmousedown="event.preventDefault(); clearPembahasanSpeaker(' + idx + ')" ' +
                  'class="' + (speakerVal ? '' : 'hidden ') + 'absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-rose-400 w-5 h-5 flex items-center justify-center">' +
                  '<i class="fa-solid fa-xmark text-[11px]"></i>' +
                '</button>' +
                '<div id="rapatSpeakerDrop_' + idx + '" class="hidden absolute z-50 left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-xl overflow-hidden max-h-48 overflow-y-auto shadow-[0_20px_50px_rgba(0,0,0,0.8)]"></div>' +
              '</div>' +
            '</div>' +
            '<div class="flex items-center gap-1 shrink-0">' +
              '<button type="button" tabindex="-1" onclick="movePembahasanRow(' + idx + ', -1)" ' + (idx === 0 ? 'disabled' : '') + ' title="Geser naik" class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 flex items-center justify-center"><i class="fa-solid fa-arrow-up text-[10px]"></i></button>' +
              '<button type="button" tabindex="-1" onclick="movePembahasanRow(' + idx + ', 1)" ' + (idx === pembahasanRowsList.length - 1 ? 'disabled' : '') + ' title="Geser turun" class="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 flex items-center justify-center"><i class="fa-solid fa-arrow-down text-[10px]"></i></button>' +
              '<button type="button" tabindex="-1" onclick="removePembahasanRow(' + idx + ')" title="Hapus seluruh blok pembicara ini" class="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/20 flex items-center justify-center"><i class="fa-solid fa-trash text-[10px]"></i></button>' +
            '</div>' +
          '</div>' +

          '<div class="space-y-2">' + subRowsHtml + '</div>' +
          '<span tabindex="0" data-rapat-tab-sentinel="' + idx + '" onfocus="handlePembahasanTabSentinel(event, ' + idx + ')" class="block w-0 h-0 overflow-hidden opacity-0 pointer-events-none"></span>' +
        '</div>';
    });

    container.innerHTML = html;
  }

  window.openPembahasanSpeakerDrop = function (idx) {
    speakerDropActiveMap[idx] = 0;
    var inp = document.getElementById('rapatSpeakerSearch_' + idx);
    renderPembahasanSpeakerDropdown_(idx, inp ? inp.value : '');
  };

  window.filterPembahasanSpeakerDrop = function (idx, val) {
    speakerDropActiveMap[idx] = 0;
    if (pembahasanRowsList[idx]) {
      pembahasanRowsList[idx].pembicara_nama = val;
      pembahasanRowsList[idx].pembicara_nip = '';
      pembahasanRowsList[idx].pembicara_jabatan = '';
    }
    renderPembahasanSpeakerDropdown_(idx, val);
  };

  window.closePembahasanSpeakerDrop = function (idx) {
    setTimeout(function () {
      var drop = document.getElementById('rapatSpeakerDrop_' + idx);
      if (drop) drop.classList.add('hidden');
    }, 160);
  };

  window.clearPembahasanSpeaker = function (idx) {
    if (pembahasanRowsList[idx]) {
      pembahasanRowsList[idx].pembicara_nama = '';
      pembahasanRowsList[idx].pembicara_nip = '';
      pembahasanRowsList[idx].pembicara_jabatan = '';
    }
    var inp = document.getElementById('rapatSpeakerSearch_' + idx);
    if (inp) {
      inp.value = '';
      if (typeof inp.focus === 'function') inp.focus();
    }
    speakerDropActiveMap[idx] = 0;
    renderPembahasanSpeakerDropdown_(idx, '');
  };

  window.selectPembahasanSpeaker = function (idx, nip) {
    if (!pembahasanRowsList[idx] || !nip) return;
    var u = getUsersListRapat_().find(function (x) { return String(x.nip) === String(nip); });
    if (!u) return;
    var displayNama = u.nama + (u.jabatan ? ' (' + u.jabatan + ')' : '');
    pembahasanRowsList[idx].pembicara_nip = String(u.nip || '');
    pembahasanRowsList[idx].pembicara_jabatan = String(u.jabatan || '');
    pembahasanRowsList[idx].pembicara_nama = displayNama;

    var inp = document.getElementById('rapatSpeakerSearch_' + idx);
    if (inp) inp.value = displayNama;
    var clearBtn = document.getElementById('btnClearSpeaker_' + idx);
    if (clearBtn) clearBtn.classList.remove('hidden');
    var drop = document.getElementById('rapatSpeakerDrop_' + idx);
    if (drop) drop.classList.add('hidden');

    var firstUraian = document.getElementById('rapatPembahasanUraian_' + idx + '_0');
    if (firstUraian && typeof firstUraian.focus === 'function') firstUraian.focus();
  };
  window.pickPembahasanSpeaker = window.selectPembahasanSpeaker;

  window.handlePembahasanSpeakerKeydown = function (ev, idx) {
    if (!ev) return;
    var matches = speakerDropMatchesMap[idx] || [];
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (matches.length > 0) {
        speakerDropActiveMap[idx] = ((speakerDropActiveMap[idx] || 0) + 1) % matches.length;
        var inpD = document.getElementById('rapatSpeakerSearch_' + idx);
        renderPembahasanSpeakerDropdown_(idx, inpD ? inpD.value : '');
      }
      return;
    }
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (matches.length > 0) {
        speakerDropActiveMap[idx] = ((speakerDropActiveMap[idx] || 0) - 1 + matches.length) % matches.length;
        var inpU = document.getElementById('rapatSpeakerSearch_' + idx);
        renderPembahasanSpeakerDropdown_(idx, inpU ? inpU.value : '');
      }
      return;
    }
    if (ev.key === 'Escape') {
      var drop = document.getElementById('rapatSpeakerDrop_' + idx);
      if (drop) drop.classList.add('hidden');
      return;
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      var inp = document.getElementById('rapatSpeakerSearch_' + idx);
      var kw = inp ? String(inp.value || '').trim() : '';
      if (!matches || matches.length === 0) matches = getFilteredSpeakerPegawai_(kw);
      if (matches.length > 0 && kw) {
        var topMatch = matches[speakerDropActiveMap[idx] || 0] || matches[0];
        window.selectPembahasanSpeaker(idx, topMatch.nip);
      } else {
        var dropEnt = document.getElementById('rapatSpeakerDrop_' + idx);
        if (dropEnt) dropEnt.classList.add('hidden');
      }
    }
  };

  function keepRapatModalAnchored_(elToReveal) {
    var box = document.getElementById('modalAgendaRapatBox');
    if (box) box.scrollTop = 0;
    if (elToReveal && typeof elToReveal.scrollIntoView === 'function') {
      try { elToReveal.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {}
    }
  }

  window.addPembahasanSubRow = function (idx, shouldFocus) {
    if (!pembahasanRowsList[idx]) return;
    if (!Array.isArray(pembahasanRowsList[idx].items)) {
      pembahasanRowsList[idx] = normalizePembahasanRow_(pembahasanRowsList[idx]);
    }
    pembahasanRowsList[idx].items.push(createEmptyPembahasanSubItem_());
    var newSubIdx = pembahasanRowsList[idx].items.length - 1;
    syncPembahasanFlatFields_(pembahasanRowsList[idx]);
    renderPembahasanRows_();
    if (shouldFocus) {
      var targetEl = document.getElementById('rapatPembahasanUraian_' + idx + '_' + newSubIdx);
      if (targetEl && typeof targetEl.focus === 'function') targetEl.focus();
      keepRapatModalAnchored_(targetEl);
    }
  };

  window.removePembahasanSubRow = function (idx, subIdx) {
    if (!pembahasanRowsList[idx]) return;
    if (!Array.isArray(pembahasanRowsList[idx].items)) {
      pembahasanRowsList[idx] = normalizePembahasanRow_(pembahasanRowsList[idx]);
    }
    if (pembahasanRowsList[idx].items.length > 1) {
      pembahasanRowsList[idx].items.splice(subIdx, 1);
    } else {
      pembahasanRowsList[idx].items[0] = createEmptyPembahasanSubItem_();
    }
    syncPembahasanFlatFields_(pembahasanRowsList[idx]);
    renderPembahasanRows_();
  };

  window.updatePembahasanSubField = function (idx, subIdx, field, val) {
    if (!pembahasanRowsList[idx]) return;
    if (!Array.isArray(pembahasanRowsList[idx].items)) {
      pembahasanRowsList[idx] = normalizePembahasanRow_(pembahasanRowsList[idx]);
    }
    if (pembahasanRowsList[idx].items[subIdx]) {
      pembahasanRowsList[idx].items[subIdx][field] = val;
      syncPembahasanFlatFields_(pembahasanRowsList[idx]);
    }
  };

  window.handlePembahasanTabSentinel = function (ev, idx) {
    if (rapatLastKeyShiftTab) {
      rapatLastKeyShiftTab = false;
      var row = pembahasanRowsList[idx];
      var lastSubIdx = (row && Array.isArray(row.items) && row.items.length > 0) ? (row.items.length - 1) : 0;
      var lastDateEl = document.getElementById('rapatPembahasanTanggal_' + idx + '_' + lastSubIdx);
      if (lastDateEl && typeof lastDateEl.focus === 'function') lastDateEl.focus();
      keepRapatModalAnchored_(lastDateEl);
      return;
    }
    window.addPembahasanSubRow(idx, true);
  };

  window.addPembahasanRow = function (initialObj, shouldFocus) {
    pembahasanRowsList.push(normalizePembahasanRow_(initialObj));
    renderPembahasanRows_();
    if (shouldFocus) {
      var newIdx = pembahasanRowsList.length - 1;
      var spkInp = document.getElementById('rapatSpeakerSearch_' + newIdx);
      if (spkInp && typeof spkInp.focus === 'function') spkInp.focus();
      keepRapatModalAnchored_(spkInp);
    }
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

  window.updatePembahasanField = function (idx, field, val) {
    if (!pembahasanRowsList[idx]) return;
    if (field === 'pembicara_nama' || field === 'pembicara_nip' || field === 'pembicara_jabatan') {
      pembahasanRowsList[idx][field] = val;
      return;
    }
    window.updatePembahasanSubField(idx, 0, field, val);
  };

  // ==========================================
  // UPLOAD & KOMPRESI FOTO RAPAT KE GOOGLE DRIVE (TAHAP 139)
  // ==========================================
  function compressRapatImageFile_(file) {
    return new Promise(function (resolve, reject) {
      if (!file || typeof FileReader === 'undefined') {
        return reject(new Error('Browser tidak mendukung pembacaan berkas gambar.'));
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Gagal membaca berkas gambar.')); };
      reader.onload = function (ev) {
        var srcUrl = ev && ev.target ? ev.target.result : '';
        if (typeof Image === 'undefined' || !document.createElement) {
          return resolve({ dataUri: srcUrl, mimeType: file.type || 'image/jpeg' });
        }
        var img = new Image();
        img.onerror = function () { reject(new Error('Format gambar tidak valid atau rusak.')); };
        img.onload = function () {
          var maxW = 960;
          var maxH = 720;
          var w = img.width || 800;
          var h = img.height || 600;
          var ratio = Math.min(1, maxW / w, maxH / h);
          var tw = Math.max(1, Math.round(w * ratio));
          var th = Math.max(1, Math.round(h * ratio));
          var canvas = document.createElement('canvas');
          canvas.width = tw;
          canvas.height = th;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, tw, th);
          ctx.drawImage(img, 0, 0, tw, th);
          var outUri = canvas.toDataURL('image/jpeg', 0.72);
          resolve({ dataUri: outUri, mimeType: 'image/jpeg' });
        };
        img.src = srcUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderFotoRapatPreview_() {
    var badge = document.getElementById('rapatFotoCountBadge');
    if (badge) badge.innerText = fotoRapatList.length + ' / 8 Foto';

    var container = document.getElementById('rapatFotoPreviewContainer');
    if (!container) return;

    if (fotoRapatList.length === 0) {
      container.innerHTML =
        '<div onclick="var fi=document.getElementById(\'rapatInputFotoFiles\'); if(fi) fi.click();" ' +
          'class="sm:col-span-2 p-5 rounded-xl border border-dashed border-slate-700 hover:border-cyan-500/50 bg-slate-900/40 hover:bg-cyan-500/5 text-center text-[11px] text-slate-400 cursor-pointer transition space-y-1">' +
          '<i class="fa-solid fa-cloud-arrow-up text-lg text-cyan-400/80 block mb-1"></i>' +
          '<div>Seret &amp; lepas foto rapat di sini, atau klik untuk memilih (maks. 8 foto).</div>' +
        '</div>';
      return;
    }

    var html = '';
    fotoRapatList.forEach(function (item, idx) {
      var previewSrc = item.preview_uri || item.thumb_data_uri || '';
      var safeSrc = (previewSrc && String(previewSrc).indexOf('data:image/') === 0) ? previewSrc : '';
      var statusBadge = item.uploading
        ? '<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold">Mengunggah...</span>'
        : (item.file_id
          ? '<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold">Drive Aman</span>'
          : '<span class="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[9px] font-bold">Lokal Terkompresi</span>');

      html +=
        '<div class="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">' +
          '<div class="relative aspect-video rounded-lg overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">' +
            (safeSrc
              ? '<img id="rapatFotoThumbImg_' + idx + '" src="' + safeSrc + '" alt="Foto Rapat ' + (idx + 1) + '" class="w-full h-full object-cover">'
              : '<div id="rapatFotoThumbPlaceholder_' + idx + '" class="text-[10px] text-slate-500 flex flex-col items-center gap-1"><i class="fa-solid fa-image text-base"></i><span>Memuat dari Drive...</span></div>') +
            '<div class="absolute top-1.5 left-1.5">' + statusBadge + '</div>' +
            '<button type="button" onclick="removeFotoRapatItem(' + idx + ')" class="absolute top-1.5 right-1.5 w-6 h-6 rounded-lg bg-black/70 hover:bg-rose-600 text-white flex items-center justify-center transition"><i class="fa-solid fa-trash text-[10px]"></i></button>' +
          '</div>' +
          '<input type="text" value="' + escRapat_(item.caption || '') + '" oninput="updateFotoRapatCaption(' + idx + ', this.value)" ' +
            'placeholder="Keterangan foto #' + (idx + 1) + ' (opsional)..." ' +
            'class="w-full px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-[10px] focus:ring-1 focus:ring-cyan-500 outline-none">' +
        '</div>';
    });

    container.innerHTML = html;

    // Lazy resolve thumbnail dari Drive untuk foto tersimpan yang belum punya preview lokal
    fotoRapatList.forEach(function (item, idx) {
      if (!item.preview_uri && !item.thumb_data_uri && (item.file_id || item.url) &&
          window.EofficeDataService && typeof window.EofficeDataService.resolveFotoRapatDataUri === 'function') {
        window.EofficeDataService.resolveFotoRapatDataUri(item).then(function (uri) {
          if (uri && fotoRapatList[idx]) {
            fotoRapatList[idx].preview_uri = uri;
            renderFotoRapatPreview_();
          }
        }).catch(function () {});
      }
    });
  }

  function getRapatDriveFolderContext_() {
    return {
      id_rapat: ((document.getElementById('rapatFieldIdRapat') || {}).value || '').trim() || 'RPT',
      agenda: ((document.getElementById('rapatFieldAgenda') || {}).value || '').trim(),
      hari_tanggal: ((document.getElementById('rapatFieldHariTanggal') || {}).value || '').trim(),
      tgl_surat: ((document.getElementById('rapatFieldTglSuratIso') || {}).value || '').trim(),
      tgl_rapat_iso: ((document.getElementById('rapatFieldTglRapatIso') || {}).value || '').trim()
    };
  }

  function setRapatDropZoneActive_(zoneId, isActive, accent) {
    var zone = document.getElementById(zoneId);
    if (!zone || !zone.classList) return;
    var activeCls = (accent === 'indigo')
      ? ['border-indigo-400', 'bg-indigo-500/15', 'ring-2', 'ring-indigo-400/30']
      : ['border-cyan-400', 'bg-cyan-500/10', 'ring-2', 'ring-cyan-400/30'];
    activeCls.forEach(function (cls) {
      if (isActive) zone.classList.add(cls);
      else zone.classList.remove(cls);
    });
  }

  window.handleRapatDropDragOver = function (ev, kind) {
    if (ev) {
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
    }
    if (kind === 'audio') setRapatDropZoneActive_('rapatAudioDropZone', true, 'indigo');
    else setRapatDropZoneActive_('rapatFotoDropZone', true, 'cyan');
  };

  window.handleRapatDropDragLeave = function (ev, kind) {
    if (ev) {
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
    }
    var zoneId = (kind === 'audio') ? 'rapatAudioDropZone' : 'rapatFotoDropZone';
    var zone = document.getElementById(zoneId);
    if (zone && ev && ev.relatedTarget && typeof zone.contains === 'function' && zone.contains(ev.relatedTarget)) {
      return;
    }
    setRapatDropZoneActive_(zoneId, false, kind === 'audio' ? 'indigo' : 'cyan');
  };

  window.handleRapatFotoDrop = function (ev) {
    if (ev) {
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
    }
    setRapatDropZoneActive_('rapatFotoDropZone', false, 'cyan');
    var rawFiles = ev && ev.dataTransfer && ev.dataTransfer.files ? Array.prototype.slice.call(ev.dataTransfer.files) : [];
    var imageFiles = rawFiles.filter(function (f) {
      return f && (/^image\/(jpeg|jpg|png|webp)$/i.test(f.type || '') || /\.(jpe?g|png|webp)$/i.test(f.name || ''));
    });
    if (imageFiles.length === 0) {
      if (rawFiles.length > 0 && typeof showNotify === 'function') {
        showNotify('Format Foto Tidak Cocok', 'Seret file gambar JPG, PNG, atau WEBP ke kotak Foto Rapat.', 'warning');
      }
      return;
    }
    window.handleRapatFotoSelect(imageFiles);
  };

  window.handleRapatAudioDrop = function (ev) {
    if (ev) {
      if (typeof ev.preventDefault === 'function') ev.preventDefault();
      if (typeof ev.stopPropagation === 'function') ev.stopPropagation();
    }
    setRapatDropZoneActive_('rapatAudioDropZone', false, 'indigo');
    var rawFiles = ev && ev.dataTransfer && ev.dataTransfer.files ? Array.prototype.slice.call(ev.dataTransfer.files) : [];
    var audioFile = rawFiles.find(function (f) {
      return f && (/^audio\//i.test(f.type || '') || f.type === 'video/webm' || /\.(mp3|m4a|wav|ogg|webm|aac|flac)$/i.test(f.name || ''));
    });
    if (!audioFile) {
      if (rawFiles.length > 0 && typeof showNotify === 'function') {
        showNotify('Format Audio Tidak Cocok', 'Seret file audio .mp3, .m4a, .wav, .ogg, .webm, .aac, atau .flac.', 'warning');
      }
      return;
    }
    window.handleRapatAudioSelect([audioFile]);
  };

  window.handleRapatFotoSelect = async function (files) {
    if (!files || files.length === 0) return;
    var remain = Math.max(0, 8 - fotoRapatList.length);
    if (remain <= 0) {
      if (typeof showNotify === 'function') showNotify('Batas Foto', 'Maksimal 8 foto dokumentasi per rapat.', 'warning');
      return;
    }

    var arrFiles = Array.prototype.slice.call(files, 0, remain);
    var currentUser = (window.vueState && window.vueState.user) ? window.vueState.user : (typeof state !== 'undefined' ? state.user : null);
    var adminNip = (currentUser && currentUser.nip) || localStorage.getItem('transkep_active_nip') || '';
    var token = localStorage.getItem('transkep_session_token') || '';
    var folderCtx = getRapatDriveFolderContext_();

    for (var i = 0; i < arrFiles.length; i++) {
      var f = arrFiles[i];
      if (!f || (!/^image\/(jpeg|jpg|png|webp)$/i.test(f.type || '') && !/\.(jpe?g|png|webp)$/i.test(f.name || ''))) continue;
      try {
        var compressed = await compressRapatImageFile_(f);
        var entry = {
          file_id: '',
          url: '',
          caption: '',
          file_name: f.name || ('foto_rapat_' + (fotoRapatList.length + 1) + '.jpg'),
          preview_uri: compressed.dataUri,
          thumb_data_uri: compressed.dataUri,
          uploading: true
        };
        var pushedIdx = fotoRapatList.push(entry) - 1;
        renderFotoRapatPreview_();

        if (window.EofficeDataService && typeof window.EofficeDataService.uploadFotoRapatToDrive === 'function') {
          var upRes = await window.EofficeDataService.uploadFotoRapatToDrive({
            id_rapat: folderCtx.id_rapat,
            agenda: folderCtx.agenda,
            hari_tanggal: folderCtx.hari_tanggal,
            tgl_surat: folderCtx.tgl_surat,
            tgl_rapat_iso: folderCtx.tgl_rapat_iso,
            file_data: compressed.dataUri,
            file_name: entry.file_name,
            mime_type: compressed.mimeType || 'image/jpeg'
          }, adminNip, token);

          if (fotoRapatList[pushedIdx]) {
            fotoRapatList[pushedIdx].uploading = false;
            if (upRes && upRes.status === 'success' && upRes.data) {
              fotoRapatList[pushedIdx].file_id = String(upRes.data.file_id || '');
              fotoRapatList[pushedIdx].url = String(upRes.data.url || '');
              fotoRapatList[pushedIdx].thumb_data_uri = '';
            }
            renderFotoRapatPreview_();
          }
        } else {
          entry.uploading = false;
          renderFotoRapatPreview_();
        }
      } catch (err) {
        console.warn('Gagal memproses foto rapat:', err);
      }
    }
  };

  window.updateFotoRapatCaption = function (idx, val) {
    if (fotoRapatList[idx]) fotoRapatList[idx].caption = String(val || '').slice(0, 200);
  };

  window.removeFotoRapatItem = function (idx) {
    fotoRapatList.splice(idx, 1);
    renderFotoRapatPreview_();
  };

  window.clearAllFotoRapat = function () {
    fotoRapatList = [];
    renderFotoRapatPreview_();
  };

  // ==========================================
  // AI NOTULIS OTOMATIS: AUDIO + TRANSKRIP -> 5 KOLOM NOTULA (TAHAP 140)
  // ==========================================
  function formatBytesRapat_(bytes) {
    var b = Number(bytes || 0);
    if (!b || b < 1024) return (b || 0) + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function encodeWavMono16k_(audioBuffer) {
    var srcData = audioBuffer.getChannelData(0);
    var srcRate = audioBuffer.sampleRate || 44100;
    var targetRate = 16000;
    var ratio = srcRate / targetRate;
    var outLen = Math.max(1, Math.floor(srcData.length / ratio));
    var buf = new ArrayBuffer(44 + outLen * 2);
    var view = new DataView(buf);
    function writeStr(off, s) {
      for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    }
    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + outLen * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, outLen * 2, true);
    var offset = 44;
    for (var i = 0; i < outLen; i++) {
      var sample = Math.max(-1, Math.min(1, srcData[Math.min(srcData.length - 1, Math.floor(i * ratio))]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  function blobToDataUri_(blob) {
    return new Promise(function (resolve, reject) {
      if (typeof FileReader === 'undefined') {
        return reject(new Error('FileReader tidak tersedia.'));
      }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Gagal membaca berkas audio.')); };
      reader.onload = function (ev) {
        resolve(ev && ev.target ? String(ev.target.result || '') : '');
      };
      reader.readAsDataURL(blob);
    });
  }

  function extractDriveFileIdFromUrl_(url) {
    var raw = String(url || '').trim();
    if (!raw) return '';
    if (/^[a-zA-Z0-9_-]{15,120}$/.test(raw)) return raw;
    var mPath = raw.match(/\/d\/([a-zA-Z0-9_-]{10,120})/);
    if (mPath) return mPath[1];
    var mQuery = raw.match(/[?&]id=([a-zA-Z0-9_-]{10,120})/);
    return mQuery ? mQuery[1] : '';
  }

  function updateAudioUploadProgressUi_(visible, pct, label) {
    var wrap = document.getElementById('rapatAudioUploadProgressWrap');
    var lblEl = document.getElementById('rapatAudioUploadProgressLabel');
    var pctEl = document.getElementById('rapatAudioUploadProgressPct');
    var barEl = document.getElementById('rapatAudioUploadProgressBar');
    var cleanPct = Math.min(100, Math.max(0, Math.round(Number(pct || 0))));
    if (wrap) {
      if (visible) wrap.classList.remove('hidden');
      else wrap.classList.add('hidden');
    }
    if (lblEl && label !== undefined) {
      lblEl.innerText = String(label || 'Mengunggah rekaman ke Google Drive...');
    }
    if (pctEl) {
      pctEl.innerText = cleanPct + '%';
    }
    if (barEl && barEl.style) {
      barEl.style.width = cleanPct + '%';
    }
  }

  async function readAndCompressAudioFile_(file) {
    if (!file) throw new Error('Berkas audio kosong.');
    var fileName = String(file.name || 'rekaman_rapat.webm').trim();
    var rawMime = String(file.type || '').split(';')[0].trim().toLowerCase();
    if (/\.m4a$/i.test(fileName) || rawMime === 'audio/x-m4a' || rawMime === 'audio/m4a') {
      rawMime = 'audio/mp4';
    } else if (/\.mp3$/i.test(fileName)) {
      rawMime = 'audio/mpeg';
    } else if (/\.wav$/i.test(fileName)) {
      rawMime = 'audio/wav';
    } else if (/\.ogg$/i.test(fileName)) {
      rawMime = 'audio/ogg';
    } else if (/\.aac$/i.test(fileName)) {
      rawMime = 'audio/aac';
    } else if (/\.flac$/i.test(fileName)) {
      rawMime = 'audio/flac';
    } else if (/\.webm$/i.test(fileName) || rawMime === 'video/webm') {
      rawMime = 'audio/webm';
    } else if (!rawMime) {
      rawMime = 'audio/webm';
    }

    var maxRawBytes = 120 * 1024 * 1024;
    if (file.size && file.size > maxRawBytes) {
      throw new Error('Ukuran file audio terlalu besar (maks. 120 MB). Potong rekaman atau bagi menjadi 2 bagian.');
    }

    var largeAudioCutoffBytes = 8 * 1024 * 1024;
    if (file.size && file.size > largeAudioCutoffBytes) {
      return {
        dataUri: '',
        isLargeFile: true,
        file: file,
        mimeType: rawMime,
        fileName: fileName,
        sizeBytes: file.size
      };
    }

    // Resampling ringan khusus berkas WAV kecil (< 8 MB) jika browser mendukung Web Audio API
    var targetBlob = file;
    var finalMime = rawMime;
    if ((rawMime === 'audio/wav' || rawMime === 'audio/x-wav') && file.size > 2.5 * 1024 * 1024 &&
        typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext) &&
        typeof file.arrayBuffer === 'function') {
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        var ctx = new Ctx();
        var decoded = await ctx.decodeAudioData(await file.arrayBuffer());
        if (typeof ctx.close === 'function') ctx.close().catch(function () {});
        var wavBlob = encodeWavMono16k_(decoded);
        if (wavBlob.size < file.size) {
          targetBlob = wavBlob;
          finalMime = 'audio/wav';
        }
      } catch (eWav) {
        // Gunakan file asli jika decoding WAV gagal
      }
    }

    if (targetBlob.size && targetBlob.size > 8.5 * 1024 * 1024) {
      return {
        dataUri: '',
        isLargeFile: true,
        file: file,
        mimeType: rawMime,
        fileName: fileName,
        sizeBytes: file.size
      };
    }

    var dataUri = await blobToDataUri_(targetBlob);
    return {
      dataUri: dataUri,
      isLargeFile: false,
      file: targetBlob,
      mimeType: finalMime,
      fileName: fileName,
      sizeBytes: targetBlob.size || file.size || 0
    };
  }

  function updateRapatAudioPreviewUi_() {
    var box = document.getElementById('rapatAudioPreviewBox');
    var info = document.getElementById('rapatAudioFileInfo');
    var player = document.getElementById('rapatAudioPlayer');
    var btnClear = document.getElementById('btnRapatClearAudio');
    var badge = document.getElementById('rapatAiStatusBadge');

    var hasAudio = Boolean(rapatAudioState.dataUri || rapatAudioState.objectUrl || rapatAudioState.driveFileId);
    if (box) {
      if (hasAudio) box.classList.remove('hidden');
      else box.classList.add('hidden');
    }
    if (btnClear) {
      if (hasAudio) btnClear.classList.remove('hidden');
      else btnClear.classList.add('hidden');
    }
    if (info) {
      info.innerText = hasAudio
        ? (rapatAudioState.fileName || 'rekaman_rapat.webm') + (rapatAudioState.sizeBytes ? ' (' + formatBytesRapat_(rapatAudioState.sizeBytes) + ')' : '')
        : 'Belum ada file audio';
    }
    if (player) {
      if (rapatAudioState.objectUrl) {
        player.classList.remove('hidden');
        if (player.src !== rapatAudioState.objectUrl) player.src = rapatAudioState.objectUrl;
      } else {
        player.src = '';
        player.classList.add('hidden');
      }
    }
    if (badge && !rapatAudioState.recording) {
      badge.innerText = hasAudio ? 'Audio Siap Analisa AI' : 'Siap AI Notulis';
    }
  }

  function stopRapatRecordingTracks_() {
    if (rapatAudioState.timerId) {
      clearInterval(rapatAudioState.timerId);
      rapatAudioState.timerId = null;
    }
    if (rapatAudioState.stream && typeof rapatAudioState.stream.getTracks === 'function') {
      rapatAudioState.stream.getTracks().forEach(function (t) {
        try { t.stop(); } catch (e) {}
      });
    }
    rapatAudioState.stream = null;
    rapatAudioState.recorder = null;
    rapatAudioState.recording = false;

    var btnRec = document.getElementById('btnRapatRecordAudio');
    var timerEl = document.getElementById('rapatAudioRecordTimer');
    if (btnRec) {
      btnRec.classList.remove('animate-pulse');
      var spanLbl = btnRec.querySelector('span:not(#rapatAudioRecordTimer)');
      if (spanLbl) spanLbl.innerText = 'Rekam Mikrofon';
    }
    if (timerEl) {
      timerEl.classList.add('hidden');
      timerEl.innerText = '00:00';
    }
  }

  window.clearRapatAudioSelection = function (keepUrlField) {
    if (rapatAudioState.recording && rapatAudioState.recorder) {
      try { rapatAudioState.recorder.stop(); } catch (e) {}
    }
    stopRapatRecordingTracks_();
    if (rapatAudioState.objectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      try { URL.revokeObjectURL(rapatAudioState.objectUrl); } catch (e) {}
    }
    rapatAudioState.uploadSeq = (rapatAudioState.uploadSeq || 0) + 1;
    rapatAudioState.dataUri = '';
    rapatAudioState.mimeType = '';
    rapatAudioState.fileName = '';
    rapatAudioState.sizeBytes = 0;
    rapatAudioState.objectUrl = '';
    rapatAudioState.file = null;
    rapatAudioState.driveFileId = '';
    rapatAudioState.driveUrl = '';
    rapatAudioState.isLargeFile = false;
    rapatAudioState.uploading = false;
    rapatAudioState.uploadPromise = null;
    rapatAudioState.uploadError = '';
    rapatAudioState.activeJobId = '';
    rapatAudioState.chunks = [];

    if (!keepUrlField) {
      var urlEl = document.getElementById('rapatFieldAudioUrl');
      if (urlEl) urlEl.value = '';
    }
    updateAudioUploadProgressUi_(false, 0, '');
    updateRapatAudioPreviewUi_();
  };

  function setAudioDriveStatusBadge_(text, tone) {
    var st = document.getElementById('rapatAudioDriveStatus');
    if (!st) return;
    st.innerText = text || 'Siap Analisa AI';
    if (tone === 'uploading') {
      st.className = 'px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] shrink-0';
    } else if (tone === 'saved') {
      st.className = 'px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] shrink-0';
    } else if (tone === 'error') {
      st.className = 'px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] shrink-0';
    } else {
      st.className = 'px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 text-[9px] shrink-0';
    }
  }

  function uploadRapatAudioToDriveInBackground_(fileObj, dataUri, fileName, mimeType, isLargeFile) {
    if ((!fileObj && !dataUri) || !window.EofficeDataService) {
      return Promise.resolve({ status: 'skipped' });
    }
    var mySeq = rapatAudioState.uploadSeq;
    var currentUser = (window.vueState && window.vueState.user) ? window.vueState.user : (typeof state !== 'undefined' ? state.user : null);
    var adminNip = (currentUser && currentUser.nip) || localStorage.getItem('transkep_active_nip') || '';
    var token = localStorage.getItem('transkep_session_token') || '';
    var folderCtx = getRapatDriveFolderContext_();

    rapatAudioState.uploading = true;
    rapatAudioState.uploadError = '';
    setAudioDriveStatusBadge_('Mengunggah ke Drive...', 'uploading');

    var p = (async function () {
      try {
        var upRes = null;
        if (fileObj && typeof window.EofficeDataService.uploadAudioFileToDriveResumable === 'function') {
          updateAudioUploadProgressUi_(true, 0, 'Menyiapkan sesi Google Drive...');
          upRes = await window.EofficeDataService.uploadAudioFileToDriveResumable(
            fileObj,
            folderCtx,
            adminNip,
            token,
            function (pct, loadedBytes, totalBytes) {
              if (rapatAudioState.uploadSeq !== mySeq) return;
              setAudioDriveStatusBadge_('Mengunggah... ' + pct + '%', 'uploading');
              updateAudioUploadProgressUi_(true, pct, 'Mengunggah ke Drive: ' + formatBytesRapat_(loadedBytes) + ' / ' + formatBytesRapat_(totalBytes));
            },
            function () {
              return rapatAudioState.uploadSeq !== mySeq;
            }
          );
          if (rapatAudioState.uploadSeq !== mySeq) return { status: 'cancelled' };
          if (upRes && upRes.status === 'success' && upRes.data && upRes.data.url) {
            rapatAudioState.driveFileId = String(upRes.data.file_id || extractDriveFileIdFromUrl_(upRes.data.url));
            rapatAudioState.driveUrl = String(upRes.data.url);
            var urlElR = document.getElementById('rapatFieldAudioUrl');
            if (urlElR) urlElR.value = String(upRes.data.url);
            updateAudioUploadProgressUi_(false, 100, '');
            setAudioDriveStatusBadge_('Drive: ' + (upRes.data.folder_path || 'Tersimpan'), 'saved');
            if (isLargeFile && typeof showNotify === 'function') {
              showNotify('Arsip Drive Selesai', (fileName || 'Rekaman') + ' berhasil masuk Google Drive & siap dianalisa AI Notulis.', 'success');
            }
            return upRes;
          }
          if (!isLargeFile && dataUri && typeof window.EofficeDataService.uploadAudioRapatToDrive === 'function') {
            upRes = null;
          } else {
            rapatAudioState.uploadError = (upRes && upRes.message) ? upRes.message : 'Gagal mengunggah rekaman ke Google Drive.';
          }
        }

        if (!upRes && dataUri && typeof window.EofficeDataService.uploadAudioRapatToDrive === 'function') {
          updateAudioUploadProgressUi_(false, 0, '');
          upRes = await window.EofficeDataService.uploadAudioRapatToDrive({
            id_rapat: folderCtx.id_rapat,
            agenda: folderCtx.agenda,
            hari_tanggal: folderCtx.hari_tanggal,
            tgl_surat: folderCtx.tgl_surat,
            tgl_rapat_iso: folderCtx.tgl_rapat_iso,
            file_data: dataUri,
            file_name: fileName || 'rekaman_rapat.webm',
            mime_type: mimeType || 'audio/webm'
          }, adminNip, token);
          if (rapatAudioState.uploadSeq !== mySeq) return { status: 'cancelled' };
          if (upRes && upRes.status === 'success' && upRes.data && upRes.data.url) {
            rapatAudioState.driveFileId = String(upRes.data.file_id || extractDriveFileIdFromUrl_(upRes.data.url));
            rapatAudioState.driveUrl = String(upRes.data.url);
            var urlEl = document.getElementById('rapatFieldAudioUrl');
            if (urlEl) urlEl.value = String(upRes.data.url);
            setAudioDriveStatusBadge_('Drive: ' + (upRes.data.folder_path || 'Tersimpan'), 'saved');
            return upRes;
          }
          rapatAudioState.uploadError = (upRes && upRes.message) ? upRes.message : 'Gagal mengunggah rekaman ke Google Drive.';
        }

        if (isLargeFile) {
          setAudioDriveStatusBadge_('Gagal Unggah Drive', 'error');
          if (typeof showNotify === 'function') {
            showNotify('Unggah Audio Gagal', rapatAudioState.uploadError || 'Gagal mengunggah audio besar ke Google Drive.', 'warning');
          }
        } else {
          setAudioDriveStatusBadge_('Lokal Siap AI', 'ready');
        }
        return upRes || { status: 'error', message: rapatAudioState.uploadError };
      } catch (errUp) {
        if (rapatAudioState.uploadSeq !== mySeq) return { status: 'cancelled' };
        console.warn('Upload audio rapat ke Drive ditunda:', errUp);
        rapatAudioState.uploadError = errUp && errUp.message ? errUp.message : String(errUp);
        if (isLargeFile) {
          setAudioDriveStatusBadge_('Gagal Unggah Drive', 'error');
          if (typeof showNotify === 'function') {
            showNotify('Unggah Audio Gagal', rapatAudioState.uploadError, 'warning');
          }
        } else {
          setAudioDriveStatusBadge_('Lokal Siap AI', 'ready');
        }
        return { status: 'error', message: rapatAudioState.uploadError };
      } finally {
        if (rapatAudioState.uploadSeq === mySeq) {
          rapatAudioState.uploading = false;
          updateAudioUploadProgressUi_(false, 0, '');
        }
      }
    })();

    rapatAudioState.uploadPromise = p;
    return p;
  }

  window.handleRapatAudioSelect = async function (files) {
    if (!files || files.length === 0) return;
    var f = files[0];
    try {
      var res = await readAndCompressAudioFile_(f);
      window.clearRapatAudioSelection(true);
      rapatAudioState.dataUri = res.dataUri || '';
      rapatAudioState.file = res.file || f;
      rapatAudioState.isLargeFile = Boolean(res.isLargeFile);
      rapatAudioState.mimeType = res.mimeType;
      rapatAudioState.fileName = res.fileName;
      rapatAudioState.sizeBytes = res.sizeBytes;
      rapatAudioState.driveFileId = '';
      rapatAudioState.driveUrl = '';
      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try { rapatAudioState.objectUrl = URL.createObjectURL(f); } catch (eObj) {}
      }
      updateRapatAudioPreviewUi_();
      if (res.isLargeFile) {
        setAudioDriveStatusBadge_('Mengunggah ke Drive...', 'uploading');
        var badgeEl = document.getElementById('rapatAiStatusBadge');
        if (badgeEl) badgeEl.innerText = 'File Besar (' + formatBytesRapat_(res.sizeBytes) + ') — Upload Drive';
        if (typeof showNotify === 'function') {
          showNotify('Audio Besar Dipilih', res.fileName + ' (' + formatBytesRapat_(res.sizeBytes) + ') sedang diunggah ke Google Drive. Setelah selesai, klik Proses AI Notulis.', 'info');
        }
      } else {
        setAudioDriveStatusBadge_('Siap Analisa AI', 'ready');
        if (typeof showNotify === 'function') {
          showNotify('Audio Dipilih', res.fileName + ' siap diproses oleh AI Notulis.', 'success');
        }
      }
      uploadRapatAudioToDriveInBackground_(res.file || f, res.dataUri, res.fileName, res.mimeType, Boolean(res.isLargeFile));
    } catch (err) {
      if (typeof showNotify === 'function') {
        showNotify('Audio Tidak Valid', err.message || err.toString(), 'warning');
      }
    }
  };

  window.toggleRapatAudioRecording = async function () {
    if (rapatAudioState.recording && rapatAudioState.recorder) {
      try { rapatAudioState.recorder.stop(); } catch (e) {}
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function' ||
        typeof MediaRecorder === 'undefined') {
      if (typeof showNotify === 'function') {
        showNotify('Tidak Didukung', 'Browser belum mendukung perekaman mikrofon langsung. Gunakan + Pilih File Audio.', 'warning');
      }
      return;
    }

    try {
      window.clearRapatAudioSelection(true);
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      var mimeOpts = {};
      if (typeof MediaRecorder.isTypeSupported === 'function') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeOpts = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 24000 };
        else if (MediaRecorder.isTypeSupported('audio/webm')) mimeOpts = { mimeType: 'audio/webm', audioBitsPerSecond: 24000 };
      }
      var rec = new MediaRecorder(stream, mimeOpts);
      rapatAudioState.stream = stream;
      rapatAudioState.recorder = rec;
      rapatAudioState.chunks = [];
      rapatAudioState.recording = true;
      rapatAudioState.startedAt = Date.now();

      rec.ondataavailable = function (ev) {
        if (ev && ev.data && ev.data.size > 0) rapatAudioState.chunks.push(ev.data);
      };
      rec.onstop = async function () {
        var chunks = rapatAudioState.chunks.slice();
        var recMime = String((rec && rec.mimeType) || 'audio/webm').split(';')[0].trim() || 'audio/webm';
        stopRapatRecordingTracks_();
        if (chunks.length === 0) return;
        var blob = new Blob(chunks, { type: recMime });
        try {
          var recLarge = blob.size > 8 * 1024 * 1024;
          var dataUri = recLarge ? '' : await blobToDataUri_(blob);
          rapatAudioState.dataUri = dataUri;
          rapatAudioState.file = blob;
          rapatAudioState.isLargeFile = recLarge;
          rapatAudioState.mimeType = recMime;
          rapatAudioState.fileName = 'Rekaman_Mikrofon_' + new Date().toISOString().slice(11, 19).replace(/:/g, '') + '.webm';
          rapatAudioState.sizeBytes = blob.size || 0;
          rapatAudioState.driveFileId = '';
          rapatAudioState.driveUrl = '';
          if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
            try { rapatAudioState.objectUrl = URL.createObjectURL(blob); } catch (eObj) {}
          }
          updateRapatAudioPreviewUi_();
          setAudioDriveStatusBadge_(recLarge ? 'Mengunggah ke Drive...' : 'Siap Analisa AI', recLarge ? 'uploading' : 'ready');
          if (typeof showNotify === 'function') {
            showNotify('Rekaman Selesai', 'Audio berhasil direkam. Klik Proses AI Notulis untuk menyusun Notula.', 'success');
          }
          uploadRapatAudioToDriveInBackground_(blob, dataUri, rapatAudioState.fileName, recMime, recLarge);
        } catch (errBlob) {
          console.warn('Gagal konversi rekaman audio:', errBlob);
        }
      };

      rec.start(1000);
      var btnRec = document.getElementById('btnRapatRecordAudio');
      var timerEl = document.getElementById('rapatAudioRecordTimer');
      var badge = document.getElementById('rapatAiStatusBadge');
      if (btnRec) {
        btnRec.classList.add('animate-pulse');
        var spanLbl = btnRec.querySelector('span:not(#rapatAudioRecordTimer)');
        if (spanLbl) spanLbl.innerText = 'Hentikan Rekaman';
      }
      if (badge) badge.innerText = 'Sedang Merekam...';
      if (timerEl) {
        timerEl.classList.remove('hidden');
        timerEl.innerText = '00:00';
      }
      rapatAudioState.timerId = setInterval(function () {
        var sec = Math.max(0, Math.floor((Date.now() - rapatAudioState.startedAt) / 1000));
        var mm = String(Math.floor(sec / 60)).padStart(2, '0');
        var ss = String(sec % 60).padStart(2, '0');
        if (timerEl) timerEl.innerText = mm + ':' + ss;
      }, 500);
    } catch (errMic) {
      stopRapatRecordingTracks_();
      if (typeof showNotify === 'function') {
        showNotify('Akses Mikrofon Ditolak', errMic.message || 'Izinkan akses mikrofon di browser atau unggah file audio.', 'error');
      }
    }
  };

  function matchPegawaiForAiSpeaker_(speakerName, rowNip, rowJabatan) {
    var users = getUsersListRapat_();
    if (rowNip) {
      var byNip = users.find(function (u) { return String(u.nip) === String(rowNip).trim(); });
      if (byNip) {
        return {
          nip: String(byNip.nip || ''),
          jabatan: String(rowJabatan || byNip.jabatan || ''),
          namaDisplay: byNip.nama + (byNip.jabatan ? ' (' + byNip.jabatan + ')' : '')
        };
      }
    }
    var target = String(speakerName || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!target) return null;
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      var baseNama = String(u.nama || '').split(',')[0].toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      if (baseNama && baseNama.length >= 3 && (target.indexOf(baseNama) !== -1 || baseNama.indexOf(target) !== -1)) {
        return {
          nip: String(u.nip || ''),
          jabatan: String(rowJabatan || u.jabatan || ''),
          namaDisplay: u.nama + (u.jabatan ? ' (' + u.jabatan + ')' : '')
        };
      }
    }
    return null;
  }

  function joinAiLines_(val) {
    if (Array.isArray(val)) {
      var arr = val.map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean);
      if (arr.length === 0) return '';
      if (arr.length === 1) return arr[0];
      return arr.map(function (line, i) { return (i + 1) + '. ' + line; }).join('\n');
    }
    return String(val == null ? '' : val).trim();
  }

  window.applyAiNotulenToForm = function (aiData, opts) {
    var data = aiData || {};
    var options = opts || {};

    var elPengarahan = document.getElementById('rapatFieldPengarahanUmum');
    var elKesimpulan = document.getElementById('rapatFieldKesimpulan');
    var elDasar = document.getElementById('rapatFieldDasarNotula');
    var elTrans = document.getElementById('rapatFieldAiTranscript');

    if (elPengarahan && String(data.pengarahan_umum || '').trim()) {
      elPengarahan.value = String(data.pengarahan_umum).trim();
    }
    if (elKesimpulan && String(data.kesimpulan || '').trim()) {
      elKesimpulan.value = String(data.kesimpulan).trim();
    }
    if (elDasar && !String(elDasar.value || '').trim() && String(data.dasar_opsional || '').trim()) {
      elDasar.value = String(data.dasar_opsional).trim();
    }
    if (elTrans && String(data.transkrip_ringkas || '').trim()) {
      if (!String(elTrans.value || '').trim() || options.overwriteTranscript) {
        elTrans.value = String(data.transkrip_ringkas).trim();
      }
    }

    var rows = Array.isArray(data.pembahasan) ? data.pembahasan : [];
    if (rows.length > 0) {
      pembahasanRowsList = rows.slice(0, 30).map(function (r, idx) {
        var row = (r && typeof r === 'object') ? r : {};
        var rawSpeaker = String(row.pembicara_nama || row.pembicara || ('Pembicara #' + (idx + 1))).trim();
        var rawNip = String(row.pembicara_nip || '').trim();
        var rawJab = String(row.pembicara_jabatan || '').trim();
        var matched = matchPegawaiForAiSpeaker_(rawSpeaker, rawNip, rawJab);

        return normalizePembahasanRow_({
          pembicara_nama: (matched && rawSpeaker.indexOf('(') === -1) ? matched.namaDisplay : rawSpeaker,
          pembicara_nip: matched ? matched.nip : rawNip,
          pembicara_jabatan: matched ? matched.jabatan : rawJab,
          uraian: joinAiLines_(row.uraian_text || row.uraian),
          tindak_lanjut: joinAiLines_(row.tindak_lanjut_text || row.tindak_lanjut),
          target: String(row.target || '').trim(),
          penanggung_jawab: String(row.penanggung_jawab || '').trim(),
          tanggal_penyelesaian: String(row.tanggal_penyelesaian || '').trim(),
          items: Array.isArray(row.items) ? row.items : null
        });
      });
      renderPembahasanRows_();
    }

    return {
      pembahasanCount: rows.length,
      hasPengarahan: Boolean(String(data.pengarahan_umum || '').trim()),
      hasKesimpulan: Boolean(String(data.kesimpulan || '').trim())
    };
  };

  function parseNotesLocallyForNotula_(rawText) {
    var cleanText = String(rawText || '').trim();
    var lines = cleanText.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var agendaTitle = ((document.getElementById('rapatFieldAgenda') || {}).value || 'Rapat Kedinasan').trim();
    var pemimpinNama = ((document.getElementById('rapatFieldPemimpin') || {}).value || 'Pimpinan Rapat').trim();

    var pengarahan = [];
    var kesimpulan = [];
    var rows = [];
    var activeRow = null;

    lines.forEach(function (line) {
      if (/^(?:arahan|pengarahan|pimpinan)\s*:/i.test(line)) {
        pengarahan.push(line.replace(/^[^:]+:\s*/, '').trim());
        return;
      }
      if (/^(?:kesimpulan|keputusan)\s*:/i.test(line)) {
        kesimpulan.push(line.replace(/^[^:]+:\s*/, '').trim());
        return;
      }

      var spkMatch = line.match(/^(?:\d+\.\s*)?([A-Za-z0-9.,()\-\/\s]{3,80}?)\s*:\s*(.+)$/);
      if (spkMatch && !/^https?$/i.test(spkMatch[1])) {
        var key = spkMatch[1].trim();
        var body = spkMatch[2].trim();
        if (/^tindak\s*lanjut$/i.test(key) && activeRow) {
          activeRow.tindak_lanjut.push(body);
          return;
        }
        if (/^target$/i.test(key) && activeRow) {
          activeRow.target = body;
          return;
        }
        if (/^(?:pj|penanggung\s*jawab)$/i.test(key) && activeRow) {
          activeRow.penanggung_jawab = body;
          return;
        }
        if (/^(?:tanggal|tgl|deadline)(?:\s+penyelesaian)?$/i.test(key) && activeRow) {
          activeRow.tanggal_penyelesaian = body;
          return;
        }

        var matched = matchPegawaiForAiSpeaker_(key, '', '');
        activeRow = {
          pembicara_nama: matched ? matched.namaDisplay : key,
          pembicara_nip: matched ? matched.nip : '',
          pembicara_jabatan: matched ? matched.jabatan : '',
          uraian: [body],
          tindak_lanjut: [],
          target: '',
          penanggung_jawab: matched ? (matched.jabatan || key) : key,
          tanggal_penyelesaian: ''
        };
        rows.push(activeRow);
        return;
      }

      if (activeRow) activeRow.uraian.push(line);
      else pengarahan.push(line);
    });

    if (rows.length === 0 && lines.length > 0) {
      rows.push({
        pembicara_nama: pemimpinNama,
        pembicara_nip: (document.getElementById('rapatFieldPemimpinNip') || {}).value || '',
        pembicara_jabatan: (document.getElementById('rapatFieldPemimpinJabatan') || {}).value || '',
        uraian: lines,
        tindak_lanjut: kesimpulan.length > 0 ? kesimpulan : ['Ditindaklanjuti sesuai hasil rapat.'],
        target: 'Terselesaikannya agenda ' + agendaTitle,
        penanggung_jawab: pemimpinNama,
        tanggal_penyelesaian: 'Segera'
      });
    }

    return {
      dasar_opsional: '',
      pengarahan_umum: pengarahan.join('\n') || ('Arahan pimpinan terkait ' + agendaTitle + '.'),
      kesimpulan: kesimpulan.join('\n') || 'Rapat menyepakati tindak lanjut pembahasan di atas.',
      transkrip_ringkas: cleanText,
      pembahasan: rows
    };
  }

  window.parseLocalTranscriptToNotula = function () {
    var transEl = document.getElementById('rapatFieldAiTranscript');
    var rawText = transEl ? String(transEl.value || '').trim() : '';
    if (!rawText) {
      if (typeof showNotify === 'function') {
        showNotify('Catatan Kosong', 'Isi kolom Catatan Mentah / Transkrip terlebih dahulu.', 'warning');
      }
      return null;
    }

    var parsed = parseNotesLocallyForNotula_(rawText);
    var summary = window.applyAiNotulenToForm(parsed, { overwriteTranscript: false });
    switchRapatTab('notula');
    if (typeof showNotify === 'function') {
      showNotify(
        'Draf Notula Disusun (Tinjau Sebelum Simpan)',
        summary.pembahasanCount + ' topik pembicara diisikan ke 5 kolom Notula. Periksa ejaan nama & detail sebelum menyimpan.',
        'success'
      );
    }
    return parsed;
  };

  window.processAiNotulenRapat = async function () {
    if (isProcessingAiNotulen) return;
    var transEl = document.getElementById('rapatFieldAiTranscript');
    var transcriptText = transEl ? String(transEl.value || '').trim() : '';
    var hasAudioReady = Boolean(rapatAudioState.dataUri || rapatAudioState.driveFileId || rapatAudioState.uploading);

    if (!hasAudioReady && !transcriptText) {
      if (typeof showNotify === 'function') {
        showNotify('Input Belum Ada', 'Pilih/rekam audio rapat atau tempel catatan mentah terlebih dahulu.', 'warning');
      }
      return;
    }

    var currentUser = (window.vueState && window.vueState.user) ? window.vueState.user : (typeof state !== 'undefined' ? state.user : null);
    var adminNip = (currentUser && currentUser.nip) || localStorage.getItem('transkep_active_nip') || '';
    var token = localStorage.getItem('transkep_session_token') || '';

    isProcessingAiNotulen = true;
    var btnAi = document.getElementById('btnRapatProcessAiNotulen');
    var origAiHtml = btnAi ? btnAi.innerHTML : '';
    var badge = document.getElementById('rapatAiStatusBadge');
    if (btnAi) {
      btnAi.disabled = true;
      btnAi.classList.add('opacity-70', 'cursor-wait');
      btnAi.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Memproses AI...</span>';
    }
    if (badge) badge.innerText = 'Memproses Gemini AI...';

    try {
      if (rapatAudioState.uploading && rapatAudioState.uploadPromise) {
        if (btnAi) btnAi.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Menunggu unggah Drive selesai...</span>';
        if (badge) badge.innerText = 'Menunggu Upload Drive...';
        await rapatAudioState.uploadPromise;
      }

      if (rapatAudioState.isLargeFile && !rapatAudioState.driveFileId) {
        throw new Error(rapatAudioState.uploadError || 'Rekaman besar belum selesai diunggah ke Google Drive. Pastikan unggah Drive berhasil sebelum Proses AI Notulis.');
      }

      if (!window.EofficeDataService || typeof window.EofficeDataService.requestAiNotulenRapat !== 'function') {
        throw new Error('Layanan EofficeDataService.requestAiNotulenRapat belum siap.');
      }

      var useAsyncDriveAudio = Boolean(rapatAudioState.driveFileId && (!rapatAudioState.dataUri || rapatAudioState.isLargeFile));
      var aiPayload = {
        id_rapat: ((document.getElementById('rapatFieldIdRapat') || {}).value || '').trim() || 'RPT-DRAFT',
        agenda: ((document.getElementById('rapatFieldAgenda') || {}).value || '').trim() || 'Rapat Kedinasan',
        hari_tanggal: ((document.getElementById('rapatFieldHariTanggal') || {}).value || '').trim(),
        tempat: ((document.getElementById('rapatFieldTempat') || {}).value || '').trim(),
        pemimpin: ((document.getElementById('rapatFieldPemimpin') || {}).value || '').trim(),
        notulis: ((document.getElementById('rapatFieldNotulis') || {}).value || '').trim(),
        peserta_list: tujuanUndanganList.slice(0, 50),
        transcript_text: transcriptText,
        audio_data: useAsyncDriveAudio ? '' : (rapatAudioState.dataUri || ''),
        audio_drive_file_id: useAsyncDriveAudio ? rapatAudioState.driveFileId : '',
        audio_file_name: rapatAudioState.fileName || '',
        audio_mime_type: rapatAudioState.mimeType || '',
        audio_size_bytes: Number(rapatAudioState.sizeBytes || 0),
        async_mode: useAsyncDriveAudio,
        allow_text_fallback: Boolean(transcriptText)
      };

      if (btnAi) {
        btnAi.innerHTML = useAsyncDriveAudio
          ? '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Mengirim audio Drive ke n8n...</span>'
          : '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Memproses AI...</span>';
      }
      if (badge) badge.innerText = useAsyncDriveAudio ? 'Mengirim ke n8n...' : 'Memproses Gemini AI...';

      var res = await window.EofficeDataService.requestAiNotulenRapat(aiPayload, adminNip, token);

      if (res && res.status === 'processing' && res.job_id) {
        var jobId = String(res.job_id).trim();
        rapatAudioState.activeJobId = jobId;
        var startedPollAt = Date.now();
        var maxPolls = 90; // 90 x 4 dtk = 6 menit

        for (var pollIdx = 0; pollIdx < maxPolls; pollIdx++) {
          if (rapatAudioState.activeJobId !== jobId) {
            return;
          }
          var elapsedSec = Math.max(0, Math.round((Date.now() - startedPollAt) / 1000));
          if (btnAi) {
            btnAi.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Analisa Audio Gemini... (' + elapsedSec + ' dtk)</span>';
          }
          if (badge) {
            badge.innerText = String(res.stage || 'n8n & Gemini Files API memproses (' + elapsedSec + ' dtk)...');
          }

          await new Promise(function (resolve) { setTimeout(resolve, 4000); });
          if (rapatAudioState.activeJobId !== jobId) {
            return;
          }

          if (typeof window.EofficeDataService.checkAiNotulenJobStatus !== 'function') {
            res = { status: 'error', message: 'checkAiNotulenJobStatus belum tersedia di EofficeDataService.' };
            break;
          }

          var stRes = await window.EofficeDataService.checkAiNotulenJobStatus(jobId, adminNip, token);
          if (stRes && stRes.status === 'success' && stRes.data) {
            res = stRes;
            break;
          }
          if (stRes && stRes.status === 'error') {
            res = stRes;
            break;
          }
          if (stRes && stRes.status === 'not_found') {
            res = { status: 'error', message: stRes.message || 'Sesi analisa AI tidak ditemukan atau sudah kedaluwarsa.' };
            break;
          }
          if (stRes && stRes.stage) {
            res.stage = stRes.stage;
          }
        }

        if (res && res.status === 'processing') {
          res = { status: 'error', message: 'Proses AI Notulis melebihi batas tunggu 6 menit. Silakan coba beberapa saat lagi.' };
        }
      }

      if (res && res.status === 'success' && res.data) {
        var applied = window.applyAiNotulenToForm(res.data, { overwriteTranscript: !transcriptText });
        switchRapatTab('notula');
        if (badge) badge.innerText = 'Draf AI Terisi (Siap Tinjau)';
        if (typeof showNotify === 'function') {
          showNotify(
            'AI Notulis Selesai — Harap Tinjau',
            'Berhasil mengisi Pengarahan Umum & ' + applied.pembahasanCount + ' pembicara 5 kolom. Periksa ejaan nama sebelum klik Simpan Agenda Rapat.',
            'success'
          );
        }
      } else {
        if (badge) badge.innerText = 'Gagal Proses AI';
        if (typeof showNotify === 'function') {
          showNotify('AI Notulis Gagal', (res && res.message) ? res.message : 'Gagal mengekstrak notula rapat.', 'error');
        }
      }
    } catch (err) {
      if (badge) badge.innerText = 'Kendala Koneksi AI';
      if (typeof showNotify === 'function') {
        showNotify('Error AI Notulis', err.message || err.toString(), 'error');
      }
    } finally {
      isProcessingAiNotulen = false;
      rapatAudioState.activeJobId = '';
      if (btnAi) {
        btnAi.disabled = false;
        btnAi.classList.remove('opacity-70', 'cursor-wait');
        if (origAiHtml) btnAi.innerHTML = origAiHtml;
      }
    }
  };

  function serializeFotoRapatForFirestore_() {
    var clean = fotoRapatList.map(function (f) {
      var obj = {
        file_id: String(f.file_id || ''),
        url: String(f.url || ''),
        caption: String(f.caption || ''),
        file_name: String(f.file_name || '')
      };
      if (!obj.file_id && f.thumb_data_uri) {
        obj.thumb_data_uri = String(f.thumb_data_uri);
      }
      return obj;
    }).filter(function (o) { return Boolean(o.file_id || o.url || o.thumb_data_uri); });

    var serialized = JSON.stringify(clean);
    if (serialized.length > 48000) {
      clean = clean.map(function (o) {
        return { file_id: o.file_id, url: o.url, caption: o.caption, file_name: o.file_name };
      });
      serialized = JSON.stringify(clean).slice(0, 48000);
    }
    return serialized;
  }

  // ==========================================
  // BUKA & TUTUP MODAL WORKSPACE RAPAT
  // ==========================================
  window.openRapatModalForm = function (rapatData) {
    var modal = document.getElementById('modalAgendaRapat');
    if (!modal) return;

    rapatData = rapatData || {};
    var incomingId = String(rapatData.id_rapat || rapatData.id || '').trim();
    if (incomingId && window.vmEoffice && Array.isArray(window.vmEoffice.rawRapatList)) {
      var liveRapat = window.vmEoffice.rawRapatList.find(function (r) {
        return String(r.id_rapat || r.id || '').trim() === incomingId;
      });
      if (liveRapat) rapatData = Object.assign({}, rapatData, liveRapat);
    }

    populateRapatOfficialSelects_();
    toggleRapatFullscreen(false);
    switchRapatTab('undangan');

    var todayIso = new Date().toISOString().split('T')[0];

    document.getElementById('rapatFieldIdRapat').value = rapatData.id_rapat || rapatData.id || '';
    document.getElementById('rapatFieldDocUndanganUrl').value = rapatData.doc_undangan_url || '';
    document.getElementById('rapatFieldDocAbsenUrl').value = rapatData.doc_absen_url || '';
    document.getElementById('rapatFieldDocNotulenUrl').value = rapatData.doc_notulen_url || '';
    var elMyReq = document.getElementById('rapatFieldMysimsRequested');
    var elMyStat = document.getElementById('rapatFieldMysimsStatus');
    var elMyIdp = document.getElementById('rapatFieldMysimsIdp');
    var elMyAt = document.getElementById('rapatFieldMysimsRequestedAt');
    if (elMyReq) elMyReq.value = rapatData.mysims_requested ? 'true' : 'false';
    if (elMyStat) elMyStat.value = rapatData.mysims_status || '';
    if (elMyIdp) elMyIdp.value = rapatData.mysims_idp || '';
    if (elMyAt) elMyAt.value = rapatData.mysims_requested_at || '';

    var elMyBadge = document.getElementById('rapatMysimsBadge');
    if (elMyBadge) {
      var noStr = String(rapatData.no_urut_surat || '').trim();
      var hasNo = Boolean(noStr && noStr !== '...' && noStr !== '......' && noStr !== '-') ||
        Boolean(rapatData.nomor_undangan && /^\d+[^/]*\//.test(String(rapatData.nomor_undangan)) && String(rapatData.nomor_undangan).indexOf('...') === -1);
      if (hasNo) {
        elMyBadge.textContent = noStr ? ('No. MYSIMS Aktif (' + noStr + ')') : 'Nomor Surat Siap';
        elMyBadge.className = 'text-[9px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30';
      } else if (rapatData.mysims_requested) {
        elMyBadge.textContent = String(rapatData.mysims_status || 'Meminta Nomor MYSIMS...');
        elMyBadge.className = 'text-[9px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30';
      } else {
        elMyBadge.textContent = 'Auto MYSIMS Saat Simpan';
        elMyBadge.className = 'text-[9px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30';
      }
    }
    setRapatModalStatus(rapatData.status || 'Terjadwal');

    // Tab 1 Fields
    var tglSuratIso = /^\d{4}-\d{2}-\d{2}$/.test(String(rapatData.tgl_surat || '')) ? rapatData.tgl_surat : todayIso;
    setElValRapat_('rapatFieldTglSuratIso', tglSuratIso);
    setElValRapat_('rapatFieldTglSuratIndo', formatIsoToIndoDateOnly_(tglSuratIso) || String(rapatData.tgl_surat || ''));

    setElValRapat_('rapatFieldPejabatTtdSelect', rapatData.pejabat_ttd_nip || '');
    setElValRapat_('rapatFieldPejabatTtdNip', rapatData.pejabat_ttd_nip || '');
    setElValRapat_('rapatFieldPejabatTtdNama', rapatData.pejabat_ttd_nama || '');
    setElValRapat_('rapatFieldPejabatTtdJabatan', rapatData.pejabat_ttd_jabatan || '');
    setElValRapat_('rapatFieldKodePejabat', rapatData.kode_pejabat_ttd || 'KPA.W10-A2');
    var initNoUrut = String(rapatData.no_urut_surat || '').trim();
    setElValRapat_('rapatFieldNoUrutSurat', initNoUrut);
    setElValRapat_('rapatFieldKodeSurat', rapatData.kode_klasifikasi_surat || 'OT.01.1');
    setElValRapat_('rapatFieldLampiranSurat', rapatData.lampiran_surat || '-');
    var elTampGelar = document.getElementById('rapatFieldTampilkanGelarUndangan');
    if (elTampGelar) elTampGelar.checked = Boolean(rapatData.tampilkan_gelar_undangan);

    if (rapatData.nomor_undangan) {
      setElValRapat_('rapatFieldNomorUndangan', rapatData.nomor_undangan);
      if (!initNoUrut) window.syncNoUrutFromNomorUndangan(rapatData.nomor_undangan);
    } else {
      syncNomorUndanganPreview();
    }

    setElValRapat_('rapatFieldAgenda', rapatData.agenda || '');
    setElValRapat_('rapatFieldDasarNotula', rapatData.dasar_notula || '');
    setElValRapat_('rapatFieldAgendaPoin', rapatData.agenda_poin || '');

    setElValRapat_('rapatFieldTglRapatIso', '');
    setElValRapat_('rapatFieldHariTanggal', rapatData.hari_tanggal || formatIsoToHariTanggal_(todayIso));
    setElValRapat_('rapatFieldWaktuMulai', rapatData.waktu_mulai || '08:00 WIB');
    setElValRapat_('rapatFieldWaktuSelesai', rapatData.waktu_selesai || 'Selesai');
    setElValRapat_('rapatFieldTempat', rapatData.tempat || 'Ruang Rapat Pimpinan Pengadilan Agama Indramayu');

    setElValRapat_('rapatFieldPemimpinSelect', rapatData.pemimpin_nip || '');
    setElValRapat_('rapatFieldPemimpinNip', rapatData.pemimpin_nip || '');
    setElValRapat_('rapatFieldPemimpinJabatan', rapatData.pemimpin_jabatan || '');
    setElValRapat_('rapatFieldPemimpin', rapatData.pemimpin || 'Ketua Pengadilan Agama Indramayu');

    setElValRapat_('rapatFieldNotulisSelect', rapatData.notulis_nip || '');
    setElValRapat_('rapatFieldNotulisNip', rapatData.notulis_nip || '');
    setElValRapat_('rapatFieldNotulisJabatan', rapatData.notulis_jabatan || '');
    setElValRapat_('rapatFieldNotulis', rapatData.notulis || '');

    var hasExistingRapat = Boolean(rapatData.id_rapat || rapatData.id);
    var dispPejabatTtd = resolveOfficialDisplay_(rapatData.pejabat_ttd_nip, rapatData.pejabat_ttd_nama, rapatData.pejabat_ttd_jabatan);
    var dispPemimpin = rapatData.pemimpin_nip
      ? resolveOfficialDisplay_(rapatData.pemimpin_nip, rapatData.pemimpin_jabatan, rapatData.pemimpin)
      : (hasExistingRapat ? resolveOfficialDisplay_('', rapatData.pemimpin, rapatData.pemimpin_jabatan) : '');
    var dispNotulis = resolveOfficialDisplay_(rapatData.notulis_nip, rapatData.notulis, rapatData.notulis_jabatan);
    var initDisplayMap = { pejabatTtd: dispPejabatTtd, pemimpin: dispPemimpin, notulis: dispNotulis };
    ['pejabatTtd', 'pemimpin', 'notulis'].forEach(function (k) {
      var cfg = OFFICIAL_SEARCH_CONFIG_[k];
      setElValRapat_(cfg.inputId, initDisplayMap[k]);
      var cBtn = document.getElementById(cfg.clearId);
      if (cBtn) {
        if (initDisplayMap[k]) cBtn.classList.remove('hidden');
        else cBtn.classList.add('hidden');
      }
      var dEl = document.getElementById(cfg.dropId);
      if (dEl) dEl.classList.add('hidden');
      officialDropActiveMap[k] = 0;
      officialDropMatchesMap[k] = [];
    });

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
    var elCustomTujuan = document.getElementById('rapatCustomTujuanInput');
    if (elCustomTujuan) elCustomTujuan.value = '';
    var elClearTujuan = document.getElementById('btnClearRapatTujuanInput');
    if (elClearTujuan) elClearTujuan.classList.add('hidden');
    var elDropTujuan = document.getElementById('rapatTujuanSearchDropdown');
    if (elDropTujuan) elDropTujuan.classList.add('hidden');
    tujuanSearchActiveIdx = 0;
    tujuanSearchMatches = [];
    tujuanDropCheckedMap = {};
    speakerDropActiveMap = {};
    speakerDropMatchesMap = {};
    renderTujuanUndanganOrdered_();

    // Tab 3: Notula & Pembahasan 5 Kolom
    document.getElementById('rapatFieldPengarahanUmum').value = rapatData.pengarahan_umum || '';
    document.getElementById('rapatFieldKesimpulan').value = rapatData.kesimpulan || '';

    pembahasanRowsList = [];
    if (rapatData.pembahasan_json) {
      try {
        var parsedRows = JSON.parse(rapatData.pembahasan_json);
        if (Array.isArray(parsedRows)) {
          pembahasanRowsList = parsedRows.map(function (r) { return normalizePembahasanRow_(r); });
        }
      } catch (e) {}
    } else if (rapatData.pembahasan && String(rapatData.pembahasan).trim()) {
      pembahasanRowsList.push(normalizePembahasanRow_({
        pembicara_nama: rapatData.pemimpin || 'Pembahasan Umum',
        pembicara_nip: '',
        pembicara_jabatan: '',
        uraian: String(rapatData.pembahasan || ''),
        tindak_lanjut: String(rapatData.kesimpulan || ''),
        target: '',
        penanggung_jawab: '',
        tanggal_penyelesaian: ''
      }));
    }
    if (pembahasanRowsList.length === 0) {
      addPembahasanRow();
    } else {
      renderPembahasanRows_();
    }

    // Tab 4: Media / Foto & AI
    fotoRapatList = [];
    if (rapatData.foto_rapat_json) {
      try {
        var parsedFoto = typeof rapatData.foto_rapat_json === 'string'
          ? JSON.parse(rapatData.foto_rapat_json)
          : rapatData.foto_rapat_json;
        if (Array.isArray(parsedFoto)) {
          fotoRapatList = parsedFoto.slice(0, 8).map(function (f) {
            return {
              file_id: String((f && f.file_id) || ''),
              url: String((f && f.url) || ''),
              caption: String((f && f.caption) || ''),
              file_name: String((f && f.file_name) || ''),
              thumb_data_uri: String((f && f.thumb_data_uri) || ''),
              preview_uri: String((f && f.thumb_data_uri) || ''),
              uploading: false
            };
          });
        }
      } catch (e) {}
    }
    renderFotoRapatPreview_();

    if (typeof window.clearRapatAudioSelection === 'function') {
      window.clearRapatAudioSelection(true);
    }
    var elAudioUrl = document.getElementById('rapatFieldAudioUrl');
    if (elAudioUrl) elAudioUrl.value = rapatData.audio_rapat_url || '';
    if (rapatData.audio_rapat_url) {
      var exDriveAudioId = extractDriveFileIdFromUrl_(rapatData.audio_rapat_url);
      rapatAudioState.driveFileId = exDriveAudioId;
      rapatAudioState.driveUrl = String(rapatData.audio_rapat_url || '').trim();
      if (exDriveAudioId) {
        rapatAudioState.fileName = 'Arsip Rekaman Google Drive';
      }
      var prevBox = document.getElementById('rapatAudioPreviewBox');
      var infoEl = document.getElementById('rapatAudioFileInfo');
      var plEl = document.getElementById('rapatAudioPlayer');
      var btnClearEl = document.getElementById('btnRapatClearAudio');
      if (prevBox) prevBox.classList.remove('hidden');
      if (plEl) plEl.classList.add('hidden');
      if (btnClearEl) btnClearEl.classList.remove('hidden');
      if (infoEl) infoEl.innerText = 'Arsip Rekaman Google Drive';
      setAudioDriveStatusBadge_('Arsip Drive Tersimpan', 'saved');
    } else {
      setAudioDriveStatusBadge_('Siap Analisa AI', 'ready');
    }

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
    if (rapatAudioState.recording && rapatAudioState.recorder) {
      try { rapatAudioState.recorder.stop(); } catch (e) {}
    } else {
      stopRapatRecordingTracks_();
    }
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
    if (isSubmittingRapat) return;
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

    var cleanPembahasanRows = pembahasanRowsList.map(function (r) {
      var norm = normalizePembahasanRow_(r);
      var nonEmptyItems = (norm.items || []).filter(function (sub) {
        return String(sub.uraian || '').trim() ||
          String(sub.tindak_lanjut || '').trim() ||
          String(sub.target || '').trim() ||
          String(sub.penanggung_jawab || '').trim() ||
          String(sub.tanggal_penyelesaian || '').trim();
      });
      norm.items = nonEmptyItems.length > 0 ? nonEmptyItems : [];
      syncPembahasanFlatFields_(norm);
      return norm;
    }).filter(function (r) {
      return String(r.pembicara_nama || '').trim() ||
        String(r.uraian || '').trim() ||
        String(r.tindak_lanjut || '').trim() ||
        String(r.target || '').trim() ||
        (Array.isArray(r.items) && r.items.length > 0);
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

    var nomorUndEl = document.getElementById('rapatFieldNomorUndangan');
    if (nomorUndEl && typeof window.syncNoUrutFromNomorUndangan === 'function') {
      window.syncNoUrutFromNomorUndangan(nomorUndEl.value);
    }

    var pejabatSelectEl = document.getElementById('rapatFieldPejabatTtdSelect');
    var pejabatSelectVal = pejabatSelectEl ? (pejabatSelectEl.value || '') : '';
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
      foto_rapat_json: serializeFotoRapatForFirestore_(),
      audio_rapat_url: (document.getElementById('rapatFieldAudioUrl') || {}).value || '',
      ai_transcript: (document.getElementById('rapatFieldAiTranscript') || {}).value || '',
      doc_undangan_url: (document.getElementById('rapatFieldDocUndanganUrl') || {}).value || '',
      doc_absen_url: (document.getElementById('rapatFieldDocAbsenUrl') || {}).value || '',
      doc_notulen_url: (document.getElementById('rapatFieldDocNotulenUrl') || {}).value || '',
      mysims_requested: ((document.getElementById('rapatFieldMysimsRequested') || {}).value === 'true'),
      mysims_status: (document.getElementById('rapatFieldMysimsStatus') || {}).value || '',
      mysims_idp: (document.getElementById('rapatFieldMysimsIdp') || {}).value || '',
      mysims_requested_at: (document.getElementById('rapatFieldMysimsRequestedAt') || {}).value || ''
    };

    var currentUser = (window.vueState && window.vueState.user) ? window.vueState.user : (typeof state !== 'undefined' ? state.user : null);
    var adminNip = (currentUser && currentUser.nip) || localStorage.getItem('transkep_active_nip') || '';
    var authToken = localStorage.getItem('transkep_session_token') || '';

    isSubmittingRapat = true;
    var btnSubmit = document.getElementById('btnRapatSaveAgenda');
    var btnCancel = document.getElementById('btnRapatCancelAgenda');
    var origBtnHtml = btnSubmit ? btnSubmit.innerHTML : '';

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.classList.add('opacity-60', 'cursor-not-allowed');
      btnSubmit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Menyimpan...</span>';
    }
    if (btnCancel) btnCancel.disabled = true;

    if (typeof showLoading === 'function') {
      showLoading(!payload.no_urut_surat && !payload.mysims_requested
        ? 'Menyimpan agenda rapat & meminta nomor MYSIMS...'
        : 'Menyimpan agenda rapat ke Cloud Firestore...');
    }

    try {
      var res = await window.EofficeDataService.saveRapatData(payload, adminNip, authToken);

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
          if (res.mysims_requested_now && res.mysims_res && res.mysims_res.status === 'success') {
            showNotify('Agenda Rapat Disimpan', 'Data tersimpan ke Firestore & permintaan nomor surat keluar Undangan MYSIMS sedang diproses otomatis.', 'success');
          } else if (res.mysims_requested_now && res.mysims_res && res.mysims_res.status === 'error') {
            showNotify('Disimpan (MYSIMS Tertunda)', 'Data tersimpan di Firestore, namun gagal meminta nomor MYSIMS: ' + (res.mysims_res.message || 'Cek koneksi n8n.'), 'warning');
          } else {
            showNotify('Agenda Rapat Disimpan', 'Data rapat berhasil disimpan ke Cloud Firestore. Gunakan tombol cetak di tabel E-Office.', 'success');
          }
        }
      } else {
        if (typeof showNotify === 'function') {
          showNotify('Gagal Menyimpan', (res ? res.message : 'Terjadi kendala saat menyimpan agenda rapat.'), 'error');
        }
      }
    } catch (err) {
      console.error('Error save rapat:', err);
      if (typeof showNotify === 'function') {
        showNotify('Error Sistem', err.toString(), 'error');
      }
    } finally {
      isSubmittingRapat = false;
      if (typeof hideLoading === 'function') hideLoading();
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.classList.remove('opacity-60', 'cursor-not-allowed');
        if (origBtnHtml) btnSubmit.innerHTML = origBtnHtml;
      }
      if (btnCancel) btnCancel.disabled = false;
    }
  };
})();
