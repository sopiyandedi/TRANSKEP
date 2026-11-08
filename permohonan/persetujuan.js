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
 * Menghasilkan PDF Formulir Permintaan dan Pemberian Cuti di Server GAS (Opsi A)
 * Menggunakan template resmi TRANSKEP, melengkapi seluruh metadata, TTE QR Mandiri,
 * dan mengonversi ke PDF Blob yang di-encode Base64 untuk diunggah ke MYSIMS.
 */
function generateCutiPdfBase64Server_(id, logRecord, namaPemohon, nip) {
  try {
    const ss = getDB();
    const sheetUser = ss.getSheetByName('user_data');
    if (!sheetUser) throw new Error("Sheet user_data tidak ditemukan.");

    const uData = readUserSheetDecrypted_(sheetUser);
    const uHeaders = (uData && uData.length > 0) ? uData[0].map(h => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')) : [];
    const findColIdx = (name, fallback) => {
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
      const uNip = String(uData[i][colNip] || '').trim();
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

    const pemohonNip = String(nip || logRecord[2] || '').trim();
    const atasanNip = String(logRecord[9] || '').trim();
    const pejabatNip = String(logRecord[12] || '').trim();

    const pns = userMap[pemohonNip] || { nama: namaPemohon || 'Pegawai', nip: pemohonNip, jabatan: '-', no_hp: '-' };
    const atasan = userMap[atasanNip] || { nama: 'Atasan Langsung', nip: atasanNip, jabatan: 'Atasan Langsung' };
    const pejabat = userMap[pejabatNip] || { nama: 'Ketua', nip: pejabatNip, jabatan: 'Ketua' };

    // Baca Template Cetak Cuti secara bertahap
    let templateHtml = '';
    const candidateFiles = [
      'permohonan/template_cetak_cuti',
      'modules/permohonan/cetak/cetak_cuti',
      'template_cetak_cuti',
      'cetak_cuti'
    ];
    for (let f = 0; f < candidateFiles.length; f++) {
      try {
        templateHtml = HtmlService.createHtmlOutputFromFile(candidateFiles[f]).getContent();
        if (templateHtml && templateHtml.length > 100) break;
      } catch (errFind) {}
    }

    if (!templateHtml) {
      Logger.log("⚠️ [generateCutiPdfBase64Server_] Template HTML tidak ditemukan pada semua alias.");
      return '';
    }

    // Hilangkan wrapper style="display: none;" agar konten form tampil penuh pada PDF GAS
    templateHtml = templateHtml.replace(/<div id="template-cetak-container"[^>]*>/i, '<div style="width: 100%; background: #ffffff;">');

    const jenisCuti = String(logRecord[3] || 'Tahunan');
    let cTahunan = "", cBesar = "", cSakit = "", cMelahirkan = "", cPenting = "", cCltn = "";
    if (jenisCuti === 'Tahunan') cTahunan = "✓";
    else if (jenisCuti === 'Besar') cBesar = "✓";
    else if (jenisCuti === 'Sakit') cSakit = "✓";
    else if (jenisCuti === 'Melahirkan') cMelahirkan = "✓";
    else if (jenisCuti === 'Alasan Penting' || jenisCuti === 'Penting') cPenting = "✓";
    else if (jenisCuti === 'CLTN') cCltn = "✓";

    // Pertimbangan & Keputusan
    const cAtasanSetuju = "✓", cAtasanUbah = "", cAtasanTangguh = "", cAtasanTolak = "";
    const cPejabatSetuju = "✓", cPejabatUbah = "", cPejabatTangguh = "", cPejabatTolak = "";

    // History Saldo Cuti
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

    // QR Code Mandiri Berbasis URL Publik Verifikasi (Rendered via high-reliability QR API untuk PDF GAS)
    const baseUrl = 'https://sso.pa-indramayu.go.id/';
    const verifyUrlPegawai = baseUrl + '?action=verifyCuti&id=' + encodeURIComponent(id) + '&type=pemohon&nip=' + encodeURIComponent(pns.nip);
    const verifyUrlAtasan = baseUrl + '?action=verifyCuti&id=' + encodeURIComponent(id) + '&type=atasan&nip=' + encodeURIComponent(atasan.nip);
    const verifyUrlPejabat = baseUrl + '?action=verifyCuti&id=' + encodeURIComponent(id) + '&type=pejabat&nip=' + encodeURIComponent(pejabat.nip);

    const qrPegawaiSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(verifyUrlPegawai);
    const qrAtasanSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(verifyUrlAtasan);
    const qrPejabatSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent(verifyUrlPejabat);
    const qrParafSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + encodeURIComponent("Sudah diparaf oleh Petugas Cuti PA Indramayu");

    const qrPegawaiImg = "<img src='" + qrPegawaiSrc + "' width='64' height='64' alt='TTE Pegawai' style='display: block; margin: 2px 0 4px 0;' />";
    const qrParafImg = "<img src='" + qrParafSrc + "' width='45' height='45' alt='Paraf' style='margin: 0 auto; display: block;' />";
    const qrAtasanImg = "<img src='" + qrAtasanSrc + "' width='64' height='64' alt='QR Atasan' style='display: block; margin: 2px 0 4px 0;' />";
    const qrPejabatImg = "<img src='" + qrPejabatSrc + "' width='64' height='64' alt='QR Pejabat' style='display: block; margin: 2px 0 4px 0;' />";

    const atasanJabatanStr = formatJabatanSingkatServer_(atasan.jabatan);
    const pejabatJabatanStr = formatJabatanSingkatServer_(pejabat.jabatan);

    const atasanSig = "<div style='width: 100%; display: flex; justify-content: flex-end;'>" +
                        "<div style='width: 38%; display: flex; flex-direction: column; align-items: flex-start; text-align: left; min-width: 180px;'>" +
                          "<div style='font-size: 10pt !important; font-family: \"Times New Roman\", Times, serif; font-weight: bold; margin-bottom: 2px;'>" + 
                            atasanJabatanStr + 
                          "</div>" +
                          qrAtasanImg +
                          "<div style='font-size: 10pt !important; line-height: 1.2; font-family: \"Times New Roman\", Times, serif; margin-top: 2px;'>" +
                            "<span style='text-decoration: underline; font-weight: bold;'>" + atasan.nama + "</span><br>" +
                            "NIP. " + atasan.nip +
                          "</div>" +
                        "</div>" +
                      "</div>";

    const pejabatSig = "<div style='width: 100%; display: flex; justify-content: flex-end;'>" +
                         "<div style='width: 38%; display: flex; flex-direction: column; align-items: flex-start; text-align: left; min-width: 180px;'>" +
                           "<div style='font-size: 10pt !important; font-family: \"Times New Roman\", Times, serif; font-weight: bold; margin-bottom: 2px;'>" + 
                             pejabatJabatanStr + 
                           "</div>" +
                           qrPejabatImg +
                           "<div style='font-size: 10pt !important; line-height: 1.2; font-family: \"Times New Roman\", Times, serif; margin-top: 2px;'>" +
                             "<span style='text-decoration: underline; font-weight: bold;'>" + pejabat.nama + "</span><br>" +
                             "NIP. " + pejabat.nip +
                           "</div>" +
                         "</div>" +
                       "</div>";

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

    const defaultNomorBlanko = "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/KPA.W10-A/KP5.3/" + romawiBulan + "/" + tahunPengajuan;
    const rawNomor = String(logRecord[19] || '').trim();
    const isValidNomor = rawNomor !== '' && !rawNomor.includes('NOMOR_MYSIMS_TERCATAT') && !rawNomor.includes('undefined');
    const nomorSuratCetak = isValidNomor ? rawNomor : defaultNomorBlanko;

    let showAlasan = String(logRecord[6] || '-');
    if (showAlasan.includes("[USULAN PEMBATALAN]:")) {
      const parts = showAlasan.split("[USULAN PEMBATALAN]:");
      showAlasan = parts[0].trim() + " [USULAN PEMBATALAN]: " + parts[1].trim();
    }

    const replacements = {
      "{{formatPengajuanLengkap}}": formatDateIndoCetakServer_(tglAju),
      "{{nomorSuratCetak}}": nomorSuratCetak,
      "{{romawiCetak}}": romawiBulan,
      "{{tahunCetak}}": tahunPengajuan,
      "{{pns_nama}}": pns.nama,
      "{{pns_nip}}": pns.nip,
      "{{pns_jabatan}}": formatJabatanSingkatServer_(pns.jabatan),
      "{{pns_no_hp}}": pns.no_hp || '-',
      "{{chk_tahunan}}": cTahunan, "{{chk_besar}}": cBesar, "{{chk_sakit}}": cSakit,
      "{{chk_melahirkan}}": cMelahirkan, "{{chk_penting}}": cPenting, "{{chk_cltn}}": cCltn,
      "{{log_alasan}}": showAlasan,
      "{{log_sisa_cuti}}": (logRecord[11] || 0),
      "{{log_tgl_mulai}}": formatDateIndoCetakServer_(logRecord[4]),
      "{{log_tgl_selesai}}": formatDateIndoCetakServer_(logRecord[5]),
      "{{log_alamat}}": (logRecord[15] || '-'),
      "{{yearN2}}": (leaveYear - 2),
      "{{yearN1}}": (leaveYear - 1),
      "{{yearN}}": leaveYear,
      "{{before24}}": sisaAw24, "{{after24}}": sisaAk24,
      "{{before25}}": sisaAw25, "{{after25}}": sisaAk25,
      "{{before26}}": sisaAw26, "{{after26}}": sisaAk26,
      "{{cuti_besar}}": (pns.s_besar || 0), "{{cuti_sakit}}": (pns.s_sakit || 0),
      "{{cuti_melahirkan}}": (pns.s_melahirkan || 0), "{{cuti_penting}}": (pns.s_penting || 0),
      "{{cuti_cltn}}": (pns.s_cltn || 0),
      "{{qrPegawaiImg}}": qrPegawaiImg,
      "{{qrParafImg}}": qrParafImg,
      "{{qrPegawaiUrl}}": qrPegawaiSrc,
      "{{qrParafUrl}}": qrParafSrc,
      "{{atasanSignatureContent}}": atasanSig,
      "{{pejabatSignatureContent}}": pejabatSig,
      "{{jarak_ttd}}": "40px",
      "{{chk_atasan_setuju}}": cAtasanSetuju,
      "{{chk_atasan_ubah}}": cAtasanUbah,
      "{{chk_atasan_tangguh}}": cAtasanTangguh,
      "{{chk_atasan_tolak}}": cAtasanTolak,
      "{{chk_pejabat_setuju}}": cPejabatSetuju,
      "{{chk_pejabat_ubah}}": cPejabatUbah,
      "{{chk_pejabat_tangguh}}": cPejabatTangguh,
      "{{chk_pejabat_tolak}}": cPejabatTolak
    };

    let populatedHtml = templateHtml;
    for (const [key, val] of Object.entries(replacements)) {
      populatedHtml = populatedHtml.split(key).join(String(val));
    }

    // Buat HTML lengkap untuk parser PDF Google Apps Script
    const fullHtml = '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<style>@page { size: A4; margin: 3mm 6mm; } body { margin: 0; padding: 0; font-family: "Times New Roman", Times, serif; background-color: #ffffff; color: #000000; }</style>' +
      '</head><body>' + populatedHtml + '</body></html>';

    const cleanFirst = String(pns.nama || 'pegawai').replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/)[0].toLowerCase();
    const pdfFileName = 'TRANSKEP_' + cleanFirst + '_ct.pdf';

    const htmlOutput = HtmlService.createHtmlOutput(fullHtml);
    const pdfBlob = htmlOutput.getAs('application/pdf').setName(pdfFileName);
    const pdfBytes = pdfBlob.getBytes();
    const pdfBase64 = Utilities.base64Encode(pdfBytes);

    return pdfBase64;
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
 * Dijalankan SECARA NON-BLOCKING & AMAN tepat setelah status permohonan cuti menjadi 'Disetujui' (ACC Final).
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

    // Opsi A: Generate Berkas PDF Cuti Resmi di Server & Encode ke Base64
    let pdfBase64 = '';
    const cleanFirst = String(namaPemohon || 'pegawai').replace(/[^a-zA-Z0-9]/g, ' ').trim().split(/\s+/)[0].toLowerCase();
    const pdfFileName = 'TRANSKEP_' + cleanFirst + '_ct.pdf';

    try {
      pdfBase64 = generateCutiPdfBase64Server_(id, logRecord, namaPemohon, nip);
      Logger.log("✅ [n8n Trigger] Berkas PDF Cuti berhasil dibuat di server (" + pdfFileName + ")");
    } catch (errPdf) {
      Logger.log("⚠️ [n8n Trigger] Peringatan saat membuat PDF di server (diabaikan agar tetap jalan): " + errPdf.toString());
    }

    // Menghasilkan payload terstruktur siap konsumsi untuk n8n dan MYSIMS
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
      pdf_base64: pdfBase64,
      pdf_filename: pdfFileName,
      // Parameter form MYSIMS siap pakai untuk node HTTP Request n8n
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
      callback_url: ScriptApp.getService().getUrl(),
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
 * @param {Object} payload { id: 'CUTI-...', nomor_surat: '1084/KPA.W10-A2/KP5.3/XI/2026', secret_key: '...' }
 */
function updateNomorSuratCutiFromExternal_(payload) {
  try {
    const cutiId = payload.id || payload.cuti_id;
    const nomorSurat = payload.nomor_surat || payload.no_surat;
    if (!payload || !cutiId || !nomorSurat) {
      return { status: 'error', message: "Parameter 'id' dan 'nomor_surat' wajib disertakan." };
    }

    const scriptProps = PropertiesService.getScriptProperties();
    const configuredKey = scriptProps.getProperty("TRANSKEP_WEBHOOK_KEY") || "TRANSKEP_WA_BOT_2026";
    if (payload.secret_key && String(payload.secret_key).trim() !== configuredKey.trim()) {
      return { status: 'error', message: "Akses ditolak: Secret Key tidak valid." };
    }

    const ss = getDB();
    const sheetCuti = ss.getSheetByName('cuti_log');
    if (!sheetCuti) throw new Error("Sheet cuti_log tidak ditemukan.");

    const data = sheetCuti.getDataRange().getValues();
    let targetRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(cutiId).trim()) {
        targetRow = i + 1; // 1-based row index
        break;
      }
    }

    if (targetRow === -1) {
      return { status: 'error', message: "Data cuti dengan ID " + cutiId + " tidak ditemukan." };
    }

    // Pastikan header kolom 20 (Kolom T) adalah nomor_surat
    if (sheetCuti.getLastColumn() < 20 || String(sheetCuti.getRange(1, 20).getValue()).trim() === '') {
      sheetCuti.getRange(1, 20).setValue('nomor_surat');
    }

    const cleanNomor = String(nomorSurat).trim();
    sheetCuti.getRange(targetRow, 20).setNumberFormat('@').setValue(cleanNomor);

    SpreadsheetApp.flush();
    if (typeof bumpDataVersion === "function") bumpDataVersion();

    Logger.log("✅ [n8n Callback] Nomor surat cuti ID " + cutiId + " berhasil diupdate ke: " + cleanNomor);
    return {
      status: 'success',
      message: 'Nomor surat cuti berhasil diperbarui.',
      id: cutiId,
      nomor_surat: cleanNomor
    };
  } catch (err) {
    Logger.log("❌ [n8n Callback] Error: " + err.toString());
    return { status: 'error', message: err.toString() };
  }
}

