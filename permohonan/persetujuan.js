// ==========================================
// FILE: persetujuan.gs
// Deskripsi: Backend Controller untuk Persetujuan Atasan (Aman & Terpusat)
// ==========================================

function updateCutiStatus(id, decision, notes, userNip, bypassMode, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const sheetCuti = ss.getSheetByName('cuti_log');
    const sheetUser = ss.getSheetByName('user_data');
    
    const cutiData = sheetCuti.getDataRange().getValues(); 
    const userData = sheetUser.getDataRange().getDisplayValues(); 
    
    let rowIndex = -1; let logRecord = null;
    for (let i = 1; i < cutiData.length; i++) {
      if (String(cutiData[i][0]) === String(id)) { rowIndex = i + 1; logRecord = cutiData[i]; break; }
    }
    if (rowIndex === -1) throw new Error("Data transaksi cuti tidak ditemukan.");
    
    const nip = String(logRecord[2]); const jenis = String(logRecord[3]);
    const atasan_nip = String(logRecord[9]); const pejabat_nip = String(logRecord[10]);
    let cAtasan = String(logRecord[13]); let cPejabat = String(logRecord[14]); let cFinal = String(logRecord[7]);

    if (cFinal === 'Ditolak' || cFinal === 'DIBATALKAN') throw new Error("Transaksi ini sudah ditutup secara permanen.");
    
    let isAdmin = false; let isOperator = false; let namaPenyetuju = ""; 

    for (let i = 1; i < userData.length; i++) {
      if (String(userData[i][0]) === String(userNip)) { 
          if (String(userData[i][3]) === 'Admin') isAdmin = true;
          if (String(userData[i][3]) === 'Operator') isOperator = true;
          namaPenyetuju = userData[i][1];
          break;
      }
    }
    
    let isAtasan = (String(userNip) === atasan_nip); let isPejabat = (String(userNip) === pejabat_nip);
    let isBypassAtasan = (bypassMode === 'atasan' && (isAdmin || isOperator));
    let isBypassPejabat = (bypassMode === 'pejabat' && (isAdmin || isOperator));

    if (!isAtasan && !isPejabat && !isBypassAtasan && !isBypassPejabat) throw new Error("Akses Ditolak. Anda bukan atasan/pejabat terkait.");
    
    if (cFinal === 'Menunggu Pembatalan') {
       if (!isPejabat && !isBypassPejabat) throw new Error("Hanya Pejabat Berwenang yang dapat memproses Usulan Pembatalan Cuti.");
       
       if (decision === 'Disetujui') {
           const historyStr = String(logRecord[16] || "");
           let h24 = 0, h25 = 0, h26 = 0, hLain = 0;
           if (historyStr) { try { const h = JSON.parse(historyStr); h24 = h.y24 || 0; h25 = h.y25 || 0; h26 = h.y26 || 0; hLain = h.dur || 0; } catch(e) {} }
           
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
           sheetCuti.getRange(rowIndex, 8).setValue('DIBATALKAN');
       } else {
           sheetCuti.getRange(rowIndex, 8).setValue('Disetujui');
       }
       
       let notesLama = String(logRecord[12] || "");
       let finalNotes = notesLama + "\n\n[JAWABAN PEMBATALAN]: " + notes;
       if (isBypassPejabat) finalNotes += " *(via Bypass oleh " + namaPenyetuju + ")*";
       sheetCuti.getRange(rowIndex, 13).setValue(finalNotes);
       
       SpreadsheetApp.flush();
       return { status: 'success', message: `Usulan Pembatalan telah di-${decision.toLowerCase()}.` };
    }

    let updated = false;
    let finalNotes = notes;
    
    if ((isAtasan && isPejabat) || (isBypassAtasan && isBypassPejabat)) {
        if (isBypassAtasan) finalNotes += "\n\n*(Disetujui via Bypass Dual-Role oleh " + namaPenyetuju + ")*";
        
        cAtasan = decision;
        cPejabat = decision;
        sheetCuti.getRange(rowIndex, 9).setValue(finalNotes); 
        sheetCuti.getRange(rowIndex, 14).setValue(decision);  
        sheetCuti.getRange(rowIndex, 13).setValue(finalNotes);
        sheetCuti.getRange(rowIndex, 15).setValue(decision);  
        updated = true;
    } 
    else {
        if (isAtasan || isBypassAtasan) {
            if (cAtasan !== 'Menunggu') throw new Error("Berkas ini sudah diproses di tingkat Atasan.");
            cAtasan = decision; 
            if (isBypassAtasan) finalNotes += "\n\n*(Disetujui via Bypass Atasan oleh " + namaPenyetuju + ")*"; 
            
            sheetCuti.getRange(rowIndex, 9).setValue(finalNotes); 
            sheetCuti.getRange(rowIndex, 14).setValue(decision); 
            updated = true;
        }
        else if (isPejabat || isBypassPejabat) {
            if (cPejabat !== 'Menunggu') throw new Error("Berkas ini sudah diproses di tingkat Pejabat.");
            cPejabat = decision; 
            if (isBypassPejabat) finalNotes += "\n\n*(Disetujui via Bypass Pejabat oleh " + namaPenyetuju + ")*"; 
            
            sheetCuti.getRange(rowIndex, 13).setValue(finalNotes); 
            sheetCuti.getRange(rowIndex, 15).setValue(decision); 
            updated = true;
        }
    }
    
    if (!updated) throw new Error("Tidak ada aksi yang valid.");
    
    let finalStatus = 'Menunggu';
    if (cAtasan === 'Ditolak' || cPejabat === 'Ditolak') finalStatus = 'Ditolak';
    else if (cAtasan === 'Disetujui' && cPejabat === 'Disetujui') finalStatus = 'Disetujui';
    else if (cAtasan === 'Perubahan' || cPejabat === 'Perubahan') finalStatus = 'Perubahan';
    
    sheetCuti.getRange(rowIndex, 8).setValue(finalStatus);
    
    if (finalStatus === 'Ditolak' || finalStatus === 'Perubahan') {
        const historyStr = String(logRecord[16] || "");
        let h24 = 0, h25 = 0, h26 = 0, hLain = 0;
        if (historyStr) { try { const h = JSON.parse(historyStr); h24 = h.y24 || 0; h25 = h.y25 || 0; h26 = h.y26 || 0; hLain = h.dur || 0; } catch(e) {} }
        
        let userRowIndex = -1;
        for (let i = 1; i < userData.length; i++) { if (String(userData[i][0]) === nip) { userRowIndex = i + 1; break; } }
        
        if (userRowIndex !== -1) {
           if (jenis === 'Tahunan') {
              const current24 = Number(sheetUser.getRange(userRowIndex, 7).getValue() || 0); const current25 = Number(sheetUser.getRange(userRowIndex, 8).getValue() || 0); const current26 = Number(sheetUser.getRange(userRowIndex, 9).getValue() || 0);
              sheetUser.getRange(userRowIndex, 7).setValue(current24 + h24); sheetUser.getRange(userRowIndex, 8).setValue(current25 + h25); sheetUser.getRange(userRowIndex, 9).setValue(current26 + h26);
           } else {
              const mapKolom = { 'Sakit': 10, 'Alasan Penting': 11, 'Besar': 12, 'Melahirkan': 13, 'CLTN': 14 };
              const col = mapKolom[jenis];
              if (col) { const currentVal = Number(sheetUser.getRange(userRowIndex, col).getValue() || 0); sheetUser.getRange(userRowIndex, col).setValue(currentVal + hLain); }
           }
        }
    }
    SpreadsheetApp.flush(); 
    return { status: 'success', message: `Berkas berhasil ${decision.toLowerCase()}.` };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function processBulkApproval(bulkItems, decision, notes, userNip, bypassMode, clientToken) {
    try {
        if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };
        
        let successCount = 0;
        let failCount = 0;
        
        for (let i = 0; i < bulkItems.length; i++) {
            let item = bulkItems[i];
            try {
                // Di sini kita sudah siapkan injeksi token untuk fungsi-fungsi IK, IP, WFH (akan diselesaikan di Fase 4B)
                if (item.type === 'Cuti') updateCutiStatus(item.id, decision, notes, userNip, bypassMode, clientToken);
                else if (item.type === 'IK') updateIkStatus(item.id, decision, notes, userNip, bypassMode, clientToken);
                else if (item.type === 'IP') updateIpStatus(item.id, decision, notes, userNip, bypassMode, clientToken);
                else if (item.type === 'WFH') updateWfhStatus(item.id, item.stage, decision, notes, userNip, bypassMode, clientToken);
                successCount++;
            } catch(err) {
                failCount++;
                Logger.log("Bulk Error pada ID " + item.id + ": " + err);
            }
        }
        
        return { 
            status: 'success', 
            message: `Proses persetujuan massal selesai. ${successCount} berkas berhasil diperbarui.` 
        };
    } catch(e) {
        return { status: 'error', message: e.toString() };
    }
}