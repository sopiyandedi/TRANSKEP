// ==========================================
// FILE: modules/eoffice/cetak/js_cetak_notula.js
// DESKRIPSI: Mesin Render & Cetak Instan (0ms) Notula Rapat + Foto Dokumentasi PA Indramayu
// STANDAR: Kertas A4 Portrait (210mm x 297mm) | Font 11pt Bookman Old Style
// FITUR: Kop Surat Tugas | Identitas Dasar..Acara | Konversi 5-Kolom -> a..e | Grid 2x2 Foto Rapat
// ==========================================

(function (global) {
  'use strict';

  function escHtmlNot_(v) {
    if (typeof global.escHtml === 'function') return global.escHtml(v);
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]);
    });
  }

  function getUsersListNot_() {
    if (global.vueState && Array.isArray(global.vueState.usersList)) return global.vueState.usersList;
    if (typeof state !== 'undefined' && Array.isArray(state.usersList)) return state.usersList;
    return [];
  }

  function parseHariTanggalNotula_(hariTglStr) {
    var raw = String(hariTglStr || '').trim();
    if (!raw) return { hari: '-', tanggal: '-' };
    var idx = raw.indexOf(',');
    if (idx !== -1) {
      return {
        hari: raw.slice(0, idx).trim() || '-',
        tanggal: raw.slice(idx + 1).trim() || '-'
      };
    }
    return { hari: '-', tanggal: raw };
  }

  function resolvePejabatNotula_(nip, textFallback) {
    var uList = getUsersListNot_();
    var cleanNip = String(nip || '').trim();
    if (cleanNip) {
      var byNip = uList.find(function (u) { return String(u.nip || '') === cleanNip; });
      if (byNip) return byNip;
    }
    var txt = String(textFallback || '').trim().toLowerCase();
    if (txt) {
      return uList.find(function (u) {
        var n = String(u.nama || '').toLowerCase();
        var j = String(u.jabatan || '').toLowerCase();
        return (n && txt.indexOf(n) !== -1) || (j && txt === j);
      }) || null;
    }
    return null;
  }

  function formatNumberedLinesHtml_(rawText) {
    var txt = String(rawText || '').trim();
    if (!txt) return '';
    var lines = txt.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (lines.length === 0) return '';

    var html = '<table class="notula-list-table">';
    lines.forEach(function (line, idx) {
      var m = line.match(/^([0-9]+[.)])\s*(.*)$/);
      var noStr = m ? m[1] : ((idx + 1) + '.');
      var content = m ? m[2] : line;
      html += '<tr>' +
        '<td style="width: 24px;">' + escHtmlNot_(noStr) + '</td>' +
        '<td style="text-align: justify;">' + escHtmlNot_(content) + '</td>' +
      '</tr>';
    });
    html += '</table>';
    return html;
  }

  function formatParagraphsHtml_(rawText) {
    var txt = String(rawText || '').trim();
    if (!txt) return '<p style="margin: 0; text-indent: 24px;">-</p>';
    var paras = txt.split(/\r?\n+/).map(function (p) { return p.trim(); }).filter(Boolean);
    return paras.map(function (p) {
      return '<p style="margin: 0 0 6px 0; text-indent: 24px; text-align: justify;">' + escHtmlNot_(p) + '</p>';
    }).join('');
  }

  function buildPesertaNotulaHtml_(rapatObj) {
    var r = rapatObj || {};
    var list = [];
    if (r.tujuan_undangan_json) {
      try {
        var p1 = typeof r.tujuan_undangan_json === 'string' ? JSON.parse(r.tujuan_undangan_json) : r.tujuan_undangan_json;
        if (Array.isArray(p1)) list = p1;
      } catch (e) {}
    } else if (r.peserta_json) {
      try {
        var p2 = typeof r.peserta_json === 'string' ? JSON.parse(r.peserta_json) : r.peserta_json;
        if (Array.isArray(p2)) list = p2;
      } catch (e) {}
    }

    var clean = list.map(function (item) {
      if (typeof item === 'string') return item.trim();
      return String((item && (item.label || item.nama || item.jabatan)) || '').trim();
    }).filter(Boolean);

    if (clean.length === 0) {
      return '<div style="margin-left: 22px;">-</div>';
    }

    var html = '<table class="notula-list-table">';
    clean.forEach(function (label, idx) {
      html += '<tr>' +
        '<td style="width: 24px;">' + (idx + 1) + '.</td>' +
        '<td>' + escHtmlNot_(label) + '</td>' +
      '</tr>';
    });
    html += '</table>';
    return html;
  }

  var BULAN_INDO_NOTULA = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  function formatNotulaDateIfIso_(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return s;
    var yr = m[1];
    var monIdx = parseInt(m[2], 10) - 1;
    var dayNum = parseInt(m[3], 10);
    if (monIdx >= 0 && monIdx < 12 && dayNum >= 1 && dayNum <= 31) {
      return dayNum + ' ' + BULAN_INDO_NOTULA[monIdx] + ' ' + yr;
    }
    return s;
  }

  function collectSubSpecLines_(row, key, isDateField) {
    var r = row || {};
    var subItems = (Array.isArray(r.items) && r.items.length > 0) ? r.items : [r];
    if (subItems.length === 1) {
      var singleRaw = String(subItems[0][key] || '').trim();
      return isDateField ? formatNotulaDateIfIso_(singleRaw) : singleRaw;
    }

    var mergedLines = [];
    subItems.forEach(function (sub) {
      if (!sub || typeof sub !== 'object') return;
      var val = String(sub[key] || '').trim();
      if (!val) return;
      if (isDateField) {
        mergedLines.push(formatNotulaDateIfIso_(val));
        return;
      }
      val.split(/\r?\n/).forEach(function (ln) {
        var cleanLn = String(ln || '').trim().replace(/^[0-9]+[.)]\s*/, '').trim();
        if (cleanLn) mergedLines.push(cleanLn);
      });
    });

    if (mergedLines.length === 0) return '';
    if (mergedLines.length === 1) return mergedLines[0];
    return mergedLines.map(function (ln, i) { return (i + 1) + '. ' + ln; }).join('\n');
  }

  function buildPembahasanBertingkatHtml_(rapatObj) {
    var r = rapatObj || {};
    var rows = [];
    if (r.pembahasan_json) {
      try {
        var parsed = typeof r.pembahasan_json === 'string' ? JSON.parse(r.pembahasan_json) : r.pembahasan_json;
        if (Array.isArray(parsed)) rows = parsed;
      } catch (e) {}
    }

    if (rows.length === 0 && r.pembahasan && String(r.pembahasan).trim()) {
      rows.push({
        pembicara_nama: r.pemimpin || 'Pembahasan Rapat',
        uraian: String(r.pembahasan || ''),
        tindak_lanjut: '',
        target: '',
        penanggung_jawab: '',
        tanggal_penyelesaian: ''
      });
    }

    if (rows.length === 0) {
      return '<div style="margin-left: 16px;">- Tidak ada catatan pembahasan khusus -</div>';
    }

    var subSpecs = [
      { key: 'uraian', letter: 'a.', title: 'Uraian Pembahasan/Laporan', isDate: false },
      { key: 'tindak_lanjut', letter: 'b.', title: 'Tindak Lanjut/Tanggapan/Masukan', isDate: false },
      { key: 'target', letter: 'c.', title: 'Target Penyelesaian', isDate: true },
      { key: 'penanggung_jawab', letter: 'd.', title: 'Penanggung Jawab', isDate: false },
      { key: 'tanggal_penyelesaian', letter: 'e.', title: 'Tanggal Penyelesaian', isDate: true }
    ];

    var html = '';
    rows.forEach(function (row, idx) {
      var speakerTitle = String(row.pembicara_nama || ('Pembicara ' + (idx + 1))).trim();
      html +=
        '<div style="margin-bottom: 10px;">' +
          '<table class="notula-list-table">' +
            '<tr>' +
              '<td style="width: 22px; font-weight: bold;">' + (idx + 1) + '.</td>' +
              '<td style="font-weight: bold;">' + escHtmlNot_(speakerTitle) + '</td>' +
            '</tr>' +
          '</table>' +
          '<div class="notula-sub-point">';

      subSpecs.forEach(function (spec) {
        var rawVal = collectSubSpecLines_(row, spec.key, spec.isDate);
        if (!rawVal) return;
        html +=
          '<table class="notula-list-table" style="margin-top: 3px;">' +
            '<tr>' +
              '<td style="width: 20px; font-weight: bold;">' + spec.letter + '</td>' +
              '<td style="font-weight: bold;">' + spec.title + '</td>' +
            '</tr>' +
            '<tr>' +
              '<td></td>' +
              '<td style="padding-top: 2px;">' + formatNumberedLinesHtml_(rawVal) + '</td>' +
            '</tr>' +
          '</table>';
      });

      html += '</div></div>';
    });

    return html;
  }

  function buildHalamanFotoRapatHtml_(resolvedFotos) {
    if (!Array.isArray(resolvedFotos) || resolvedFotos.length === 0) return '';

    var valid = resolvedFotos.filter(function (f) {
      return f && f.src && String(f.src).indexOf('data:image/') === 0;
    });
    if (valid.length === 0) return '';

    var pageChunks = [];
    for (var i = 0; i < valid.length; i += 4) {
      pageChunks.push(valid.slice(i, i + 4));
    }

    var out = '';
    pageChunks.forEach(function (chunk, pIdx) {
      out += '<div class="notula-foto-page">';
      if (pIdx === 0) {
        out += '<div class="notula-foto-judul">Foto Rapat</div>';
      } else {
        out += '<div class="notula-foto-judul">Foto Rapat (Lanjutan)</div>';
      }
      out += '<table class="notula-foto-grid-table">';
      for (var r = 0; r < chunk.length; r += 2) {
        var left = chunk[r];
        var right = chunk[r + 1] || null;
        out += '<tr>';
        out += '<td class="notula-foto-cell">' +
          '<img src="' + left.src + '" class="notula-foto-img" alt="Foto Rapat">' +
          (left.caption ? '<div class="notula-foto-caption">' + escHtmlNot_(left.caption) + '</div>' : '') +
        '</td>';
        if (right) {
          out += '<td class="notula-foto-cell">' +
            '<img src="' + right.src + '" class="notula-foto-img" alt="Foto Rapat">' +
            (right.caption ? '<div class="notula-foto-caption">' + escHtmlNot_(right.caption) + '</div>' : '') +
          '</td>';
        } else {
          out += '<td class="notula-foto-cell">&nbsp;</td>';
        }
        out += '</tr>';
      }
      out += '</table></div>';
    });

    return out;
  }

  function buildNotulaHtml(rapatObj, templateHtml, resolvedFotos) {
    var r = rapatObj || {};
    var html = String(templateHtml || '');
    var jadwal = parseHariTanggalNotula_(r.hari_tanggal);
    var waktuStr = String(r.waktu_mulai || '08:00 WIB').trim() + ' s.d ' + String(r.waktu_selesai || 'Selesai').trim();

    var pemUser = resolvePejabatNotula_(r.pemimpin_nip, r.pemimpin);
    var notUser = resolvePejabatNotula_(r.notulis_nip, r.notulis);

    var jabatanPimpinan = String(r.pemimpin || r.pemimpin_jabatan || (pemUser && pemUser.jabatan) || 'Pimpinan Rapat').trim();
    var namaPimpinan = String((pemUser && pemUser.nama) || r.pemimpin || '....................................................').trim();
    var labelPimpinan = jabatanPimpinan;

    var namaNotulis = String(r.notulis || (notUser && notUser.nama) || '....................................................').trim();

    var kesimpulanVal = String(r.kesimpulan || '').trim();
    var kesimpulanHtml = kesimpulanVal
      ? '<table class="notula-list-table" style="margin-top: 8px;">' +
          '<tr><td style="width: 22px; font-weight: bold;">C.</td><td style="font-weight: bold;">Kesimpulan &amp; Penutup</td></tr>' +
          '<tr><td></td><td style="padding-top: 3px;">' + formatParagraphsHtml_(kesimpulanVal) + '</td></tr>' +
        '</table>'
      : '';

    var replacements = {
      '{{dasar_notula}}': escHtmlNot_(r.dasar_notula || '-'),
      '{{hari_rapat}}': escHtmlNot_(jadwal.hari),
      '{{tanggal_rapat}}': escHtmlNot_(jadwal.tanggal),
      '{{waktu_rapat}}': escHtmlNot_(waktuStr),
      '{{tempat_rapat}}': escHtmlNot_(r.tempat || 'Ruang Rapat Pengadilan Agama Indramayu'),
      '{{acara_rapat}}': escHtmlNot_(r.agenda || '-'),
      '{{peserta_notula_html}}': buildPesertaNotulaHtml_(r),
      '{{label_pimpinan_notula}}': escHtmlNot_(labelPimpinan),
      '{{pengarahan_umum_html}}': formatParagraphsHtml_(r.pengarahan_umum),
      '{{pembahasan_bertingkat_html}}': buildPembahasanBertingkatHtml_(r),
      '{{kesimpulan_notula_html}}': kesimpulanHtml,
      '{{jabatan_pimpinan_notula}}': escHtmlNot_(jabatanPimpinan),
      '{{nama_pimpinan_notula}}': escHtmlNot_(namaPimpinan),
      '{{nama_notulis_notula}}': escHtmlNot_(namaNotulis),
      '{{halaman_foto_rapat_html}}': buildHalamanFotoRapatHtml_(resolvedFotos || [])
    };

    for (var key in replacements) {
      if (Object.prototype.hasOwnProperty.call(replacements, key)) {
        html = html.split(key).join(replacements[key]);
      }
    }
    return html;
  }

  async function printNotulaRapat(rapatObj) {
    if (!rapatObj) {
      if (typeof showNotify === 'function') showNotify('Gagal', 'Data Rapat tidak ditemukan untuk dicetak.', 'error');
      return;
    }

    var template = document.getElementById('template-cetak-notula-container');
    if (!template) {
      if (typeof showNotify === 'function') showNotify('Template Belum Siap', 'Template cetak Notula belum dimuat di DOM.', 'warning');
      return;
    }

    if (typeof showLoading === 'function') showLoading('Menyiapkan Notula Rapat & Foto Dokumentasi...');

    var rawFotos = [];
    if (rapatObj.foto_rapat_json) {
      try {
        var parsed = typeof rapatObj.foto_rapat_json === 'string' ? JSON.parse(rapatObj.foto_rapat_json) : rapatObj.foto_rapat_json;
        if (Array.isArray(parsed)) rawFotos = parsed;
      } catch (e) {}
    }

    var resolvedFotos = [];
    for (var i = 0; i < rawFotos.length; i++) {
      var f = rawFotos[i];
      var srcUri = '';
      if (global.EofficeDataService && typeof global.EofficeDataService.resolveFotoRapatDataUri === 'function') {
        srcUri = await global.EofficeDataService.resolveFotoRapatDataUri(f);
      } else if (f && (f.data_uri || f.thumb_data_uri)) {
        srcUri = f.data_uri || f.thumb_data_uri;
      }
      if (srcUri && String(srcUri).indexOf('data:image/') === 0) {
        resolvedFotos.push({ src: srcUri, caption: String((f && f.caption) || '') });
      }
    }

    var renderedInner = buildNotulaHtml(rapatObj, template.innerHTML, resolvedFotos);
    var docTitle = 'Notula_Rapat_' + String(rapatObj.agenda || 'PA_Indramayu').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
    var finalHTML = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + escHtmlNot_(docTitle) + '</title>' +
      '<style>@page{size:A4 portrait;margin:14mm 15mm 14mm 20mm !important;}</style></head><body>' +
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
      }, 4000);
    }, 700);
  }

  global.printNotulaRapat = printNotulaRapat;
  global.NotulaPrintHelper = {
    parseHariTanggalNotula: parseHariTanggalNotula_,
    buildPesertaNotulaHtml: buildPesertaNotulaHtml_,
    buildPembahasanBertingkatHtml: buildPembahasanBertingkatHtml_,
    buildHalamanFotoRapatHtml: buildHalamanFotoRapatHtml_,
    buildNotulaHtml: buildNotulaHtml
  };
})(typeof window !== 'undefined' ? window : this);
