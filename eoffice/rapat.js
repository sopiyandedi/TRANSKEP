// ==========================================
// FILE: eoffice/rapat.js
// DESKRIPSI: Backend Service Pembuatan Paket Dokumen Rapat (3-in-1)
// HASIL: 1. Undangan Rapat, 2. Daftar Hadir, 3. Notulen Kedinasan
// ENGINE: TRANSKEP Core v1.0.0 
// ==========================================

/**
 * Generator Penomoran ID Rapat Sekuensial (Incremental Unique ID Anti-Collision)
 */
function generateSeqRapatId_(ss) {
  const sheet = ss.getSheetByName('EofficeRapat');
  const now = new Date();
  const yyyymm = Utilities.formatDate(now, 'Asia/Jakarta', 'yyyyMM');
  const prefix = 'RPT-' + yyyymm + '-';
  
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
 * Helper: Menambahkan Kop Surat Standar PA Indramayu pada Google Docs
 */
function appendKopSuratPaIndramayu_(body) {
  // Set Margin Standar Kedinasan (Kiri 2.5cm, Kanan 2cm, Atas 2cm, Bawah 2cm)
  body.setMarginLeft(70.87);
  body.setMarginRight(56.7);
  body.setMarginTop(56.7);
  body.setMarginBottom(56.7);

  const pKop1 = body.appendParagraph(
    "MAHKAMAH AGUNG REPUBLIK INDONESIA\n" +
    "DIREKTORAT JENDERAL BADAN PERADILAN AGAMA\n" +
    "PENGADILAN TINGGI AGAMA BANDUNG\n" +
    "PENGADILAN AGAMA INDRAMAYU"
  );
  pKop1.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  pKop1.setFontFamily("Arial");
  pKop1.setFontSize(11);
  pKop1.setBold(true);

  const pKop2 = body.appendParagraph(
    "Jalan M.T. Haryono No.2A Kel. Sindang Kec.Sindang Kab. Indramayu Kode Pos 45222\n" +
    "Telepon (0234) 273880 | Situs : www.pa-indramayu.go.id | e-mail : pa.indramayu_ptabdg@yahoo.co.id"
  );
  pKop2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  pKop2.setFontFamily("Arial");
  pKop2.setFontSize(8);
  pKop2.setBold(false);

  body.appendHorizontalRule();
}

/**
 * FUNGSI UTAMA: Menerbitkan 3 Dokumen Rapat Sekaligus & Menyimpan ke Database
 */
function createPaketRapatDocs(payload, adminNip, clientToken) {
  try {
    // 1. Validasi Keamanan
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Pembuatan paket rapat dinas hanya dapat dilakukan oleh Admin.' };
    }

    const ss = getDB();
    if (!ss) throw new Error("Koneksi spreadsheet gagal.");

    initEofficeDatabase_();
    const sheet = ss.getSheetByName('EofficeRapat');
    if (!sheet) throw new Error("Sheet EofficeRapat tidak ditemukan.");

    let idRapat = String(payload.id_rapat || '');
    if (!idRapat) {
      idRapat = generateSeqRapatId_(ss);
    }

    let pesertaList = [];
    try {
      pesertaList = JSON.parse(payload.peserta_json || '[]');
    } catch(e) {
      pesertaList = [];
    }

    const cleanAgenda = (payload.agenda || 'Rapat').replace(/[^a-zA-Z0-9]/g, '_');

    // ==========================================
    // 1. DOKUMEN 1: SURAT UNDANGAN RAPAT
    // ==========================================
    const docUndangan = DocumentApp.create("Undangan_Rapat_" + cleanAgenda + "_" + idRapat);
    const bodyUndangan = docUndangan.getBody();
    appendKopSuratPaIndramayu_(bodyUndangan);

    const pTglSurat = bodyUndangan.appendParagraph("Indramayu, " + (payload.hari_tanggal || "-"));
    pTglSurat.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
    pTglSurat.setFontSize(10);

    const pHeaderUndangan = bodyUndangan.appendParagraph(
      "Nomor       : " + (payload.nomor_undangan || "-") + "\n" +
      "Sifat          : Penting\n" +
      "Lampiran : 1 (satu) Berkas\n" +
      "Perihal     : Undangan " + (payload.agenda || "Rapat Dinas")
    );
    pHeaderUndangan.setFontSize(10);

    const pKepadaUndangan = bodyUndangan.appendParagraph(
      "\nKepada Yth.\nBapak/Ibu Peserta Rapat (Daftar Terlampir)\nDi-\n     Tempat"
    );
    pKepadaUndangan.setFontSize(10);

    const pIsiUndangan = bodyUndangan.appendParagraph(
      "\n        Dengan hormat,\n" +
      "        Mengharap kehadiran Bapak/Ibu dalam rapat dinas Pengadilan Agama Indramayu yang akan diselenggarakan pada:\n\n" +
      "        Hari / Tanggal  : " + (payload.hari_tanggal || "-") + "\n" +
      "        Waktu              : " + (payload.waktu_mulai || "09:00 WIB") + " s/d " + (payload.waktu_selesai || "Selesai") + "\n" +
      "        Tempat             : " + (payload.tempat || "Ruang Sidang Utama PA Indramayu") + "\n" +
      "        Agenda             : " + (payload.agenda || "-") + "\n\n" +
      "        Mengingat pentingnya agenda tersebut, dimohon agar hadir tepat pada waktunya.\n" +
      "        Demikian undangan ini kami sampaikan, atas perhatian dan kehadirannya diucapkan terima kasih."
    );
    pIsiUndangan.setFontSize(10);

    const pTtdUndangan = bodyUndangan.appendParagraph(
      "\n                                                                                                   " + (payload.pemimpin || "Ketua Pengadilan Agama Indramayu") + ",\n\n\n\n" +
      "                                                                                                   ( .............................................................. )"
    );
    pTtdUndangan.setFontSize(10);

    // Lampiran Peserta Undangan
    bodyUndangan.appendPageBreak();
    const pLampHeader = bodyUndangan.appendParagraph(
      "LAMPIRAN SURAT UNDANGAN\n" +
      "Nomor : " + (payload.nomor_undangan || "-") + "\n" +
      "Tanggal : " + (payload.hari_tanggal || "-") + "\n\n" +
      "DAFTAR PEGAWAI YANG DIUNDANG :"
    );
    pLampHeader.setBold(true);
    pLampHeader.setFontSize(10);

    const tableUndangan = bodyUndangan.appendTable();
    const trUndanganHeader = tableUndangan.appendTableRow();
    trUndanganHeader.appendTableCell("NO").setWidth(35).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    trUndanganHeader.appendTableCell("NAMA PEGAWAI").setWidth(230);
    trUndanganHeader.appendTableCell("NIP").setWidth(120);
    trUndanganHeader.appendTableCell("JABATAN").setWidth(150);

    for (let c = 0; c < 4; c++) {
      trUndanganHeader.getCell(c).setBackgroundColor("#f1f5f9");
      trUndanganHeader.getCell(c).getChild(0).asParagraph().setBold(true).setFontSize(9);
    }

    pesertaList.forEach((p, idx) => {
      const row = tableUndangan.appendTableRow();
      row.appendTableCell(String(idx + 1)).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      row.appendTableCell(p.nama || '-');
      row.appendTableCell(p.nip || '-');
      row.appendTableCell(p.jabatan || '-');
      for (let c = 0; c < 4; c++) {
        row.getCell(c).getChild(0).asParagraph().setFontSize(9);
      }
    });

    docUndangan.saveAndClose();
    const fileUndangan = DriveApp.getFileById(docUndangan.getId());
    try { fileUndangan.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e){}

    // ==========================================
    // 2. DOKUMEN 2: LEMBAR DAFTAR HADIR RAPAT
    // ==========================================
    const docAbsen = DocumentApp.create("Daftar_Hadir_" + cleanAgenda + "_" + idRapat);
    const bodyAbsen = docAbsen.getBody();
    appendKopSuratPaIndramayu_(bodyAbsen);

    const pJudulAbsen = bodyAbsen.appendParagraph("DAFTAR HADIR RAPAT KEDINASAN");
    pJudulAbsen.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pJudulAbsen.setFontSize(11);
    pJudulAbsen.setBold(true);

    const pInfoAbsen = bodyAbsen.appendParagraph(
      "Hari / Tanggal  : " + (payload.hari_tanggal || "-") + "\n" +
      "Waktu              : " + (payload.waktu_mulai || "-") + " s/d " + (payload.waktu_selesai || "-") + "\n" +
      "Tempat             : " + (payload.tempat || "-") + "\n" +
      "Agenda Rapat   : " + (payload.agenda || "-") + "\n"
    );
    pInfoAbsen.setFontSize(10);

    const tableAbsen = bodyAbsen.appendTable();
    const trAbsenHeader = tableAbsen.appendTableRow();
    trAbsenHeader.appendTableCell("NO").setWidth(30).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    trAbsenHeader.appendTableCell("NAMA PEGAWAI / NIP").setWidth(260);
    trAbsenHeader.appendTableCell("JABATAN").setWidth(135);
    trAbsenHeader.appendTableCell("TANDA TANGAN / PARAF").setWidth(110).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);

    for (let c = 0; c < 4; c++) {
      trAbsenHeader.getCell(c).setBackgroundColor("#f1f5f9");
      trAbsenHeader.getCell(c).getChild(0).asParagraph().setBold(true).setFontSize(9);
    }

    // Format zig-zag tanda tangan kedinasan (1... 2...)
    pesertaList.forEach((p, idx) => {
      const row = tableAbsen.appendTableRow();
      row.appendTableCell(String(idx + 1)).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      
      const pNamaCell = row.appendTableCell();
      pNamaCell.appendParagraph(p.nama || '-').setBold(true);
      pNamaCell.appendParagraph("NIP. " + (p.nip || '-')).setFontSize(8).setFontColor("#475569");
      
      row.appendTableCell(p.jabatan || '-');

      // Tanda tangan ganjil / genap
      const pTtdCell = row.appendTableCell();
      const numStr = (idx + 1) + ". .........";
      const pTtdPara = pTtdCell.getChild(0).asParagraph();
      pTtdPara.setText(numStr);
      pTtdPara.setAlignment((idx % 2 === 0) ? DocumentApp.HorizontalAlignment.LEFT : DocumentApp.HorizontalAlignment.CENTER);

      for (let c = 0; c < 4; c++) {
        row.getCell(c).getChild(0).asParagraph().setFontSize(9);
      }
    });

    const pTtdMengetahui = bodyAbsen.appendParagraph(
      "\n                                                                                                   Mengetahui,\n" +
      "                                                                                                   " + (payload.pemimpin || "Pemimpin Rapat") + ",\n\n\n\n" +
      "                                                                                                   ( .............................................................. )"
    );
    pTtdMengetahui.setFontSize(10);

    docAbsen.saveAndClose();
    const fileAbsen = DriveApp.getFileById(docAbsen.getId());
    try { fileAbsen.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e){}

    // ==========================================
    // 3. DOKUMEN 3: NOTULEN RAPAT KEDINASAN
    // ==========================================
    const docNotulen = DocumentApp.create("Notulen_Rapat_" + cleanAgenda + "_" + idRapat);
    const bodyNotulen = docNotulen.getBody();
    appendKopSuratPaIndramayu_(bodyNotulen);

    const pJudulNotulen = bodyNotulen.appendParagraph("NOTULEN RAPAT KEDINASAN");
    pJudulNotulen.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pJudulNotulen.setFontSize(11);
    pJudulNotulen.setBold(true);

    const pInfoNotulen = bodyNotulen.appendParagraph(
      "Sidang / Rapat              : " + (payload.agenda || "-") + "\n" +
      "Hari / Tanggal              : " + (payload.hari_tanggal || "-") + "\n" +
      "Waktu Pelaksanaan       : " + (payload.waktu_mulai || "-") + " s/d " + (payload.waktu_selesai || "-") + "\n" +
      "Tempat Pelaksanaan      : " + (payload.tempat || "-") + "\n" +
      "Pimpinan Rapat             : " + (payload.pemimpin || "-") + "\n" +
      "Notulis / Pencatat         : " + (payload.notulis || "-") + "\n" +
      "Peserta Hadir                 : " + pesertaList.length + " Orang (Daftar Hadir Terlampir)\n"
    );
    pInfoNotulen.setFontSize(10);

    // Garis Pemisah
    bodyNotulen.appendHorizontalRule();

    const pSusunanAcara = bodyNotulen.appendParagraph(
      "\nJALANNYA PERTEMUAN / SUSUNAN ACARA :\n" +
      "1. Pembukaan oleh Pembawa Acara / Pimpinan Rapat\n" +
      "2. Pengarahan dan Pokok Pembahasan Rapat\n" +
      "3. Tanya Jawab / Tanggapan dan Masukan Peserta\n" +
      "4. Kesimpulan & Penutup\n\n" +
      "POKOK-POKOK PEMBAHASAN / ARAHAN PIMPINAN :\n" +
      (payload.pembahasan || "- Tidak ada catatan khusus -") + "\n\n" +
      "KESIMPULAN & TINDAK LANJUT RAPAT :\n" +
      (payload.kesimpulan || "- Rapat berjalan dengan tertib dan lancar -") + "\n"
    );
    pSusunanAcara.setFontSize(10);
    pSusunanAcara.setLineSpacing(1.15);

    // Tanda Tangan Ganda: Pimpinan & Notulis
    const tableTtdNotulen = bodyNotulen.appendTable();
    const rowTtd = tableTtdNotulen.appendTableRow();
    
    const cellNotulis = rowTtd.appendTableCell();
    cellNotulis.setWidth(270);
    const pTtdNotulis = cellNotulis.getChild(0).asParagraph();
    pTtdNotulis.setText(
      "Notulis Rapat,\n\n\n\n\n" +
      (payload.notulis || ".....................................................")
    );
    pTtdNotulis.setFontSize(10);

    const cellPimpinan = rowTtd.appendTableCell();
    cellPimpinan.setWidth(270);
    const pTtdPimpinan = cellPimpinan.getChild(0).asParagraph();
    pTtdPimpinan.setText(
      "Pimpinan Rapat,\n\n\n\n\n" +
      (payload.pemimpin || ".....................................................")
    );
    pTtdPimpinan.setFontSize(10);

    // Hilangkan border tabel tanda tangan
    for (let c = 0; c < 2; c++) {
      rowTtd.getCell(c).setBorderWidth(0);
    }

    docNotulen.saveAndClose();
    const fileNotulen = DriveApp.getFileById(docNotulen.getId());
    try { fileNotulen.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e){}

    // ==========================================
    // 4. SIMPAN RIWAYAT KE SHEET EofficeRapat
    // ==========================================
    const todayStr = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
    const docUndanganUrl = fileUndangan.getUrl();
    const docAbsenUrl = fileAbsen.getUrl();
    const docNotulenUrl = fileNotulen.getUrl();

    const rapatRow = [
      idRapat,
      todayStr,
      String(payload.nomor_undangan || ''),
      String(payload.agenda || ''),
      String(payload.hari_tanggal || ''),
      String(payload.waktu_mulai || ''),
      String(payload.waktu_selesai || ''),
      String(payload.tempat || ''),
      String(payload.pemimpin || ''),
      String(payload.notulis || ''),
      String(payload.peserta_json || '[]'),
      String(payload.pembahasan || ''),
      String(payload.kesimpulan || ''),
      'Selesai',
      docUndanganUrl,
      docAbsenUrl,
      docNotulenUrl,
      String(adminNip || '')
    ];

    const safeRapatRow = sanitizeRowArray ? sanitizeRowArray(rapatRow) : rapatRow;

    // Periksa apakah update baris lama atau insert baru
    let targetRowIdx = -1;
    if (sheet.getLastRow() > 1) {
      const existingIds = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < existingIds.length; i++) {
        if (String(existingIds[i][0]) === idRapat) {
          targetRowIdx = i + 2;
          break;
        }
      }
    }

    if (targetRowIdx > 0) {
      sheet.getRange(targetRowIdx, 1, 1, safeRapatRow.length).setValues([safeRapatRow]);
    } else {
      sheet.appendRow(safeRapatRow);
    }

    SpreadsheetApp.flush();

    return {
      status: 'success',
      message: '3 Dokumen Rapat berhasil diterbitkan!',
      data: {
        id_rapat: idRapat,
        doc_undangan_url: docUndanganUrl,
        doc_absen_url: docAbsenUrl,
        doc_notulen_url: docNotulenUrl
      }
    };

  } catch (err) {
    Logger.log("ERROR createPaketRapatDocs: " + err.toString());
    return { status: 'error', message: err.toString() };
  }
}
