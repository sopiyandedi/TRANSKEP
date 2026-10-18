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
     * Menyuntikkan kamus tanda tangan digital PKCS#7 ke dalam Uint8Array PDF
     * @param {Uint8Array} pdfBytes
     * @param {Object} certObj { cert, keys }
     * @param {Object} sigMetadata { reason, location, signerName }
     * @returns {Uint8Array}
     */
    signPdfBytes(pdfBytes, certObj, sigMetadata) {
      if (!global.forge) throw new Error('Pustaka forge.js belum dimuat.');
      const forge = global.forge;

      // Cari posisi /ByteRange dan /Contents di dalam byte array
      let pdfString = '';
      const CHUNK_SIZE = 8192;
      for (let i = 0; i < pdfBytes.length; i += CHUNK_SIZE) {
        pdfString += String.fromCharCode.apply(null, pdfBytes.subarray(i, Math.min(i + CHUNK_SIZE, pdfBytes.length)));
      }

      const byteRangeKeyword = '/ByteRange [';
      const byteRangePos = pdfString.indexOf(byteRangeKeyword);
      const byteRangeEnd = pdfString.indexOf(']', byteRangePos);

      const contentsKeyword = '/Contents <';
      const contentsPos = pdfString.indexOf(contentsKeyword);
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
     * Membangun file PDF Formulir Cuti A4 Utuh dan Menandatanganinya secara Digital
     * @param {Object} log Data Cuti
     * @param {Object} pns Data Pemohon
     * @param {Object} atasan Data Atasan
     * @param {Object} pejabat Data Pejabat
     * @param {Object} qrDataUrls { pemohon, atasan, pejabat }
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
      const grayLine = rgb(0.2, 0.2, 0.2);

      // Embed Barcodes PNG
      let qrPemohonImg = null;
      let qrAtasanImg = null;
      let qrPejabatImg = null;

      try {
        if (qrDataUrls.pemohon) qrPemohonImg = await pdfDoc.embedPng(qrDataUrls.pemohon);
        if (qrDataUrls.atasan) qrAtasanImg = await pdfDoc.embedPng(qrDataUrls.atasan);
        if (qrDataUrls.pejabat) qrPejabatImg = await pdfDoc.embedPng(qrDataUrls.pejabat);
      } catch (err) {
        console.warn('⚠️ Gagal embed barcode PNG:', err);
      }

      // -------------------------------------------------------------
      // 1. HEADER / KOP FORMULIR CUTI
      // -------------------------------------------------------------
      let currentY = height - 36;
      const marginX = 36;
      const contentWidth = width - (marginX * 2);

      // Anotasi kanan atas: Peraturan BKN
      page.drawText('ANAK LAMPIRAN 1.b', { x: width - 200, y: currentY, size: 7.5, font: fontRegular, color: black });
      currentY -= 9;
      page.drawText('PERATURAN BADAN KEPEGAWAIAN NEGARA REPUBLIK INDONESIA', { x: width - 275, y: currentY, size: 7, font: fontRegular, color: black });
      currentY -= 9;
      page.drawText('NOMOR 24 TAHUN 2017 TENTANG TATA CARA PEMBERIAN CUTI PEGAWAI NEGERI SIPIL', { x: width - 330, y: currentY, size: 6.5, font: fontRegular, color: black });

      currentY -= 18;
      // Tanggal & Tujuan Surat
      const tglPengajuan = log.tgl_pengajuan || new Date().toLocaleDateString('id-ID');
      page.drawText(`Indramayu, ${tglPengajuan}`, { x: width - 160, y: currentY, size: 8.5, font: fontRegular, color: black });
      currentY -= 11;
      page.drawText('Kepada Yth.', { x: width - 160, y: currentY, size: 8.5, font: fontRegular, color: black });
      currentY -= 11;
      page.drawText('Ketua Pengadilan Agama Indramayu', { x: width - 160, y: currentY, size: 8.5, font: fontBold, color: black });
      currentY -= 11;
      page.drawText('di Indramayu', { x: width - 160, y: currentY, size: 8.5, font: fontRegular, color: black });

      currentY -= 16;
      // Judul Tengah
      const title = 'FORMULIR PERMOHONAN CUTI';
      const titleWidth = fontBold.widthOfTextAtSize(title, 11);
      page.drawText(title, { x: (width - titleWidth) / 2, y: currentY, size: 11, font: fontBold, color: black });
      currentY -= 11;
      const noCuti = `Nomor : ${log.nomor_surat || '-'}`;
      const noWidth = fontRegular.widthOfTextAtSize(noCuti, 8.5);
      page.drawText(noCuti, { x: (width - noWidth) / 2, y: currentY, size: 8.5, font: fontRegular, color: black });

      currentY -= 14;

      // Helper Menggambar Kotak Tabel
      function drawTableRow(x, y, w, h, cols) {
        page.drawRectangle({
          x: x, y: y, width: w, height: h,
          borderColor: grayLine, borderWidth: 0.6
        });
        let curX = x;
        for (let i = 0; i < cols.length; i++) {
          const col = cols[i];
          if (i > 0) {
            page.drawLine({
              start: { x: curX, y: y },
              end: { x: curX, y: y + h },
              color: grayLine, thickness: 0.6
            });
          }
          if (col.text) {
            page.drawText(col.text, {
              x: curX + (col.padX || 4),
              y: y + (col.padY || (h / 2 - 3)),
              size: col.size || 8,
              font: col.bold ? fontBold : fontRegular,
              color: black
            });
          }
          curX += col.w;
        }
      }

      // -------------------------------------------------------------
      // 2. TABEL I: DATA PEGAWAI
      // -------------------------------------------------------------
      drawTableRow(marginX, currentY - 14, contentWidth, 14, [
        { text: 'I. DATA PEGAWAI', w: contentWidth, bold: true, size: 8.5 }
      ]);
      currentY -= 14;

      const rowH = 13;
      drawTableRow(marginX, currentY - rowH, contentWidth, rowH, [
        { text: 'Nama', w: 80, bold: true },
        { text: pns.nama || '-', w: 200 },
        { text: 'NIP', w: 70, bold: true },
        { text: pns.nip || '-', w: contentWidth - 350 }
      ]);
      currentY -= rowH;

      drawTableRow(marginX, currentY - rowH, contentWidth, rowH, [
        { text: 'Jabatan', w: 80, bold: true },
        { text: pns.jabatan || '-', w: 200 },
        { text: 'Masa Kerja', w: 70, bold: true },
        { text: pns.masa_kerja || '-', w: contentWidth - 350 }
      ]);
      currentY -= rowH;

      drawTableRow(marginX, currentY - rowH, contentWidth, rowH, [
        { text: 'Unit Kerja', w: 80, bold: true },
        { text: 'Pengadilan Agama Indramayu', w: contentWidth - 80 }
      ]);
      currentY -= rowH + 4;

      // -------------------------------------------------------------
      // 3. TABEL II: JENIS CUTI YANG DIAMBIL
      // -------------------------------------------------------------
      drawTableRow(marginX, currentY - 14, contentWidth, 14, [
        { text: 'II. JENIS CUTI YANG DIAMBIL', w: contentWidth, bold: true, size: 8.5 }
      ]);
      currentY -= 14;

      const jCuti = (log.jenis_cuti || log.jenis || '').toUpperCase();
      const colW2 = contentWidth / 2;

      drawTableRow(marginX, currentY - rowH, contentWidth, rowH, [
        { text: '1. Cuti Tahunan', w: colW2 - 35 },
        { text: jCuti.includes('TAHUNAN') ? '[ V ]' : '[   ]', w: 35, bold: true },
        { text: '2. Cuti Besar', w: colW2 - 35 },
        { text: jCuti.includes('BESAR') ? '[ V ]' : '[   ]', w: 35, bold: true }
      ]);
      currentY -= rowH;

      drawTableRow(marginX, currentY - rowH, contentWidth, rowH, [
        { text: '3. Cuti Sakit', w: colW2 - 35 },
        { text: jCuti.includes('SAKIT') ? '[ V ]' : '[   ]', w: 35, bold: true },
        { text: '4. Cuti Melahirkan', w: colW2 - 35 },
        { text: jCuti.includes('MELAHIRKAN') ? '[ V ]' : '[   ]', w: 35, bold: true }
      ]);
      currentY -= rowH;

      drawTableRow(marginX, currentY - rowH, contentWidth, rowH, [
        { text: '5. Cuti Karena Alasan Penting', w: colW2 - 35 },
        { text: jCuti.includes('ALASAN PENTING') || jCuti.includes('CAP') ? '[ V ]' : '[   ]', w: 35, bold: true },
        { text: '6. Cuti di Luar Tanggungan Negara', w: colW2 - 35 },
        { text: jCuti.includes('TANGGUNGAN') ? '[ V ]' : '[   ]', w: 35, bold: true }
      ]);
      currentY -= rowH + 4;

      // -------------------------------------------------------------
      // 4. TABEL III: ALASAN CUTI & TABEL IV: LAMANYA CUTI
      // -------------------------------------------------------------
      drawTableRow(marginX, currentY - 14, contentWidth, 14, [
        { text: 'III. ALASAN CUTI', w: contentWidth, bold: true, size: 8.5 }
      ]);
      currentY -= 14;

      drawTableRow(marginX, currentY - 18, contentWidth, 18, [
        { text: log.alasan || '-', w: contentWidth }
      ]);
      currentY -= 22;

      drawTableRow(marginX, currentY - 14, contentWidth, 14, [
        { text: 'IV. LAMANYA CUTI', w: contentWidth, bold: true, size: 8.5 }
      ]);
      currentY -= 14;

      drawTableRow(marginX, currentY - rowH, contentWidth, rowH, [
        { text: 'Selama', w: 60, bold: true },
        { text: `${log.durasi || '-'} Hari Kerja`, w: 120 },
        { text: 'Mulai Tanggal', w: 80, bold: true },
        { text: `${log.tgl_mulai || '-'} s.d ${log.tgl_selesai || '-'}`, w: contentWidth - 260 }
      ]);
      currentY -= rowH + 4;

      // -------------------------------------------------------------
      // 5. TABEL V: CATATAN CUTI & TABEL VI: ALAMAT + TTD PEMOHON
      // -------------------------------------------------------------
      const halfW = (contentWidth - 6) / 2;

      // Judul V dan VI bersebelahan
      drawTableRow(marginX, currentY - 14, halfW, 14, [
        { text: 'V. CATATAN CUTI', w: halfW, bold: true, size: 8.5 }
      ]);
      drawTableRow(marginX + halfW + 6, currentY - 14, halfW, 14, [
        { text: 'VI. ALAMAT SELAMA CUTI', w: halfW, bold: true, size: 8.5 }
      ]);
      currentY -= 14;

      // Baris detail Catatan Cuti & Alamat
      const blockH = 75;
      // Kotak kiri (Catatan Cuti)
      page.drawRectangle({
        x: marginX, y: currentY - blockH, width: halfW, height: blockH,
        borderColor: grayLine, borderWidth: 0.6
      });
      // Header Sub-Tabel Cuti
      page.drawLine({ start: { x: marginX, y: currentY - 14 }, end: { x: marginX + halfW, y: currentY - 14 }, color: grayLine, thickness: 0.6 });
      page.drawText('1. CUTI TAHUNAN', { x: marginX + 4, y: currentY - 10, size: 7.5, font: fontBold, color: black });
      page.drawText('Sisa N-2', { x: marginX + 110, y: currentY - 10, size: 7, font: fontRegular, color: black });
      page.drawText('Sisa N-1', { x: marginX + 155, y: currentY - 10, size: 7, font: fontRegular, color: black });
      page.drawText('Sisa N', { x: marginX + 200, y: currentY - 10, size: 7, font: fontRegular, color: black });

      // Nilai sisa cuti
      page.drawLine({ start: { x: marginX, y: currentY - 26 }, end: { x: marginX + halfW, y: currentY - 26 }, color: grayLine, thickness: 0.6 });
      page.drawText(String(pns.sisa_n2 || '0'), { x: marginX + 120, y: currentY - 22, size: 8, font: fontBold, color: black });
      page.drawText(String(pns.sisa_n1 || '0'), { x: marginX + 165, y: currentY - 22, size: 8, font: fontBold, color: black });
      page.drawText(String(pns.sisa_n || '0'), { x: marginX + 210, y: currentY - 22, size: 8, font: fontBold, color: black });

      // Jenis cuti lainnya di kotak kiri
      page.drawText('2. Cuti Besar       : -', { x: marginX + 4, y: currentY - 38, size: 7.5, font: fontRegular, color: black });
      page.drawText('3. Cuti Sakit         : -', { x: marginX + 4, y: currentY - 49, size: 7.5, font: fontRegular, color: black });
      page.drawText('4. Cuti Melahirkan : -', { x: marginX + 4, y: currentY - 60, size: 7.5, font: fontRegular, color: black });
      page.drawText('5. Alasan Penting : -', { x: marginX + 4, y: currentY - 71, size: 7.5, font: fontRegular, color: black });

      // Kotak kanan (Alamat, Telp, dan TTD Pemohon)
      page.drawRectangle({
        x: marginX + halfW + 6, y: currentY - blockH, width: halfW, height: blockH,
        borderColor: grayLine, borderWidth: 0.6
      });
      const rightX = marginX + halfW + 10;
      page.drawText(`Alamat: ${log.alamat || '-'}`, { x: rightX, y: currentY - 11, size: 7.5, font: fontRegular, color: black });
      page.drawText(`Telp/HP: ${pns.no_hp || log.no_hp || '-'}`, { x: rightX, y: currentY - 22, size: 7.5, font: fontRegular, color: black });

      // Area TTD Pemohon di kanan
      const sigCenterX = marginX + halfW + 6 + (halfW / 2);
      page.drawText('Hormat Saya,', { x: sigCenterX - 25, y: currentY - 33, size: 8, font: fontRegular, color: black });

      // Gambar Barcode Pemohon
      if (qrPemohonImg) {
        page.drawImage(qrPemohonImg, {
          x: sigCenterX - 18,
          y: currentY - 66,
          width: 36,
          height: 36
        });
      }

      // Nama Terang & NIP Pemohon
      const pnsNamaW = fontBold.widthOfTextAtSize(pns.nama || '-', 8);
      page.drawText(pns.nama || '-', { x: sigCenterX - (pnsNamaW / 2), y: currentY - 73, size: 8, font: fontBold, color: black });
      page.drawLine({
        start: { x: sigCenterX - (pnsNamaW / 2), y: currentY - 74 },
        end: { x: sigCenterX + (pnsNamaW / 2), y: currentY - 74 },
        color: black, thickness: 0.5
      });
      const pnsNipW = fontRegular.widthOfTextAtSize(`NIP. ${pns.nip || '-'}`, 7.5);
      page.drawText(`NIP. ${pns.nip || '-'}`, { x: sigCenterX - (pnsNipW / 2), y: currentY - 82, size: 7.5, font: fontRegular, color: black });

      currentY -= blockH + 6;

      // -------------------------------------------------------------
      // 6. TABEL VII: PERTIMBANGAN ATASAN LANGSUNG
      // -------------------------------------------------------------
      drawTableRow(marginX, currentY - 14, contentWidth, 14, [
        { text: 'VII. PERTIMBANGAN ATASAN LANGSUNG', w: contentWidth, bold: true, size: 8.5 }
      ]);
      currentY -= 14;

      const col4W = contentWidth / 4;
      const statusAtasan = (log.status_atasan || log.status || '').toUpperCase();
      const isSetujuAtasan = statusAtasan.includes('SETUJU') || statusAtasan.includes('ACC') || statusAtasan.includes('SELESAI');

      drawTableRow(marginX, currentY - 12, contentWidth, 12, [
        { text: 'DISETUJUI', w: col4W, bold: true, padX: col4W / 2 - 20 },
        { text: 'PERUBAHAN', w: col4W, bold: true, padX: col4W / 2 - 24 },
        { text: 'DITANGGUHKAN', w: col4W, bold: true, padX: col4W / 2 - 32 },
        { text: 'TIDAK DISETUJUI', w: col4W, bold: true, padX: col4W / 2 - 36 }
      ]);
      currentY -= 12;

      drawTableRow(marginX, currentY - 12, contentWidth, 12, [
        { text: isSetujuAtasan ? '[ V ]' : '[   ]', w: col4W, bold: true, padX: col4W / 2 - 8 },
        { text: '[   ]', w: col4W, bold: true, padX: col4W / 2 - 8 },
        { text: '[   ]', w: col4W, bold: true, padX: col4W / 2 - 8 },
        { text: '[   ]', w: col4W, bold: true, padX: col4W / 2 - 8 }
      ]);
      currentY -= 12;

      // Blok TTD Atasan
      const atasanBlockH = 50;
      page.drawRectangle({
        x: marginX, y: currentY - atasanBlockH, width: contentWidth, height: atasanBlockH,
        borderColor: grayLine, borderWidth: 0.6
      });
      const atasanCenterX = width - marginX - (contentWidth / 4);
      const atasanJabW = fontBold.widthOfTextAtSize(atasan.jabatan || 'Atasan Langsung', 8);
      page.drawText(atasan.jabatan || 'Atasan Langsung', { x: atasanCenterX - (atasanJabW / 2), y: currentY - 10, size: 8, font: fontBold, color: black });

      if (qrAtasanImg) {
        page.drawImage(qrAtasanImg, {
          x: atasanCenterX - 16,
          y: currentY - 40,
          width: 32,
          height: 32
        });
      }

      const atasanNamaW = fontBold.widthOfTextAtSize(atasan.nama || '-', 8);
      page.drawText(atasan.nama || '-', { x: atasanCenterX - (atasanNamaW / 2), y: currentY - 43, size: 8, font: fontBold, color: black });
      page.drawLine({
        start: { x: atasanCenterX - (atasanNamaW / 2), y: currentY - 44 },
        end: { x: atasanCenterX + (atasanNamaW / 2), y: currentY - 44 },
        color: black, thickness: 0.5
      });
      const atasanNipW = fontRegular.widthOfTextAtSize(`NIP. ${atasan.nip || '-'}`, 7.5);
      page.drawText(`NIP. ${atasan.nip || '-'}`, { x: atasanCenterX - (atasanNipW / 2), y: currentY - 50, size: 7.5, font: fontRegular, color: black });

      currentY -= atasanBlockH + 6;

      // -------------------------------------------------------------
      // 7. TABEL VIII: KEPUTUSAN PEJABAT BERWENANG (KETUA)
      // -------------------------------------------------------------
      drawTableRow(marginX, currentY - 14, contentWidth, 14, [
        { text: 'VIII. KEPUTUSAN PEJABAT YANG BERWENANG MEMBERIKAN CUTI', w: contentWidth, bold: true, size: 8.5 }
      ]);
      currentY -= 14;

      const statusPejabat = (log.status_pejabat || log.status || '').toUpperCase();
      const isSetujuPejabat = statusPejabat.includes('SETUJU') || statusPejabat.includes('ACC') || statusPejabat.includes('SELESAI');

      drawTableRow(marginX, currentY - 12, contentWidth, 12, [
        { text: 'DISETUJUI', w: col4W, bold: true, padX: col4W / 2 - 20 },
        { text: 'PERUBAHAN', w: col4W, bold: true, padX: col4W / 2 - 24 },
        { text: 'DITANGGUHKAN', w: col4W, bold: true, padX: col4W / 2 - 32 },
        { text: 'TIDAK DISETUJUI', w: col4W, bold: true, padX: col4W / 2 - 36 }
      ]);
      currentY -= 12;

      drawTableRow(marginX, currentY - 12, contentWidth, 12, [
        { text: isSetujuPejabat ? '[ V ]' : '[   ]', w: col4W, bold: true, padX: col4W / 2 - 8 },
        { text: '[   ]', w: col4W, bold: true, padX: col4W / 2 - 8 },
        { text: '[   ]', w: col4W, bold: true, padX: col4W / 2 - 8 },
        { text: '[   ]', w: col4W, bold: true, padX: col4W / 2 - 8 }
      ]);
      currentY -= 12;

      // Blok TTD Pejabat Berwenang (Ketua)
      const pejabatBlockH = 50;
      page.drawRectangle({
        x: marginX, y: currentY - pejabatBlockH, width: contentWidth, height: pejabatBlockH,
        borderColor: grayLine, borderWidth: 0.6
      });
      const pejabatCenterX = width - marginX - (contentWidth / 4);
      const pejabatJabW = fontBold.widthOfTextAtSize(pejabat.jabatan || 'Ketua', 8);
      page.drawText(pejabat.jabatan || 'Ketua', { x: pejabatCenterX - (pejabatJabW / 2), y: currentY - 10, size: 8, font: fontBold, color: black });

      if (qrPejabatImg) {
        page.drawImage(qrPejabatImg, {
          x: pejabatCenterX - 16,
          y: currentY - 40,
          width: 32,
          height: 32
        });
      }

      const pejabatNamaW = fontBold.widthOfTextAtSize(pejabat.nama || '-', 8);
      page.drawText(pejabat.nama || '-', { x: pejabatCenterX - (pejabatNamaW / 2), y: currentY - 43, size: 8, font: fontBold, color: black });
      page.drawLine({
        start: { x: pejabatCenterX - (pejabatNamaW / 2), y: currentY - 44 },
        end: { x: pejabatCenterX + (pejabatNamaW / 2), y: currentY - 44 },
        color: black, thickness: 0.5
      });
      const pejabatNipW = fontRegular.widthOfTextAtSize(`NIP. ${pejabat.nip || '-'}`, 7.5);
      page.drawText(`NIP. ${pejabat.nip || '-'}`, { x: pejabatCenterX - (pejabatNipW / 2), y: currentY - 50, size: 7.5, font: fontRegular, color: black });

      // -------------------------------------------------------------
      // 8. PEMBUATAN KAMUS TANDA TANGAN DIGITAL (/Type /Sig)
      // -------------------------------------------------------------
      const byteRangePlaceholder = [
        PDFNumber.of(0),
        PDFNumber.of(1000000000),
        PDFNumber.of(1000000000),
        PDFNumber.of(1000000000)
      ];
      const byteRangeArray = pdfDoc.context.obj(byteRangePlaceholder);
      const dummyContents = PDFHexString.of('0'.repeat(this.SIGNATURE_SLOT_SIZE));

      const signerName = (isSetujuPejabat && pejabat.nama) ? pejabat.nama : (pns.nama || 'Aparatur PA Indramayu');
      const sigReason = 'Pengesahan Formulir Cuti Pegawai Pengadilan Agama Indramayu';

      const sigDict = pdfDoc.context.obj({
        Type: 'Sig',
        Filter: 'Adobe.PPKLite',
        SubFilter: 'adbe.pkcs7.detached',
        ByteRange: byteRangeArray,
        Contents: dummyContents,
        Reason: PDFString.of(sigReason),
        M: PDFString.of(`D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}+07'00'`),
        Name: PDFString.of(signerName),
        Location: PDFString.of('Indramayu')
      });
      const sigDictRef = pdfDoc.context.register(sigDict);

      // Signature Widget
      const widgetDict = pdfDoc.context.obj({
        Type: 'Annot',
        Subtype: 'Widget',
        FT: 'Sig',
        Rect: [50, 50, 150, 100],
        V: sigDictRef,
        T: PDFString.of('Signature1'),
        F: 132,
        P: page.ref
      });
      const widgetRef = pdfDoc.context.register(widgetDict);

      page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([widgetRef]));

      const acroFormDict = pdfDoc.context.obj({
        Fields: [widgetRef],
        SigFlags: 3
      });
      pdfDoc.catalog.set(PDFName.of('AcroForm'), acroFormDict);

      // Simpan PDF mentah dengan placeholder
      const rawPdfBytes = await pdfDoc.save({ useObjectStreams: false });

      // Bangkitkan Sertifikat X.509 atas nama Penandatangan
      const signerUser = (isSetujuPejabat && pejabat.nama) ? pejabat : pns;
      const certObj = this.generateCertificate(signerUser);

      // Suntikkan tanda tangan kriptografis ke dalam biner
      const signedBytes = this.signPdfBytes(rawPdfBytes, certObj, {
        reason: sigReason,
        location: 'Indramayu',
        signerName: signerName
      });

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
        notify('Memproses TTE Digital', 'Sedang merakit dokumen PDF biner & menandatangani secara kriptografis...', 'info');

        const stateObj = global.state || (global.window && global.window.state) || {};
        const cutiLogs = stateObj.cutiLogs || [];
        const usersList = stateObj.usersList || [];

        const log = cutiLogs.find(l => String(l.id) === String(id));
        if (!log) throw new Error('Data transaksi cuti tidak ditemukan.');

        const pns = usersList.find(u => String(u.nip) === String(log.nip)) || { nama: log.nama || '-', nip: log.nip || '-', jabatan: log.jabatan || '-' };
        const atasan = usersList.find(u => String(u.nip) === String(log.atasan_nip)) || { nama: log.atasan_nama || '-', nip: log.atasan_nip || '-', jabatan: log.atasan_jabatan || 'Atasan Langsung' };
        const pejabat = usersList.find(u => String(u.nip) === String(log.pejabat_nip)) || { nama: log.pejabat_nama || 'H. Zulkifli, S.Ag., S.H., M.H.', nip: log.pejabat_nip || '197309081998031001', jabatan: 'Ketua' };

        // Generate 3 Barcodes via TranskepQrEngine
        const baseUrl = 'https://script.google.com/macros/s/AKfycbwiYRAvHthtPgSPGaiAdVCf7PxU4UVuXdzoe_gXTAhrz5nwyg3Le2kIZ_VUZ9UTYdxM8A/exec';
        const qrUrlPemohon = `${baseUrl}?verify=cuti&id=${encodeURIComponent(log.id)}&role=pemohon`;
        const qrUrlAtasan = `${baseUrl}?verify=cuti&id=${encodeURIComponent(log.id)}&role=atasan`;
        const qrUrlPejabat = `${baseUrl}?verify=cuti&id=${encodeURIComponent(log.id)}&role=pejabat`;

        let qrPemohonDataUrl = '';
        let qrAtasanDataUrl = '';
        let qrPejabatDataUrl = '';

        if (global.TranskepQrEngine) {
          qrPemohonDataUrl = await global.TranskepQrEngine.generateQrDataUrl(qrUrlPemohon, { size: 300, logoRatio: 0.28 });
          qrAtasanDataUrl = await global.TranskepQrEngine.generateQrDataUrl(qrUrlAtasan, { size: 300, logoRatio: 0.28 });
          qrPejabatDataUrl = await global.TranskepQrEngine.generateQrDataUrl(qrUrlPejabat, { size: 300, logoRatio: 0.28 });
        }

        const signedBytes = await this.buildSignedCutiPdf(log, pns, atasan, pejabat, {
          pemohon: qrPemohonDataUrl,
          atasan: qrAtasanDataUrl,
          pejabat: qrPejabatDataUrl
        });

        // Trigger browser file download
        const blob = new Blob([signedBytes], { type: 'application/pdf' });
        const cleanName = (pns.nama || 'Pegawai').replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `Formulir_Cuti_${cleanName}_${log.id}.pdf`;

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
