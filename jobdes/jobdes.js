// ==========================================
// FILE: jobdes.gs
// Deskripsi: Backend Controller untuk Jobdes, PDF Engine, Auto-Trash & Notifikasi
// ==========================================

function otorisasiSistem() {
  const folderTemp = DriveApp.createFolder("TEST_ZETTBOT_HAPUS_SAJA");
  const fileTemp = folderTemp.createFile("test.txt", "ZettBOT Test");
  fileTemp.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  fileTemp.setTrashed(true);
  folderTemp.setTrashed(true);
  Logger.log("Otorisasi Google Drive Berhasil Terbuka Penuh!");
}

function searchJobdesBackend(keyword) {
   try {
      const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID") || "ISI_ID_SPREADSHEET_JIKA_PROPERTIES_KOSONG");
      let sheet = ss.getSheetByName('Master_Pegawai');
      if(!sheet) return []; // Fallback aman
      
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

function saveJobdes(payload) { 
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID") || "ISI_ID_SPREADSHEET_JIKA_PROPERTIES_KOSONG");
    let sheet = ss.getSheetByName('jobdes_data');
    if (!sheet) {
        sheet = ss.insertSheet('jobdes_data');
        sheet.appendRow(['NIP', 'Atasan_NIP', 'Dasar_Lampiran', 'Ikhtisar_Jabatan', 'Tugas_Pokok', 'Tugas_Tambahan', 'Tanggung_Jawab', 'Hasil_Kerja']);
    }
    
    const data = sheet.getDataRange().getDisplayValues();
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(payload.nip)) { rowIndex = i + 1; break; }
    }
    
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

function createPdfJobdes(htmlContent, fileName) {
  try {
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

// PENTING: Pasang Trigger Waktu (Time-driven) pada fungsi ini di editor Apps Script agar jalan otomatis.
function autoTrashJobdesPdfs() {
  try {
    const folderName = "Arsip Dokumen Jobdes TRANSKEP";
    const folders = DriveApp.getFoldersByName(folderName);
    if (!folders.hasNext()) return { status: 'error', message: 'Folder tidak ditemukan.' };
    
    const folder = folders.next();
    const files = folder.getFiles();
    const now = new Date();
    // 90 hari x 24 jam x 60 menit x 60 detik x 1000 milidetik
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

function saveUsulanReposisi(payload) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID") || "ISI_ID_SPREADSHEET_JIKA_PROPERTIES_KOSONG");
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

function getUsulanMenunggu() {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID") || "ISI_ID_SPREADSHEET_JIKA_PROPERTIES_KOSONG");
    let sheet = ss.getSheetByName('usulan_jobdes_data');
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getDisplayValues();
    let usulan = [];
    
    for (let i = 1; i < data.length; i++) {
       if (data[i][5] === 'Menunggu') { // Kolom Status
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

function tandaiUsulanSelesai(timestampId) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID") || "ISI_ID_SPREADSHEET_JIKA_PROPERTIES_KOSONG");
    let sheet = ss.getSheetByName('usulan_jobdes_data');
    if (!sheet) return {status: 'error'};
    
    const data = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < data.length; i++) {
       if (String(data[i][0]) === String(timestampId)) {
          sheet.getRange(i + 1, 6).setValue('Selesai'); // Ubah status
          break;
       }
    }
    SpreadsheetApp.flush();
    return { status: 'success' };
  } catch(e) {
    return { status: 'error' };
  }
}