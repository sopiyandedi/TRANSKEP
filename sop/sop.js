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
  
  if (isCreated) if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
}

// TRANSKEP: Fungsi Pintasan Mengambil URL Root Folder "TRANSKEP SOP"
function getSopDriveFolderUrl(userNip, clientToken) {
  try {
    if (!cekOtorisasiAdmin(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Khusus Admin/Operator.' };
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
    if (!cekOtorisasiAdmin(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Khusus Admin/Operator.' };

    // ========================================================
    // FIX: PROSES AUTO-UPLOAD SOP KE FOLDER "TRANSKEP SOP"
    // ========================================================
    if (payload.fileBase64) {
       try {
           const vSopFile = (typeof validateUploadedFile_ === 'function')
             ? validateUploadedFile_(payload.fileBase64, (payload.judul_sop || 'SOP') + '.pdf', payload.fileMimeType || 'application/pdf', {
                 allowPdf: true,
                 allowImages: false,
                 allowZip: false,
                 maxBytes: 15 * 1024 * 1024
               })
             : { bytes: Utilities.base64Decode(payload.fileBase64), blobMimeType: 'application/pdf', ext: 'pdf' };

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
           
           // 4. Gunakan bytes tervalidasi dan Rename sesuai Judul SOP (Bersihkan karakter ilegal)
           let safeFileName = String(payload.judul_sop).replace(/[\\/:*?"<>|]/g, "_") + "." + vSopFile.ext;
           const blob = Utilities.newBlob(vSopFile.bytes, vSopFile.blobMimeType, safeFileName);
           
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
    // TAHAP 82: Pemutusan penulisan baris ke sheet sop_data.
    // Seluruh data dokumen SOP tersimpan murni di Cloud Firestore (sop_documents).
    return { 
      status: 'success', 
      id: payload.id || ('SOP-' + new Date().getTime()), 
      link_drive: payload.link_drive || '', 
      message: 'Berkas SOP berhasil diproses dan diunggah ke Google Drive.' 
    };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

function deleteSopData(id, userNip, clientToken) {
  try {
    if (!cekOtorisasiAdmin(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Khusus Admin/Operator.' };

    // TAHAP 82: Penghapusan SOP murni dikelola di Cloud Firestore (sop_documents).
    return { status: 'success', message: 'Dokumen SOP berhasil dihapus dari Cloud Firestore.' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

function acknowledgeSop(sopId, nip, clientToken) {
  try {
    if (!cekOtorisasi(nip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    // TAHAP 82: Acknowledgment SOP murni dikelola di Cloud Firestore via arrayUnion.
    return { status: 'success', message: 'Dokumen SOP telah ditandai sebagai dibaca di Cloud Firestore.' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}