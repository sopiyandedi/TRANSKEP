// ==========================================
// FILE: cetak_wfh_rencana.js
// MODUL CETAK MANDIRI (Clean Architecture)
// ==========================================

// --- Source: permohonan/wfh/js_cetak_wfh_rencana.html ---
// FIX: Fungsi Otomatis Mendeteksi Hari dari Tanggal
    function formatDateFullIndo(dateStr) {
        if (!dateStr) return "-";
        const months = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
        
        let d, m, y;
        let parts = dateStr.split('-');
        
        // Jika format YYYY-MM-DD
        if (parts.length === 3) {
            y = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10);
            d = parseInt(parts[2], 10);
        } else {
            // Jika format DD/MM/YYYY
            parts = dateStr.split('/');
            if (parts.length === 3) {
                d = parseInt(parts[0], 10);
                m = parseInt(parts[1], 10);
                y = parseInt(parts[2], 10);
            } else {
                return dateStr;
            }
        }
        
        // Membuat objek waktu untuk mendeteksi nama hari
        let dateObj = new Date(y, m - 1, d);
        let dayName = days[dateObj.getDay()];
        
        // Hasil akhir: "Jumat, 4 September 2026"
        return dayName + ", " + d + " " + months[m - 1] + " " + y;
    }

    function cetakRencanaWFH(id) {
        if (window.isGlobalPrinting) {
            showNotify("Proses Sibuk", "Sistem sedang merakit dokumen PDF.", "warning");
            return; 
        }
        
        if (!state || !state.user) {
            showNotify("Sistem Memuat", "Data belum siap.", "warning");
            return;
        }
        
        window.isGlobalPrinting = true;
        showLoading("Merakit Rencana PDF dengan presisi tinggi... (Mohon tunggu)");
        
        const token = localStorage.getItem('transkep_session_token');
        
        if (typeof google !== 'undefined') {
            google.script.run
                .withSuccessHandler(function(res) {
                    hideLoading(); 
                    window.isGlobalPrinting = false;
                    
                    if (res.status === 'success') {
                        showNotify("Berhasil", "Rencana PDF berhasil dibuat!", "success");
                        window.open(res.url, '_blank');
                    } else {
                        showNotify("Gagal Mencetak", res.message, "error");
                    }
                })
                .withFailureHandler(function(err) {
                    hideLoading(); 
                    window.isGlobalPrinting = false;
                    showNotify("Error Koneksi", err.toString(), "error");
                })
                .generatePdfRencanaWFH(id, state.user.nip, token); // Panggil fungsi backend baru
        } else {
            setTimeout(() => { 
                hideLoading(); 
                window.isGlobalPrinting = false; 
                alert("[CANVAS MODE] PDF Rencana akan terbuka di sini."); 
            }, 1500);
        }
    }
    
    function renderTemplateCetakRencanaWFH(data) {
        try {
            const templateContainer = document.getElementById('templateCetakRencanaWfh');
            if (!templateContainer) {
                hideLoading(); window.isGlobalPrinting = false;
                showNotify("Error", "Template cetak WFH tidak ditemukan.", "error"); return;
            }
            
            let htmlContent = templateContainer.innerHTML;
            
            const pemohon = state.usersList.find(u => String(u.nip) === String(data?.nip)) || { nama: '[Data Kosong]', jabatan: '-', alamat: '' };
            const atasan = state.usersList.find(u => String(u.nip) === String(data?.atasan_nip)) || { nama: '[Data Kosong]', jabatan: '-' };
            
            let tBodyHtml = "";
            try {
                const targetList = JSON.parse(data?.rencana_json || '[]');
                if (targetList.length === 0) {
                    tBodyHtml = '<tr><td colspan="4" style="text-align: center; font-style: italic; color: gray;">Tidak ada rincian target.</td></tr>';
                } else {
                    targetList.forEach((item, idx) => {
                        tBodyHtml += `<tr>
                            <td class="wfh-row-center">${idx + 1}</td>
                            <td>${item.deskripsi || '-'}</td>
                            <td class="wfh-row-center">Dokumen/Laporan</td>
                            <td class="wfh-row-center">${item.kuantitas || '-'}</td>
                        </tr>`;
                    });
                }
            } catch (e) {
                tBodyHtml = '<tr><td colspan="4" style="color: red; text-align: center;">Error data.</td></tr>';
            }

            const tglBuatStr = data?.waktu ? data.waktu.split(' ')[0] : '-';

            const replacements = {
                "{{wfh_nama}}": pemohon.nama,
                "{{wfh_nip}}": data?.nip || '-',
                "{{wfh_jabatan}}": pemohon.jabatan,
                "{{wfh_unit}}": "Pengadilan Agama Indramayu",
                "{{wfh_tanggal}}": formatDateFullIndo(data?.tanggal),
                "{{wfh_tempat}}": pemohon.alamat || "Tempat Tinggal Pegawai (Domisili)",
                "{{wfh_kendala}}": "Gangguan jaringan internet / akses VPN Instansi",
                "{{wfh_nama_atasan}}": atasan.nama,
                "{{wfh_nip_atasan}}": data?.atasan_nip || '-',
                "{{wfh_tgl_buat}}": formatDateFullIndo(tglBuatStr)
            };

            for (let key in replacements) {
                htmlContent = htmlContent.split(key).join(replacements[key]);
            }

            let finalHTML = "<!DOCTYPE html><html lang='id'><head><meta charset='UTF-8'><title>Cetak WFH - " + pemohon.nama + "</title>";
            finalHTML += "</head><body style='margin:0; padding:0; background:white;'>";
            finalHTML += htmlContent;
            finalHTML += "</body></html>";

            const iframe = document.createElement('iframe');
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = 'none';
            document.body.appendChild(iframe);

            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(finalHTML);
            doc.close();

            // FIX: Suntik tabel pakai DOM murni agar Chrome tidak membuang teks keluar tabel
            const targetTbody = doc.getElementById('wfh_target_tbody');
            if (targetTbody) {
                targetTbody.innerHTML = tBodyHtml;
            }

            setTimeout(function() {
                hideLoading();
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                
                setTimeout(function() {
                    if (document.body.contains(iframe)) { document.body.removeChild(iframe); }
                    window.isGlobalPrinting = false;
                }, 3000);
            }, 1500);
            
        } catch(e) {
            hideLoading();
            window.isGlobalPrinting = false;
            showNotify("Error Render", "Terjadi kesalahan sistem.", "error");
            console.error(e);
        }
    }
