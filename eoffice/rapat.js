// ==========================================
// FILE: eoffice/rapat.js
// DESKRIPSI: Backend Service Pembuatan Paket Dokumen Rapat (3-in-1)
// HASIL: 1. Undangan Rapat, 2. Daftar Hadir, 3. Notulen Kedinasan
// ENGINE: TRANSKEP Core v1.0.0 
// ==========================================

/**
 * Generator Penomoran ID Rapat Sekuensial (Incremental Unique ID Anti-Collision)
 */
function generateSeqRapatId_(ss) {
  const sheet = ss.getSheetByName('EofficeRapat');
  const now = new Date();
  const yyyymm = Utilities.formatDate(now, 'Asia/Jakarta', 'yyyyMM');
  const prefix = 'RPT-' + yyyymm + '-';
  
  if (!sheet || sheet.getLastRow() <= 1) {
    return prefix + '001';
  }

  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  let maxNum = 0;
  for (let i = 0; i < ids.length; i++) {
    const val = String(ids[i][0] || '');
    if (val.startsWith(prefix)) {
      const numPart = parseInt(val.replace(prefix, ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  }

  const nextSeq = String(maxNum + 1).padStart(3, '0');
  return prefix + nextSeq;
}

/**
 * Helper: Mengambil atau membuat subfolder privat di dalam parentFolder (atau DriveApp root jika null)
 */
function getOrCreateSubfolderByName_(parentFolder, name) {
  const folderName = String(name || '').trim() || 'Folder';
  const folders = parentFolder ? parentFolder.getFoldersByName(folderName) : DriveApp.getFoldersByName(folderName);
  let targetFolder = null;
  while (folders && typeof folders.hasNext === 'function' && folders.hasNext()) {
    const candidate = folders.next();
    if (candidate && (typeof candidate.isTrashed !== 'function' || !candidate.isTrashed())) {
      targetFolder = candidate;
      break;
    }
  }
  if (!targetFolder) {
    targetFolder = parentFolder ? parentFolder.createFolder(folderName) : DriveApp.createFolder(folderName);
  }
  if (typeof setPrivateDriveSharing_ === 'function') {
    setPrivateDriveSharing_(targetFolder);
  }
  return targetFolder;
}

/**
 * Helper: Memecah konteks rapat menjadi nama subfolder berjenjang Tahun / Bulan Indonesia / Judul Rapat
 */
function resolveRapatFolderParts_(payload) {
  const p = (payload && typeof payload === 'object') ? payload : {};
  const BULAN_INDO = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  let year = '';
  let month = '';

  const parseIsoParts = function (isoVal) {
    const m = String(isoVal || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return false;
    const monIdx = parseInt(m[2], 10) - 1;
    if (monIdx < 0 || monIdx >= 12) return false;
    year = m[1];
    month = BULAN_INDO[monIdx];
    return true;
  };

  if (!parseIsoParts(p.tgl_rapat_iso)) {
    const hariTgl = String(p.hari_tanggal || '').trim();
    const htLow = hariTgl.toLowerCase();
    const yMatch = hariTgl.match(/\b(19\d{2}|20\d{2})\b/);
    let foundMon = '';
    for (let i = 0; i < BULAN_INDO.length; i++) {
      if (htLow.indexOf(BULAN_INDO[i].toLowerCase()) !== -1) {
        foundMon = BULAN_INDO[i];
        break;
      }
    }
    if (!foundMon && htLow.indexOf('nopember') !== -1) {
      foundMon = 'November';
    }
    if (yMatch && foundMon) {
      year = yMatch[1];
      month = foundMon;
    } else if (!parseIsoParts(p.tgl_surat)) {
      const todayIso = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
      parseIsoParts(todayIso);
      if (yMatch && !year) year = yMatch[1];
      if (foundMon) month = foundMon;
    }
  }

  if (!year) year = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy');
  if (!month) month = BULAN_INDO[0];

  const safePrefix = String(p.id_rapat || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const cleanTitle = String(p.agenda || '')
    .replace(/[\/\\:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
    .trim();

  return {
    year: year,
    month: month,
    title: cleanTitle || safePrefix || 'Rapat Tanpa Judul'
  };
}

/**
 * Helper: Mengambil / Membuat Folder Privat Google Drive untuk Dokumentasi Foto & Rekaman Rapat
 * Struktur bertingkat bila payload diberikan: Arsip Foto Rapat TRANSKEP / Tahun / Bulan / Judul Rapat
 */
function getOrCreateFotoRapatFolder_(payload) {
  const rootFolder = getOrCreateSubfolderByName_(null, 'Arsip Foto Rapat TRANSKEP');
  if (!payload || typeof payload !== 'object' || Object.keys(payload).length === 0) {
    return rootFolder;
  }
  const parts = resolveRapatFolderParts_(payload);
  const yearFolder = getOrCreateSubfolderByName_(rootFolder, parts.year);
  const monthFolder = getOrCreateSubfolderByName_(yearFolder, parts.month);
  return getOrCreateSubfolderByName_(monthFolder, parts.title);
}

/**
 * Helper bersama untuk mengunggah media rapat (foto/audio) ke subfolder Drive Tahun/Bulan/Judul Rapat
 */
function uploadRapatMediaToDrive_(payload, adminNip, clientToken, cfg) {
  const opts = cfg || {};
  if (!cekOtorisasiAdmin(adminNip, clientToken)) {
    return { status: 'error', message: opts.deniedMessage || 'Akses Ditolak: Unggah media rapat hanya dapat dilakukan oleh Admin/Operator.' };
  }
  const p = payload || {};
  const validated = validateUploadedFile_(
    p.file_data,
    p.file_name || opts.defaultFileName || 'media_rapat.bin',
    p.mime_type || opts.defaultMime || 'application/octet-stream',
    opts.validateOpts || {}
  );

  const safePrefix = String(p.id_rapat || 'RPT').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'RPT';
  const stamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd_HHmmss');
  const finalName = (opts.filePrefix || 'Media_') + safePrefix + '_' + stamp + '_' + Math.floor(Math.random() * 1000) + '.' + validated.ext;

  const blob = Utilities.newBlob(validated.bytes, validated.blobMimeType, finalName);
  const parts = resolveRapatFolderParts_(p);
  const folder = getOrCreateFotoRapatFolder_(p);
  const file = folder.createFile(blob);
  if (typeof setPrivateDriveSharing_ === 'function') {
    setPrivateDriveSharing_(file);
  }

  const fileId = file.getId();
  return {
    status: 'success',
    data: {
      file_id: fileId,
      url: 'https://drive.google.com/file/d/' + fileId + '/view',
      file_name: file.getName(),
      mime_type: validated.blobMimeType,
      folder_url: typeof folder.getUrl === 'function' ? folder.getUrl() : '',
      folder_path: 'Arsip Foto Rapat TRANSKEP / ' + parts.year + ' / ' + parts.month + ' / ' + parts.title
    }
  };
}

/**
 * RPC Aman: Upload Foto Dokumentasi Rapat Terkompresi ke Google Drive Privat
 */
function uploadFotoRapat(payload, adminNip, clientToken) {
  try {
    return uploadRapatMediaToDrive_(payload, adminNip, clientToken, {
      deniedMessage: 'Akses Ditolak: Unggah foto rapat hanya dapat dilakukan oleh Admin/Operator.',
      defaultFileName: 'foto_rapat.jpg',
      defaultMime: 'image/jpeg',
      filePrefix: 'Foto_',
      validateOpts: { allowPdf: false, allowImages: true, allowAudio: false, maxBytes: 5 * 1024 * 1024 }
    });
  } catch (err) {
    Logger.log('ERROR uploadFotoRapat: ' + err.toString());
    return { status: 'error', message: err.message || err.toString() };
  }
}

/**
 * RPC Aman: Upload Rekaman Audio Rapat ke Subfolder Google Drive Privat (Tahun/Bulan/Judul Rapat)
 */
function uploadAudioRapat(payload, adminNip, clientToken) {
  try {
    return uploadRapatMediaToDrive_(payload, adminNip, clientToken, {
      deniedMessage: 'Akses Ditolak: Unggah audio rapat hanya dapat dilakukan oleh Admin/Operator.',
      defaultFileName: 'rekaman_rapat.webm',
      defaultMime: 'audio/webm',
      filePrefix: 'Audio_',
      validateOpts: { allowPdf: false, allowImages: false, allowAudio: true, maxBytes: 12 * 1024 * 1024 }
    });
  } catch (err) {
    Logger.log('ERROR uploadAudioRapat: ' + err.toString());
    return { status: 'error', message: err.message || err.toString() };
  }
}

/**
 * Helper: Mengubah list/teks poin AI menjadi teks multiline terstruktur
 */
function formatAiPointListText_(val) {
  if (Array.isArray(val)) {
    const clean = val.map(function (item) {
      return String(item == null ? '' : item).trim();
    }).filter(Boolean);
    if (clean.length === 0) return '';
    if (clean.length === 1) return clean[0];
    return clean.map(function (line, i) {
      return (i + 1) + '. ' + line;
    }).join('\n');
  }
  return String(val == null ? '' : val).trim();
}

/**
 * Helper: Mencocokkan nama pembicara hasil AI dengan daftar peserta rapat agar NIP & Jabatan terisi otomatis
 */
function matchSpeakerFromPesertaList_(speakerName, pesertaList) {
  const target = String(speakerName || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!target || !Array.isArray(pesertaList) || pesertaList.length === 0) return null;

  let best = null;
  for (let i = 0; i < pesertaList.length; i++) {
    const p = pesertaList[i];
    if (!p) continue;
    const rawName = String(typeof p === 'string' ? p : (p.nama || p.label || '')).trim();
    const rawJab = String(typeof p === 'string' ? '' : (p.jabatan || '')).trim();
    const rawNip = String(typeof p === 'string' ? '' : (p.nip || '')).trim();
    const cleanNama = rawName.split(',')[0].toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cleanNama || cleanNama.length < 3) continue;

    if (target.indexOf(cleanNama) !== -1 || cleanNama.indexOf(target) !== -1) {
      best = { nip: rawNip, nama: rawName, jabatan: rawJab };
      break;
    }
    const firstWord = cleanNama.split(' ')[0];
    if (firstWord && firstWord.length >= 4 && target.indexOf(firstWord) !== -1) {
      best = { nip: rawNip, nama: rawName, jabatan: rawJab };
    }
  }
  return best;
}

/**
 * Helper: Normalisasi output JSON Notula dari n8n / Gemini menjadi format 5 kolom Notula Rapat PA Indramayu
 */
function normalizeAiNotulenResponse_(rawObj, payload) {
  const src = (rawObj && rawObj.data && typeof rawObj.data === 'object') ? rawObj.data : (rawObj || {});
  let pesertaList = [];
  if (payload && Array.isArray(payload.peserta_list)) {
    pesertaList = payload.peserta_list;
  } else if (payload && typeof payload.peserta_list === 'string' && payload.peserta_list.trim()) {
    try {
      const parsedP = JSON.parse(payload.peserta_list);
      if (Array.isArray(parsedP)) pesertaList = parsedP;
    } catch (eP) {}
  }

  const rawRows = Array.isArray(src.pembahasan) ? src.pembahasan : [];
  const pembahasan = rawRows.slice(0, 30).map(function (row, idx) {
    const r = (row && typeof row === 'object') ? row : {};
    let nama = String(r.pembicara_nama || r.pembicara || ('Pembicara #' + (idx + 1))).trim();
    let nip = String(r.pembicara_nip || '').trim();
    let jabatan = String(r.pembicara_jabatan || '').trim();

    if (!nip || !jabatan) {
      const matched = matchSpeakerFromPesertaList_(nama, pesertaList);
      if (matched) {
        if (!nip && matched.nip) nip = matched.nip;
        if (!jabatan && matched.jabatan) jabatan = matched.jabatan;
        if (nama.indexOf('(') === -1 && matched.nama) {
          nama = matched.nama + (matched.jabatan ? ' (' + matched.jabatan + ')' : '');
        }
      }
    }

    const uraianStr = formatAiPointListText_(r.uraian_text || r.uraian);
    const tindakStr = formatAiPointListText_(r.tindak_lanjut_text || r.tindak_lanjut);
    return {
      pembicara_nama: nama,
      pembicara_nip: nip,
      pembicara_jabatan: jabatan,
      uraian: uraianStr,
      tindak_lanjut: tindakStr,
      target: String(r.target || '').trim(),
      penanggung_jawab: String(r.penanggung_jawab || '').trim(),
      tanggal_penyelesaian: String(r.tanggal_penyelesaian || '').trim()
    };
  });

  return {
    dasar_opsional: String(src.dasar_opsional || '').trim(),
    pengarahan_umum: String(src.pengarahan_umum || '').trim(),
    kesimpulan: String(src.kesimpulan || '').trim(),
    transkrip_ringkas: String(src.transkrip_ringkas || '').trim(),
    pembahasan: pembahasan
  };
}

/**
 * Helper Fallback: Penyusun deterministik catatan mentah/transkrip menjadi draf Pengarahan + 5 Kolom Pembahasan
 */
function parseTranscriptFallbackRapat_(transcriptText, payload) {
  const cleanText = String(transcriptText || '').trim();
  const p = payload || {};
  const lines = cleanText.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
  let pesertaList = Array.isArray(p.peserta_list) ? p.peserta_list : [];

  let pengarahanParts = [];
  let kesimpulanParts = [];
  let pembahasan = [];
  let currentSpeaker = null;

  lines.forEach(function (line) {
    const lower = line.toLowerCase();
    if (/^(?:arahan|pengarahan|pimpinan)\s*:/i.test(line)) {
      pengarahanParts.push(line.replace(/^[^:]+:\s*/, '').trim());
      return;
    }
    if (/^(?:kesimpulan|keputusan)\s*:/i.test(line)) {
      kesimpulanParts.push(line.replace(/^[^:]+:\s*/, '').trim());
      return;
    }

    const spkMatch = line.match(/^(?:\d+\.\s*)?([A-Za-z0-9.,()\-\/\s]{3,80}?)\s*:\s*(.+)$/);
    if (spkMatch && !/^https?$/i.test(spkMatch[1])) {
      const spkName = spkMatch[1].trim();
      const bodyText = spkMatch[2].trim();
      if (/^tindak\s*lanjut$/i.test(spkName) && currentSpeaker) {
        currentSpeaker.tindak_lanjut.push(bodyText);
        return;
      }
      if (/^target$/i.test(spkName) && currentSpeaker) {
        currentSpeaker.target = bodyText;
        return;
      }
      if (/^(?:pj|penanggung\s*jawab)$/i.test(spkName) && currentSpeaker) {
        currentSpeaker.penanggung_jawab = bodyText;
        return;
      }
      if (/^(?:tanggal|tgl|deadline)(?:\s+penyelesaian)?$/i.test(spkName) && currentSpeaker) {
        currentSpeaker.tanggal_penyelesaian = bodyText;
        return;
      }

      const matched = matchSpeakerFromPesertaList_(spkName, pesertaList);
      currentSpeaker = {
        pembicara_nama: matched ? (matched.nama + (matched.jabatan ? ' (' + matched.jabatan + ')' : '')) : spkName,
        pembicara_nip: matched ? (matched.nip || '') : '',
        pembicara_jabatan: matched ? (matched.jabatan || '') : '',
        uraian: [bodyText],
        tindak_lanjut: [],
        target: '',
        penanggung_jawab: matched ? (matched.jabatan || matched.nama || '') : spkName,
        tanggal_penyelesaian: ''
      };
      pembahasan.push(currentSpeaker);
      return;
    }

    if (currentSpeaker) {
      if (lower.indexOf('tindak lanjut') !== -1 || lower.indexOf('solusi') !== -1) {
        currentSpeaker.tindak_lanjut.push(line);
      } else {
        currentSpeaker.uraian.push(line);
      }
    } else {
      pengarahanParts.push(line);
    }
  });

  if (pembahasan.length === 0 && lines.length > 0) {
    pembahasan.push({
      pembicara_nama: String(p.pemimpin || 'Pembahasan Umum Rapat').trim(),
      pembicara_nip: '',
      pembicara_jabatan: '',
      uraian: lines,
      tindak_lanjut: kesimpulanParts.length > 0 ? kesimpulanParts : ['Ditindaklanjuti sesuai hasil rapat.'],
      target: 'Terselesaikannya agenda ' + String(p.agenda || 'rapat').trim(),
      penanggung_jawab: String(p.pemimpin || 'Tim Terkait').trim(),
      tanggal_penyelesaian: 'Segera'
    });
  }

  return normalizeAiNotulenResponse_({
    dasar_opsional: '',
    pengarahan_umum: pengarahanParts.join('\n') || ('Arahan pimpinan terkait ' + String(p.agenda || 'rapat kedinasan') + '.'),
    kesimpulan: kesimpulanParts.join('\n') || 'Rapat menyepakati tindak lanjut dari seluruh poin pembahasan.',
    transkrip_ringkas: cleanText,
    pembahasan: pembahasan
  }, p);
}

/**
 * RPC Aman: Ekstraksi Rekaman Audio / Transkrip Rapat menjadi Draft Notula Terstruktur via n8n + Gemini
 */
function generateAiNotulenRapat(payload, adminNip, clientToken) {
  try {
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Fitur AI Notulis Rapat hanya dapat dijalankan oleh Admin/Operator.' };
    }

    const p = payload || {};
    const rawAudio = String(p.audio_data || p.audio_base64 || '').trim();
    const transcriptText = String(p.transcript_text || p.ai_transcript || '').trim();

    if (!rawAudio && !transcriptText) {
      return { status: 'error', message: 'Silakan unggah rekaman audio rapat atau isi catatan/transkrip mentah terlebih dahulu.' };
    }

    let cleanAudioBase64 = '';
    let audioMimeType = '';
    if (rawAudio) {
      const dataUriMatch = rawAudio.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/i);
      const declaredMime = dataUriMatch ? dataUriMatch[1] : String(p.audio_mime_type || p.mime_type || 'audio/webm');
      audioMimeType = String(declaredMime || 'audio/webm').split(';')[0].trim().toLowerCase();
      if (!/^audio\/(webm|ogg|mp3|mpeg|mp4|m4a|wav|x-wav|aac|flac)$/i.test(audioMimeType)) {
        return { status: 'error', message: 'Format audio tidak didukung (' + audioMimeType + '). Gunakan .webm, .ogg, .mp3, .m4a, atau .wav.' };
      }
      cleanAudioBase64 = String(dataUriMatch ? dataUriMatch[2] : rawAudio).replace(/\s+/g, '');
      if (cleanAudioBase64.length > 12 * 1024 * 1024) {
        return { status: 'error', message: 'Ukuran rekaman audio melebihi batas aman (maks. ~9 MB per pengiriman).' };
      }
    }

    const props = PropertiesService.getScriptProperties();
    const n8nWebhookUrl = String(
      props.getProperty('N8N_WEBHOOK_AI_NOTULEN') ||
      'https://supernova-endpoint-unsubtly.ngrok-free.dev/webhook/transkep-ai-notulen'
    ).trim();
    const webhookSecret = String(props.getProperty('TRANSKEP_WEBHOOK_KEY') || 'TRANSKEP_WA_BOT_2026').trim();

    const outboundPayload = {
      event: 'AI_NOTULEN_RAPAT',
      secret_key: webhookSecret,
      id_rapat: String(p.id_rapat || 'RPT-DRAFT').trim(),
      agenda: String(p.agenda || 'Rapat Kedinasan').trim(),
      hari_tanggal: String(p.hari_tanggal || '').trim(),
      tempat: String(p.tempat || '').trim(),
      pemimpin: String(p.pemimpin || '').trim(),
      notulis: String(p.notulis || '').trim(),
      peserta_list: Array.isArray(p.peserta_list) ? p.peserta_list.slice(0, 50) : [],
      transcript_text: transcriptText,
      audio_base64: cleanAudioBase64,
      audio_mime_type: audioMimeType
    };

    let lastErrorMsg = '';
    if (n8nWebhookUrl) {
      try {
        const resp = UrlFetchApp.fetch(n8nWebhookUrl, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(outboundPayload),
          muteHttpExceptions: true
        });
        const code = Number(resp.getResponseCode() || 0);
        const rawBody = String(resp.getContentText() || '').trim();
        if (code >= 200 && code < 300 && rawBody) {
          let parsed = null;
          try {
            parsed = JSON.parse(rawBody);
          } catch (eJson) {
            parsed = null;
          }
          if (parsed && (parsed.status === 'success' || parsed.pengarahan_umum || parsed.pembahasan || (parsed.data && parsed.data.pembahasan))) {
            const normalized = normalizeAiNotulenResponse_(parsed, p);
            return {
              status: 'success',
              source: 'n8n_gemini',
              model: String(parsed.model || 'models/gemini-3.8-flash'),
              data: normalized
            };
          }
          if (parsed && parsed.status === 'error' && parsed.message) {
            lastErrorMsg = String(parsed.message);
          } else {
            lastErrorMsg = 'Respons webhook n8n tidak sesuai format JSON Notula.';
          }
        } else {
          lastErrorMsg = 'Webhook n8n mengembalikan HTTP ' + code;
        }
      } catch (eN8n) {
        lastErrorMsg = 'Gagal terhubung ke webhook n8n AI Notulen: ' + eN8n.toString();
      }
    }

    // Fallback opsional ke Gemini REST langsung bila GEMINI_API_KEY diset di ScriptProperties
    const directGeminiKey = String(props.getProperty('GEMINI_API_KEY') || '').trim();
    if (directGeminiKey) {
      try {
        const parts = [];
        if (cleanAudioBase64) {
          parts.push({ inline_data: { mime_type: audioMimeType || 'audio/webm', data: cleanAudioBase64 } });
        }
        parts.push({
          text: 'Susun Notula Rapat Kedinasan PA Indramayu dalam JSON murni { dasar_opsional, pengarahan_umum, kesimpulan, transkrip_ringkas, pembahasan: [{ pembicara_nama, pembicara_nip, pembicara_jabatan, uraian: [], tindak_lanjut: [], target, penanggung_jawab, tanggal_penyelesaian }] }.\nAgenda: ' +
            outboundPayload.agenda + '\nPimpinan: ' + outboundPayload.pemimpin + '\nCatatan: ' + (transcriptText || '-')
        });
        const geminiResp = UrlFetchApp.fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=' + encodeURIComponent(directGeminiKey),
          {
            method: 'post',
            contentType: 'application/json',
            payload: JSON.stringify({
              contents: [{ role: 'user', parts: parts }],
              generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
            }),
            muteHttpExceptions: true
          }
        );
        if (Number(geminiResp.getResponseCode() || 0) === 200) {
          const gJson = JSON.parse(geminiResp.getContentText() || '{}');
          const txt = gJson && gJson.candidates && gJson.candidates[0] && gJson.candidates[0].content &&
            gJson.candidates[0].content.parts && gJson.candidates[0].content.parts[0]
            ? String(gJson.candidates[0].content.parts[0].text || '')
            : '';
          if (txt) {
            const cleaned = txt.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
            const parsedG = JSON.parse(cleaned);
            return {
              status: 'success',
              source: 'gemini_direct',
              model: 'models/gemini-3.8-flash',
              data: normalizeAiNotulenResponse_(parsedG, p)
            };
          }
        }
      } catch (eGem) {
        lastErrorMsg = (lastErrorMsg ? lastErrorMsg + ' | ' : '') + 'Gemini direct error: ' + eGem.toString();
      }
    }

    if (p.allow_text_fallback === true && transcriptText) {
      return {
        status: 'success',
        source: 'local_fallback',
        message: 'Disusun dari catatan teks lokal karena layanan AI n8n sedang tidak tersedia (' + (lastErrorMsg || 'offline') + ').',
        data: parseTranscriptFallbackRapat_(transcriptText, p)
      };
    }

    return {
      status: 'error',
      message: lastErrorMsg || 'Gagal memproses AI Notulis Rapat via n8n & Gemini.'
    };
  } catch (err) {
    Logger.log('ERROR generateAiNotulenRapat: ' + err.toString());
    return { status: 'error', message: err.message || err.toString() };
  }
}

/**
 * Helper: Menambahkan Kop Surat Standar PA Indramayu pada Google Docs
 */
function appendKopSuratPaIndramayu_(body) {
  // Set Margin Standar Kedinasan (Kiri 2.5cm, Kanan 2cm, Atas 2cm, Bawah 2cm)
  body.setMarginLeft(70.87);
  body.setMarginRight(56.7);
  body.setMarginTop(56.7);
  body.setMarginBottom(56.7);

  const pKop1 = body.appendParagraph(
    "MAHKAMAH AGUNG REPUBLIK INDONESIA\n" +
    "DIREKTORAT JENDERAL BADAN PERADILAN AGAMA\n" +
    "PENGADILAN TINGGI AGAMA BANDUNG\n" +
    "PENGADILAN AGAMA INDRAMAYU"
  );
  pKop1.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  pKop1.setFontFamily("Arial");
  pKop1.setFontSize(11);
  pKop1.setBold(true);

  const pKop2 = body.appendParagraph(
    "Jalan M.T. Haryono No.2A Kel. Sindang Kec.Sindang Kab. Indramayu Kode Pos 45222\n" +
    "Telepon (0234) 273880 | Situs : www.pa-indramayu.go.id | e-mail : pa.indramayu_ptabdg@yahoo.co.id"
  );
  pKop2.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  pKop2.setFontFamily("Arial");
  pKop2.setFontSize(8);
  pKop2.setBold(false);

  body.appendHorizontalRule();
}

/**
 * FUNGSI UTAMA: Menerbitkan 3 Dokumen Rapat Sekaligus & Menyimpan ke Database
 */
function createPaketRapatDocs(payload, adminNip, clientToken) {
  try {
    // 1. Validasi Keamanan
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Pembuatan paket rapat dinas hanya dapat dilakukan oleh Admin.' };
    }

    const todayStrClean = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMddHHmmss');
    let idRapat = String(payload.id_rapat || '');
    if (!idRapat) {
      idRapat = 'RPT-' + todayStrClean;
    }

    let pesertaList = [];
    try {
      pesertaList = JSON.parse(payload.peserta_json || '[]');
    } catch(e) {
      pesertaList = [];
    }

    const cleanAgenda = (payload.agenda || 'Rapat').replace(/[^a-zA-Z0-9]/g, '_');

    // ==========================================
    // 1. DOKUMEN 1: SURAT UNDANGAN RAPAT
    // ==========================================
    const docUndangan = DocumentApp.create("Undangan_Rapat_" + cleanAgenda + "_" + idRapat);
    const bodyUndangan = docUndangan.getBody();
    appendKopSuratPaIndramayu_(bodyUndangan);

    const pTglSurat = bodyUndangan.appendParagraph("Indramayu, " + (payload.hari_tanggal || "-"));
    pTglSurat.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
    pTglSurat.setFontSize(10);

    const pHeaderUndangan = bodyUndangan.appendParagraph(
      "Nomor       : " + (payload.nomor_undangan || "-") + "\n" +
      "Sifat          : Penting\n" +
      "Lampiran : 1 (satu) Berkas\n" +
      "Perihal     : Undangan " + (payload.agenda || "Rapat Dinas")
    );
    pHeaderUndangan.setFontSize(10);

    const pKepadaUndangan = bodyUndangan.appendParagraph(
      "\nKepada Yth.\nBapak/Ibu Peserta Rapat (Daftar Terlampir)\nDi-\n     Tempat"
    );
    pKepadaUndangan.setFontSize(10);

    const pIsiUndangan = bodyUndangan.appendParagraph(
      "\n        Dengan hormat,\n" +
      "        Mengharap kehadiran Bapak/Ibu dalam rapat dinas Pengadilan Agama Indramayu yang akan diselenggarakan pada:\n\n" +
      "        Hari / Tanggal  : " + (payload.hari_tanggal || "-") + "\n" +
      "        Waktu              : " + (payload.waktu_mulai || "09:00 WIB") + " s/d " + (payload.waktu_selesai || "Selesai") + "\n" +
      "        Tempat             : " + (payload.tempat || "Ruang Sidang Utama PA Indramayu") + "\n" +
      "        Agenda             : " + (payload.agenda || "-") + "\n\n" +
      "        Mengingat pentingnya agenda tersebut, dimohon agar hadir tepat pada waktunya.\n" +
      "        Demikian undangan ini kami sampaikan, atas perhatian dan kehadirannya diucapkan terima kasih."
    );
    pIsiUndangan.setFontSize(10);

    const pTtdUndangan = bodyUndangan.appendParagraph(
      "\n                                                                                                   " + (payload.pemimpin || "Ketua Pengadilan Agama Indramayu") + ",\n\n\n\n" +
      "                                                                                                   ( .............................................................. )"
    );
    pTtdUndangan.setFontSize(10);

    // Lampiran Peserta Undangan
    bodyUndangan.appendPageBreak();
    const pLampHeader = bodyUndangan.appendParagraph(
      "LAMPIRAN SURAT UNDANGAN\n" +
      "Nomor : " + (payload.nomor_undangan || "-") + "\n" +
      "Tanggal : " + (payload.hari_tanggal || "-") + "\n\n" +
      "DAFTAR PEGAWAI YANG DIUNDANG :"
    );
    pLampHeader.setBold(true);
    pLampHeader.setFontSize(10);

    const tableUndangan = bodyUndangan.appendTable();
    const trUndanganHeader = tableUndangan.appendTableRow();
    trUndanganHeader.appendTableCell("NO").setWidth(35).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    trUndanganHeader.appendTableCell("NAMA PEGAWAI").setWidth(230);
    trUndanganHeader.appendTableCell("NIP").setWidth(120);
    trUndanganHeader.appendTableCell("JABATAN").setWidth(150);

    for (let c = 0; c < 4; c++) {
      trUndanganHeader.getCell(c).setBackgroundColor("#f1f5f9");
      trUndanganHeader.getCell(c).getChild(0).asParagraph().setBold(true).setFontSize(9);
    }

    pesertaList.forEach((p, idx) => {
      const row = tableUndangan.appendTableRow();
      row.appendTableCell(String(idx + 1)).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      row.appendTableCell(p.nama || '-');
      row.appendTableCell(p.nip || '-');
      row.appendTableCell(p.jabatan || '-');
      for (let c = 0; c < 4; c++) {
        row.getCell(c).getChild(0).asParagraph().setFontSize(9);
      }
    });

    docUndangan.saveAndClose();
    const fileUndangan = DriveApp.getFileById(docUndangan.getId());
    if (typeof setPrivateDriveSharing_ === 'function') setPrivateDriveSharing_(fileUndangan);

    // ==========================================
    // 2. DOKUMEN 2: LEMBAR DAFTAR HADIR RAPAT
    // ==========================================
    const docAbsen = DocumentApp.create("Daftar_Hadir_" + cleanAgenda + "_" + idRapat);
    const bodyAbsen = docAbsen.getBody();
    appendKopSuratPaIndramayu_(bodyAbsen);

    const pJudulAbsen = bodyAbsen.appendParagraph("DAFTAR HADIR RAPAT KEDINASAN");
    pJudulAbsen.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pJudulAbsen.setFontSize(11);
    pJudulAbsen.setBold(true);

    const pInfoAbsen = bodyAbsen.appendParagraph(
      "Hari / Tanggal  : " + (payload.hari_tanggal || "-") + "\n" +
      "Waktu              : " + (payload.waktu_mulai || "-") + " s/d " + (payload.waktu_selesai || "-") + "\n" +
      "Tempat             : " + (payload.tempat || "-") + "\n" +
      "Agenda Rapat   : " + (payload.agenda || "-") + "\n"
    );
    pInfoAbsen.setFontSize(10);

    const tableAbsen = bodyAbsen.appendTable();
    const trAbsenHeader = tableAbsen.appendTableRow();
    trAbsenHeader.appendTableCell("NO").setWidth(30).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    trAbsenHeader.appendTableCell("NAMA PEGAWAI / NIP").setWidth(260);
    trAbsenHeader.appendTableCell("JABATAN").setWidth(135);
    trAbsenHeader.appendTableCell("TANDA TANGAN / PARAF").setWidth(110).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);

    for (let c = 0; c < 4; c++) {
      trAbsenHeader.getCell(c).setBackgroundColor("#f1f5f9");
      trAbsenHeader.getCell(c).getChild(0).asParagraph().setBold(true).setFontSize(9);
    }

    // Format zig-zag tanda tangan kedinasan (1... 2...)
    pesertaList.forEach((p, idx) => {
      const row = tableAbsen.appendTableRow();
      row.appendTableCell(String(idx + 1)).getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
      
      const pNamaCell = row.appendTableCell();
      pNamaCell.appendParagraph(p.nama || '-').setBold(true);
      pNamaCell.appendParagraph("NIP. " + (p.nip || '-')).setFontSize(8).setFontColor("#475569");
      
      row.appendTableCell(p.jabatan || '-');

      // Tanda tangan ganjil / genap
      const pTtdCell = row.appendTableCell();
      const numStr = (idx + 1) + ". .........";
      const pTtdPara = pTtdCell.getChild(0).asParagraph();
      pTtdPara.setText(numStr);
      pTtdPara.setAlignment((idx % 2 === 0) ? DocumentApp.HorizontalAlignment.LEFT : DocumentApp.HorizontalAlignment.CENTER);

      for (let c = 0; c < 4; c++) {
        row.getCell(c).getChild(0).asParagraph().setFontSize(9);
      }
    });

    const pTtdMengetahui = bodyAbsen.appendParagraph(
      "\n                                                                                                   Mengetahui,\n" +
      "                                                                                                   " + (payload.pemimpin || "Pemimpin Rapat") + ",\n\n\n\n" +
      "                                                                                                   ( .............................................................. )"
    );
    pTtdMengetahui.setFontSize(10);

    docAbsen.saveAndClose();
    const fileAbsen = DriveApp.getFileById(docAbsen.getId());
    if (typeof setPrivateDriveSharing_ === 'function') setPrivateDriveSharing_(fileAbsen);

    // ==========================================
    // 3. DOKUMEN 3: NOTULEN RAPAT KEDINASAN
    // ==========================================
    const docNotulen = DocumentApp.create("Notulen_Rapat_" + cleanAgenda + "_" + idRapat);
    const bodyNotulen = docNotulen.getBody();
    appendKopSuratPaIndramayu_(bodyNotulen);

    const pJudulNotulen = bodyNotulen.appendParagraph("NOTULEN RAPAT KEDINASAN");
    pJudulNotulen.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    pJudulNotulen.setFontSize(11);
    pJudulNotulen.setBold(true);

    const pInfoNotulen = bodyNotulen.appendParagraph(
      "Sidang / Rapat              : " + (payload.agenda || "-") + "\n" +
      "Hari / Tanggal              : " + (payload.hari_tanggal || "-") + "\n" +
      "Waktu Pelaksanaan       : " + (payload.waktu_mulai || "-") + " s/d " + (payload.waktu_selesai || "-") + "\n" +
      "Tempat Pelaksanaan      : " + (payload.tempat || "-") + "\n" +
      "Pimpinan Rapat             : " + (payload.pemimpin || "-") + "\n" +
      "Notulis / Pencatat         : " + (payload.notulis || "-") + "\n" +
      "Peserta Hadir                 : " + pesertaList.length + " Orang (Daftar Hadir Terlampir)\n"
    );
    pInfoNotulen.setFontSize(10);

    // Garis Pemisah
    bodyNotulen.appendHorizontalRule();

    const pSusunanAcara = bodyNotulen.appendParagraph(
      "\nJALANNYA PERTEMUAN / SUSUNAN ACARA :\n" +
      "1. Pembukaan oleh Pembawa Acara / Pimpinan Rapat\n" +
      "2. Pengarahan dan Pokok Pembahasan Rapat\n" +
      "3. Tanya Jawab / Tanggapan dan Masukan Peserta\n" +
      "4. Kesimpulan & Penutup\n\n" +
      "POKOK-POKOK PEMBAHASAN / ARAHAN PIMPINAN :\n" +
      (payload.pembahasan || "- Tidak ada catatan khusus -") + "\n\n" +
      "KESIMPULAN & TINDAK LANJUT RAPAT :\n" +
      (payload.kesimpulan || "- Rapat berjalan dengan tertib dan lancar -") + "\n"
    );
    pSusunanAcara.setFontSize(10);
    pSusunanAcara.setLineSpacing(1.15);

    // Tanda Tangan Ganda: Pimpinan & Notulis
    const tableTtdNotulen = bodyNotulen.appendTable();
    const rowTtd = tableTtdNotulen.appendTableRow();
    
    const cellNotulis = rowTtd.appendTableCell();
    cellNotulis.setWidth(270);
    const pTtdNotulis = cellNotulis.getChild(0).asParagraph();
    pTtdNotulis.setText(
      "Notulis Rapat,\n\n\n\n\n" +
      (payload.notulis || ".....................................................")
    );
    pTtdNotulis.setFontSize(10);

    const cellPimpinan = rowTtd.appendTableCell();
    cellPimpinan.setWidth(270);
    const pTtdPimpinan = cellPimpinan.getChild(0).asParagraph();
    pTtdPimpinan.setText(
      "Pimpinan Rapat,\n\n\n\n\n" +
      (payload.pemimpin || ".....................................................")
    );
    pTtdPimpinan.setFontSize(10);

    // Hilangkan border tabel tanda tangan
    for (let c = 0; c < 2; c++) {
      rowTtd.getCell(c).setBorderWidth(0);
    }

    docNotulen.saveAndClose();
    const fileNotulen = DriveApp.getFileById(docNotulen.getId());
    if (typeof setPrivateDriveSharing_ === 'function') setPrivateDriveSharing_(fileNotulen);

    // ==========================================
    // TAHAP 84: PEMUTUSAN PENULISAN BARIS KE SHEET EofficeRapat
    // ==========================================
    // Generator 3 Dokumen Google Docs di Google Drive tetap berjalan utuh.
    // Seluruh data riwayat paket rapat dikelola 100% murni di Cloud Firestore (eoffice_rapat).
    const docUndanganUrl = fileUndangan.getUrl();
    const docAbsenUrl = fileAbsen.getUrl();
    const docNotulenUrl = fileNotulen.getUrl();

    return {
      status: 'success',
      message: '3 Dokumen Rapat berhasil diterbitkan!',
      data: {
        id_rapat: idRapat,
        doc_undangan_url: docUndanganUrl,
        doc_absen_url: docAbsenUrl,
        doc_notulen_url: docNotulenUrl
      }
    };

  } catch (err) {
    Logger.log("ERROR createPaketRapatDocs: " + err.toString());
    return { status: 'error', message: err.toString() };
  }
}

// ==========================================
// TAHAP 141: OTOMASI NOMOR SURAT KELUAR & PDF UNDANGAN RAPAT MYSIMS
// ==========================================

function hasAssignedRapatNumber_(rec) {
  if (!rec) return false;
  const no = String(rec.no_urut_surat || '').trim();
  const full = String(rec.nomor_undangan || '').trim();
  if (no && no !== '...' && no !== '......' && no !== '-') return true;
  if (full && /^\d+[^/]*\//.test(full) && full.indexOf('...') === -1 && full.indexOf('NOMOR_MYSIMS_TERCATAT') === -1) {
    return true;
  }
  return false;
}

function resolveIsoDateForMysimsRapat_(val) {
  const todayIso = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
  if (!val) return todayIso;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const blnMap = {
    januari: '01', februari: '02', maret: '03', april: '04', mei: '05', juni: '06',
    juli: '07', agustus: '08', september: '09', oktober: '10', november: '11', desember: '12'
  };
  const m = s.match(/^(\d{1,2})\s+([a-zA-Z]+)\s+(\d{4})$/);
  if (m && blnMap[m[2].toLowerCase()]) {
    return m[3] + '-' + blnMap[m[2].toLowerCase()] + '-' + ('0' + m[1]).slice(-2);
  }
  const sl = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (sl) {
    return sl[3] + '-' + ('0' + sl[2]).slice(-2) + '-' + ('0' + sl[1]).slice(-2);
  }
  return todayIso;
}

function resolveMysimsAccountMetaRapat_(kodePejabat, jabatanTtd) {
  const k = String(kodePejabat || '').toUpperCase().trim();
  const j = String(jabatanTtd || '').toLowerCase().trim();
  if (k.indexOf('WKPA') !== -1 || j.indexOf('wakil ketua') !== -1) {
    return { jabatan: 'Wakil Ketua', satker: 'WKPA.W10-A2' };
  }
  if (k.indexOf('PAN') !== -1 || j.indexOf('panitera') === 0) {
    return { jabatan: 'Panitera', satker: 'PAN.PA.W10-A2' };
  }
  if (k.indexOf('SEK') !== -1 || j.indexOf('sekretaris') === 0) {
    return { jabatan: 'Sekretaris', satker: 'SEK.PA.W10-A2' };
  }
  return { jabatan: 'Ketua', satker: 'KPA.W10-A2' };
}

function buildCompactRapatSnapshot_(payload) {
  const src = payload || {};
  return {
    id_rapat: String(src.id_rapat || src.id || '').trim(),
    tgl_surat: String(src.tgl_surat || '').trim(),
    kode_pejabat_ttd: String(src.kode_pejabat_ttd || 'KPA.W10-A2').trim(),
    kode_klasifikasi_surat: String(src.kode_klasifikasi_surat || '').trim(),
    pejabat_ttd_nip: String(src.pejabat_ttd_nip || '').trim(),
    pejabat_ttd_nama: String(src.pejabat_ttd_nama || '').trim(),
    pejabat_ttd_jabatan: String(src.pejabat_ttd_jabatan || '').trim(),
    tampilkan_gelar_undangan: Boolean(src.tampilkan_gelar_undangan),
    lampiran_surat: String(src.lampiran_surat || '-').trim(),
    tujuan_undangan_json: typeof src.tujuan_undangan_json === 'string'
      ? src.tujuan_undangan_json
      : JSON.stringify(src.tujuan_undangan_json || []),
    agenda: String(src.agenda || '').trim(),
    agenda_poin: String(src.agenda_poin || '').trim(),
    hari_tanggal: String(src.hari_tanggal || '').trim(),
    waktu_mulai: String(src.waktu_mulai || '08:00 WIB').trim(),
    waktu_selesai: String(src.waktu_selesai || 'Selesai').trim(),
    tempat: String(src.tempat || '').trim(),
    pemimpin: String(src.pemimpin || '').trim(),
    pemimpin_nip: String(src.pemimpin_nip || '').trim(),
    pemimpin_jabatan: String(src.pemimpin_jabatan || '').trim(),
    peserta_json: typeof src.peserta_json === 'string'
      ? src.peserta_json
      : JSON.stringify(src.peserta_json || [])
  };
}

function summarizeKepadaRapat_(payload) {
  const p = payload || {};
  let list = [];
  if (p.tujuan_undangan_json) {
    try {
      const parsed = typeof p.tujuan_undangan_json === 'string'
        ? JSON.parse(p.tujuan_undangan_json)
        : p.tujuan_undangan_json;
      if (Array.isArray(parsed)) list = parsed;
    } catch (e) {}
  }
  const labels = list.map(function (it) {
    return typeof it === 'string' ? it.trim() : String((it && (it.label || it.nama || it.jabatan)) || '').trim();
  }).filter(Boolean);
  if (labels.length === 0) return 'Peserta Rapat PA Indramayu';
  if (labels.length === 1) return labels[0];
  if (labels.length <= 3) return labels.join(', ');
  return labels[0] + ' dkk (' + labels.length + ' Pihak)';
}

function triggerN8nSuratKeluarRapat_(idRapat, payload) {
  try {
    const props = PropertiesService.getScriptProperties();
    const webhookUrl = props.getProperty('N8N_WEBHOOK_SURAT_KELUAR') ||
      'https://supernova-endpoint-unsubtly.ngrok-free.dev/webhook/generate-surat-keluar';
    const verifiedExecUrl = props.getProperty('TRANSKEP_EXEC_URL') ||
      'https://script.google.com/macros/s/AKfycbzFrbQTqmVzMio7mderK-S9ntFVjXiWYFgnXfy9fW_SUKOcIxfPywP2He1flhaK_AZ0ZA/exec';

    const accMeta = resolveMysimsAccountMetaRapat_(payload.kode_pejabat_ttd, payload.pejabat_ttd_jabatan);
    const cleanKode = String(payload.kode_klasifikasi_surat || payload.kode_surat || 'OT.01.1')
      .replace(/^UND\./i, '')
      .trim() || 'OT.01.1';
    const tglSuratIso = resolveIsoDateForMysimsRapat_(payload.tgl_surat);
    const agendaStr = String(payload.agenda || 'Rapat Dinas PA Indramayu').trim();
    const compactSnap = buildCompactRapatSnapshot_(Object.assign({}, payload, { id_rapat: idRapat }));

    const payloadN8n = {
      event: 'RAPAT_UNDANGAN_SURAT_KELUAR',
      id_rapat: String(idRapat),
      agenda: agendaStr,
      tanggal_surat: tglSuratIso,
      callback_url: verifiedExecUrl,
      secret_key: props.getProperty('TRANSKEP_WEBHOOK_KEY') || 'TRANSKEP_WA_BOT_2026',
      rapat_snapshot: compactSnap,
      task: {
        tipe: 'UNDANGAN_RAPAT',
        jabatan_penandatangan: accMeta.jabatan,
        satker_kode: accMeta.satker,
        kode_klasifikasi: cleanKode,
        sifat: 'Biasa',
        kepada: summarizeKepadaRapat_(payload),
        uraian: 'Undangan ' + agendaStr,
        ket: 'Biasa',
        tgl_surat: tglSuratIso
      },
      timestamp: new Date().toISOString()
    };

    const resp = UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payloadN8n),
      muteHttpExceptions: true
    });
    const code = Number(resp.getResponseCode() || 0);
    Logger.log('✅ [n8n Rapat Trigger] Webhook RAPAT_UNDANGAN_SURAT_KELUAR terkirim (' + idRapat + ' / ' + accMeta.satker + '/UND.' + cleanKode + '). Code: ' + code);
    if (code >= 200 && code < 400) {
      return { ok: true, code: code };
    }
    return { ok: false, code: code, message: 'Webhook n8n merespon HTTP ' + code };
  } catch (err) {
    Logger.log('⚠️ [triggerN8nSuratKeluarRapat_ Error] ' + err.toString());
    return { ok: false, code: 0, message: err.toString() };
  }
}

/**
 * RPC Admin Terotorisasi: Meminta Nomor Surat Keluar Undangan Rapat MYSIMS (sekali saja saat simpan tanpa no. urut)
 */
function requestRapatUndanganSuratKeluar(payload, adminNip, clientToken) {
  let lock = null;
  try {
    if (Array.isArray(payload)) {
      adminNip = adminNip || payload[1];
      clientToken = clientToken || payload[2];
      payload = payload[0] || {};
    }
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Permintaan nomor surat keluar Undangan Rapat hanya untuk Admin/Operator.' };
    }
    const idRapat = payload ? String(payload.id_rapat || payload.id || '').trim() : '';
    if (!payload || !idRapat) {
      return { status: 'error', message: "Parameter 'id_rapat' wajib disertakan." };
    }

    const prevStatus = String(payload.mysims_status || '').trim();
    const isPayloadAlreadySent = (
      payload.mysims_requested === true &&
      prevStatus !== 'Meminta Nomor MYSIMS' &&
      prevStatus.indexOf('Gagal') !== 0
    ) || prevStatus === 'Permintaan Terkirim ke MYSIMS' || prevStatus === 'Nomor Terbit MYSIMS';

    if (hasAssignedRapatNumber_(payload) || isPayloadAlreadySent) {
      return {
        status: 'already_exists',
        message: 'Agenda Rapat ini sudah memiliki atau sudah mengirimkan permintaan nomor surat MYSIMS.',
        id_rapat: idRapat,
        no_urut_surat: payload.no_urut_surat || '',
        nomor_undangan: payload.nomor_undangan || ''
      };
    }

    try {
      lock = LockService.getScriptLock();
      lock.waitLock(5000);
    } catch (eLock) {}

    const cache = CacheService.getScriptCache();
    const guardKey = 'rapat_sk_req_' + idRapat;
    if (cache.get(guardKey)) {
      return {
        status: 'already_exists',
        message: 'Permintaan nomor surat keluar Undangan Rapat sedang diproses. Edit berikutnya tidak meminta nomor ulang.',
        id_rapat: idRapat
      };
    }

    if (typeof firestoreRestGet_ === 'function') {
      const existingFs = firestoreRestGet_('eoffice_rapat', idRapat);
      if (existingFs && (hasAssignedRapatNumber_(existingFs) || String(existingFs.mysims_status || '').trim() === 'Nomor Terbit MYSIMS')) {
        return {
          status: 'already_exists',
          message: 'Nomor surat keluar Undangan Rapat sudah tercatat di Firestore.',
          id_rapat: idRapat,
          no_urut_surat: existingFs.no_urut_surat || '',
          nomor_undangan: existingFs.nomor_undangan || ''
        };
      }
    }

    cache.put(guardKey, '1', 600);
    try {
      cache.put('rapat_snap_' + idRapat, JSON.stringify(buildCompactRapatSnapshot_(Object.assign({}, payload, { id_rapat: idRapat }))), 1800);
    } catch (eSnap) {}

    const sendRes = triggerN8nSuratKeluarRapat_(idRapat, payload);
    if (!sendRes.ok) {
      cache.remove(guardKey);
      if (typeof firestoreRestPatch_ === 'function') {
        firestoreRestPatch_('eoffice_rapat', idRapat, {
          mysims_requested: false,
          mysims_status: 'Gagal Menghubungi MYSIMS'
        });
      }
      return { status: 'error', message: sendRes.message || 'Gagal menghubungi webhook n8n MYSIMS.' };
    }

    const accMeta = resolveMysimsAccountMetaRapat_(payload.kode_pejabat_ttd, payload.pejabat_ttd_jabatan);
    const cleanKode = String(payload.kode_klasifikasi_surat || 'OT.01.1').replace(/^UND\./i, '').trim() || 'OT.01.1';
    return {
      status: 'success',
      message: 'Permintaan nomor surat keluar Undangan (' + accMeta.satker + '/UND.' + cleanKode + ') berhasil dikirim ke MYSIMS.',
      id_rapat: idRapat
    };
  } catch (err) {
    Logger.log('⚠️ [requestRapatUndanganSuratKeluar Error] ' + err.toString());
    return { status: 'error', message: err.toString() };
  } finally {
    if (lock) {
      try { lock.releaseLock(); } catch (eRel) {}
    }
  }
}

/**
 * Callback Resmi dari n8n untuk Undangan Rapat:
 * 1. Verifikasi constant-time TRANSKEP_WEBHOOK_KEY
 * 2. Update no_urut_surat & nomor_undangan ke Cloud Firestore eoffice_rapat
 * 3. Kompilasi PDF Undangan Resmi via undangan_pdf_compiler.js -> kembalikan Base64 ke n8n
 */
function updateNomorSuratRapatFromExternal_(payload) {
  try {
    const idRapat = payload ? String(payload.id_rapat || payload.id || '').trim() : '';
    const nomorRaw = payload ? String(payload.nomor_undangan || payload.nomor_surat || payload.no_surat || '').trim() : '';
    if (!payload || !idRapat || !nomorRaw) {
      return { status: 'error', message: "Parameter 'id_rapat' dan 'nomor_surat' wajib disertakan." };
    }

    const scriptProps = PropertiesService.getScriptProperties();
    const configuredKey = String(scriptProps.getProperty('TRANSKEP_WEBHOOK_KEY') || 'TRANSKEP_WA_BOT_2026').trim();
    const incomingKey = String(payload.secret_key || '').trim();
    const isKeyMatch = (typeof constantTimeEquals_ === 'function')
      ? constantTimeEquals_(incomingKey, configuredKey)
      : (incomingKey !== '' && incomingKey === configuredKey);
    if (!incomingKey || !isKeyMatch) {
      return { status: 'error', message: 'Akses ditolak: Secret Key tidak valid.' };
    }

    if (nomorRaw.indexOf('NOMOR_MYSIMS_TERCATAT') !== -1 || nomorRaw.indexOf('...') !== -1) {
      return { status: 'error', message: 'Nomor surat Undangan Rapat tidak valid.' };
    }

    const segs = nomorRaw.split('/');
    const noUrutSurat = String(segs[0] || '').trim();

    let snapCached = {};
    try {
      const rawSnap = CacheService.getScriptCache().get('rapat_snap_' + idRapat);
      if (rawSnap) snapCached = JSON.parse(rawSnap);
    } catch (eSnap) {}

    let snapPayload = {};
    if (payload.rapat_snapshot) {
      try {
        snapPayload = (typeof payload.rapat_snapshot === 'string')
          ? JSON.parse(payload.rapat_snapshot)
          : payload.rapat_snapshot;
      } catch (ePs) {}
    }

    let fsRecord = null;
    if (typeof firestoreRestGet_ === 'function') {
      fsRecord = firestoreRestGet_('eoffice_rapat', idRapat);
    }
    const cleanFs = {};
    if (fsRecord && typeof fsRecord === 'object') {
      Object.keys(fsRecord).forEach(function (k) {
        const val = fsRecord[k];
        if (val !== undefined && val !== null && val !== '') cleanFs[k] = val;
      });
    }

    const mergedRecord = Object.assign({}, snapCached, snapPayload, cleanFs, {
      id: idRapat,
      id_rapat: idRapat,
      no_urut_surat: noUrutSurat,
      nomor_undangan: nomorRaw
    });

    const cachedResultObj = {
      id_rapat: idRapat,
      no_urut_surat: noUrutSurat,
      nomor_undangan: nomorRaw,
      mysims_idp: String(payload.idp || ''),
      mysims_status: 'Nomor Terbit MYSIMS',
      updated_at: new Date().toISOString()
    };
    try {
      CacheService.getScriptCache().put('rapat_res_' + idRapat, JSON.stringify(cachedResultObj), 21600);
    } catch (eCache) {}

    let firestoreSynced = false;
    let firestoreStatusCode = 0;
    if (typeof firestoreRestPatch_ === 'function') {
      const patchRes = firestoreRestPatch_('eoffice_rapat', idRapat, {
        no_urut_surat: noUrutSurat,
        nomor_undangan: nomorRaw,
        mysims_requested: true,
        mysims_status: 'Nomor Terbit MYSIMS',
        mysims_idp: String(payload.idp || ''),
        updated_at: { __timestamp: true }
      });
      firestoreSynced = Boolean(patchRes && patchRes.ok);
      firestoreStatusCode = Number((patchRes && patchRes.statusCode) || 0);
    }

    let pdfUndangan = { pdf_base64: '', pdf_filename: 'undangan_rapat.pdf' };
    if (typeof generateUndanganPdfBase64_ === 'function') {
      pdfUndangan = generateUndanganPdfBase64_(mergedRecord, nomorRaw);
    }

    Logger.log('✅ [n8n Rapat Callback] ID ' + idRapat + ' -> ' + nomorRaw + ' (Firestore=' + firestoreSynced + '/' + firestoreStatusCode + ', PDF=' + (pdfUndangan.pdf_base64 ? 'OK' : 'NO') + ')');
    return {
      status: 'success',
      message: 'Nomor surat keluar Undangan Rapat berhasil diperbarui & PDF siap diunggah ke MYSIMS.',
      id_rapat: idRapat,
      no_urut_surat: noUrutSurat,
      nomor_undangan: nomorRaw,
      firestore_synced: firestoreSynced,
      firestore_status_code: firestoreStatusCode,
      pdf_undangan: pdfUndangan
    };
  } catch (err) {
    Logger.log('❌ [updateNomorSuratRapatFromExternal_ Error] ' + err.toString());
    return { status: 'error', message: err.toString() };
  }
}

/**
 * RPC Admin Terotorisasi: Mengecek hasil nomor surat MYSIMS Undangan Rapat terbaru dari Cache GAS / Cloud Firestore
 */
function getRapatMysimsStatus(idRapat, adminNip, clientToken) {
  try {
    if (idRapat && typeof idRapat === 'object' && !Array.isArray(idRapat)) {
      const p = idRapat;
      adminNip = adminNip || p.adminNip || p.nip;
      clientToken = clientToken || p.token;
      idRapat = p.id_rapat || p.idRapat || p.id || '';
    }
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Hanya Admin/Operator yang dapat memeriksa status MYSIMS Rapat.' };
    }

    const cleanId = String(idRapat || '').trim();
    if (!cleanId) {
      return { status: 'error', message: "Parameter 'id_rapat' wajib diisi." };
    }

    try {
      const rawCached = CacheService.getScriptCache().get('rapat_res_' + cleanId);
      if (rawCached) {
        const parsed = JSON.parse(rawCached);
        if (parsed && hasAssignedRapatNumber_(parsed)) {
          return {
            status: 'success',
            source: 'cache',
            data: parsed
          };
        }
      }
    } catch (eCache) {}

    if (typeof firestoreRestGet_ === 'function') {
      const fsDoc = firestoreRestGet_('eoffice_rapat', cleanId);
      if (fsDoc && hasAssignedRapatNumber_(fsDoc)) {
        const noUnd = String(fsDoc.nomor_undangan || '').trim();
        const seg0 = (noUnd && noUnd.indexOf('/') !== -1) ? noUnd.split('/')[0].trim() : '';
        return {
          status: 'success',
          source: 'firestore',
          data: {
            id_rapat: cleanId,
            no_urut_surat: String(fsDoc.no_urut_surat || seg0 || '').trim(),
            nomor_undangan: noUnd,
            mysims_idp: String(fsDoc.mysims_idp || '').trim(),
            mysims_status: String(fsDoc.mysims_status || 'Nomor Terbit MYSIMS').trim(),
            updated_at: String(fsDoc.updated_at || '')
          }
        };
      }
    }

    return {
      status: 'pending',
      source: 'none',
      data: null,
      message: 'Nomor surat MYSIMS Undangan Rapat belum diterbitkan.'
    };
  } catch (err) {
    Logger.log('⚠️ [getRapatMysimsStatus] ' + err.toString());
    return { status: 'error', message: err.toString() };
  }
}
