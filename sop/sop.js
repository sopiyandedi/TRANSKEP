// ==========================================
// FILE: sop.gs (Backend Controller Khusus SOP Aman & Terpusat)
// ==========================================

function autoInitSopSheets(ss) {
  let isCreated = false;
  
  let sopSheet = ss.getSheetByName('sop_data');
  if (!sopSheet) {
     sopSheet = ss.insertSheet('sop_data');
     const sopHeaders = ['ID_SOP', 'Judul_SOP', 'Kategori_PJ', 'Nomor_SOP', 'Tanggal_Pembuatan', 'Tanggal_Revisi', 'Tanggal_Efektif', 'Link_Drive', 'Pelaksana_Terkait_JSON', 'Tgl_Input'];
     sopSheet.appendRow(sopHeaders);
     sopSheet.getRange("A1:J1").setFontWeight("bold").setBackground("#312e81").setFontColor("#ffffff");
     sopSheet.setFrozenRows(1);
     isCreated = true;
  }
  
  let ackSheet = ss.getSheetByName('sop_ack');
  if (!ackSheet) {
     ackSheet = ss.insertSheet('sop_ack');
     const ackHeaders = ['ID_ACK', 'ID_SOP', 'NIP_Pegawai', 'Tanggal_Baca'];
     ackSheet.appendRow(ackHeaders);
     ackSheet.getRange("A1:D1").setFontWeight("bold").setBackground("#065f46").setFontColor("#ffffff");
     ackSheet.setFrozenRows(1);
     ackSheet.getRange("C:C").setNumberFormat('@'); 
     isCreated = true;
  }
  
  if (isCreated) SpreadsheetApp.flush();
}

// TRANSKEP: Fungsi Pintasan Mengambil URL Root Folder "TRANSKEP SOP"
function getSopDriveFolderUrl(userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };
    const rootFolderName = "TRANSKEP SOP";
    let rootFolder;
    const rootFolders = DriveApp.getFoldersByName(rootFolderName);
    if (rootFolders.hasNext()) {
      rootFolder = rootFolders.next();
    } else {
      rootFolder = DriveApp.createFolder(rootFolderName);
    }
    return { status: 'success', url: rootFolder.getUrl() };
  } catch (e) {
    return { status: 'error', message: 'Gagal membuka Folder Drive SOP: ' + e.toString() };
  }
}

function saveSopData(payload, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    // ========================================================
    // FIX: PROSES AUTO-UPLOAD SOP KE FOLDER "TRANSKEP SOP"
    // ========================================================
    if (payload.fileBase64) {
       try {
           // 1. Inisialisasi Root Folder Khusus SOP
           const rootFolderName = "TRANSKEP SOP";
           let rootFolder;
           const rootFolders = DriveApp.getFoldersByName(rootFolderName);
           if (rootFolders.hasNext()) { rootFolder = rootFolders.next(); }
           else { rootFolder = DriveApp.createFolder(rootFolderName); }
           
           // 2. Ekstrak Tahun dari Tanggal Efektif atau Tanggal Pembuatan SOP
           let yearFolderStr = new Date().getFullYear().toString();
           const refDate = payload.tanggal_efektif || payload.tanggal_pembuatan;
           if (refDate) {
               const d = new Date(refDate);
               if (!isNaN(d.getTime())) yearFolderStr = d.getFullYear().toString();
           }
           
           let yearFolder;
           const yearFolders = rootFolder.getFoldersByName(yearFolderStr);
           if (yearFolders.hasNext()) { yearFolder = yearFolders.next(); }
           else { yearFolder = rootFolder.createFolder(yearFolderStr); }
           
           // 3. Masuk ke Folder PJ (Kategori Penanggung Jawab)
           const pjFolderStr = payload.kategori_pj || "PJ. Kesekretariatan";
           let pjFolder;
           const pjFolders = yearFolder.getFoldersByName(pjFolderStr);
           if (pjFolders.hasNext()) { pjFolder = pjFolders.next(); }
           else { pjFolder = yearFolder.createFolder(pjFolderStr); }
           
           // 4. Decode File dan Rename sesuai Judul SOP (Bersihkan karakter ilegal)
           const decodedData = Utilities.base64Decode(payload.fileBase64);
           let safeFileName = String(payload.judul_sop).replace(/[\\/:*?"<>|]/g, "_") + ".pdf";
           const blob = Utilities.newBlob(decodedData, "application/pdf", safeFileName);
           
           // 5. Buat File & Set Izin Public (Agar Flipbook bisa baca)
           const file = pjFolder.createFile(blob);
           file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
           
           // 6. Timpa payload Link Drive dengan URL asli file baru
           payload.link_drive = file.getUrl();
           
       } catch (uploadError) {
           return { status: 'error', message: 'Gagal merakit Folder Google Drive SOP: ' + uploadError.toString() };
       }
    }
    // ========================================================

    const ss = getDB();
    autoInitSopSheets(ss);
    
    const sheet = ss.getSheetByName('sop_data');
    if(!sheet) throw new Error("Gagal menginisialisasi tabel sop_data.");

    const now = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    
    const tglPembuatan = payload.tanggal_pembuatan; 
    const tglRevisi = payload.tanggal_revisi || '-'; 
    const tglEfektif = payload.tanggal_efektif; 
    const pelaksanaStr = JSON.stringify(payload.pelaksana || []);

    if (payload.id) {
      const data = sheet.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(payload.id)) {
          rowIndex = i + 1;
          break;
        }
      }
      
      if (rowIndex !== -1) {
        sheet.getRange(rowIndex, 2, 1, 8).setValues([[
          payload.judul_sop, payload.kategori_pj, payload.nomor_sop,
          tglPembuatan, tglRevisi, tglEfektif, payload.link_drive, pelaksanaStr
        ]]);
        SpreadsheetApp.flush();
        return { status: 'success', message: 'Dokumen SOP berhasil diperbarui.' };
      } else {
        throw new Error("SOP tidak ditemukan di database.");
      }
    } else {
      const newId = 'SOP-' + new Date().getTime();
      sheet.appendRow([
        newId, payload.judul_sop, payload.kategori_pj, payload.nomor_sop,
        tglPembuatan, tglRevisi, tglEfektif, payload.link_drive, pelaksanaStr, now
      ]);
      SpreadsheetApp.flush();
      return { status: 'success', message: 'Dokumen SOP baru berhasil ditambahkan.' };
    }
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

function deleteSopData(id, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheet = ss.getSheetByName('sop_data');
    if(!sheet) throw new Error("Tabel sop_data belum siap.");

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.deleteRow(i + 1);
        
        const ackSheet = ss.getSheetByName('sop_ack');
        if(ackSheet) {
           const ackData = ackSheet.getDataRange().getValues();
           for (let j = ackData.length - 1; j >= 1; j--) {
              if (String(ackData[j][1]) === String(id)) {
                 ackSheet.deleteRow(j + 1);
              }
           }
        }
        
        SpreadsheetApp.flush();
        return { status: 'success', message: 'Dokumen SOP berhasil dihapus.' };
      }
    }
    throw new Error("SOP tidak ditemukan.");
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

function acknowledgeSop(sopId, nip, clientToken) {
  try {
    if (!cekOtorisasi(nip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    autoInitSopSheets(ss);
    
    const sheet = ss.getSheetByName('sop_ack');
    if(!sheet) throw new Error("Tabel sop_ack belum siap.");

    const data = sheet.getDataRange().getDisplayValues();
    for(let i=1; i<data.length; i++) {
        if(String(data[i][1]) === String(sopId) && String(data[i][2]) === String(nip)) {
            return { status: 'success', message: 'Sudah ditandai sebelumnya.' };
        }
    }

    const newId = 'ACK-' + new Date().getTime();
    const now = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');

    sheet.appendRow([newId, sopId, nip, now]);
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Dokumen SOP telah ditandai sebagai dibaca.' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}