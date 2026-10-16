// ==========================================
// FILE: cetak_spd.js
// MODUL CETAK MANDIRI (Clean Architecture)
// ==========================================

// --- Source: permohonan/st/js_cetak_spd.html ---
function printSuratPerjalananDinas(idST, nipPesertaTarget) {
      if (!state.stList) { showNotify("Gagal", "Data ST belum dimuat", "error"); return; }
      const stDataObj = state.stList.find(st => String(st.id) === String(idST));
      if (!stDataObj) { showNotify("Gagal", "Data ST tidak ditemukan", "error"); return; }

      // ZETTBOT FIX NUKLIR: Target ID yang super aman dari bentrokan file backup
      const template = document.getElementById('spd-nuklir-2026');
      if (!template) { showNotify("Gagal", "Template SPD belum dimuat atau ID salah", "error"); return; }

      showLoading("Menyiapkan dokumen SPD...");
      
      let dataEkstra = {};
      try { dataEkstra = JSON.parse(stDataObj.data_ekstra || '{}'); } catch(e) {}
      
      let pesertaList = [];
      try { pesertaList = JSON.parse(stDataObj.peserta || '[]'); } catch(e) {}

      const pesertaSpd = pesertaList.filter(p => p.get_spd === true);
      if (pesertaSpd.length === 0) {
          hideLoading();
          showNotify("Tidak Ada SPD", "Tidak ada pegawai yang disetujui menerima fasilitas SPD pada tugas ini.", "warning");
          return;
      }

      let targetList = [];
      if (nipPesertaTarget) {
          const p = pesertaSpd.find(x => String(x.nip) === String(nipPesertaTarget));
          if (p) targetList.push(p);
          else {
              hideLoading(); showNotify("Gagal", "Pegawai tersebut tidak memiliki fasilitas SPD", "error"); return;
          }
      } else {
          targetList = pesertaSpd;
      }

      let finalHtml = "";
      const tglBerangkat = stDataObj.tgl_mulai;
      const tglKembali = stDataObj.tgl_selesai;
      const diffTime = Math.abs(new Date(tglKembali) - new Date(tglBerangkat));
      const lamaHari = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      // ZETTBOT FIX: Konversi angka hari ke huruf (1 -> satu, 2 -> dua)
      const hurufAngka = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
      const getTerbilang = (n) => {
          if (n < 12) return hurufAngka[n];
          if (n < 20) return hurufAngka[n - 10] + " belas";
          if (n < 100) return hurufAngka[Math.floor(n / 10)] + " puluh " + (n % 10 !== 0 ? " " + hurufAngka[n % 10] : "");
          return n;
      };

      // ZETTBOT FIX: Mengambil data pimpinan penandatangan untuk Lembar Visum (Halaman 2)
      const ttdST = state.usersList.find(u => String(u.nip) === String(stDataObj.pejabat_ttd)) || {};

      targetList.forEach((pesertaTarget) => {
          let htmlString = template.innerHTML;

          const replacements = {
              "{{tanggal_cetak}}": formatTglPlh(stDataObj.waktu.split(' ')[0]),
              "{{nomor_spd_pakem}}": dataEkstra.nomor_spd || "- (Belum diinput)",
              "{{ppk_nama}}": dataEkstra.ppk_nama || "-",
              "{{ppk_nip}}": dataEkstra.ppk_nip || "-",
              "{{peserta_nama}}": pesertaTarget.nama,
              "{{peserta_nip}}": pesertaTarget.nip,
              "{{peserta_pangkat}}": pesertaTarget.pangkat || "-",
              "{{peserta_jabatan}}": typeof formatJabatanSingkat === 'function' ? formatJabatanSingkat(pesertaTarget.jabatan) : pesertaTarget.jabatan,
              "{{tingkat_spd}}": dataEkstra.tingkat_spd || "-",
              "{{maksud_tujuan}}": stDataObj.tujuan,
              "{{alat_angkut}}": dataEkstra.alat_angkut || "-",
              "{{tempat_tujuan_spd}}": dataEkstra.tempat_tujuan_spd || "-",
              "{{lama_hari}}": lamaHari,
              "{{lama_hari_teks}}": getTerbilang(lamaHari),
              "{{tgl_berangkat}}": formatTglPlh(tglBerangkat),
              "{{tgl_kembali}}": formatTglPlh(tglKembali),
              "{{instansi}}": dataEkstra.instansi || "-",
              "{{mata_anggaran}}": dataEkstra.mata_anggaran || "-",
              "{{keterangan_lain}}": "<div style='min-height: 55px;'>-</div>",
              
              // ZETTBOT FIX: Menyuntikkan nama ttd (Full dengan Gelar) ke Halaman 2
              "{{jabatan_ttd_st}}": ttdST.jabatan || "-",
              "{{nama_ttd_st}}": ttdST.nama || "-",
              "{{nip_ttd_st}}": ttdST.nip || "-"
          };

          // ZETTBOT FIX: INI BARIS AJAIB YANG KEMAREN TERHAPUS!
          for (let key in replacements) {
              const regex = new RegExp(key, 'g');
              htmlString = htmlString.replace(regex, replacements[key]);
          }

          // Proses baris Pengikut
          const barisPengikut = pesertaList.filter(p => String(p.nip) !== String(pesertaTarget.nip));
          
          if (barisPengikut.length > 0) {
              let strPengikutHtml = `<table style="width: 100%; border-collapse: collapse; border: none; margin: 0; padding: 0;">`;
              strPengikutHtml += `
                <tr>
                   <td style="width: 20%; border-right: 1px solid black !important; border-bottom: 1px solid black !important; border-top: none !important; border-left: none !important; padding: 6px 8px;">Pengikut</td>
                   <td style="width: 32.1%; border-right: 1px solid black !important; border-bottom: 1px solid black !important; border-top: none !important; border-left: none !important; padding: 6px 8px; text-align: center;">Nama</td>
                   <td style="width: 24%; border-right: 1px solid black !important; border-bottom: 1px solid black !important; border-top: none !important; border-left: none !important; padding: 6px 8px; text-align: center;">Tanggal Lahir</td>
                   <td style="width: 23.9%; border-right: none !important; border-bottom: 1px solid black !important; border-top: none !important; border-left: none !important; padding: 6px 8px; text-align: center;">Keterangan</td>
                </tr>
              `;
              
              barisPengikut.forEach((pengikut, idx) => {
                  const isLast = idx === barisPengikut.length - 1;
                  const btmBorder = isLast ? "border-bottom: none !important;" : "border-bottom: 1px solid black !important;";
                  strPengikutHtml += `
                    <tr>
                       <td style="border-right: 1px solid black !important; border-top: none !important; border-left: none !important; padding: 6px 8px; text-align: center; ${btmBorder}">${idx + 1}.</td>
                       <td style="border-right: 1px solid black !important; border-top: none !important; border-left: none !important; padding: 6px 8px; ${btmBorder}">${pengikut.nama}</td>
                       <td style="border-right: 1px solid black !important; border-top: none !important; border-left: none !important; padding: 6px 8px; text-align: center; ${btmBorder}">-</td>
                       <td style="border-right: none !important; border-top: none !important; border-left: none !important; padding: 6px 8px; text-align: center; ${btmBorder}">-</td>
                    </tr>
                  `;
              });
              strPengikutHtml += `</table>`;
              
              const cariTabelKosong = /<table style="width: 100%; border-collapse: collapse; border: none; margin: 0; padding: 0;">\s*<tr>\s*<td.*?Pengikut[\s\S]*?<\/table>/;
              htmlString = htmlString.replace(cariTabelKosong, strPengikutHtml);
          }

          finalHtml += htmlString;
      });

      let printFrame = document.getElementById('printFrameSPD');
      if (!printFrame) {
          printFrame = document.createElement('iframe');
          printFrame.id = 'printFrameSPD';
          printFrame.style.position = 'fixed';
          printFrame.style.right = '0';
          printFrame.style.bottom = '0';
          printFrame.style.width = '0';
          printFrame.style.height = '0';
          printFrame.style.border = '0';
          document.body.appendChild(printFrame);
      }

      const printDoc = printFrame.contentWindow.document;
      printDoc.open();
      printDoc.write(`
        <html>
          <head>
            <title>Cetak SPD</title>
          </head>
          <body>${finalHtml}</body>
        </html>
      `);
      printDoc.close();

      setTimeout(() => {
          hideLoading();
          printFrame.contentWindow.focus();
          printFrame.contentWindow.print();
      }, 500);
  }
