// ==========================================
// FILE: modules/eoffice/cetak/js_cetak_undangan.js
// DESKRIPSI: Mesin Render & Cetak Instan (0ms) Surat Undangan Rapat PA Indramayu
// STANDAR: Kertas A4 Portrait (210mm x 297mm) | Font 12pt Bookman Old Style
// LOGIKA: 1-3 Tujuan = 1 Lembar | >3 Tujuan = 2 Lembar + Halaman Lampiran (11pt / 9pt)
// ==========================================

(function (global) {
  'use strict';

  var BULAN_INDO_UND = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  function escHtmlUnd_(v) {
    if (typeof global.escHtml === 'function') return global.escHtml(v);
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]);
    });
  }

  function getUsersListUnd_() {
    if (global.vueState && Array.isArray(global.vueState.usersList)) return global.vueState.usersList;
    if (typeof state !== 'undefined' && Array.isArray(state.usersList)) return state.usersList;
    return [];
  }

  function stripGelarUndangan(nama) {
    if (!nama) return '';
    var s = String(nama).trim();
    if (!s || s === '-') return '-';
    // Hapus gelar depan berulang: H., Hj., Drs., Dra., Dr., K.H., Prof., Ir.
    s = s.replace(/^(?:(?:H\.|Hj\.|Drs\.|Dra\.|Dr\.|K\.H\.|Prof\.|Ir\.|H|Hj|Drs|Dra|Dr|Prof|Ir)\s+)+/gi, '');
    // Hapus gelar belakang berulang setelah koma: , S.Ag., S.H., M.H., M.E., A.Md., S.Kom., dll.
    while (/,\s*[^,]+$/.test(s)) {
      var m = s.match(/,\s*([^,]+)$/);
      if (m) {
        var cand = m[1].trim();
        if (/^[A-Za-z.\s]+$/.test(cand) && cand.length < 25) {
          s = s.substring(0, s.lastIndexOf(',')).trim();
        } else {
          break;
        }
      } else {
        break;
      }
    }
    return s.trim();
  }

  function shortenJabatanTtdUndangan(jabatan) {
    var j = String(jabatan || '').trim();
    if (!j) return 'Ketua';
    var low = j.toLowerCase();
    if (low.indexOf('wakil ketua') !== -1) return 'Wakil Ketua';
    if (low.indexOf('ketua') === 0) return 'Ketua';
    if (low.indexOf('panitera muda') !== -1) return j.replace(/\s*Pengadilan Agama Indramayu/gi, '').trim();
    if (low.indexOf('panitera') === 0) return 'Panitera';
    if (low.indexOf('sekretaris') === 0) return 'Sekretaris';
    return j.replace(/\s*Pengadilan Agama Indramayu/gi, '').trim();
  }

  function formatJabatanLampiranInstansi(jabatanShort) {
    var clean = String(jabatanShort || 'Ketua').trim();
    if (/pengadilan agama indramayu/i.test(clean)) return clean;
    return clean + ' Pengadilan Agama Indramayu';
  }

  function parseHariDanTanggalRapat(hariTglStr) {
    var raw = String(hariTglStr || '').trim();
    if (!raw) return { hari: '-', tanggal: '-' };
    var commaIdx = raw.indexOf(',');
    if (commaIdx !== -1) {
      return {
        hari: raw.slice(0, commaIdx).trim() || '-',
        tanggal: raw.slice(commaIdx + 1).trim() || '-'
      };
    }
    return { hari: '-', tanggal: raw };
  }

  function resolveTanggalSuratUndangan(rapatObj) {
    var raw = String((rapatObj && rapatObj.tgl_surat) || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      var p = raw.split('-');
      var mIdx = parseInt(p[1], 10) - 1;
      var dayNum = parseInt(p[2], 10);
      return dayNum + ' ' + (BULAN_INDO_UND[mIdx] || 'Januari') + ' ' + p[0];
    }
    if (raw) return raw;
    var now = new Date();
    return now.getDate() + ' ' + BULAN_INDO_UND[now.getMonth()] + ' ' + now.getFullYear();
  }

  function resolvePejabatTtdUndangan(rapatObj) {
    var r = rapatObj || {};
    var uList = getUsersListUnd_();
    var targetNip = String(r.pejabat_ttd_nip || r.pemimpin_nip || '').trim();
    var matchedUser = targetNip
      ? uList.find(function (u) { return String(u.nip || '') === targetNip; })
      : null;

    if (!matchedUser && r.kode_pejabat_ttd) {
      var kodeLow = String(r.kode_pejabat_ttd).toUpperCase();
      matchedUser = uList.find(function (u) {
        var j = String(u.jabatan || '').toLowerCase();
        if (kodeLow.indexOf('WKPA') !== -1) return j.indexOf('wakil ketua') !== -1;
        if (kodeLow.indexOf('KPA') !== -1) return j.indexOf('ketua') !== -1 && j.indexOf('wakil') === -1;
        if (kodeLow.indexOf('PAN') !== -1) return j.indexOf('panitera') === 0;
        if (kodeLow.indexOf('SEK') !== -1) return j.indexOf('sekretaris') === 0;
        return false;
      });
    }

    var rawNama = String(r.pejabat_ttd_nama || (matchedUser && matchedUser.nama) || r.pemimpin || 'Ketua').trim();
    var rawJabatan = String(r.pejabat_ttd_jabatan || (matchedUser && matchedUser.jabatan) || r.pemimpin_jabatan || r.pemimpin || 'Ketua').trim();
    var nip = String(r.pejabat_ttd_nip || (matchedUser && matchedUser.nip) || '').trim();

    var showGelar = Boolean(r.tampilkan_gelar_undangan);
    var namaDisplay = showGelar ? rawNama : stripGelarUndangan(rawNama);
    var jabatanTtd = shortenJabatanTtdUndangan(rawJabatan);

    return {
      namaDisplay: namaDisplay || '-',
      nip: nip,
      jabatanTtd: jabatanTtd,
      jabatanLampiranInstansi: formatJabatanLampiranInstansi(jabatanTtd),
      nipHtml: (showGelar && nip) ? '<div>NIP. ' + escHtmlUnd_(nip) + '</div>' : ''
    };
  }

  function parseTujuanUndanganList(rapatObj) {
    var r = rapatObj || {};
    var arr = [];
    if (r.tujuan_undangan_json) {
      try {
        var parsed = typeof r.tujuan_undangan_json === 'string' ? JSON.parse(r.tujuan_undangan_json) : r.tujuan_undangan_json;
        if (Array.isArray(parsed)) arr = parsed;
      } catch (e) {}
    } else if (r.peserta_json) {
      try {
        var legacy = typeof r.peserta_json === 'string' ? JSON.parse(r.peserta_json) : r.peserta_json;
        if (Array.isArray(legacy)) arr = legacy;
      } catch (e) {}
    }
    var clean = arr.map(function (item) {
      if (typeof item === 'string') return { label: item.trim() };
      return {
        label: String((item && (item.label || item.nama || item.jabatan)) || '').trim()
      };
    }).filter(function (x) { return Boolean(x.label); });

    if (clean.length === 0) {
      clean.push({ label: 'Para Pejabat / Aparatur Pengadilan Agama Indramayu' });
    }
    return clean;
  }

  function formatAgendaPoinHtml(rapatObj) {
    var r = rapatObj || {};
    var rawPoin = String(r.agenda_poin || '').trim();
    var fallbackAgenda = String(r.agenda || '-').trim();
    var sourceText = rawPoin || fallbackAgenda;
    var lines = sourceText.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);

    if (lines.length <= 1) {
      return escHtmlUnd_(lines[0] || '-');
    }

    var html = '<table style="width: 100%; border-collapse: collapse; font-size: 12pt;">';
    lines.forEach(function (line, idx) {
      var m = line.match(/^([0-9]+[.)])\s*(.*)$/);
      var noStr = m ? m[1] : ((idx + 1) + '.');
      var bodyStr = m ? m[2] : line;
      html += '<tr>' +
        '<td style="width: 22px; vertical-align: top; padding: 0;">' + escHtmlUnd_(noStr) + '</td>' +
        '<td style="vertical-align: top; padding: 0;">' + escHtmlUnd_(bodyStr) + '</td>' +
      '</tr>';
    });
    html += '</table>';
    return html;
  }

  function buildUndanganHtml(rapatObj, templateHtml) {
    var r = rapatObj || {};
    var html = String(templateHtml || '');
    var tujuanList = parseTujuanUndanganList(r);
    var isDuaLembar = tujuanList.length > 3;

    var nomorSurat = String(r.nomor_undangan || '-').trim();
    var tglSurat = resolveTanggalSuratUndangan(r);
    var lampiranText = isDuaLembar ? (String(r.lampiran_surat || '').trim() || '-') : '-';
    var ttd = resolvePejabatTtdUndangan(r);
    var jadwalSplit = parseHariDanTanggalRapat(r.hari_tanggal);
    var waktuStr = String(r.waktu_mulai || '08:00 WIB').trim() + ' s.d ' + String(r.waktu_selesai || 'Selesai').trim();

    var tujuanHal1Html = '';
    var halaman2Html = '';

    if (!isDuaLembar) {
      if (tujuanList.length === 1) {
        tujuanHal1Html = escHtmlUnd_(tujuanList[0].label);
      } else {
        tujuanHal1Html = '<table class="undangan-tujuan-list-table">';
        tujuanList.forEach(function (t, idx) {
          tujuanHal1Html += '<tr>' +
            '<td style="width: 22px;">' + (idx + 1) + '.</td>' +
            '<td>' + escHtmlUnd_(t.label) + '</td>' +
          '</tr>';
        });
        tujuanHal1Html += '</table>';
      }
      halaman2Html = '';
    } else {
      tujuanHal1Html = 'Para Pejabat pada daftar terlampir';

      var daftarRowsHtml = '';
      tujuanList.forEach(function (t, idx) {
        daftarRowsHtml += '<tr>' +
          '<td style="width: 26px;">' + (idx + 1) + '.</td>' +
          '<td>' + escHtmlUnd_(t.label) + '</td>' +
        '</tr>';
      });

      halaman2Html =
        '<div class="undangan-page-wrapper" style="page-break-before: always; break-before: page;">' +
          '<div class="undangan-lampiran-header-wrap">' +
            '<div class="undangan-lampiran-header-box">' +
              '<div style="font-size: 11pt; font-weight: bold;">Lampiran Surat Undangan</div>' +
              '<div style="font-size: 9pt;">' + escHtmlUnd_(ttd.jabatanLampiranInstansi) + '</div>' +
              '<table class="undangan-lampiran-meta">' +
                '<tr>' +
                  '<td style="width: 54px;">Nomor</td>' +
                  '<td style="width: 10px; text-align: center;">:</td>' +
                  '<td>' + escHtmlUnd_(nomorSurat) + '</td>' +
                '</tr>' +
                '<tr>' +
                  '<td>Tanggal</td>' +
                  '<td style="text-align: center;">:</td>' +
                  '<td>' + escHtmlUnd_(tglSurat) + '</td>' +
                '</tr>' +
              '</table>' +
            '</div>' +
          '</div>' +
          '<div class="undangan-lampiran-judul">DAFTAR NAMA PEJABAT/TIM YANG DIUNDANG</div>' +
          '<table class="undangan-lampiran-daftar">' + daftarRowsHtml + '</table>' +
          '<div class="undangan-ttd-area">' +
            '<div class="undangan-ttd-box">' +
              '<div>' + escHtmlUnd_(ttd.jabatanTtd) + ',</div>' +
              '<div style="min-height: 68px;"></div>' +
              '<div style="font-weight: bold;">' + escHtmlUnd_(ttd.namaDisplay) + '</div>' +
              ttd.nipHtml +
            '</div>' +
          '</div>' +
        '</div>';
    }

    var replacements = {
      '{{nomor_undangan}}': escHtmlUnd_(nomorSurat),
      '{{tanggal_surat}}': escHtmlUnd_(tglSurat),
      '{{lampiran_surat}}': escHtmlUnd_(lampiranText),
      '{{tujuan_halaman_1_html}}': tujuanHal1Html,
      '{{agenda_perihal}}': escHtmlUnd_(r.agenda || 'Rapat Dinas'),
      '{{hari_rapat}}': escHtmlUnd_(jadwalSplit.hari),
      '{{tanggal_rapat}}': escHtmlUnd_(jadwalSplit.tanggal),
      '{{waktu_rapat}}': escHtmlUnd_(waktuStr),
      '{{tempat_rapat}}': escHtmlUnd_(r.tempat || 'Ruang Rapat Pimpinan Pengadilan Agama Indramayu'),
      '{{agenda_poin_html}}': formatAgendaPoinHtml(r),
      '{{jabatan_ttd_undangan}}': escHtmlUnd_(ttd.jabatanTtd),
      '{{nama_ttd_undangan}}': escHtmlUnd_(ttd.namaDisplay),
      '{{nip_ttd_undangan_html}}': ttd.nipHtml,
      '{{halaman_2_lampiran_html}}': halaman2Html
    };

    for (var key in replacements) {
      if (Object.prototype.hasOwnProperty.call(replacements, key)) {
        html = html.split(key).join(replacements[key]);
      }
    }
    return html;
  }

  function printUndanganRapat(rapatObj) {
    if (!rapatObj) {
      if (typeof showNotify === 'function') showNotify('Gagal', 'Data Rapat tidak ditemukan untuk dicetak.', 'error');
      return;
    }

    var template = document.getElementById('template-cetak-undangan-container');
    if (!template) {
      if (typeof showNotify === 'function') showNotify('Template Belum Siap', 'Template cetak Undangan belum dimuat di DOM.', 'warning');
      return;
    }

    if (typeof showLoading === 'function') showLoading('Menyiapkan Surat Undangan Rapat...');

    var renderedInner = buildUndanganHtml(rapatObj, template.innerHTML);
    var docTitle = 'Undangan_Rapat_' + String(rapatObj.agenda || 'PA_Indramayu').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    var finalHTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escHtmlUnd_(docTitle) + '</title>' +
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

  global.printUndanganRapat = printUndanganRapat;
  global.UndanganPrintHelper = {
    stripGelarUndangan: stripGelarUndangan,
    shortenJabatanTtdUndangan: shortenJabatanTtdUndangan,
    parseHariDanTanggalRapat: parseHariDanTanggalRapat,
    resolveTanggalSuratUndangan: resolveTanggalSuratUndangan,
    resolvePejabatTtdUndangan: resolvePejabatTtdUndangan,
    parseTujuanUndanganList: parseTujuanUndanganList,
    buildUndanganHtml: buildUndanganHtml
  };
})(typeof window !== 'undefined' ? window : this);
