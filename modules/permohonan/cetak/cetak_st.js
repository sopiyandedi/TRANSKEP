// ==========================================
// FILE: cetak_st.js
// MODUL CETAK MANDIRI (Clean Architecture)
// ==========================================

// --- Source: permohonan/st/js_cetak_st.html ---
function formatTanggalRentang(start, end) {
        if (start === end) return formatDateIndoCetak(start);
        return formatDateIndoCetak(start) + " s.d. " + formatDateIndoCetak(end);
    }

    // FIX TAHAP 2: Perombakan fungsi format teks menggunakan Table Borderless
    // agar tulisan baris kedua rata menggantung persis seperti Microsoft Word.
    function formatTeksRapi(text) {
        if (!text) return "-";
        var lines = text.split('\n');
        var html = '<table style="width: 100%; border: none; font-size: 11pt; border-spacing: 0; padding: 0; margin: 0;">';
        
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line) {
                // Deteksi jika awal baris memiliki angka/huruf dan titik/kurung tutup (misal: 1. atau a.)
                var match = line.match(/^([0-9a-zA-Z]+[\.\)])\s+(.*)/);
                if (match) {
                    html += '<tr>' +
                               '<td style="width: 22px; vertical-align: top; padding: 0 0 2px 0; border: none;">' + match[1] + '</td>' +
                               '<td style="vertical-align: top; text-align: justify; padding: 0 0 2px 0; border: none;">' + match[2] + '</td>' +
                            '</tr>';
                } else {
                    html += '<tr>' +
                               '<td colspan="2" style="vertical-align: top; text-align: justify; padding: 0 0 2px 0; border: none;">' + line + '</td>' +
                            '</tr>';
                }
            }
        }
        html += '</table>';
        return html;
    }

    function printSuratTugas(idST, stDataObj) {
        if (!stDataObj) { showNotify("Gagal", "Data ST tidak ditemukan", "error"); return; }
        
        var template = document.getElementById('template-cetak-st-container');
        if (!template) { showNotify("Gagal", "Template belum dimuat", "error"); return; }

        showLoading("Menyiapkan dokumen Surat Tugas...");

        var listPeserta = [];
        try {
            listPeserta = JSON.parse(stDataObj.peserta);
        } catch (e) {
            showNotify("Format Data Rusak", "Data peserta tidak bisa dibaca", "error");
            hideLoading(); return;
        }

        // =========================================================================
        // FIX: SAKLAR DUMMY UNTUK CANVAS / TESTING
        // Ubah TEST_MODE menjadi true untuk mensimulasikan hasil print tanpa data asli.
        // =========================================================================
        var TEST_MODE = false; // <-- GANTI KE TRUE JIKA INGIN TES
        var JUMLAH_DUMMY = 4;  // <-- GANTI ANGKA UNTUK TES LAYOUT SINGLE, DOUBLE, ATAU CHUNKING
        
        if (TEST_MODE) {
            listPeserta = [];
            for (var d = 1; d <= JUMLAH_DUMMY; d++) {
                listPeserta.push({
                    nama: "Pegawai Tester " + d + ", S.Kom.",
                    nip: "19800101200003100" + d,
                    pangkat: "Penata Muda (III/a)",
                    jabatan: "Fungsional Pranata Komputer"
                });
            }
        }
        
        var totalPeserta = listPeserta.length;
        
        // FIX: Penentuan Class Layout Dinamis untuk Spacing CSS A4
        var layoutClass = "st-layout-normal";
        if (totalPeserta === 1) layoutClass = "st-layout-single";
        else if (totalPeserta === 2) layoutClass = "st-layout-double";

        // FIX: Logika Chunking (Pemecahan array per 3 orang) & Page Break Dinamis
        // Merakit HTML murni dengan String Concatenation klasik anti-error
        var trHTML = "";
        var chunks = [];
        for (var i = 0; i < totalPeserta; i += 3) {
            chunks.push(listPeserta.slice(i, i + 3));
        }

        for (var c = 0; c < chunks.length; c++) {
            var isLastChunk = (c === chunks.length - 1);
            var pageBreakStyle = isLastChunk ? "" : "page-break-after: always; padding-bottom: 20px;";
            
            trHTML += '<div class="chunk-container" style="' + pageBreakStyle + '">';
            
            for (var j = 0; j < chunks[c].length; j++) {
                var p = chunks[c][j];
                var globalIndex = (c * 3) + j;
                
                // Jika total pegawai > 1, maka buat kolom nomor urut. Jika 1, sembunyikan.
                var colNumTag = (totalPeserta > 1) ? '<td class="p-col-num">' + (globalIndex + 1) + '.</td>' : '';
                var colEmptyTag = (totalPeserta > 1) ? '<td class="p-col-num"></td>' : '';
                var paddingNama = (totalPeserta === 1) ? ' style="width: 25%;"' : '';
                
                trHTML += '<div class="peserta-item">' +
                             '<table class="peserta-table">' +
                                '<tr>' +
                                   colNumTag +
                                   '<td class="p-col-label"' + paddingNama + '>N a m a</td>' +
                                   '<td class="p-col-colon">:</td>' +
                                   '<td class="p-col-value"><b>' + p.nama + '</b></td>' +
                                '</tr>' +
                                '<tr>' +
                                   colEmptyTag +
                                   '<td class="p-col-label">N I P</td>' +
                                   '<td class="p-col-colon">:</td>' +
                                   '<td class="p-col-value">' + p.nip + '</td>' +
                                '</tr>' +
                                '<tr>' +
                                   colEmptyTag +
                                   '<td class="p-col-label">Pangkat/Golongan</td>' +
                                   '<td class="p-col-colon">:</td>' +
                                   '<td class="p-col-value">' + (p.pangkat || '-') + '</td>' +
                                '</tr>' +
                                '<tr>' +
                                   colEmptyTag +
                                   '<td class="p-col-label">J a b a t a n</td>' +
                                   '<td class="p-col-colon">:</td>' +
                                   '<td class="p-col-value">' + (p.jabatan || '-') + '</td>' +
                                '</tr>' +
                             '</table>' +
                          '</div>';
            }
            
            trHTML += '</div>';
        }

        var pejabat = state.usersList.find(function(u) { return u.nip === stDataObj.pejabat_ttd; }) || {nama: '-', nip: '-', jabatan: '-'};
        var namaTtdBersih = formatNamaBersih(pejabat.nama);
        var jabatanKop = pejabat.jabatan ? (pejabat.jabatan.toUpperCase() + " PENGADILAN AGAMA INDRAMAYU") : "PENGADILAN AGAMA INDRAMAYU";

        var dMulai = new Date(stDataObj.tgl_mulai);
        var hariArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        var hariKegiatan = isNaN(dMulai) ? "-" : hariArr[dMulai.getDay()];

        var ekstra = {};
        try { ekstra = JSON.parse(stDataObj.data_ekstra || '{}'); } catch(e) {}
        
        var bebanAnggaranHtml = ekstra.paragraf_biaya ? '<p style="text-align: justify; margin-top: 5px; margin-bottom: 2px;">' + ekstra.paragraf_biaya + '</p>' : '';

        var htmlContent = template.innerHTML;
        
        // Ganti class layout dinamis
        htmlContent = htmlContent.replace(/\{\{layout_class\}\}/g, layoutClass);

        var replacements = {
            "{{nomor_surat}}": stDataObj.nomor,
            "{{jabatan_kop}}": jabatanKop,
            "{{menimbang}}": formatTeksRapi(stDataObj.menimbang),
            "{{dasar}}": formatTeksRapi(stDataObj.dasar),
            "{{baris_peserta_html}}": trHTML,
            "{{tujuan}}": stDataObj.tujuan.replace(/\n/g, "<br>"),
            "{{hari_kegiatan}}": hariKegiatan,
            "{{tanggal_kegiatan}}": formatTanggalRentang(stDataObj.tgl_mulai, stDataObj.tgl_selesai),
            "{{tempat}}": stDataObj.tempat,
            "{{jam}}": stDataObj.jam,
            "{{beban_anggaran_html}}": bebanAnggaranHtml,
            "{{tanggal_ttd}}": formatDateIndoCetak(stDataObj.waktu.split(' ')[0]),
            "{{jabatan_pejabat_ttd}}": pejabat.jabatan,
            "{{nama_pejabat_ttd}}": namaTtdBersih
        };

        for (var key in replacements) {
            htmlContent = htmlContent.split(key).join(replacements[key]);
        }

        var finalHTML = "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Surat Tugas</title></head><body>" + htmlContent + "</body></html>";

        var iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);

        var doc = iframe.contentWindow.document;
        doc.open();
        doc.write(finalHTML);
        doc.close();

        setTimeout(function() {
            hideLoading();
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(function() { if (document.body.contains(iframe)) document.body.removeChild(iframe); }, 3000);
        }, 1500);
    }
