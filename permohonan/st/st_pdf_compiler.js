// =========================================================================
// FILE: st_pdf_compiler.js
// DESKRIPSI: Headless PDF Compiler untuk Surat Tugas, SPD, & Plh (Tahap 102 - Opsi B)
// Clean Architecture: Terpisah murni dari controller data untuk kerapihan & stabilitas
// =========================================================================

/**
 * Helper: Ambil peta data user dari database user_data
 */
function getUserMapStCompiler_() {
  const map = {};
  try {
    const ss = getDB();
    const sheetUser = ss.getSheetByName('user_data');
    if (!sheetUser) return map;

    const uData = (typeof readUserSheetDecrypted_ === 'function')
      ? readUserSheetDecrypted_(sheetUser)
      : sheetUser.getDataRange().getValues();

    if (!uData || uData.length <= 1) return map;

    const headers = uData[0].map(function(h) {
      return String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    });

    const colNip = headers.indexOf('nip') !== -1 ? headers.indexOf('nip') : 0;
    const colNama = headers.indexOf('nama') !== -1 ? headers.indexOf('nama') : 1;
    const colJab = headers.indexOf('jabatan') !== -1 ? headers.indexOf('jabatan') : 2;
    const colPkt = headers.indexOf('pangkat') !== -1 ? headers.indexOf('pangkat') : 3;

    for (let i = 1; i < uData.length; i++) {
      const nip = String(uData[i][colNip] || '').replace(/^'+/, '').trim();
      if (!nip) continue;
      map[nip] = {
        nip: nip,
        nama: String(uData[i][colNama] || '').trim(),
        jabatan: String(uData[i][colJab] || '').trim(),
        pangkat: String(uData[i][colPkt] || '').trim()
      };
    }
  } catch (err) {
    Logger.log("⚠️ [getUserMapStCompiler_ Error] " + err.toString());
  }
  return map;
}

/**
 * Helper: Escape HTML string
 */
function escapeHtmlStPdf_(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Helper: Format Tanggal Indonesia (DD Bulan YYYY)
 */
function formatDateIndoStPdf_(dateStr) {
  if (!dateStr) return '-';
  const str = String(dateStr).trim();
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  if (str.includes('/')) {
    const parts = str.split('/');
    if (parts.length >= 3) {
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y) && m >= 0 && m < 12) {
        return d + ' ' + months[m] + ' ' + y;
      }
    }
  } else if (str.includes('-')) {
    const parts = str.split('-');
    if (parts.length >= 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(y) && m >= 0 && m < 12) {
        return d + ' ' + months[m] + ' ' + y;
      }
    }
  }
  return str;
}

/**
 * Helper: Format rentang tanggal kegiatan
 */
function formatTanggalRentangStPdf_(start, end) {
  const fStart = formatDateIndoStPdf_(start);
  const fEnd = formatDateIndoStPdf_(end);
  if (!start && !end) return '-';
  if (start === end || !end) return fStart;
  return fStart + ' s.d. ' + fEnd;
}

/**
 * Helper: Format penomoran poin-poin dasar / menimbang agar rata menggantung
 */
function formatTeksRapiStPdf_(text) {
  if (!text) return '-';
  const lines = String(text).split('\n');
  let html = '<table style="width: 100%; border: none; font-size: 11pt; border-spacing: 0; padding: 0; margin: 0;">';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line) {
      const match = line.match(/^([0-9a-zA-Z]+[\.\)])\s+(.*)/);
      if (match) {
        html += '<tr>' +
          '<td style="width: 22px; vertical-align: top; padding: 0 0 2px 0; border: none;">' + escapeHtmlStPdf_(match[1]) + '</td>' +
          '<td style="vertical-align: top; text-align: justify; padding: 0 0 2px 0; border: none;">' + escapeHtmlStPdf_(match[2]) + '</td>' +
          '</tr>';
      } else {
        html += '<tr>' +
          '<td colspan="2" style="vertical-align: top; text-align: justify; padding: 0 0 2px 0; border: none;">' + escapeHtmlStPdf_(line) + '</td>' +
          '</tr>';
      }
    }
  }
  html += '</table>';
  return html;
}

/**
 * Helper: Pembersih Gelar untuk Tanda Tangan
 */
function formatNamaBersihStPdf_(name) {
  if (!name) return '-';
  const s = String(name).trim();
  const parts = s.split(',');
  const mainName = parts[0].replace(/^(H\.|Hj\.|Drs\.|Dra\.|Ir\.|Prof\.|Dr\.|K\.H\.)\s*/gi, '').trim();
  return mainName || s;
}

/**
 * Helper: Terbilang Angka Hari
 */
function getTerbilangHariStPdf_(n) {
  const hurufAngka = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
  const num = parseInt(n, 10);
  if (isNaN(num)) return String(n);
  if (num < 12) return hurufAngka[num];
  if (num < 20) return hurufAngka[num - 10] + " belas";
  if (num < 100) return hurufAngka[Math.floor(num / 10)] + " puluh " + (num % 10 !== 0 ? " " + hurufAngka[num % 10] : "");
  return String(num);
}

// =========================================================================
// 1. GENERATOR PDF SURAT TUGAS (ST)
// =========================================================================
function generateSuratTugasPdfBase64_(stRecord, pesertaList, ekstraData, nomorStResmi) {
  try {
    const userMap = getUserMapStCompiler_();

    const nomorSurat = String(nomorStResmi || stRecord[2] || '').trim();
    const menimbang = String(stRecord[3] || '');
    const dasar = String(stRecord[4] || '');
    const tujuan = String(stRecord[5] || '');
    const tempat = String(stRecord[6] || '');
    const tglMulai = String(stRecord[7] || '');
    const tglSelesai = String(stRecord[8] || '');
    const jam = String(stRecord[9] || '');
    const pejabatTtdNip = String(stRecord[11] || '').replace(/^'+/, '').trim();
    const waktuBuat = String(stRecord[1] || '');

    const pejabat = userMap[pejabatTtdNip] || { nama: '-', nip: pejabatTtdNip, jabatan: 'Ketua' };
    const namaTtdBersih = formatNamaBersihStPdf_(pejabat.nama);
    const jabatanKop = pejabat.jabatan ? (pejabat.jabatan.toUpperCase() + " PENGADILAN AGAMA INDRAMAYU") : "PENGADILAN AGAMA INDRAMAYU";

    // Format Hari Kegiatan
    let hariKegiatan = "-";
    if (tglMulai) {
      const d = new Date(tglMulai.includes('/') ? tglMulai.split('/').reverse().join('-') : tglMulai);
      if (!isNaN(d.getTime())) {
        const hariArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        hariKegiatan = hariArr[d.getDay()];
      }
    }

    const tanggalTtd = formatDateIndoStPdf_(waktuBuat.split(' ')[0] || new Date().toISOString().slice(0, 10));

    // Render Peserta
    const totalPeserta = pesertaList ? pesertaList.length : 0;
    let pesertaHtml = '';
    for (let j = 0; j < totalPeserta; j++) {
      const p = pesertaList[j];
      const colNumTag = (totalPeserta > 1) ? '<td style="width: 20px; vertical-align: top; padding: 2px 0;">' + (j + 1) + '.</td>' : '';
      const colEmptyTag = (totalPeserta > 1) ? '<td style="width: 20px;"></td>' : '';
      const padNama = (totalPeserta === 1) ? ' style="width: 25%; vertical-align: top; padding: 2px 0;"' : ' style="width: 25%; vertical-align: top; padding: 2px 0;"';

      pesertaHtml += '<div style="margin-bottom: 6px;">' +
        '<table style="width: 100%; border: none; font-size: 11pt; border-spacing: 0; padding: 0;">' +
        '<tr>' + colNumTag + '<td' + padNama + '>N a m a</td><td style="width: 15px; text-align: center;">:</td><td><b>' + escapeHtmlStPdf_(p.nama) + '</b></td></tr>' +
        '<tr>' + colEmptyTag + '<td>N I P</td><td style="text-align: center;">:</td><td>' + escapeHtmlStPdf_(p.nip) + '</td></tr>' +
        '<tr>' + colEmptyTag + '<td>Pangkat/Golongan</td><td style="text-align: center;">:</td><td>' + escapeHtmlStPdf_(p.pangkat || '-') + '</td></tr>' +
        '<tr>' + colEmptyTag + '<td>J a b a t a n</td><td style="text-align: center;">:</td><td>' + escapeHtmlStPdf_(p.jabatan || '-') + '</td></tr>' +
        '</table></div>';
    }

    const bebanAnggaranHtml = ekstraData && ekstraData.paragraf_biaya
      ? '<p style="text-align: justify; margin: 8px 0 4px 0; font-size: 11pt;">' + escapeHtmlStPdf_(ekstraData.paragraf_biaya) + '</p>'
      : '';

    const fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<style>' +
      '@page { size: A4 portrait; margin: 10mm 15mm 10mm 20mm; }' +
      'body { margin: 0; padding: 0; font-family: "Bookman Old Style", Georgia, "Times New Roman", serif; font-size: 11pt; line-height: 1.25; color: #000000; background: #ffffff; }' +
      '.kop-table { width: 100%; border-collapse: collapse; border-bottom: 2px solid black; padding-bottom: 5px; margin-bottom: 25px; }' +
      '.kop-logo { width: 85px; height: auto; vertical-align: middle; }' +
      '.kop-text { text-align: center; vertical-align: middle; padding-right: 20px; }' +
      '.kop-text h3 { margin: 0; font-size: 13pt; font-weight: bold; text-transform: uppercase; line-height: 1.15; }' +
      '.kop-text h2 { margin: 0; font-size: 14pt; font-weight: bold; text-transform: uppercase; line-height: 1.15; }' +
      '.kop-text p { margin: 3px 0 0 0; font-size: 8pt; line-height: 1.2; }' +
      '.st-title { text-align: center; margin-bottom: 20px; }' +
      '.st-title h4 { border-bottom: 2px solid black; display: inline-block; margin: 0; padding-bottom: 1px; font-size: 18pt; font-weight: bold; letter-spacing: 4px; line-height: 1; }' +
      '.st-title p { margin: 3px 0 0 0; font-size: 9.5pt; }' +
      '.st-sub-title { text-align: center; font-weight: bold; font-size: 11pt; text-transform: uppercase; margin-bottom: 12px; }' +
      '.content-tbl { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11pt; }' +
      '.content-tbl td { vertical-align: top; padding: 4px 0; border: none; }' +
      '.col-lbl { width: 15%; }' +
      '.col-cln { width: 3%; text-align: center; }' +
      '.col-val { width: 82%; text-align: justify; }' +
      '.tbl-untuk td { padding: 2px 0; vertical-align: top; font-size: 11pt; border: none; }' +
      '</style></head><body>' +

      // KOP SURAT
      '<table class="kop-table"><tr>' +
      '<td style="width: 90px; vertical-align: middle;"><img src="https://drive.google.com/thumbnail?id=1_Qbv_fdPOa2YEQAXXkvRxXevsd_4u1jZ&sz=w500" class="kop-logo" alt="Logo"></td>' +
      '<td class="kop-text">' +
      '<h3>MAHKAMAH AGUNG REPUBLIK INDONESIA</h3>' +
      '<h3>DIREKTORAT JENDERAL BADAN PERADILAN AGAMA</h3>' +
      '<h3>PENGADILAN TINGGI AGAMA BANDUNG</h3>' +
      '<h2>PENGADILAN AGAMA INDRAMAYU</h2>' +
      '<p>Jalan M.T. Haryono No.2A Kel. Sindang Kec. Sindang Kab. Indramayu Kode Pos 45222<br>' +
      'Telepon (0234) 273880 | Situs: www.pa-indramayu.go.id | e-mail: pa.indramayu_ptabdg@yahoo.co.id</p>' +
      '</td></tr></table>' +

      // JUDUL SURAT
      '<div class="st-title">' +
      '<h4>SURAT TUGAS</h4>' +
      '<p>Nomor : ' + escapeHtmlStPdf_(nomorSurat) + '</p>' +
      '</div>' +
      '<div class="st-sub-title">' + escapeHtmlStPdf_(jabatanKop) + '</div>' +

      // ISI SURAT
      '<table class="content-tbl">' +
      '<tr><td class="col-lbl">Menimbang</td><td class="col-cln">:</td><td class="col-val">' + formatTeksRapiStPdf_(menimbang) + '</td></tr>' +
      '<tr><td class="col-lbl">Dasar</td><td class="col-cln">:</td><td class="col-val">' + formatTeksRapiStPdf_(dasar) + '</td></tr>' +
      '</table>' +

      '<div style="text-align: center; font-weight: bold; font-size: 11pt; margin: 10px 0 6px 0;">Memberi Tugas</div>' +

      '<table class="content-tbl">' +
      '<tr><td class="col-lbl">Kepada</td><td class="col-cln">:</td><td class="col-val">' + pesertaHtml + '</td></tr>' +
      '<tr><td class="col-lbl">Untuk</td><td class="col-cln">:</td><td class="col-val">' +
      '<div style="text-align: justify; margin-bottom: 4px;">' + escapeHtmlStPdf_(tujuan) + ', pada:</div>' +
      '<table class="tbl-untuk" style="width: 100%; border: none;">' +
      '<tr><td style="width: 20px;"></td><td style="width: 100px;">Hari</td><td style="width: 15px; text-align: center;">:</td><td>' + escapeHtmlStPdf_(hariKegiatan) + '</td></tr>' +
      '<tr><td></td><td>Tanggal</td><td style="text-align: center;">:</td><td>' + escapeHtmlStPdf_(formatTanggalRentangStPdf_(tglMulai, tglSelesai)) + '</td></tr>' +
      '<tr><td></td><td>Pukul</td><td style="text-align: center;">:</td><td>' + escapeHtmlStPdf_(jam || '08.00 WIB s.d. Selesai') + '</td></tr>' +
      '<tr><td></td><td>Tempat</td><td style="text-align: center;">:</td><td>' + escapeHtmlStPdf_(tempat || '-') + '</td></tr>' +
      '</table>' +
      '</td></tr>' +
      '</table>' +

      bebanAnggaranHtml +

      '<p style="text-align: justify; margin-top: 10px; font-size: 11pt;">Surat tugas ini dibuat dan untuk dilaksanakan dengan penuh tanggung jawab.</p>' +

      // TANDA TANGAN
      '<table style="width: 100%; border: none; margin-top: 30px;"><tr>' +
      '<td style="width: 50%;"></td>' +
      '<td style="width: 50%; font-size: 11pt;">' +
      '<div>Indramayu, ' + escapeHtmlStPdf_(tanggalTtd) + '</div>' +
      '<div>' + escapeHtmlStPdf_(pejabat.jabatan || 'Ketua') + ',</div>' +
      '<div style="height: 60px;"></div>' +
      '<div style="font-weight: bold;">' + escapeHtmlStPdf_(namaTtdBersih) + '</div>' +
      '</td></tr></table>' +

      '</body></html>';

    const cleanFirst = pesertaList && pesertaList.length > 0
      ? String(pesertaList[0].nama || 'pegawai').replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/)[0].toLowerCase()
      : 'dinas';
    const pdfFileName = 'ST_' + cleanFirst + '_' + String(stRecord[0] || 'dok').replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';

    const htmlOutput = HtmlService.createHtmlOutput(fullHtml);
    const pdfBlob = htmlOutput.getAs('application/pdf').setName(pdfFileName);
    return {
      pdf_base64: Utilities.base64Encode(pdfBlob.getBytes()),
      pdf_filename: pdfFileName
    };
  } catch (err) {
    Logger.log("⚠️ [generateSuratTugasPdfBase64_ Error] " + err.toString());
    return { pdf_base64: '', pdf_filename: 'surat_tugas.pdf' };
  }
}

// =========================================================================
// 2. GENERATOR PDF SURAT PERJALANAN DINAS (SPD - 2 HALAMAN MA)
// =========================================================================
function generateSpdPdfBase64_(stRecord, pesertaList, ekstraData, nomorSpdResmi) {
  try {
    const userMap = getUserMapStCompiler_();

    const pesertaSpd = (pesertaList || []).filter(function(p) { return p.get_spd === true; });
    const targetPeserta = pesertaSpd.length > 0 ? pesertaSpd[0] : (pesertaList && pesertaList.length > 0 ? pesertaList[0] : { nama: 'Pegawai', nip: '-', pangkat: '-', jabatan: '-' });

    const nomorSpd = String(nomorSpdResmi || (ekstraData ? ekstraData.nomor_spd : '') || '-').trim();
    const ppkNama = (ekstraData && ekstraData.ppk_nama) ? ekstraData.ppk_nama : '-';
    const ppkNip = (ekstraData && ekstraData.ppk_nip) ? ekstraData.ppkNip : '-';

    const tglBerangkat = String(stRecord[7] || '');
    const tglKembali = String(stRecord[8] || '');
    const waktuBuat = String(stRecord[1] || '');
    const tanggalCetak = formatDateIndoStPdf_(waktuBuat.split(' ')[0] || new Date().toISOString().slice(0, 10));

    // Hitung Lama Hari
    let lamaHari = 1;
    if (tglBerangkat && tglKembali) {
      const d1 = new Date(tglBerangkat.includes('/') ? tglBerangkat.split('/').reverse().join('-') : tglBerangkat);
      const d2 = new Date(tglKembali.includes('/') ? tglKembali.split('/').reverse().join('-') : tglKembali);
      if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
        const diffTime = Math.abs(d2 - d1);
        lamaHari = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      }
    }
    const lamaHariTeks = getTerbilangHariStPdf_(lamaHari);

    const pejabatTtdNip = String(stRecord[11] || '').replace(/^'+/, '').trim();
    const ttdST = userMap[pejabatTtdNip] || { nama: '-', nip: '-', jabatan: 'Ketua Pengadilan Agama Indramayu' };

    // Daftar Pengikut
    const pengikutList = (pesertaList || []).filter(function(p) {
      return String(p.nip) !== String(targetPeserta.nip);
    });

    let pengikutNamaHtml = '';
    let pengikutKetHtml = '';
    if (pengikutList.length > 0) {
      pengikutNamaHtml = '<table style="width: 100%; border-collapse: collapse; border: none; font-size: 10pt;">';
      pengikutKetHtml = '<table style="width: 100%; border-collapse: collapse; border: none; font-size: 10pt;">';
      for (let k = 0; k < pengikutList.length; k++) {
        pengikutNamaHtml += '<tr><td style="width: 20px; border: none; padding: 2px 0;">' + (k + 1) + '.</td><td style="border: none; padding: 2px 0;">' + escapeHtmlStPdf_(pengikutList[k].nama) + '</td></tr>';
        pengikutKetHtml += '<tr><td style="border: none; padding: 2px 0; text-align: center;">-</td><td style="border: none; padding: 2px 0; text-align: center;">' + escapeHtmlStPdf_(pengikutList[k].jabatan || '-') + '</td></tr>';
      }
      pengikutNamaHtml += '</table>';
      pengikutKetHtml += '</table>';
    } else {
      pengikutNamaHtml = '-';
      pengikutKetHtml = '-';
    }

    const fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<style>' +
      '@page { size: A4 portrait; margin: 10mm 12mm 10mm 15mm; }' +
      'body { margin: 0; padding: 0; font-family: "Bookman Old Style", Georgia, "Times New Roman", serif; font-size: 10.5pt; line-height: 1.2; color: #000000; background: #ffffff; }' +
      '.page-break { page-break-before: always; }' +
      '.spd-hdr { width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 11pt; }' +
      '.spd-hdr td { vertical-align: top; padding: 1px 0; border: none; }' +
      '.spd-title { text-align: center; margin-bottom: 18px; }' +
      '.spd-title h4 { margin: 0; font-size: 12.5pt; font-weight: bold; text-decoration: underline; letter-spacing: 1px; }' +
      '.spd-tbl { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10.5pt; }' +
      '.spd-tbl th, .spd-tbl td { border: 1px solid black; padding: 5px 8px; vertical-align: top; }' +
      '.col-no { width: 4%; text-align: center; }' +
      '.col-lbl { width: 48%; }' +
      '.col-val { width: 48%; }' +
      '.inner-tbl { width: 100%; border-collapse: collapse; border: none; font-size: 10.5pt; }' +
      '.inner-tbl td { border: none !important; padding: 2px 0 !important; vertical-align: top; }' +
      '.visum-tbl { width: 100%; border-collapse: collapse; font-size: 10pt; table-layout: fixed; }' +
      '.visum-tbl td { border: 1px solid black; padding: 6px; vertical-align: top; }' +
      '</style></head><body>' +

      // === HALAMAN 1 ===
      '<table class="spd-hdr"><tr>' +
      '<td style="width: 50%; font-weight: bold; line-height: 1.25;">MAHKAMAH AGUNG<br>PENGADILAN AGAMA INDRAMAYU</td>' +
      '<td style="width: 50%;">' +
      '<table style="width: 100%; border: none;">' +
      '<tr><td style="width: 80px;">Lembar ke</td><td style="width: 15px;">:</td><td></td></tr>' +
      '<tr><td>Kode No</td><td>:</td><td></td></tr>' +
      '<tr><td>Nomor</td><td>:</td><td style="font-weight: bold;">' + escapeHtmlStPdf_(nomorSpd) + '</td></tr>' +
      '</table></td></tr></table>' +

      '<div class="spd-title"><h4>SURAT PERJALANAN DINAS (SPD)</h4></div>' +

      '<table class="spd-tbl">' +
      '<tr><td class="col-no">1</td><td class="col-lbl">Pejabat Pembuat Komitmen</td><td class="col-val"><strong>' + escapeHtmlStPdf_(ppkNama) + '</strong></td></tr>' +
      '<tr><td class="col-no">2</td><td class="col-lbl">Nama/NIP Pegawai yang diperintahkan</td><td class="col-val"><strong>' + escapeHtmlStPdf_(targetPeserta.nama) + '</strong><br>NIP. ' + escapeHtmlStPdf_(targetPeserta.nip) + '</td></tr>' +
      '<tr><td class="col-no">3</td>' +
      '<td style="padding: 0;"><table class="inner-tbl"><tr><td style="width: 20px;">a.</td><td>Pangkat dan Golongan Ruang Gaji</td></tr><tr><td>b.</td><td>Jabatan / Instansi</td></tr><tr><td>c.</td><td>Tingkat Menurut Peraturan Perjalanan Dinas</td></tr></table></td>' +
      '<td style="padding: 0;"><table class="inner-tbl"><tr><td style="width: 20px;">a.</td><td>' + escapeHtmlStPdf_(targetPeserta.pangkat || '-') + '</td></tr><tr><td>b.</td><td>' + escapeHtmlStPdf_(targetPeserta.jabatan || '-') + '</td></tr><tr><td>c.</td><td>' + escapeHtmlStPdf_((ekstraData && ekstraData.tingkat_spd) || 'Tingkat C') + '</td></tr></table></td>' +
      '</tr>' +
      '<tr><td class="col-no">4</td><td class="col-lbl">Maksud Perjalanan Dinas</td><td class="col-val" style="text-align: justify;">' + escapeHtmlStPdf_(stRecord[5] || '-') + '</td></tr>' +
      '<tr><td class="col-no">5</td><td class="col-lbl">Alat Angkutan Yang Digunakan</td><td class="col-val">' + escapeHtmlStPdf_((ekstraData && ekstraData.alat_angkut) || 'Kendaraan Umum / Dinas') + '</td></tr>' +
      '<tr><td class="col-no">6</td>' +
      '<td style="padding: 0;"><table class="inner-tbl"><tr><td style="width: 20px;">a.</td><td>Tempat Berangkat</td></tr><tr><td>b.</td><td>Tempat Tujuan</td></tr></table></td>' +
      '<td style="padding: 0;"><table class="inner-tbl"><tr><td style="width: 20px;">a.</td><td>Indramayu</td></tr><tr><td>b.</td><td>' + escapeHtmlStPdf_((ekstraData && ekstraData.tempat_tujuan_spd) || stRecord[6] || 'Bandung') + '</td></tr></table></td>' +
      '</tr>' +
      '<tr><td class="col-no">7</td>' +
      '<td style="padding: 0;"><table class="inner-tbl"><tr><td style="width: 20px;">a.</td><td>Lamanya Perjalanan Dinas</td></tr><tr><td>b.</td><td>Tanggal Berangkat</td></tr><tr><td>c.</td><td>Tanggal Harus Kembali</td></tr></table></td>' +
      '<td style="padding: 0;"><table class="inner-tbl"><tr><td style="width: 20px;">a.</td><td>' + lamaHari + ' (' + escapeHtmlStPdf_(lamaHariTeks) + ') hari</td></tr><tr><td>b.</td><td>' + escapeHtmlStPdf_(formatDateIndoStPdf_(tglBerangkat)) + '</td></tr><tr><td>c.</td><td>' + escapeHtmlStPdf_(formatDateIndoStPdf_(tglKembali)) + '</td></tr></table></td>' +
      '</tr>' +
      '<tr><td class="col-no">8</td>' +
      '<td style="padding: 0;"><table style="width: 100%; border-collapse: collapse; border: none;"><tr><td style="padding: 4px 6px; border-bottom: 1px solid black; font-weight: bold;">Pengikut : Nama</td></tr><tr><td style="padding: 4px 6px;">' + pengikutNamaHtml + '</td></tr></table></td>' +
      '<td style="padding: 0;"><table style="width: 100%; border-collapse: collapse; border: none;"><tr><td style="padding: 4px 6px; border-bottom: 1px solid black; font-weight: bold; text-align: center;">Keterangan / Jabatan</td></tr><tr><td style="padding: 4px 6px;">' + pengikutKetHtml + '</td></tr></table></td>' +
      '</tr>' +
      '<tr><td class="col-no">9</td>' +
      '<td style="padding: 0;"><div style="padding: 4px 6px; font-weight: bold;">Pembebanan Anggaran</div><table class="inner-tbl" style="padding-left: 6px;"><tr><td style="width: 20px;">a.</td><td>Instansi</td></tr><tr><td>b.</td><td>Mata Anggaran</td></tr></table></td>' +
      '<td style="padding: 0;"><div style="padding: 4px 6px;">&nbsp;</div><table class="inner-tbl"><tr><td style="width: 20px;">a.</td><td>' + escapeHtmlStPdf_((ekstraData && ekstraData.instansi) || 'Pengadilan Agama Indramayu') + '</td></tr><tr><td>b.</td><td>' + escapeHtmlStPdf_((ekstraData && ekstraData.mata_anggaran) || '-') + '</td></tr></table></td>' +
      '</tr>' +
      '<tr><td class="col-no">10</td><td class="col-lbl">Keterangan Lain</td><td class="col-val">-</td></tr>' +
      '</table>' +

      // TTD PPK HALAMAN 1
      '<table style="width: 100%; border: none; margin-top: 15px;"><tr>' +
      '<td style="width: 52%;"></td>' +
      '<td style="width: 48%; font-size: 10.5pt;">' +
      '<table style="width: 100%; border: none;"><tr><td style="width: 90px;">Dikeluarkan di</td><td style="width: 15px;">:</td><td>Indramayu</td></tr><tr><td>Tanggal</td><td>:</td><td>' + escapeHtmlStPdf_(tanggalCetak) + '</td></tr></table>' +
      '<div style="border-bottom: 1px solid black; margin: 4px 0; width: 220px;"></div>' +
      '<div>Pejabat Pembuat Komitmen,</div>' +
      '<div style="height: 55px;"></div>' +
      '<div style="font-weight: bold; text-decoration: underline;">' + escapeHtmlStPdf_(ppkNama) + '</div>' +
      '<div>NIP. ' + escapeHtmlStPdf_(ppkNip) + '</div>' +
      '</td></tr></table>' +

      // === HALAMAN 2: VISUM PERJALANAN DINAS ===
      '<div class="page-break"></div>' +
      '<div style="text-align: right; font-size: 9pt; margin-bottom: 10px;">SPD No : ' + escapeHtmlStPdf_(nomorSpd) + '</div>' +
      '<table class="visum-tbl">' +
      '<tr>' +
      '<td style="width: 50%; height: 160px;">' +
      '<div>I. Berangkat dari : Indramayu</div>' +
      '<div>&nbsp;&nbsp;&nbsp;Ke : ' + escapeHtmlStPdf_((ekstraData && ekstraData.tempat_tujuan_spd) || stRecord[6] || '-') + '</div>' +
      '<div>&nbsp;&nbsp;&nbsp;Pada tanggal : ' + escapeHtmlStPdf_(formatDateIndoStPdf_(tglBerangkat)) + '</div>' +
      '<div style="margin-top: 10px;">' + escapeHtmlStPdf_(ttdST.jabatan || 'Ketua Pengadilan Agama Indramayu') + '</div>' +
      '<div style="height: 50px;"></div>' +
      '<div style="font-weight: bold; text-decoration: underline;">' + escapeHtmlStPdf_(ttdST.nama || '-') + '</div>' +
      '<div>NIP. ' + escapeHtmlStPdf_(ttdST.nip || '-') + '</div>' +
      '</td>' +
      '<td style="width: 50%; height: 160px;">' +
      '<div>II. Tiba di :</div><div>&nbsp;&nbsp;&nbsp;&nbsp;Pada tanggal :</div>' +
      '<div style="margin-top: 15px;">Kepala :</div>' +
      '<div style="height: 60px;"></div>' +
      '<div>( ............................................................ )</div><div>NIP. </div>' +
      '</td>' +
      '</tr>' +
      '<tr>' +
      '<td style="height: 160px;">' +
      '<div>III. Tiba di :</div><div>&nbsp;&nbsp;&nbsp;&nbsp;Pada tanggal :</div>' +
      '<div style="margin-top: 15px;">Kepala :</div>' +
      '<div style="height: 60px;"></div>' +
      '<div>( ............................................................ )</div><div>NIP. </div>' +
      '</td>' +
      '<td style="height: 160px;">' +
      '<div>Berangkat dari :</div><div>Ke :</div><div>Pada tanggal :</div>' +
      '<div style="margin-top: 15px;">Kepala :</div>' +
      '<div style="height: 60px;"></div>' +
      '<div>( ............................................................ )</div><div>NIP. </div>' +
      '</td>' +
      '</tr>' +
      '<tr>' +
      '<td colspan="2" style="height: 130px;">' +
      '<div>IV. Telah diperiksa, dengan keterangan bahwa perjalanan tersebut diatas benar dilakukan atas perintahnya dan semata-mata untuk kepentingan jabatan dalam waktu yang sesingkat-singkatnya.</div>' +
      '<table style="width: 100%; border: none; margin-top: 15px;"><tr><td style="width: 50%; border: none;"></td><td style="width: 50%; border: none;">' +
      '<div>Pejabat Pembuat Komitmen,</div>' +
      '<div style="height: 50px;"></div>' +
      '<div style="font-weight: bold; text-decoration: underline;">' + escapeHtmlStPdf_(ppkNama) + '</div>' +
      '<div>NIP. ' + escapeHtmlStPdf_(ppkNip) + '</div>' +
      '</td></tr></table>' +
      '</td>' +
      '</tr>' +
      '<tr>' +
      '<td colspan="2" style="font-size: 8.5pt;">V. CATATAN LAIN-LAIN<br>Pejabat yang berwenang menerbitkan SPD, pegawai yang melakukan perjalanan dinas, para pejabat yang mengesahkan tanggal berangkat/tiba serta Bendaharawan bertanggung jawab berdasarkan peraturan-peraturan Keuangan Negara apabila Negara mendapat rugi akibat kesalahan, kealpaan atau kealpaannya.</td>' +
      '</tr>' +
      '</table>' +

      '</body></html>';

    const pdfFileName = 'SPD_' + String(stRecord[0] || 'dok').replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';
    const htmlOutput = HtmlService.createHtmlOutput(fullHtml);
    const pdfBlob = htmlOutput.getAs('application/pdf').setName(pdfFileName);
    return {
      pdf_base64: Utilities.base64Encode(pdfBlob.getBytes()),
      pdf_filename: pdfFileName
    };
  } catch (err) {
    Logger.log("⚠️ [generateSpdPdfBase64_ Error] " + err.toString());
    return { pdf_base64: '', pdf_filename: 'spd.pdf' };
  }
}

// =========================================================================
// 3. GENERATOR PDF SURAT PENUNJUKAN PLH
// =========================================================================
function generatePlhPdfBase64_(stRecord, plhTarget, ekstraData, nomorPlhResmi) {
  try {
    const userMap = getUserMapStCompiler_();

    const nomorPlh = String(nomorPlhResmi || (ekstraData ? ekstraData.nomor_plh : '') || '-').trim();
    const tglMulai = String(stRecord[7] || '');
    const tglSelesai = String(stRecord[8] || '');
    const waktuBuat = String(stRecord[1] || '');
    const tanggalCetak = formatDateIndoStPdf_(waktuBuat.split(' ')[0] || new Date().toISOString().slice(0, 10));

    // Identitas Pejabat Asal (yang dinas) & Pejabat Plh (yang ditunjuk)
    const pejabatAsalNip = String(plhTarget ? (plhTarget.nip_pejabat_asal || plhTarget.nip) : '').replace(/^'+/, '').trim();
    const plhNip = String(plhTarget ? (plhTarget.plh_nip || plhTarget.nip) : '').replace(/^'+/, '').trim();

    const pejabatAsal = userMap[pejabatAsalNip] || { nama: '-', nip: pejabatAsalNip, jabatan: 'Ketua / Wakil Ketua' };
    const plhUser = userMap[plhNip] || {
      nama: plhTarget ? (plhTarget.plh_nama || plhTarget.nama) : 'Pegawai',
      nip: plhNip,
      pangkat: plhTarget ? (plhTarget.plh_pangkat || plhTarget.pangkat || '-') : '-',
      jabatan: plhTarget ? (plhTarget.plh_jabatan || plhTarget.jabatan || '-') : '-'
    };

    const ttdStNip = String(stRecord[11] || '').replace(/^'+/, '').trim();
    const ttdST = userMap[ttdStNip] || { nama: '-', nip: '-', jabatan: 'Ketua' };
    const namaTtdBersih = formatNamaBersihStPdf_(ttdST.nama);

    let tanggalTugasStr = '';
    if (tglMulai === tglSelesai || !tglSelesai) {
      tanggalTugasStr = 'tanggal ' + formatDateIndoStPdf_(tglMulai);
    } else {
      tanggalTugasStr = 'tanggal ' + formatDateIndoStPdf_(tglMulai) + ' s.d. ' + formatDateIndoStPdf_(tglSelesai);
    }

    const fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<style>' +
      '@page { size: A4 portrait; margin: 10mm 15mm 10mm 15mm; }' +
      'body { margin: 0; padding: 0; font-family: "Bookman Old Style", Georgia, "Times New Roman", serif; font-size: 11pt; line-height: 1.3; color: #000000; background: #ffffff; }' +
      '.plh-center { text-align: center; }' +
      '.plh-logo { width: 90px; height: auto; margin-bottom: 5px; }' +
      '.plh-hdr-title { font-size: 16pt; font-weight: bold; text-decoration: underline; letter-spacing: 2px; margin-bottom: 2px; }' +
      '.plh-main-tbl { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 11pt; }' +
      '.plh-main-tbl td { vertical-align: top; padding: 4px 0; border: none; }' +
      '.col-lbl { width: 130px; }' +
      '.col-cln { width: 15px; text-align: center; }' +
      '.col-cnt { text-align: justify; }' +
      '</style></head><body>' +

      // LOGO MA
      '<div class="plh-center">' +
      '<img src="https://drive.google.com/thumbnail?id=1_Qbv_fdPOa2YEQAXXkvRxXevsd_4u1jZ&sz=w400" class="plh-logo" alt="Logo Pengadilan">' +
      '</div>' +

      // JUDUL SURAT
      '<div class="plh-center" style="margin-bottom: 20px;">' +
      '<div class="plh-hdr-title">SURAT &nbsp;&nbsp;PENUNJUKAN</div>' +
      '<div style="font-size: 11pt;">Nomor : ' + escapeHtmlStPdf_(nomorPlh) + '</div>' +
      '</div>' +

      '<div class="plh-center" style="font-weight: bold; margin-bottom: 15px; font-size: 11.5pt; text-transform: uppercase;">' +
      escapeHtmlStPdf_(ttdST.jabatan ? ttdST.jabatan.toUpperCase() : 'KETUA') + ' PENGADILAN AGAMA INDRAMAYU' +
      '</div>' +

      // ISI SURAT
      '<table class="plh-main-tbl">' +
      '<tr><td class="col-lbl">Menimbang</td><td class="col-cln">:</td>' +
      '<td class="col-cnt">Bahwa sehubungan ' + escapeHtmlStPdf_(pejabatAsal.jabatan || 'Pejabat') + ' Pengadilan Agama Indramayu Kelas I.A melaksanakan tugas dinas luar.</td></tr>' +
      '<tr><td class="col-lbl">Dasar</td><td class="col-cln">:</td>' +
      '<td class="col-cnt">' +
      '<ol style="margin: 0; padding-left: 20px;">' +
      '<li style="margin-bottom: 3px;">Undang-Undang Nomor 7 Tahun 1989 tentang Peradilan Agama sebagaimana telah diubah dengan Undang-Undang Nomor 3 Tahun 2006 dan perubahan kedua dengan Undang-Undang Nomor 50 Tahun 2009;</li>' +
      '<li style="margin-bottom: 3px;">Surat Edaran Mahkamah Agung RI Nomor 1 Tahun 2017 tentang Pemberlakuan Rumusan Hasil Rapat Pleno Kamar Mahkamah Agung Tahun 2017 Sebagai Pedoman Pelaksanaan Tugas Bagi Pengadilan.</li>' +
      '</ol>' +
      '</td></tr>' +
      '<tr><td colspan="3" class="plh-center" style="font-weight: bold; padding: 12px 0 6px 0;">MEMBERI TUGAS</td></tr>' +
      '<tr><td class="col-lbl">Kepada</td><td class="col-cln">:</td>' +
      '<td class="col-cnt">' +
      '<table style="width: 100%; border: none; font-size: 11pt;">' +
      '<tr><td style="width: 130px; padding: 1px 0;">Nama</td><td style="width: 15px; text-align: center;">:</td><td><b>' + escapeHtmlStPdf_(plhUser.nama) + '</b></td></tr>' +
      '<tr><td style="padding: 1px 0;">NIP</td><td style="text-align: center;">:</td><td>' + escapeHtmlStPdf_(plhUser.nip) + '</td></tr>' +
      '<tr><td style="padding: 1px 0;">Pangkat/Golongan</td><td style="text-align: center;">:</td><td>' + escapeHtmlStPdf_(plhUser.pangkat || '-') + '</td></tr>' +
      '<tr><td style="padding: 1px 0;">Jabatan</td><td style="text-align: center;">:</td><td>' + escapeHtmlStPdf_(plhUser.jabatan || '-') + '</td></tr>' +
      '</table>' +
      '</td></tr>' +
      '<tr><td class="col-lbl">Sebagai</td><td class="col-cln">:</td>' +
      '<td class="col-cnt">Pelaksana Harian (Plh.) ' + escapeHtmlStPdf_(pejabatAsal.jabatan || 'Pejabat') + ' Pengadilan Agama Indramayu Kelas I.A.</td></tr>' +
      '<tr><td class="col-lbl">Untuk</td><td class="col-cln">:</td>' +
      '<td class="col-cnt">Melaksanakan tugas sehari-hari ' + escapeHtmlStPdf_(pejabatAsal.jabatan || 'Pejabat') + ' Pengadilan Agama Indramayu Kelas I.A terhitung mulai ' + escapeHtmlStPdf_(tanggalTugasStr) + '.</td></tr>' +
      '</table>' +

      '<p style="text-align: justify; margin-top: 15px; font-size: 11pt;">Demikian Surat Penunjukan ini dibuat untuk dilaksanakan dengan penuh rasa tanggung jawab.</p>' +

      // TANDA TANGAN KETUA
      '<table style="width: 100%; border: none; margin-top: 25px;"><tr>' +
      '<td style="width: 50%;"></td>' +
      '<td style="width: 50%; font-size: 11pt;">' +
      '<div>Dikeluarkan di : Indramayu</div>' +
      '<div>Pada tanggal &nbsp;&nbsp;: ' + escapeHtmlStPdf_(tanggalCetak) + '</div>' +
      '<div style="margin-top: 5px; font-weight: bold; text-transform: uppercase;">' + escapeHtmlStPdf_(ttdST.jabatan ? ttdST.jabatan.toUpperCase() : 'KETUA') + ',</div>' +
      '<div style="height: 60px;"></div>' +
      '<div style="font-weight: bold;">' + escapeHtmlStPdf_(namaTtdBersih) + '</div>' +
      '</td></tr></table>' +

      '</body></html>';

    const cleanPlhName = String(plhUser.nama || 'plh').replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/)[0].toLowerCase();
    const pdfFileName = 'PLH_' + cleanPlhName + '_' + String(stRecord[0] || 'dok').replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';

    const htmlOutput = HtmlService.createHtmlOutput(fullHtml);
    const pdfBlob = htmlOutput.getAs('application/pdf').setName(pdfFileName);
    return {
      pdf_base64: Utilities.base64Encode(pdfBlob.getBytes()),
      pdf_filename: pdfFileName
    };
  } catch (err) {
    Logger.log("⚠️ [generatePlhPdfBase64_ Error] " + err.toString());
    return { pdf_base64: '', pdf_filename: 'plh.pdf' };
  }
}

