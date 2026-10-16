// ==========================================
// FILE: cetak_jobdes.js
// MODUL CETAK MANDIRI (Clean Architecture)
// ==========================================

// --- Source: jobdes/js_cetak_jobdes.html ---
// ==========================================
  // FILE: js_cetak_jobdes.html
  // Deskripsi: Engine Cetak PDF via Hidden iFrame & Margin Hack
  // ZETTBOT OPTIMIZATION: Terintegrasi penuh dengan State Vue 3
  // ==========================================

  window.cetakJobdes = function() {
    // 1. Ambil instance Vue Jobdes yang sedang aktif
    var vm = window.vmJobdes;
    
    // 2. Validasi dari state Vue langsung
    if (!vm || !vm.selectedNip || !vm.selectedUser) {
        window.zettbosAlert("Silakan pilih pegawai terlebih dahulu pada pencarian untuk dicetak.", "error");
        return;
    }

    var btnPrint = document.querySelector('button[onclick="window.cetakJobdes()"]');
    var oriText = "";
    if (btnPrint) {
        oriText = btnPrint.innerHTML;
        btnPrint.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyiapkan Dokumen...';
        btnPrint.disabled = true;
    }

    var template = document.getElementById('templateCetakJobdes');
    if (!template) {
        window.zettbosAlert("Error: File Template cetak tidak ditemukan.", "error");
        if(btnPrint) { btnPrint.innerHTML = oriText; btnPrint.disabled = false; }
        return;
    }

    // Clone template agar data aslinya tidak rusak saat diinjeksi
    var tempNode = template.cloneNode(true);
    
    // =========================================================================
    // 3. INJEKSI DATA MENGGUNAKAN VARIABEL REAKTIF VUE (Cepat & Anti Error)
    // =========================================================================
    tempNode.querySelector('#prtJudulSk').innerText = vm.configSk.dasar;
    tempNode.querySelector('#prtNoSk').innerText = vm.configSk.nomor;
    tempNode.querySelector('#prtTglSk').innerText = vm.configSk.tanggal;
    
    tempNode.querySelector('#prtJabatan').innerText = vm.selectedUser.jabatan || "-";
    tempNode.querySelector('#prtAtasan').innerText = vm.atasanUser.nama || "-";
    tempNode.querySelector('#prtNama').innerText = vm.selectedUser.nama || "-";
    tempNode.querySelector('#prtNip').innerText = vm.selectedUser.nip || "-";
    tempNode.querySelector('#prtPangkat').innerText = vm.selectedUser.pangkat || "-";
    
    // Mengambil langsung HTML yang sudah diformat rapi dari Computed Vue
    tempNode.querySelector('#prtIkhtisar').innerHTML = vm.fmtIkhtisar;
    tempNode.querySelector('#prtPokok').innerHTML = vm.fmtPokok;
    tempNode.querySelector('#prtTambahan').innerHTML = vm.fmtTambahan;
    tempNode.querySelector('#prtTanggung').innerHTML = vm.fmtTanggung;
    tempNode.querySelector('#prtHasil').innerHTML = vm.fmtHasil;

    var styleContent = document.getElementById('styleCetakJobdes').outerHTML;
    var innerContent = tempNode.querySelector('#contentCetakJobdes').innerHTML;

    // THE MAGIC HACK: Table Wrapper untuk margin tiap halaman (Anti Tulisan Google)
    var magicWrapper = `
        <style>
            /* Reset paksa margin dari template lama, dan aplikasikan hack margin */
            @page { 
                size: A4 portrait; 
                margin: 0 1.5cm 0 2.5cm !important; 
            }
            body {
                margin: 0 !important;
                padding: 0 !important;
            }
            table.print-margin-table { width: 100%; border-collapse: collapse; border: none; }
            
            .spacer-top { height: 2cm; }    
            .spacer-bottom { height: 2cm; } 
            
            .cetak-kertas-override {
                padding: 0 !important; 
                min-height: auto !important; 
                width: 100% !important;
                box-sizing: border-box;
            }
        </style>
        ` + styleContent + `
        <table class="print-margin-table">
            <thead><tr><td><div class="spacer-top"></div></td></tr></thead>
            <tbody>
                <tr>
                    <td>
                        <div class="cetak-kertas cetak-kertas-override">
                            ` + innerContent + `
                        </div>
                    </td>
                </tr>
            </tbody>
            <tfoot><tr><td><div class="spacer-bottom"></div></td></tr></tfoot>
        </table>
    `;

    var printHTML = '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Uraian Tugas - ' + vm.selectedUser.nama + '</title></head><body>' + magicWrapper + '</body></html>';

    var iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '-10000px';
    iframe.style.bottom = '-10000px';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    document.body.appendChild(iframe);

    var idoc = iframe.contentWindow || iframe.contentDocument;
    if (idoc.document) idoc = idoc.document;
    
    idoc.open();
    idoc.write(printHTML);
    idoc.close();

    // Tunggu iframe merender CSS sepenuhnya sebelum mencetak
    iframe.onload = function() {
        setTimeout(function() {
            if(btnPrint) { btnPrint.innerHTML = oriText; btnPrint.disabled = false; }
            
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            
            // Hapus iframe otomatis dari background setelah dialog tertutup
            setTimeout(function() {
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
            }, 2000);
        }, 500); // Jeda kecil untuk merender font dan tabel
    };
  };
