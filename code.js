// ==========================================
// FILE: code.gs (Core Controller & API)
// ==========================================

function doGet(e) {
  // 1. TRANSKEP ADAPTOR: Cek apakah pemanggil adalah API (GitHub Pages / Domain Luar)
  if (e && e.parameter && (e.parameter.api === 'true' || e.parameter.format === 'json')) {
    return handleApiGet_(e);
  }

  // 2. Default: Tetap render Web App Google Apps Script (Google Sites Legacy 100% Utuh)
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
// FUNGSI PEMBANTU KONEKSI & KEAMANAN (TRANSKEP)
// ------------------------------------------

// 1. Sentralisasi Koneksi Database (DRY)
function getDB() {
  let ss;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch(e) {}
  if(!ss) ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty("TRANSKEP_DB_ID"));
  return ss;
}

// 2. Sentralisasi Validasi Token Sesi (DRY)
function cekOtorisasi(nip, clientToken) {
  if (!clientToken) return false;
  const cache = CacheService.getScriptCache();
  const serverNipOwner = cache.get(clientToken);
  // Cek apakah token ada dan NIP peminta cocok dengan pemilik token
  if (!serverNipOwner || serverNipOwner !== String(nip)) return false;
  return true;
}

// 3. Sentralisasi Validasi Role Admin (DRY & RBAC)
function cekOtorisasiAdmin(nip, clientToken) {
  if (!cekOtorisasi(nip, clientToken)) return false;
  const cache = CacheService.getScriptCache();
  const cachedRole = cache.get(clientToken + "_role");
  if (cachedRole && cachedRole.toLowerCase() === 'admin') return true;
  
  // Fallback verifikasi database jika cache role ter-evict
  const ss = getDB();
  const sheet = ss.getSheetByName('user_data');
  if (!sheet) return false;
  const data = sheet.getDataRange().getDisplayValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(nip)) {
      const isAdm = String(data[i][3]).toLowerCase() === 'admin';
      if (isAdm) cache.put(clientToken + "_role", 'Admin', 28800);
      return isAdm;
    }
  }
  return false;
}

// 3b. Sentralisasi Validasi Role Admin / Operator (DRY & RBAC)
function cekOtorisasiAdminOrOperator(nip, clientToken) {
  if (!cekOtorisasi(nip, clientToken)) return false;
  const cache = CacheService.getScriptCache();
  const cachedRole = cache.get(clientToken + "_role");
  if (cachedRole) {
    const cr = cachedRole.toLowerCase().trim();
    if (cr === 'admin' || cr === 'operator') return true;
  }
  
  // Fallback verifikasi database jika cache role ter-evict
  const ss = getDB();
  const sheet = ss.getSheetByName('user_data');
  if (!sheet) return false;
  const data = sheet.getDataRange().getDisplayValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(nip)) {
      const roleStr = String(data[i][3] || '').toLowerCase().trim();
      const isAuthorized = roleStr === 'admin' || roleStr === 'operator';
      if (isAuthorized) cache.put(clientToken + "_role", data[i][3], 28800);
      return isAuthorized;
    }
  }
  return false;
}

// 4. Sentralisasi Sanitasi Anti Formula / CSV Injection (CWE-1236)
function sanitizeFormulaInput(val) {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('=') || trimmed.startsWith('+') || trimmed.startsWith('@') || (trimmed.startsWith('-') && !/^-?\d+(\.\d+)?$/.test(trimmed))) {
      return "'" + val;
    }
  }
  return val;
}

function sanitizeRowArray(row) {
  if (!Array.isArray(row)) return row;
  return row.map(cell => sanitizeFormulaInput(cell));
}

// 5. Sentralisasi Hashing Kriptografis Salted SHA-256 (Anti-Rainbow Table & Plaintext Leak)
function hashPassword_(plainPassword, salt) {
  if (!salt) salt = Utilities.getUuid().substring(0, 8);
  const rawBytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + ":" + plainPassword,
    Utilities.Charset.UTF_8
  );
  let hashHex = '';
  for (let i = 0; i < rawBytes.length; i++) {
    let byteVal = rawBytes[i];
    if (byteVal < 0) byteVal += 256;
    let byteHex = byteVal.toString(16);
    if (byteHex.length === 1) byteHex = '0' + byteHex;
    hashHex += byteHex;
  }
  return "SHA256$" + salt + "$" + hashHex;
}

function verifyPasswordHash_(storedValue, inputPassword) {
  if (!storedValue || !inputPassword) return false;
  const storedStr = String(storedValue);
  // Format hash Salted SHA-256
  if (storedStr.startsWith("SHA256$")) {
    const parts = storedStr.split("$");
    if (parts.length === 3) {
      const salt = parts[1];
      const expectedHash = hashPassword_(inputPassword, salt);
      return storedStr === expectedHash;
    }
  }
  // Mode transisi legacy plaintext
  return storedStr === String(inputPassword);
}

// 6. Revokasi Sesi Server-Side (CWE-613)
function logoutSession(nip, clientToken) {
  try {
    if (clientToken) {
      const cache = CacheService.getScriptCache();
      cache.remove(clientToken);
      cache.remove(clientToken + "_role");
    }
    return { status: 'success' };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

// 7. Gateway Otomatisasi WhatsApp (n8n + WAHA Gateway) - TRANSKEP Enterprise Engine v3.0
function getGatewayConfig_() {
  const props = PropertiesService.getScriptProperties();
  const rawUrl = props.getProperty('N8N_WEBHOOK_URL') || props.getProperty('WAHA_BASE_URL') || 'https://supernova-endpoint-unsubtly.ngrok-free.dev/webhook/transkep-gateway';
  
  let endpoint = rawUrl.trim().replace(/\/+$/, '');
  if (!endpoint.includes('/webhook') && !endpoint.includes('/api/')) {
    endpoint += '/webhook/transkep-gateway';
  }
  
  return {
    endpoint: endpoint,
    apiKey: props.getProperty('WAHA_API_KEY') || '192167ce5e0147dcb4eaaaff7eccfc18',
    session: props.getProperty('WAHA_SESSION') || 'default'
  };
}

function getWahaConfig_() {
  return getGatewayConfig_();
}

function normalizePhone_(raw) {
  if (!raw) return '';
  let clean = String(raw).replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.substring(1);
  } else if (clean.startsWith('8')) {
    clean = '62' + clean;
  }
  return clean;
}

function sendWhatsAppMessage_(rawPhone, text, metaPayload) {
  try {
    if (!rawPhone) return { status: 'error', message: 'Nomor WhatsApp tidak boleh kosong.' };
    
    let phone = normalizePhone_(rawPhone);
    
    if (phone.length < 10) { // Minimal 10 digit (628...)
      return { status: 'error', message: 'Nomor WhatsApp tidak valid (minimal 10 digit).' };
    }
    
    const config = getGatewayConfig_();
    
    // Payload terpadu untuk n8n Gateway
    const payload = {
      jenis_pesan: (metaPayload && metaPayload.jenis_pesan) ? metaPayload.jenis_pesan : 'direct',
      nomor_wa: phone,
      pesan: String(text || '')
    };
    
    // Gabungkan meta data terstruktur tambahan jika ada
    if (metaPayload && typeof metaPayload === 'object') {
      for (let k in metaPayload) {
        payload[k] = metaPayload[k];
      }
    }
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'X-Api-Key': config.apiKey,
        'ngrok-skip-browser-warning': 'true'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(config.endpoint, options);
    const respCode = response.getResponseCode();
    const respText = response.getContentText();
    
    if (respCode >= 200 && respCode < 300) {
      return { status: 'success', data: respText };
    } else {
      Logger.log("n8n Gateway returned HTTP " + respCode + ": " + respText);
      return { status: 'error', code: respCode, message: respText };
    }
  } catch (err) {
    Logger.log("sendWhatsAppMessage_ exception: " + err.toString());
    return { status: 'error', message: err.toString() };
  }
}

// ------------------------------------------
// 1. AUTENTIKASI & TARIK DATA (CORE)
// ------------------------------------------
function verifyLogin(nip, pass) {
  try {
    // Memanggil koneksi database terpusat
    const ss = getDB();
    
    const sheet = ss.getSheetByName('user_data');
    const data = sheet.getDataRange().getDisplayValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(nip)) {
        const storedPass = String(data[i][5]);
        if (verifyPasswordHash_(storedPass, pass)) {
          const user = {
            nip: data[i][0], nama: data[i][1], jabatan: data[i][2], role: data[i][3],
            no_hp: data[i][4], s_tahunan_2024: data[i][6], s_tahunan_2025: data[i][7],
            s_tahunan_2026: data[i][8], s_sakit: data[i][9], s_penting: data[i][10],
            s_besar: data[i][11], s_melahirkan: data[i][12], s_cltn: data[i][13],
            pangkat: data[i][14], alamat: data[i][15]
          };

          const sessionToken = Utilities.getUuid();
          const cache = CacheService.getScriptCache();
          cache.put(sessionToken, String(nip), 28800); 
          cache.put(sessionToken + "_role", String(user.role), 28800);

          let cachedTemp = null;
          try {
            cachedTemp = CacheService.getScriptCache().get("force_reset_" + nip);
          } catch(e) {}

          const isTempPass = (typeof pass === 'string' && /^TR-\d{6}$/.test(pass.trim())) || !!cachedTemp;
          if (typeof pass === 'string' && /^TR-\d{6}$/.test(pass.trim())) {
            try {
              CacheService.getScriptCache().put("force_reset_" + nip, pass.trim(), 86400);
            } catch(e) {}
          }
          return { status: 'success', data: user, token: sessionToken, must_change_password: isTempPass };
        }
      }
    }
    return { status: 'error', message: 'NIP atau Sandi tidak valid' };
  } catch (e) { return { status: 'error', message: e.toString() }; }
}

function getBulkData(nip, clientToken) {
  try {
    // === VALIDASI KEAMANAN TERPUSAT ===
    if (!cekOtorisasi(nip, clientToken)) {
        return { status: 'error', message: 'Akses Ditolak: Sesi kedaluwarsa atau manipulasi terdeteksi. Silakan login ulang.' };
    }
    
    // Memanggil koneksi database terpusat
    const ss = getDB();

    let cachedTempPass = null;
    try {
      cachedTempPass = CacheService.getScriptCache().get("force_reset_" + nip);
    } catch(e) {}

    const data = { 
      user: null, 
      usersList: [], 
      pendingPkpCount: 0,
      must_change_password: !!cachedTempPass,
      temp_pass: cachedTempPass || ''
    };
    
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

       // TRANSKEP HOTFIX KREDENSIAL: Cek apakah user yang login berhak melihat sandi (Admin saja)
       let isRequesterAdmin = false;
       for (let i = 1; i < uData.length; i++) {
          if (String(uData[i][0]) === String(nip) && String(uData[i][3]).toLowerCase() === 'admin') {
             isRequesterAdmin = true;
             break;
          }
       }

       for(let i=1; i<uData.length; i++) {
          const isCurrentUser = (String(uData[i][0]) === String(nip));
          // Password HANYA disertakan jika peminta adalah Admin, atau untuk akun user itu sendiri
          const userPassword = (isRequesterAdmin || isCurrentUser) ? uData[i][5] : '';

          const u = {
            nip: uData[i][0], nama: uData[i][1], jabatan: uData[i][2], role: uData[i][3],
            no_hp: uData[i][4], pass: userPassword,
            s_tahunan_2024: uData[i][6], s_tahunan_2025: uData[i][7], s_tahunan_2026: uData[i][8],
            s_sakit: uData[i][9], s_penting: uData[i][10], s_besar: uData[i][11], s_melahirkan: uData[i][12], s_cltn: uData[i][13],
            pangkat: uData[i][14], alamat: uData[i][15], 
            tmt_kgb: normalizeDateDB(uData[i][16]),
            tmt_knp: normalizeDateDB(uData[i][17]),
            bup: uData[i][18], status_kgb: uData[i][19] || '', tgl_selesai_kgb: uData[i][20] || '',
            status_knp: uData[i][21] || '', tgl_selesai_knp: uData[i][22] || '',
            status_pensiun: uData[i][23] || '', tgl_selesai_pensiun: uData[i][24] || '',
            jenis_jabatan: uData[i][25] || 'Fungsional Umum'
        };
          data.usersList.push(u);
          if (isCurrentUser) data.user = u;
       }
    }

    data.pendingPkpCount = 0;
    const sheetPkpDoc = ss.getSheetByName('pkp_dokumen');
    const sheetPckDoc = ss.getSheetByName('pck_dokumen');
    let pendingCount = 0;
    
    if (sheetPkpDoc) {
        const pkpData = sheetPkpDoc.getDataRange().getDisplayValues();
        const bawahanMap = {}; 
        
        for(let i=1; i<pkpData.length; i++) {
            bawahanMap[pkpData[i][1] + "-" + pkpData[i][3]] = pkpData[i][2]; 
            
            let dbPenilai = String(pkpData[i][2]).replace(/'/g, "").trim();
            let dbAtasan = String(pkpData[i][7] || "").replace(/'/g, "").trim();
            let status = pkpData[i][4];
            
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

function getBackgroundData(nip, clientToken) {
  try {
    // === VALIDASI KEAMANAN TERPUSAT ===
    if (!cekOtorisasi(nip, clientToken)) {
        return { status: 'error', message: 'Sesi kedaluwarsa atau tidak valid.' };
    }
    
    // Memanggil koneksi database terpusat
    const ss = getDB();

    const data = { cutiLogs: [], jobdesList: [], skList: [], skAckList: [], masterKinerjaList: [], ikLogs: [], ipLogs: [], wfhLogs: [], kinerjaList: [], stList: [], sopList: [], sopAckList: [] };

    const sheetMasterKinerja = ss.getSheetByName('master_kinerja');
    if(sheetMasterKinerja) {
       const mkData = sheetMasterKinerja.getDataRange().getDisplayValues();
       for(let i=1; i<mkData.length; i++) {
          if (mkData[i][0] && mkData[i][0] !== "ID_Tugas") {
             data.masterKinerjaList.push({ id_tugas: mkData[i][0], jabatan: mkData[i][1], kategori: mkData[i][2], sasaran: mkData[i][3], indikator: mkData[i][4], satuan: mkData[i][5], mutu: mkData[i][6], waktu: mkData[i][7] });
          }
       }
    }

    const sheetCuti = ss.getSheetByName('cuti_log');
    if(sheetCuti) {
       const cData = sheetCuti.getDataRange().getDisplayValues();
       for(let i=1; i<cData.length; i++) {
          if (!cData[i][0]) continue;
          data.cutiLogs.push({
            id: cData[i][0],
            tgl_pengajuan: cData[i][1],
            nip: String(cData[i][2] || '').trim().replace(/'/g, ''),
            jenis: cData[i][3],
            tgl_mulai: cData[i][4],
            tgl_selesai: cData[i][5],
            alasan: cData[i][6],
            status: cData[i][7],
            catatan: cData[i][8],
            atasan_nip: String(cData[i][9] || '').trim().replace(/'/g, ''),
            pejabat_nip: String(cData[i][10] || '').trim().replace(/'/g, ''),
            sisa_cuti: cData[i][11],
            catatan_pejabat: cData[i][12],
            status_atasan: cData[i][13],
            status_pejabat: cData[i][14],
            alamat: cData[i][15],
            history: cData[i][16],
            bukti_url: cData[i][17]
          });
       }
    }
    
    const sheetJobdes = ss.getSheetByName('jobdes_data');
    if(sheetJobdes) {
       const jData = sheetJobdes.getDataRange().getDisplayValues();
       for(let i=1; i<jData.length; i++) {
          data.jobdesList.push({ nip: String(jData[i][0] || '').trim().replace(/'/g, ''), atasan_nip: String(jData[i][1] || '').trim().replace(/'/g, ''), dasar_lampiran: jData[i][2], ikhtisar_jabatan: jData[i][3], tugas_pokok: jData[i][4], tugas_tambahan: jData[i][5], tanggung_jawab: jData[i][6], hasil_kerja: jData[i][7] });
       }
    }

    const sheetKinerja = ss.getSheetByName('ekinerja_data');
    if(sheetKinerja) {
       const kData = sheetKinerja.getDataRange().getDisplayValues();
       for(let i=1; i<kData.length; i++) {
          data.kinerjaList.push({ id: String(kData[i][0]), nip: String(kData[i][1] || '').trim().replace(/'/g, ''), pejabat_nip: String(kData[i][2] || '').trim().replace(/'/g, ''), tahun: kData[i][3], periode: kData[i][4], predikat: kData[i][5], file_penilaian: kData[i][6], file_evaluasi: kData[i][7], status: kData[i][8], tgl_tte: kData[i][9], file_pengesahan: kData[i][10], tgl_input: kData[i][11] });
       }
    }

    const sheetST = ss.getSheetByName('st_log');
    if(sheetST) {
       const stData = sheetST.getDataRange().getDisplayValues();
       for(let i=1; i<stData.length; i++) {
          data.stList.push({ id: stData[i][0], waktu: stData[i][1], nomor: stData[i][2], menimbang: stData[i][3], dasar: stData[i][4], tujuan: stData[i][5], tempat: stData[i][6], tgl_mulai: stData[i][7], tgl_selesai: stData[i][8], jam: stData[i][9], peserta: stData[i][10], pejabat_ttd: String(stData[i][11] || '').trim().replace(/'/g, ''), status: stData[i][12], data_ekstra: stData[i][13] || '{}' });
       }
    }

    const sheetIK = ss.getSheetByName('izin_keluar_log');
    if(sheetIK) {
       const ikData = sheetIK.getDataRange().getDisplayValues();
       for(let i=1; i<ikData.length; i++) {
          data.ikLogs.push({ id: ikData[i][0], tgl_pengajuan: ikData[i][1], nip: String(ikData[i][2] || '').trim().replace(/'/g, ''), tanggal: ikData[i][3], jam_keluar: ikData[i][4], jam_kembali: ikData[i][5], alasan: ikData[i][6], atasan_nip: String(ikData[i][7] || '').trim().replace(/'/g, ''), status: ikData[i][8], catatan: ikData[i][9] });
       }
    }

    const sheetIP = ss.getSheetByName('izin_pribadi_log');
    if(sheetIP) {
       const ipData = sheetIP.getDataRange().getDisplayValues();
       for(let i=1; i<ipData.length; i++) {
          data.ipLogs.push({ id: ipData[i][0], tgl_pengajuan: ipData[i][1], nip: String(ipData[i][2] || '').trim().replace(/'/g, ''), tgl_mulai: ipData[i][3], tgl_selesai: ipData[i][4], alasan: ipData[i][5], atasan_nip: String(ipData[i][7] || '').trim().replace(/'/g, ''), status: ipData[i][7], catatan: ipData[i][8] });
       }
    }

    const sheetWFH = ss.getSheetByName('wfh_log');
    if(sheetWFH) {
       const wfhData = sheetWFH.getDataRange().getDisplayValues();
       for(let i=1; i<wfhData.length; i++) {
          data.wfhLogs.push({ id: wfhData[i][0], tgl_pengajuan: wfhData[i][1], nip: String(wfhData[i][2] || '').trim().replace(/'/g, ''), tanggal: wfhData[i][3], rencana_json: wfhData[i][4], laporan_json: wfhData[i][5], atasan_nip: String(wfhData[i][6] || '').trim().replace(/'/g, ''), status_rencana: wfhData[i][7], status_laporan: wfhData[i][8], catatan: wfhData[i][9] });
       }
    }

    data.skList = typeof fetchSkData === 'function' ? fetchSkData(ss) : [];
    data.skAckList = typeof fetchSkAckData === 'function' ? fetchSkAckData(ss) : [];

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
  const ss = getDB(); // Menggunakan koneksi database terpusat
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
    let phone = normalizePhone_(no_wa);
    if (!phone || phone.length < 9) {
      return { status: 'error', message: 'Nomor WhatsApp tidak valid (minimal 9 digit).' };
    }

    const ss = getDB(); // Menggunakan koneksi database terpusat
    const userSheet = ss.getSheetByName('user_data');
    if(!userSheet) throw new Error("Database user tidak ditemukan");
    
    const userData = userSheet.getDataRange().getDisplayValues(); 

    let userFound = null;
    let userRowIndex = -1;
    for (let i = 1; i < userData.length; i++) {
      let userPhoneRaw = normalizePhone_(userData[i][4]);
      
      let isMatch = false;
      if (userPhoneRaw === phone && phone.length > 8) {
        isMatch = true;
      } else if (phone.length >= 9 && userPhoneRaw.length >= 9) {
        // Fallback kecocokan 9 digit terakhir (mengantisipasi variasi awalan 0 / 62 / 8)
        if (phone.slice(-9) === userPhoneRaw.slice(-9)) {
          isMatch = true;
        }
      }
      
      if (isMatch) {
        userFound = {
          nip: userData[i][0], nama: userData[i][1], no_wa: phone, pass: userData[i][5] 
        };
        userRowIndex = i + 1;
        break;
      }
    }

    if (!userFound || userRowIndex === -1) return { status: 'error', message: 'Nomor WhatsApp ini tidak terdaftar di dalam sistem pegawai. Silakan periksa kembali atau hubungi Admin.' };

    // 1. Generate Kata Sandi Sementara (6 Digit OTP)
    const tempPass = "TR-" + Math.floor(100000 + Math.random() * 900000);
    const newHashedPass = hashPassword_(tempPass);
    userSheet.getRange(userRowIndex, 6).setValue(newHashedPass);

    try {
      CacheService.getScriptCache().put("force_reset_" + userFound.nip, tempPass, 86400);
    } catch(e) {}

    // 2. Kirim otomatis via WhatsApp Gateway WAHA
    const waText = "*TRANSKEP - RESET SANDI SEMENTARA* 🏢\n\n" +
      "Halo *" + userFound.nama + "*,\n\n" +
      "Permintaan reset kata sandi akun TRANSKEP Anda berhasil diproses.\n" +
      "Berikut kredensial masuk sementara Anda:\n\n" +
      "👤 *NIP:* " + userFound.nip + "\n" +
      "🔑 *Sandi Sementara:* *" + tempPass + "*\n\n" +
      "⚠️ *Perhatian:* Segera login ke portal dan perbarui kata sandi Anda di menu profil demi keamanan akun.\n\n" +
      "🔗 *Link Login Portal:* https://transkep.github.io/";

    let waResult = sendWhatsAppMessage_(userFound.no_wa, waText, {
      jenis_pesan: 'reset_password',
      nama: userFound.nama,
      nip: userFound.nip,
      password_baru: tempPass
    });

    // 3. Evaluasi Hasil Kirim WAHA
    if (waResult && waResult.status === 'success') {
      // Jika berhasil kirim WA otomatis:
      // Bersihkan antrean lama di log_reset_pass untuk user ini agar tidak masuk manual ke admin
      try {
        let logSheet = ss.getSheetByName('log_reset_pass');
        if (logSheet) {
          const lData = logSheet.getDataRange().getDisplayValues();
          for (let r = lData.length - 1; r >= 1; r--) {
            if (String(lData[r][2]).trim() === String(userFound.nip).trim()) {
              logSheet.deleteRow(r + 1);
            }
          }
        }
      } catch(e) {}
      
      SpreadsheetApp.flush();
      return { 
        status: 'success', 
        message: 'Kata sandi sementara telah berhasil dikirim otomatis ke nomor WhatsApp Anda (' + userFound.no_wa + ').' 
      };
    } else {
      // 4. PLAN B (CADANGAN): Hanya jika WAHA GAGAL / OFFLINE, catat ke antrean manual Admin!
      let logSheet = ss.getSheetByName('log_reset_pass');
      if (!logSheet) {
        initResetPasswordSheet();
        logSheet = ss.getSheetByName('log_reset_pass');
      }
      
      const uniqueId = 'REQ-' + new Date().getTime();
      const timestamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
      logSheet.appendRow([uniqueId, timestamp, userFound.nip, userFound.nama, userFound.no_wa, tempPass]);
      SpreadsheetApp.flush();

      return { 
        status: 'success', 
        message: 'Layanan WhatsApp otomatis sedang sibuk/offline. Permintaan reset berhasil dicatat dan Admin akan segera mengirimkannya secara manual.' 
      };
    }
  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}

function getResetPasswordQueue(adminNip, clientToken) {
  try {
    // TRANSKEP HOTFIX KREDENSIAL: Proteksi RBAC wajib Admin
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      throw new Error("Akses Ditolak: Anda tidak memiliki izin Admin untuk mengakses antrean ini.");
    }
    const ss = getDB(); // Menggunakan koneksi database terpusat
    const sheet = ss.getSheetByName('log_reset_pass');
    if (!sheet) return [];
    
    // Tarik mapping password terkini dari user_data untuk diberikan ke Admin via WA secara aman
    const userSheet = ss.getSheetByName('user_data');
    const userMap = {};
    if (userSheet) {
      const uData = userSheet.getDataRange().getDisplayValues();
      for (let u = 1; u < uData.length; u++) {
        userMap[String(uData[u][0])] = uData[u][5];
      }
    }

    const data = sheet.getDataRange().getDisplayValues();
    const queue = [];
    for(let i = 1; i < data.length; i++) {
      if(data[i][0] && String(data[i][0]).trim() !== '') { 
        const uNip = String(data[i][2]);
        // Prioritaskan password sementara (TR-XXXXXX) yang tercatat di antrean log_reset_pass
        let currentPass = data[i][5] || userMap[uNip] || '-';
        if (currentPass && String(currentPass).startsWith("SHA256$")) {
          currentPass = "[Telah Dienkripsi - Reset di Edit Pegawai]";
        }
        queue.push({
          id: data[i][0], waktu: data[i][1], nip: uNip,
          nama: data[i][3], no_wa: data[i][4], pass: currentPass
        });
      }
    }
    return queue;
  } catch (err) { throw new Error(err.toString()); }
}

// Fungsi Pengujian & Trigger Otorisasi Satu Kali (Wajib Tanpa Try-Catch agar Google memunculkan dialog Otorisasi)
function mintaIzinUrlFetch() {
  const res = UrlFetchApp.fetch("https://supernova-endpoint-unsubtly.ngrok-free.dev/api/sessions", {
    headers: {
      'X-Api-Key': '192167ce5e0147dcb4eaaaff7eccfc18',
      'ngrok-skip-browser-warning': 'true'
    }
  });
  Logger.log("Koneksi Berhasil: " + res.getContentText());
}

function testKoneksiWAHA() {
  const result = sendWhatsAppMessage_('6285139811819', 'TRANSKEP - Tes Koneksi n8n Gateway Berhasil Aktif! 🚀', {
    jenis_pesan: 'direct'
  });
  Logger.log("Hasil Uji n8n Gateway: " + JSON.stringify(result));
  return result;
}

function markResetAsDone(reqId, adminNip, clientToken) {
  try {
    // TRANSKEP HOTFIX KREDENSIAL: Proteksi RBAC wajib Admin
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Hanya Admin yang dapat memproses antrean ini.' };
    }
    const ss = getDB(); // Menggunakan koneksi database terpusat
    const sheet = ss.getSheetByName('log_reset_pass');
    if (!sheet) throw new Error("Sheet antrean tidak ditemukan.");
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


// ==========================================
// TRANSKEP FASE 2: FUNGSI GANTI KATA SANDI (AMAN)
// ==========================================
function changeMyPassword(nip, oldPass, newPass, clientToken) {
  try {
    // 1. Validasi Token Sesi (Mencegah Bypass)
    if (!cekOtorisasi(nip, clientToken)) {
        return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid atau kedaluwarsa. Silakan login ulang.' };
    }

    // 2. Gunakan koneksi database terpusat
    const ss = getDB();
    const sheet = ss.getSheetByName('user_data');
    const data = sheet.getDataRange().getDisplayValues();

    // 3. Cari pegawai dan verifikasi sandi lama
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(nip)) {
        if (!verifyPasswordHash_(data[i][5], oldPass)) {
          return { status: 'error', message: 'Kata sandi lama yang Anda masukkan salah.' };
        }
        
        // 4. Timpa dengan sandi baru berformat Salted SHA-256
        const hashedNewPass = hashPassword_(newPass);
        sheet.getRange(i + 1, 6).setValue(hashedNewPass);
        try {
          CacheService.getScriptCache().remove("force_reset_" + nip);
        } catch(e) {}
        return { status: 'success' };
      }
    }
    return { status: 'error', message: 'Data pengguna tidak ditemukan di sistem.' };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

// ==========================================
// UNIVERSAL POST ENDPOINT (n8n / WA & HEADLESS API)
// ==========================================
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ status: 'error', message: "Tidak ada data JSON yang diterima." });
    }
    
    var payload = JSON.parse(e.postData.contents);
    
    // JALUR 1: Jika request memuat atribut 'action' -> Alihkan ke Router API Frontend Baru
    if (payload && payload.action) {
      return handleApiPost_(payload, e);
    }
    
    // JALUR 2: Webhook Legacy n8n / Bot WA Surat Tugas (TETAP 100% AMAN & UTUH)
    return handleWebhookST_(payload);

  } catch (error) {
    return jsonResponse_({
      status: "error",
      message: error.toString()
    });
  }
}

/**
 * Handler Webhook n8n / WA Surat Tugas (Preservasi Penuh)
 */
function handleWebhookST_(payload) {
  // 1. Validasi Keamanan (Secret Key dari ScriptProperties)
  const scriptProps = PropertiesService.getScriptProperties();
  let configuredKey = scriptProps.getProperty("TRANSKEP_WEBHOOK_KEY");
  if (!configuredKey) {
    configuredKey = "TRANSKEP_WA_BOT_2026";
    scriptProps.setProperty("TRANSKEP_WEBHOOK_KEY", configuredKey);
  }
  
  if (!payload.secret_key || payload.secret_key !== configuredKey) {
    throw new Error("Akses ditolak: Secret Key tidak valid.");
  }

  // 2. Masukkan ke database st_log
  const ss = getDB();
  const sheetST = ss.getSheetByName('st_log');
  if (!sheetST) throw new Error("Sheet st_log tidak ditemukan.");

  // Generate ID & Waktu
  const idST = "ST-WA-" + new Date().getTime() + Math.floor(Math.random() * 1000);
  const waktuDibuat = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'dd/MM/yyyy HH:mm:ss');
  
  // Format JSON peserta dan data ekstra dari payload n8n
  var pesertaJson = JSON.stringify(payload.peserta || []);
  var dataEkstraJson = JSON.stringify(payload.data_ekstra || {});

  // Pastikan urutan kolom sesuai dengan setup sheet st_log (disanitasi dari formula injection)
  sheetST.appendRow(sanitizeRowArray([
    idST, 
    waktuDibuat, 
    payload.nomor_surat || '', 
    payload.menimbang || 'Bahwa untuk kepentingan dinas...', 
    payload.dasar || 'Berdasarkan surat undangan...',
    payload.tujuan || '', 
    payload.tempat || '', 
    payload.tgl_mulai || '', 
    payload.tgl_selesai || '', 
    payload.jam || '', 
    pesertaJson, 
    payload.pejabat_ttd || '', // NIP Pimpinan (Ketua/Wakil)
    'DISETUJUI', 
    dataEkstraJson 
  ]));
  
  SpreadsheetApp.flush();

  return jsonResponse_({
    status: "success",
    message: "Surat Tugas " + idST + " berhasil diterbitkan via WhatsApp.",
    id_st: idST
  });
}