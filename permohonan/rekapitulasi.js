// ==========================================
// FILE: rekapitulasi.gs
// Deskripsi: Backend Controller untuk Rekapitulasi & Mesin Auto-Routing (Eskalasi/Delegasi)
// ==========================================

function getSmartRouting(atasanNip, pejabatNip, tglMulai, tglSelesai, userNip, clientToken) {
  try {
    if (!cekOtorisasi(userNip, clientToken)) return { status: 'error', message: 'Akses Ditolak: Sesi tidak valid.' };
    
    const ss = getDB();
    const userSheet = ss.getSheetByName('user_data');
    const cutiSheet = ss.getSheetByName('cuti_log');
    const stSheet = ss.getSheetByName('st_log');

    const users = userSheet.getDataRange().getDisplayValues();
    const cutis = cutiSheet ? cutiSheet.getDataRange().getDisplayValues() : [];
    const sts = stSheet ? stSheet.getDataRange().getDisplayValues() : [];

    let userList = [];
    for(let i=1; i<users.length; i++) {
       userList.push({ nip: String(users[i][0]).trim(), nama: users[i][1], jabatan: users[i][2] });
    }

    let absences = [];
    for(let i=1; i<cutis.length; i++) {
        if(cutis[i][7] === 'Disetujui') {
             let hist = cutis[i][16] || '{}';
             let plh = "";
             try { let p = JSON.parse(hist); plh = p.plh_nip || ""; } catch(e) {}
             
             absences.push({
                 nip: String(cutis[i][2]).trim(),
                 start: new Date(cutis[i][4]),
                 end: new Date(cutis[i][5]),
                 plh_nip: plh,
                 jenis: "Cuti (" + cutis[i][3] + ")"
             });
        }
    }

    for(let i=1; i<sts.length; i++) {
        if(sts[i][12] !== 'DIBATALKAN') {
             let pArr = [];
             try { pArr = JSON.parse(sts[i][10] || '[]'); } catch(e) {}
             pArr.forEach(p => {
                 absences.push({ nip: String(p.nip).trim(), start: new Date(sts[i][7]), end: new Date(sts[i][8]), plh_nip: p.plh_nip || "", jenis: "Dinas Luar" });
             });
        }
    }

    // Helper: Cek Irisan Tanggal
    function checkOverlap(tMulai, tSelesai, aStart, aEnd) {
        let ts = new Date(tMulai); ts.setHours(0,0,0,0);
        let te = new Date(tSelesai); te.setHours(23,59,59,999);
        let as = new Date(aStart); as.setHours(0,0,0,0);
        let ae = new Date(aEnd); ae.setHours(23,59,59,999);
        return (ts <= ae) && (te >= as);
    }

    // Helper: Cari NIP berdasarkan Nama Jabatan
    function getRoleNip(roleName) {
        let found = userList.find(u => String(u.jabatan).toLowerCase() === roleName.toLowerCase());
        if(!found) found = userList.find(u => String(u.jabatan).toLowerCase().includes(roleName.toLowerCase()));
        return found ? found.nip : null;
    }

    let routingMessages = [];

    // Mesin Utama: Resolve (Eskalasi / Delegasi)
    function resolvePejabat(currentNip, typeName) {
        let resolvedNip = currentNip;
        let loopCount = 0; 
        
        while(loopCount < 3) { // Maks 3 lompatan agar tidak infinite loop
            loopCount++;
            let userObj = userList.find(u => u.nip === resolvedNip);
            if(!userObj) break;

            let isAbsent = false;
            let assignedPlh = "";
            let absenceReason = "";

            // Cek apakah Pejabat saat ini absen di tanggal tersebut
            for(let a of absences) {
                if(a.nip === resolvedNip && checkOverlap(tglMulai, tglSelesai, a.start, a.end)) {
                    isAbsent = true;
                    assignedPlh = a.plh_nip;
                    absenceReason = a.jenis;
                    break;
                }
            }

            if(!isAbsent) break; // Pejabat hadir, stop pencarian!

            let jab = String(userObj.jabatan).toLowerCase();
            
            // LOGIKA A & B: Eskalasi Naik Tingkat
            if(jab.includes("panitera muda") || jab.includes("panmud")) {
                let paniteraNip = getRoleNip("panitera");
                if(paniteraNip && paniteraNip !== resolvedNip) {
                    routingMessages.push(`- <b>${typeName}</b> dialihkan (naik) ke Panitera karena Panitera Muda sedang ${absenceReason}.`);
                    resolvedNip = paniteraNip;
                    continue; // Ulang loop untuk mengecek apakah Panitera juga absen
                }
            } 
            else if (jab.includes("kepala sub bagian") || jab.includes("kasubbag")) {
                let sekNip = getRoleNip("sekretaris");
                if(sekNip && sekNip !== resolvedNip) {
                    routingMessages.push(`- <b>${typeName}</b> dialihkan (naik) ke Sekretaris karena Kasubbag sedang ${absenceReason}.`);
                    resolvedNip = sekNip;
                    continue; 
                }
            }
            
            // LOGIKA C: Delegasi ke Plh 
            if(assignedPlh) {
                let plhObj = userList.find(u => u.nip === assignedPlh);
                let plhName = plhObj ? plhObj.nama : "Pejabat PLH";
                routingMessages.push(`- <b>${typeName}</b> dialihkan ke ${plhName} (selaku Plh), karena ${userObj.nama} sedang ${absenceReason}.`);
                resolvedNip = assignedPlh;
            } else {
                routingMessages.push(`- <b>Peringatan:</b> ${userObj.nama} sedang ${absenceReason} namun belum ada Plh di sistem.`);
                break; // Mentok, berhenti.
            }
        }
        
        return resolvedNip;
    }

    let finalAtasan = resolvePejabat(atasanNip, "Atasan Langsung");
    let finalPejabat = resolvePejabat(pejabatNip, "Pejabat Berwenang");

    return {
        status: 'success',
        data: {
            atasan_nip: finalAtasan,
            pejabat_nip: finalPejabat,
            pesan: routingMessages.length > 0 ? routingMessages.join("<br>") : ""
        }
    };

  } catch (err) {
    return { status: 'error', message: err.toString() };
  }
}