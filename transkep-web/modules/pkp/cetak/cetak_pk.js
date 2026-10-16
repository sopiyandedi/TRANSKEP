// ==========================================
// FILE: cetak_pk.js
// MODUL CETAK MANDIRI (Clean Architecture)
// ==========================================

function renderPrintTemplatePK(data) {
    try {
        var container = document.getElementById("template-pk-container");
        if (!container) return;
        document.body.appendChild(container);
        
        var pegawaiNama = state.user.nama;
        var pegawaiJabatan = state.user.jabatan;
        var penilaiNama = "-", penilaiNip = "-";
        var atasanPejabatNama = "-", atasanPejabatNip = "-";
        
        if (state.usersList) {
            state.usersList.forEach(function(u) {
                if (u.nip === data.header.penilai) { penilaiNama = u.nama; penilaiNip = u.nip; }
                if (u.nip === data.header.atasan_pejabat) { atasanPejabatNama = u.nama; atasanPejabatNip = u.nip; }
            });
        }

        var elJabatan = document.getElementById("pk-print-jabatan");
        if(elJabatan) elJabatan.innerText = pegawaiJabatan.toUpperCase();
        
        var tbody = document.getElementById("pk-print-tbody");
        var html = "";
        
        var groups = {};
        data.items.forEach(function(item) {
            if(!groups[item.sasaran]) groups[item.sasaran] = [];
            groups[item.sasaran].push(item);
        });

        var numSasaran = 1;
        for (var sasaran in groups) {
            var kgiatans = groups[sasaran];
            var rowCount = kgiatans.length;
            
            for (var idx = 0; idx < rowCount; idx++) {
                var kg = kgiatans[idx];
                var wktArr = kg.waktu ? kg.waktu.split(",") : [];
                
                html += "<tr>";
                if (idx === 0) {
                    html += "<td rowspan='" + rowCount + "' class='text-center'>" + numSasaran + "</td>";
                    html += "<td rowspan='" + rowCount + "'>" + sasaran + "</td>";
                }
                
                html += "<td class='text-center'>" + (idx + 1) + "</td>";
                html += "<td>" + kg.indikator + "</td>";
                html += "<td class='text-center'>" + kg.mutu + "</td>";
                html += "<td class='text-center'>" + kg.kuantitas + "</td>";
                html += "<td class='text-center'>" + kg.satuan + "</td>";
                
                for (var bln = 1; bln <= 12; bln++) {
                    var cek = wktArr.includes(String(bln)) ? "√" : "";
                    html += "<td class='text-center font-bold'>" + cek + "</td>";
                }
                
                var paguFmt = "-";
                if (kg.pagu && kg.pagu !== "0") {
                    paguFmt = parseInt(kg.pagu).toLocaleString('id-ID');
                }
                html += "<td>IDR <span style='float:right'>" + paguFmt + "</span></td>";
                html += "</tr>";
            }
            numSasaran++;
        }
        
        if(tbody) tbody.innerHTML = html;
        
        var elAtasanNama = document.getElementById("pk-print-atasan-nama");
        var elAtasanNip = document.getElementById("pk-print-atasan-nip");
        var elTgl = document.getElementById("pk-print-tanggal");
        var elPenilaiNama = document.getElementById("pk-print-penilai-nama");
        var elPenilaiNip = document.getElementById("pk-print-penilai-nip");
        
        if(elAtasanNama) elAtasanNama.innerText = atasanPejabatNama;
        if(elAtasanNip) elAtasanNip.innerText = "NIP. " + atasanPejabatNip;
        if(elTgl) elTgl.innerText = "Indramayu, 2 Januari " + data.header.tahun; 
        if(elPenilaiNama) elPenilaiNama.innerText = penilaiNama;
        if(elPenilaiNip) elPenilaiNip.innerText = "NIP. " + penilaiNip;

        document.body.classList.add("print-mode");
        setTimeout(function() { window.print(); document.body.classList.remove("print-mode"); }, 800);
    } catch (e) { console.error("Error di renderPrintTemplatePK:", e); }
}
