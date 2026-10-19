// =========================================================================
// FILE: pdf_signer.js
// DESKRIPSI: Mesin Pembuat PDF Biner & Penyuntik Tanda Tangan Digital X.509
// STANDAR: PAdES / PKCS#7 Detached (ISO 32000-1 / Adobe Acrobat Signatures)
// ENGINE: ZettBOT Digital Signature Engine v1.0.0 (by Zettbos)
// =========================================================================

(function(global) {
  'use strict';

  const TranskepPdfSigner = {
    SIGNATURE_SLOT_SIZE: 8192, // 8192 hex chars = 4096 bytes slot

    /**
     * Memeriksa kesiapan pustaka PDF-Lib dan Forge
     */
    isReady() {
      return (typeof global.PDFLib !== 'undefined') && (typeof global.forge !== 'undefined');
    },

    /**
     * Menghasilkan Sertifikat Digital Internal X.509 resmi Pengadilan Agama Indramayu
     * @param {Object} user { nama, nip, jabatan }
     * @returns {Object} { cert, keys, pemCert, pemKey }
     */
    generateCertificate(user) {
      if (!global.forge) throw new Error('Pustaka forge.js belum dimuat.');
      const forge = global.forge;

      const pki = forge.pki;
      // Gunakan RSA 2048-bit standar resmi keamanan digital
      const keys = pki.rsa.generateKeyPair(2048);
      const cert = pki.createCertificate();

      cert.publicKey = keys.publicKey;
      // Nomor seri unik berbasis waktu & random hex
      cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));

      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 3);

      const subjectName = user.nama || 'Aparatur PA Indramayu';
      const subjectNip = user.nip || '-';
      const subjectJabatan = user.jabatan || 'Aparatur Sipil Negara';

      const attrs = [
        { name: 'commonName', value: subjectName },
        { name: 'countryName', value: 'ID' },
        { name: 'stateOrProvinceName', value: 'Jawa Barat' },
        { name: 'localityName', value: 'Indramayu' },
        { name: 'organizationName', value: 'Pengadilan Agama Indramayu' },
        { name: 'organizationalUnitName', value: `${subjectJabatan} (NIP. ${subjectNip})` }
      ];

      cert.setSubject(attrs);
      // Self-signed Certificate Otoritas PA Indramayu
      cert.setIssuer(attrs);

      // Extensions
      cert.setExtensions([
        { name: 'basicConstraints', cA: false },
        {
          name: 'keyUsage',
          digitalSignature: true,
          nonRepudiation: true,
          keyEncipherment: true
        },
        {
          name: 'extKeyUsage',
          clientAuth: true,
          emailProtection: true
        }
      ]);

      // Tandatangani sertifikat dengan kunci privat menggunakan SHA-256
      cert.sign(keys.privateKey, forge.md.sha256.create());

      return {
        cert: cert,
        keys: keys,
        pemCert: pki.certificateToPem(cert),
        pemKey: pki.privateKeyToPem(keys.privateKey)
      };
    },

    /**
     * Konversi Uint8Array ke String Latin1 biner secara cepat & aman
     */
    bytesToString(bytes) {
      let str = '';
      const CHUNK_SIZE = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        str += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length)));
      }
      return str;
    },

    /**
     * Konversi String Latin1 ke Uint8Array secara presisi
     */
    stringToBytes(str) {
      const bytes = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i) & 0xFF;
      }
      return bytes;
    },

    /**
     * Menyuntikkan kamus tanda tangan digital PKCS#7 ke dalam Uint8Array PDF
     * @param {Uint8Array} pdfBytes
     * @param {Object} certObj { cert, keys }
     * @param {Object} sigMetadata { reason, location, signerName }
     * @param {number} [targetByteRangePos]
     * @param {number} [targetContentsPos]
     * @returns {Uint8Array}
     */
    signPdfBytes(pdfBytes, certObj, sigMetadata, targetByteRangePos, targetContentsPos) {
      if (!global.forge) throw new Error('Pustaka forge.js belum dimuat.');
      const forge = global.forge;

      const pdfString = this.bytesToString(pdfBytes);

      let byteRangePos = targetByteRangePos;
      if (byteRangePos === undefined || byteRangePos === null) {
        byteRangePos = pdfString.indexOf('/ByteRange [');
      }

      let byteRangeEnd = byteRangePos;
      while (pdfBytes[byteRangeEnd] !== 93 /* ']' */ && byteRangeEnd < pdfBytes.length) {
        byteRangeEnd++;
      }

      let contentsPos = targetContentsPos;
      if (contentsPos === undefined || contentsPos === null) {
        contentsPos = pdfString.indexOf('/Contents <');
      }

      const contentsKeyword = '/Contents <';
      const contentsStart = contentsPos + contentsKeyword.length;
      const contentsEnd = contentsStart + this.SIGNATURE_SLOT_SIZE;

      if (byteRangePos === -1 || contentsPos === -1) {
        throw new Error('Placeholder tanda tangan (/ByteRange atau /Contents) tidak ditemukan dalam PDF.');
      }

      const offset1 = contentsStart - 1; // posisi karakter '<'
      const offset2 = contentsEnd + 1; // byte tepat setelah '>'
      const offset3 = pdfBytes.length - offset2;

      // Susun string ByteRange aktual
      const actualByteRange = `[ 0 ${offset1} ${offset2} ${offset3} ]`;
      const origRangeLength = byteRangeEnd - byteRangePos + 1;
      const paddedByteRange = `/ByteRange ${actualByteRange}`.padEnd(origRangeLength, ' ');

      // Tuliskan paddedByteRange langsung ke Uint8Array (in-place)
      for (let i = 0; i < paddedByteRange.length; i++) {
        pdfBytes[byteRangePos + i] = paddedByteRange.charCodeAt(i);
      }

      // Ambil byte yang dicakup oleh ByteRange untuk di-hash
      const part1 = pdfBytes.subarray(0, offset1);
      const part2 = pdfBytes.subarray(offset2, offset2 + offset3);

      let signedBinary = '';
      const CHUNK_SIZE = 8192;
      for (let i = 0; i < part1.length; i += CHUNK_SIZE) {
        signedBinary += String.fromCharCode.apply(null, part1.subarray(i, Math.min(i + CHUNK_SIZE, part1.length)));
      }
      for (let i = 0; i < part2.length; i += CHUNK_SIZE) {
        signedBinary += String.fromCharCode.apply(null, part2.subarray(i, Math.min(i + CHUNK_SIZE, part2.length)));
      }

      // Buat struktur CMS/PKCS#7 Detached
      const p7 = forge.pkcs7.createSignedData();
      p7.content = forge.util.createBuffer(signedBinary);
      p7.addCertificate(certObj.cert);
      p7.addSigner({
        key: certObj.keys.privateKey,
        certificate: certObj.cert,
        digestAlgorithm: forge.pki.oids.sha256,
        authenticatedAttributes: [
          {
            type: forge.pki.oids.contentType,
            value: forge.pki.oids.data
          },
          {
            type: forge.pki.oids.messageDigest
          },
          {
            type: forge.pki.oids.signingTime,
            value: new Date()
          }
        ]
      });

      p7.sign({ detached: true });

      const rawDer = forge.asn1.toDer(p7.toAsn1()).getBytes();
      const hexSignature = forge.util.bytesToHex(rawDer);
      const paddedHex = hexSignature.padEnd(this.SIGNATURE_SLOT_SIZE, '0');

      // Tuliskan hex signature ke dalam placeholder /Contents
      for (let i = 0; i < paddedHex.length; i++) {
        pdfBytes[contentsStart + i] = paddedHex.charCodeAt(i);
      }

      return pdfBytes;
    },

    /**
     * Membubuhkan Tanda Tangan Digital Tambahan via Incremental Update (ISO 32000-1 PAdES)
     * Menjaga integritas revisi sebelumnya dan memunculkan semua penandatangan di Adobe Acrobat
     */
    appendSignatureRevision(currentBytes, widgetRefObjNum, rectCoords, signerUser, fieldName, reasonText, pageRefStr) {
      const certObj = this.generateCertificate(signerUser);
      const str = this.bytesToString(currentBytes);

      const startxrefPos = str.lastIndexOf('startxref');
      const prevXrefStr = str.slice(startxrefPos + 9, str.indexOf('%%EOF', startxrefPos)).trim();
      const prevXref = parseInt(prevXrefStr, 10);

      const sizeMatch = str.match(/\/Size\s+(\d+)/g);
      const lastSizeMatch = sizeMatch[sizeMatch.length - 1];
      const curSize = parseInt(lastSizeMatch.replace(/[^0-9]/g, ''), 10);

      const rootMatch = str.match(/\/Root\s+(\d+\s+\d+\s+R)/);
      const rootRef = rootMatch ? rootMatch[1] : '2 0 R';

      const infoMatch = str.match(/\/Info\s+(\d+\s+\d+\s+R)/);
      const infoRef = infoMatch ? infoMatch[1] : null;

      const newSigObjNum = curSize;
      const newSize = curSize + 1;
      const baseLen = currentBytes.length;

      let appendStr = '\n';

      // 1. Sig object
      const sigOffsetInAppend = appendStr.length;
      appendStr += `${newSigObjNum} 0 obj\n`;
      const dummyZeros = '0'.repeat(this.SIGNATURE_SLOT_SIZE);
      const dateFormatted = `D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}+07'00'`;
      appendStr += `<<
/Type /Sig
/Filter /Adobe.PPKLite
/SubFilter /adbe.pkcs7.detached
/ByteRange [ 0 1000000000 1000000000 1000000000 ]
/Contents <${dummyZeros}>
/Reason (${reasonText})
/M (${dateFormatted})
/Name (${signerUser.nama || 'Aparatur PA Indramayu'})
/Location (Indramayu)
>>
endobj\n`;

      // 2. Updated Widget object
      const widgetOffsetInAppend = appendStr.length;
      appendStr += `${widgetRefObjNum} 0 obj\n`;
      appendStr += `<<
/Type /Annot
/Subtype /Widget
/FT /Sig
/Rect [ ${rectCoords.join(' ')} ]
/V ${newSigObjNum} 0 R
/T (${fieldName})
/F 132
/P ${pageRefStr}
>>
endobj\n`;

      // 3. xref table
      const xrefOffsetInAppend = appendStr.length;
      const absXrefOffset = baseLen + xrefOffsetInAppend;

      const entries = [
        { num: widgetRefObjNum, offset: baseLen + widgetOffsetInAppend },
        { num: newSigObjNum, offset: baseLen + sigOffsetInAppend }
      ].sort((a, b) => a.num - b.num);

      let xrefStr = 'xref\n';
      for (const ent of entries) {
        xrefStr += `${ent.num} 1\n`;
        xrefStr += String(ent.offset).padStart(10, '0') + ' 00000 n \n';
      }
      appendStr += xrefStr;

      // 4. trailer
      appendStr += `trailer
<<
/Size ${newSize}
/Root ${rootRef}
${infoRef ? `/Info ${infoRef}\n` : ''}/Prev ${prevXref}
>>
startxref
${absXrefOffset}
%%EOF`;

      const appendBytes = this.stringToBytes(appendStr);
      let newPdfBytes = new Uint8Array(baseLen + appendBytes.length);
      newPdfBytes.set(currentBytes, 0);
      newPdfBytes.set(appendBytes, baseLen);

      const fullStr = this.bytesToString(newPdfBytes);
      const brPos = fullStr.lastIndexOf('/ByteRange [');
      const ctPos = fullStr.lastIndexOf('/Contents <');

      return this.signPdfBytes(newPdfBytes, certObj, {
        reason: reasonText,
        location: 'Indramayu',
        signerName: signerUser.nama
      }, brPos, ctPos);
    },

    /**
     * Memformat singkatan jabatan resmi PA Indramayu
     */
    formatJabatanSingkat(jab) {
      if (!jab) return '-';
      const j = String(jab).toUpperCase();
      if (j.includes('KEPALA SUB BAGIAN PERENCANAAN, TI DAN PELAPORAN')) return 'Kasubbag PTIP';
      if (j.includes('KEPALA SUB BAGIAN UMUM DAN KEUANGAN')) return 'Kasubbag Umum dan Keuangan';
      if (j.includes('KEPALA SUB BAGIAN KEPEGAWAIAN, ORTALA') || j.includes('KEPALA SUB BAGIAN KEPEGAWAIAN DAN ORTALA')) return 'Kasubbag Kepegawaian & ORTALA';
      return jab;
    },

    /**
     * Memformat tanggal cetak resmi Indonesia (contoh: 18 Oktober 2026)
     */
    formatDateIndoCetak(dateStr) {
      if (!dateStr) return '-';
      const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      let parts = String(dateStr).split('-');
      if (parts.length === 3) {
        return parseInt(parts[2], 10) + ' ' + months[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
      }
      parts = String(dateStr).split('/');
      if (parts.length === 3) {
        return parseInt(parts[0], 10) + ' ' + months[parseInt(parts[1], 10) - 1] + ' ' + parts[2];
      }
      return String(dateStr);
    },

    /**
     * Membangun file PDF Formulir Cuti A4 Utuh yang 1:1 Identik dengan Blanko Resmi
     * @param {Object} log Data Cuti
     * @param {Object} pns Data Pemohon
     * @param {Object} atasan Data Atasan
     * @param {Object} pejabat Data Pejabat
     * @param {Object} qrDataUrls { pemohon, atasan, pejabat, paraf }
     * @returns {Promise<Uint8Array>}
     */
    async buildSignedCutiPdf(log, pns, atasan, pejabat, qrDataUrls) {
      if (!this.isReady()) throw new Error('Pustaka pdf-lib atau forge belum siap.');
      const PDFLib = global.PDFLib;
      const { PDFDocument, StandardFonts, rgb, PDFName, PDFNumber, PDFHexString, PDFString } = PDFLib;

      const pdfDoc = await PDFDocument.create();
      // Kertas A4: 595.28 x 841.89 points
      const page = pdfDoc.addPage([595.28, 841.89]);
      const { width, height } = page.getSize();

      const fontRegular = await pdfDoc.embedFont(StandardFonts.TimesRoman);
      const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

      // Warna
      const black = rgb(0, 0, 0);
      const headerBg = rgb(0.95, 0.95, 0.95); // Shading abu-abu resmi #f2f2f2

      // Embed Barcodes PNG
      let qrPemohonImg = null;
      let qrAtasanImg = null;
      let qrPejabatImg = null;
      let qrParafImg = null;

      try {
        if (qrDataUrls && qrDataUrls.pemohon) qrPemohonImg = await pdfDoc.embedPng(qrDataUrls.pemohon);
        if (qrDataUrls && qrDataUrls.atasan) qrAtasanImg = await pdfDoc.embedPng(qrDataUrls.atasan);
        if (qrDataUrls && qrDataUrls.pejabat) qrPejabatImg = await pdfDoc.embedPng(qrDataUrls.pejabat);
        if (qrDataUrls && qrDataUrls.paraf) qrParafImg = await pdfDoc.embedPng(qrDataUrls.paraf);
      } catch (err) {
        console.warn('⚠️ Gagal embed barcode PNG:', err);
      }

      const marginX = 32;
      const contentWidth = width - (marginX * 2); // 531.28 points
      let currentY = height - 28;

      // Helper Menggambar Tanda Centang Vektor Presisi (Anti-Error WinAnsi Encoding)
      function drawCheckmark(cx, cy, size = 7.5) {
        const x1 = cx - size * 0.35;
        const y1 = cy + size * 0.05;
        const x2 = cx - size * 0.05;
        const y2 = cy - size * 0.35;
        const x3 = cx + size * 0.45;
        const y3 = cy + size * 0.45;

        page.drawLine({
          start: { x: x1, y: y1 },
          end: { x: x2, y: y2 },
          thickness: 1.3,
          color: black
        });
        page.drawLine({
          start: { x: x2, y: y2 },
          end: { x: x3, y: y3 },
          thickness: 1.3,
          color: black
        });
      }

      // Sanitasi Teks dari Karakter di Luar WinAnsi (Windows-1252)
      function safeWinAnsi(str) {
        if (str === null || str === undefined) return '';
        return String(str)
          .replace(/[\u2018\u2019]/g, "'")
          .replace(/[\u201C\u201D]/g, '"')
          .replace(/[\u2013\u2014]/g, '-')
          .replace(/\u2022/g, '-')
          .replace(/\u2026/g, '...')
          .replace(/[^\x00-\xFF]/g, '');
      }

      // Helper Menggambar Kotak Tabel Presisi
      function drawTableRow(x, y, w, h, cols, bg = null) {
        if (bg) {
          page.drawRectangle({
            x: x, y: y, width: w, height: h,
            color: bg,
            borderColor: black, borderWidth: 0.5
          });
        } else {
          page.drawRectangle({
            x: x, y: y, width: w, height: h,
            borderColor: black, borderWidth: 0.5
          });
        }
        let curX = x;
        for (let i = 0; i < cols.length; i++) {
          const col = cols[i];
          if (i > 0) {
            page.drawLine({
              start: { x: curX, y: y },
              end: { x: curX, y: y + h },
              color: black, thickness: 0.5
            });
          }
          if (col.check) {
            drawCheckmark(curX + col.w / 2, y + h / 2, col.checkSize || 7.5);
          } else if (col.text !== undefined && col.text !== null && col.text !== '') {
            const rawText = String(col.text);
            if (rawText.includes('✓') || rawText.includes('\u2713')) {
              drawCheckmark(curX + col.w / 2, y + h / 2, 7.5);
            } else {
              const fontSize = col.size || 8.5;
              const font = col.bold ? fontBold : fontRegular;
              const text = safeWinAnsi(rawText);
              let textX = curX + (col.padX !== undefined ? col.padX : 4);
              let textY = y + (col.padY !== undefined ? col.padY : (h / 2 - fontSize / 2.5));
              if (col.align === 'center') {
                const tw = font.widthOfTextAtSize(text, fontSize);
                textX = curX + (col.w - tw) / 2;
              } else if (col.align === 'right') {
                const tw = font.widthOfTextAtSize(text, fontSize);
                textX = curX + col.w - tw - 4;
              }
              page.drawText(text, {
                x: textX,
                y: textY,
                size: fontSize,
                font: font,
                color: black
              });
            }
          }
          curX += col.w;
        }
      }

      // =============================================================
      // HEADER KIRI & KANAN (TUJUAN & TANGGAL DINAS)
      // =============================================================
      page.drawText('Kepada Yth.', { x: marginX, y: currentY, size: 9, font: fontRegular, color: black });
      currentY -= 11;
      page.drawText('Ketua Pengadilan Agama Indramayu', { x: marginX, y: currentY, size: 9, font: fontBold, color: black });
      currentY -= 11;
      page.drawText('Di-', { x: marginX, y: currentY, size: 9, font: fontRegular, color: black });
      currentY -= 11;
      page.drawText('    Indramayu', { x: marginX, y: currentY, size: 9, font: fontRegular, color: black });

      // Header Kanan (Tanggal)
      const tglLengkapStr = this.formatDateIndoCetak(log.tgl_pengajuan || '');
      const tglText = `Indramayu, ${tglLengkapStr}`;
      const tglWidth = fontRegular.widthOfTextAtSize(tglText, 9);
      page.drawText(tglText, { x: width - marginX - tglWidth, y: height - 28, size: 9, font: fontRegular, color: black });

      currentY -= 14;

      // =============================================================
      // JUDUL RESMI BLANKO
      // =============================================================
      const titleText = 'PERMINTAAN DAN PEMBERIAN CUTI';
      const titleW = fontBold.widthOfTextAtSize(titleText, 11);
      const titleX = (width - titleW) / 2;
      page.drawText(titleText, { x: titleX, y: currentY, size: 11, font: fontBold, color: black });
      page.drawLine({ start: { x: titleX, y: currentY - 1.5 }, end: { x: titleX + titleW, y: currentY - 1.5 }, color: black, thickness: 0.8 });

      currentY -= 12;
      const partsTgl = String(log.tgl_pengajuan || '').split('/');
      const romawiArr = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
      const romawiCetak = (partsTgl[1] ? romawiArr[parseInt(partsTgl[1], 10) - 1] : 'X') || 'X';
      const tahunCetak = partsTgl[2] || new Date().getFullYear();
      const noSurat = `Nomor :          /KPA.W10-A/KP5.3/${romawiCetak}/${tahunCetak}`;
      const noW = fontRegular.widthOfTextAtSize(noSurat, 9);
      page.drawText(noSurat, { x: (width - noW) / 2, y: currentY, size: 9, font: fontRegular, color: black });

      currentY -= 12;

      // =============================================================
      // I. DATA PEGAWAI
      // =============================================================
      drawTableRow(marginX, currentY - 13, contentWidth, 13, [
        { text: 'I. DATA PEGAWAI', w: contentWidth, bold: true, size: 8.5 }
      ], headerBg);
      currentY -= 13;

      const c1 = 80;
      const c2 = 239;
      const c3 = 96;
      const c4 = contentWidth - c1 - c2 - c3;

      drawTableRow(marginX, currentY - 13, contentWidth, 13, [
        { text: 'Nama', w: c1 },
        { text: pns.nama || '-', w: c2, bold: true, size: 9 },
        { text: 'NIP', w: c3 },
        { text: pns.nip || '-', w: c4, bold: true, size: 9 }
      ]);
      currentY -= 13;

      drawTableRow(marginX, currentY - 13, contentWidth, 13, [
        { text: 'Jabatan', w: c1 },
        { text: this.formatJabatanSingkat(pns.jabatan) || '-', w: c2, size: 8.5 },
        { text: 'Masa Kerja', w: c3 },
        { text: '-', w: c4, align: 'center' }
      ]);
      currentY -= 13;

      drawTableRow(marginX, currentY - 13, contentWidth, 13, [
        { text: 'Unit Kerja', w: c1 },
        { text: 'Pengadilan Agama Indramayu', w: contentWidth - c1 }
      ]);
      currentY -= 13 + 3;

      // =============================================================
      // II. JENIS CUTI YANG DIAMBIL
      // =============================================================
      drawTableRow(marginX, currentY - 13, contentWidth, 13, [
        { text: 'II. JENIS CUTI YANG DIAMBIL', w: contentWidth, bold: true, size: 8.5 }
      ], headerBg);
      currentY -= 13;

      const jColW1 = 212;
      const jColW2 = 53.64;
      const jColW3 = 212;
      const jColW4 = contentWidth - jColW1 - jColW2 - jColW3;

      const chkTahunan = (log.jenis === 'Tahunan');
      const chkBesar = (log.jenis === 'Besar');
      const chkSakit = (log.jenis === 'Sakit');
      const chkMelahirkan = (log.jenis === 'Melahirkan');
      const chkPenting = (log.jenis === 'Alasan Penting' || log.jenis === 'Penting');
      const chkCltn = (log.jenis === 'CLTN');

      drawTableRow(marginX, currentY - 13, contentWidth, 13, [
        { text: '1. Cuti Tahunan', w: jColW1 },
        { check: chkTahunan, w: jColW2 },
        { text: '4. Cuti Melahirkan', w: jColW3 },
        { check: chkMelahirkan, w: jColW4 }
      ]);
      currentY -= 13;

      drawTableRow(marginX, currentY - 13, contentWidth, 13, [
        { text: '2. Cuti Besar', w: jColW1 },
        { check: chkBesar, w: jColW2 },
        { text: '5. Cuti Karena Alasan Penting', w: jColW3 },
        { check: chkPenting, w: jColW4 }
      ]);
      currentY -= 13;

      drawTableRow(marginX, currentY - 13, contentWidth, 13, [
        { text: '3. Cuti Sakit', w: jColW1 },
        { check: chkSakit, w: jColW2 },
        { text: '6. Cuti di Luar Tanggungan Negara', w: jColW3 },
        { check: chkCltn, w: jColW4 }
      ]);
      currentY -= 13 + 3;

      // =============================================================
      // III. ALASAN CUTI
      // =============================================================
      drawTableRow(marginX, currentY - 13, contentWidth, 13, [
        { text: 'III. ALASAN CUTI', w: contentWidth, bold: true, size: 8.5 }
      ], headerBg);
      currentY -= 13;

      let alasanText = log.alasan || '-';
      if (alasanText.includes('[USULAN PEMBATALAN]:')) {
        const p = alasanText.split('[USULAN PEMBATALAN]:');
        alasanText = p[0].trim() + ' [USULAN PEMBATALAN]: ' + p[1].trim();
      }
      drawTableRow(marginX, currentY - 16, contentWidth, 16, [
        { text: alasanText, w: contentWidth, size: 8.5, padY: 4 }
      ]);
      currentY -= 16 + 3;

      // =============================================================
      // IV. LAMANYA CUTI
      // =============================================================
      drawTableRow(marginX, currentY - 13, contentWidth, 13, [
        { text: 'IV. LAMANYA CUTI', w: contentWidth, bold: true, size: 8.5 }
      ], headerBg);
      currentY -= 13;

      const durasiStr = String(log.sisa_cuti || log.durasi || '1');
      const tglMulaiStr = this.formatDateIndoCetak(log.tgl_mulai);
      const tglSelesaiStr = this.formatDateIndoCetak(log.tgl_selesai);

      drawTableRow(marginX, currentY - 13, contentWidth, 13, [
        { text: 'Selama', w: 53 },
        { text: durasiStr, w: 42, align: 'center', bold: true },
        { text: 'Hari', w: 106, align: 'center' },
        { text: 'mulai tanggal', w: 90 },
        { text: tglMulaiStr, w: 106, align: 'center' },
        { text: 's.d', w: 27, align: 'center' },
        { text: tglSelesaiStr, w: contentWidth - 53 - 42 - 106 - 90 - 106 - 27, align: 'center' }
      ]);
      currentY -= 13 + 3;

      // =============================================================
      // V. CATATAN CUTI
      // =============================================================
      drawTableRow(marginX, currentY - 13, contentWidth, 13, [
        { text: 'V. CATATAN CUTI', w: contentWidth, bold: true, size: 8.5 }
      ], headerBg);
      currentY -= 13;

      let hist = { y24: 0, y25: 0, y26: 0 };
      if (log.jenis === 'Tahunan' && log.history) {
        try { hist = typeof log.history === 'string' ? JSON.parse(log.history) : log.history; } catch (e) {}
      }
      const sAw24 = Number(pns.s_tahunan_2024 || 0) + Number(hist.y24 || 0);
      const sAw25 = Number(pns.s_tahunan_2025 || 0) + Number(hist.y25 || 0);
      const sAw26 = Number(pns.s_tahunan_2026 || 0) + Number(hist.y26 || 0);

      const sAk24 = sAw24 - Number(hist.y24 || 0);
      const sAk25 = sAw25 - Number(hist.y25 || 0);
      const sAk26 = sAw26 - Number(hist.y26 || 0);

      const vW1 = 42;
      const vW2 = 68;
      const vW3 = 100;
      const vW4 = 95;
      const vW5 = 184;
      const vW6 = contentWidth - vW1 - vW2 - vW3 - vW4 - vW5;

      // Baris Sub-Header 1
      drawTableRow(marginX, currentY - 12, contentWidth, 12, [
        { text: '1. Cuti Tahunan', w: vW1 + vW2 + vW3, bold: true },
        { text: 'Paraf Petugas Cuti', w: vW4, align: 'center', bold: true },
        { text: '2. Cuti Besar', w: vW5 },
        { text: String(pns.s_besar || '0'), w: vW6, align: 'center', bold: true }
      ]);
      currentY -= 12;

      // Baris Sub-Header 2
      drawTableRow(marginX, currentY - 12, contentWidth, 12, [
        { text: 'Tahun', w: vW1, align: 'center', bold: true },
        { text: 'Sisa (Awal)', w: vW2, align: 'center', bold: true },
        { text: 'Keterangan (Sisa)', w: vW3, align: 'center', bold: true },
        { text: '', w: vW4 },
        { text: '3. Cuti Sakit', w: vW5 },
        { text: String(pns.s_sakit || '0'), w: vW6, align: 'center', bold: true }
      ]);
      currentY -= 12;

      // Baris Data 2024
      drawTableRow(marginX, currentY - 12, contentWidth, 12, [
        { text: '2024', w: vW1, align: 'center' },
        { text: String(sAw24), w: vW2, align: 'center' },
        { text: String(sAk24), w: vW3, align: 'center' },
        { text: '', w: vW4 },
        { text: '4. Cuti Melahirkan', w: vW5 },
        { text: String(pns.s_melahirkan || '0'), w: vW6, align: 'center', bold: true }
      ]);
      currentY -= 12;

      // Baris Data 2025
      drawTableRow(marginX, currentY - 12, contentWidth, 12, [
        { text: '2025', w: vW1, align: 'center' },
        { text: String(sAw25), w: vW2, align: 'center' },
        { text: String(sAk25), w: vW3, align: 'center' },
        { text: '', w: vW4 },
        { text: '5. Cuti Karena Alasan Penting', w: vW5 },
        { text: String(pns.s_penting || '0'), w: vW6, align: 'center', bold: true }
      ]);
      currentY -= 12;

      // Baris Data 2026
      drawTableRow(marginX, currentY - 12, contentWidth, 12, [
        { text: '2026', w: vW1, align: 'center' },
        { text: String(sAw26), w: vW2, align: 'center' },
        { text: String(sAk26), w: vW3, align: 'center' },
        { text: '', w: vW4 },
        { text: '6. Cuti di Luar Tanggungan Negara', w: vW5 },
        { text: String(pns.s_cltn || '0'), w: vW6, align: 'center', bold: true }
      ]);

      // Gambar QR Paraf Petugas Cuti (Menempati Col 4 vertikal)
      if (qrParafImg) {
        page.drawImage(qrParafImg, {
          x: marginX + vW1 + vW2 + vW3 + (vW4 - 32) / 2,
          y: currentY + 3,
          width: 32,
          height: 32
        });
      }
      currentY -= 12 + 3;

      // =============================================================
      // VI. ALAMAT SELAMA MENJALANKAN CUTI & SIGNATURE PEMOHON
      // =============================================================
      const viLeftW = 328;
      const viBlockH = 70;

      // Kotak Kiri: Alamat & Telp
      page.drawRectangle({
        x: marginX, y: currentY - viBlockH, width: viLeftW, height: viBlockH,
        borderColor: black, borderWidth: 0.5
      });
      // Header Sub-Tabel Alamat
      page.drawRectangle({
        x: marginX, y: currentY - 13, width: viLeftW, height: 13,
        color: headerBg, borderColor: black, borderWidth: 0.5
      });
      page.drawText('VI. ALAMAT SELAMA MENJALANKAN CUTI', { x: marginX + 4, y: currentY - 10, size: 8.5, font: fontBold, color: black });
      page.drawLine({ start: { x: marginX + 246, y: currentY - 13 }, end: { x: marginX + 246, y: currentY - viBlockH }, color: black, thickness: 0.5 });
      page.drawText('TELPON / HP', { x: marginX + 252, y: currentY - 10, size: 8.5, font: fontBold, color: black });

      // Isi Alamat & No HP
      const alamatVal = log.alamat || '-';
      page.drawText(alamatVal.length > 50 ? alamatVal.substring(0, 48) + '...' : alamatVal, { x: marginX + 4, y: currentY - 26, size: 8.5, font: fontRegular, color: black });
      page.drawText(pns.no_hp || log.no_hp || '-', { x: marginX + 250, y: currentY - 38, size: 8.5, font: fontBold, color: black });

      // Area Kanan: TTD Pemohon
      const pemohonX = marginX + viLeftW + 20;
      const pemohonY = currentY;
      page.drawText('Hormat Saya,', { x: pemohonX, y: currentY - 10, size: 9, font: fontRegular, color: black });

      if (qrPemohonImg) {
        page.drawImage(qrPemohonImg, {
          x: pemohonX,
          y: currentY - 48,
          width: 36,
          height: 36
        });
      }

      const pnsNama = pns.nama || '-';
      const pnsNamaW = fontBold.widthOfTextAtSize(pnsNama, 9);
      page.drawText(pnsNama, { x: pemohonX, y: currentY - 57, size: 9, font: fontBold, color: black });
      page.drawLine({ start: { x: pemohonX, y: currentY - 58 }, end: { x: pemohonX + pnsNamaW, y: currentY - 58 }, color: black, thickness: 0.5 });
      page.drawText(`NIP. ${pns.nip || '-'}`, { x: pemohonX, y: currentY - 66, size: 8.5, font: fontRegular, color: black });

      currentY -= viBlockH + 3;

      // =============================================================
      // VII. PERTIMBANGAN ATASAN LANGSUNG
      // =============================================================
      drawTableRow(marginX, currentY - 13, contentWidth, 13, [
        { text: 'VII. PERTIMBANGAN ATASAN LANGSUNG', w: contentWidth, bold: true, size: 8.5 }
      ], headerBg);
      currentY -= 13;

      const col4W = contentWidth / 4;
      const statusAtasan = (log.status_atasan || log.status || '').toUpperCase();
      const isSetujuAtasan = statusAtasan.includes('SETUJU') || statusAtasan.includes('ACC') || statusAtasan.includes('SELESAI');

      drawTableRow(marginX, currentY - 12, contentWidth, 12, [
        { text: 'DISETUJUI', w: col4W, align: 'center', bold: true },
        { text: 'PERUBAHAN', w: col4W, align: 'center', bold: true },
        { text: 'DITANGGUHKAN', w: col4W, align: 'center', bold: true },
        { text: 'TIDAK DISETUJUI', w: col4W, align: 'center', bold: true }
      ]);
      currentY -= 12;

      drawTableRow(marginX, currentY - 12, contentWidth, 12, [
        { check: isSetujuAtasan, w: col4W },
        { text: '', w: col4W, align: 'center' },
        { text: '', w: col4W, align: 'center' },
        { text: '', w: col4W, align: 'center' }
      ]);
      currentY -= 12;

      // Area TTD Atasan di Kanan
      const atasanBlockH = 54;
      const atasanX = marginX + contentWidth - 200;
      const atasanY = currentY;
      const atasanJabatan = safeWinAnsi(this.formatJabatanSingkat(atasan.jabatan) || 'Atasan Langsung');
      page.drawText(atasanJabatan, { x: atasanX, y: currentY - 10, size: 9, font: fontBold, color: black });

      if (isSetujuAtasan && qrAtasanImg) {
        page.drawImage(qrAtasanImg, {
          x: atasanX,
          y: currentY - 44,
          width: 32,
          height: 32
        });
      }

      const atasanNama = safeWinAnsi(atasan.nama || '-');
      const atasanNamaW = fontBold.widthOfTextAtSize(atasanNama, 9);
      page.drawText(atasanNama, { x: atasanX, y: currentY - 50, size: 9, font: fontBold, color: black });
      page.drawLine({ start: { x: atasanX, y: currentY - 51 }, end: { x: atasanX + atasanNamaW, y: currentY - 51 }, color: black, thickness: 0.5 });
      page.drawText(safeWinAnsi(`NIP. ${atasan.nip || '-'}`), { x: atasanX, y: currentY - 59, size: 8.5, font: fontRegular, color: black });

      currentY -= atasanBlockH + 3;

      // =============================================================
      // VIII. KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN CUTI
      // =============================================================
      drawTableRow(marginX, currentY - 13, contentWidth, 13, [
        { text: 'VIII. KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN CUTI', w: contentWidth, bold: true, size: 8.5 }
      ], headerBg);
      currentY -= 13;

      const statusPejabat = (log.status_pejabat || log.status || '').toUpperCase();
      const isSetujuPejabat = statusPejabat.includes('SETUJU') || statusPejabat.includes('ACC') || statusPejabat.includes('SELESAI');

      drawTableRow(marginX, currentY - 12, contentWidth, 12, [
        { text: 'DISETUJUI', w: col4W, align: 'center', bold: true },
        { text: 'PERUBAHAN', w: col4W, align: 'center', bold: true },
        { text: 'DITANGGUHKAN', w: col4W, align: 'center', bold: true },
        { text: 'TIDAK DISETUJUI', w: col4W, align: 'center', bold: true }
      ]);
      currentY -= 12;

      drawTableRow(marginX, currentY - 12, contentWidth, 12, [
        { check: isSetujuPejabat, w: col4W },
        { text: '', w: col4W, align: 'center' },
        { text: '', w: col4W, align: 'center' },
        { text: '', w: col4W, align: 'center' }
      ]);
      currentY -= 12;

      // Area TTD Pejabat di Kanan
      const pejabatBlockH = 54;
      const pejabatX = marginX + contentWidth - 200;
      const pejabatY = currentY;
      page.drawText(safeWinAnsi(pejabat.jabatan || 'Ketua'), { x: pejabatX, y: currentY - 10, size: 9, font: fontBold, color: black });

      if (isSetujuPejabat && qrPejabatImg) {
        page.drawImage(qrPejabatImg, {
          x: pejabatX,
          y: currentY - 44,
          width: 32,
          height: 32
        });
      }

      const pejabatNama = safeWinAnsi(pejabat.nama || '-');
      const pejabatNamaW = fontBold.widthOfTextAtSize(pejabatNama, 9);
      page.drawText(pejabatNama, { x: pejabatX, y: currentY - 50, size: 9, font: fontBold, color: black });
      page.drawLine({ start: { x: pejabatX, y: currentY - 51 }, end: { x: pejabatX + pejabatNamaW, y: currentY - 51 }, color: black, thickness: 0.5 });
      page.drawText(safeWinAnsi(`NIP. ${pejabat.nip || '-'}`), { x: pejabatX, y: currentY - 59, size: 8.5, font: fontRegular, color: black });

      // =============================================================
      // PEMBUATAN KAMUS TANDA TANGAN DIGITAL MULTI-TIER X.509 PAdES
      // =============================================================
      const byteRangePlaceholder = [
        PDFNumber.of(0),
        PDFNumber.of(1000000000),
        PDFNumber.of(1000000000),
        PDFNumber.of(1000000000)
      ];
      const byteRangeArray = pdfDoc.context.obj(byteRangePlaceholder);
      const dummyContents = PDFHexString.of('0'.repeat(this.SIGNATURE_SLOT_SIZE));

      // Koordinat Area Tanda Tangan Fisik Presisi
      const pemohonRect = [Math.round(pemohonX), Math.round(pemohonY - 68), Math.round(pemohonX + 130), Math.round(pemohonY)];
      const atasanRect = [Math.round(atasanX), Math.round(atasanY - 60), Math.round(atasanX + 160), Math.round(atasanY)];
      const pejabatRect = [Math.round(pejabatX), Math.round(pejabatY - 60), Math.round(pejabatX + 160), Math.round(pejabatY)];

      // 1. Signature Field 1: Pemohon (Pegawai yang mengajukan cuti)
      const sig1Reason = 'Pengajuan Permohonan Cuti Pegawai Pengadilan Agama Indramayu';
      const sig1Dict = pdfDoc.context.obj({
        Type: 'Sig',
        Filter: 'Adobe.PPKLite',
        SubFilter: 'adbe.pkcs7.detached',
        ByteRange: byteRangeArray,
        Contents: dummyContents,
        Reason: PDFString.of(sig1Reason),
        M: PDFString.of(`D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}+07'00'`),
        Name: PDFString.of(pns.nama || 'Pemohon Cuti'),
        Location: PDFString.of('Indramayu')
      });
      const sig1DictRef = pdfDoc.context.register(sig1Dict);

      const widget1Dict = pdfDoc.context.obj({
        Type: 'Annot',
        Subtype: 'Widget',
        FT: 'Sig',
        Rect: pemohonRect,
        V: sig1DictRef,
        T: PDFString.of('Signature1'),
        F: 132,
        P: page.ref
      });
      const widget1Ref = pdfDoc.context.register(widget1Dict);

      // 2. Signature Field 2: Atasan Langsung
      const widget2Dict = pdfDoc.context.obj({
        Type: 'Annot',
        Subtype: 'Widget',
        FT: 'Sig',
        Rect: atasanRect,
        T: PDFString.of('Signature2'),
        F: 132,
        P: page.ref
      });
      const widget2Ref = pdfDoc.context.register(widget2Dict);

      // 3. Signature Field 3: Pejabat Yang Berwenang
      const widget3Dict = pdfDoc.context.obj({
        Type: 'Annot',
        Subtype: 'Widget',
        FT: 'Sig',
        Rect: pejabatRect,
        T: PDFString.of('Signature3'),
        F: 132,
        P: page.ref
      });
      const widget3Ref = pdfDoc.context.register(widget3Dict);

      page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([widget1Ref, widget2Ref, widget3Ref]));

      const acroFormDict = pdfDoc.context.obj({
        Fields: [widget1Ref, widget2Ref, widget3Ref],
        SigFlags: 3
      });
      pdfDoc.catalog.set(PDFName.of('AcroForm'), acroFormDict);

      // Simpan PDF mentah (Rev 1 Base)
      let signedBytes = await pdfDoc.save({ useObjectStreams: false });

      // Bangkitkan Sertifikat & Tanda Tangani Rev 1: Pemohon (Pegawai)
      const certPemohon = this.generateCertificate(pns);
      signedBytes = this.signPdfBytes(signedBytes, certPemohon, {
        reason: sig1Reason,
        location: 'Indramayu',
        signerName: pns.nama || 'Pemohon Cuti'
      });

      const pageRefStr = (page.ref && page.ref.tag) ? page.ref.tag : `${page.ref.objectNumber} ${page.ref.generationNumber || 0} R`;

      // Rev 2: Atasan Langsung (Jika sudah disetujui atasan)
      if (isSetujuAtasan) {
        signedBytes = this.appendSignatureRevision(
          signedBytes,
          widget2Ref.objectNumber,
          atasanRect,
          atasan,
          'Signature2',
          'Persetujuan Cuti Pegawai oleh Atasan Langsung',
          pageRefStr
        );
      }

      // Rev 3: Pejabat Yang Berwenang (Jika sudah disetujui pejabat)
      if (isSetujuPejabat) {
        signedBytes = this.appendSignatureRevision(
          signedBytes,
          widget3Ref.objectNumber,
          pejabatRect,
          pejabat,
          'Signature3',
          'Pengesahan Formulir Cuti oleh Pejabat Yang Berwenang',
          pageRefStr
        );
      }

      return signedBytes;
    },

    /**
     * Membangun dan mengunduh file PDF ber-TTE Digital berdasarkan ID Cuti
     * @param {string|number} id
     */
    async downloadSignedCutiPdf(id) {
      try {
        if (!this.isReady()) {
          throw new Error('Pustaka kriptografi belum siap. Silakan muat ulang halaman.');
        }

        const notify = global.showNotify || console.log;
        notify('Memproses TTE Digital', 'Sedang merakit dokumen PDF biner & membubuhkan TTE 3 pihak...', 'info');

        const stateObj = global.state || (global.window && global.window.state) || {};
        const cutiLogs = stateObj.cutiLogs || [];
        const usersList = stateObj.usersList || [];

        const log = cutiLogs.find(l => String(l.id) === String(id));
        if (!log) throw new Error('Data transaksi cuti tidak ditemukan.');

        const pns = usersList.find(u => String(u.nip) === String(log.nip)) || { nama: log.nama || '-', nip: log.nip || '-', jabatan: log.jabatan || '-' };
        const atasan = usersList.find(u => String(u.nip) === String(log.atasan_nip)) || { nama: log.atasan_nama || '-', nip: log.atasan_nip || '-', jabatan: log.atasan_jabatan || 'Atasan Langsung' };
        const pejabat = usersList.find(u => String(u.nip) === String(log.pejabat_nip)) || { nama: log.pejabat_nama || 'H. Zulkifli, S.Ag., S.H., M.H.', nip: log.pejabat_nip || '197309081998031001', jabatan: 'Ketua' };

        const baseUrl = (global.window && global.window.location) ? (global.window.location.origin + global.window.location.pathname) : '';
        const verifyUrlPemohon = baseUrl + '?action=verifyCuti&id=' + encodeURIComponent(log.id) + '&type=pemohon&nip=' + encodeURIComponent(pns.nip);
        const verifyUrlAtasan = baseUrl + '?action=verifyCuti&id=' + encodeURIComponent(log.id) + '&type=atasan&nip=' + encodeURIComponent(atasan.nip);
        const verifyUrlPejabat = baseUrl + '?action=verifyCuti&id=' + encodeURIComponent(log.id) + '&type=pejabat&nip=' + encodeURIComponent(pejabat.nip);

        const statusAtasan = (log.status_atasan || log.status || '').toUpperCase();
        const isSetujuAtasan = statusAtasan.includes('SETUJU') || statusAtasan.includes('ACC') || statusAtasan.includes('SELESAI');

        const statusPejabat = (log.status_pejabat || log.status || '').toUpperCase();
        const isSetujuPejabat = statusPejabat.includes('SETUJU') || statusPejabat.includes('ACC') || statusPejabat.includes('SELESAI');

        let qrPemohonDataUrl = '';
        let qrAtasanDataUrl = '';
        let qrPejabatDataUrl = '';
        let qrParafDataUrl = '';

        if (global.generateQRCodeWithLogo) {
          qrPemohonDataUrl = await global.generateQRCodeWithLogo(verifyUrlPemohon, { size: 300, logoSrc: 'img/Logo_PA_Imy.png' });
          if (isSetujuAtasan) {
            qrAtasanDataUrl = await global.generateQRCodeWithLogo(verifyUrlAtasan, { size: 300, logoSrc: 'img/Logo_PA_Imy.png' });
          }
          if (isSetujuPejabat) {
            qrPejabatDataUrl = await global.generateQRCodeWithLogo(verifyUrlPejabat, { size: 300, logoSrc: 'img/Logo_PA_Imy.png' });
          }
        } else if (global.TranskepQrEngine) {
          qrPemohonDataUrl = await global.TranskepQrEngine.generateQrDataUrl(verifyUrlPemohon, { size: 300, logoRatio: 0.28 });
          if (isSetujuAtasan) {
            qrAtasanDataUrl = await global.TranskepQrEngine.generateQrDataUrl(verifyUrlAtasan, { size: 300, logoRatio: 0.28 });
          }
          if (isSetujuPejabat) {
            qrPejabatDataUrl = await global.TranskepQrEngine.generateQrDataUrl(verifyUrlPejabat, { size: 300, logoRatio: 0.28 });
          }
        }

        if (global.generateQRCodeDataURL) {
          qrParafDataUrl = global.generateQRCodeDataURL('Sudah diparaf oleh Petugas Cuti PA Indramayu', { size: 100 });
        } else if (global.TranskepQrEngine) {
          qrParafDataUrl = await global.TranskepQrEngine.generateQrDataUrl('Sudah diparaf oleh Petugas Cuti PA Indramayu', { size: 100 });
        }

        const signedBytes = await this.buildSignedCutiPdf(log, pns, atasan, pejabat, {
          pemohon: qrPemohonDataUrl,
          atasan: qrAtasanDataUrl,
          pejabat: qrPejabatDataUrl,
          paraf: qrParafDataUrl
        });

        // Trigger browser file download dengan nama terstandarisasi
        const blob = new Blob([signedBytes], { type: 'application/pdf' });
        const rawName = pns.nama || 'Pegawai';
        const cleanName = rawName
          .replace(/[^a-zA-Z0-9\s]/g, '')
          .trim()
          .replace(/\s+/g, '_');
        const fileName = `TRANSKEP_${cleanName}_sign_sign_sign.pdf`;

        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        notify('Sukses', `Dokumen PDF Ber-TTE Digital (${fileName}) berhasil diunduh!`, 'success');
      } catch (err) {
        console.error('❌ Gagal memproses TTE Digital:', err);
        const notify = global.showNotify || alert;
        notify('Gagal TTE Digital', err.message || 'Terjadi kesalahan sistem saat membuat PDF.', 'error');
      }
    }
  };

  global.TranskepPdfSigner = TranskepPdfSigner;
  global.downloadSignedCutiPdf = function(id) {
    TranskepPdfSigner.downloadSignedCutiPdf(id);
  };

})(typeof window !== 'undefined' ? window : this);
