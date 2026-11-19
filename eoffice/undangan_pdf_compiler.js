// =========================================================================
// FILE: eoffice/undangan_pdf_compiler.js
// DESKRIPSI: Headless PDF Compiler untuk Surat Undangan Rapat PA Indramayu
// STANDAR: Kertas A4 Portrait (210mm x 297mm), Font 12pt Bookman Old Style
// LOGIKA: 1-3 Tujuan = 1 Lembar | >3 Tujuan = 2 Lembar + Lampiran (11pt / 9pt)
// ENGINE: TRANSKEP Core v1.0.0
// =========================================================================

const UNDANGAN_BULAN_INDO_ = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function escapeHtmlUndPdf_(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripGelarUndPdf_(nama) {
  if (!nama) return '';
  let s = String(nama).trim();
  if (!s || s === '-') return '-';
  s = s.replace(/^(?:(?:H\.|Hj\.|Drs\.|Dra\.|Dr\.|K\.H\.|Prof\.|Ir\.|H|Hj|Drs|Dra|Dr|Prof|Ir)\s+)+/gi, '');
  while (/,\s*[^,]+$/.test(s)) {
    const m = s.match(/,\s*([^,]+)$/);
    if (m) {
      const cand = m[1].trim();
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

function shortenJabatanUndPdf_(jabatan) {
  const j = String(jabatan || '').trim();
  if (!j) return 'Ketua';
  const low = j.toLowerCase();
  if (low.indexOf('wakil ketua') !== -1) return 'Wakil Ketua';
  if (low.indexOf('ketua') === 0) return 'Ketua';
  if (low.indexOf('panitera muda') !== -1) return j.replace(/\s*Pengadilan Agama Indramayu/gi, '').trim();
  if (low.indexOf('panitera') === 0) return 'Panitera';
  if (low.indexOf('sekretaris') === 0) return 'Sekretaris';
  return j.replace(/\s*Pengadilan Agama Indramayu/gi, '').trim();
}

function formatJabatanLampiranInstansiPdf_(jabatanShort) {
  const clean = String(jabatanShort || 'Ketua').trim();
  if (/pengadilan agama indramayu/i.test(clean)) return clean;
  return clean + ' Pengadilan Agama Indramayu';
}

function formatTanggalSuratUndPdf_(val) {
  if (!val) {
    const now = new Date();
    return now.getDate() + ' ' + UNDANGAN_BULAN_INDO_[now.getMonth()] + ' ' + now.getFullYear();
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const p = str.split('T')[0].split('-');
    const y = p[0];
    const m = parseInt(p[1], 10) - 1;
    const d = parseInt(p[2], 10);
    if (m >= 0 && m <= 11 && !isNaN(d)) {
      return d + ' ' + UNDANGAN_BULAN_INDO_[m] + ' ' + y;
    }
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const p = str.split('/');
    const d = parseInt(p[0], 10);
    const m = parseInt(p[1], 10) - 1;
    const y = p[2];
    if (m >= 0 && m <= 11 && !isNaN(d)) {
      return d + ' ' + UNDANGAN_BULAN_INDO_[m] + ' ' + y;
    }
  }
  if (/[a-zA-Z]{3,}/.test(str)) return str;
  return str;
}

function parseHariDanTanggalUndPdf_(hariTglStr) {
  const raw = String(hariTglStr || '').trim();
  if (!raw) return { hari: '-', tanggal: '-' };
  const commaIdx = raw.indexOf(',');
  if (commaIdx !== -1) {
    return {
      hari: raw.slice(0, commaIdx).trim() || '-',
      tanggal: raw.slice(commaIdx + 1).trim() || '-'
    };
  }
  return { hari: '-', tanggal: raw };
}

function parseTujuanUndanganPdf_(r) {
  let arr = [];
  if (r && r.tujuan_undangan_json) {
    try {
      const parsed = typeof r.tujuan_undangan_json === 'string'
        ? JSON.parse(r.tujuan_undangan_json)
        : r.tujuan_undangan_json;
      if (Array.isArray(parsed)) arr = parsed;
    } catch (e) {}
  } else if (r && r.peserta_json) {
    try {
      const legacy = typeof r.peserta_json === 'string'
        ? JSON.parse(r.peserta_json)
        : r.peserta_json;
      if (Array.isArray(legacy)) arr = legacy;
    } catch (e2) {}
  }
  const clean = arr.map(function (item) {
    if (typeof item === 'string') return { label: item.trim() };
    return { label: String((item && (item.label || item.nama || item.jabatan)) || '').trim() };
  }).filter(function (x) { return Boolean(x.label); });

  if (clean.length === 0) {
    clean.push({ label: 'Para Pejabat / Aparatur Pengadilan Agama Indramayu' });
  }
  return clean;
}

function findPejabatUndPdf_(r) {
  const rec = r || {};
  let matchedUser = null;

  try {
    if (typeof getDB === 'function') {
      const ss = getDB();
      const sheetUser = ss && ss.getSheetByName ? ss.getSheetByName('user_data') : null;
      if (sheetUser) {
        const uData = (typeof readUserSheetDecrypted_ === 'function')
          ? readUserSheetDecrypted_(sheetUser)
          : sheetUser.getDataRange().getValues();
        if (uData && uData.length > 1) {
          const targetNip = String(rec.pejabat_ttd_nip || rec.pemimpin_nip || '').replace(/['"\s]/g, '').trim();
          const kodeUpper = String(rec.kode_pejabat_ttd || '').toUpperCase();
          for (let i = 1; i < uData.length; i++) {
            const uNip = String(uData[i][0] || '').replace(/['"\s]/g, '').trim();
            const uNama = String(uData[i][1] || '').trim();
            const uJab = String(uData[i][2] || '').trim();
            if (targetNip && uNip === targetNip) {
              matchedUser = { nip: uNip, nama: uNama, jabatan: uJab };
              break;
            }
            if (!targetNip && kodeUpper) {
              const jLow = uJab.toLowerCase();
              const isMatch =
                (kodeUpper.indexOf('WKPA') !== -1 && jLow.indexOf('wakil ketua') !== -1) ||
                (kodeUpper.indexOf('KPA') !== -1 && kodeUpper.indexOf('WKPA') === -1 && jLow.indexOf('ketua') !== -1 && jLow.indexOf('wakil') === -1) ||
                (kodeUpper.indexOf('PAN') !== -1 && jLow.indexOf('panitera') === 0) ||
                (kodeUpper.indexOf('SEK') !== -1 && jLow.indexOf('sekretaris') === 0);
              if (isMatch && !matchedUser) {
                matchedUser = { nip: uNip, nama: uNama, jabatan: uJab };
              }
            }
          }
        }
      }
    }
  } catch (e) {
    Logger.log('⚠️ [findPejabatUndPdf_] ' + e.toString());
  }

  const rawNama = String(rec.pejabat_ttd_nama || (matchedUser && matchedUser.nama) || rec.pemimpin || 'Ketua').trim();
  const rawJab = String(rec.pejabat_ttd_jabatan || (matchedUser && matchedUser.jabatan) || rec.pemimpin_jabatan || rec.pemimpin || 'Ketua').trim();
  const nip = String(rec.pejabat_ttd_nip || (matchedUser && matchedUser.nip) || '').trim();
  const showGelar = Boolean(rec.tampilkan_gelar_undangan);
  const namaDisplay = showGelar ? rawNama : stripGelarUndPdf_(rawNama);
  const jabatanTtd = shortenJabatanUndPdf_(rawJab);

  return {
    namaDisplay: namaDisplay || '-',
    nip: nip,
    jabatanTtd: jabatanTtd,
    jabatanLampiranInstansi: formatJabatanLampiranInstansiPdf_(jabatanTtd),
    nipHtml: (showGelar && nip) ? '<div>NIP. ' + escapeHtmlUndPdf_(nip) + '</div>' : ''
  };
}

function formatAgendaPoinTablePdf_(r) {
  const rawPoin = String((r && r.agenda_poin) || '').trim();
  const fallbackAgenda = String((r && r.agenda) || '-').trim();
  const sourceText = rawPoin || fallbackAgenda;
  const lines = sourceText.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  if (lines.length <= 1) {
    return escapeHtmlUndPdf_(lines[0] || '-');
  }
  let html = '<table style="width: 100%; border-collapse: collapse; font-size: 12pt;">';
  lines.forEach(function (line, idx) {
    const m = line.match(/^([0-9]+[.)])\s*(.*)$/);
    const noStr = m ? m[1] : ((idx + 1) + '.');
    const bodyStr = m ? m[2] : line;
    html += '<tr>' +
      '<td style="width: 22px; vertical-align: top; padding: 0;">' + escapeHtmlUndPdf_(noStr) + '</td>' +
      '<td style="vertical-align: top; padding: 0;">' + escapeHtmlUndPdf_(bodyStr) + '</td>' +
      '</tr>';
  });
  html += '</table>';
  return html;
}

/**
 * Generator PDF Resmi Surat Undangan Rapat Kedinasan PA Indramayu untuk Diunggah ke MYSIMS
 * @param {Object} rapatRecord - Data agenda rapat (dari Firestore/Cache/Snapshot)
 * @param {string} nomorSuratResmi - Nomor surat keluar resmi terbitan MYSIMS
 * @returns {{ pdf_base64: string, pdf_filename: string }}
 */
function generateUndanganPdfBase64_(rapatRecord, nomorSuratResmi) {
  try {
    const r = rapatRecord || {};
    const nomorSurat = String(nomorSuratResmi || r.nomor_undangan || '-').trim();
    const tglSurat = formatTanggalSuratUndPdf_(r.tgl_surat || new Date());
    const tujuanList = parseTujuanUndanganPdf_(r);
    const isDuaLembar = tujuanList.length > 3;
    const lampiranText = isDuaLembar ? (String(r.lampiran_surat || '').trim() || '-') : '-';
    const ttd = findPejabatUndPdf_(r);
    const jadwalSplit = parseHariDanTanggalUndPdf_(r.hari_tanggal);
    const waktuStr = String(r.waktu_mulai || '08:00 WIB').trim() + ' s.d ' + String(r.waktu_selesai || 'Selesai').trim();

    let tujuanHal1Html = '';
    if (!isDuaLembar) {
      if (tujuanList.length === 1) {
        tujuanHal1Html = escapeHtmlUndPdf_(tujuanList[0].label);
      } else {
        tujuanHal1Html = '<table style="width: 100%; border-collapse: collapse; font-size: 12pt; margin-top: 2px;">';
        tujuanList.forEach(function (t, idx) {
          tujuanHal1Html += '<tr>' +
            '<td style="width: 22px; vertical-align: top; padding: 1px 0;">' + (idx + 1) + '.</td>' +
            '<td style="vertical-align: top; padding: 1px 0;">' + escapeHtmlUndPdf_(t.label) + '</td>' +
            '</tr>';
        });
        tujuanHal1Html += '</table>';
      }
    } else {
      tujuanHal1Html = 'Para Pejabat pada daftar terlampir';
    }

    let halaman2Html = '';
    if (isDuaLembar) {
      let daftarRowsHtml = '';
      tujuanList.forEach(function (t, idx) {
        daftarRowsHtml += '<tr>' +
          '<td style="width: 26px; vertical-align: top; padding: 2px 0;">' + (idx + 1) + '.</td>' +
          '<td style="vertical-align: top; padding: 2px 0;">' + escapeHtmlUndPdf_(t.label) + '</td>' +
          '</tr>';
      });

      halaman2Html =
        '<div style="page-break-before: always;">' +
          '<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;"><tr>' +
            '<td></td>' +
            '<td style="width: 315px; vertical-align: top; text-align: left; line-height: 1.35;">' +
              '<div style="font-size: 11pt; font-weight: bold;">Lampiran Surat Undangan</div>' +
              '<div style="font-size: 9pt;">' + escapeHtmlUndPdf_(ttd.jabatanLampiranInstansi) + '</div>' +
              '<table style="width: 100%; border-collapse: collapse; font-size: 9pt;">' +
                '<tr><td style="width: 54px;">Nomor</td><td style="width: 10px; text-align: center;">:</td><td>' + escapeHtmlUndPdf_(nomorSurat) + '</td></tr>' +
                '<tr><td>Tanggal</td><td style="text-align: center;">:</td><td>' + escapeHtmlUndPdf_(tglSurat) + '</td></tr>' +
              '</table>' +
            '</td>' +
          '</tr></table>' +
          '<div style="text-align: center; font-size: 12pt; font-weight: bold; text-decoration: underline; margin: 14px 0 18px 0;">DAFTAR NAMA PEJABAT/TIM YANG DIUNDANG</div>' +
          '<table style="width: 100%; border-collapse: collapse; font-size: 12pt; line-height: 1.55; margin-bottom: 22px;">' + daftarRowsHtml + '</table>' +
          '<table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12pt;"><tr>' +
            '<td></td>' +
            '<td style="width: 220px; vertical-align: top; text-align: left; line-height: 1.35;">' +
              '<div>' + escapeHtmlUndPdf_(ttd.jabatanTtd) + ',</div>' +
              '<div style="height: 68px;"></div>' +
              '<div style="font-weight: bold;">' + escapeHtmlUndPdf_(ttd.namaDisplay) + '</div>' +
              ttd.nipHtml +
            '</td>' +
          '</tr></table>' +
        '</div>';
    }

    const fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<style>' +
      '@page { size: A4 portrait; margin: 10mm 15mm 12mm 20mm; }' +
      'body { margin: 0; padding: 0; font-family: "Bookman Old Style", Georgia, "Times New Roman", serif; font-size: 12pt; line-height: 1.38; color: #000000; background: #ffffff; }' +
      '.kop-table { width: 100%; border-collapse: collapse; border-bottom: 2px solid #000000; margin-bottom: 12px; }' +
      '.kop-table td { vertical-align: middle; border: none; padding: 0 0 5px 0; }' +
      '.kop-logo { width: 88px; height: auto; }' +
      '.kop-text { text-align: center; padding-right: 30px; }' +
      '.kop-text h3, .kop-text h2 { margin: 0; font-size: 14pt; font-weight: bold; text-transform: uppercase; line-height: 1.15; }' +
      '.kop-text p { margin: 2px 0 0 0; font-size: 8pt; line-height: 1.25; }' +
      '.meta-table { width: 100%; border-collapse: collapse; font-size: 12pt; margin-bottom: 0; }' +
      '.meta-table td { vertical-align: top; padding: 1px 0; border: none; }' +
      '.tujuan-box { margin-left: 88px; margin-top: 20px; margin-bottom: 20px; font-size: 12pt; line-height: 1.38; }' +
      '.body-box { margin-left: 88px; font-size: 12pt; line-height: 1.45; text-align: justify; }' +
      '.jadwal-table { width: 100%; border-collapse: collapse; font-size: 12pt; margin-bottom: 12px; }' +
      '.jadwal-table td { vertical-align: top; padding: 2px 0; border: none; }' +
      '.ttd-table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12pt; }' +
      '.ttd-table td { vertical-align: top; border: none; padding: 0; }' +
      '</style></head><body>' +

      '<table class="kop-table"><tr>' +
      '<td style="width: 92px;"><img src="https://drive.google.com/thumbnail?id=1_Qbv_fdPOa2YEQAXXkvRxXevsd_4u1jZ&sz=w500" class="kop-logo" alt="Logo"></td>' +
      '<td class="kop-text">' +
      '<h3>MAHKAMAH AGUNG REPUBLIK INDONESIA</h3>' +
      '<h3>DIREKTORAT JENDERAL BADAN PERADILAN AGAMA</h3>' +
      '<h3>PENGADILAN TINGGI AGAMA BANDUNG</h3>' +
      '<h2>PENGADILAN AGAMA INDRAMAYU</h2>' +
      '<p>Jalan M.T. Haryono No.2A Kel. Sindang Kec. Sindang Kab. Indramayu Kode Pos 45222<br>' +
      'Telepon (0234) 273880 | Situs: www.pa-indramayu.go.id | e-mail: pa.indramayu_ptabdg@yahoo.co.id</p>' +
      '</td></tr></table>' +

      '<table class="meta-table">' +
      '<tr>' +
      '<td style="width: 78px; white-space: nowrap;">Nomor</td>' +
      '<td style="width: 14px; text-align: center;">:</td>' +
      '<td>' + escapeHtmlUndPdf_(nomorSurat) + '</td>' +
      '<td style="text-align: right; white-space: nowrap; padding-left: 10px;">' + escapeHtmlUndPdf_(tglSurat) + '</td>' +
      '</tr>' +
      '<tr><td>Lampiran</td><td style="text-align: center;">:</td><td colspan="2">' + escapeHtmlUndPdf_(lampiranText) + '</td></tr>' +
      '<tr><td>Hal</td><td style="text-align: center;">:</td><td colspan="2">Undangan.</td></tr>' +
      '</table>' +

      '<div class="tujuan-box">' +
      '<div>Kepada Yth.</div>' +
      '<div>' + tujuanHal1Html + '</div>' +
      '<div style="margin-top: 10px;">Di &ndash;</div>' +
      '<div style="margin-left: 36px; letter-spacing: 3px;">Tempat</div>' +
      '</div>' +

      '<div class="body-box">' +
      '<div style="margin-bottom: 10px;">Assalamualaikum Wr.Wb.</div>' +
      '<div style="margin-bottom: 10px;">Sehubungan dengan adanya rapat perihal ' + escapeHtmlUndPdf_(r.agenda || 'Rapat Dinas') + ', maka kami mohon kehadiran Bapak/Ibu dalam Acara tersebut, yang akan dilaksanakan, pada :</div>' +
      '<table class="jadwal-table">' +
      '<tr><td style="width: 78px; white-space: nowrap;">Hari</td><td style="width: 14px; text-align: center;">:</td><td>' + escapeHtmlUndPdf_(jadwalSplit.hari) + '</td></tr>' +
      '<tr><td>Tanggal</td><td style="text-align: center;">:</td><td>' + escapeHtmlUndPdf_(jadwalSplit.tanggal) + '</td></tr>' +
      '<tr><td>Waktu</td><td style="text-align: center;">:</td><td>' + escapeHtmlUndPdf_(waktuStr) + '</td></tr>' +
      '<tr><td>Tempat</td><td style="text-align: center;">:</td><td>' + escapeHtmlUndPdf_(r.tempat || 'Ruang Rapat Pimpinan Pengadilan Agama Indramayu') + '</td></tr>' +
      '<tr><td>Agenda</td><td style="text-align: center;">:</td><td>' + formatAgendaPoinTablePdf_(r) + '</td></tr>' +
      '</table>' +
      '<div style="margin-bottom: 10px;">Mengingat pentingnya acara tersebut, diharapkan hadir tepat pada waktunya.</div>' +
      '<div style="margin-bottom: 18px;">Demikian undangan ini kami sampaikan, atas perhatiannya diucapkan terimakasih.</div>' +
      '</div>' +

      '<table class="ttd-table"><tr>' +
      '<td></td>' +
      '<td style="width: 220px;">' +
      '<div>Wassalam,</div>' +
      '<div>' + escapeHtmlUndPdf_(ttd.jabatanTtd) + ',</div>' +
      '<div style="height: 68px;"></div>' +
      '<div style="font-weight: bold;">' + escapeHtmlUndPdf_(ttd.namaDisplay) + '</div>' +
      ttd.nipHtml +
      '</td>' +
      '</tr></table>' +

      halaman2Html +
      '</body></html>';

    const cleanAgenda = String(r.agenda || 'PA_Indramayu').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32) || 'Rapat';
    const noSeg = nomorSurat.indexOf('/') !== -1 ? nomorSurat.split('/')[0].trim() : 'draft';
    const noTag = String(noSeg || 'draft').replace(/[^a-zA-Z0-9.-]/g, '_');
    const pdfFileName = 'Undangan_Rapat_' + cleanAgenda + '_' + noTag + '.pdf';

    try {
      const htmlOutput = HtmlService.createHtmlOutput(fullHtml);
      const pdfBlob = htmlOutput.getAs('application/pdf').setName(pdfFileName);
      const pdfBytes = pdfBlob.getBytes();
      if (pdfBytes && pdfBytes.length > 200) {
        return {
          pdf_base64: Utilities.base64Encode(pdfBytes),
          pdf_filename: pdfFileName
        };
      }
    } catch (errPdf1) {
      Logger.log('⚠️ [generateUndanganPdfBase64_] Percobaan 1 gagal: ' + errPdf1.toString() + '. Beralih ke fallback teks bersih...');
    }

    const fallbackHtml = fullHtml.replace(
      /<img\b[^>]*class="kop-logo"[^>]*>/gi,
      '<div style="width:74px;height:74px;border:1.5px solid #000;text-align:center;line-height:74px;font-size:10pt;font-weight:bold;">PA-IMY</div>'
    );
    const htmlOutputFallback = HtmlService.createHtmlOutput(fallbackHtml);
    const pdfBlobFallback = htmlOutputFallback.getAs('application/pdf').setName(pdfFileName);
    return {
      pdf_base64: Utilities.base64Encode(pdfBlobFallback.getBytes()),
      pdf_filename: pdfFileName
    };
  } catch (err) {
    Logger.log('⚠️ [generateUndanganPdfBase64_ Error] ' + err.toString());
    return { pdf_base64: '', pdf_filename: 'undangan_rapat.pdf' };
  }
}
