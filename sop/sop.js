// ==========================================
// FILE: sop.gs (Backend Controller Khusus SOP)
// ==========================================

// ZETTBOT FIX: Update Header karena penambahan kolom Tanggal Pembuatan & Revisi
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
     ackSheet.getRange("C:C").setNumberFormat('@'); // NIP sbg text
     isCreated = true;
  }
  
  if (isCreated) SpreadsheetApp.flush();
}


function saveSopData(payload) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    
    // Panggil fungsi auto-create sebelum melakukan operasi
    autoInitSopSheets(ss);
    
    const sheet = ss.getSheetByName('sop_data');
    if(!sheet) throw new Error("Gagal menginisialisasi tabel sop_data.");

    const now = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
    
    // Format tiga tanggal
    const tglPembuatan = payload.tanggal_pembuatan; 
    const tglRevisi = payload.tanggal_revisi || '-'; 
    const tglEfektif = payload.tanggal_efektif; 

    // Konversi array object pelaksana menjadi JSON String
    const pelaksanaStr = JSON.stringify(payload.pelaksana || []);

    if (payload.id) {
      // UPDATE DATA (Edit)
      const data = sheet.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][0]) === String(payload.id)) {
          rowIndex = i + 1;
          break;
        }
      }
      
      if (rowIndex !== -1) {
        // ZETTBOT FIX: Update rentang setValues karena jumlah kolom bertambah jadi 8 (mulai dari kolom ke-2 sampai ke-9)
        sheet.getRange(rowIndex, 2, 1, 8).setValues([[
          payload.judul_sop,
          payload.kategori_pj,
          payload.nomor_sop,
          tglPembuatan,
          tglRevisi,
          tglEfektif,
          payload.link_drive,
          pelaksanaStr
        ]]);
        SpreadsheetApp.flush();
        return { status: 'success', message: 'Dokumen SOP berhasil diperbarui.' };
      } else {
        throw new Error("SOP tidak ditemukan di database.");
      }

    } else {
      // INSERT DATA BARU
      const newId = 'SOP-' + new Date().getTime();
      sheet.appendRow([
        newId,
        payload.judul_sop,
        payload.kategori_pj,
        payload.nomor_sop,
        tglPembuatan,
        tglRevisi,
        tglEfektif,
        payload.link_drive,
        pelaksanaStr,
        now
      ]);
      SpreadsheetApp.flush();
      return { status: 'success', message: 'Dokumen SOP baru berhasil ditambahkan.' };
    }
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

function deleteSopData(id) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('sop_data');
    if(!sheet) throw new Error("Tabel sop_data belum siap.");

    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.deleteRow(i + 1);
        
        // Hapus juga riwayat acknowledgment SOP ini
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

function acknowledgeSop(sopId, nip) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    
    // Auto-create just in case
    autoInitSopSheets(ss);
    
    const sheet = ss.getSheetByName('sop_ack');
    if(!sheet) throw new Error("Tabel sop_ack belum siap.");

    // Cek apakah sudah pernah ack sebelumnya
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