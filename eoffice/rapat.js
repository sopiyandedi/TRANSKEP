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
 * Helper: Mengambil / Membuat Folder Privat Google Drive untuk Dokumentasi Foto Rapat
 */
function getOrCreateFotoRapatFolder_() {
  const folderName = 'Arsip Foto Rapat TRANSKEP';
  const folders = DriveApp.getFoldersByName(folderName);
  let targetFolder;
  if (folders.hasNext()) {
    targetFolder = folders.next();
  } else {
    targetFolder = DriveApp.createFolder(folderName);
  }
  if (typeof setPrivateDriveSharing_ === 'function') {
    setPrivateDriveSharing_(targetFolder);
  }
  return targetFolder;
}

/**
 * RPC Aman: Upload Foto Dokumentasi Rapat Terkompresi ke Google Drive Privat
 */
function uploadFotoRapat(payload, adminNip, clientToken) {
  try {
    if (!cekOtorisasiAdmin(adminNip, clientToken)) {
      return { status: 'error', message: 'Akses Ditolak: Unggah foto rapat hanya dapat dilakukan oleh Admin/Operator.' };
    }
    const p = payload || {};
    const validated = validateUploadedFile_(
      p.file_data,
      p.file_name || 'foto_rapat.jpg',
      p.mime_type || 'image/jpeg',
      { allowPdf: false, allowImages: true, maxBytes: 5 * 1024 * 1024 }
    );

    const safePrefix = String(p.id_rapat || 'RPT').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'RPT';
    const stamp = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd_HHmmss');
    const finalName = 'Foto_' + safePrefix + '_' + stamp + '_' + Math.floor(Math.random() * 1000) + '.' + validated.ext;

    const blob = Utilities.newBlob(validated.bytes, validated.blobMimeType, finalName);
    const folder = getOrCreateFotoRapatFolder_();
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
        mime_type: validated.blobMimeType
      }
    };
  } catch (err) {
    Logger.log('ERROR uploadFotoRapat: ' + err.toString());
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
