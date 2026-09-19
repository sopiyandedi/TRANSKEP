// ==========================================
// FILE: permohonan.gs
// Deskripsi: Backend Controller untuk Cuti & Dinas Luar
// ==========================================

function addCutiLog(payload) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    let sheetCuti = ss.getSheetByName('cuti_log');
    if(!sheetCuti) sheetCuti = ss.insertSheet('cuti_log');
    const sheetUser = ss.getSheetByName('user_data');
    
    let fileUrl = "";
    if (payload.fileData && payload.fileName && payload.fileMimeType) {
        try {
            const folderName = "Bukti Cuti TRANSKEP";
            let folders = DriveApp.getFoldersByName(folderName);
            let folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
            
            const cleanMime = payload.fileName.split('.').pop();
            const generateName = "Bukti_" + payload.jenis + "_" + payload.nip + "_" + new Date().getTime() + "." + cleanMime;
            
            const blob = Utilities.newBlob(Utilities.base64Decode(payload.fileData), payload.fileMimeType, generateName);
            const file = folder.createFile(blob);
            file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
            fileUrl = file.getUrl();
        } catch(e) { Logger.log("Gagal mengunggah file bukti: " + e.toString()); }
    }

    let d1 = new Date(payload.tgl_mulai); let d2 = new Date(payload.tgl_selesai);
    let durasi = 0;
    for (let d = new Date(d1); d <= d2; d.setDate(d.getDate() + 1)) {
        if (d.getDay() !== 0 && d.getDay() !== 6) durasi++;
    }

    const uData = sheetUser.getDataRange().getDisplayValues(); 
    let rowIndex = -1; let namaPegawaiPemohon = "";
    
    for (let i = 1; i < uData.length; i++) {
        if (String(uData[i][0]) === String(payload.nip)) { rowIndex = i + 1; namaPegawaiPemohon = uData[i][1]; break; }
    }
    if (rowIndex === -1) throw new Error("Pegawai tidak ditemukan.");

    let historyJson = { y24:0, y25:0, y26:0, dur: durasi };
    
    // Bypass potong saldo jika ini adalah usulan Dinas Luar
    if (payload.jenis !== 'Dinas Luar') {
        if (payload.jenis === 'Tahunan') {
            let s24 = Number(uData[rowIndex - 1][6]), s25 = Number(uData[rowIndex - 1][7]), s26 = Number(uData[rowIndex - 1][8]);
            let sisaPotong = durasi;
            
            if (s24 >= sisaPotong) { historyJson.y24 = sisaPotong; sheetUser.getRange(rowIndex, 7).setValue(s24 - sisaPotong); sisaPotong = 0; } 
            else { historyJson.y24 = s24; sisaPotong -= s24; sheetUser.getRange(rowIndex, 7).setValue(0); }
            
            if (sisaPotong > 0) {
                if (s25 >= sisaPotong) { historyJson.y25 = sisaPotong; sheetUser.getRange(rowIndex, 8).setValue(s25 - sisaPotong); sisaPotong = 0; } 
                else { historyJson.y25 = s25; sisaPotong -= s25; sheetUser.getRange(rowIndex, 8).setValue(0); }
            }
            if (sisaPotong > 0) {
                if (s26 >= sisaPotong) { historyJson.y26 = sisaPotong; sheetUser.getRange(rowIndex, 9).setValue(s26 - sisaPotong); } 
                else { throw new Error("Saldo cuti tahunan tidak mencukupi."); }
            }
        } else {
            const mapCol = { 'Sakit': 10, 'Alasan Penting': 11, 'Besar': 12, 'Melahirkan': 13, 'CLTN': 14 };
            const col = mapCol[payload.jenis];
            if (col) {
                let sCuti = Number(uData[rowIndex - 1][col - 1]);
                if (sCuti < durasi) throw new Error(`Saldo cuti ${payload.jenis} Anda tidak mencukupi.`);
                sheetUser.getRange(rowIndex, col).setValue(sCuti - durasi);
            }
        }
    }

    const uniquePrefix = payload.jenis === 'Dinas Luar' ? "DL-" : "CUTI-";
    const newId = uniquePrefix + new Date().getTime() + Math.floor(Math.random() * 1000);
    const tglForm = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy');
    
    const statusAwal = payload.jenis === 'Dinas Luar' ? 'Disetujui' : 'Menunggu';
    
    sheetCuti.appendRow([
      newId, tglForm, payload.nip, payload.jenis, payload.tgl_mulai, payload.tgl_selesai, payload.alasan,
      statusAwal, '', payload.atasan_nip || '-', payload.pejabat_nip || '-', durasi, '', statusAwal, statusAwal, payload.alamat || '-', JSON.stringify(historyJson), fileUrl
    ]);
    
    SpreadsheetApp.flush(); 
    return { status: 'success', message: 'Data berhasil disimpan.', data: { id: newId, tgl_pengajuan: tglForm, durasi: durasi, history: JSON.stringify(historyJson), fileUrl: fileUrl, status: statusAwal } };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function deleteCutiLog(id, forceDelete = false) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheetCuti = ss.getSheetByName('cuti_log');
    const sheetUser = ss.getSheetByName('user_data');
    
    const cutiData = sheetCuti.getDataRange().getValues();
    let rowIndex = -1; let logRecord = null;
    for (let i = 1; i < cutiData.length; i++) {
      if (String(cutiData[i][0]) === String(id)) { rowIndex = i + 1; logRecord = cutiData[i]; break; }
    }
    
    if (rowIndex === -1) throw new Error("Data tidak ditemukan.");
    
    if (!forceDelete && logRecord[7] !== 'Menunggu') throw new Error("Hanya status Menunggu yang dapat ditarik otomatis.");
    
    const nip = String(logRecord[2]); const jenis = String(logRecord[3]);
    const statusSekarang = String(logRecord[7]);
    
    // Refund saldo hanya jika status belum Ditolak/Dibatalkan, dan bukan DL
    if (jenis !== 'Dinas Luar' && statusSekarang !== 'Ditolak' && statusSekarang !== 'DIBATALKAN') {
        const historyStr = String(logRecord[16] || "");
        let h24 = 0, h25 = 0, h26 = 0, hLain = 0;
        if (historyStr) { try { const h = JSON.parse(historyStr); h24 = h.y24 || 0; h25 = h.y25 || 0; h26 = h.y26 || 0; hLain = h.dur || 0; } catch(e) {} }
        
        const userData = sheetUser.getDataRange().getValues();
        let userRowIndex = -1;
        for (let i = 1; i < userData.length; i++) { if (String(userData[i][0]) === nip) { userRowIndex = i + 1; break; } }
        
        if (userRowIndex !== -1) {
           if (jenis === 'Tahunan') {
              const c24 = Number(sheetUser.getRange(userRowIndex, 7).getValue() || 0); const c25 = Number(sheetUser.getRange(userRowIndex, 8).getValue() || 0); const c26 = Number(sheetUser.getRange(userRowIndex, 9).getValue() || 0);
              sheetUser.getRange(userRowIndex, 7).setValue(c24 + h24); sheetUser.getRange(userRowIndex, 8).setValue(c25 + h25); sheetUser.getRange(userRowIndex, 9).setValue(c26 + h26);
           } else {
              const mapKolom = { 'Sakit': 10, 'Alasan Penting': 11, 'Besar': 12, 'Melahirkan': 13, 'CLTN': 14 };
              const col = mapKolom[jenis];
              if (col) { const cVal = Number(sheetUser.getRange(userRowIndex, col).getValue() || 0); sheetUser.getRange(userRowIndex, col).setValue(cVal + hLain); }
           }
        }
    }
    
    // ZETTBOT FIX: Soft Delete untuk eksekusi dari menu Rekapitulasi (Admin)
    let finalMessage = "";
    if (forceDelete) {
        sheetCuti.getRange(rowIndex, 8).setValue('DIBATALKAN');
        sheetCuti.getRange(rowIndex, 14).setValue('DIBATALKAN');
        sheetCuti.getRange(rowIndex, 15).setValue('DIBATALKAN');
        finalMessage = 'Status cuti telah diubah menjadi DIBATALKAN dan saldo telah dikembalikan.';
    } else {
        sheetCuti.deleteRow(rowIndex);
        finalMessage = 'Transaksi berhasil ditarik dan dihapus sepenuhnya dari sistem.';
    }
    
    SpreadsheetApp.flush();
    return { status: 'success', message: finalMessage };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function requestCancelCuti(id, alasanBatal) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheetCuti = ss.getSheetByName('cuti_log');
    
    const cutiData = sheetCuti.getDataRange().getValues();
    let rowIndex = -1; let logRecord = null;
    for (let i = 1; i < cutiData.length; i++) {
      if (String(cutiData[i][0]) === String(id)) { rowIndex = i + 1; logRecord = cutiData[i]; break; }
    }
    
    if (rowIndex === -1) throw new Error("Data transaksi cuti tidak ditemukan.");
    if (logRecord[7] !== 'Disetujui') throw new Error("Cuti belum berstatus disetujui penuh.");
    
    const alasanBaru = logRecord[6] + "\n\n[USULAN PEMBATALAN]: " + alasanBatal;
    
    sheetCuti.getRange(rowIndex, 7).setValue(alasanBaru); 
    sheetCuti.getRange(rowIndex, 8).setValue('Menunggu Pembatalan');
    
    SpreadsheetApp.flush();
    return { status: 'success' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function submitDinasLuarBulk(payloadData) {
    try {
        let results = [];
        for(let i=0; i<payloadData.nips.length; i++){
            let reqPayload = {
                nip: payloadData.nips[i],
                jenis: 'Dinas Luar',
                tgl_mulai: payloadData.tgl_mulai,
                tgl_selesai: payloadData.tgl_selesai,
                alasan: payloadData.tujuan,
                alamat: payloadData.tujuan,
                atasan_nip: '',
                pejabat_nip: '',
                fileData: null, fileName: null, fileMimeType: null
            };
            let res = addCutiLog(reqPayload);
            if(res.status === 'success') {
                results.push({nip: payloadData.nips[i], data: res.data});
            }
        }
        return {status: 'success', message: 'Data Dinas Luar berhasil disimpan.', results: results};
    } catch (err) {
        return {status: 'error', message: err.toString()};
    }
}