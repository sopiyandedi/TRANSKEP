// ==========================================
// FILE: eoffice/kgb.js
// DESKRIPSI: Backend Service Penyusunan SK KGB & Google Docs Generator
// FORMAT: Pengadilan Agama Indramayu Kelas 1.A. ke KPPN Cirebon
// MASTER DOC: 1guFYYKbZ1ylW3i7zjgvFZv1fdbB88XWKJwmaJCKeefg
// TARGET FOLDER: 1IwQ96D4dY6HrPCqoXY2opX8FHWaMjAHQ
// ENGINE: TRANSKEP Core v1.0.0
// ==========================================

const DEFAULT_KGB_FOLDER_ID = '1IwQ96D4dY6HrPCqoXY2opX8FHWaMjAHQ';
const DEFAULT_KGB_TEMPLATE_ID = '1guFYYKbZ1ylW3i7zjgvFZv1fdbB88XWKJwmaJCKeefg';

const KGB_BULAN_INDO_ = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];
const KGB_BULAN_ROMAWI_ = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/**
 * Helper: Format tanggal menjadi Bahasa Indonesia ("1 Desember 2026")
 */
function formatTglIndoKgb_(val) {
  if (!val) return '-';
  const str = String(val).trim();
  if (!str) return '-';
  if (/[a-zA-Z]{3,}/.test(str) && str.indexOf('T') === -1) return str;

  let d, m, y;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parts = str.split('T')[0].split('-');
    y = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10) - 1;
    d = parseInt(parts[2], 10);
  } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const parts = str.split('/');
    d = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10) - 1;
    y = parseInt(parts[2], 10);
  } else {
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) {
      d = dt.getDate();
      m = dt.getMonth();
      y = dt.getFullYear();
    } else {
      return str;
    }
  }
  if (isNaN(d) || isNaN(m) || isNaN(y) || m < 0 || m > 11) return str;
  return d + ' ' + KGB_BULAN_INDO_[m] + ' ' + y;
}

/**
 * Helper: Format angka rupiah ke ribuan bertitik ("2.964.000") tanpa "Rp" ganda
 */
function formatRibuanGajiKgb_(val) {
  if (val === null || val === undefined) return '-';
  const raw = String(val).trim();
  if (!raw) return '-';
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return raw;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Helper: Ekstrak komponen Nomor Surat { nokgb, bulan, tahun, full }
 */
function parseNomorKgbBackend_(p) {
  const now = new Date();
  let bulan = KGB_BULAN_ROMAWI_[now.getMonth()];
  let tahun = String(now.getFullYear());

  const tglRef = String(p.tanggal_surat || p.tanggal || '').trim();
  if (tglRef) {
    const yMatch = tglRef.match(/\b(20\d{2})\b/);
    if (yMatch) tahun = yMatch[1];
    const lower = tglRef.toLowerCase();
    for (let i = 0; i < KGB_BULAN_INDO_.length; i++) {
      if (lower.indexOf(KGB_BULAN_INDO_[i].toLowerCase()) !== -1) {
        bulan = KGB_BULAN_ROMAWI_[i];
        break;
      }
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(tglRef)) {
      const mIdx = parseInt(tglRef.split('-')[1], 10) - 1;
      if (mIdx >= 0 && mIdx <= 11) bulan = KGB_BULAN_ROMAWI_[mIdx];
    }
  }

  let nokgb = String(p.nokgb || '').trim();
  if (p.bulan_surat || p.bulan) bulan = String(p.bulan_surat || p.bulan).trim();
  if (p.tahun_surat || p.tahun) tahun = String(p.tahun_surat || p.tahun).trim();

  const full = String(p.nomor_surat || '').trim();
  if (full && full.indexOf('/') !== -1) {
    const segs = full.split('/');
    if (!nokgb && segs[0] && segs[0] !== '...') nokgb = segs[0].trim();
    if (segs.length >= 5) {
      if (!p.bulan_surat && segs[3]) bulan = segs[3].trim();
      if (!p.tahun_surat && segs[4]) tahun = segs[4].trim();
    }
  }

  if (!nokgb) nokgb = '......';
  const assembled = nokgb + '/KPA.W10-A2/KP2.1.2/' + bulan + '/' + tahun;
  return {
    nokgb: nokgb,
    bulan: bulan,
    tahun: tahun,
    full: (full && full.indexOf('KPA.W10-A2') === -1 && full !== '...') ? full : assembled
  };
}

/**
 * Helper: Ekstrak komponen Masa Kerja { tahun, bulan, full }
 */
function parseMasaKerjaKgbBackend_(tahunExp, bulanExp, combinedStr) {
  const thn = (tahunExp !== undefined && tahunExp !== null && String(tahunExp).trim() !== '') ? String(tahunExp).trim() : '';
  const bln = (bulanExp !== undefined && bulanExp !== null && String(bulanExp).trim() !== '') ? String(bulanExp).trim() : '';
  if (thn !== '') {
    const bFinal = bln !== '' ? bln : '0';
    return { tahun: thn, bulan: bFinal, full: thn + ' Tahun ' + bFinal + ' Bulan' };
  }

  const raw = String(combinedStr || '').trim();
  if (!raw) return { tahun: '0', bulan: '0', full: '0 Tahun 0 Bulan' };

  const mThn = raw.match(/(\d+)\s*(?:tahun|thn|th)/i);
  const mBln = raw.match(/(\d+)\s*(?:bulan|bln|bl)/i);
  if (mThn || mBln) {
    const t = mThn ? mThn[1] : '0';
    const b = mBln ? mBln[1] : '0';
    return { tahun: t, bulan: b, full: t + ' Tahun ' + b + ' Bulan' };
  }

  const nums = raw.match(/\d+/g);
  if (nums && nums.length > 0) {
    const t = nums[0];
    const b = nums.length > 1 ? nums[1] : '0';
    return { tahun: t, bulan: b, full: t + ' Tahun ' + b + ' Bulan' };
  }
  return { tahun: raw, bulan: '0', full: raw };
}

/**
 * Helper: Escape karakter regex RE2 untuk DocumentApp.replaceText
 */
function escapeDocRegex_(literalStr) {
  return String(literalStr).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generator Penomoran ID KGB Sekuensial (Incremental Unique ID Anti-Collision)
 */
function generateSeqKgbId_(ss) {
  const sheet = ss.getSheetByName('EofficeKGB');
  const now = new Date();
  const yyyymm = Utilities.formatDate(now, 'Asia/Jakarta', 'yyyyMM');
  const prefix = 'KGB-' + yyyymm + '-';

  if (!sheet || sheet.getLastRow() <= 1) {
    return prefix + '001';
  }

  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  let maxNum = 0;
  for (let i = 0; i < ids.length; i++) {
    const val = String(ids[i][0] || '');
    if (val.startsWith(prefix)) {
      const numPart = parseInt(val.replace(prefix, ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  }

  const nextSeq = String(maxNum + 1).padStart(3, '0');
  return prefix + nextSeq;
}

/**
 * Fungsi Utama: Menyimpan Draf, Kirim TTE, atau Menerbitkan Dokumen Google Docs SK KGB
 */
function saveOrGenerateKgbDoc(payload, actionType, adminNip, clientToken) {
  try {
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Pembuatan atau penerbitan KGB hanya dapat dilakukan oleh Admin.' };
    }

    const todayStrClean = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMddHHmmss');
    let idKgb = String(payload.id_kgb || '');
    if (!idKgb || idKgb.startsWith('DRAFT-')) {
      idKgb = 'KGB-' + String(payload.nip || '').trim() + '-' + todayStrClean;
    }

    const todayStr = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
    let docUrl = String(payload.file_doc_url || '');
    let pdfUrl = String(payload.file_pdf_url || '');
    let statusProses = 'Sedang Diproses';
    if (actionType === 'generate') statusProses = 'Selesai';
    else if (actionType === 'tte' || payload.status === 'Menunggu TTE Pimpinan') statusProses = 'Menunggu TTE Pimpinan';
    else if (payload.status === 'Selesai') statusProses = 'Selesai';

    // Normalisasi Nomor Surat & Masa Kerja
    const noParsed = parseNomorKgbBackend_(payload);
    const mkgLamaParsed = parseMasaKerjaKgbBackend_(payload.tahun_lama, payload.bulan_lama, payload.mkg_lama);
    const mkgBaruParsed = parseMasaKerjaKgbBackend_(payload.tahun_baru, payload.bulan_baru, payload.mkg_baru);

    // 2. JIKA ACTION ADALAH GENERATE: BUAT GOOGLE DOCS RESMI KE FOLDER DRIVE TARGET
    if (actionType === 'generate') {
      const docResult = createKgbGoogleDoc_(payload, idKgb);
      docUrl = docResult.docUrl;
      pdfUrl = docResult.pdfUrl;
    }

    // TAHAP 84: Pemutusan penulisan baris ke sheet EofficeKGB & pembaruan sheet user_data.
    // Seluruh data KGB & status pegawai dikelola 100% murni di Cloud Firestore (eoffice_kgb & users).
    return {
      status: 'success',
      message: (actionType === 'generate') ? 'SK KGB berhasil diterbitkan ke Folder Google Drive!' : 'Data KGB berhasil disimpan.',
      id_kgb: idKgb,
      url: docUrl,
      pdf_url: pdfUrl,
      data: {
        id_kgb: idKgb,
        doc_url: docUrl,
        pdf_url: pdfUrl,
        status: statusProses
      }
    };

  } catch (err) {
    Logger.log("ERROR saveOrGenerateKgbDoc: " + err.toString());
    return { status: 'error', message: err.toString() };
  }
}

/**
 * Menghapus baris KGB di Google Sheets (cold backup sync) & opsional reset Status_KGB pegawai
 */
function deleteKgbDocRecord(idKgb, nipPegawai, resetUserStatus, adminNip, clientToken) {
  try {
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Hanya Admin yang dapat menghapus berkas KGB.' };
    }
    // TAHAP 84: Penghapusan berkas KGB diproses murni di Cloud Firestore (eoffice_kgb).
    return { status: 'success', message: 'Berkas KGB berhasil diproses di Cloud Firestore.' };
  } catch (err) {
    Logger.log("ERROR deleteKgbDocRecord: " + err.toString());
    return { status: 'error', message: err.toString() };
  }
}

/**
 * Helper: Pembuatan Dokumen Google Docs SK KGB Sesuai Master Template PA Indramayu
 * Template ID: 1guFYYKbZ1ylW3i7zjgvFZv1fdbB88XWKJwmaJCKeefg
 * Folder ID  : 1IwQ96D4dY6HrPCqoXY2opX8FHWaMjAHQ
 */
function createKgbGoogleDoc_(p, idKgb) {
  const props = PropertiesService.getScriptProperties();
  const templateId = props.getProperty("TEMPLATE_KGB_DOC_ID") || DEFAULT_KGB_TEMPLATE_ID;
  const folderId = props.getProperty("FOLDER_KGB_DRIVE_ID") || DEFAULT_KGB_FOLDER_ID;
  const safeName = String(p.nama_pegawai || "Pegawai").replace(/[^a-zA-Z0-9]/g, "_");
  const fileName = "SK_KGB_" + safeName + "_" + idKgb;

  let targetFolder = null;
  if (folderId) {
    try {
      targetFolder = DriveApp.getFolderById(folderId);
    } catch (fErr) {
      Logger.log("Warning Folder KGB ID (" + folderId + ") tidak dapat diakses: " + fErr.toString());
    }
  }

  const noInfo = parseNomorKgbBackend_(p);
  const mkgLama = parseMasaKerjaKgbBackend_(p.tahun_lama, p.bulan_lama, p.mkg_lama);
  const mkgBaru = parseMasaKerjaKgbBackend_(p.tahun_baru, p.bulan_baru, p.mkg_baru);
  const tglSurat = formatTglIndoKgb_(p.tanggal_surat || new Date());
  const tglLahir = formatTglIndoKgb_(p.tanggal_lahir);
  const tglSkLama = formatTglIndoKgb_(p.tanggal_sk_lama);
  const tmtLama = formatTglIndoKgb_(p.tmt_lama);
  const tmtBaru = formatTglIndoKgb_(p.tmt_baru);
  const tmtYad = formatTglIndoKgb_(p.tmt_yad);
  const gajiLama = formatRibuanGajiKgb_(p.gaji_lama);
  const gajiBaru = formatRibuanGajiKgb_(p.gaji_baru);
  const hurufGaji = String(p.terbilang_gaji || p.huruf_gaji || '-');
  const namaPegawai = String(p.nama_pegawai || '-');
  const namaTtd = String(p.nama_ketua || p.nama_ttd || '-');

  let doc = null;
  let file = null;

  // METODE A: Menggunakan Master Template Google Docs (1guFYYKbZ1ylW3i7zjgvFZv1fdbB88XWKJwmaJCKeefg)
  if (templateId) {
    try {
      const templateFile = DriveApp.getFileById(templateId);
      file = targetFolder
        ? templateFile.makeCopy(fileName, targetFolder)
        : templateFile.makeCopy(fileName);
      doc = DocumentApp.openById(file.getId());

      const replacements = {
        '{{nokgb}}': noInfo.nokgb,
        '{{bulan}}': noInfo.bulan,
        '{{tahun}}': noInfo.tahun,
        '{{nomor_surat}}': noInfo.full,
        '{{tanggal}}': tglSurat,
        '{{tanggal_surat}}': tglSurat,
        '{{tujuan_kppn}}': String(p.tujuan_kppn || 'Kepala KPPN Cirebon di- CIREBON'),
        '{{nama}}': namaPegawai,
        '{{nama_gelar}}': namaPegawai,
        '{{tanggl lahir}}': tglLahir,
        '{{tanggal lahir}}': tglLahir,
        '{{tanggal_lahir}}': tglLahir,
        '{{NIP}}': String(p.nip || '-'),
        '{{nip}}': String(p.nip || '-'),
        '{{pangkat}}': String(p.pangkat || '-'),
        '{{jabatan}}': String(p.jabatan || '-'),
        '{{unit_kerja}}': String(p.unit_kerja || 'Pengadilan Agama Indramayu Kelas 1.A.'),
        '{{gaji_lama}}': gajiLama,
        '{{pejabat_lama}}': String(p.pejabat_lama || 'Ketua Pengadilan Agama Indramayu'),
        '{{tanggal_sk_lama}}': tglSkLama,
        '{{nomor_sk_lama}}': String(p.nomor_sk_lama || '-'),
        '{{tmt_gaji_lama}}': tmtLama,
        '{{tmt_lama}}': tmtLama,
        '{{tahun_lama}}': mkgLama.tahun,
        '{{bulan_lama}}': mkgLama.bulan,
        '{{mkg_lama}}': mkgLama.full,
        '{{gaji_baru}}': gajiBaru,
        '{{hurif_gaji}}': hurufGaji,
        '{{huruf_gaji}}': hurufGaji,
        '{{terbilang_gaji}}': hurufGaji,
        '{{tahun_baru}}': mkgBaru.tahun,
        '{{bulan_baru}}': mkgBaru.bulan,
        '{{mkg_baru}}': mkgBaru.full,
        '{{golongan}}': String(p.golongan || '-'),
        '{{tmt_mulai}}': tmtBaru,
        '{{tmt_baru}}': tmtBaru,
        '{{tmt_datang}}': tmtYad,
        '{{tmt_yad}}': tmtYad,
        '{{dasar_pp}}': String(p.dasar_pp || 'Peraturan Pemerintah Republik Indonesia Nomor : 05 Tahun 2024'),
        '{{nama_ttd}}': namaTtd,
        '{{nama_ketua}}': namaTtd
      };

      const sections = [doc.getBody(), doc.getHeader(), doc.getFooter()];
      sections.forEach(function(sec) {
        if (!sec) return;
        for (const key in replacements) {
          if (Object.prototype.hasOwnProperty.call(replacements, key)) {
            sec.replaceText(escapeDocRegex_(key), replacements[key]);
          }
        }
      });

      doc.saveAndClose();
    } catch (e) {
      Logger.log("Template ID error, fallback ke Generator Otomatis: " + e.toString());
      doc = null;
    }
  }

  // METODE B: Self-Healing Automatic Generator (Fallback jika template tidak ditemukan)
  if (!doc) {
    doc = DocumentApp.create(fileName);
    file = DriveApp.getFileById(doc.getId());
    if (targetFolder) {
      try { file.moveTo(targetFolder); } catch (mvErr) {}
    }
    const body = doc.getBody();
    body.setMarginLeft(56.7);
    body.setMarginRight(45.3);
    body.setMarginTop(36.0);
    body.setMarginBottom(36.0);

    const pKop1 = body.appendParagraph("MAHKAMAH AGUNG REPUBLIK INDONESIA\nDIREKTORAT JENDERAL BADAN PERADILAN AGAMA\nPENGADILAN TINGGI AGAMA BANDUNG\nPENGADILAN AGAMA INDRAMAYU");
    pKop1.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pKop1.setFontFamily("Bookman Old Style");
    pKop1.setFontSize(12);
    pKop1.setBold(true);

    const pKop2 = body.appendParagraph("Jalan M.T. Haryono No.2A Kel. Sindang Kec.Sindang Kab. Indramayu Kode Pos 45222\nTelepon (0234) 273880 | Situs : www.pa-indramayu.go.id | e-mail : pa.indramayu_ptabdg@yahoo.co.id");
    pKop2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pKop2.setFontSize(8);
    pKop2.setBold(false);

    body.appendHorizontalRule();

    const pTgl = body.appendParagraph(tglSurat);
    pTgl.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
    pTgl.setFontSize(10);

    const pNomor = body.appendParagraph(
      "Nomor    : " + noInfo.full + "\n" +
      "Lampiran : -\n" +
      "Perihal  : Pemberitahuan Tentang Kenaikan Gaji\n" +
      "           Berkala a.n. Sdr. " + namaPegawai
    );
    pNomor.setFontSize(10);

    const pKepada = body.appendParagraph("\nKepada\nYth. Kepala Kantor Pelayanan Perbendaharaan\nNegara Cirebon\ndi-\n      C I R E B O N");
    pKepada.setFontSize(10);

    const pIsi1 = body.appendParagraph("\n        Dengan ini kami beritahukan, bahwa berhubung dengan telah terpenuhinya masa kerja dan syarat- syarat lainnya atas:");
    pIsi1.setFontSize(10);

    const pPoints1 = body.appendParagraph(
      "1. Nama/Tanggal lahir   : " + namaPegawai + "/" + tglLahir + "\n" +
      "2. NIP                  : " + (p.nip || "-") + "\n" +
      "3. Pangkat/Jabatan      : " + (p.pangkat || "-") + "/" + (p.jabatan || "-") + "\n" +
      "4. Unit Kerja           : " + (p.unit_kerja || "Pengadilan Agama Indramayu Kelas 1.A.") + "\n" +
      "5. Gaji Pokok Lama      : Rp " + gajiLama + ",-\n" +
      "   (atas dasar Skp. terakhir tentang gaji/pangkat yang di tetapkan)\n" +
      "   a. Oleh pejabat        : " + (p.pejabat_lama || "Ketua Pengadilan Agama Indramayu") + "\n" +
      "      Tanggal dan nomor   : " + tglSkLama + "\n" +
      "                            " + (p.nomor_sk_lama || "-") + "\n" +
      "   b. Tanggal mulai gaji  : " + tmtLama + "\n" +
      "   c. Masa kerja golongan : " + mkgLama.tahun + " Tahun " + mkgLama.bulan + " bulan"
    );
    pPoints1.setFontSize(10);

    const pDiberikan = body.appendParagraph("\nDIBERIKAN KENAIKAN GAJI BERKALA HINGGA MEMPEROLEH :");
    pDiberikan.setFontSize(10);

    const pPoints2 = body.appendParagraph(
      "6. Gaji pokok baru      : Rp. " + gajiBaru + ",- (" + hurufGaji + ")\n" +
      "7. Masa kerja           : " + mkgBaru.tahun + " Tahun\n" +
      "8. Golongan/Ruang       : " + (p.golongan || "-") + "\n" +
      "9. Mulai tanggal        : " + tmtBaru + "\n" +
      "10. Kenaikan gaji Yad.  : " + tmtYad
    );
    pPoints2.setFontSize(10);

    const pPenutup = body.appendParagraph(
      "\nKami harap sesuai dengan " + (p.dasar_pp || "Peraturan Pemerintah Republik Indonesia Nomor : 05 Tahun 2024") + ", kepada Pegawai tersebut agar dibayarkan penghasilannya berdasarkan gaji pokoknya yang baru."
    );
    pPenutup.setFontSize(10);

    const pTtd = body.appendParagraph(
      "\n                                                                                                   Ketua,\n\n\n\n" +
      "                                                                                                   " + namaTtd
    );
    pTtd.setFontSize(10);

    const pTembusan = body.appendParagraph(
      "\nTembusan :\n" +
      "1. Ketua Pengadilan Tinggi Agama Bandung di Bandung;\n" +
      "2. Kepala Kantor Cabang PT. TASPEN di Cirebon;\n" +
      "3. Sdr. " + namaPegawai + " di Indramayu."
    );
    pTembusan.setFontSize(9);

    doc.saveAndClose();
  }

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}

  const docUrl = file.getUrl();
  const pdfBlob = file.getAs('application/pdf');
  const pdfFile = targetFolder
    ? targetFolder.createFile(pdfBlob).setName(fileName + ".pdf")
    : DriveApp.createFile(pdfBlob).setName(fileName + ".pdf");
  try {
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}

  return {
    docUrl: docUrl,
    pdfUrl: pdfFile.getUrl()
  };
}
