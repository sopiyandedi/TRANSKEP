// ==========================================
// FILE: app.js (Root Controller TRANSKEP Web)
// ENGINE: Vue 3 + TranskepAPI SDK
// ==========================================

const { createApp, ref, onMounted } = Vue;

const app = createApp({
  setup() {
    const user = ref(null);
    const usersList = ref([]);
    const loading = ref(false);
    const loginError = ref('');
    const showConfigModal = ref(false);
    const configApiUrl = ref(TranskepAPI.getApiUrl());
    const pingLoading = ref(false);

    const loginForm = ref({
      nip: '',
      pass: ''
    });

    // Inisialisasi: Cek sesi lokal
    onMounted(async () => {
      const auth = TranskepAPI.getAuth();
      if (auth.user && auth.token) {
        user.value = auth.user;
        await loadDashboardData();
      }
    });

    async function handleLogin() {
      loading.value = true;
      loginError.value = '';
      try {
        const res = await TranskepAPI.login(loginForm.value.nip, loginForm.value.pass);
        if (res.status === 'success') {
          user.value = res.data;
          await loadDashboardData();
        } else {
          loginError.value = res.message || 'Gagal masuk.';
        }
      } catch (err) {
        loginError.value = err.message || 'Koneksi ke server gagal. Periksa URL API Anda.';
      } finally {
        loading.value = false;
      }
    }

    async function loadDashboardData(forceRefresh = false) {
      loading.value = true;
      try {
        const res = await TranskepAPI.getBulkData(forceRefresh);
        if (res && res.usersList) {
          usersList.value = res.usersList;
        }
      } catch (err) {
        console.error('Gagal memuat bulk data:', err);
      } finally {
        loading.value = false;
      }
    }

    async function refreshData() {
      await loadDashboardData(true);
    }

    async function handleLogout() {
      await TranskepAPI.logout();
      user.value = null;
      usersList.value = [];
    }

    function saveConfig() {
      TranskepAPI.setApiUrl(configApiUrl.value);
      showConfigModal.value = false;
      alert('URL API berhasil disimpan!');
    }

    async function testPing() {
      const targetUrl = configApiUrl.value ? configApiUrl.value.trim() : '';
      if (!targetUrl || targetUrl.includes('AKfycbx...')) {
        alert('Silakan masukkan URL Web App Apps Script Anda terlebih dahulu.');
        return;
      }
      TranskepAPI.setApiUrl(targetUrl);
      pingLoading.value = true;
      try {
        const res = await TranskepAPI.ping(targetUrl);
        alert('Sukses Terhubung: ' + res.message);
      } catch (err) {
        alert('Gagal Terhubung: ' + err.message + '\n\nTips Penting:\n1. Pastikan di Apps Script opsi "Siapa yang memiliki akses" (Who has access) diatur ke "Siapa saja" (Anyone).\n2. Pastikan URL berakhiran /exec.');
      } finally {
        pingLoading.value = false;
      }
    }

    return {
      user,
      usersList,
      loading,
      loginForm,
      loginError,
      showConfigModal,
      configApiUrl,
      pingLoading,
      handleLogin,
      handleLogout,
      refreshData,
      saveConfig,
      testPing
    };
  }
});

app.mount('#app');
