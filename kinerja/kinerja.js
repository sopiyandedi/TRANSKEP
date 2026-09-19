// ==========================================
// FILE: kinerja.gs
// Deskripsi: Backend Controller untuk E-Kinerja & TTE
// ==========================================

function addKinerjaLog(payload) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    let sheet = ss.getSheetByName('ekinerja_data');
    if (!sheet) {
        sheet = ss.insertSheet('ekinerja_data');
        sheet.appendRow(['ID_Kinerja', 'NIP_Pegawai', 'NIP_Penilai', 'Tahun', 'Periode', 'Predikat', 'URL_Penilaian', 'URL_Evaluasi', 'Status', 'Tgl_TTE', 'File_Pengesahan', 'Tgl_Input']);
    }

    const folderName = "Arsip E-Kinerja TRANSKEP";
    let folders = DriveApp.getFoldersByName(folderName);
    let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);

    // 1. Upload File Penilaian
    const blobPenilaian = Utilities.newBlob(Utilities.base64Decode(payload.filePenilaianData), payload.fileMimeType, `Penilaian_${payload.fileNameBase}.pdf`);
    const filePen = folder.createFile(blobPenilaian);
    filePen.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // 2. Upload File Evaluasi
    const blobEvaluasi = Utilities.newBlob(Utilities.base64Decode(payload.fileEvaluasiData), payload.fileMimeType, `Evaluasi_${payload.fileNameBase}.pdf`);
    const fileEva = folder.createFile(blobEvaluasi);
    fileEva.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const newId = "SKP-" + new Date().getTime();
    const tglInput = new Date().toLocaleDateString('id-ID');
    
    sheet.appendRow([
        newId, payload.nip, payload.pejabat_nip, payload.tahun, payload.periode, payload.predikat,
        filePen.getUrl(), fileEva.getUrl(), 'Menunggu TTE', '-', '-', tglInput
    ]);

    sheet.getRange(sheet.getLastRow(), 2, 1, 2).setNumberFormat('@'); // Cegah NIP jadi angka
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Dokumen SKP berhasil diunggah.' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function approveKinerja(id, userNip) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheetKinerja = ss.getSheetByName('ekinerja_data');
    const sheetUser = ss.getSheetByName('user_data');
    
    if(!sheetKinerja || !sheetUser) throw new Error("Database belum siap.");

    const kData = sheetKinerja.getDataRange().getValues();
    let rowIndex = -1; let record = null;
    for (let i = 1; i < kData.length; i++) {
        if (String(kData[i][0]) === String(id)) { rowIndex = i + 1; record = kData[i]; break; }
    }
    
    if(rowIndex === -1) throw new Error("Data SKP tidak ditemukan.");
    if(String(record[8]) !== 'Menunggu TTE') throw new Error("Dokumen ini sudah disahkan sebelumnya.");
    
    // Tarik data Pegawai & Pejabat
    const uData = sheetUser.getDataRange().getValues();
    let pegawai = {}, pejabat = {}, isAdmin = false;
    
    for (let i = 1; i < uData.length; i++) {
        if (String(uData[i][0]) === String(record[1])) pegawai = { nama: uData[i][1], nip: uData[i][0], jabatan: uData[i][2] };
        if (String(uData[i][0]) === String(record[2])) pejabat = { nama: uData[i][1], nip: uData[i][0], jabatan: uData[i][2] };
        if (String(uData[i][0]) === String(userNip) && String(uData[i][3]).toLowerCase().includes('admin')) isAdmin = true;
    }

    if (String(userNip) !== String(record[2]) && !isAdmin) {
        throw new Error("Akses Ditolak: Anda bukan Pejabat Penilai untuk dokumen ini.");
    }

    // --- MEMBANGUN LEMBAR PENGESAHAN (HTML to PDF) ---
    const tglTteLengkap = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + " WIB";
    
    const qrText = `Telah DISAHKAN secara Elektronik oleh ${pejabat.nama} (Pejabat Penilai) pada tanggal ${tglTteLengkap}. ID Dokumen Asli: ${record[0]}`;
    const qrUrl = "https://quickchart.io/qr?size=150&margin=1&text=" + encodeURIComponent(qrText);

    let htmlCover = `
    <html>
      <body style="font-family: 'Times New Roman', Times, serif; padding: 40px; text-align: center; color: #000; line-height: 1.6;">
         <h2 style="text-decoration: underline; margin-bottom: 30px;">LEMBAR PENGESAHAN ELEKTRONIK E-KINERJA</h2>
         
         <p style="text-align: justify;">Menyatakan bahwa Dokumen Sasaran Kinerja Pegawai (SKP) atas nama:</p>
         <table style="margin: 0 auto; text-align: left; width: 80%; font-size: 12pt; margin-bottom: 20px;">
            <tr><td width="30%">Nama Pegawai</td><td width="5%">:</td><td><b>${pegawai.nama}</b></td></tr>
            <tr><td>NIP</td><td>:</td><td>${pegawai.nip}</td></tr>
            <tr><td>Jabatan</td><td>:</td><td>${pegawai.jabatan}</td></tr>
            <tr><td>Periode Penilaian</td><td>:</td><td><b>${record[4]} Tahun ${record[3]}</b></td></tr>
            <tr><td>Predikat Kinerja</td><td>:</td><td><b>${record[5]}</b></td></tr>
         </table>
         
         <p style="text-align: justify;">Telah ditinjau dan dinyatakan <b>SAH</b> oleh Pejabat Penilai Kinerja secara elektronik melalui Sistem Terpadu (TRANSKEP). Dokumen rincian asli dapat diakses melalui pangkalan data arsip digital Pengadilan Agama Indramayu pada tautan berikut:</p>
         <div style="text-align: left; width: 80%; margin: 10px auto; font-size: 10pt;">
            1. Dokumen Penilaian : <a href="${record[6]}">${record[6]}</a><br>
            2. Dokumen Evaluasi &nbsp;: <a href="${record[7]}">${record[7]}</a>
         </div>

         <div style="margin-top: 50px; float: right; width: 300px; text-align: center;">
            <p style="margin-bottom: 5px;">Disahkan secara Elektronik oleh:<br><b>Pejabat Penilai Kinerja</b></p>
            <img src="${qrUrl}" width="100" height="100" crossorigin="anonymous" style="margin: 10px 0; border: 2px solid #000; padding: 2px;"/>
            <br><u><b>${pejabat.nama}</b></u>
            <br>NIP. ${pejabat.nip}
         </div>
      </body>
    </html>`;

    const blob = Utilities.newBlob(htmlCover, MimeType.HTML, `Pengesahan_SKP_${record[0]}.html`);
    const pdfBlob = blob.getAs(MimeType.PDF);
    pdfBlob.setName(`Pengesahan_SKP_${pegawai.nip}_${record[3]}.pdf`);
    
    const folderName = "Arsip E-Kinerja TRANSKEP";
    let folders = DriveApp.getFoldersByName(folderName);
    let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    
    const fileTte = folder.createFile(pdfBlob);
    fileTte.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // Update Database Status
    const tglTteSimple = new Date().toLocaleDateString('id-ID');
    sheetKinerja.getRange(rowIndex, 9).setValue('Telah Disahkan');
    sheetKinerja.getRange(rowIndex, 10).setValue(tglTteSimple);
    sheetKinerja.getRange(rowIndex, 11).setValue(fileTte.getUrl());
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Tanda tangan elektronik berhasil dibubuhkan.' };
    
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}