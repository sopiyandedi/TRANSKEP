// ==========================================
// FILE: cetak_pck.js
// MODUL CETAK MANDIRI (Clean Architecture)
// ==========================================

function renderPrintTemplatePCK(data) {
    try {
        var container = document.getElementById("template-pck-container");
        if (!container) return;
        document.body.appendChild(container);
        
        var tglFull = new Date(); var blnArray = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
        var bulanStr = data.header.bulan.toUpperCase();
        
        var headerBulanCenter = document.getElementById("pck-print-bulan-header-center");
        if(headerBulanCenter) headerBulanCenter.innerText = bulanStr;

        var judulEl = document.getElementById("pck-print-bulan-judul");
        if(judulEl) judulEl.innerText = bulanStr;
        
        document.getElementById("pck-print-tanggal").innerText = "Indramayu, 2 " + blnArray[tglFull.getMonth()] + " " + tglFull.getFullYear();
        
        var penilaiNama = "-", penilaiNip = "-";
        if (state.usersList) {
            state.usersList.forEach(function(u) {
                if (u.nip === data.penilai_nip) { penilaiNama = u.nama; penilaiNip = u.nip; }
            });
        }
        document.getElementById("pck-print-pegawai-nama").innerText = state.user.nama;
        document.getElementById("pck-print-pegawai-nip").innerText = "NIP. " + state.user.nip;
        
        var elPangkat = document.getElementById("pck-print-pegawai-pangkat");
        if(elPangkat) elPangkat.innerText = state.user.pangkat || "-";
        
        document.getElementById("pck-print-pegawai-jabatan").innerText = state.user.jabatan;
        document.getElementById("pck-print-penilai-nama").innerText = penilaiNama;
        document.getElementById("pck-print-penilai-nip").innerText = "NIP. " + penilaiNip;

        var groups = {};
        data.items.forEach(function(item) {
            if(!groups[item.sasaran]) groups[item.sasaran] = [];
            groups[item.sasaran].push(item);
        });

        var containerTables = document.getElementById("pck-print-tables-container");
        var tbody2 = document.getElementById("pck-print-tbody-2");
        var html1 = ""; var html2 = "";
        
        var num = 1; var totalRecapCap = 0; var totalRecapHitung = 0; var countRecap = 0;
        
        var tableHeader = "<table class='table-data'><thead>" +
          "<tr><th rowspan='2' width='4%'>NO</th><th rowspan='2' width='26%'>KEGIATAN TUGAS JABATAN</th><th rowspan='2' width='4%'>AK</th><th colspan='2'>TARGET</th><th rowspan='2' width='4%'>AK</th><th colspan='2'>REALISASI</th><th rowspan='2' width='12%'>PENGHITUNGAN<br>(KUALITAS TARGET + KUALITAS REALISASI)</th><th rowspan='2' width='12%'>NILAI CAPAIAN KINERJA</th></tr>" +
          "<tr><th width='8%'>KUANT /<br>OUTPUT</th><th width='8%'>KUAL /<br>MUTU</th><th width='8%'>KUANT /<br>OUTPUT</th><th width='8%'>KUAL /<br>MUTU</th></tr>" +
          "<tr style='background-color: #f8f9fa;'><th class='font-bold'>(1)</th><th class='font-bold'>(2)</th><th class='font-bold'>(3)</th><th class='font-bold'>(4)</th><th class='font-bold'>(5)</th><th class='font-bold'>(6)</th><th class='font-bold'>(7)</th><th class='font-bold'>(8)</th><th class='font-bold'>(9)</th><th class='font-bold'>(10)</th></tr>" +
          "</thead><tbody>";

        for (var sasaran in groups) {
            var kgs = groups[sasaran];
            var hitungGrup = 0; var capaianGrup = 0;
            
            html1 += "<div style='font-weight: bold; font-size: 9.5pt; margin-bottom: 5px; margin-top: 15px; text-transform: uppercase;'>INDIKATOR KINERJA : " + sasaran + "</div>";
            html1 += tableHeader;
            
            kgs.forEach(function(kg, idx) {
                var hitung = parseFloat(kg.mutu) + (kg.real_mutu ? parseFloat(kg.real_mutu) : 0);
                var cap = (kg.capaian) ? parseFloat(kg.capaian) : 0;
                hitungGrup += hitung; capaianGrup += cap;
                
                html1 += "<tr>" +
                    "<td class='text-center'>" + (idx+1) + "</td>" +
                    "<td>" + kg.indikator + "</td>" +
                    "<td class='text-center'>0</td>" +
                    "<td class='text-center'>" + kg.kuantitas + "</td>" +
                    "<td class='text-center'>" + kg.mutu + "</td>" +
                    "<td class='text-center'>0</td>" +
                    "<td class='text-center'>" + (kg.real_kuantitas || 0) + "</td>" +
                    "<td class='text-center'>" + (kg.real_mutu || 0) + "</td>" +
                    "<td class='text-center font-bold'>" + hitung + "</td>" +
                    "<td class='text-center font-bold'>" + cap.toFixed(2) + "</td>" +
                "</tr>";
            });
            
            var avgCap = capaianGrup / kgs.length;
            var avgHitung = hitungGrup / kgs.length; 
            totalRecapCap += avgCap; totalRecapHitung += avgHitung; countRecap++;
            
            html1 += "<tr><td colspan='8' class='text-right font-bold' style='background:#f9fafb;'>NILAI CAPAIAN KINERJA</td><td class='text-center font-bold' style='background:#f9fafb;'>" + avgHitung.toFixed(2) + "</td><td class='text-center font-bold' style='background:#f9fafb;'>" + avgCap.toFixed(2) + "</td></tr>";
            html1 += "</tbody></table>";
            
            html2 += "<tr>" +
                "<td class='text-center'>" + num + "</td>" +
                "<td>" + sasaran + "</td>" +
                "<td class='text-center font-bold'>" + avgHitung.toFixed(2) + "</td>" +
                "<td class='text-center font-bold'>" + avgCap.toFixed(2) + "</td>" +
            "</tr>";
            num++;
        }
        
        var avgFinalCap = countRecap > 0 ? (totalRecapCap / countRecap).toFixed(2) : 0;
        var avgFinalHitung = countRecap > 0 ? (totalRecapHitung / countRecap).toFixed(2) : 0;
        var predikatStr = "(Kurang)";
        var valAvg = parseFloat(avgFinalCap);
        
        if (valAvg >= 91) predikatStr = "(Sangat Baik)";
        else if (valAvg >= 76) predikatStr = "(Baik)";
        else if (valAvg >= 61) predikatStr = "(Cukup)";
        else if (valAvg >= 51) predikatStr = "(Kurang)";
        else if (valAvg <= 50) predikatStr = "(Buruk)";

        html2 += "<tr><td colspan='2' class='text-right font-bold' style='background:#f9fafb;'>Hasil Capaian Kinerja Bulan " + bulanStr + "</td><td class='text-center font-bold' style='background:#f9fafb;'>" + avgFinalHitung + "</td><td class='text-center font-bold' style='background:#f9fafb; font-size:11pt;'>" + avgFinalCap + " " + predikatStr + "</td></tr>";
        
        if(containerTables) containerTables.innerHTML = html1;
        if(tbody2) tbody2.innerHTML = html2;

        document.body.classList.add("print-mode");
        setTimeout(function() { window.print(); document.body.classList.remove("print-mode"); }, 800);
    } catch(e) { console.error(e); }
}
