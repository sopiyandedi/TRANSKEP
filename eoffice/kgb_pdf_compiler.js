// =========================================================================
// FILE: eoffice/kgb_pdf_compiler.js
// DESKRIPSI: Headless PDF Compiler untuk Surat Pemberitahuan KGB PA Indramayu
// STANDAR: 1 Halaman Legal (216mm x 356mm), Tanda Tangan Ketua, Layout CSS 2.1 GAS
// ENGINE: TRANSKEP Core v1.0.0
// =========================================================================

/**
 * Helper: Escape HTML untuk mencegah karakter khusus merusak struktur dokumen PDF
 */
function escapeHtmlKgbPdf_(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Helper: Ekstrak tanggal lahir DD-MM-YYYY tervalidasi kalender dari 8 digit awal NIP PNS
 */
function extractBirthDateFromNipKgbPdf_(nip) {
  if (!nip) return '';
  const digits = String(nip).replace(/[^0-9]/g, '');
  if (digits.length < 8) return '';
  const y = parseInt(digits.substring(0, 4), 10);
  const m = parseInt(digits.substring(4, 6), 10);
  const d = parseInt(digits.substring(6, 8), 10);
  if (y < 1940 || y > 2010 || m < 1 || m > 12 || d < 1 || d > 31) return '';
  const probe = new Date(y, m - 1, d);
  if (probe.getFullYear() !== y || probe.getMonth() !== (m - 1) || probe.getDate() !== d) {
    return '';
  }
  const pad = function(n) { return (n < 10 ? '0' : '') + n; };
  return pad(d) + '-' + pad(m) + '-' + y;
}

/**
 * Helper: Format tanggal lahir angka murni DD-MM-YYYY (prioritaskan 8 digit awal NIP)
 */
function formatTglAngkaKgbPdf_(val, nip) {
  const nipBirth = extractBirthDateFromNipKgbPdf_(nip);
  if (nipBirth) return nipBirth;

  const str = val ? String(val).trim() : '';
  if (!str) return '-';
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str;

  const pad = function(n) { return (n < 10 ? '0' : '') + n; };
  const months = [
    'januari', 'februari', 'maret', 'april', 'mei', 'juni',
    'juli', 'agustus', 'september', 'oktober', 'november', 'desember'
  ];

  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const p = str.split('T')[0].split('-');
    return pad(parseInt(p[2], 10)) + '-' + pad(parseInt(p[1], 10)) + '-' + parseInt(p[0], 10);
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const p = str.split('/');
    return pad(parseInt(p[0], 10)) + '-' + pad(parseInt(p[1], 10)) + '-' + parseInt(p[2], 10);
  }
  const lower = str.toLowerCase();
  for (let i = 0; i < months.length; i++) {
    if (lower.indexOf(months[i]) !== -1) {
      const nums = str.match(/\d+/g);
      if (nums && nums.length >= 2) {
        return pad(parseInt(nums[0], 10)) + '-' + pad(i + 1) + '-' + nums[nums.length - 1];
      }
    }
  }
  return str;
}

/**
 * Helper: Bersihkan golongan/ruang dalam kurung & singkat "Tingkat I" -> "Tk. I"
 */
function formatPangkatCetakKgbPdf_(pangkatStr) {
  if (!pangkatStr || pangkatStr === '-') return '-';
  let s = String(pangkatStr).trim();
  s = s.replace(/\s*[\(\[\{]\s*(?:I{1,3}|IV|V)\s*\/\s*[a-eA-E]\s*[\)\]\}]/gi, '');
  s = s.replace(/(?:[\s,\-\/]+)?\b(?:I{1,3}|IV|V)\s*\/\s*[a-eA-E]\b/gi, '');
  s = s.replace(/[\s,\-\/\(\[\{]+$/, '').trim();
  s = s.replace(/\bTingkat\s+I\b(?!\w)/gi, 'Tk. I').trim();
  return s || '-';
}

/**
 * Helper: Cari nama Ketua Pengadilan aktif (bukan Wakil Ketua) jika field nama_ketua kosong
 */
function findKetuaNameForKgbPdf_() {
  try {
    const ss = getDB();
    const sheetUser = ss.getSheetByName('user_data');
    if (!sheetUser) return '';
    const uData = (typeof readUserSheetDecrypted_ === 'function')
      ? readUserSheetDecrypted_(sheetUser)
      : sheetUser.getDataRange().getValues();
    if (!uData || uData.length <= 1) return '';

    const headers = uData[0].map(function(h) {
      return String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    });
    const colNama = headers.indexOf('nama') !== -1 ? headers.indexOf('nama') : 1;
    const colJab = headers.indexOf('jabatan') !== -1 ? headers.indexOf('jabatan') : 2;

    for (let i = 1; i < uData.length; i++) {
      const jab = String(uData[i][colJab] || '').toLowerCase();
      if (jab.indexOf('ketua') !== -1 && jab.indexOf('wakil') === -1) {
        return String(uData[i][colNama] || '').trim();
      }
    }
  } catch (e) {
    Logger.log('⚠️ [findKetuaNameForKgbPdf_] ' + e.toString());
  }
  return '';
}

/**
 * Helper: Format nominal ribuan bertitik tanpa "Rp" ganda
 */
function formatNominalKgbPdf_(val) {
  if (typeof formatRibuanGajiKgb_ === 'function') return formatRibuanGajiKgb_(val);
  if (val === null || val === undefined) return '-';
  const digits = String(val).replace(/[^0-9]/g, '');
  if (!digits) return String(val || '-');
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Generator PDF Resmi SK Kenaikan Gaji Berkala (KGB) untuk Diunggah ke MYSIMS
 * Menggunakan tabel CSS 2.1 agar 100% stabil di engine konversi HtmlService GAS -> PDF
 * @param {Object} kgbRecord - Objek data KGB lengkap (dari Firestore/Snapshot)
 * @param {string} nomorSuratResmi - Nomor surat resmi terbitan MYSIMS (mis. "1092/KPA.W10-A2/KP2.1.2/XI/2026")
 * @returns {{ pdf_base64: string, pdf_filename: string }}
 */
function generateKgbPdfBase64_(kgbRecord, nomorSuratResmi) {
  try {
    const p = kgbRecord || {};
    const cleanNomor = String(nomorSuratResmi || p.nomor_surat || '').trim();

    let noInfo = { nokgb: '......', bulan: 'XI', tahun: String(new Date().getFullYear()), full: cleanNomor };
    if (typeof parseNomorKgbBackend_ === 'function') {
      noInfo = parseNomorKgbBackend_(Object.assign({}, p, { nomor_surat: cleanNomor || p.nomor_surat }));
    } else if (cleanNomor) {
      const segs = cleanNomor.split('/');
      if (segs[0]) noInfo.nokgb = segs[0].trim();
      if (segs.length >= 5) {
        noInfo.bulan = segs[3].trim();
        noInfo.tahun = segs[4].trim();
      }
      noInfo.full = cleanNomor;
    }

    const fmtIndo = (typeof formatTglIndoKgb_ === 'function')
      ? formatTglIndoKgb_
      : function(v) { return String(v || '-'); };
    const parseMkg = (typeof parseMasaKerjaKgbBackend_ === 'function')
      ? parseMasaKerjaKgbBackend_
      : function(t, b) { return { tahun: String(t || '0'), bulan: String(b || '0') }; };
    const stripKetua = (typeof stripGelarKgb_ === 'function')
      ? stripGelarKgb_
      : function(n) { return String(n || '-').split(',')[0].trim(); };

    const mkgLama = parseMkg(p.tahun_lama, p.bulan_lama, p.mkg_lama);
    const mkgBaru = parseMkg(p.tahun_baru, p.bulan_baru, p.mkg_baru);

    const namaPegawai = String(p.nama_pegawai || p.nama || '-').trim();
    const nipPegawai = String(p.nip || '-').replace(/^'+/, '').trim();
    const tglLahirAngka = formatTglAngkaKgbPdf_(p.tanggal_lahir, nipPegawai);
    const pangkatSingkat = formatPangkatCetakKgbPdf_(p.pangkat);
    const jabatan = String(p.jabatan || '-').trim();
    const unitKerja = String(p.unit_kerja || 'Pengadilan Agama Indramayu Kelas 1.A.').trim();

    const gajiLamaStr = formatNominalKgbPdf_(p.gaji_lama);
    const gajiBaruStr = formatNominalKgbPdf_(p.gaji_baru);
    const hurufGaji = String(p.terbilang_gaji || p.huruf_gaji || '-').trim();
    const golongan = String(p.golongan_baru || p.golongan || '-').trim();

    const tglSuratStr = fmtIndo(p.tanggal_surat || new Date());
    const tglSkLamaStr = fmtIndo(p.tanggal_sk_lama);
    const tmtLamaStr = fmtIndo(p.tmt_lama);
    const tmtBaruStr = fmtIndo(p.tmt_baru);
    const tmtYadStr = fmtIndo(p.tmt_yad);
    const pejabatLama = String(p.pejabat_lama || 'Ketua Pengadilan Agama Indramayu').trim();
    const nomorSkLama = String(p.nomor_sk_lama || '-').trim();
    const dasarPp = String(p.dasar_pp || 'Peraturan Pemerintah Republik Indonesia Nomor : 05 Tahun 2024').trim();

    const rawKetua = String(p.nama_ketua || p.nama_ttd || '').trim() || findKetuaNameForKgbPdf_() || 'Ketua';
    const namaTtd = stripKetua(rawKetua) || '-';

    const fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<style>' +
      '@page { size: legal portrait; margin: 9mm 16mm 10mm 20mm; }' +
      'body { margin: 0; padding: 0; font-family: "Bookman Old Style", Georgia, "Times New Roman", serif; font-size: 12pt; line-height: 1.4; color: #000000; background: #ffffff; }' +
      '.kop-table { width: 100%; border-collapse: collapse; border-bottom: 2px solid #000000; margin-bottom: 8px; }' +
      '.kop-table td { vertical-align: middle; border: none; padding: 0 0 5px 0; }' +
      '.kop-logo { width: 88px; height: auto; }' +
      '.kop-text { text-align: center; padding-right: 30px; }' +
      '.kop-text h3 { margin: 0; font-size: 14pt; font-weight: bold; text-transform: uppercase; line-height: 1.15; }' +
      '.kop-text h2 { margin: 0; font-size: 14pt; font-weight: bold; text-transform: uppercase; line-height: 1.15; }' +
      '.kop-text p { margin: 2px 0 0 0; font-size: 8pt; line-height: 1.25; }' +
      '.meta-table { width: 100%; border-collapse: collapse; margin-bottom: 0px; font-size: 12pt; }' +
      '.meta-table td { vertical-align: top; padding: 1px 0; border: none; }' +
      '.tujuan-box { margin-left: 82px; margin-top: 24px; margin-bottom: 32px; font-size: 12pt; line-height: 1.38; }' +
      '.paragraf { text-align: justify; margin-left: 82px; text-indent: 32px; margin-top: 0px; margin-bottom: 10px; font-size: 12pt; line-height: 1.4; }' +
      '.detail-wrap { margin-left: 82px; }' +
      '.detail-table { width: 100%; border-collapse: collapse; font-size: 12pt; }' +
      '.detail-table td { vertical-align: top; padding: 2px 0; border: none; }' +
      '.col-no { width: 22px; text-align: left; }' +
      '.col-lbl { width: 163px; white-space: nowrap; padding-right: 2px; }' +
      '.col-cln { width: 10px; text-align: center; }' +
      '.col-val { text-align: left; }' +
      '.subnote { margin-left: 82px; margin-top: 6px; margin-bottom: 6px; font-size: 12pt; }' +
      '.banner { margin: 8px 0 8px 82px; text-align: left; font-size: 12pt; font-weight: normal; letter-spacing: 0.2px; }' +
      '.ttd-table { width: 100%; border-collapse: collapse; margin-top: 28px; font-size: 12pt; }' +
      '.ttd-table td { vertical-align: top; border: none; padding: 0; }' +
      '.tembusan { margin-left: 82px; margin-top: 18px; font-size: 12pt; line-height: 1.38; }' +
      '.tembusan-table { width: 100%; border-collapse: collapse; margin-top: 1px; font-size: 12pt; }' +
      '.tembusan-table td { vertical-align: top; padding: 1px 0; border: none; }' +
      '</style></head><body>' +

      // KOP SURAT
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

      // NOMOR, LAMPIRAN, PERIHAL & TANGGAL
      '<table class="meta-table">' +
      '<tr>' +
      '<td style="width: 74px; white-space: nowrap;">Nomor</td>' +
      '<td style="width: 12px; text-align: center;">:</td>' +
      '<td>' + escapeHtmlKgbPdf_(noInfo.full) + '</td>' +
      '<td style="text-align: right; white-space: nowrap; padding-left: 10px;">' + escapeHtmlKgbPdf_(tglSuratStr) + '</td>' +
      '</tr>' +
      '<tr><td>Lampiran</td><td style="text-align: center;">:</td><td colspan="2">-</td></tr>' +
      '<tr><td>Perihal</td><td style="text-align: center;">:</td><td colspan="2">' +
      'Pemberitahuan Tentang Kenaikan Gaji<br>' +
      'Berkala a.n. Sdr. <strong>' + escapeHtmlKgbPdf_(namaPegawai) + '</strong>' +
      '</td></tr>' +
      '</table>' +

      // TUJUAN
      '<div class="tujuan-box">' +
      'Kepada<br>' +
      'Yth. Kepala Kantor Pelayanan Perbendaharaan<br>' +
      'Negara Cirebon<br>' +
      'di-<br>' +
      '<div style="margin-left: 36px; letter-spacing: 2px;">Cirebon</div>' +
      '</div>' +

      // PEMBUKA
      '<p class="paragraf">Dengan ini kami beritahukan, bahwa berhubung dengan telah terpenuhinya masa kerja dan syarat- syarat lainnya atas:</p>' +

      // POIN 1 - 5
      '<div class="detail-wrap"><table class="detail-table">' +
      '<tr><td class="col-no">1.</td><td class="col-lbl">Nama/Tanggal lahir</td><td class="col-cln">:</td><td class="col-val">' + escapeHtmlKgbPdf_(namaPegawai + '/' + tglLahirAngka) + '</td></tr>' +
      '<tr><td class="col-no">2.</td><td class="col-lbl">NIP</td><td class="col-cln">:</td><td class="col-val">' + escapeHtmlKgbPdf_(nipPegawai) + '</td></tr>' +
      '<tr><td class="col-no">3.</td><td class="col-lbl">Pangkat/Jabatan</td><td class="col-cln">:</td><td class="col-val">' + escapeHtmlKgbPdf_(pangkatSingkat + '/' + jabatan) + '</td></tr>' +
      '<tr><td class="col-no">4.</td><td class="col-lbl">Unit Kerja</td><td class="col-cln">:</td><td class="col-val">' + escapeHtmlKgbPdf_(unitKerja) + '</td></tr>' +
      '<tr><td class="col-no">5.</td><td class="col-lbl">Gaji Pokok Lama</td><td class="col-cln">:</td><td class="col-val">Rp ' + escapeHtmlKgbPdf_(gajiLamaStr) + ',-</td></tr>' +
      '</table></div>' +

      '<div class="subnote">(atas dasar Skp. terakhir tentang gaji/pangkat yang di tetapkan)</div>' +

      // POIN a - e
      '<div class="detail-wrap"><table class="detail-table">' +
      '<tr><td class="col-no">a.</td><td class="col-lbl">Oleh pejabat</td><td class="col-cln">:</td><td class="col-val">' + escapeHtmlKgbPdf_(pejabatLama) + '</td></tr>' +
      '<tr><td class="col-no">b.</td><td class="col-lbl">Nomor</td><td class="col-cln">:</td><td class="col-val">' + escapeHtmlKgbPdf_(nomorSkLama) + '</td></tr>' +
      '<tr><td class="col-no">c.</td><td class="col-lbl">Tanggal</td><td class="col-cln">:</td><td class="col-val">' + escapeHtmlKgbPdf_(tglSkLamaStr) + '</td></tr>' +
      '<tr><td class="col-no">d.</td><td class="col-lbl">Tanggal mulai gaji</td><td class="col-cln">:</td><td class="col-val">' + escapeHtmlKgbPdf_(tmtLamaStr) + '</td></tr>' +
      '<tr><td class="col-no">e.</td><td class="col-lbl">Masa kerja golongan</td><td class="col-cln">:</td><td class="col-val">' + escapeHtmlKgbPdf_(mkgLama.tahun + ' Tahun ' + mkgLama.bulan + ' bulan') + '</td></tr>' +
      '</table></div>' +

      '<div class="banner">DIBERIKAN KENAIKAN GAJI BERKALA HINGGA MEMPEROLEH :</div>' +

      // POIN 6 - 10
      '<div class="detail-wrap"><table class="detail-table">' +
      '<tr><td class="col-no">6.</td><td class="col-lbl">Gaji pokok baru</td><td class="col-cln">:</td><td class="col-val">Rp. ' + escapeHtmlKgbPdf_(gajiBaruStr) + ',- (' + escapeHtmlKgbPdf_(hurufGaji) + ')</td></tr>' +
      '<tr><td class="col-no">7.</td><td class="col-lbl">Masa kerja</td><td class="col-cln">:</td><td class="col-val">' + escapeHtmlKgbPdf_(mkgBaru.tahun) + ' Tahun</td></tr>' +
      '<tr><td class="col-no">8.</td><td class="col-lbl">Golongan/Ruang</td><td class="col-cln">:</td><td class="col-val">' + escapeHtmlKgbPdf_(golongan) + '</td></tr>' +
      '<tr><td class="col-no">9.</td><td class="col-lbl">Mulai tanggal</td><td class="col-cln">:</td><td class="col-val">' + escapeHtmlKgbPdf_(tmtBaruStr) + '</td></tr>' +
      '<tr><td class="col-no">10.</td><td class="col-lbl">Kenaikan gaji Yad.</td><td class="col-cln">:</td><td class="col-val">' + escapeHtmlKgbPdf_(tmtYadStr) + '</td></tr>' +
      '</table></div>' +

      // PENUTUP
      '<p class="paragraf" style="margin-top: 6px; margin-bottom: 0;">Kami harap sesuai dengan ' + escapeHtmlKgbPdf_(dasarPp) + ', kepada Pegawai tersebut agar dibayarkan penghasilannya berdasarkan gaji pokoknya yang baru.</p>' +

      // TANDA TANGAN KETUA (TABEL CSS 2.1 PRESISI 175PX DARI KANAN)
      '<table class="ttd-table"><tr>' +
      '<td></td>' +
      '<td style="width: 175px;">' +
      '<div>Ketua,</div>' +
      '<div style="height: 64px;"></div>' +
      '<div style="font-weight: bold;">' + escapeHtmlKgbPdf_(namaTtd) + '</div>' +
      '</td>' +
      '</tr></table>' +

      // TEMBUSAN
      '<div class="tembusan">' +
      '<div>Tembusan :</div>' +
      '<table class="tembusan-table">' +
      '<tr><td style="width: 24px;">1.</td><td>Ketua Pengadilan Tinggi Agama Bandung di Bandung;</td></tr>' +
      '<tr><td style="width: 24px;">2.</td><td>Kepala Kantor Cabang PT. TASPEN di Cirebon;</td></tr>' +
      '<tr><td style="width: 24px;">3.</td><td>Sdr. <strong>' + escapeHtmlKgbPdf_(namaPegawai) + '</strong> di Indramayu.</td></tr>' +
      '</table>' +
      '</div>' +

      '</body></html>';

    const cleanFirst = namaPegawai.replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/)[0].toLowerCase() || 'pegawai';
    const noTag = String(noInfo.nokgb || 'draft').replace(/[^a-zA-Z0-9.-]/g, '_');
    const pdfFileName = 'SK_KGB_' + cleanFirst + '_' + noTag + '.pdf';

    // Percobaan 1: Render lengkap beserta gambar logo kop dari Google Drive
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
      Logger.log('⚠️ [generateKgbPdfBase64_] Percobaan 1 gagal: ' + errPdf1.toString() + '. Beralih ke fallback teks bersih...');
    }

    // Percobaan 2 (Fallback Anti-Crash): Ganti tag <img> eksternal agar PDF tetap terbit & masuk lampiran MYSIMS
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
    Logger.log('⚠️ [generateKgbPdfBase64_ Error] ' + err.toString());
    return { pdf_base64: '', pdf_filename: 'sk_kgb.pdf' };
  }
}
