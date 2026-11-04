// ==========================================
// FILE: sk.gs (Backend Controller Khusus SK Aman & Terpusat)
// ==========================================

function autoInitSkSheets(ss) {
  let isCreated = false;
  
  let skSheet = ss.getSheetByName('sk_data');
  if (!skSheet) {
     skSheet = ss.insertSheet('sk_data');
     const headers = ['ID_SK', 'Judul_SK', 'No_SK', 'PJ_SK', 'Link_Drive', 'Tugas_SK_JSON', 'Tgl_Input', 'Timestamp', 'NIP_Pegawai'];
     skSheet.appendRow(headers);
     skSheet.getRange("A1:I1").setFontWeight("bold").setBackground("#312e81").setFontColor("#ffffff");
     skSheet.setFrozenRows(1);
     isCreated = true;
  }
  
  let ackSheet = ss.getSheetByName('sk_ack');
  if (!ackSheet) {
     ackSheet = ss.insertSheet('sk_ack');
     const ackHeaders = ['ID_ACK', 'ID_SK', 'NIP_Pegawai', 'Tanggal_Baca'];
     ackSheet.appendRow(ackHeaders);
     ackSheet.getRange("A1:D1").setFontWeight("bold").setBackground("#065f46").setFontColor("#ffffff");
     ackSheet.setFrozenRows(1);
     ackSheet.getRange("C:C").setNumberFormat('@'); 
     isCreated = true;
  }
  
  if (isCreated) if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
  
  return isCreated;
}

// TRANSKEP: Fungsi Pintasan Mengambil URL Root Folder "TRANSKEP SK"
function getSkDriveFolderUrl(userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };
    const rootFolderName = "TRANSKEP SK";
    let rootFolder;
    const rootFolders = DriveApp.getFoldersByName(rootFolderName);
    if (rootFolders.hasNext()) {
      rootFolder = rootFolders.next();
    } else {
      rootFolder = DriveApp.createFolder(rootFolderName);
    }
    return { status: 'success', url: rootFolder.getUrl() };
  } catch (e) {
    return { status: 'error', message: 'Gagal membuka Folder Drive SK: ' + e.toString() };
  }
}

function saveSk(payload, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    // ========================================================
    // FIX: PROSES AUTO-UPLOAD KE FOLDER "TRANSKEP SK"
    // ========================================================
    if (payload.fileBase64) {
       try {
           // 1. Inisialisasi Root Folder Khusus SK
           const rootFolderName = "TRANSKEP SK";
           let rootFolder;
           const rootFolders = DriveApp.getFoldersByName(rootFolderName);
           if (rootFolders.hasNext()) { rootFolder = rootFolders.next(); }
           else { rootFolder = DriveApp.createFolder(rootFolderName); }
           
           // 2. Ekstrak Tahun dari Tanggal SK
           let yearFolderStr = new Date().getFullYear().toString();
           if (payload.tgl_sk) {
               const d = new Date(payload.tgl_sk);
               if (!isNaN(d.getTime())) yearFolderStr = d.getFullYear().toString();
           }
           
           let yearFolder;
           const yearFolders = rootFolder.getFoldersByName(yearFolderStr);
           if (yearFolders.hasNext()) { yearFolder = yearFolders.next(); }
           else { yearFolder = rootFolder.createFolder(yearFolderStr); }
           
           // 3. Masuk ke Folder PJ (Penanggung Jawab)
           const pjFolderStr = payload.pj_sk || "PJ. Manajemen";
           let pjFolder;
           const pjFolders = yearFolder.getFoldersByName(pjFolderStr);
           if (pjFolders.hasNext()) { pjFolder = pjFolders.next(); }
           else { pjFolder = yearFolder.createFolder(pjFolderStr); }
           
           // 4. Decode File dan Rename sesuai Judul SK (Bersihkan karakter ilegal)
           const decodedData = Utilities.base64Decode(payload.fileBase64);
           let safeFileName = String(payload.judul_sk).replace(/[\\/:*?"<>|]/g, "_") + ".pdf";
           const blob = Utilities.newBlob(decodedData, "application/pdf", safeFileName);
           
           // 5. Buat File & Set Izin Public (Agar Flipbook bisa baca)
           const file = pjFolder.createFile(blob);
           file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
           
           // 6. Timpa payload Link Drive dengan URL asli file baru
           payload.link_drive = file.getUrl();
           
       } catch (uploadError) {
           return { status: 'error', message: 'Gagal merakit Folder Google Drive: ' + uploadError.toString() };
       }
    }
    // ========================================================
    // TAHAP 81: Pemutusan penulisan baris ke sheet sk_data.
    // Seluruh data dokumen SK tersimpan murni di Cloud Firestore (sk_documents).
    return { 
      status: 'success', 
      link_drive: payload.link_drive || '', 
      message: 'Berkas SK berhasil diproses dan diunggah ke Google Drive.' 
    };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

function deleteSk(id, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    // TAHAP 81: Penghapusan SK murni dikelola di Cloud Firestore (sk_documents).
    return { status: 'success', message: 'Surat Keputusan berhasil dihapus dari Cloud Firestore.' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

function acknowledgeSk(skId, nip, clientToken) {
  try {
    if (!cekOtorisasi(nip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    // TAHAP 81: Acknowledgment SK murni dikelola di Cloud Firestore via arrayUnion.
    return { status: 'success', message: 'Dokumen SK telah ditandai sebagai dibaca di Cloud Firestore.' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

function fetchSkData(ss) {
  let skList = [];
  try {
    const sheetSk = ss.getSheetByName('sk_data');
    if(sheetSk) {
       const sData = sheetSk.getDataRange().getDisplayValues();
       if(sData.length > 1) {
           for(let i = 1; i < sData.length; i++) {
              let row = sData[i];
              skList.push({
                 id: String(row[0]).trim() || ("SK-ERR-" + i),
                 judul_sk: String(row[1]).trim() || "-",
                 no_sk: String(row[2]).trim() || "-",
                 pj_sk: String(row[3]).trim() || "PJ. Kesekretariatan",
                 link_drive: String(row[4]).trim() || "-",
                 tugas_sk: String(row[5]).trim() || "{}",
                 tgl_input: String(row[6]).trim() || "-",
                 nip: String(row[8]).trim() || "-"
              });
           }
       }
    }
  } catch(e) {}
  return skList;
}

function fetchSkAckData(ss) {
  let ackList = [];
  try {
    const sheetSkAck = ss.getSheetByName('sk_ack');
    if(sheetSkAck) {
       const ackData = sheetSkAck.getDataRange().getDisplayValues();
       for(let i = 1; i < ackData.length; i++) {
          if (ackData[i][0] && String(ackData[i][0]).trim() !== '') {
             ackList.push({
                id: String(ackData[i][0]).replace(/'/g, "").trim(), 
                sk_id: String(ackData[i][1]).replace(/'/g, "").trim(), 
                nip: String(ackData[i][2]).replace(/'/g, "").trim(), 
                tanggal_baca: ackData[i][3]
             });
          }
       }
    }
  } catch(e) {}
  return ackList;
}