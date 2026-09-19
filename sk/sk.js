// ==========================================
// FILE: sk.gs (Backend Controller Khusus SK)
// ==========================================

function autoInitSkSheets(ss) {
  let isCreated = false;
  
  let skSheet = ss.getSheetByName('sk_data');
  if (!skSheet) {
     skSheet = ss.insertSheet('sk_data');
     // ZETTBOT FIX: 9 Header Kolom Baru sesuai permintaan
     const headers = ['ID_SK', 'Judul_SK', 'No_SK', 'PJ_SK', 'Link_Drive', 'Tugas_SK_JSON', 'Tgl_Input', 'Timestamp', 'NIP_Pegawai'];
     skSheet.appendRow(headers);
     skSheet.getRange("A1:I1").setFontWeight("bold").setBackground("#312e81").setFontColor("#ffffff");
     skSheet.setFrozenRows(1);
     isCreated = true;
  }
  
  // ZETTBOT FIX: Memasukkan kembali blok ackSheet ke dalam fungsi agar tidak error 'ss is not defined'
  let ackSheet = ss.getSheetByName('sk_ack');
  if (!ackSheet) {
     ackSheet = ss.insertSheet('sk_ack');
     const ackHeaders = ['ID_ACK', 'ID_SK', 'NIP_Pegawai', 'Tanggal_Baca'];
     ackSheet.appendRow(ackHeaders);
     ackSheet.getRange("A1:D1").setFontWeight("bold").setBackground("#065f46").setFontColor("#ffffff");
     ackSheet.setFrozenRows(1);
     ackSheet.getRange("C:C").setNumberFormat('@'); // Mengamankan format teks NIP
     isCreated = true;
  }
  
  if (isCreated) SpreadsheetApp.flush();
  
  return isCreated;
}

// ZETTBOT FIX: Fungsi saveSk yang dipaksa selaras dengan 9 Kolom Database
function saveSk(payload) {
  try {
    let ss;
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch(e) {}
    if(!ss) ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    
    let sheet = ss.getSheetByName('sk_data');
    if (!sheet) {
        autoInitSkSheets(ss);
        sheet = ss.getSheetByName('sk_data');
    }

    const isNew = !payload.id;
    const baseId = isNew ? "SK-" + new Date().getTime() : payload.id;
    const tglInput = isNew ? Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy') : payload.tgl_input;
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');

    if (!isNew) {
       const data = sheet.getDataRange().getValues();
       for (let i = data.length - 1; i >= 1; i--) {
          const rowId = String(data[i][0]).split('-').slice(0, 2).join('-');
          if (rowId === baseId) sheet.deleteRow(i + 1);
       }
    }

    const rowsToInsert = [];
    payload.members.forEach((m, index) => {
        const uniqueId = baseId + "-" + (index + 1); 
        const tugasSkJson = JSON.stringify({
           no_sk: payload.no_sk,
           tgl_sk: payload.tgl_sk,
           pj: payload.pj_sk,
           peran: m.peran
        });

        // URUTAN WAJIB SESUAI HEADER BARU (9 Kolom): 
        // 0:ID_SK, 1:Judul_SK, 2:No_SK, 3:PJ_SK, 4:Link_Drive, 5:Tugas_SK_JSON, 6:Tgl_Input, 7:Timestamp, 8:NIP_Pegawai
        rowsToInsert.push([
           uniqueId, payload.judul_sk, payload.no_sk, payload.pj_sk, payload.link_drive, 
           tugasSkJson, tglInput, timestamp, m.nip
        ]);
    });

    if (rowsToInsert.length > 0) {
        sheet.getRange(sheet.getLastRow() + 1, 1, rowsToInsert.length, rowsToInsert[0].length).setValues(rowsToInsert);
    }

    SpreadsheetApp.flush();
    return { status: 'success', message: 'Dokumen SK berhasil disimpan dengan sempurna!' };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

function deleteSk(id) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('sk_data');
    if(!sheet) throw new Error("Tabel sk_data tidak ditemukan.");

    const data = sheet.getDataRange().getValues();
    const targetBaseId = String(id).split('-').slice(0, 2).join('-');

    for (let i = data.length - 1; i >= 1; i--) {
      const rowId = String(data[i][0]);
      if (rowId === String(id) || rowId === targetBaseId || rowId.startsWith(targetBaseId + '-')) {
        sheet.deleteRow(i + 1);
      }
    }

    const ackSheet = ss.getSheetByName('sk_ack');
    if(ackSheet) {
       const ackData = ackSheet.getDataRange().getValues();
       for (let j = ackData.length - 1; j >= 1; j--) {
          const ackId = String(ackData[j][1]);
          if (ackId === String(id) || ackId === targetBaseId || ackId.startsWith(targetBaseId + '-')) {
             ackSheet.deleteRow(j + 1);
          }
       }
    }

    SpreadsheetApp.flush();
    return { status: 'success', message: 'Surat Keputusan berhasil dihapus secara keseluruhan.' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}

function acknowledgeSk(skId, nip) {
  try {
    // ZETTBOT FIX: Direct Connection & Bypass Init untuk performa instan
    let ss;
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch(e) {}
    if(!ss) ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    
    let sheet = ss.getSheetByName('sk_ack');
    if(!sheet) {
       autoInitSkSheets(ss);
       sheet = ss.getSheetByName('sk_ack');
    }

    const data = sheet.getDataRange().getDisplayValues();
    for(let i=1; i<data.length; i++) {
        // Cek agar tidak double ack
        if(String(data[i][1]).trim() === String(skId).trim() && String(data[i][2]).trim() === String(nip).trim()) {
            return { status: 'success', message: 'Sudah ditandai sebelumnya.' };
        }
    }

    const newId = 'ACK-SK-' + new Date().getTime();
    const now = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');

    sheet.appendRow([newId, skId, nip, now]);
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Dokumen SK telah ditandai sebagai dibaca.' };
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}


// ==========================================
// FUNGSI PENARIK DATA KHUSUS SK (Modular)
// ==========================================
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