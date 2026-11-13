// ==========================================
// FILE: permohonan.gs
// Deskripsi: Backend Controller untuk Cuti & Dinas Luar (Aman & Terpusat)
// ==========================================

function addCutiLog(payload, aktorNip, clientToken) {
  try {
    const sess = (typeof resolveCallerSession_ === 'function')
      ? resolveCallerSession_(aktorNip, clientToken)
      : (cekOtorisasi(aktorNip, clientToken) ? { nip: normalizeNipKey_(aktorNip), role: '' } : null);
    if (!sess) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const targetNip = (typeof normalizeNipKey_ === 'function') ? normalizeNipKey_(payload && payload.nip) : String((payload && payload.nip) || '').trim();
    const isOwner = (targetNip !== '' && targetNip === sess.nip);
    const isAdmin = (typeof isAdminRole_ === 'function') ? isAdminRole_(sess.role) : cekOtorisasiAdmin(aktorNip, clientToken);
    if (!isOwner && !isAdmin) {
      return { status: 'error', message: 'Akses Ditolak: Anda hanya berwenang mengajukan cuti untuk NIP Anda sendiri.' };
    }

    const ss = getDB();
    const activeYear = ensureAnnualCutiRollover_(ss);
    let sheetCuti = ss.getSheetByName('cuti_log');
    if (!sheetCuti) sheetCuti = ss.insertSheet('cuti_log');
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
      } catch (e) { Logger.log("Gagal mengunggah file bukti: " + e.toString()); }
    }

    const calc = hitungHariKerjaCuti_(payload.tgl_mulai, payload.tgl_selesai);
    const durasi = calc.durasi;
    if (payload.jenis !== 'Dinas Luar' && durasi <= 0) {
      throw new Error("Rentang tanggal yang dipilih seluruhnya merupakan akhir pekan atau Hari Libur Nasional / Cuti Bersama (0 hari kerja efektif).");
    }

    const uData = readUserSheetDecrypted_(sheetUser);
    let rowIndex = -1; let namaPegawaiPemohon = "";

    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][0]) === String(payload.nip)) { rowIndex = i + 1; namaPegawaiPemohon = uData[i][1]; break; }
    }
    if (rowIndex === -1) throw new Error("Pegawai tidak ditemukan.");

    // Potong saldo terpusat (SE SEKMA No. 13 Tahun 2019 & SKB 3 Menteri)
    const historyJson = potongSaldoCutiServer_(sheetUser, rowIndex, payload.jenis, durasi, activeYear);

    const uniquePrefix = payload.jenis === 'Dinas Luar' ? "DL-" : "CUTI-";
    const newId = uniquePrefix + new Date().getTime() + Math.floor(Math.random() * 1000);
    const tglForm = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy');

    const statusAwal = payload.jenis === 'Dinas Luar' ? 'Disetujui' : 'Menunggu';

    const magicToken = Utilities.getUuid();
    sheetCuti.appendRow(sanitizeRowArray([
      newId, tglForm, encryptField_(payload.nip), payload.jenis, payload.tgl_mulai, payload.tgl_selesai, payload.alasan,
      statusAwal, '', encryptField_(payload.atasan_nip || '-'), encryptField_(payload.pejabat_nip || '-'), durasi, payload.plh_nip || '', statusAwal, statusAwal, encryptField_(payload.alamat || '-'), JSON.stringify(historyJson), fileUrl, magicToken, ''
    ]));

    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();

    // Notifikasi WhatsApp Magic Link ke Atasan Langsung (Non-blocking)
    if (payload.jenis !== 'Dinas Luar' && payload.atasan_nip && payload.atasan_nip !== '-') {
      try {
        let atasanPhone = "";
        let namaAtasan = "";
        for (let u = 1; u < uData.length; u++) {
          if (String(uData[u][0]) === String(payload.atasan_nip)) {
            namaAtasan = uData[u][1];
            atasanPhone = String(uData[u][4] || '');
            break;
          }
        }

        if (atasanPhone && atasanPhone.length > 8) {
          const magicLink = "https://sso.pa-indramayu.go.id/?action=review_cuti&token=" + magicToken;
          const msgWa = "*TRANSKEP - USULAN CUTI PEGAWAI* 📋\n\n" +
            "Yth. Bapak/Ibu *" + namaAtasan + "* (Atasan Langsung),\n\n" +
            "Terdapat pengajuan cuti baru yang membutuhkan persetujuan Anda:\n\n" +
            "👤 *Pemohon:* " + namaPegawaiPemohon + "\n" +
            "🆔 *NIP:* " + payload.nip + "\n" +
            "🏷️ *Jenis:* Cuti " + payload.jenis + "\n" +
            "📅 *Periode:* " + payload.tgl_mulai + " s.d " + payload.tgl_selesai + " (" + durasi + " hari kerja)\n" +
            "📝 *Alasan:* " + (payload.alasan || '-') + "\n\n" +
            "Silakan klik tautan di bawah ini untuk melihat detail lengkap dan memberikan persetujuan langsung (tanpa perlu login):\n" +
            "👉 " + magicLink;

          sendWhatsAppMessage_(atasanPhone, msgWa, {
            jenis_pesan: 'cuti_usulan',
            nama_tujuan: namaAtasan,
            nama_pemohon: namaPegawaiPemohon,
            nip: payload.nip,
            jenis_cuti: payload.jenis,
            periode: payload.tgl_mulai + " s.d " + payload.tgl_selesai,
            durasi: durasi,
            alasan: payload.alasan || '-',
            magic_link: magicLink
          });
        }
      } catch (errWa) {
        Logger.log("Gagal kirim notif WA cuti ke atasan: " + errWa.toString());
      }
    }

    return { status: 'success', message: 'Pengajuan Cuti berhasil disimpan.', data: { id: newId, tgl_pengajuan: tglForm, durasi: durasi, history: JSON.stringify(historyJson), fileUrl: fileUrl, status: statusAwal } };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

// TRANSKEP UPDATE: Algoritma Saldo Khusus untuk Mode Edit Tahap 3
function updateCutiLog(payload, aktorNip, clientToken) {
  try {
    const sess = (typeof resolveCallerSession_ === 'function')
      ? resolveCallerSession_(aktorNip, clientToken)
      : (cekOtorisasi(aktorNip, clientToken) ? { nip: normalizeNipKey_(aktorNip), role: '' } : null);
    if (!sess) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const activeYear = ensureAnnualCutiRollover_(ss);
    const sheetCuti = ss.getSheetByName('cuti_log');
    const sheetUser = ss.getSheetByName('user_data');
    if (!sheetCuti || !sheetUser) throw new Error("Database belum siap.");

    const cutiData = readCutiSheetDecrypted_(sheetCuti);
    let rowIndexCuti = -1; let logLama = null;
    for (let i = 1; i < cutiData.length; i++) {
      if (String(cutiData[i][0]) === String(payload.id)) { rowIndexCuti = i + 1; logLama = cutiData[i]; break; }
    }

    if (rowIndexCuti === -1) throw new Error("Data transaksi cuti tidak ditemukan.");

    const norm = (typeof normalizeNipKey_ === 'function') ? normalizeNipKey_ : (v => String(v || '').trim());
    const ownerNip = norm(logLama[2]);
    const payloadNip = norm(payload && payload.nip);
    const isAdmin = (typeof isAdminRole_ === 'function') ? isAdminRole_(sess.role) : cekOtorisasiAdmin(aktorNip, clientToken);
    if ((ownerNip !== sess.nip || payloadNip !== ownerNip) && !isAdmin) {
      throw new Error("Akses Ditolak: Anda hanya berwenang mengubah pengajuan cuti milik sendiri.");
    }

    if (logLama[7] !== 'Menunggu') throw new Error("Anda tidak dapat mengubah cuti yang sudah di-proses Atasan.");

    // Tarik Identitas Pegawai
    const uData = readUserSheetDecrypted_(sheetUser);
    let rowIndexUser = -1;
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][0]) === String(payload.nip)) { rowIndexUser = i + 1; break; }
    }
    if (rowIndexUser === -1) throw new Error("Pegawai tidak ditemukan.");

    // Hitung Durasi Cuti Baru (lewati akhir pekan + SKB Libur Nasional & Cuti Bersama)
    const calcBaru = hitungHariKerjaCuti_(payload.tgl_mulai, payload.tgl_selesai);
    const durasiBaru = calcBaru.durasi;
    if (payload.jenis !== 'Dinas Luar' && durasiBaru <= 0) {
      throw new Error("Rentang tanggal yang dipilih seluruhnya merupakan akhir pekan atau Hari Libur Nasional / Cuti Bersama (0 hari kerja efektif).");
    }

    // Eksekusi Refund Saldo Lama + Potong Saldo Baru secara Atomik (Rollback otomatis jika validasi kuota gagal)
    const snapshotQuotas = sheetUser.getRange(rowIndexUser, 7, 1, 8).getValues();
    let historyJson;
    try {
      const historyStr = String(logLama[16] || "");
      const jenisLama = String(logLama[3] || '').trim();
      pulihkanSaldoCutiServer_(sheetUser, rowIndexUser, jenisLama, historyStr);
      SpreadsheetApp.flush();

      historyJson = potongSaldoCutiServer_(sheetUser, rowIndexUser, payload.jenis, durasiBaru, activeYear);
    } catch (errSaldo) {
      sheetUser.getRange(rowIndexUser, 7, 1, 8).setValues(snapshotQuotas);
      SpreadsheetApp.flush();
      throw errSaldo;
    }

    // Upload Lampiran Baru (Jika Ada)
    let fileUrlUpdate = logLama[17]; // Pakai URL lama sebagai default
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
        fileUrlUpdate = file.getUrl();
      } catch (e) { }
    }

    // Update Baris Excel (Enkripsi Kolom Rahasia NIP & Alamat Cuti + Anti-Formula Injection)
    const sf = (typeof sanitizeFormulaInput === 'function') ? sanitizeFormulaInput : (v => v);
    sheetCuti.getRange(rowIndexCuti, 4).setValue(sf(payload.jenis));
    sheetCuti.getRange(rowIndexCuti, 5).setValue(sf(payload.tgl_mulai));
    sheetCuti.getRange(rowIndexCuti, 6).setValue(sf(payload.tgl_selesai));
    sheetCuti.getRange(rowIndexCuti, 7).setValue(sf(payload.alasan));
    sheetCuti.getRange(rowIndexCuti, 10).setNumberFormat('@').setValue(encryptField_(payload.atasan_nip || '-'));
    sheetCuti.getRange(rowIndexCuti, 11).setNumberFormat('@').setValue(encryptField_(payload.pejabat_nip || '-'));
    sheetCuti.getRange(rowIndexCuti, 12).setValue(durasiBaru);
    sheetCuti.getRange(rowIndexCuti, 13).setValue(sf(payload.plh_nip || ''));
    sheetCuti.getRange(rowIndexCuti, 16).setNumberFormat('@').setValue(encryptField_(payload.alamat || '-'));
    sheetCuti.getRange(rowIndexCuti, 17).setValue(JSON.stringify(historyJson));
    sheetCuti.getRange(rowIndexCuti, 18).setValue(sf(fileUrlUpdate));

    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: 'Perubahan cuti berhasil disimpan.', data: { id: payload.id, durasi: durasiBaru, history: JSON.stringify(historyJson), fileUrl: fileUrlUpdate } };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function deleteCutiLog(id, forceDelete, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const activeYear = ensureAnnualCutiRollover_(ss);
    const sheetCuti = ss.getSheetByName('cuti_log');
    const sheetUser = ss.getSheetByName('user_data');

    const cutiData = readCutiSheetDecrypted_(sheetCuti);
    let rowIndex = -1; let logRecord = null;
    const targetId = String(id || '').trim();

    for (let i = 1; i < cutiData.length; i++) {
      if (String(cutiData[i][0]).trim() === targetId) {
        rowIndex = i + 1;
        logRecord = cutiData[i];
        break;
      }
    }

    if (rowIndex === -1) throw new Error("Data transaksi cuti tidak ditemukan.");

    const ownerNip = String(logRecord[2] || '').trim();
    const callerNip = String(userNip || '').trim();
    const isOwner = (ownerNip === callerNip);
    const isAdmin = (typeof cekOtorisasiAdmin === 'function' && cekOtorisasiAdmin(userNip, clientToken));

    if (!isOwner && !isAdmin) {
      throw new Error("Akses Ditolak: Anda hanya berwenang menarik atau menghapus permohonan cuti milik sendiri.");
    }

    const statusSekarang = String(logRecord[7] || '').trim();
    const statusClean = statusSekarang.toLowerCase();
    let isHardDelete = Boolean(forceDelete);

    if (!isHardDelete && !isAdmin) {
      // Pemohon hanya boleh menarik/menghapus pengajuan yang belum disetujui (Menunggu, Perubahan, atau Ditolak)
      if (statusClean !== 'menunggu' && statusClean !== 'perubahan' && statusClean !== 'ditolak') {
        throw new Error("Hanya pengajuan yang belum disetujui ('Menunggu', 'Perubahan', atau 'Ditolak') yang dapat dihapus.");
      }
    }

    const nip = ownerNip;
    const jenis = String(logRecord[3] || '').trim();

    // Kembalikan saldo kuota jika cuti belum pernah ditolak, diminta perubahan, atau dibatalkan sebelumnya
    if (jenis !== 'Dinas Luar' && statusClean !== 'ditolak' && statusClean !== 'perubahan' && statusClean !== 'dibatalkan') {
      const historyStr = String(logRecord[16] || "");
      const userData = readUserSheetDecrypted_(sheetUser);
      let userRowIndex = -1;
      for (let i = 1; i < userData.length; i++) {
        if (String(userData[i][0]).trim() === nip) {
          userRowIndex = i + 1;
          break;
        }
      }

      if (userRowIndex !== -1) {
        pulihkanSaldoCutiServer_(sheetUser, userRowIndex, jenis, historyStr);
      }
    }

    let finalMessage = "";
    if (isHardDelete && (statusClean === 'disetujui' || statusClean === 'menunggu pembatalan')) {
      // Jika sudah disahkan dan dibatalkan secara administratif oleh Admin, tandai DIBATALKAN
      sheetCuti.getRange(rowIndex, 8).setValue('DIBATALKAN');
      sheetCuti.getRange(rowIndex, 14).setValue('DIBATALKAN');
      sheetCuti.getRange(rowIndex, 15).setValue('DIBATALKAN');
      finalMessage = 'Status cuti telah diubah menjadi DIBATALKAN dan saldo kuota telah dikembalikan.';
    } else {
      // Jika status Menunggu / Perubahan ditarik atau dihapus, hapus baris transaksi sepenuhnya
      sheetCuti.deleteRow(rowIndex);
      finalMessage = 'Transaksi permohonan berhasil ditarik dan dihapus sepenuhnya dari sistem.';
    }

    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success', message: finalMessage };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}

function requestCancelCuti(id, alasanBatal, userNip, clientToken) {
  try {
    const sess = (typeof resolveCallerSession_ === 'function')
      ? resolveCallerSession_(userNip, clientToken)
      : (cekOtorisasi(userNip, clientToken) ? { nip: normalizeNipKey_(userNip), role: '' } : null);
    if (!sess) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };

    const ss = getDB();
    const activeYear = ensureAnnualCutiRollover_(ss);
    const sheetCuti = ss.getSheetByName('cuti_log');

    const cutiData = readCutiSheetDecrypted_(sheetCuti);
    let rowIndex = -1; let logRecord = null;
    for (let i = 1; i < cutiData.length; i++) {
      if (String(cutiData[i][0]) === String(id)) { rowIndex = i + 1; logRecord = cutiData[i]; break; }
    }

    if (rowIndex === -1) throw new Error("Data transaksi cuti tidak ditemukan.");
    const norm = (typeof normalizeNipKey_ === 'function') ? normalizeNipKey_ : (v => String(v || '').trim());
    const isOwner = (norm(logRecord[2]) === sess.nip);
    const isAdmin = (typeof isAdminRole_ === 'function') ? isAdminRole_(sess.role) : cekOtorisasiAdmin(userNip, clientToken);
    if (!isOwner && !isAdmin) {
      throw new Error("Akses Ditolak: Anda hanya berwenang mengusulkan pembatalan cuti milik sendiri.");
    }
    if (logRecord[7] !== 'Disetujui') throw new Error("Cuti belum berstatus disetujui penuh.");

    const sf = (typeof sanitizeFormulaInput === 'function') ? sanitizeFormulaInput : (v => v);
    const alasanBaru = logRecord[6] + "\n\n[USULAN PEMBATALAN]: " + alasanBatal;

    sheetCuti.getRange(rowIndex, 7).setValue(sf(alasanBaru));
    sheetCuti.getRange(rowIndex, 8).setValue('Menunggu Pembatalan');

    if (typeof bumpDataVersion === "function") bumpDataVersion(); else SpreadsheetApp.flush();
    return { status: 'success' };
  } catch (err) { return { status: 'error', message: err.toString() }; }
}