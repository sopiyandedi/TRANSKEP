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
 * Helper: Hapus seluruh gelar akademik & keagamaan untuk nama Ketua (Item 7)
 */
function stripGelarKgb_(nama) {
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
  const tempatLahir = String(p.tempat_lahir || '').trim();
  const tempatTanggalLahir = tempatLahir ? (tempatLahir + ', ' + tglLahir) : tglLahir;
  const golonganBaru = String(p.golongan_baru || p.golongan || '-');
  const golonganLama = String(p.golongan_lama || p.golongan || '-');
  const tglSkLama = formatTglIndoKgb_(p.tanggal_sk_lama);
  const tmtLama = formatTglIndoKgb_(p.tmt_lama);
  const tmtBaru = formatTglIndoKgb_(p.tmt_baru);
  const tmtYad = formatTglIndoKgb_(p.tmt_yad);
  const gajiLama = formatRibuanGajiKgb_(p.gaji_lama);
  const gajiBaru = formatRibuanGajiKgb_(p.gaji_baru);
  const hurufGaji = String(p.terbilang_gaji || p.huruf_gaji || '-');
  const namaPegawai = String(p.nama_pegawai || '-');
  const namaTtd = stripGelarKgb_(p.nama_ketua || p.nama_ttd || '-'); // ITEM 7: Nama Ketua tanpa gelar (Zulkifli)

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
        '{{tempat_lahir}}': tempatLahir,
        '{{tempat_tanggal_lahir}}': tempatTanggalLahir,
        '{{tanggl lahir}}': tempatTanggalLahir,
        '{{tanggal lahir}}': tempatTanggalLahir,
        '{{tanggal_lahir}}': tempatTanggalLahir,
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
        '{{golongan_lama}}': golonganLama,
        '{{golongan_baru}}': golonganBaru,
        '{{golongan}}': golonganBaru,
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

      // Kunci Ukuran Halaman Legal (21.6 cm x 35.6 cm) & Margin Resmi: Atas 1cm, Bawah 1.5cm, Kiri 2cm, Kanan 1.5cm
      const docBody = doc.getBody();
      if (docBody) {
        docBody.setPageWidth(612); // 21.6 cm (8.5 in)
        docBody.setPageHeight(1008); // 35.6 cm (14.0 in)
        docBody.setMarginTop(28.35); // 1.0 cm
        docBody.setMarginBottom(42.52); // 1.5 cm
        docBody.setMarginLeft(56.69); // 2.0 cm
        docBody.setMarginRight(42.52); // 1.5 cm
      }

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
    body.setPageWidth(612); // 21.6 cm (8.5 in)
    body.setPageHeight(1008); // 35.6 cm (14.0 in)
    body.setMarginTop(28.35); // 1.0 cm
    body.setMarginBottom(42.52); // 1.5 cm
    body.setMarginLeft(56.69); // 2.0 cm
    body.setMarginRight(42.52); // 1.5 cm

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
      "1. Nama/Tempat, Tanggal lahir : " + namaPegawai + "/" + tempatTanggalLahir + "\n" +
      "2. NIP                        : " + (p.nip || "-") + "\n" +
      "3. Pangkat/Jabatan            : " + (p.pangkat || "-") + "/" + (p.jabatan || "-") + "\n" +
      "4. Unit Kerja                 : " + (p.unit_kerja || "Pengadilan Agama Indramayu Kelas 1.A.") + "\n" +
      "5. Gaji Pokok Lama            : Rp " + gajiLama + ",-\n" +
      "   (atas dasar Skp. terakhir tentang gaji/pangkat yang di tetapkan)\n" +
      "   a. Oleh pejabat              : " + (p.pejabat_lama || "Ketua Pengadilan Agama Indramayu") + "\n" +
      "      Tanggal dan nomor         : " + tglSkLama + "\n" +
      "                                  " + (p.nomor_sk_lama || "-") + "\n" +
      "   b. Tanggal mulai gaji        : " + tmtLama + "\n" +
      "   c. Masa kerja golongan       : " + mkgLama.tahun + " Tahun " + mkgLama.bulan + " bulan"
    );
    pPoints1.setFontSize(10);

    const pDiberikan = body.appendParagraph("\nDIBERIKAN KENAIKAN GAJI BERKALA HINGGA MEMPEROLEH :");
    pDiberikan.setFontSize(10);

    const pPoints2 = body.appendParagraph(
      "6. Gaji pokok baru            : Rp. " + gajiBaru + ",- (" + hurufGaji + ")\n" +
      "7. Masa kerja                 : " + mkgBaru.tahun + " Tahun\n" +
      "8. Golongan/Ruang             : " + golonganBaru + "\n" +
      "9. Mulai tanggal              : " + tmtBaru + "\n" +
      "10. Kenaikan gaji Yad.        : " + tmtYad
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

  if (typeof setPrivateDriveSharing_ === 'function') setPrivateDriveSharing_(file);

  const docUrl = file.getUrl();
  const pdfBlob = file.getAs('application/pdf');
  const pdfFile = targetFolder
    ? targetFolder.createFile(pdfBlob).setName(fileName + ".pdf")
    : DriveApp.createFile(pdfBlob).setName(fileName + ".pdf");
  if (typeof setPrivateDriveSharing_ === 'function') setPrivateDriveSharing_(pdfFile);

  return {
    docUrl: docUrl,
    pdfUrl: pdfFile.getUrl()
  };
}

// =========================================================================
// INTEGRASI SURAT KELUAR MYSIMS KGB VIA N8N (1 NOMOR KETUA PA - KPA.W10-A2)
// =========================================================================

/**
 * Helper: Konversi tanggal Indonesia/ISO/slash ke YYYY-MM-DD untuk form date MYSIMS
 */
function resolveIsoDateForMysimsKgb_(rawVal) {
  const todayIso = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
  if (!rawVal) return todayIso;
  const s = String(rawVal).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

  const blnMap = {
    'januari': '01', 'jan': '01', 'februari': '02', 'feb': '02', 'maret': '03', 'mar': '03',
    'april': '04', 'apr': '04', 'mei': '05', 'may': '05', 'juni': '06', 'jun': '06',
    'juli': '07', 'jul': '07', 'agustus': '08', 'agu': '08', 'agt': '08',
    'september': '09', 'sep': '09', 'oktober': '10', 'okt': '10', 'oct': '10',
    'november': '11', 'nov': '11', 'desember': '12', 'des': '12', 'dec': '12'
  };
  const m = s.match(/(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})/);
  if (m) {
    const mon = blnMap[m[2].toLowerCase()] || '01';
    return m[3] + '-' + mon + '-' + ('0' + m[1]).slice(-2);
  }
  const sl = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (sl) {
    return sl[3] + '-' + ('0' + sl[2]).slice(-2) + '-' + ('0' + sl[1]).slice(-2);
  }
  return todayIso;
}

function hasAssignedKgbNumber_(rec) {
  if (!rec) return false;
  const no = String(rec.nokgb || '').trim();
  const full = String(rec.nomor_surat || '').trim();
  if (no && no !== '...' && no !== '......' && no !== '-') return true;
  if (full && /^\d+\//.test(full)) return true;
  return false;
}

/**
 * RPC Admin Terotorisasi: Meminta Nomor Surat Keluar Ketua MYSIMS (sekali saja saat simpan pertama)
 */
function requestKgbSuratKeluar(payload, adminNip, clientToken) {
  let lock = null;
  try {
    if (Array.isArray(payload)) {
      adminNip = adminNip || payload[1];
      clientToken = clientToken || payload[2];
      payload = payload[0] || {};
    }
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Permintaan nomor surat keluar KGB hanya untuk Admin/Operator.' };
    }
    if (!payload || !payload.id_kgb || !payload.nip) {
      return { status: 'error', message: "Parameter 'id_kgb' dan 'nip' wajib disertakan." };
    }

    const idKgb = String(payload.id_kgb).trim();
    if (hasAssignedKgbNumber_(payload) || payload.mysims_requested === true) {
      return {
        status: 'already_exists',
        message: 'Berkas KGB ini sudah memiliki atau sedang memproses nomor surat MYSIMS.',
        id_kgb: idKgb,
        nokgb: payload.nokgb || '',
        nomor_surat: payload.nomor_surat || ''
      };
    }

    try {
      lock = LockService.getScriptLock();
      lock.waitLock(5000);
    } catch (eLock) {}

    const cache = CacheService.getScriptCache();
    const guardKey = 'kgb_sk_req_' + idKgb;
    if (cache.get(guardKey)) {
      return {
        status: 'already_exists',
        message: 'Permintaan nomor surat keluar KGB sedang diproses. Edit ke-2 tidak meminta nomor ulang.',
        id_kgb: idKgb
      };
    }

    // Cek langsung ke Cloud Firestore jika tersedia untuk memastikan edit ke-2 tidak meminta nomor ulang
    if (typeof firestoreRestGet_ === 'function') {
      const existingFs = firestoreRestGet_('eoffice_kgb', idKgb);
      if (existingFs && hasAssignedKgbNumber_(existingFs)) {
        return {
          status: 'already_exists',
          message: 'Nomor surat keluar KGB sudah tercatat di Firestore.',
          id_kgb: idKgb,
          nokgb: existingFs.nokgb || '',
          nomor_surat: existingFs.nomor_surat || ''
        };
      }
    }

    // Simpan snapshot sementara & kunci anti-double trigger (600 detik, aman sesuai limit CacheService)
    cache.put(guardKey, '1', 600);
    try {
      cache.put('kgb_snap_' + idKgb, JSON.stringify(payload), 1800);
    } catch (eSnap) {}

    const sendRes = triggerN8nSuratKeluarKgb_(idKgb, payload);
    if (!sendRes.ok) {
      cache.remove(guardKey);
      if (typeof firestoreRestPatch_ === 'function') {
        firestoreRestPatch_('eoffice_kgb', idKgb, {
          mysims_requested: false,
          mysims_status: 'Gagal Menghubungi MYSIMS'
        });
      }
      return { status: 'error', message: sendRes.message || 'Gagal menghubungi webhook n8n MYSIMS.' };
    }

    return {
      status: 'success',
      message: 'Permintaan nomor surat keluar Ketua (KPA.W10-A2/KP2.1.2) berhasil dikirim ke MYSIMS.',
      id_kgb: idKgb
    };
  } catch (err) {
    Logger.log('⚠️ [requestKgbSuratKeluar Error] ' + err.toString());
    return { status: 'error', message: err.toString() };
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (eRel) {}
    }
  }
}

/**
 * Mengirim Event KGB_SURAT_KELUAR ke n8n (Selalu 1 Nomor Ketua PA Indramayu)
 */
function triggerN8nSuratKeluarKgb_(idKgb, payload) {
  try {
    const props = PropertiesService.getScriptProperties();
    const webhookUrl = props.getProperty('N8N_WEBHOOK_SURAT_KELUAR') ||
      'https://supernova-endpoint-unsubtly.ngrok-free.dev/webhook/generate-surat-keluar';
    const verifiedExecUrl = props.getProperty('TRANSKEP_EXEC_URL') ||
      'https://script.google.com/macros/s/AKfycbzFrbQTqmVzMio7mderK-S9ntFVjXiWYFgnXfy9fW_SUKOcIxfPywP2He1flhaK_AZ0ZA/exec';

    const namaPegawai = String(payload.nama_pegawai || payload.nama || 'Pegawai').trim();
    const tglSuratIso = resolveIsoDateForMysimsKgb_(payload.tanggal_surat);

    const payloadN8n = {
      event: 'KGB_SURAT_KELUAR',
      id_kgb: String(idKgb),
      nip: String(payload.nip || '').trim(),
      nama_pegawai: namaPegawai,
      tanggal_surat: tglSuratIso,
      callback_url: verifiedExecUrl,
      secret_key: props.getProperty('TRANSKEP_WEBHOOK_KEY') || 'TRANSKEP_WA_BOT_2026',
      kgb_snapshot: payload,
      task: {
        tipe: 'KGB',
        jabatan_penandatangan: 'Ketua',
        kode_klasifikasi: 'KP2.1.2',
        kepada: 'Kepala KPPN Cirebon (a.n. ' + namaPegawai + ')',
        uraian: 'Pemberitahuan Kenaikan Gaji Berkala a.n. ' + namaPegawai,
        ket: 'KGB ' + namaPegawai,
        tgl_surat: tglSuratIso
      },
      timestamp: new Date().toISOString()
    };

    const resp = UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payloadN8n),
      muteHttpExceptions: true
    });
    const code = Number(resp.getResponseCode() || 0);
    Logger.log('✅ [n8n KGB Trigger] Webhook KGB_SURAT_KELUAR terkirim (' + idKgb + '). Code: ' + code);
    if (code >= 200 && code < 400) {
      return { ok: true, code: code };
    }
    return { ok: false, code: code, message: 'Webhook n8n merespon HTTP ' + code };
  } catch (err) {
    Logger.log('⚠️ [triggerN8nSuratKeluarKgb_ Error] ' + err.toString());
    return { ok: false, code: 0, message: err.toString() };
  }
}

/**
 * Callback Resmi dari n8n:
 * 1. Verifikasi constant-time TRANSKEP_WEBHOOK_KEY
 * 2. Update nokgb & nomor_surat MYSIMS ke Cloud Firestore eoffice_kgb (via OAuth2 Bearer)
 * 3. Kompilasi PDF KGB bernomor resmi via kgb_pdf_compiler.js -> kembalikan ke n8n untuk upload ke MYSIMS
 */
function updateNomorSuratKgbFromExternal_(payload) {
  try {
    const idKgb = payload ? String(payload.id_kgb || payload.id || '').trim() : '';
    const nomorRaw = payload ? String(payload.nomor_surat || payload.no_surat || '').trim() : '';
    if (!payload || !idKgb || !nomorRaw) {
      return { status: 'error', message: "Parameter 'id_kgb' dan 'nomor_surat' wajib disertakan." };
    }

    const scriptProps = PropertiesService.getScriptProperties();
    const configuredKey = String(scriptProps.getProperty('TRANSKEP_WEBHOOK_KEY') || 'TRANSKEP_WA_BOT_2026').trim();
    const incomingKey = String(payload.secret_key || '').trim();
    const isKeyMatch = (typeof constantTimeEquals_ === 'function')
      ? constantTimeEquals_(incomingKey, configuredKey)
      : (incomingKey !== '' && incomingKey === configuredKey);
    if (!incomingKey || !isKeyMatch) {
      return { status: 'error', message: 'Akses ditolak: Secret Key tidak valid.' };
    }

    if (nomorRaw.indexOf('NOMOR_MYSIMS_TERCATAT') !== -1 || nomorRaw.indexOf('...') !== -1) {
      return { status: 'error', message: 'Nomor surat KGB tidak valid.' };
    }

    const segs = nomorRaw.split('/');
    const nokgb = String(segs[0] || '').trim();
    const bulanSurat = (segs.length >= 5 && segs[3]) ? String(segs[3]).trim() : '';
    const tahunSurat = (segs.length >= 5 && segs[4]) ? String(segs[4]).trim() : '';

    // Susun data KGB terlengkap: Cache Snapshot + Payload Snapshot + Cloud Firestore
    let snapCached = {};
    try {
      const rawSnap = CacheService.getScriptCache().get('kgb_snap_' + idKgb);
      if (rawSnap) snapCached = JSON.parse(rawSnap);
    } catch (eSnap) {}

    let snapPayload = {};
    if (payload.kgb_snapshot) {
      try {
        snapPayload = (typeof payload.kgb_snapshot === 'string')
          ? JSON.parse(payload.kgb_snapshot)
          : payload.kgb_snapshot;
      } catch (ePs) {}
    }

    let fsRecord = null;
    if (typeof firestoreRestGet_ === 'function') {
      fsRecord = firestoreRestGet_('eoffice_kgb', idKgb);
    }

    const mergedRecord = Object.assign({}, snapCached, snapPayload, fsRecord || {}, {
      id: idKgb,
      id_kgb: idKgb,
      nokgb: nokgb,
      nomor_surat: nomorRaw
    });
    if (bulanSurat) mergedRecord.bulan_surat = bulanSurat;
    if (tahunSurat) mergedRecord.tahun_surat = tahunSurat;

    // Sinkronkan nomor MYSIMS balik ke Cloud Firestore agar UI E-Office Browser langsung update (<1s)
    let firestoreSynced = false;
    if (typeof firestoreRestPatch_ === 'function') {
      const patchFields = {
        nokgb: nokgb,
        nomor_surat: nomorRaw,
        mysims_requested: true,
        mysims_status: 'Nomor Terbit MYSIMS',
        mysims_idp: String(payload.idp || ''),
        updated_at: { __timestamp: true }
      };
      if (bulanSurat) patchFields.bulan_surat = bulanSurat;
      if (tahunSurat) patchFields.tahun_surat = tahunSurat;
      const patchRes = firestoreRestPatch_('eoffice_kgb', idKgb, patchFields);
      firestoreSynced = Boolean(patchRes && patchRes.ok);
    }

    // Kompilasi PDF KGB resmi bernomor surat keluar Ketua untuk disuntikkan balik ke MYSIMS
    let pdfKgb = { pdf_base64: '', pdf_filename: 'sk_kgb.pdf' };
    if (typeof generateKgbPdfBase64_ === 'function') {
      pdfKgb = generateKgbPdfBase64_(mergedRecord, nomorRaw);
    }

    Logger.log('✅ [n8n KGB Callback] ID ' + idKgb + ' -> ' + nomorRaw + ' (Firestore=' + firestoreSynced + ', PDF=' + (pdfKgb.pdf_base64 ? 'OK' : 'NO') + ')');
    return {
      status: 'success',
      message: 'Nomor surat keluar KGB berhasil diperbarui & PDF siap diunggah ke MYSIMS.',
      id_kgb: idKgb,
      nokgb: nokgb,
      nomor_surat: nomorRaw,
      firestore_synced: firestoreSynced,
      pdf_kgb: pdfKgb
    };
  } catch (err) {
    Logger.log('❌ [updateNomorSuratKgbFromExternal_ Error] ' + err.toString());
    return { status: 'error', message: err.toString() };
  }
}
