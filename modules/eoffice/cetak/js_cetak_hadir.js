// ==========================================
// FILE: modules/eoffice/cetak/js_cetak_hadir.js
// DESKRIPSI: Mesin Render & Cetak Instan (0ms) Daftar Hadir Rapat PA Indramayu
// STANDAR: Kertas A4 Portrait (210mm x 297mm) | Font 12pt Bookman Old Style
// FITUR: Tanpa Kop Surat | Kolom Nama/Jabatan Kosong Tulis Tangan | Zig-Zag TTD | Maks. 48 Baris
// ==========================================

(function (global) {
  'use strict';

  function escHtmlHadir_(v) {
    if (typeof global.escHtml === 'function') return global.escHtml(v);
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]);
    });
  }

  function getUsersListHadir_() {
    if (global.vueState && Array.isArray(global.vueState.usersList)) return global.vueState.usersList;
    if (typeof state !== 'undefined' && Array.isArray(state.usersList)) return state.usersList;
    return [];
  }

  function extractTanggalSaja(hariTglStr) {
    var raw = String(hariTglStr || '').trim();
    if (!raw) return '-';
    var commaIdx = raw.indexOf(',');
    if (commaIdx !== -1) {
      return raw.slice(commaIdx + 1).trim() || raw;
    }
    return raw;
  }

  function resolvePegawaiByNipOrName_(nip, textFallback) {
    var uList = getUsersListHadir_();
    var cleanNip = String(nip || '').trim();
    if (cleanNip) {
      var found = uList.find(function (u) { return String(u.nip || '') === cleanNip; });
      if (found) return found;
    }
    var txt = String(textFallback || '').trim();
    if (txt) {
      var lowTxt = txt.toLowerCase();
      return uList.find(function (u) {
        var uName = String(u.nama || '').toLowerCase();
        var uJab = String(u.jabatan || '').toLowerCase();
        return (uName && lowTxt.indexOf(uName) !== -1) || (uJab && lowTxt === uJab);
      }) || null;
    }
    return null;
  }

  function resolvePimpinanDanNotulisHadir(rapatObj) {
    var r = rapatObj || {};
    var pemUser = resolvePegawaiByNipOrName_(r.pemimpin_nip, r.pemimpin);
    var notUser = resolvePegawaiByNipOrName_(r.notulis_nip, r.notulis);

    var jabPem = String(r.pemimpin_jabatan || (pemUser && pemUser.jabatan) || r.pemimpin || 'Ketua').trim();
    jabPem = jabPem.replace(/\s*Pengadilan Agama Indramayu/gi, '').trim() || 'Ketua';
    if (r.pemimpin && r.pemimpin !== jabPem && !/pengadilan agama/i.test(r.pemimpin) && r.pemimpin.length <= 50) {
      // Gunakan label jabatan custom dari form jika ringkas (misal "Ketua Tim Penilai PIPK / Wakil Ketua")
      if (!pemUser || String(pemUser.nama || '').toLowerCase() !== String(r.pemimpin || '').toLowerCase()) {
        jabPem = String(r.pemimpin).trim();
      }
    }

    var namaPem = String((pemUser && pemUser.nama) || r.pemimpin || '....................................................').trim();
    var nipPem = String(r.pemimpin_nip || (pemUser && pemUser.nip) || '').trim();

    var namaNot = String(r.notulis || (notUser && notUser.nama) || '....................................................').trim();
    var nipNot = String(r.notulis_nip || (notUser && notUser.nip) || '').trim();

    return {
      jabatanPimpinan: jabPem,
      namaPimpinan: namaPem,
      nipPimpinan: nipPem,
      nipPimpinanHtml: nipPem ? '<div>NIP. ' + escHtmlHadir_(nipPem) + '</div>' : '',
      namaNotulis: namaNot,
      nipNotulis: nipNot,
      nipNotulisHtml: nipNot ? '<div>NIP. ' + escHtmlHadir_(nipNot) + '</div>' : ''
    };
  }

  function buildHadirRowsHtml(jumlahBaris) {
    var parsed = parseInt(jumlahBaris, 10);
    var total = (!isNaN(parsed) && parsed >= 1) ? Math.min(48, parsed) : 15;
    var html = '';

    for (var i = 1; i <= total; i++) {
      var isOdd = (i % 2) === 1;
      var ttdStyle = isOdd
        ? 'text-align: left; padding-left: 6px; font-size: 11pt;'
        : 'text-align: left; padding-left: 52%; font-size: 11pt;';
      html +=
        '<tr class="hadir-data-row">' +
          '<td style="text-align: center;">' + i + '</td>' +
          '<td>&nbsp;</td>' +
          '<td>&nbsp;</td>' +
          '<td style="' + ttdStyle + '">' + i + '</td>' +
        '</tr>';
    }
    return html;
  }

  function buildDaftarHadirHtml(rapatObj, templateHtml) {
    var r = rapatObj || {};
    var html = String(templateHtml || '');
    var ttd = resolvePimpinanDanNotulisHadir(r);
    var tglSaja = extractTanggalSaja(r.hari_tanggal);
    var waktuTampil = String(r.waktu_mulai || '08:00 WIB').trim();
    if (r.waktu_selesai && String(r.waktu_selesai).trim().toLowerCase() !== 'selesai') {
      waktuTampil += ' s.d ' + String(r.waktu_selesai).trim();
    }

    var replacements = {
      '{{jenis_kegiatan}}': escHtmlHadir_(r.jenis_kegiatan || 'Rapat'),
      '{{nama_kegiatan}}': escHtmlHadir_(r.agenda || '-'),
      '{{hari_tanggal_rapat}}': escHtmlHadir_(r.hari_tanggal || '-'),
      '{{waktu_rapat}}': escHtmlHadir_(waktuTampil),
      '{{tempat_rapat}}': escHtmlHadir_(r.tempat || 'Ruang Rapat Pimpinan'),
      '{{baris_kosong_hadir_html}}': buildHadirRowsHtml(r.jumlah_baris_hadir || 15),
      '{{jabatan_pimpinan_hadir}}': escHtmlHadir_(ttd.jabatanPimpinan),
      '{{nama_pimpinan_hadir}}': escHtmlHadir_(ttd.namaPimpinan),
      '{{nip_pimpinan_hadir_html}}': ttd.nipPimpinanHtml,
      '{{tanggal_saja_rapat}}': escHtmlHadir_(tglSaja),
      '{{nama_notulis_hadir}}': escHtmlHadir_(ttd.namaNotulis),
      '{{nip_notulis_hadir_html}}': ttd.nipNotulisHtml
    };

    for (var key in replacements) {
      if (Object.prototype.hasOwnProperty.call(replacements, key)) {
        html = html.split(key).join(replacements[key]);
      }
    }
    return html;
  }

  function printDaftarHadirRapat(rapatObj) {
    if (!rapatObj) {
      if (typeof showNotify === 'function') showNotify('Gagal', 'Data Rapat tidak ditemukan untuk dicetak.', 'error');
      return;
    }

    var template = document.getElementById('template-cetak-hadir-container');
    if (!template) {
      if (typeof showNotify === 'function') showNotify('Template Belum Siap', 'Template cetak Daftar Hadir belum dimuat di DOM.', 'warning');
      return;
    }

    if (typeof showLoading === 'function') showLoading('Menyiapkan Daftar Hadir Rapat...');

    var renderedInner = buildDaftarHadirHtml(rapatObj, template.innerHTML);
    var docTitle = 'Daftar_Hadir_' + String(rapatObj.agenda || 'Rapat').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    var finalHTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escHtmlHadir_(docTitle) + '</title>' +
      '<style>@page{size:A4 portrait;margin:0mm !important;}</style></head><body>' +
      renderedInner + '</body></html>';

    var iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    var doc = iframe.contentWindow.document;
    doc.open();
    doc.write(finalHTML);
    doc.close();

    setTimeout(function () {
      if (typeof hideLoading === 'function') hideLoading();
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(function () {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 3500);
    }, 600);
  }

  global.printDaftarHadirRapat = printDaftarHadirRapat;
  global.HadirPrintHelper = {
    extractTanggalSaja: extractTanggalSaja,
    resolvePimpinanDanNotulisHadir: resolvePimpinanDanNotulisHadir,
    buildHadirRowsHtml: buildHadirRowsHtml,
    buildDaftarHadirHtml: buildDaftarHadirHtml
  };
})(typeof window !== 'undefined' ? window : this);
