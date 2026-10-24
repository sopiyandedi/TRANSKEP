// ==========================================
// FILE: jobdes.gs
// Deskripsi: Backend Controller untuk Jobdes, PDF Engine, Auto-Trash & Notifikasi (Aman & Terpusat)
// ==========================================

function otorisasiSistem_() {
  const folderTemp = DriveApp.createFolder("TEST_TRANSKEP_TEMP");
  const fileTemp = folderTemp.createFile("test.txt", "TRANSKEP Test");
  fileTemp.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  fileTemp.setTrashed(true);
  folderTemp.setTrashed(true);
  Logger.log("Otorisasi Google Drive Berhasil Terbuka Penuh!");
}

function searchJobdesBackend(keyword, userNip, clientToken) {
   try {
      if (!cekOtorisasi(userNip, clientToken)) return [];

      const ss = getDB();
      let sheet = ss.getSheetByName('user_data') || ss.getSheetByName('Master_Pegawai');
      if(!sheet) return []; 
      
      const data = sheet.getDataRange().getDisplayValues();
      if(data.length < 2) return [];

      const headers = data[0].map(h => h.toString().toLowerCase().trim());
      const idxNip = headers.indexOf('nip');
      const idxNama = headers.indexOf('nama');
      const idxJabatan = headers.indexOf('jabatan');

      if (idxNip === -1 || idxNama === -1) return [];

      keyword = keyword.toLowerCase().trim();
      let results = [];
      
      for(let i = 1; i < data.length; i++) {
         const nip = data[i][idxNip] || "";
         const nama = data[i][idxNama] || "";
         const jabatan = (idxJabatan !== -1) ? (data[i][idxJabatan] || "") : "";

         if(nip.toLowerCase().includes(keyword) || nama.toLowerCase().includes(keyword) || jabatan.toLowerCase().includes(keyword)) {
            results.push({ nip: nip, nama: nama, jabatan: jabatan });
         }
      }
      return results;
   } catch(e) {
      return [];
   }
}

function saveJobdes(payload, userNip, clientToken) { 
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    let sheet = ss.getSheetByName('jobdes_data');
    if (!sheet) {
        sheet = ss.insertSheet('jobdes_data');
        sheet.appendRow(['NIP', 'Atasan_NIP', 'Dasar_Lampiran', 'Ikhtisar_Jabatan', 'Tugas_Pokok', 'Tugas_Tambahan', 'Tanggung_Jawab', 'Hasil_Kerja']);
    }
    
    const data = sheet.getDataRange().getDisplayValues();
    
    // TRANSKEP OPTIMIZATION: Menggunakan metode native V8 findIndex 
    // melewati index 0 (header) agar pencarian baris jauh lebih cepat
    const foundIndex = data.findIndex((row, index) => index > 0 && String(row[0]) === String(payload.nip));
    const rowIndex = foundIndex !== -1 ? foundIndex + 1 : -1;
    
    const rowData = [
        payload.nip, payload.atasan_nip, payload.dasar_lampiran, payload.ikhtisar_jabatan,
        payload.tugas_pokok, payload.tugas_tambahan, payload.tanggung_jawab, payload.hasil_kerja
    ];
    
    if (rowIndex === -1) {
        sheet.appendRow(rowData);
        sheet.getRange(sheet.getLastRow(), 1).setNumberFormat('@');
    } else {
        sheet.getRange(rowIndex, 1, 1, 8).setValues([rowData]);
    }
    
    SpreadsheetApp.flush(); 
    return { status: 'success', message: 'Uraian tugas berhasil disimpan.' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

function createPdfJobdes(htmlContent, fileName, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const blob = Utilities.newBlob(htmlContent, MimeType.HTML, fileName + ".html");
    const pdfBlob = blob.getAs(MimeType.PDF);
    pdfBlob.setName(fileName + ".pdf");
    
    const folderName = "Arsip Dokumen Jobdes TRANSKEP";
    let folders = DriveApp.getFoldersByName(folderName);
    let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
    
    const file = folder.createFile(pdfBlob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return { status: 'success', url: file.getUrl() };
  } catch (e) {
    return { status: 'error', message: "Gagal memproses PDF: " + e.toString() };
  }
}

function autoTrashJobdesPdfs() {
  try {
    const folderName = "Arsip Dokumen Jobdes TRANSKEP";
    const folders = DriveApp.getFoldersByName(folderName);
    if (!folders.hasNext()) return { status: 'error', message: 'Folder tidak ditemukan.' };
    
    const folder = folders.next();
    const files = folder.getFiles();
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000)); 
    let countDeleted = 0;
    
    while (files.hasNext()) {
      const file = files.next();
      if (file.getDateCreated() < cutoffDate) {
        file.setTrashed(true);
        countDeleted++;
      }
    }
    return { status: 'success', message: `Berhasil membersihkan ${countDeleted} file PDF kadaluarsa.` };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

function saveUsulanReposisi(payload, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    let sheet = ss.getSheetByName('usulan_jobdes_data');
    if (!sheet) {
        sheet = ss.insertSheet('usulan_jobdes_data');
        sheet.appendRow(['Timestamp_ID', 'NIP_Pegawai', 'Nama_Pegawai', 'Nama_Pengusul', 'Isi_Usulan', 'Status']);
    }
    
    const timestampId = new Date().getTime().toString();
    sheet.appendRow([
       timestampId, 
       payload.nip_pegawai, 
       payload.nama_pegawai, 
       payload.nama_pengusul, 
       payload.isi_usulan, 
       'Menunggu'
    ]);
    
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Usulan reposisi berhasil dikirim ke Admin.' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

function getUsulanMenunggu(userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return [];

    const ss = getDB();
    let sheet = ss.getSheetByName('usulan_jobdes_data');
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getDisplayValues();
    let usulan = [];
    
    for (let i = 1; i < data.length; i++) {
       if (data[i][5] === 'Menunggu') { 
          usulan.push({
             id: data[i][0],
             nip: data[i][1],
             nama: data[i][2],
             pengusul: data[i][3],
             isi: data[i][4]
          });
       }
    }
    return usulan;
  } catch(e) {
    return [];
  }
}

function tandaiUsulanSelesai(timestampId, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    let sheet = ss.getSheetByName('usulan_jobdes_data');
    if (!sheet) return {status: 'error'};
    
    const data = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < data.length; i++) {
       if (String(data[i][0]) === String(timestampId)) {
          sheet.getRange(i + 1, 6).setValue('Selesai'); 
          break;
       }
    }
    SpreadsheetApp.flush();
    return { status: 'success' };
  } catch(e) {
    return { status: 'error' };
  }
}