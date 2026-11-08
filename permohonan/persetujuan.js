// ==========================================
// FILE: persetujuan.gs
// Deskripsi: Backend Controller untuk Persetujuan Atasan (Aman & Terpusat)
// ==========================================

function updateCutiStatus(id, decision, notes, userNip, bypassMode, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    ensureAnnualCutiRollover_(ss);
    const sheetCuti = ss.getSheetByName('cuti_log');
    const sheetUser = ss.getSheetByName('user_data');
    
    const cutiData = readCutiSheetDecrypted_(sheetCuti); 
    const userData = readUserSheetDecrypted_(sheetUser); 
    
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
           let userRowIndex = -1;
           for (let i = 1; i < userData.length; i++) { if (String(userData[i][0]) === nip) { userRowIndex = i + 1; break; } }
           
           if (userRowIndex !== -1) {
              pulihkanSaldoCutiServer_(sheetUser, userRowIndex, jenis, historyStr);
           }
           sheetCuti.getRange(rowIndex, 8).setValue('DIBATALKAN');
       } else {
           sheetCuti.getRange(rowIndex, 8).setValue('Disetujui');
       }
       
       let notesLama = String(logRecord[12] || "");
       let finalNotes = notesLama + "\n\n[JAWABAN PEMBATALAN]: " + notes;
       if (isBypassPejabat) finalNotes += " *(via Bypass oleh " + namaPenyetuju + ")*";
       sheetCuti.getRange(rowIndex, 13).setValue(finalNotes);
       
       if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
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
    
    if (finalStatus === 'Disetujui') {
        // TRIGGER OTOMATIS: Integrasi n8n & MYSIMS Surat Keluar (Non-blocking & Aman)
        try {
            let namaPemohon = "";
            for (let u = 1; u < userData.length; u++) {
                if (String(userData[u][0]) === nip) {
                    namaPemohon = userData[u][1];
                    break;
                }
            }
            triggerN8nSuratKeluarCuti_(id, logRecord, namaPemohon, nip);
        } catch (errN8n) {
            Logger.log("⚠️ [n8n Trigger Cuti] Peringatan trigger webhook (diabaikan): " + errN8n.toString());
        }
    }

    if (finalStatus === 'Ditolak' || finalStatus === 'Perubahan') {
        const historyStr = String(logRecord[16] || "");
        let userRowIndex = -1;
        for (let i = 1; i < userData.length; i++) { if (String(userData[i][0]) === nip) { userRowIndex = i + 1; break; } }
        
        if (userRowIndex !== -1) {
           pulihkanSaldoCutiServer_(sheetUser, userRowIndex, jenis, historyStr);
        }
    }
    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush(); 
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

// ==========================================
// KONTROLER MAGIC LINK PERSETUJUAN CUTI (WAHA BOT) - TRANSKEP v2.1
// ==========================================

function getCutiByToken(token) {
  try {
    if (!token || String(token).trim() === '') {
      return { status: 'error', message: 'Token persetujuan tidak valid.' };
    }
    
    const ss = getDB();
    ensureAnnualCutiRollover_(ss);
    const sheetCuti = ss.getSheetByName('cuti_log');
    const sheetUser = ss.getSheetByName('user_data');
    if (!sheetCuti || !sheetUser) throw new Error("Basis data belum siap.");
    
    const cutiData = readCutiSheetDecrypted_(sheetCuti);
    const userData = readUserSheetDecrypted_(sheetUser);
    
    // Pemetaan user untuk pencarian cepat nama & jabatan
    const userMap = {};
    for (let u = 1; u < userData.length; u++) {
      userMap[String(userData[u][0]).trim()] = {
        nip: String(userData[u][0]).trim(),
        nama: userData[u][1],
        jabatan: userData[u][2],
        no_wa: userData[u][4] || ''
      };
    }
    
    let targetRow = null;
    let rowIndex = -1;
    // Kolom 19 (indeks 18) adalah magic_token
    for (let i = 1; i < cutiData.length; i++) {
      if (String(cutiData[i][18] || '').trim() === String(token).trim()) {
        targetRow = cutiData[i];
        rowIndex = i + 1;
        break;
      }
    }
    
    if (!targetRow) {
      return { status: 'error', message: 'Tautan persetujuan tidak ditemukan atau sudah kedaluwarsa.' };
    }
    
    const pemohon = userMap[String(targetRow[2]).trim()] || { nama: 'Pegawai', jabatan: '-' };
    const atasan = userMap[String(targetRow[9]).trim()] || { nama: 'Atasan Langsung', jabatan: '-' };
    const pejabat = userMap[String(targetRow[10]).trim()] || { nama: 'Pejabat Berwenang', jabatan: '-' };
    
    const statusFinal = targetRow[7];
    const statusAtasan = targetRow[13];
    const statusPejabat = targetRow[14];
    
    let currentStage = 'completed';
    let reviewerTitle = '';
    let reviewerName = '';
    
    if (statusFinal === 'Ditolak' || statusFinal === 'DIBATALKAN') {
      currentStage = 'closed';
    } else if (statusAtasan === 'Menunggu') {
      currentStage = 'atasan';
      reviewerTitle = 'Atasan Langsung';
      reviewerName = atasan.nama;
    } else if (statusAtasan === 'Disetujui' && statusPejabat === 'Menunggu') {
      currentStage = 'pejabat';
      reviewerTitle = 'Pejabat Berwenang';
      reviewerName = pejabat.nama;
    } else if (statusFinal === 'Disetujui') {
      currentStage = 'finished';
    }
    
    return {
      status: 'success',
      data: {
        id: targetRow[0],
        tgl_pengajuan: targetRow[1],
        nip: targetRow[2],
        nama: pemohon.nama,
        jabatan: pemohon.jabatan,
        jenis: targetRow[3],
        tgl_mulai: targetRow[4],
        tgl_selesai: targetRow[5],
        durasi: targetRow[11],
        alasan: targetRow[6],
        alamat: targetRow[15] || '-',
        fileUrl: targetRow[17] || '',
        status: statusFinal,
        status_atasan: statusAtasan,
        status_pejabat: statusPejabat,
        current_stage: currentStage,
        reviewer_title: reviewerTitle,
        reviewer_name: reviewerName
      }
    };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function processMagicLinkApproval(token, decision, notes) {
  try {
    if (!token) return { status: 'error', message: 'Token tidak valid.' };
    if (decision !== 'Disetujui' && decision !== 'Ditolak') {
      return { status: 'error', message: 'Keputusan tidak valid.' };
    }
    
    const ss = getDB();
    ensureAnnualCutiRollover_(ss);
    const sheetCuti = ss.getSheetByName('cuti_log');
    const sheetUser = ss.getSheetByName('user_data');
    if (!sheetCuti || !sheetUser) throw new Error("Basis data belum siap.");
    
    const cutiData = readCutiSheetDecrypted_(sheetCuti);
    const userData = readUserSheetDecrypted_(sheetUser);
    
    const userMap = {};
    for (let u = 1; u < userData.length; u++) {
      userMap[String(userData[u][0]).trim()] = {
        row: u + 1,
        nip: String(userData[u][0]).trim(),
        nama: userData[u][1],
        jabatan: userData[u][2],
        no_wa: userData[u][4] || '',
        s24: Number(userData[u][6]) || 0,
        s25: Number(userData[u][7]) || 0,
        s26: Number(userData[u][8]) || 0
      };
    }
    
    let rowIndex = -1;
    let targetRow = null;
    for (let i = 1; i < cutiData.length; i++) {
      if (String(cutiData[i][18] || '').trim() === String(token).trim()) {
        rowIndex = i + 1;
        targetRow = cutiData[i];
        break;
      }
    }
    
    if (rowIndex === -1) throw new Error("Berkas cuti tidak ditemukan.");
    
    const pemohonNip = String(targetRow[2]).trim();
    const pemohon = userMap[pemohonNip] || { nama: 'Pegawai', no_wa: '' };
    const atasanNip = String(targetRow[9]).trim();
    const atasan = userMap[atasanNip] || { nama: 'Atasan Langsung', no_wa: '' };
    const pejabatNip = String(targetRow[10]).trim();
    const pejabat = userMap[pejabatNip] || { nama: 'Pejabat Berwenang', no_wa: '' };
    
    const statusFinal = targetRow[7];
    const statusAtasan = targetRow[13];
    const statusPejabat = targetRow[14];
    const durasi = targetRow[11];
    const jenisCuti = targetRow[3];
    const periode = targetRow[4] + " s.d " + targetRow[5];
    
    if (statusFinal === 'Ditolak' || statusFinal === 'DIBATALKAN') {
      throw new Error("Berkas cuti ini sudah berstatus ditolak/dibatalkan.");
    }
    if (statusFinal === 'Disetujui') {
      throw new Error("Berkas cuti ini sudah selesai disetujui sebelumnya.");
    }
    
    let catatanBersih = (notes || '').trim();
    
    // TAHAP 1: ATASAN LANGSUNG MEMPROSES
    if (statusAtasan === 'Menunggu') {
      sheetCuti.getRange(rowIndex, 14).setValue(decision); // status_atasan (col 14)
      if (catatanBersih) sheetCuti.getRange(rowIndex, 9).setValue(catatanBersih); // catatan atasan (col 9)
      
      if (decision === 'Disetujui') {
        if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
        
        // Teruskan Magic Link ke Pejabat Berwenang via WAHA
        if (pejabat.no_wa && pejabat.no_wa.length > 8) {
          const magicLink = "https://sso.pa-indramayu.go.id/?action=review_cuti&token=" + token;
          const msgPejabat = "*TRANSKEP - PERSETUJUAN CUTI TINGKAT AKHIR* 🏛️\n\n" +
            "Yth. Bapak/Ibu *" + pejabat.nama + "* (Pejabat Berwenang),\n\n" +
            "Permohonan cuti pegawai telah *DISETUJUI* oleh Atasan Langsung (" + atasan.nama + ") dan kini menunggu persetujuan akhir Anda:\n\n" +
            "👤 *Pemohon:* " + pemohon.nama + "\n" +
            "🆔 *NIP:* " + pemohonNip + "\n" +
            "🏷️ *Jenis:* Cuti " + jenisCuti + "\n" +
            "📅 *Periode:* " + periode + " (" + durasi + " hari kerja)\n" +
            "📝 *Alasan:* " + targetRow[6] + "\n\n" +
            "Silakan klik tautan di bawah ini untuk melihat detail dan memberikan persetujuan langsung (tanpa login):\n" +
            "👉 " + magicLink;
            
          sendWhatsAppMessage_(pejabat.no_wa, msgPejabat, {
            jenis_pesan: 'cuti_usulan',
            nama_tujuan: pejabat.nama,
            nama_pemohon: pemohon.nama,
            nip: pemohonNip,
            jenis_cuti: jenisCuti,
            periode: periode,
            durasi: durasi,
            alasan: targetRow[6] || '-',
            magic_link: magicLink
          });
        }
        
        return { 
          status: 'success', 
          message: 'Persetujuan Atasan Langsung berhasil disimpan. Notifikasi telah otomatis diteruskan ke Pejabat Berwenang.' 
        };
      } else {
        // Atasan menolak
        sheetCuti.getRange(rowIndex, 8).setValue('Ditolak');
        
        // Kembalikan saldo cuti
        refundCutiSaldo_(sheetUser, pemohonNip, jenisCuti, targetRow[16]);
        if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
        
        // Kirim notifikasi penolakan ke pemohon
        if (pemohon.no_wa && pemohon.no_wa.length > 8) {
          const msgReject = "*TRANSKEP - STATUS USULAN CUTI* ⚠️\n\n" +
            "Halo *" + pemohon.nama + "*,\n\n" +
            "Pengajuan cuti " + jenisCuti + " Anda untuk periode *" + periode + "* tidak dapat disetujui oleh Atasan Langsung (" + atasan.nama + ").\n\n" +
            "📝 *Alasan Penolakan:* " + (catatanBersih || 'Tidak ada catatan khusus.') + "\n\n" +
            "🔗 *Link Portal:* https://sso.pa-indramayu.go.id/";

          sendWhatsAppMessage_(pemohon.no_wa, msgReject, {
            jenis_pesan: 'cuti_keputusan',
            nama_pemohon: pemohon.nama,
            periode: periode,
            status: 'Ditolak Atasan Langsung',
            oleh: atasan.nama,
            catatan: catatanBersih || 'Tidak ada catatan khusus.'
          });
        }
        
        return { 
          status: 'success', 
          message: 'Permohonan cuti telah ditolak. Saldo pegawai telah dipulihkan dan notifikasi telah dikirimkan ke pemohon.' 
        };
      }
    }
    
    // TAHAP 2: PEJABAT BERWENANG MEMPROSES
    else if (statusAtasan === 'Disetujui' && statusPejabat === 'Menunggu') {
      sheetCuti.getRange(rowIndex, 15).setValue(decision); // status_pejabat (col 15)
      if (catatanBersih) sheetCuti.getRange(rowIndex, 13).setValue(catatanBersih); // catatan pejabat (col 13)
      
      if (decision === 'Disetujui') {
        sheetCuti.getRange(rowIndex, 8).setValue('Disetujui'); // Final status
        if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
        
        // Pemicu Otomatis Webhook n8n untuk Surat Keluar MYSIMS (Non-Blocking & Aman)
        try {
          triggerN8nSuratKeluarCuti_(targetRow[0], targetRow, pemohon.nama, pemohonNip);
        } catch (errN8n) {
          Logger.log("⚠️ [n8n Trigger MagicLink] Peringatan: " + errN8n.toString());
        }

        // Kirim konfirmasi persetujuan resmi ke pemohon
        if (pemohon.no_wa && pemohon.no_wa.length > 8) {
          const msgAcc = "*TRANSKEP - CUTI TELAH RESMI DISETUJUI* 🎉\n\n" +
            "Selamat *" + pemohon.nama + "*,\n\n" +
            "Pengajuan Cuti " + jenisCuti + " Anda telah *RESMI DISETUJUI* oleh Pejabat Berwenang (" + pejabat.nama + "):\n\n" +
            "📅 *Periode:* " + periode + " (" + durasi + " hari kerja)\n" +
            "📄 *ID Transaksi:* " + targetRow[0] + "\n\n" +
            "Silakan unduh atau cetak surat permohonan cuti Anda melalui portal TRANSKEP:\n" +
            "👉 https://sso.pa-indramayu.go.id/";

          sendWhatsAppMessage_(pemohon.no_wa, msgAcc, {
            jenis_pesan: 'cuti_keputusan',
            nama_pemohon: pemohon.nama,
            periode: periode,
            status: 'Resmi Disetujui',
            oleh: pejabat.nama,
            catatan: 'Disetujui oleh Pejabat Berwenang'
          });
        }
        
        return { 
          status: 'success', 
          message: 'Persetujuan akhir Pejabat Berwenang berhasil disimpan. Status cuti resmi Disetujui dan notifikasi telah dikirimkan ke pegawai pemohon.' 
        };
      } else {
        // Pejabat menolak
        sheetCuti.getRange(rowIndex, 8).setValue('Ditolak');
        refundCutiSaldo_(sheetUser, pemohonNip, jenisCuti, targetRow[16]);
        if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
        
        if (pemohon.no_wa && pemohon.no_wa.length > 8) {
          const msgReject = "*TRANSKEP - STATUS USULAN CUTI* ⚠️\n\n" +
            "Halo *" + pemohon.nama + "*,\n\n" +
            "Pengajuan cuti " + jenisCuti + " Anda untuk periode *" + periode + "* tidak disetujui oleh Pejabat Berwenang (" + pejabat.nama + ").\n\n" +
            "📝 *Catatan:* " + (catatanBersih || 'Tidak ada catatan khusus.') + "\n\n" +
            "🔗 *Link Portal:* https://sso.pa-indramayu.go.id/";

          sendWhatsAppMessage_(pemohon.no_wa, msgReject, {
            jenis_pesan: 'cuti_keputusan',
            nama_pemohon: pemohon.nama,
            periode: periode,
            status: 'Ditolak Pejabat Berwenang',
            oleh: pejabat.nama,
            catatan: catatanBersih || 'Tidak ada catatan khusus.'
          });
        }
        
        return { 
          status: 'success', 
          message: 'Permohonan cuti telah ditolak oleh Pejabat Berwenang. Saldo pegawai telah dipulihkan dan notifikasi telah dikirimkan ke pemohon.' 
        };
      }
    }
    
    throw new Error("Tahapan persetujuan ini sudah selesai.");
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

// Fungsi Internal Pengembalian Saldo Cuti (DRY - Terpusat ke pulihkanSaldoCutiServer_)
function refundCutiSaldo_(sheetUser, nip, jenis, historyStr) {
  try {
    const userData = readUserSheetDecrypted_(sheetUser);
    let userRowIndex = -1;
    for (let i = 1; i < userData.length; i++) {
      if (String(userData[i][0]).trim() === String(nip).trim()) {
        userRowIndex = i + 1;
        break;
      }
    }
    if (userRowIndex === -1) return;
    pulihkanSaldoCutiServer_(sheetUser, userRowIndex, jenis, historyStr);
  } catch (e) {
    Logger.log("Gagal memulihkan saldo cuti: " + e.toString());
  }
}

// Tombol Kirim Ulang WA Cuti (Khusus Admin & Operator)
function resendCutiWhatsApp(cutiId, adminNip, clientToken) {
  try {
    if (!cekOtorisasi(adminNip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Sesi Anda tidak valid.' };
    }
    
    const ss = getDB();
    ensureAnnualCutiRollover_(ss);
    const sheetCuti = ss.getSheetByName('cuti_log');
    const sheetUser = ss.getSheetByName('user_data');
    if (!sheetCuti || !sheetUser) throw new Error("Basis data belum siap.");
    
    // Validasi Hak Akses Admin atau Operator
    const userData = readUserSheetDecrypted_(sheetUser);
    let isAuthorized = false;
    for (let u = 1; u < userData.length; u++) {
      if (String(userData[u][0]).trim() === String(adminNip).trim()) {
        const role = String(userData[u][3]).toLowerCase();
        if (role === 'admin' || role === 'operator') isAuthorized = true;
        break;
      }
    }
    if (!isAuthorized) {
      return { status: 'error', message: 'Akses Ditolak: Fitur kirim ulang WA hanya untuk Admin dan Operator.' };
    }
    
    const cutiData = readCutiSheetDecrypted_(sheetCuti);
    let rowIndex = -1;
    let targetRow = null;
    for (let i = 1; i < cutiData.length; i++) {
      if (String(cutiData[i][0]).trim() === String(cutiId).trim()) {
        rowIndex = i + 1;
        targetRow = cutiData[i];
        break;
      }
    }
    
    if (rowIndex === -1) throw new Error("Data transaksi cuti tidak ditemukan.");
    
    let magicToken = String(targetRow[18] || '').trim();
    if (!magicToken) {
      magicToken = Utilities.getUuid();
      sheetCuti.getRange(rowIndex, 19).setValue(magicToken);
      if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    }
    
    const statusAtasan = targetRow[13];
    const statusPejabat = targetRow[14];
    const statusFinal = targetRow[7];
    
    if (statusFinal === 'Disetujui' || statusFinal === 'Ditolak' || statusFinal === 'DIBATALKAN') {
      return { status: 'error', message: `Berkas cuti ini sudah selesai diproses (Status: ${statusFinal}).` };
    }
    
    const userMap = {};
    for (let u = 1; u < userData.length; u++) {
      userMap[String(userData[u][0]).trim()] = {
        nama: userData[u][1],
        no_wa: userData[u][4] || ''
      };
    }
    
    const pemohon = userMap[String(targetRow[2]).trim()] || { nama: 'Pegawai' };
    const magicLink = "https://sso.pa-indramayu.go.id/?action=review_cuti&token=" + magicToken;
    const periode = targetRow[4] + " s.d " + targetRow[5];
    
    // Jika menunggu persetujuan Atasan Langsung
    if (statusAtasan === 'Menunggu') {
      const atasan = userMap[String(targetRow[9]).trim()];
      if (!atasan || !atasan.no_wa || atasan.no_wa.length < 9) {
        return { status: 'error', message: 'Nomor WhatsApp Atasan Langsung tidak terdaftar di sistem.' };
      }
      
      const msgWa = "*TRANSKEP - USULAN CUTI PEGAWAI* 📋\n\n" +
        "Yth. Bapak/Ibu *" + atasan.nama + "* (Atasan Langsung),\n\n" +
        "Pengingat pengajuan cuti staf Anda yang memerlukan persetujuan:\n\n" +
        "👤 *Pemohon:* " + pemohon.nama + "\n" +
        "🆔 *NIP:* " + targetRow[2] + "\n" +
        "🏷️ *Jenis:* Cuti " + targetRow[3] + "\n" +
        "📅 *Periode:* " + periode + " (" + targetRow[11] + " hari kerja)\n" +
        "📝 *Alasan:* " + targetRow[6] + "\n\n" +
        "Silakan klik tautan di bawah ini untuk melihat detail dan memberikan persetujuan langsung (tanpa login):\n" +
        "👉 " + magicLink;
        
      const res = sendWhatsAppMessage_(atasan.no_wa, msgWa, {
        jenis_pesan: 'cuti_usulan',
        nama_tujuan: atasan.nama,
        nama_pemohon: pemohon.nama,
        nip: targetRow[2],
        jenis_cuti: targetRow[3],
        periode: periode,
        durasi: targetRow[11],
        alasan: targetRow[6] || '-',
        magic_link: magicLink
      });
      if (res && res.status === 'success') {
        return { status: 'success', message: 'Notifikasi WhatsApp berhasil dikirim ulang ke Atasan Langsung (' + atasan.nama + ').' };
      } else {
        return { status: 'error', message: 'Gagal mengirim ke WAHA Docker: ' + (res ? res.message : 'Koneksi terputus.') };
      }
    }
    // Jika Atasan sudah setuju dan sedang menunggu Pejabat Berwenang
    else if (statusAtasan === 'Disetujui' && statusPejabat === 'Menunggu') {
      const pejabat = userMap[String(targetRow[10]).trim()];
      if (!pejabat || !pejabat.no_wa || pejabat.no_wa.length < 9) {
        return { status: 'error', message: 'Nomor WhatsApp Pejabat Berwenang tidak terdaftar di sistem.' };
      }
      
      const msgWa = "*TRANSKEP - PERSETUJUAN CUTI TINGKAT AKHIR* 🏛️\n\n" +
        "Yth. Bapak/Ibu *" + pejabat.nama + "* (Pejabat Berwenang),\n\n" +
        "Pengingat usulan cuti yang telah disetujui Atasan dan menunggu persetujuan akhir Anda:\n\n" +
        "👤 *Pemohon:* " + pemohon.nama + "\n" +
        "🆔 *NIP:* " + targetRow[2] + "\n" +
        "🏷️ *Jenis:* Cuti " + targetRow[3] + "\n" +
        "📅 *Periode:* " + periode + " (" + targetRow[11] + " hari kerja)\n" +
        "📝 *Alasan:* " + targetRow[6] + "\n\n" +
        "Silakan klik tautan di bawah ini untuk melihat detail dan memberikan persetujuan langsung (tanpa login):\n" +
        "👉 " + magicLink;
        
      const res = sendWhatsAppMessage_(pejabat.no_wa, msgWa, {
        jenis_pesan: 'cuti_usulan',
        nama_tujuan: pejabat.nama,
        nama_pemohon: pemohon.nama,
        nip: targetRow[2],
        jenis_cuti: targetRow[3],
        periode: periode,
        durasi: targetRow[11],
        alasan: targetRow[6] || '-',
        magic_link: magicLink
      });
      if (res && res.status === 'success') {
        return { status: 'success', message: 'Notifikasi WhatsApp berhasil dikirim ulang ke Pejabat Berwenang (' + pejabat.nama + ').' };
      } else {
        return { status: 'error', message: 'Gagal mengirim ke WAHA Docker: ' + (res ? res.message : 'Koneksi terputus.') };
      }
    } else {
      return { status: 'info', message: 'Berkas cuti saat ini tidak dalam status menunggu persetujuan.' };
    }
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

/**
 * Helper Batch Fetch QR Code menjadi Data URI PNG Base64 untuk Engine PDF Server GAS
 */
function fetchQrBatchDataUrisServer_(urls) {
  const results = urls.slice();
  try {
    const requests = urls.map(function(u) {
      return { url: u, method: 'get', muteHttpExceptions: true };
    });
    const responses = UrlFetchApp.fetchAll(requests);
    for (let i = 0; i < responses.length; i++) {
      if (responses[i] && responses[i].getResponseCode() === 200) {
        const b64 = Utilities.base64Encode(responses[i].getContent());
        if (b64 && b64.length > 50) {
          results[i] = 'data:image/png;base64,' + b64;
        }
      }
    }
  } catch (e) {
    Logger.log("⚠️ [fetchQrBatchDataUrisServer_] Fallback ke URL langsung: " + e.toString());
  }
  return results;
}

function escapeHtmlServer_(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Menghasilkan PDF Formulir Permintaan dan Pemberian Cuti di Server GAS (Opsi A - 2-Stage Gold Standard)
 * Menggunakan layout tabel A4 1 halaman presisi, melengkapi Nomor Surat Resmi MYSIMS, TTE QR Inline PNG,
 * dan mengonversi ke PDF Blob Base64 siap suntik ke MYSIMS.
 */
function generateCutiPdfBase64Server_(id, logRecord, namaPemohon, nip, nomorSuratOverride) {
  try {
    const ss = getDB();
    const sheetUser = ss.getSheetByName('user_data');
    if (!sheetUser) throw new Error("Sheet user_data tidak ditemukan.");

    const uData = readUserSheetDecrypted_(sheetUser);
    const uHeaders = (uData && uData.length > 0) ? uData[0].map(function(h) { return String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''); }) : [];
    const findColIdx = function(name, fallback) {
      const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const idx = uHeaders.indexOf(clean);
      return idx !== -1 ? idx : fallback;
    };

    const colNip = findColIdx('NIP', 0);
    const colNama = findColIdx('Nama', 1);
    const colJab = findColIdx('Jabatan', 2);
    const colHp = findColIdx('No_HP', 4);
    const colAlamat = findColIdx('Alamat', 15);

    const userMap = {};
    for (let i = 1; i < uData.length; i++) {
      const uNip = String(uData[i][colNip] || '').replace(/^'+/, '').trim();
      if (!uNip) continue;
      userMap[uNip] = {
        nip: uNip,
        nama: uData[i][colNama] || '',
        jabatan: uData[i][colJab] || '',
        no_hp: uData[i][colHp] || '-',
        alamat: uData[i][colAlamat] || '-',
        s_tahunan_2024: Number(uData[i][6]) || 0,
        s_tahunan_2025: Number(uData[i][7]) || 0,
        s_tahunan_2026: Number(uData[i][8]) || 0,
        s_sakit: Number(uData[i][9]) || 0,
        s_penting: Number(uData[i][10]) || 0,
        s_besar: Number(uData[i][11]) || 0,
        s_melahirkan: Number(uData[i][12]) || 0,
        s_cltn: Number(uData[i][13]) || 0
      };
    }

    const pemohonNip = String(nip || logRecord[2] || '').replace(/^'+/, '').trim();
    const atasanNip = String(logRecord[9] || '').replace(/^'+/, '').trim();
    const pejabatNip = String(logRecord[10] || '').replace(/^'+/, '').trim();

    const pns = userMap[pemohonNip] || { nama: namaPemohon || 'Pegawai', nip: pemohonNip, jabatan: '-', no_hp: '-' };
    const atasan = userMap[atasanNip] || { nama: 'Atasan Langsung', nip: atasanNip, jabatan: 'Atasan Langsung' };
    const pejabat = userMap[pejabatNip] || { nama: 'Ketua', nip: pejabatNip, jabatan: 'Ketua' };

    const jenisCuti = String(logRecord[3] || 'Tahunan');
    let cTahunan = "", cBesar = "", cSakit = "", cMelahirkan = "", cPenting = "", cCltn = "";
    if (jenisCuti === 'Tahunan') cTahunan = "&#10003;";
    else if (jenisCuti === 'Besar') cBesar = "&#10003;";
    else if (jenisCuti === 'Sakit') cSakit = "&#10003;";
    else if (jenisCuti === 'Melahirkan') cMelahirkan = "&#10003;";
    else if (jenisCuti === 'Alasan Penting' || jenisCuti === 'Penting') cPenting = "&#10003;";
    else if (jenisCuti === 'CLTN') cCltn = "&#10003;";

    const cAtasanSetuju = "&#10003;", cAtasanUbah = "", cAtasanTangguh = "", cAtasanTolak = "";
    const cPejabatSetuju = "&#10003;", cPejabatUbah = "", cPejabatTangguh = "", cPejabatTolak = "";

    let hist = {};
    if (logRecord[16]) {
      try { hist = typeof logRecord[16] === 'string' ? JSON.parse(logRecord[16]) : logRecord[16]; } catch (e) { hist = {}; }
    }

    let leaveYear = Number(hist.year_n) || 0;
    if (!leaveYear && logRecord[4]) {
      const pMulai = String(logRecord[4]).trim().split(/[-/]/);
      if (pMulai.length === 3) {
        const cand = pMulai[0].length === 4 ? parseInt(pMulai[0], 10) : parseInt(pMulai[2], 10);
        if (cand >= 2020 && cand <= 2100) leaveYear = cand;
      }
    }
    if (!leaveYear) leaveYear = new Date().getFullYear();

    const hY24 = (jenisCuti === 'Tahunan') ? Number(hist.y24 || 0) : 0;
    const hY25 = (jenisCuti === 'Tahunan') ? Number(hist.y25 || 0) : 0;
    const hY26 = (jenisCuti === 'Tahunan') ? Number(hist.y26 || 0) : 0;
    const hHangusN2 = (jenisCuti === 'Tahunan') ? Number(hist.hangus_n2 || 0) : 0;
    const hHangusBesar = (jenisCuti === 'Besar') ? Number(hist.hangus_n_besar || 0) : 0;

    let sisaAw24, sisaAw25, sisaAw26, sisaAk24, sisaAk25, sisaAk26;
    if (Array.isArray(hist.snap_awal) && hist.snap_awal.length === 3 && Array.isArray(hist.snap_akhir) && hist.snap_akhir.length === 3) {
      sisaAw24 = Number(hist.snap_awal[0] || 0);
      sisaAw25 = Number(hist.snap_awal[1] || 0);
      sisaAw26 = Number(hist.snap_awal[2] || 0);
      sisaAk24 = Number(hist.snap_akhir[0] || 0);
      sisaAk25 = Number(hist.snap_akhir[1] || 0);
      sisaAk26 = Number(hist.snap_akhir[2] || 0);
    } else {
      sisaAw24 = Number(pns.s_tahunan_2024 || 0) + hY24 + hHangusN2;
      sisaAw25 = Number(pns.s_tahunan_2025 || 0) + hY25;
      sisaAw26 = Number(pns.s_tahunan_2026 || 0) + hY26 + hHangusBesar;
      sisaAk24 = Math.max(0, sisaAw24 - hY24 - hHangusN2);
      sisaAk25 = Math.max(0, sisaAw25 - hY25);
      sisaAk26 = Math.max(0, sisaAw26 - hY26 - hHangusBesar);
    }

    // QR Code TTE Mandiri (Inline PNG Base64 agar 100% ter-render tajam di engine PDF GAS)
    const baseUrl = 'https://sso.pa-indramayu.go.id/';
    const verifyUrlPegawai = baseUrl + '?action=verifyCuti&id=' + encodeURIComponent(id) + '&type=pemohon&nip=' + encodeURIComponent(pns.nip);
    const verifyUrlAtasan = baseUrl + '?action=verifyCuti&id=' + encodeURIComponent(id) + '&type=atasan&nip=' + encodeURIComponent(atasan.nip);
    const verifyUrlPejabat = baseUrl + '?action=verifyCuti&id=' + encodeURIComponent(id) + '&type=pejabat&nip=' + encodeURIComponent(pejabat.nip);

    const rawQrUrls = [
      'https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=2&data=' + encodeURIComponent(verifyUrlPegawai),
      'https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=2&data=' + encodeURIComponent("Sudah diparaf oleh Petugas Cuti PA Indramayu"),
      'https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=2&data=' + encodeURIComponent(verifyUrlAtasan),
      'https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=2&data=' + encodeURIComponent(verifyUrlPejabat)
    ];
    const qrDataUris = fetchQrBatchDataUrisServer_(rawQrUrls);

    const qrPegawaiImg = "<img src='" + qrDataUris[0] + "' width='56' height='56' style='display:block; margin:2px 0 3px 0;' />";
    const qrParafImg = "<img src='" + qrDataUris[1] + "' width='44' height='44' style='display:block; margin:0 auto;' />";
    const qrAtasanImg = "<img src='" + qrDataUris[2] + "' width='56' height='56' style='display:block; margin:2px 0 3px 0;' />";
    const qrPejabatImg = "<img src='" + qrDataUris[3] + "' width='56' height='56' style='display:block; margin:2px 0 3px 0;' />";

    const atasanJabatanStr = escapeHtmlServer_(formatJabatanSingkatServer_(atasan.jabatan));
    const pejabatJabatanStr = escapeHtmlServer_(formatJabatanSingkatServer_(pejabat.jabatan));

    const tglAju = String(logRecord[1] || '');
    let romawiBulan = "-";
    let tahunPengajuan = String(leaveYear);
    if (tglAju) {
      const parts = tglAju.split('/');
      if (parts.length >= 2) {
        const mIdx = parseInt(parts[1], 10) - 1;
        romawiBulan = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"][mIdx] || "-";
      }
      if (parts.length >= 3) {
        tahunPengajuan = parts[2];
      }
    }

    const defaultNomorBlanko = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/KPA.W10-A2/KP5.3/" + romawiBulan + "/" + tahunPengajuan;
    const rawNomor = String(nomorSuratOverride || logRecord[19] || '').trim();
    const isValidNomor = rawNomor !== '' && !rawNomor.includes('NOMOR_MYSIMS_TERCATAT') && !rawNomor.includes('undefined');
    const nomorSuratCetak = isValidNomor ? escapeHtmlServer_(rawNomor) : defaultNomorBlanko;

    let showAlasan = String(logRecord[6] || '-');
    if (showAlasan.includes("[USULAN PEMBATALAN]:")) {
      const parts = showAlasan.split("[USULAN PEMBATALAN]:");
      showAlasan = parts[0].trim() + " [USULAN PEMBATALAN]: " + parts[1].trim();
    }

    const fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      '@page { size: A4; margin: 5mm 7mm; }' +
      'body { margin: 0; padding: 0; font-family: "Times New Roman", Times, serif; font-size: 9.8pt; line-height: 1.2; color: #000000; background-color: #ffffff; }' +
      '.hdr-tbl { width: 100%; border-collapse: collapse; margin-bottom: 3px; }' +
      '.hdr-tbl td { border: none; padding: 1px 0; vertical-align: top; font-size: 10pt; }' +
      '.title-box { text-align: center; margin-bottom: 5px; }' +
      '.title-box h2 { font-size: 11.5pt; font-weight: bold; text-decoration: underline; margin: 0; letter-spacing: 0.4px; }' +
      '.title-box p { font-size: 10pt; margin: 1px 0 0 0; }' +
      '.bdr { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 4px; }' +
      '.bdr td { border: 1px solid #000000; padding: 2px 5px; vertical-align: middle; font-size: 9.8pt; word-wrap: break-word; }' +
      '.sec-hd { font-weight: bold; background-color: #f2f2f2; text-transform: uppercase; font-size: 9.8pt; letter-spacing: 0.3px; }' +
      '.sig-wrap { width: 100%; border-collapse: collapse; margin-top: 1px; margin-bottom: 3px; }' +
      '.sig-wrap td { border: none; padding: 0; vertical-align: top; font-size: 9.8pt; }' +
      '</style></head><body>' +

      // HEADER ALAMAT & TANGGAL
      '<table class="hdr-tbl"><tr>' +
      '<td style="width:55%;">Kepada Yth.<br>Ketua Pengadilan Agama Indramayu<br>Di-<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Indramayu</td>' +
      '<td style="width:45%; text-align:right;">Indramayu, ' + escapeHtmlServer_(formatDateIndoCetakServer_(tglAju)) + '</td>' +
      '</tr></table>' +

      // JUDUL & NOMOR SURAT RESMI MYSIMS
      '<div class="title-box"><h2>PERMINTAAN DAN PEMBERIAN CUTI</h2><p>Nomor : ' + nomorSuratCetak + '</p></div>' +

      // I. DATA PEGAWAI
      '<table class="bdr">' +
      '<tr><td colspan="4" class="sec-hd">I. DATA PEGAWAI</td></tr>' +
      '<tr><td style="width:15%;">Nama</td><td style="width:42%; font-weight:bold; font-size:10.5pt;">' + escapeHtmlServer_(pns.nama) + '</td><td style="width:15%;">NIP</td><td style="width:28%; font-weight:bold; font-size:10.5pt;">' + escapeHtmlServer_(pns.nip) + '</td></tr>' +
      '<tr><td>Jabatan</td><td>' + escapeHtmlServer_(formatJabatanSingkatServer_(pns.jabatan)) + '</td><td>Masa Kerja</td><td>-</td></tr>' +
      '<tr><td>Unit Kerja</td><td colspan="3">Pengadilan Agama Indramayu</td></tr>' +
      '</table>' +

      // II. JENIS CUTI YANG DIAMBIL
      '<table class="bdr">' +
      '<tr><td colspan="4" class="sec-hd">II. JENIS CUTI YANG DIAMBIL</td></tr>' +
      '<tr><td style="width:40%;">1. Cuti Tahunan</td><td style="width:10%; text-align:center; font-weight:bold; font-size:10.5pt;">' + cTahunan + '</td><td style="width:40%;">4. Cuti Melahirkan</td><td style="width:10%; text-align:center; font-weight:bold; font-size:10.5pt;">' + cMelahirkan + '</td></tr>' +
      '<tr><td>2. Cuti Besar</td><td style="text-align:center; font-weight:bold; font-size:10.5pt;">' + cBesar + '</td><td>5. Cuti Karena Alasan Penting</td><td style="text-align:center; font-weight:bold; font-size:10.5pt;">' + cPenting + '</td></tr>' +
      '<tr><td>3. Cuti Sakit</td><td style="text-align:center; font-weight:bold; font-size:10.5pt;">' + cSakit + '</td><td>6. Cuti di Luar Tanggungan Negara</td><td style="text-align:center; font-weight:bold; font-size:10.5pt;">' + cCltn + '</td></tr>' +
      '</table>' +

      // III. ALASAN CUTI
      '<table class="bdr">' +
      '<tr><td class="sec-hd">III. ALASAN CUTI</td></tr>' +
      '<tr><td style="min-height:16px;">' + escapeHtmlServer_(showAlasan) + '</td></tr>' +
      '</table>' +

      // IV. LAMANYA CUTI
      '<table class="bdr">' +
      '<tr><td colspan="7" class="sec-hd">IV. LAMANYA CUTI</td></tr>' +
      '<tr>' +
      '<td style="width:10%;">Selama</td>' +
      '<td style="width:8%; text-align:center; font-weight:bold;">' + escapeHtmlServer_(logRecord[11] || 0) + '</td>' +
      '<td style="width:21%;">Hari / <span style="text-decoration:line-through;">Bulan</span> / <span style="text-decoration:line-through;">Tahun</span></td>' +
      '<td style="width:15%;">mulai tanggal</td>' +
      '<td style="width:20%; text-align:center;">' + escapeHtmlServer_(formatDateIndoCetakServer_(logRecord[4])) + '</td>' +
      '<td style="width:6%; text-align:center;">s.d</td>' +
      '<td style="width:20%; text-align:center;">' + escapeHtmlServer_(formatDateIndoCetakServer_(logRecord[5])) + '</td>' +
      '</tr></table>' +

      // V. CATATAN CUTI
      '<table class="bdr">' +
      '<tr><td colspan="6" class="sec-hd">V. CATATAN CUTI</td></tr>' +
      '<tr><td colspan="3" style="font-weight:bold;">1. Cuti Tahunan</td><td rowspan="2" style="width:18%; text-align:center; font-weight:bold;">Paraf Petugas Cuti</td><td style="width:35%;">2. Cuti Besar</td><td style="width:8%; text-align:center; font-weight:bold;">' + (pns.s_besar || 0) + '</td></tr>' +
      '<tr><td style="width:8%; text-align:center; font-weight:bold;">Tahun</td><td style="width:13%; text-align:center; font-weight:bold;">Sisa (Awal)</td><td style="width:18%; text-align:center; font-weight:bold;">Keterangan (Sisa)</td><td>3. Cuti Sakit</td><td style="text-align:center; font-weight:bold;">' + (pns.s_sakit || 0) + '</td></tr>' +
      '<tr><td style="text-align:center;">' + (leaveYear - 2) + '</td><td style="text-align:center;">' + sisaAw24 + '</td><td style="text-align:center;">' + sisaAk24 + '</td><td rowspan="3" style="text-align:center; vertical-align:middle;">' + qrParafImg + '</td><td>4. Cuti Melahirkan</td><td style="text-align:center; font-weight:bold;">' + (pns.s_melahirkan || 0) + '</td></tr>' +
      '<tr><td style="text-align:center;">' + (leaveYear - 1) + '</td><td style="text-align:center;">' + sisaAw25 + '</td><td style="text-align:center;">' + sisaAk25 + '</td><td>5. Cuti Karena Alasan Penting</td><td style="text-align:center; font-weight:bold;">' + (pns.s_penting || 0) + '</td></tr>' +
      '<tr><td style="text-align:center;">' + leaveYear + '</td><td style="text-align:center;">' + sisaAw26 + '</td><td style="text-align:center;">' + sisaAk26 + '</td><td>6. Cuti di Luar Tanggungan Negara</td><td style="text-align:center; font-weight:bold;">' + (pns.s_cltn || 0) + '</td></tr>' +
      '</table>' +

      // VI. ALAMAT SELAMA MENJALANKAN CUTI + TTE PEMOHON (2-Column Pure Table agar 100% stabil di PDF GAS)
      '<table class="sig-wrap" style="margin-bottom:4px;"><tr>' +
      '<td style="width:60%; padding-right:8px;">' +
        '<table class="bdr" style="margin-bottom:0;">' +
        '<tr><td style="width:72%;" class="sec-hd">VI. ALAMAT SELAMA MENJALANKAN CUTI</td><td style="width:28%; text-align:center;" class="sec-hd">TELPON / HP</td></tr>' +
        '<tr><td style="vertical-align:top; line-height:1.25; padding:4px 5px;">' + escapeHtmlServer_(logRecord[15] || '-') + '</td><td style="text-align:center; font-weight:bold;">' + escapeHtmlServer_(pns.no_hp || '-') + '</td></tr>' +
        '</table>' +
      '</td>' +
      '<td style="width:40%; padding-left:14px;">' +
        '<div>Hormat Saya,</div>' +
        qrPegawaiImg +
        '<div style="line-height:1.2;"><span style="text-decoration:underline; font-weight:bold;">' + escapeHtmlServer_(pns.nama) + '</span><br>NIP. ' + escapeHtmlServer_(pns.nip) + '</div>' +
      '</td>' +
      '</tr></table>' +

      // VII. PERTIMBANGAN ATASAN LANGSUNG
      '<table class="bdr">' +
      '<tr><td colspan="4" class="sec-hd">VII. PERTIMBANGAN ATASAN LANGSUNG</td></tr>' +
      '<tr style="text-align:center; font-weight:bold;"><td style="width:25%;">DISETUJUI</td><td style="width:25%;">PERUBAHAN</td><td style="width:25%;">DITANGGUHKAN</td><td style="width:25%;">TIDAK DISETUJUI</td></tr>' +
      '<tr style="text-align:center; font-weight:bold; height:16px;"><td>' + cAtasanSetuju + '</td><td>' + cAtasanUbah + '</td><td>' + cAtasanTangguh + '</td><td>' + cAtasanTolak + '</td></tr>' +
      '</table>' +
      '<table class="sig-wrap"><tr><td style="width:60%;"></td><td style="width:40%; padding-left:14px;">' +
        '<div style="font-weight:bold;">' + atasanJabatanStr + '</div>' +
        qrAtasanImg +
        '<div style="line-height:1.2;"><span style="text-decoration:underline; font-weight:bold;">' + escapeHtmlServer_(atasan.nama) + '</span><br>NIP. ' + escapeHtmlServer_(atasan.nip) + '</div>' +
      '</td></tr></table>' +

      // VIII. KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN CUTI
      '<table class="bdr">' +
      '<tr><td colspan="4" class="sec-hd">VIII. KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN CUTI</td></tr>' +
      '<tr style="text-align:center; font-weight:bold;"><td style="width:25%;">DISETUJUI</td><td style="width:25%;">PERUBAHAN</td><td style="width:25%;">DITANGGUHKAN</td><td style="width:25%;">TIDAK DISETUJUI</td></tr>' +
      '<tr style="text-align:center; font-weight:bold; height:16px;"><td>' + cPejabatSetuju + '</td><td>' + cPejabatUbah + '</td><td>' + cPejabatTangguh + '</td><td>' + cPejabatTolak + '</td></tr>' +
      '</table>' +
      '<table class="sig-wrap"><tr><td style="width:60%;"></td><td style="width:40%; padding-left:14px;">' +
        '<div style="font-weight:bold;">' + pejabatJabatanStr + '</div>' +
        qrPejabatImg +
        '<div style="line-height:1.2;"><span style="text-decoration:underline; font-weight:bold;">' + escapeHtmlServer_(pejabat.nama) + '</span><br>NIP. ' + escapeHtmlServer_(pejabat.nip) + '</div>' +
      '</td></tr></table>' +

      '</body></html>';

    const cleanFirst = String(pns.nama || 'pegawai').replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/)[0].toLowerCase();
    const pdfFileName = 'TRANSKEP_' + cleanFirst + '_ct.pdf';

    const htmlOutput = HtmlService.createHtmlOutput(fullHtml);
    const pdfBlob = htmlOutput.getAs('application/pdf').setName(pdfFileName);
    const pdfBytes = pdfBlob.getBytes();
    return Utilities.base64Encode(pdfBytes);
  } catch (err) {
    Logger.log("⚠️ [generateCutiPdfBase64Server_] Error: " + err.toString());
    return '';
  }
}

function formatJabatanSingkatServer_(jab) {
  if (!jab) return "-";
  const j = String(jab).toUpperCase();
  if (j.includes("KEPALA SUB BAGIAN PERENCANAAN, TI DAN PELAPORAN")) return "Kasubbag PTIP";
  if (j.includes("KEPALA SUB BAGIAN UMUM DAN KEUANGAN")) return "Kasubbag Umum dan Keuangan";
  if (j.includes("KEPALA SUB BAGIAN KEPEGAWAIAN, ORTALA") || j.includes("KEPALA SUB BAGIAN KEPEGAWAIAN DAN ORTALA")) return "Kasubbag Kepegawaian & ORTALA";
  return String(jab);
}

function formatDateIndoCetakServer_(dateStr) {
  if (!dateStr) return "-";
  const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const partsHyphen = String(dateStr).split('-');
  if (partsHyphen.length === 3) {
    return parseInt(partsHyphen[2], 10) + " " + months[parseInt(partsHyphen[1], 10) - 1] + " " + partsHyphen[0];
  }
  const partsSlash = String(dateStr).split('/');
  if (partsSlash.length === 3) {
    return parseInt(partsSlash[0], 10) + " " + months[parseInt(partsSlash[1], 10) - 1] + " " + partsSlash[2];
  }
  return String(dateStr);
}

/**
 * Trigger Otomatis Webhook n8n untuk Permintaan Nomor Surat Keluar MYSIMS
 * Dijalankan SECARA NON-BLOCKING & INSTAN tepat setelah status permohonan cuti menjadi 'Disetujui' (ACC Final).
 * Pembuatan PDF dilakukan di tahap Callback (Tahap 2) agar PDF yang diunggah ke MYSIMS sudah bernomor resmi!
 */
function triggerN8nSuratKeluarCuti_(id, logRecord, namaPemohon, nip) {
  try {
    const props = PropertiesService.getScriptProperties();
    const webhookUrl = props.getProperty('N8N_WEBHOOK_SURAT_KELUAR');
    if (!webhookUrl) {
      Logger.log("ℹ️ [n8n Trigger] N8N_WEBHOOK_SURAT_KELUAR belum disetel di Script Properties. Trigger dilewati.");
      return;
    }

    const jenisCuti = String(logRecord[3] || 'Tahunan');
    const tglMulai = String(logRecord[4] || '');
    const tglSelesai = String(logRecord[5] || '');
    const alasan = String(logRecord[6] || '');
    const tglSuratToday = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');

    const cleanFirst = String(namaPemohon || 'pegawai').replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/)[0].toLowerCase();
    const pdfFileName = 'TRANSKEP_' + cleanFirst + '_ct.pdf';

    // Kunci callback_url ke URL Deployment Produksi Terverifikasi (Anti Meleset ke Deployment Lama)
    const verifiedExecUrl = props.getProperty('TRANSKEP_EXEC_URL') ||
      'https://script.google.com/macros/s/AKfycbzFrbQTqmVzMio7mderK-S9ntFVjXiWYFgnXfy9fW_SUKOcIxfPywP2He1flhaK_AZ0ZA/exec';

    const payload = {
      event: 'CUTI_APPROVED_FINAL',
      cuti_id: String(id),
      nama_pegawai: namaPemohon || 'Pegawai',
      nip: String(nip || ''),
      jenis_cuti: jenisCuti,
      tgl_mulai: tglMulai,
      tgl_selesai: tglSelesai,
      alasan: alasan,
      tanggal_surat: tglSuratToday,
      kode_klasifikasi: 'KP5.3',
      sifat: 'Biasa',
      keterangan: 'cuti ' + jenisCuti.toLowerCase(),
      pdf_filename: pdfFileName,
      mysims_payload: {
        idp: '',
        dari: namaPemohon || 'Pegawai',
        no_surat: 'KPA.W10-A2/',
        uraian: 'Permohonan Cuti ' + jenisCuti + ' a.n. ' + (namaPemohon || 'Pegawai'),
        kode: 'KP5.3',
        tgl_surat: tglSuratToday,
        sifat: 'Biasa',
        ket: 'cuti ' + jenisCuti.toLowerCase()
      },
      callback_url: verifiedExecUrl,
      secret_key: props.getProperty('TRANSKEP_WEBHOOK_KEY') || 'TRANSKEP_WA_BOT_2026',
      timestamp: new Date().toISOString()
    };

    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(webhookUrl, options);
    Logger.log("✅ [n8n Trigger] Webhook surat keluar terkirim. Respon code: " + response.getResponseCode());
  } catch (err) {
    Logger.log("⚠️ [n8n Trigger] Peringatan saat mengirim webhook n8n (diabaikan agar alur tetap aman): " + err.toString());
  }
}

/**
 * Callback API dari n8n untuk memperbarui Nomor Surat Keluar MYSIMS pada baris cuti_log
 * Sekaligus meng-generate PDF Cuti Resmi yang SUDAH TERCETAK Nomor Surat Baru untuk disuntikkan balik ke MYSIMS!
 * @param {Object} payload { id: 'CUTI-...', nomor_surat: '1085/KPA.W10-A2/KP5.3/XI/2026', secret_key: '...' }
 */
function updateNomorSuratCutiFromExternal_(payload) {
  try {
    const cutiId = payload ? (payload.id || payload.cuti_id) : '';
    const nomorSurat = payload ? (payload.nomor_surat || payload.no_surat) : '';
    if (!payload || !cutiId || !nomorSurat) {
      return { status: 'error', message: "Parameter 'id' dan 'nomor_surat' wajib disertakan." };
    }

    const scriptProps = PropertiesService.getScriptProperties();
    const configuredKey = scriptProps.getProperty("TRANSKEP_WEBHOOK_KEY") || "TRANSKEP_WA_BOT_2026";
    if (payload.secret_key && String(payload.secret_key).trim() !== configuredKey.trim()) {
      return { status: 'error', message: "Akses ditolak: Secret Key tidak valid." };
    }

    const cleanNomor = String(nomorSurat).trim();
    if (cleanNomor === '' || cleanNomor.indexOf('NOMOR_MYSIMS_TERCATAT') !== -1) {
      return { status: 'error', message: "Nomor surat tidak valid." };
    }

    const ss = getDB();
    const sheetCuti = ss.getSheetByName('cuti_log');
    if (!sheetCuti) throw new Error("Sheet cuti_log tidak ditemukan.");

    // Gunakan pembaca terdekripsi agar NIP, Alamat, dan format tanggal siap pakai untuk generator PDF
    const cutiData = readCutiSheetDecrypted_(sheetCuti);
    let targetRow = -1;
    let targetRecord = null;
    for (let i = 1; i < cutiData.length; i++) {
      if (String(cutiData[i][0]).trim() === String(cutiId).trim()) {
        targetRow = i + 1; // 1-based row index
        targetRecord = cutiData[i];
        break;
      }
    }

    if (targetRow === -1 || !targetRecord) {
      return { status: 'error', message: "Data cuti dengan ID " + cutiId + " tidak ditemukan." };
    }

    // Pastikan header kolom 20 (Kolom T) adalah nomor_surat
    if (sheetCuti.getLastColumn() < 20 || String(sheetCuti.getRange(1, 20).getValue()).trim() === '') {
      sheetCuti.getRange(1, 20).setValue('nomor_surat');
    }

    sheetCuti.getRange(targetRow, 20).setNumberFormat('@').setValue(cleanNomor);
    targetRecord[19] = cleanNomor;

    SpreadsheetApp.flush();
    if (typeof bumpDataVersion === "function") bumpDataVersion();

    // Generate PDF Resmi yang SUDAH memuat Nomor Surat Baru MYSIMS (untuk disuntikkan ke MYSIMS oleh Node 3 n8n)
    let pdfBase64 = '';
    let pdfFileName = 'TRANSKEP_pegawai_ct.pdf';
    try {
      const pemohonNip = String(targetRecord[2] || '').replace(/^'+/, '').trim();
      let namaPemohon = String(payload.nama_pegawai || '').trim();
      if (!namaPemohon) {
        const sheetUser = ss.getSheetByName('user_data');
        if (sheetUser) {
          const uData = readUserSheetDecrypted_(sheetUser);
          for (let u = 1; u < uData.length; u++) {
            if (String(uData[u][0] || '').replace(/^'+/, '').trim() === pemohonNip) {
              namaPemohon = String(uData[u][1] || '').trim();
              break;
            }
          }
        }
      }
      const cleanFirst = String(namaPemohon || 'pegawai').replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/)[0].toLowerCase();
      pdfFileName = 'TRANSKEP_' + cleanFirst + '_ct.pdf';
      pdfBase64 = generateCutiPdfBase64Server_(cutiId, targetRecord, namaPemohon, pemohonNip, cleanNomor);
    } catch (errPdf) {
      Logger.log("⚠️ [n8n Callback PDF] Peringatan saat generate PDF bernomor: " + errPdf.toString());
    }

    Logger.log("✅ [n8n Callback] Nomor surat cuti ID " + cutiId + " berhasil diupdate ke: " + cleanNomor + " (PDF bytes b64: " + (pdfBase64 ? pdfBase64.length : 0) + ")");
    return {
      status: 'success',
      message: 'Nomor surat cuti berhasil diperbarui & PDF bernomor siap diunggah.',
      id: cutiId,
      nomor_surat: cleanNomor,
      pdf_base64: pdfBase64,
      pdf_filename: pdfFileName
    };
  } catch (err) {
    Logger.log("❌ [n8n Callback] Error: " + err.toString());
    return { status: 'error', message: err.toString() };
  }
}

