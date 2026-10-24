// ==========================================
// FILE: eoffice/kgb.js
// DESKRIPSI: Backend Service Penyusunan SK KGB & Google Docs Generator
// FORMAT: Pengadilan Agama Indramayu Kelas 1.A. ke KPPN Cirebon
// ENGINE: TRANSKEP Core v1.0.0 
// ==========================================

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
 * Fungsi Utama: Menyimpan Draf atau Menerbitkan Dokumen Google Docs SK KGB
 */
function saveOrGenerateKgbDoc(payload, actionType, adminNip, clientToken) {
  try {
    // 1. Validasi Keamanan Hak Akses
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Pembuatan atau penerbitan KGB hanya dapat dilakukan oleh Admin.' };
    }

    const ss = getDB();
    if (!ss) throw new Error("Koneksi database spreadsheet gagal.");

    initEofficeDatabase_();
    const sheet = ss.getSheetByName('EofficeKGB');
    if (!sheet) throw new Error("Sheet EofficeKGB tidak ditemukan.");

    let idKgb = String(payload.id_kgb || '');
    if (!idKgb || idKgb.startsWith('DRAFT-')) {
      idKgb = generateSeqKgbId_(ss);
    }

    const todayStr = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
    let docUrl = '';
    let pdfUrl = '';
    const statusProses = (actionType === 'generate') ? 'Selesai' : 'Sedang Diproses';

    // 2. JIKA ACTION ADALAH GENERATE: BUAT GOOGLE DOCS RESMI
    if (actionType === 'generate') {
      const docResult = createKgbGoogleDoc_(payload, idKgb);
      docUrl = docResult.docUrl;
      pdfUrl = docResult.pdfUrl;
    }

    // 3. SUSUN ARRAY ROW UNTUK SHEET EofficeKGB
    const rowValues = [
      idKgb,
      todayStr,
      String(payload.nip || ''),
      String(payload.nama_pegawai || ''),
      String(payload.tanggal_lahir || ''),
      String(payload.pangkat || ''),
      String(payload.golongan || ''),
      String(payload.jabatan || ''),
      String(payload.unit_kerja || 'Pengadilan Agama Indramayu Kelas 1.A.'),
      String(payload.nomor_surat || ''),
      String(payload.tanggal_surat || ''),
      String(payload.tujuan_kppn || 'Kepala KPPN Cirebon di- CIREBON'),
      String(payload.gaji_lama || ''),
      String(payload.pejabat_lama || ''),
      String(payload.nomor_sk_lama || ''),
      String(payload.tanggal_sk_lama || ''),
      String(payload.tmt_lama || ''),
      String(payload.mkg_lama || ''),
      String(payload.gaji_baru || ''),
      String(payload.terbilang_gaji || ''),
      String(payload.mkg_baru || ''),
      String(payload.tmt_baru || ''),
      String(payload.tmt_yad || ''),
      String(payload.dasar_pp || 'Peraturan Pemerintah Republik Indonesia Nomor : 05 Tahun 2024'),
      String(payload.nama_ketua || ''),
      statusProses,
      docUrl,
      pdfUrl,
      String(adminNip || '')
    ];

    // Sanitasi Formula Injection
    const safeRow = sanitizeRowArray ? sanitizeRowArray(rowValues) : rowValues;

    // 4. SIMPAN ATAU UPDATE KE SHEET EofficeKGB
    let targetRowIndex = -1;
    if (sheet.getLastRow() > 1) {
      const existingIds = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      const existingNips = sheet.getRange(2, 3, sheet.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < existingIds.length; i++) {
        if (String(existingIds[i][0]) === idKgb || (String(existingNips[i][0]) === String(payload.nip) && String(sheet.getRange(i + 2, 26).getValue()) !== 'Selesai')) {
          targetRowIndex = i + 2;
          break;
        }
      }
    }

    if (targetRowIndex > 0) {
      sheet.getRange(targetRowIndex, 1, 1, safeRow.length).setValues([safeRow]);
    } else {
      sheet.appendRow(safeRow);
    }

    // 5. SINKRONISASI KE TABEL user_data (DASHBOARD INTEGRATION)
    const userSheet = ss.getSheetByName('user_data');
    if (userSheet && userSheet.getLastRow() > 1) {
      const uData = userSheet.getDataRange().getValues();
      const headers = uData[0];
      const nipCol = headers.indexOf('NIP');
      const statusKgbCol = headers.indexOf('Status_KGB');
      const tglSelesaiKgbCol = headers.indexOf('Tgl_Selesai_KGB');
      const tmtKgbCol = headers.indexOf('TMT_KGB');

      if (nipCol !== -1 && statusKgbCol !== -1) {
        for (let j = 1; j < uData.length; j++) {
          if (String(uData[j][nipCol]) === String(payload.nip)) {
            const userRowIdx = j + 1;
            if (actionType === 'generate') {
              userSheet.getRange(userRowIdx, statusKgbCol + 1).setValue('Selesai');
              if (tglSelesaiKgbCol !== -1) {
                userSheet.getRange(userRowIdx, tglSelesaiKgbCol + 1).setValue(todayStr);
              }
              // Jika ada TMT YAD, perbarui TMT_KGB agar jadwal 2 tahun ke depan terhitung otomatis
              if (payload.tmt_yad && tmtKgbCol !== -1) {
                userSheet.getRange(userRowIdx, tmtKgbCol + 1).setValue(payload.tmt_yad);
              }
            } else {
              userSheet.getRange(userRowIdx, statusKgbCol + 1).setValue('Proses');
            }
            break;
          }
        }
      }
    }

    SpreadsheetApp.flush();
    return {
      status: 'success',
      message: (actionType === 'generate') ? 'SK KGB berhasil diterbitkan!' : 'Draf KGB berhasil disimpan.',
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
 * Helper: Pembuatan Dokumen Google Docs SK KGB Sesuai Format PA Indramayu
 */
function createKgbGoogleDoc_(p, idKgb) {
  const props = PropertiesService.getScriptProperties();
  const templateId = props.getProperty("TEMPLATE_KGB_DOC_ID");
  const fileName = "SK_KGB_" + (p.nama_pegawai || "Pegawai").replace(/[^a-zA-Z0-9]/g, "_") + "_" + idKgb;

  let doc = null;
  let file = null;

  // METODE A: Menggunakan Master Template Jika Ada
  if (templateId) {
    try {
      const templateFile = DriveApp.getFileById(templateId);
      file = templateFile.makeCopy(fileName);
      doc = DocumentApp.openById(file.getId());
      const body = doc.getBody();

      // Replace Placeholders
      body.replaceText('{{nomor_surat}}', p.nomor_surat || '-');
      body.replaceText('{{tanggal_surat}}', p.tanggal_surat || '-');
      body.replaceText('{{tujuan_kppn}}', p.tujuan_kppn || 'Kepala KPPN Cirebon di- CIREBON');
      body.replaceText('{{nama_gelar}}', p.nama_pegawai || '-');
      body.replaceText('{{tanggal_lahir}}', p.tanggal_lahir || '-');
      body.replaceText('{{nip}}', p.nip || '-');
      body.replaceText('{{pangkat}}', p.pangkat || '-');
      body.replaceText('{{jabatan}}', p.jabatan || '-');
      body.replaceText('{{unit_kerja}}', p.unit_kerja || 'Pengadilan Agama Indramayu Kelas 1.A.');
      body.replaceText('{{gaji_lama}}', p.gaji_lama || '-');
      body.replaceText('{{pejabat_lama}}', p.pejabat_lama || '-');
      body.replaceText('{{nomor_sk_lama}}', p.nomor_sk_lama || '-');
      body.replaceText('{{tanggal_sk_lama}}', p.tanggal_sk_lama || '-');
      body.replaceText('{{tmt_lama}}', p.tmt_lama || '-');
      body.replaceText('{{mkg_lama}}', p.mkg_lama || '-');
      body.replaceText('{{gaji_baru}}', p.gaji_baru || '-');
      body.replaceText('{{terbilang_gaji}}', p.terbilang_gaji || '-');
      body.replaceText('{{mkg_baru}}', p.mkg_baru || '-');
      body.replaceText('{{golongan}}', p.golongan || '-');
      body.replaceText('{{tmt_baru}}', p.tmt_baru || '-');
      body.replaceText('{{tmt_yad}}', p.tmt_yad || '-');
      body.replaceText('{{dasar_pp}}', p.dasar_pp || 'Peraturan Pemerintah Republik Indonesia Nomor : 05 Tahun 2024');
      body.replaceText('{{nama_ketua}}', p.nama_ketua || '-');

      doc.saveAndClose();
    } catch (e) {
      Logger.log("Template ID error, fallback ke Generator Otomatis: " + e.toString());
      doc = null;
    }
  }

  // METODE B: Self-Healing Automatic Generator (Membangun Dokumen Lengkap dari Nol)
  if (!doc) {
    doc = DocumentApp.create(fileName);
    file = DriveApp.getFileById(doc.getId());
    const body = doc.getBody();

    // Set Margin Resmi (Kiri 2.5cm, Kanan 2cm, Atas 2cm, Bawah 2cm)
    body.setMarginLeft(70.87);
    body.setMarginRight(56.7);
    body.setMarginTop(56.7);
    body.setMarginBottom(56.7);

    // 1. KOP SURAT PENGADILAN AGAMA INDRAMAYU
    const pKop1 = body.appendParagraph("MAHKAMAH AGUNG REPUBLIK INDONESIA\nDIREKTORAT JENDERAL BADAN PERADILAN AGAMA\nPENGADILAN TINGGI AGAMA BANDUNG\nPENGADILAN AGAMA INDRAMAYU");
    pKop1.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pKop1.setFontFamily("Arial");
    pKop1.setFontSize(11);
    pKop1.setBold(true);

    const pKop2 = body.appendParagraph("Jalan M.T. Haryono No.2A Kel. Sindang Kec.Sindang Kab. Indramayu Kode Pos 45222\nTelepon (0234) 273880 | Situs : www.pa-indramayu.go.id | e-mail : pa.indramayu_ptabdg@yahoo.co.id");
    pKop2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pKop2.setFontFamily("Arial");
    pKop2.setFontSize(8);
    pKop2.setBold(false);

    // Garis Pemisah Kop
    body.appendHorizontalRule();

    // 2. NOMOR & TANGGAL SURAT
    const pTgl = body.appendParagraph(p.tanggal_surat || "Indramayu");
    pTgl.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
    pTgl.setFontSize(10);

    const pNomor = body.appendParagraph(
      "Nomor       : " + (p.nomor_surat || "-") + "\n" +
      "Lampiran : -\n" +
      "Perihal     : Pemberitahuan Tentang Kenaikan Gaji Berkala\n" +
      "                   a.n. Sdr. " + (p.nama_pegawai || "-")
    );
    pNomor.setFontSize(10);

    // 3. TUJUAN KEPADA
    const pKepada = body.appendParagraph(
      "\nKepada\nYth. " + (p.tujuan_kppn || "Kepala Kantor Pelayanan Perbendaharaan Negara Cirebon di- CIREBON")
    );
    pKepada.setFontSize(10);

    // 4. ISI SURAT
    const pIsi1 = body.appendParagraph(
      "\n        Dengan ini kami beritahukan, bahwa berhubung dengan telah terpenuhinya masa kerja dan syarat-syarat lainnya atas:"
    );
    pIsi1.setFontSize(10);

    // Poin 1 - 5
    const pPoints1 = body.appendParagraph(
      "1. Nama / tanggal lahir              : " + (p.nama_pegawai || "-") + " / " + (p.tanggal_lahir || "-") + "\n" +
      "2. NIP                                            : " + (p.nip || "-") + "\n" +
      "3. Pangkat / Jabatan                  : " + (p.pangkat || "-") + " / " + (p.jabatan || "-") + "\n" +
      "4. Unit Kerja                                 : " + (p.unit_kerja || "Pengadilan Agama Indramayu Kelas 1.A.") + "\n" +
      "5. Gaji Pokok Lama                    : Rp. " + (p.gaji_lama || "-") + "\n" +
      "    (atas dasar Skp. terakhir tentang gaji/pangkat yang di tetapkan)\n" +
      "    a. Oleh pejabat                           : " + (p.pejabat_lama || "Ketua Pengadilan Agama Indramayu") + "\n" +
      "    b. Tanggal dan nomor               : " + (p.tanggal_sk_lama || "-") + " / " + (p.nomor_sk_lama || "-") + "\n" +
      "    c. Tanggal mulai gaji tersebut   : " + (p.tmt_lama || "-") + "\n" +
      "    d. Masa kerja golongan             : " + (p.mkg_lama || "-")
    );
    pPoints1.setFontSize(10);

    const pDiberikan = body.appendParagraph(
      "\nDIBERIKAN KENAIKAN GAJI BERKALA HINGGA MEMPEROLEH :"
    );
    pDiberikan.setFontSize(10);
    pDiberikan.setBold(true);

    // Poin 6 - 10
    const pPoints2 = body.appendParagraph(
      "6. Gaji pokok baru                      : Rp. " + (p.gaji_baru || "-") + ",- (" + (p.terbilang_gaji || "-") + ")\n" +
      "7. Masa kerja                               : " + (p.mkg_baru || "-") + "\n" +
      "8. Dalam golongan/Ruang          : " + (p.golongan || "-") + "\n" +
      "9. Mulai tanggal                           : " + (p.tmt_baru || "-") + "\n" +
      "10. Kenaikan gaji Yad.                 : " + (p.tmt_yad || "-")
    );
    pPoints2.setFontSize(10);
    pPoints2.setBold(false);

    // Penutup
    const pPenutup = body.appendParagraph(
      "\n        Kami harap sesuai dengan " + (p.dasar_pp || "Peraturan Pemerintah Republik Indonesia Nomor : 05 Tahun 2024") + ", kepada Pegawai tersebut agar dibayarkan penghasilannya berdasarkan gaji pokoknya yang baru."
    );
    pPenutup.setFontSize(10);

    // 5. TANDA TANGAN KETUA
    const pTtd = body.appendParagraph(
      "\n                                                                                                   Ketua,\n\n\n\n" +
      "                                                                                                   " + (p.nama_ketua || "Ketua")
    );
    pTtd.setFontSize(10);

    // 6. TEMBUSAN
    const pTembusan = body.appendParagraph(
      "\nTembusan :\n" +
      "1. Ketua Pengadilan Tinggi Agama Bandung di Bandung;\n" +
      "2. Kepala Kantor Cabang PT. TASPEN di Cirebon;\n" +
      "3. Sdr. " + (p.nama_pegawai || "-") + ", di Indramayu."
    );
    pTembusan.setFontSize(9);

    doc.saveAndClose();
  }

  // Buat Hak Akses Terbuka untuk Link
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}

  const docUrl = file.getUrl();
  const pdfBlob = file.getAs('application/pdf');
  const pdfFile = DriveApp.createFile(pdfBlob).setName(fileName + ".pdf");
  try {
    pdfFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {}

  return {
    docUrl: docUrl,
    pdfUrl: pdfFile.getUrl()
  };
}
