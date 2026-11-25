// =========================================================================
// FILE: modules/sk/sk_doc_parser.js (Utilitas Bersama Ekstraksi SK Word & PDF)
// DESKRIPSI: Parsing .docx (Mammoth), .doc (Binary OLE), dan .pdf (PDF.js X/Y)
//            serta pencocokan otomatis Nama/NIP/Jabatan Pegawai TRANSKEP.
// =========================================================================

(function (global) {
  'use strict';

  const MONTH_MAP = {
    januari: '01', jan: '01',
    februari: '02', pebruari: '02', feb: '02',
    maret: '03', mar: '03',
    april: '04', apr: '04',
    mei: '05', may: '05',
    juni: '06', jun: '06',
    juli: '07', jul: '07',
    agustus: '08', aug: '08', agu: '08', ags: '08',
    september: '09', sep: '09', sept: '09',
    oktober: '10', oct: '10', okt: '10',
    november: '11', nopember: '11', nov: '11',
    desember: '12', dec: '12', des: '12'
  };

  function stripTitles(s) {
    return String(s || '')
      .replace(/\b(drs|dra|dr|ir|h|hj|sh|mh|sag|ssi|sip|se|st|skom|spd|mpd|skm|mkn|amd|ab|mm|ma|shi|mhi|ak|ca|spsi|mpsi|sthi|mth)\b\.?/gi, ' ')
      .replace(/[^a-zA-Z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function parseIndoDateToIso(dateStr) {
    if (!dateStr) return '';
    const clean = String(dateStr).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

    const m = clean.match(/(\d{1,2})\s*[-\/\s]\s*([a-zA-Z]+)\s*[-\/\s]\s*(\d{4})/);
    if (m) {
      const dd = String(m[1]).padStart(2, '0');
      const mm = MONTH_MAP[m[2].toLowerCase()];
      const yyyy = m[3];
      if (mm) return `${yyyy}-${mm}-${dd}`;
    }

    const mSlash = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mSlash) {
      return `${mSlash[3]}-${String(mSlash[2]).padStart(2, '0')}-${String(mSlash[1]).padStart(2, '0')}`;
    }
    return '';
  }

  function extractLegacyDocStream(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let raw = '';
    const CHUNK = 8192;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      raw += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
    }

    let startIdx = -1;
    const bjbjIdx = raw.indexOf('bjbj');
    if (bjbjIdx !== -1) {
      const afterFib = raw.slice(bjbjIdx + 100);
      const matchStart = afterFib.search(/(KETUA|SEKRETARIS|KEPUTUSAN|PENGADILAN\s+AGAMA|MAHKAMAH\s+AGUNG)/i);
      if (matchStart !== -1) {
        startIdx = bjbjIdx + 100 + matchStart;
      }
    }
    if (startIdx === -1) {
      startIdx = raw.search(/(KEPUTUSAN\s+(KETUA|SEKRETARIS)|KETUA\s+PENGADILAN\s+AGAMA)/i);
    }
    if (startIdx === -1) return '';

    let slice = raw.slice(startIdx);
    const nullRun = slice.indexOf('\x00\x00\x00\x00');
    if (nullRun !== -1) {
      slice = slice.slice(0, nullRun);
    }

    return slice.replace(/[\x00-\x06\x08\x0B\x0C\x0E-\x1F]/g, '');
  }

  /**
   * Mencocokkan 1 baris personil hasil ekstraksi dokumen terhadap daftar pegawai TRANSKEP.
   * Memperbarui row secara in-place dan menambahkan metadata status pencocokan.
   */
  function autoMatchPegawaiRow(row, usersList) {
    if (!row) return row;
    const uList = Array.isArray(usersList) ? usersList : [];
    const rawNama = String(row.nama || '').trim();
    const rawNipHint = String(row.nip || '').replace(/['"\s.-]/g, '').trim();
    const rawJabDinas = String(row.jabatan_dinas || '').trim();

    row.source_nama = row.source_nama || rawNama;
    row.source_jabatan_dinas = row.source_jabatan_dinas || rawJabDinas;
    row.match_status = 'unmatched';
    row.match_label = 'Perlu Cek Admin';

    if (uList.length === 0) return row;

    // 1. Cek jika ada NIP 18 digit eksplisit (di row.nip atau terselip di teks nama)
    const nipInNama = rawNama.match(/\b(19\d{16}|20\d{16})\b/);
    const explicitNip = /^\d{18}$/.test(rawNipHint) ? rawNipHint : (nipInNama ? nipInNama[1] : '');
    if (explicitNip) {
      const byNip = uList.find(u => String(u.nip).trim() === explicitNip);
      if (byNip) {
        row.nip = byNip.nip;
        row.nama = byNip.nama;
        if (!row.jabatan_dinas || row.jabatan_dinas === '-') row.jabatan_dinas = byNip.jabatan || '-';
        row.match_status = 'matched';
        row.match_label = 'NIP Cocok';
        return row;
      }
    }

    // 2. Pencocokan Nama Pegawai (jika bukan 'noname' / kosong)
    const cleanedNama = rawNama.replace(/NIP\.?\s*[\d\s.-]+$/i, '').trim();
    if (cleanedNama && cleanedNama.toLowerCase() !== 'noname' && cleanedNama !== '-') {
      let matchedUser = uList.find(u => (u.nama || '').toLowerCase().trim() === cleanedNama.toLowerCase());
      let exactHit = !!matchedUser;
      if (!matchedUser) {
        const targetCore = stripTitles(cleanedNama);
        if (targetCore.length >= 3) {
          const coreCandidates = uList.filter(u => {
            const uCore = stripTitles(u.nama);
            return uCore && (uCore === targetCore || uCore.includes(targetCore) || targetCore.includes(uCore));
          });
          if (coreCandidates.length === 1) {
            matchedUser = coreCandidates[0];
          } else if (coreCandidates.length > 1) {
            // Pilih kandidat dengan panjang inti nama terdekat
            matchedUser = coreCandidates.sort((a, b) => {
              const da = Math.abs(stripTitles(a.nama).length - targetCore.length);
              const db = Math.abs(stripTitles(b.nama).length - targetCore.length);
              return da - db;
            })[0];
          }
        }
      }
      if (matchedUser) {
        row.nip = matchedUser.nip;
        row.nama = matchedUser.nama;
        if (!row.jabatan_dinas || row.jabatan_dinas === '-') row.jabatan_dinas = matchedUser.jabatan || '-';
        row.match_status = 'matched';
        row.match_label = exactHit ? 'Nama Persis' : 'Nama Cocok';
        return row;
      }
    }

    // 3. Fallback jabatan tunggal spesifik apabila nama masih 'noname' atau kosong
    if ((!cleanedNama || cleanedNama.toLowerCase() === 'noname') && rawJabDinas) {
      const jabLower = rawJabDinas.toLowerCase().trim();
      const candidates = uList.filter(u => {
        const uJab = (u.jabatan || '').toLowerCase().trim();
        if (!uJab) return false;
        if (jabLower === 'wakil ketua') return uJab === 'wakil ketua';
        if (jabLower === 'ketua') return uJab === 'ketua';
        if (jabLower === 'panitera') return uJab === 'panitera';
        if (jabLower === 'sekretaris') return uJab === 'sekretaris';
        return uJab === jabLower;
      });
      if (candidates.length === 1) {
        row.nip = candidates[0].nip;
        row.nama = candidates[0].nama;
        row.match_status = 'matched';
        row.match_label = 'Jabatan Cocok';
      }
    }

    return row;
  }

  /**
   * Memetakan indeks kolom header tabel Lampiran I SK secara adaptif.
   */
  function mapLampiranColumnIndices(headerCells) {
    let idxNo = -1, idxNama = -1, idxDinas = -1, idxTim = -1, idxExtra = -1;
    const headersObj = {
      no: 'No',
      nama: 'Nama',
      jabatan_dinas: 'Jabatan Dalam Dinas',
      jabatan_tim: 'Jabatan Tim',
      extra: 'Keterangan'
    };

    headerCells.forEach((hText, cIdx) => {
      const hLow = String(hText || '').toLowerCase().trim();
      if (idxNo === -1 && /^(no|nomor|urut)\b/.test(hLow)) {
        idxNo = cIdx;
        headersObj.no = hText || 'No';
      } else if (idxNama === -1 && hLow.includes('nama')) {
        idxNama = cIdx;
        headersObj.nama = hText || 'Nama';
      } else if (idxTim === -1 && (hLow.includes('tim') || hLow.includes('kedudukan') || hLow.includes('peran') || hLow.includes('penugasan'))) {
        idxTim = cIdx;
        headersObj.jabatan_tim = hText || 'Jabatan Tim';
      } else if (idxDinas === -1 && (hLow.includes('dinas') || hLow.includes('jabatan') || hLow.includes('pangkat') || hLow.includes('struktural'))) {
        idxDinas = cIdx;
        headersObj.jabatan_dinas = hText || 'Jabatan Dalam Dinas';
      } else if (idxExtra === -1) {
        idxExtra = cIdx;
        headersObj.extra = hText || 'Keterangan';
      }
    });

    if (idxNama !== -1 && idxDinas === -1 && idxTim === -1 && headerCells.length >= 4) {
      idxDinas = 2;
      idxTim = 3;
    } else if (idxNama !== -1 && idxTim !== -1 && idxDinas === -1 && headerCells.length >= 3) {
      idxDinas = headerCells.findIndex((_, i) => i !== idxNo && i !== idxNama && i !== idxTim);
    }

    return { idxNo, idxNama, idxDinas, idxTim, idxExtra, headersObj };
  }

  function parseHtmlTablesForLampiran(htmlText, usersList) {
    if (!htmlText || typeof DOMParser === 'undefined') return null;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlText, 'text/html');
      const tables = Array.from(doc.querySelectorAll('table'));
      for (const tbl of tables) {
        const trs = Array.from(tbl.querySelectorAll('tr'));
        if (trs.length < 2) continue;

        let headerRowIdx = -1;
        let headerCells = [];
        for (let r = 0; r < Math.min(3, trs.length); r++) {
          const cells = Array.from(trs[r].querySelectorAll('th, td')).map(c => (c.textContent || '').replace(/\s+/g, ' ').trim());
          const joined = cells.join(' ').toLowerCase();
          if (joined.includes('nama') && (joined.includes('jabatan') || joined.includes('kedudukan') || joined.includes('tim') || joined.includes('peran'))) {
            headerRowIdx = r;
            headerCells = cells;
            break;
          }
        }
        if (headerRowIdx === -1) continue;

        const { idxNo, idxNama, idxDinas, idxTim, idxExtra, headersObj } = mapLampiranColumnIndices(headerCells);
        const extractedRows = [];
        let lastJabatanTim = 'Anggota';

        for (let r = headerRowIdx + 1; r < trs.length; r++) {
          const tdEls = Array.from(trs[r].querySelectorAll('td, th'));
          if (tdEls.length < 2) continue;

          const getCellLines = (colIdx) => {
            if (colIdx < 0 || colIdx >= tdEls.length) return [''];
            const cell = tdEls[colIdx];
            const pList = Array.from(cell.querySelectorAll('p, li'));
            if (pList.length > 1) {
              return pList.map(p => (p.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
            }
            return [(cell.textContent || '').replace(/\s+/g, ' ').trim()];
          };

          const namaLines = getCellLines(idxNama !== -1 ? idxNama : 1);
          const dinasLines = getCellLines(idxDinas !== -1 ? idxDinas : 2);
          const timLines = getCellLines(idxTim !== -1 ? idxTim : 3);
          const extraLines = idxExtra !== -1 ? getCellLines(idxExtra) : [''];

          const maxSubRows = Math.max(namaLines.length, dinasLines.length);
          for (let s = 0; s < maxSubRows; s++) {
            const nm = namaLines[s] !== undefined ? namaLines[s] : (namaLines[0] || '');
            const dn = dinasLines[s] !== undefined ? dinasLines[s] : (dinasLines[0] || '');
            let tm = timLines[s] !== undefined ? timLines[s] : (timLines[0] || '');
            const ex = extraLines[s] !== undefined ? extraLines[s] : (extraLines[0] || '');

            if (tm) lastJabatanTim = tm;
            else tm = lastJabatanTim;

            if (nm || dn) {
              const rowObj = {
                nama: nm,
                nip: '',
                jabatan_dinas: dn,
                jabatan_tim: tm || 'Anggota',
                extra: ex
              };
              autoMatchPegawaiRow(rowObj, usersList);
              extractedRows.push(rowObj);
            }
          }
        }

        if (extractedRows.length > 0) {
          return {
            headers: headersObj,
            show_extra: idxExtra !== -1,
            rows: extractedRows
          };
        }
      }
    } catch (e) {
      console.warn('[SkDocParser] HTML Table parse warning:', e);
    }
    return null;
  }

  /**
   * Mengekstrak metadata utama SK (pejabat, nomor, judul, tanggal ISO) dari teks naskah utama.
   */
  function extractCoreSkMetadata(fullPlainText, fileName) {
    const normPlain = String(fullPlainText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\x07+/g, '\t');
    const lampIdx = normPlain.search(/(?:^|\n)\s*Lampiran\s+(?:I|1)\b/i);
    const mainPart = lampIdx !== -1 ? normPlain.slice(0, lampIdx) : normPlain;
    const lampiranPart = lampIdx !== -1 ? normPlain.slice(lampIdx) : '';

    let pejabatPembuat = 'KETUA PENGADILAN AGAMA INDRAMAYU';
    if (/KEPUTUSAN\s+SEKRETARIS\s+PENGADILAN\s+AGAMA\s+INDRAMAYU/i.test(mainPart)) {
      pejabatPembuat = 'SEKRETARIS PENGADILAN AGAMA INDRAMAYU';
    } else if (/KEPUTUSAN\s+KETUA\s+PENGADILAN\s+AGAMA\s+INDRAMAYU/i.test(mainPart)) {
      pejabatPembuat = 'KETUA PENGADILAN AGAMA INDRAMAYU';
    }

    let noSk = '';
    const noMatch = mainPart.match(/Nomor\s*:\s*([^\n\t]+)/i) || normPlain.match(/Nomor\s*:\s*([^\n\t]+)/i);
    if (noMatch && noMatch[1]) {
      const cand = noMatch[1].replace(/\s+/g, ' ').trim();
      if (cand && cand !== '-' && !/^\.{3,}$/.test(cand)) {
        noSk = cand;
        if (/\/SEK\./i.test(noSk) && !/\/KPA\./i.test(noSk)) {
          pejabatPembuat = 'SEKRETARIS PENGADILAN AGAMA INDRAMAYU';
        }
      }
    }

    let judulSk = '';
    const tentangMatch = mainPart.match(/TENTANG\s*\n+([\s\S]*?)(?=\n\s*(?:KETUA|SEKRETARIS)\s+PENGADILAN\s+AGAMA|\n\s*Membaca\b|\n\s*Menimbang\b|\n\s*Mengingat\b)/i);
    if (tentangMatch && tentangMatch[1].trim()) {
      judulSk = tentangMatch[1]
        .split(/\n+/)
        .map(s => s.trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .replace(/\.(pdf|docx?)$/i, '')
        .trim();
    } else if (fileName) {
      judulSk = String(fileName).replace(/\.(pdf|docx?)$/i, '').replace(/[_]+/g, ' ').trim();
    }

    let tglSkIso = '';
    const padaTglMatch = mainPart.match(/Pada\s+tanggal\s*[:\t]*([^\n\r]+)/i);
    if (padaTglMatch && padaTglMatch[1].trim()) {
      tglSkIso = parseIndoDateToIso(padaTglMatch[1].trim());
    }
    if (!tglSkIso && lampiranPart) {
      const lampTglMatch = lampiranPart.match(/Tanggal\s*[:\t]*([^\n\r]+)/i);
      if (lampTglMatch && lampTglMatch[1].trim()) {
        tglSkIso = parseIndoDateToIso(lampTglMatch[1].trim());
      }
    }
    if (!tglSkIso) {
      const anyPada = normPlain.match(/Pada\s+tanggal\s*[:\t]*([^\n\r]+)/i);
      if (anyPada && anyPada[1].trim()) {
        tglSkIso = parseIndoDateToIso(anyPada[1].trim());
      }
    }

    return {
      pejabat_pembuat: pejabatPembuat,
      no_sk: noSk,
      judul_sk: judulSk,
      tgl_sk: tglSkIso,
      mainPart,
      lampiranPart
    };
  }

  /**
   * Mendeteksi apakah byte PDF sudah membawa tanda tangan kriptografis (/Type /Sig & /ByteRange).
   */
  function detectEmbeddedPdfSignature(pdfBytes) {
    try {
      const arr = (pdfBytes instanceof Uint8Array) ? pdfBytes : new Uint8Array(pdfBytes);
      let ascii = '';
      const CHUNK = 8192;
      for (let i = 0; i < arr.length; i += CHUNK) {
        ascii += String.fromCharCode.apply(null, arr.subarray(i, Math.min(i + CHUNK, arr.length)));
      }
      const hasSigDict = /\/Type\s*\/Sig\b/.test(ascii);
      const hasByteRange = /\/ByteRange\s*\[\s*\d+\s+\d+\s+\d+\s+\d+\s*\]/.test(ascii);
      const hasSubFilter = /\/SubFilter\s*\/(?:adbe\.pkcs7|ETSI\.CAdES)/.test(ascii);
      const isBsreIssuer = /Balai\s+(?:Besar\s+)?Sertifikasi\s+Elektronik|BSrE|BSSN|Adobe\.PPKLite/i.test(ascii);
      return {
        signed: hasSigDict && hasByteRange && hasSubFilter,
        isBsre: hasSigDict && hasByteRange && /BSrE|Balai\s+(?:Besar\s+)?Sertifikasi\s+Elektronik|BSSN/i.test(ascii),
        isExternalOrSigned: (hasSigDict && hasByteRange) || isBsreIssuer
      };
    } catch (e) {
      return { signed: false, isBsre: false, isExternalOrSigned: false };
    }
  }

  /**
   * Mengelompokkan item teks PDF.js menjadi baris visual berurutan atas-ke-bawah dengan koordinat X/Y.
   */
  function groupPdfTextItemsToRows(items) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const tokens = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || !it.str) continue;
      const text = String(it.str).replace(/\u00a0/g, ' ');
      if (!text.trim()) continue;
      const tr = Array.isArray(it.transform) ? it.transform : [1, 0, 0, 1, 0, 0];
      const x = Number(tr[4]) || 0;
      const y = Number(tr[5]) || 0;
      const w = Number(it.width) || (text.length * 4);
      tokens.push({ x, y, endX: x + w, text: text.trim() });
    }
    if (tokens.length === 0) return [];

    // Sort top-to-bottom (Y besar di atas pada koordinat PDF), lalu kiri-ke-kanan (X kecil)
    tokens.sort((a, b) => {
      if (Math.abs(a.y - b.y) > 4.2) return b.y - a.y;
      return a.x - b.x;
    });

    const rows = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const lastRow = rows[rows.length - 1];
      if (lastRow && Math.abs(lastRow.y - tok.y) <= 4.2) {
        lastRow.tokens.push(tok);
        lastRow.y = (lastRow.y + tok.y) / 2;
      } else {
        rows.push({ y: tok.y, tokens: [tok] });
      }
    }

    rows.forEach(r => {
      r.tokens.sort((a, b) => a.x - b.x);
      let line = '';
      for (let i = 0; i < r.tokens.length; i++) {
        const cur = r.tokens[i];
        if (i === 0) {
          line = cur.text;
        } else {
          const prev = r.tokens[i - 1];
          const gap = cur.x - prev.endX;
          line += (gap > 14 ? '\t' : ' ') + cur.text;
        }
      }
      r.text = line.replace(/\s+/g, ' ').trim();
      r.tabText = line.trim();
    });

    return rows;
  }

  /**
   * Mengekstrak baris-baris tabel Lampiran I dari array halaman berisi baris X/Y hasil PDF.js.
   */
  function extractLampiranMembersFromPdfPages(pagesRows, usersList) {
    if (!Array.isArray(pagesRows) || pagesRows.length === 0) return [];

    let colLayout = null;
    const rawEntries = [];
    let lastJabatanTim = 'Anggota';

    const buildBounds = (headerTokens) => {
      // Gabungkan token header yang berdekatan pada sumbu X (jarak <= 18pt) agar "Jabatan Dalam Dinas" jadi 1 kolom
      const clusters = [];
      for (let i = 0; i < headerTokens.length; i++) {
        const tk = headerTokens[i];
        const prev = clusters[clusters.length - 1];
        if (prev && (tk.x - prev.endX) <= 18) {
          prev.text += ' ' + tk.text;
          prev.endX = Math.max(prev.endX, tk.endX);
        } else {
          clusters.push({ x: tk.x, endX: tk.endX, text: tk.text });
        }
      }
      if (clusters.length < 2) return null;

      const mapped = mapLampiranColumnIndices(clusters.map(c => c.text));
      if (mapped.idxNama === -1 && mapped.idxNo === -1) return null;

      // Hitung batas rentang X antarkolom berdasarkan titik tengah antara ujung header kiri dan awal header kanan
      const cols = clusters.map((c, idx) => {
        const minX = idx === 0 ? -Infinity : (clusters[idx - 1].endX + c.x) / 2;
        const maxX = idx === clusters.length - 1 ? Infinity : (c.endX + clusters[idx + 1].x) / 2;
        let role = 'extra';
        if (idx === mapped.idxNo) role = 'no';
        else if (idx === mapped.idxNama) role = 'nama';
        else if (idx === mapped.idxDinas) role = 'dinas';
        else if (idx === mapped.idxTim) role = 'tim';
        return { idx, minX, maxX, x: c.x, role, headerText: c.text };
      });
      return cols;
    };

    const assignTokenToCol = (cols, tokenX) => {
      for (let i = 0; i < cols.length; i++) {
        if (tokenX >= cols[i].minX && tokenX < cols[i].maxX) {
          return cols[i].role;
        }
      }
      return cols[cols.length - 1].role;
    };

    let stopped = false;
    for (let pIdx = 0; pIdx < pagesRows.length && !stopped; pIdx++) {
      const rows = pagesRows[pIdx] || [];
      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];
        const low = row.text.toLowerCase();

        // Cek apakah baris ini adalah header tabel Lampiran
        const isHeaderCandidate =
          (low.includes('nama') && (low.includes('jabatan') || low.includes('kedudukan') || low.includes('tim') || low.includes('peran'))) ||
          (/^(no|nomor)\b/i.test(low) && low.includes('nama'));

        if (isHeaderCandidate) {
          const parsedLayout = buildBounds(row.tokens);
          if (parsedLayout) {
            colLayout = parsedLayout;
            continue;
          }
        }

        if (!colLayout) continue;

        // Lewati nomor baris kolom jika Word mencetak baris angka header "1  2  3  4" tepat di bawah header tabel
        if (rawEntries.length === 0 && /^1\s+2(\s+3)?(\s+4)?(\s+5)?$/.test(row.text)) {
          continue;
        }

        // Hentikan bila masuk blok tanda tangan atau Lampiran II setelah tabel anggota sudah ditemukan
        const firstTokX = row.tokens[0] ? row.tokens[0].x : 0;
        if (rawEntries.length > 0 && (
          /^(?:ditetapkan\s+di|pada\s+tanggal|lampiran\s+(?:ii|iii|iv|2|3|4)|tembusan|salinan\s+keputusan)\b/i.test(low) ||
          /^(?:plt\.?\s+|plh\.?\s+|wakil\s+)?(?:ketua|sekretaris)\s+pengadilan\s+agama\b/i.test(low) ||
          (firstTokX >= 230 && /^(?:ketua|sekretaris)\s*,?\s*$/i.test(low))
        )) {
          stopped = true;
          break;
        }

        // Abaikan nomor halaman footer tunggal di bawah halaman PDF
        if (/^(?:-\s*)?\d{1,2}(?:\s*-)?$/.test(low) && row.y < 70) {
          continue;
        }

        // Petakan token baris ini ke kolom (no, nama, dinas, tim)
        const buckets = { no: [], nama: [], dinas: [], tim: [], extra: [] };
        for (let t = 0; t < row.tokens.length; t++) {
          const tk = row.tokens[t];
          const colRole = assignTokenToCol(colLayout, tk.x);
          buckets[colRole].push(tk.text);
        }

        const cNo = buckets.no.join(' ').trim();
        const cNama = buckets.nama.join(' ').trim();
        const cDinas = buckets.dinas.join(' ').trim();
        const cTim = buckets.tim.join(' ').trim();

        const hasValidNo = /^\d{1,3}\.?$/.test(cNo);
        const lastEntry = rawEntries[rawEntries.length - 1];

        // Kasus 1: Baris lanjutan NIP di bawah nama dalam sel yang sama ("NIP. 198..."), meski kolom jabatan ikut word-wrap sejajar
        if (!hasValidNo && lastEntry && /^NIP\.?\s*[\d\s.-]{8,}/i.test(cNama)) {
          const nipDigits = cNama.replace(/\D/g, '');
          if (nipDigits.length === 18) lastEntry.nip = nipDigits;
          if (cDinas) lastEntry.jabatan_dinas = [lastEntry.jabatan_dinas, cDinas].filter(Boolean).join(' ').trim();
          if (cTim) lastEntry.jabatan_tim = [lastEntry.jabatan_tim, cTim].filter(Boolean).join(' ').trim();
          continue;
        }

        // Kasus 2: Baris sambungan word-wrap di dalam kolom Jabatan Dinas / Nama / Tim (tidak ada nomor urut)
        if (!hasValidNo && lastEntry && !cNama && (cDinas || cTim)) {
          if (cDinas) lastEntry.jabatan_dinas = [lastEntry.jabatan_dinas, cDinas].filter(Boolean).join(' ').trim();
          if (cTim) lastEntry.jabatan_tim = [lastEntry.jabatan_tim, cTim].filter(Boolean).join(' ').trim();
          continue;
        }

        // Kasus 3: Sambungan baris kedua dari Nama panjang tanpa nomor baru, bila tidak ada jabatan baru dan bukan nama bertitel baru
        if (!hasValidNo && lastEntry && cNama && !cDinas && !cTim && rawEntries.length > 0 && !/[,]/.test(cNama)) {
          lastEntry.nama = [lastEntry.nama, cNama].filter(Boolean).join(' ').trim();
          continue;
        }

        if (cNama || cDinas) {
          let roleTim = cTim;
          if (roleTim) lastJabatanTim = roleTim;
          else roleTim = lastJabatanTim;

          rawEntries.push({
            nama: cNama,
            nip: '',
            jabatan_dinas: cDinas,
            jabatan_tim: roleTim || 'Anggota'
          });
        }
      }
    }

    return rawEntries.map(r => autoMatchPegawaiRow({ ...r }, usersList));
  }

  function configurePdfJsWorker() {
    if (typeof global.pdfjsLib !== 'undefined' && global.pdfjsLib.GlobalWorkerOptions) {
      if (!global.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        global.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      }
    }
  }

  /**
   * Ekstraksi penuh file PDF (Save As PDF dari MS Word) via PDF.js.
   */
  async function parsePdfFile(arrayBuffer, fileName, usersList) {
    if (typeof global.pdfjsLib === 'undefined') {
      throw new Error('Pustaka pembaca PDF (pdf.js) belum dimuat.');
    }
    configurePdfJsWorker();

    const sigInfo = detectEmbeddedPdfSignature(arrayBuffer);
    const bytesCopy = new Uint8Array(arrayBuffer).slice(0);
    const loadingTask = global.pdfjsLib.getDocument({ data: bytesCopy });
    const pdfDoc = await loadingTask.promise;

    const pagesRows = [];
    const pageTexts = [];
    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const tc = await page.getTextContent();
      const rows = groupPdfTextItemsToRows(tc.items || []);
      pagesRows.push(rows);
      pageTexts.push(rows.map(r => r.text).join('\n'));
    }

    const fullText = pageTexts.join('\n');
    const cleanTextLen = fullText.replace(/\s+/g, '').length;
    const hasReadableText = cleanTextLen >= 40;

    const meta = extractCoreSkMetadata(fullText, fileName);
    const members = hasReadableText ? extractLampiranMembersFromPdfPages(pagesRows, usersList) : [];

    return {
      sourceType: 'pdf',
      numPages: pdfDoc.numPages,
      hasReadableText,
      sigInfo,
      pejabat_pembuat: meta.pejabat_pembuat,
      no_sk: meta.no_sk,
      judul_sk: meta.judul_sk,
      tgl_sk: meta.tgl_sk,
      members
    };
  }

  /**
   * Ekstraksi penuh file Word (.docx atau .doc) via Mammoth.js / OLE binary stream.
   */
  async function parseWordFile(arrayBuffer, fileName, usersList) {
    const uint8 = new Uint8Array(arrayBuffer);
    const isDocxZip = uint8.length >= 2 && uint8[0] === 0x50 && uint8[1] === 0x4B;
    const isDocOle = uint8.length >= 4 && uint8[0] === 0xD0 && uint8[1] === 0xCF && uint8[2] === 0x11 && uint8[3] === 0xE0;

    let rawText = '';
    let htmlText = '';
    if (isDocxZip) {
      if (typeof global.mammoth === 'undefined') {
        throw new Error('Pustaka pembaca Word (Mammoth.js) belum termuat.');
      }
      const [txtRes, htmlRes] = await Promise.all([
        global.mammoth.extractRawText({ arrayBuffer }),
        global.mammoth.convertToHtml({ arrayBuffer })
      ]);
      rawText = txtRes.value || '';
      htmlText = htmlRes.value || '';
    } else if (isDocOle) {
      rawText = extractLegacyDocStream(arrayBuffer);
    } else {
      throw new Error('Format berkas Word tidak dikenali (pastikan .docx atau .doc yang valid).');
    }

    const meta = extractCoreSkMetadata(rawText, fileName);
    let members = [];

    const parsedTable = htmlText ? parseHtmlTablesForLampiran(htmlText, usersList) : null;
    if (parsedTable && Array.isArray(parsedTable.rows)) {
      members = parsedTable.rows;
    } else if (rawText.includes('\x07')) {
      const lampBellIdx = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').search(/(?:^|\n)\s*Lampiran\s+(?:I|1)\b/i);
      const lampBell = lampBellIdx !== -1 ? rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').slice(lampBellIdx) : rawText;
      const tableStartIdx = lampBell.search(/No\x07/i);
      if (tableStartIdx !== -1) {
        const rawRows = lampBell.slice(tableStartIdx).split(/\x07\x07/);
        let lastRole = 'Anggota';
        rawRows.forEach((rStr, idx) => {
          if (idx === 0 || !rStr.includes('\x07')) return;
          const cells = rStr.split('\x07').map(c => c.trim());
          if (cells.length >= 3) {
            const isNumCol = /^\d+$/.test(cells[0]);
            const nama = isNumCol ? (cells[1] || '') : (cells[0] || '');
            const jabDinas = isNumCol ? (cells[2] || '') : (cells[1] || '');
            let jabTim = isNumCol ? (cells[3] || '') : (cells[2] || '');
            if (jabTim) lastRole = jabTim;
            else jabTim = lastRole;
            if (nama || jabDinas) {
              const rObj = { nama, nip: '', jabatan_dinas: jabDinas, jabatan_tim: jabTim || 'Anggota' };
              autoMatchPegawaiRow(rObj, usersList);
              members.push(rObj);
            }
          }
        });
      }
    }

    return {
      sourceType: isDocxZip ? 'docx' : 'doc',
      hasReadableText: rawText.trim().length >= 20,
      rawText,
      htmlText,
      pejabat_pembuat: meta.pejabat_pembuat,
      no_sk: meta.no_sk,
      judul_sk: meta.judul_sk,
      tgl_sk: meta.tgl_sk,
      members
    };
  }

  /**
   * Mengonversi hasil anggota parser menjadi pasangan daftar member valid (siap simpan) + item belum cocok (untuk cek Admin).
   */
  function splitMatchedMembersForForm(parsedRows) {
    const matched = [];
    const unmatched = [];
    const seenNip = new Set();

    (parsedRows || []).forEach((r, idx) => {
      const peran = String(r.jabatan_tim || r.peran || 'Anggota').trim() || 'Anggota';
      const cleanNip = String(r.nip || '').trim();
      if (cleanNip && r.match_status === 'matched') {
        if (!seenNip.has(cleanNip)) {
          seenNip.add(cleanNip);
          matched.push({
            nip: cleanNip,
            peran,
            _matchLabel: r.match_label || 'Cocok NIP',
            _sourceNama: r.source_nama || r.nama || ''
          });
        }
      } else {
        unmatched.push({
          uid: 'unm_' + Date.now() + '_' + idx,
          source_nama: r.source_nama || r.nama || '(Tanpa Nama)',
          source_jabatan: r.source_jabatan_dinas || r.jabatan_dinas || '-',
          peran,
          selectedNip: ''
        });
      }
    });

    return { matched, unmatched };
  }

  const SkDocParser = {
    parseIndoDateToIso,
    extractLegacyDocStream,
    autoMatchPegawaiRow,
    mapLampiranColumnIndices,
    parseHtmlTablesForLampiran,
    extractCoreSkMetadata,
    detectEmbeddedPdfSignature,
    groupPdfTextItemsToRows,
    extractLampiranMembersFromPdfPages,
    configurePdfJsWorker,
    parsePdfFile,
    parseWordFile,
    splitMatchedMembersForForm
  };

  global.SkDocParser = SkDocParser;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SkDocParser;
  }
})(typeof window !== 'undefined' ? window : global);
