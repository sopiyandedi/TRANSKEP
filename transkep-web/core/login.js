// ==========================================
// FILE: login.js
// DESKRIPSI: Logika Modal Lupa Password (Frontend)
// ENGINE: TRANSKEP Core v1.0.0 
// ==========================================

let cooldownResetPass = false; // Flag anti-spam click

function openLupaPassword() {
  const modal = document.getElementById('modalLupaPassword');
  const content = document.getElementById('modalLupaPasswordContent');
  const waInput = document.getElementById('waLupaPassword');
  if (waInput) waInput.value = '';
  
  if (modal && content) {
    modal.classList.remove('hidden');
    void modal.offsetWidth; // Trigger reflow untuk animasi smooth
    modal.classList.remove('opacity-0');
    content.classList.remove('scale-95');
  }
}

function closeLupaPassword() {
  const modal = document.getElementById('modalLupaPassword');
  const content = document.getElementById('modalLupaPasswordContent');
  
  if (modal && content) {
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 300);
  }
}

function submitLupaPassword(e) {
  if (e) e.preventDefault();
  
  if (cooldownResetPass) {
    if (typeof showNotify === 'function') {
      showNotify("Tunggu Sebentar", "Sistem sedang memproses antrean sebelumnya. Silakan tunggu sekitar 60 detik sebelum mengirim permintaan baru.", "warning");
    } else {
      alert("Tunggu 60 detik sebelum mengirim permintaan baru.");
    }
    return;
  }

  const no_wa = document.getElementById('waLupaPassword').value;
  if (!no_wa || no_wa.length < 9) {
    if (typeof showNotify === 'function') showNotify("Input Tidak Valid", "Masukkan nomor WhatsApp yang valid (minimal 9 angka).", "error");
    return;
  }

  const btn = document.getElementById('btnSubmitLupa');
  const originalBtnHtml = btn ? btn.innerHTML : 'Kirim';
  if (btn) {
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Memproses...`;
    btn.disabled = true;
  }

  const handleSuccess = function(res) {
    if (btn) {
      btn.innerHTML = originalBtnHtml;
      btn.disabled = false;
    }
    
    if (res && res.status === 'success') {
      closeLupaPassword();
      if (typeof showNotify === 'function') showNotify("Permintaan Terkirim", res.message, "success");
      
      // Aktifkan Cooldown 60 detik agar tidak spam klik ke sistem backend
      cooldownResetPass = true;
      setTimeout(() => {
        cooldownResetPass = false;
      }, 60000);
    } else {
      if (typeof showNotify === 'function') showNotify("Gagal Memproses", res ? res.message : "Gagal memproses", "error");
    }
  };

  const handleFailure = function(err) {
    if (btn) {
      btn.innerHTML = originalBtnHtml;
      btn.disabled = false;
    }
    const errMsg = err && err.message ? err.message : "Terjadi kesalahan saat menghubungi server. Muat ulang halaman.";
    if (typeof showNotify === 'function') showNotify("Kesalahan Jaringan", errMsg, "error");
  };

  // TRANSKEP DUAL-ENGINE: Prioritaskan TranskepAPI (Headless PWA), fallback ke google.script.run (Iframe GAS)
  if (typeof TranskepAPI !== 'undefined' && typeof TranskepAPI.call === 'function') {
    TranskepAPI.call('requestPasswordReset', no_wa)
      .then(handleSuccess)
      .catch(handleFailure);
  } else if (typeof google !== 'undefined' && google.script && google.script.run) {
    google.script.run
      .withSuccessHandler(handleSuccess)
      .withFailureHandler(handleFailure)
      .requestPasswordReset(no_wa);
  } else {
    handleFailure(new Error("Koneksi API TranskepAPI / google.script.run tidak tersedia."));
  }
}
