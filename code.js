// ==========================================
// FILE: code.gs (Core Controller & API)
// ==========================================

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('TRANSKEP v2.1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ------------------------------------------
// 1. AUTENTIKASI & TARIK DATA (CORE)
// ------------------------------------------
function verifyLogin(nip, pass) {
  try {
    // ZETTBOT FIX: Direct Connection untuk mempercepat akses baca database
    let ss;
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch(e) {}
    if(!ss) ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    
    const sheet = ss.getSheetByName('user_data');
    const data = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(nip) && String(data[i][5]) === String(pass)) {
        const user = {
          nip: data[i][0], nama: data[i][1], jabatan: data[i][2], role: data[i][3],
          no_hp: data[i][4], s_tahunan_2024: data[i][6], s_tahunan_2025: data[i][7],
          s_tahunan_2026: data[i][8], s_sakit: data[i][9], s_penting: data[i][10],
          s_besar: data[i][11], s_melahirkan: data[i][12], s_cltn: data[i][13],
          pangkat: data[i][14], alamat: data[i][15]
        };

        // ZETTBOT SECURITY PATCH: GENERATE SESSION TOKEN
        const sessionToken = Utilities.getUuid(); // Buat UUID unik
        const cache = CacheService.getScriptCache();
        // Simpan token di server Google selama 8 Jam (28800 detik). Value-nya adalah NIP pemilik.
        cache.put(sessionToken, String(nip), 28800); 

        // Kembalikan token ke client
        return { status: 'success', data: user, token: sessionToken };
      }
    }
    return { status: 'error', message: 'NIP atau Sandi tidak valid' };
  } catch (e) { return { status: 'error', message: e.toString() }; }
}

// ZETTBOT SECURITY PATCH: Fungsi getBulkData SEKARANG WAJIB MEMBAWA TOKEN
// ZETTBOT PERFORMANCE PATCH: Hanya menarik data Super Ringan di awal
function getBulkData(nip, clientToken) {
  try {
    // === VALIDASI KEAMANAN (ANTI BYPASS CONSOLE) ===
    if (!clientToken) {
        return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid (Token Kosong).' };
    }
    
    const cache = CacheService.getScriptCache();
    const serverNipOwner = cache.get(clientToken);
    
    // Cek apakah token ada di memori, dan apakah NIP peminta sama dengan NIP pemilik token
    if (!serverNipOwner || serverNipOwner !== String(nip)) {
        return { status: 'error', message: 'Akses Ditolak: Sesi kedaluwarsa atau manipulasi terdeteksi. Silakan login ulang.' };
    }
    // ===============================================
    
    // ZETTBOT FIX: Mempercepat sinkronisasi saat Login pertama kali
    let ss;
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch(e) {}
    if(!ss) ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));

    const data = { user: null, usersList: [], pendingPkpCount: 0 };
    
    function normalizeDateDB(dateStr) {
       if (!dateStr) return "";
       if (dateStr.includes('-') && dateStr.split('-')[0].length === 4) return dateStr;
       let parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
       if (parts.length === 3) {
           let d = parts[0].padStart(2, '0');
           let m = parts[1].padStart(2, '0');
           let y = parts[2];
           if (y.length === 2) y = "20" + y; 
           return `${y}-${m}-${d}`;
       }
       return dateStr;
    }

    const sheetUser = ss.getSheetByName('user_data');
    if(sheetUser) {
       const uData = sheetUser.getDataRange().getDisplayValues();
       for(let i=1; i<uData.length; i++) {
          const u = {
            nip: uData[i][0], nama: uData[i][1], jabatan: uData[i][2], role: uData[i][3],
            no_hp: uData[i][4], pass: uData[i][5],
            s_tahunan_2024: uData[i][6], s_tahunan_2025: uData[i][7], s_tahunan_2026: uData[i][8],
            s_sakit: uData[i][9], s_penting: uData[i][10], s_besar: uData[i][11], s_melahirkan: uData[i][12], s_cltn: uData[i][13],
            pangkat: uData[i][14], alamat: uData[i][15], 
            tmt_kgb: normalizeDateDB(uData[i][16]),
            tmt_knp: normalizeDateDB(uData[i][17]),
            bup: uData[i][18], status_kgb: uData[i][19] || '', tgl_selesai_kgb: uData[i][20] || '',
            status_knp: uData[i][21] || '', tgl_selesai_knp: uData[i][22] || '',
            status_pensiun: uData[i][23] || '', tgl_selesai_pensiun: uData[i][24] || '',
            jenis_jabatan: uData[i][25] || 'Fungsional Umum' // Menarik Data Jenis Jabatan dari indeks ke-25
        };
          data.usersList.push(u);
          if (String(uData[i][0]) === String(nip)) data.user = u;
       }
    }

    // ZETTBOT FIX: Quick count data PKP khusus untuk Badge Sidebar
    data.pendingPkpCount = 0;
    const sheetPkpDoc = ss.getSheetByName('pkp_dokumen');
    const sheetPckDoc = ss.getSheetByName('pck_dokumen');
    let pendingCount = 0;
    
    if (sheetPkpDoc) {
        const pkpData = sheetPkpDoc.getDataRange().getDisplayValues();
        const bawahanMap = {}; // Untuk memetakan atasan di PCK
        
        for(let i=1; i<pkpData.length; i++) {
            bawahanMap[pkpData[i][1] + "-" + pkpData[i][3]] = pkpData[i][2]; // nip-tahun = penilai
            
            let dbPenilai = String(pkpData[i][2]).replace(/'/g, "").trim();
            let dbAtasan = String(pkpData[i][7] || "").replace(/'/g, "").trim();
            let status = pkpData[i][4];
            
            // Hitung PK yang butuh validasi saya
            if ((dbPenilai === String(nip) && status === "Menunggu Penilai") || 
                (dbAtasan === String(nip) && status === "Menunggu Atasan Penilai")) {
                pendingCount++;
            }
        }
        
        if (sheetPckDoc) {
            const pckData = sheetPckDoc.getDataRange().getDisplayValues();
            for(let j=1; j<pckData.length; j++) {
                let nipPemilik = String(pckData[j][1]).replace(/'/g, "").trim();
                let tahun = pckData[j][3];
                let status = pckData[j][6];
                let penilai = String(bawahanMap[nipPemilik + "-" + tahun] || "").replace(/'/g, "").trim();
                
                // Hitung PCK yang butuh validasi saya (Hanya Atasan Langsung)
                if (penilai === String(nip) && status === "Menunggu Penilai") {
                    pendingCount++;
                }
            }
        }
    }
    data.pendingPkpCount = pendingCount;

    return { status: 'success', data: data };
  } catch (e) { return { status: 'error', message: e.toString() }; }
}

// ==========================================
// ZETTBOT: FUNGSI BACKGROUND SYNC (LAZY LOADING)
// Menarik data berat ke memori lokal tanpa mengganggu UX
// ==========================================
function getBackgroundData(nip, clientToken) {
  try {
    // === VALIDASI KEAMANAN ===
    if (!clientToken) return { status: 'error', message: 'Sesi tidak valid.' };
    const cache = CacheService.getScriptCache();
    if (cache.get(clientToken) !== String(nip)) return { status: 'error', message: 'Sesi kedaluwarsa.' };
    
    let ss;
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch(e) {}
    if(!ss) ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));

    const data = { cutiLogs: [], jobdesList: [], skList: [], skAckList: [], masterKinerjaList: [], ikLogs: [], ipLogs: [], wfhLogs: [], kinerjaList: [], stList: [], sopList: [], sopAckList: [] };

    // 1. Sedot Master Kinerja
    const sheetMasterKinerja = ss.getSheetByName('master_kinerja');
    if(sheetMasterKinerja) {
       const mkData = sheetMasterKinerja.getDataRange().getDisplayValues();
       for(let i=1; i<mkData.length; i++) {
          if (mkData[i][0] && mkData[i][0] !== "ID_Tugas") {
             data.masterKinerjaList.push({ id_tugas: mkData[i][0], jabatan: mkData[i][1], kategori: mkData[i][2], sasaran: mkData[i][3], indikator: mkData[i][4], satuan: mkData[i][5], mutu: mkData[i][6], waktu: mkData[i][7] });
          }
       }
    }

    // 2. Sedot Cuti Log
    const sheetCuti = ss.getSheetByName('cuti_log');
    if(sheetCuti) {
       const cData = sheetCuti.getDataRange().getDisplayValues();
       for(let i=1; i<cData.length; i++) {
          data.cutiLogs.push({ id: cData[i][0], tgl_pengajuan: cData[i][1], nip: cData[i][2], jenis: cData[i][3], tgl_mulai: cData[i][4], tgl_selesai: cData[i][5], alasan: cData[i][6], status: cData[i][7], catatan: cData[i][8], atasan_nip: cData[i][9], pejabat_nip: cData[i][10], sisa_cuti: cData[i][11], catatan_pejabat: cData[i][12], status_atasan: cData[i][13], status_pejabat: cData[i][14], alamat: cData[i][15], history: cData[i][16], bukti_url: cData[i][17] });
       }
    }
    
    // 3. Sedot Jobdes
    const sheetJobdes = ss.getSheetByName('jobdes_data');
    if(sheetJobdes) {
       const jData = sheetJobdes.getDataRange().getDisplayValues();
       for(let i=1; i<jData.length; i++) {
          data.jobdesList.push({ nip: String(jData[i][0]), atasan_nip: String(jData[i][1]), dasar_lampiran: jData[i][2], ikhtisar_jabatan: jData[i][3], tugas_pokok: jData[i][4], tugas_tambahan: jData[i][5], tanggung_jawab: jData[i][6], hasil_kerja: jData[i][7] });
       }
    }

    // 4. Sedot Kinerja
    const sheetKinerja = ss.getSheetByName('ekinerja_data');
    if(sheetKinerja) {
       const kData = sheetKinerja.getDataRange().getDisplayValues();
       for(let i=1; i<kData.length; i++) {
          data.kinerjaList.push({ id: String(kData[i][0]), nip: String(kData[i][1]), pejabat_nip: String(kData[i][2]), tahun: kData[i][3], periode: kData[i][4], predikat: kData[i][5], file_penilaian: kData[i][6], file_evaluasi: kData[i][7], status: kData[i][8], tgl_tte: kData[i][9], file_pengesahan: kData[i][10], tgl_input: kData[i][11] });
       }
    }

    // 5. Sedot ST
    const sheetST = ss.getSheetByName('st_log');
    if(sheetST) {
       const stData = sheetST.getDataRange().getDisplayValues();
       for(let i=1; i<stData.length; i++) {
          data.stList.push({ id: stData[i][0], waktu: stData[i][1], nomor: stData[i][2], menimbang: stData[i][3], dasar: stData[i][4], tujuan: stData[i][5], tempat: stData[i][6], tgl_mulai: stData[i][7], tgl_selesai: stData[i][8], jam: stData[i][9], peserta: stData[i][10], pejabat_ttd: stData[i][11], status: stData[i][12], data_ekstra: stData[i][13] || '{}' });
       }
    }

    // 6. Sedot Izin Keluar
    const sheetIK = ss.getSheetByName('izin_keluar_log');
    if(sheetIK) {
       const ikData = sheetIK.getDataRange().getDisplayValues();
       for(let i=1; i<ikData.length; i++) {
          data.ikLogs.push({ id: ikData[i][0], tgl_pengajuan: ikData[i][1], nip: ikData[i][2], tanggal: ikData[i][3], jam_keluar: ikData[i][4], jam_kembali: ikData[i][5], alasan: ikData[i][6], atasan_nip: ikData[i][7], status: ikData[i][8], catatan: ikData[i][9] });
       }
    }

    // 7. Sedot Izin Pribadi
    const sheetIP = ss.getSheetByName('izin_pribadi_log');
    if(sheetIP) {
       const ipData = sheetIP.getDataRange().getDisplayValues();
       for(let i=1; i<ipData.length; i++) {
          data.ipLogs.push({ id: ipData[i][0], tgl_pengajuan: ipData[i][1], nip: ipData[i][2], tgl_mulai: ipData[i][3], tgl_selesai: ipData[i][4], alasan: ipData[i][5], atasan_nip: ipData[i][6], status: ipData[i][7], catatan: ipData[i][8] });
       }
    }

    // 8. Sedot WFH
    const sheetWFH = ss.getSheetByName('wfh_log');
    if(sheetWFH) {
       const wfhData = sheetWFH.getDataRange().getDisplayValues();
       for(let i=1; i<wfhData.length; i++) {
          data.wfhLogs.push({ id: wfhData[i][0], tgl_pengajuan: wfhData[i][1], nip: wfhData[i][2], tanggal: wfhData[i][3], rencana_json: wfhData[i][4], laporan_json: wfhData[i][5], atasan_nip: wfhData[i][6], status_rencana: wfhData[i][7], status_laporan: wfhData[i][8], catatan: wfhData[i][9] });
       }
    }

    // 9. Sedot SK
    data.skList = typeof fetchSkData === 'function' ? fetchSkData(ss) : [];
    data.skAckList = typeof fetchSkAckData === 'function' ? fetchSkAckData(ss) : [];

    // 10. Sedot SOP
    const sheetSop = ss.getSheetByName('sop_data');
    if(sheetSop) {
       const sopData = sheetSop.getDataRange().getDisplayValues();
       for(let i=1; i<sopData.length; i++) {
          data.sopList.push({ id: String(sopData[i][0]), judul_sop: sopData[i][1], kategori_pj: sopData[i][2], nomor_sop: sopData[i][3], tanggal_pembuatan: sopData[i][4], tanggal_revisi: sopData[i][5], tanggal_efektif: sopData[i][6], link_drive: sopData[i][7], pelaksana_json: sopData[i][8], tgl_input: sopData[i][9] });
       }
    }
    const sheetAck = ss.getSheetByName('sop_ack');
    if(sheetAck) {
       const ackData = sheetAck.getDataRange().getDisplayValues();
       for(let i=1; i<ackData.length; i++) {
          if (ackData[i][0] && String(ackData[i][0]).trim() !== '') {
             data.sopAckList.push({ id: String(ackData[i][0]), sop_id: String(ackData[i][1]), nip: String(ackData[i][2]), tanggal_baca: ackData[i][3] });
          }
       }
    }

    return { status: 'success', data: data };
  } catch (e) { return { status: 'error', message: e.toString() }; }
}

// ==========================================
// BACKEND FITUR LUPA PASSWORD
// ==========================================
function initResetPasswordSheet() {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
  let sheet = ss.getSheetByName('log_reset_pass');
  if (!sheet) {
    sheet = ss.insertSheet('log_reset_pass');
    sheet.appendRow(['ID', 'Waktu', 'NIP', 'Nama', 'No_WA', 'Password']);
    sheet.getRange("A1:F1").setFontWeight("bold").setBackground("#d9ead3");
    sheet.setFrozenRows(1);
  }
  return "Setup sheet log_reset_pass berhasil. Siap digunakan.";
}

function requestPasswordReset(no_wa) {
  try {
    let phone = String(no_wa).replace(/[^0-9]/g, '');
    if (phone.startsWith('0')) {
      phone = '62' + phone.substring(1);
    }

    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const userSheet = ss.getSheetByName('user_data');
    if(!userSheet) throw new Error("Database user tidak ditemukan");
    
    const userData = userSheet.getDataRange().getDisplayValues(); 

    let userFound = null;
    for (let i = 1; i < userData.length; i++) {
      let userPhoneRaw = String(userData[i][4] || '').replace(/[^0-9]/g, '');
      if (userPhoneRaw.startsWith('0')) {
         userPhoneRaw = '62' + userPhoneRaw.substring(1);
      }
      
      if (userPhoneRaw === phone && phone.length > 8) {
        userFound = {
          nip: userData[i][0], nama: userData[i][1], no_wa: phone, pass: userData[i][5] 
        };
        break;
      }
    }

    if (!userFound) return { status: 'error', message: 'Nomor WhatsApp ini tidak terdaftar di dalam sistem pegawai. Silakan periksa kembali atau hubungi Admin.' };

    const logSheet = ss.getSheetByName('log_reset_pass');
    if(!logSheet) throw new Error("Database antrean belum siap. Minta Super Admin menjalankan initResetPasswordSheet() terlebih dahulu.");
    
    const uniqueId = 'REQ-' + new Date().getTime();
    const timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');

    logSheet.appendRow([uniqueId, timestamp, userFound.nip, userFound.nama, userFound.no_wa, userFound.pass]);
    SpreadsheetApp.flush();

    return { status: 'success', message: 'Permintaan berhasil dikirim. Admin akan segera memverifikasi dan mengirimkan kata sandi ke WA Anda.' };
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function getResetPasswordQueue() {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('log_reset_pass');
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getDisplayValues();
    const queue = [];
    for(let i = 1; i < data.length; i++) {
      if(data[i][0] && String(data[i][0]).trim() !== '') { 
        queue.push({
          id: data[i][0], waktu: data[i][1], nip: data[i][2],
          nama: data[i][3], no_wa: data[i][4], pass: data[i][5]
        });
      }
    }
    return queue;
  } catch (err) { throw new Error(err.toString()); }
}

function markResetAsDone(reqId) {
  try {
    const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
    const sheet = ss.getSheetByName('log_reset_pass');
    const data = sheet.getDataRange().getValues();
    
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(reqId)) {
        rowIndex = i + 1;
        break;
      }
    }
    
    if (rowIndex !== -1) {
      sheet.deleteRow(rowIndex);
      SpreadsheetApp.flush();
      return { status: 'success' };
    }
    throw new Error("Antrean dengan ID tersebut tidak ditemukan atau sudah diproses orang lain.");
  } catch(e) {
    return { status: 'error', message: e.toString() };
  }
}