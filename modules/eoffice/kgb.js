// ==========================================
// FILE: kgb.js (Modul Form SK KGB)
// DESKRIPSI: Logika Form, Auto-Prefill Siklus 2 Tahunan & Live Generator KGB
// ENGINE: TRANSKEP Core v1.0.0
// ==========================================

// ALGORITMA KONVERSI ANGKA KE TERBILANG BAHASA INDONESIA
function terbilangAngka(angka) {
  var bilangan = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
  angka = Math.floor(Math.abs(Number(angka)));
  if (isNaN(angka)) return "";
  if (angka < 12) return bilangan[angka];
  if (angka < 20) return terbilangAngka(angka - 10) + " belas";
  if (angka < 100) return terbilangAngka(Math.floor(angka / 10)) + " puluh " + terbilangAngka(angka % 10);
  if (angka < 200) return "seratus " + terbilangAngka(angka - 100);
  if (angka < 1000) return terbilangAngka(Math.floor(angka / 100)) + " ratus " + terbilangAngka(angka % 100);
  if (angka < 2000) return "seribu " + terbilangAngka(angka - 1000);
  if (angka < 1000000) return terbilangAngka(Math.floor(angka / 1000)) + " ribu " + terbilangAngka(angka % 1000);
  if (angka < 1000000000) return terbilangAngka(Math.floor(angka / 1000000)) + " juta " + terbilangAngka(angka % 1000000);
  if (angka < 1000000000000) return terbilangAngka(Math.floor(angka / 1000000000)) + " milyar " + terbilangAngka(angka % 1000000000);
  return "";
}

function terbilangRupiah(nominal) {
  if (!nominal) return "";
  var clean = String(nominal).replace(/[^0-9]/g, "");
  if (!clean) return "";
  var hasil = terbilangAngka(clean).replace(/\s+/g, " ").trim();
  return hasil ? hasil + " rupiah" : "";
}

function formatBulanRomawi(bulanNum) {
  var romawi = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  return romawi[bulanNum] || "X";
}

function extractBulanTahunKgbLocal(tglStr) {
  if (window.KgbPrintHelper && typeof window.KgbPrintHelper.extractBulanTahunDariTanggalKgb === 'function') {
    return window.KgbPrintHelper.extractBulanTahunDariTanggalKgb(tglStr);
  }
  var namaBulan = ["januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember"];
  var now = new Date();
  var romawi = formatBulanRomawi(now.getMonth());
  var tahun = String(now.getFullYear());
  if (!tglStr) return { bulan: romawi, tahun: tahun };

  var s = String(tglStr).trim();
  var yMatch = s.match(/\b(20\d{2})\b/);
  if (yMatch) tahun = yMatch[1];

  var lower = s.toLowerCase();
  for (var i = 0; i < namaBulan.length; i++) {
    if (lower.indexOf(namaBulan[i]) !== -1) {
      return { bulan: formatBulanRomawi(i), tahun: tahun };
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    var mIdx = parseInt(s.split('-')[1], 10) - 1;
    if (mIdx >= 0 && mIdx <= 11) romawi = formatBulanRomawi(mIdx);
  }
  return { bulan: romawi, tahun: tahun };
}

function parseMasaKerjaKgbLocal(thnVal, blnVal, combinedStr) {
  if (window.KgbPrintHelper && typeof window.KgbPrintHelper.resolveMasaKerjaKgb === 'function') {
    return window.KgbPrintHelper.resolveMasaKerjaKgb(thnVal, blnVal, combinedStr);
  }
  if (thnVal !== undefined && thnVal !== null && String(thnVal).trim() !== '') {
    return {
      tahun: String(thnVal).trim(),
      bulan: (blnVal !== undefined && blnVal !== null && String(blnVal).trim() !== '') ? String(blnVal).trim() : '0'
    };
  }
  var raw = String(combinedStr || '').trim();
  if (!raw) return { tahun: '', bulan: '' };
  var nums = raw.match(/\d+/g);
  return {
    tahun: (nums && nums[0]) ? nums[0] : '',
    bulan: (nums && nums[1]) ? nums[1] : '0'
  };
}

function generateNomorKgbOtomatis(noUrut, tglSurat) {
  var bt = extractBulanTahunKgbLocal(tglSurat);
  var prefix = (noUrut && String(noUrut).trim() !== '') ? String(noUrut).trim() : '...';
  return prefix + "/KPA.W10-A2/KP2.1.2/" + bt.bulan + "/" + bt.tahun;
}

function formatTanggalIndoKgb(dateObj) {
  if (!dateObj) return "";
  if (typeof dateObj === 'string' && /[a-zA-Z]{3,}/.test(dateObj) && dateObj.indexOf('T') === -1) {
    return dateObj.trim();
  }
  var d = new Date(dateObj);
  if (isNaN(d.getTime())) return String(dateObj);
  var namaBulan = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  return d.getDate() + " " + namaBulan[d.getMonth()] + " " + d.getFullYear();
}

function hitungTmtYadOtomatis(tmtBaruStr) {
  if (!tmtBaruStr) return "";
  var matchYear = String(tmtBaruStr).match(/\b(20\d{2})\b/);
  if (matchYear) {
    var y = parseInt(matchYear[1], 10);
    var nextY = y + 2;
    return String(tmtBaruStr).replace(String(y), String(nextY));
  }
  return "";
}

// ==========================================
// EVENT LISTENER INPUT LIVE DI MODAL KGB
// ==========================================
function syncNomorSuratKgbOtomatis() {
  var elNoKgb = document.getElementById('kgbFieldNoKgb');
  var elTglSurat = document.getElementById('kgbFieldTanggalSurat');
  var elNoSurat = document.getElementById('kgbFieldNomorSurat');
  if (!elNoSurat) return;

  var noUrut = elNoKgb ? elNoKgb.value.trim() : '';
  var tglSurat = elTglSurat ? elTglSurat.value.trim() : '';
  elNoSurat.value = generateNomorKgbOtomatis(noUrut, tglSurat);
}

function syncMkgCombinedFields() {
  var elThnLama = document.getElementById('kgbFieldTahunLama');
  var elBlnLama = document.getElementById('kgbFieldBulanLama');
  var elMkgLama = document.getElementById('kgbFieldMkgLama');

  var elThnBaru = document.getElementById('kgbFieldTahunBaru');
  var elBlnBaru = document.getElementById('kgbFieldBulanBaru');
  var elMkgBaru = document.getElementById('kgbFieldMkgBaru');

  if (elThnBaru && document.activeElement === elThnBaru) {
    elThnBaru.dataset.auto = "false";
  }

  if (elMkgLama) {
    var tl = elThnLama && elThnLama.value !== '' ? elThnLama.value.trim() : '';
    var bl = elBlnLama && elBlnLama.value !== '' ? elBlnLama.value.trim() : '0';
    elMkgLama.value = tl !== '' ? (tl + " Tahun " + bl + " Bulan") : '';
  }

  if (elMkgBaru) {
    var tb = elThnBaru && elThnBaru.value !== '' ? elThnBaru.value.trim() : '';
    var bb = elBlnBaru && elBlnBaru.value !== '' ? elBlnBaru.value.trim() : '0';
    elMkgBaru.value = tb !== '' ? (tb + " Tahun " + bb + " Bulan") : '';
  }
}

function handleTahunLamaInput(val) {
  var elThnBaru = document.getElementById('kgbFieldTahunBaru');
  var elBlnLama = document.getElementById('kgbFieldBulanLama');
  var elBlnBaru = document.getElementById('kgbFieldBulanBaru');

  if (elThnBaru && (!elThnBaru.value || elThnBaru.dataset.auto === "true")) {
    var parsed = parseInt(val, 10);
    if (!isNaN(parsed)) {
      elThnBaru.value = String(parsed + 2);
      elThnBaru.dataset.auto = "true";
      if (elBlnBaru && (!elBlnBaru.value || elBlnBaru.value === '0') && elBlnLama && elBlnLama.value) {
        elBlnBaru.value = elBlnLama.value;
      }
    }
  }
  syncMkgCombinedFields();
}

function handleGajiBaruInput(val) {
  var fieldTerbilang = document.getElementById('kgbFieldTerbilang');
  if (fieldTerbilang) {
    fieldTerbilang.value = terbilangRupiah(val);
  }
}

function handleTmtBaruChange(val) {
  var fieldYad = document.getElementById('kgbFieldTmtYad');
  if (fieldYad && (!fieldYad.value || fieldYad.dataset.auto === "true")) {
    fieldYad.value = hitungTmtYadOtomatis(val);
    fieldYad.dataset.auto = "true";
  }
}

// ==========================================
// BUKA & TUTUP MODAL DETAIL KGB
// ==========================================
window.openKgbModalForm = function(kgbData) {
  var modal = document.getElementById('modalDetailKGB');
  if (!modal) return;

  var working = Object.assign({}, kgbData || {});
  var nip = String(working.nip || '').trim();

  // Cari data pegawai dari state global
  var uList = (window.vueState && window.vueState.usersList)
    ? window.vueState.usersList
    : (typeof state !== 'undefined' ? state.usersList : []);
  var userObj = Array.isArray(uList)
    ? uList.find(function(u) { return String(u.nip) === nip; })
    : null;

  // Cari Nama Ketua Pengadilan Agama Indramayu (bukan Wakil Ketua) untuk penandatangan
  var ketuaObj = Array.isArray(uList)
    ? (uList.find(function(u) {
        return u.jabatan && u.jabatan.toLowerCase().indexOf('ketua') !== -1 && u.jabatan.toLowerCase().indexOf('wakil') === -1;
      }) || uList.find(function(u) {
        return u.jabatan && u.jabatan.toLowerCase().indexOf('ketua') !== -1;
      }))
    : null;
  var defaultNamaKetua = ketuaObj ? String(ketuaObj.nama || '').trim() : '';

  // ==========================================
  // SMART HISTORICAL AUTO-PREFILL (SIKLUS 2 TAHUNAN)
  // ==========================================
  var wasAutoPrefilled = Boolean(working.is_from_dashboard && working.gaji_lama && working.nomor_sk_lama);
  var rawStatusLower = String(working.status || '').trim().toLowerCase();

  if (rawStatusLower !== 'selesai' && !working.gaji_lama && window.EofficeDataService && typeof window.EofficeDataService.findLastCompletedKgb === 'function') {
    var prevKgb = window.EofficeDataService.findLastCompletedKgb(nip, working.id_kgb);
    if (prevKgb) {
      working.tanggal_lahir = working.tanggal_lahir || prevKgb.tanggal_lahir || '';
      working.golongan = working.golongan || prevKgb.golongan || '';
      working.gaji_lama = prevKgb.gaji_baru || prevKgb.gaji_lama || '';
      working.pejabat_lama = 'Ketua Pengadilan Agama Indramayu';
      working.nomor_sk_lama = prevKgb.nomor_surat || '';
      working.tanggal_sk_lama = prevKgb.tanggal_surat || '';
      working.tmt_lama = prevKgb.tmt_baru || working.tmt_lama || '';

      var prevMkg = parseMasaKerjaKgbLocal(prevKgb.tahun_baru, prevKgb.bulan_baru, prevKgb.mkg_baru);
      if (prevMkg.tahun !== '') {
        working.tahun_lama = prevMkg.tahun;
        working.bulan_lama = prevMkg.bulan || '0';
        working.mkg_lama = prevMkg.tahun + ' Tahun ' + (prevMkg.bulan || '0') + ' Bulan';
        var parsedPrevThn = parseInt(prevMkg.tahun, 10);
        if (!working.tahun_baru && !isNaN(parsedPrevThn)) {
          working.tahun_baru = String(parsedPrevThn + 2);
          working.bulan_baru = prevMkg.bulan || '0';
        }
      }

      if (prevKgb.tmt_yad) {
        working.tmt_baru = prevKgb.tmt_yad;
      }
      wasAutoPrefilled = true;
    }
  }

  var prefillBadge = document.getElementById('kgbAutoPrefillBadge');
  if (prefillBadge) {
    if (wasAutoPrefilled) {
      prefillBadge.classList.remove('hidden');
    } else {
      prefillBadge.classList.add('hidden');
    }
  }

  // Ekstrak Pangkat & Golongan otomatis jika golongan masih kosong tetapi ada di dalam kurung Pangkat (misal "Pembina (IV/a)")
  var rawPangkat = working.pangkat || (userObj ? userObj.pangkat : '') || '';
  var rawGolongan = working.golongan || (userObj ? userObj.golongan : '') || '';
  if (!rawGolongan && rawPangkat) {
    var golMatch = String(rawPangkat).match(/\(([IVX]{1,4}\/[a-e])\)/i);
    if (golMatch) {
      rawGolongan = golMatch[1];
    }
  }

  var tmtBaruVal = formatTanggalIndoKgb(working.tmt_baru || '');
  var permanentOrExistingId = working.id_kgb || (
    window.EofficeDataService && typeof window.EofficeDataService.buildPermanentKgbId === 'function'
      ? window.EofficeDataService.buildPermanentKgbId(nip, working.tmt_baru)
      : ('KGB-' + nip)
  );

  // Hidden Metadata Fields
  document.getElementById('kgbFieldIdKgb').value = permanentOrExistingId;
  document.getElementById('kgbFieldNip').value = nip;
  var elStatus = document.getElementById('kgbFieldStatus');
  if (elStatus) elStatus.value = working.status || 'Sedang Diproses';
  var elDocUrl = document.getElementById('kgbFieldFileDocUrl');
  if (elDocUrl) elDocUrl.value = working.file_doc_url || '';
  var elPdfUrl = document.getElementById('kgbFieldFilePdfUrl');
  if (elPdfUrl) elPdfUrl.value = working.file_pdf_url || '';

  // Identitas Pegawai
  document.getElementById('kgbDisplayNip').value = nip;
  document.getElementById('kgbFieldNama').value = working.nama_pegawai || (userObj ? userObj.nama : '');
  document.getElementById('kgbFieldTglLahir').value = formatTanggalIndoKgb(working.tanggal_lahir || (userObj ? (userObj.tgl_lahir || userObj.tanggal_lahir || '') : ''));
  document.getElementById('kgbFieldPangkat').value = rawPangkat;
  document.getElementById('kgbFieldGolongan').value = rawGolongan;
  document.getElementById('kgbFieldJabatan').value = working.jabatan || (userObj ? userObj.jabatan : '');
  document.getElementById('kgbFieldUnitKerja').value = working.unit_kerja || 'Pengadilan Agama Indramayu Kelas 1.A.';

  // Identitas Surat Dinas (No Urut KGB & Nomor Lengkap)
  var tglSuratVal = working.tanggal_surat ? formatTanggalIndoKgb(working.tanggal_surat) : formatTanggalIndoKgb(new Date());
  var noKgbVal = String(working.nokgb || '').trim();
  if (!noKgbVal && working.nomor_surat && String(working.nomor_surat).indexOf('/') !== -1) {
    var firstSeg = String(working.nomor_surat).split('/')[0].trim();
    if (firstSeg && firstSeg !== '...' && firstSeg !== '......') {
      noKgbVal = firstSeg;
    }
  }
  var elNoKgb = document.getElementById('kgbFieldNoKgb');
  if (elNoKgb) elNoKgb.value = noKgbVal;
  document.getElementById('kgbFieldTanggalSurat').value = tglSuratVal;
  document.getElementById('kgbFieldNomorSurat').value = working.nomor_surat || generateNomorKgbOtomatis(noKgbVal, tglSuratVal);
  document.getElementById('kgbFieldTujuanKppn').value = working.tujuan_kppn || 'Kepala Kantor Pelayanan Perbendaharaan Negara Cirebon di- CIREBON';

  // Data SK Lama
  document.getElementById('kgbFieldGajiLama').value = working.gaji_lama || '';
  document.getElementById('kgbFieldPejabatLama').value = working.pejabat_lama || 'Ketua Pengadilan Agama Indramayu';
  document.getElementById('kgbFieldNomorSkLama').value = working.nomor_sk_lama || '';
  document.getElementById('kgbFieldTanggalSkLama').value = formatTanggalIndoKgb(working.tanggal_sk_lama || '');
  document.getElementById('kgbFieldTmtLama').value = formatTanggalIndoKgb(working.tmt_lama || '');

  var mkgLamaObj = (working.tahun_lama !== undefined || working.mkg_lama)
    ? parseMasaKerjaKgbLocal(working.tahun_lama, working.bulan_lama, working.mkg_lama)
    : { tahun: '', bulan: '' };
  var elThnLama = document.getElementById('kgbFieldTahunLama');
  var elBlnLama = document.getElementById('kgbFieldBulanLama');
  if (elThnLama) elThnLama.value = (mkgLamaObj.tahun !== '' && !( !working.tahun_lama && !working.mkg_lama )) ? mkgLamaObj.tahun : '';
  if (elBlnLama) elBlnLama.value = (mkgLamaObj.tahun !== '' && !( !working.tahun_lama && !working.mkg_lama )) ? (mkgLamaObj.bulan || '0') : '';

  // Data KGB Baru
  document.getElementById('kgbFieldGajiBaru').value = working.gaji_baru || '';
  document.getElementById('kgbFieldTerbilang').value = working.terbilang_gaji || terbilangRupiah(working.gaji_baru);

  var mkgBaruObj = (working.tahun_baru !== undefined || working.mkg_baru)
    ? parseMasaKerjaKgbLocal(working.tahun_baru, working.bulan_baru, working.mkg_baru)
    : { tahun: '', bulan: '' };
  var elThnBaru = document.getElementById('kgbFieldTahunBaru');
  var elBlnBaru = document.getElementById('kgbFieldBulanBaru');
  if (elThnBaru) {
    var hasExplicitBaru = Boolean(working.tahun_baru || working.mkg_baru);
    if (hasExplicitBaru) {
      elThnBaru.value = mkgBaruObj.tahun;
      elThnBaru.dataset.auto = wasAutoPrefilled ? "true" : "false";
    } else if (elThnLama && elThnLama.value !== '' && !isNaN(parseInt(elThnLama.value, 10))) {
      elThnBaru.value = String(parseInt(elThnLama.value, 10) + 2);
      elThnBaru.dataset.auto = "true";
    } else {
      elThnBaru.value = '';
      elThnBaru.dataset.auto = "true";
    }
  }
  if (elBlnBaru) {
    elBlnBaru.value = (working.bulan_baru !== undefined && working.bulan_baru !== '')
      ? working.bulan_baru
      : (mkgBaruObj.bulan || (elBlnLama && elBlnLama.value ? elBlnLama.value : '0'));
  }

  syncMkgCombinedFields();

  document.getElementById('kgbFieldTmtBaru').value = tmtBaruVal;
  var tmtYadVal = working.tmt_yad ? formatTanggalIndoKgb(working.tmt_yad) : hitungTmtYadOtomatis(tmtBaruVal);
  var elTmtYad = document.getElementById('kgbFieldTmtYad');
  elTmtYad.value = tmtYadVal;
  elTmtYad.dataset.auto = working.tmt_yad ? "false" : "true";

  document.getElementById('kgbFieldNamaKetua').value = working.nama_ketua || defaultNamaKetua;
  document.getElementById('kgbFieldDasarPp').value = working.dasar_pp || 'Peraturan Pemerintah Republik Indonesia Nomor : 05 Tahun 2024';

  // Update Badge Status (3 Status Siklus KGB)
  var badge = document.getElementById('kgbBadgeStatus');
  if (badge) {
    var st = working.status || 'Sedang Diproses';
    if (st === 'Selesai') {
      badge.innerText = 'Selesai / Arsip';
      badge.className = 'px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400';
    } else if (st === 'Menunggu TTE Pimpinan') {
      badge.innerText = 'Menunggu TTE Pimpinan';
      badge.className = 'px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 text-amber-400';
    } else {
      badge.innerText = 'Draf Sedang Diproses';
      badge.className = 'px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-blue-500/10 border border-blue-500/20 text-blue-400';
    }
  }

  // Tampilkan Modal
  modal.classList.remove('hidden');
  setTimeout(function() {
    modal.classList.remove('opacity-0');
    modal.firstElementChild.classList.remove('scale-95');
  }, 10);
};

function closeKgbModalForm() {
  var modal = document.getElementById('modalDetailKGB');
  if (!modal) return;
  modal.classList.add('opacity-0');
  modal.firstElementChild.classList.add('scale-95');
  setTimeout(function() {
    modal.classList.add('hidden');
  }, 300);
}

// ==========================================
// HELPER KOLEKSI PAYLOAD FORM & CETAK LANGSUNG DARI MODAL
// ==========================================
function collectKgbFormPayload_() {
  syncMkgCombinedFields();

  var tglSurat = document.getElementById('kgbFieldTanggalSurat').value;
  var bt = extractBulanTahunKgbLocal(tglSurat);
  var elNoKgb = document.getElementById('kgbFieldNoKgb');
  var noSurat = document.getElementById('kgbFieldNomorSurat').value;
  var noKgb = elNoKgb ? elNoKgb.value.trim() : '';
  if (!noKgb && noSurat && noSurat.indexOf('/') !== -1) {
    var seg0 = noSurat.split('/')[0].trim();
    if (seg0 !== '...' && seg0 !== '......') noKgb = seg0;
  }

  var elStatus = document.getElementById('kgbFieldStatus');
  var elDocUrl = document.getElementById('kgbFieldFileDocUrl');
  var elPdfUrl = document.getElementById('kgbFieldFilePdfUrl');
  var elThnLama = document.getElementById('kgbFieldTahunLama');
  var elBlnLama = document.getElementById('kgbFieldBulanLama');
  var elThnBaru = document.getElementById('kgbFieldTahunBaru');
  var elBlnBaru = document.getElementById('kgbFieldBulanBaru');

  return {
    id_kgb: document.getElementById('kgbFieldIdKgb').value,
    nip: document.getElementById('kgbFieldNip').value,
    status: elStatus ? elStatus.value : 'Sedang Diproses',
    file_doc_url: elDocUrl ? elDocUrl.value : '',
    file_pdf_url: elPdfUrl ? elPdfUrl.value : '',
    nokgb: noKgb,
    bulan_surat: bt.bulan,
    tahun_surat: bt.tahun,
    nomor_surat: noSurat,
    tanggal_surat: tglSurat,
    tujuan_kppn: document.getElementById('kgbFieldTujuanKppn').value,
    nama_pegawai: document.getElementById('kgbFieldNama').value,
    tanggal_lahir: document.getElementById('kgbFieldTglLahir').value,
    pangkat: document.getElementById('kgbFieldPangkat').value,
    golongan: document.getElementById('kgbFieldGolongan').value,
    jabatan: document.getElementById('kgbFieldJabatan').value,
    unit_kerja: document.getElementById('kgbFieldUnitKerja').value,
    gaji_lama: document.getElementById('kgbFieldGajiLama').value,
    pejabat_lama: document.getElementById('kgbFieldPejabatLama').value,
    nomor_sk_lama: document.getElementById('kgbFieldNomorSkLama').value,
    tanggal_sk_lama: document.getElementById('kgbFieldTanggalSkLama').value,
    tmt_lama: document.getElementById('kgbFieldTmtLama').value,
    tahun_lama: elThnLama ? elThnLama.value : '',
    bulan_lama: elBlnLama ? elBlnLama.value : '0',
    mkg_lama: document.getElementById('kgbFieldMkgLama').value,
    gaji_baru: document.getElementById('kgbFieldGajiBaru').value,
    terbilang_gaji: document.getElementById('kgbFieldTerbilang').value,
    tahun_baru: elThnBaru ? elThnBaru.value : '',
    bulan_baru: elBlnBaru ? elBlnBaru.value : '0',
    mkg_baru: document.getElementById('kgbFieldMkgBaru').value,
    tmt_baru: document.getElementById('kgbFieldTmtBaru').value,
    tmt_yad: document.getElementById('kgbFieldTmtYad').value,
    nama_ketua: document.getElementById('kgbFieldNamaKetua').value,
    dasar_pp: document.getElementById('kgbFieldDasarPp').value
  };
}

function printKgbFromModal() {
  var payload = collectKgbFormPayload_();
  if (typeof window.printSuratKgb === 'function') {
    window.printSuratKgb(payload);
  } else if (typeof showNotify === 'function') {
    showNotify("Modul Cetak KGB", "Komponen cetak SK KGB belum siap dimuat.", "warning");
  }
}

// ==========================================
// SUBMIT FORM KGB: SIMPAN DATA / GENERATE GOOGLE DOCS
// ==========================================
async function submitKgbForm(actionType) {
  var payload = collectKgbFormPayload_();

  if (!payload.nip || !payload.nama_pegawai) {
    if (typeof showNotify === 'function') showNotify("Peringatan", "Nama dan NIP Pegawai wajib diisi.", "warning");
    return;
  }

  if (actionType === 'generate' && !payload.gaji_baru) {
    if (typeof showNotify === 'function') showNotify("Peringatan", "Nominal Gaji Pokok Baru wajib diisi sebelum menerbitkan Google Docs.", "warning");
    return;
  }

  var token = localStorage.getItem('transkep_session_token') || '';
  var currentUser = (window.vueState && window.vueState.user) ? window.vueState.user : (typeof state !== 'undefined' ? state.user : null);
  var adminNip = (currentUser && currentUser.nip) || localStorage.getItem('transkep_active_nip') || '';

  var btnDoc = document.getElementById('btnKgbGenerateDoc');
  var btnDraft = document.getElementById('btnKgbSaveDraft');
  if (btnDoc) btnDoc.disabled = true;
  if (btnDraft) btnDraft.disabled = true;

  if (typeof showLoading === 'function') {
    showLoading(actionType === 'generate' ? "Menerbitkan SK KGB ke Folder Google Drive..." : "Menyimpan data KGB ke Cloud Firestore...");
  }

  try {
    var res = await window.EofficeDataService.saveOrGenerateKgb(payload, actionType, adminNip, token);
    if (typeof hideLoading === 'function') hideLoading();
    if (btnDoc) btnDoc.disabled = false;
    if (btnDraft) btnDraft.disabled = false;

    if (res && res.status === 'success') {
      closeKgbModalForm();
      if (typeof showNotify === 'function') {
        showNotify(
          "Sukses",
          actionType === 'generate' ? "SK KGB berhasil diterbitkan ke Folder Google Drive!" : "Data KGB berhasil disimpan.",
          "success"
        );
      }
      if (typeof window.refreshEofficeData === 'function') {
        window.refreshEofficeData();
      }
    } else if (typeof showNotify === 'function') {
      showNotify("Gagal", (res ? res.message : "Terjadi kendala saat menyimpan berkas KGB."), "error");
    }
  } catch (err) {
    if (typeof hideLoading === 'function') hideLoading();
    if (btnDoc) btnDoc.disabled = false;
    if (btnDraft) btnDraft.disabled = false;
    console.error("Error save KGB: ", err);
    if (typeof showNotify === 'function') {
      showNotify("Error Sistem", err.toString(), "error");
    }
  }
}

// Ekspos seluruh handler ke global window untuk atribut HTML inline
window.terbilangRupiah = terbilangRupiah;
window.syncNomorSuratKgbOtomatis = syncNomorSuratKgbOtomatis;
window.syncMkgCombinedFields = syncMkgCombinedFields;
window.handleTahunLamaInput = handleTahunLamaInput;
window.handleGajiBaruInput = handleGajiBaruInput;
window.handleTmtBaruChange = handleTmtBaruChange;
window.closeKgbModalForm = closeKgbModalForm;
window.printKgbFromModal = printKgbFromModal;
window.submitKgbForm = submitKgbForm;
