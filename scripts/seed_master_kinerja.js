/**
 * SEED SCRIPT: Injeksi Kamus Kinerja Standar Pengadilan ke Cloud Firestore
 * Project: transkep-314c0
 * Collection: master_kinerja
 */
const https = require('https');

const TEMPLATES = [
  {
    id: 'TEMPL_jurusita',
    nama_jabatan: 'Jurusita',
    kategori: 'Kepaniteraan',
    aliases: ['Jurusita', 'Juru Sita', 'Jurusita Pengganti', 'Juru Sita Pengganti'],
    sasaran_list: [
      {
        sasaran: 'Terlaksananya penyampaian relas panggilan sidang dan pemberitahuan putusan secara sah dan patut',
        indikator_list: [
          { indikator: 'Jumlah relas panggilan sidang dan pemberitahuan yang disampaikan kepada para pihak tepat waktu', satuan: 'Relas', mutu: 100, kuantitas: 120, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
        ]
      },
      {
        sasaran: 'Terlaksananya penatausahaan dan pelaporan administrasi kejurusitaan',
        indikator_list: [
          { indikator: 'Jumlah laporan pelaksanaan tugas kejurusitaan yang disusun secara berkala', satuan: 'Laporan', mutu: 100, kuantitas: 12, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
        ]
      }
    ]
  },
  {
    id: 'TEMPL_panitera_pengganti',
    nama_jabatan: 'Panitera Pengganti',
    kategori: 'Kepaniteraan',
    aliases: ['Panitera Pengganti', 'PP'],
    sasaran_list: [
      {
        sasaran: 'Terlaksananya pendampingan persidangan dan penyusunan berita acara sidang tepat waktu',
        indikator_list: [
          { indikator: 'Jumlah Berita Acara Sidang (BAS) yang diselesaikan tepat waktu sesuai jadwal sidang', satuan: 'Berkas', mutu: 100, kuantitas: 120, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
        ]
      },
      {
        sasaran: 'Terlaksananya minutasi dan pengelolaan berkas perkara pasca putusan',
        indikator_list: [
          { indikator: 'Jumlah berkas perkara yang diminutasi dan diserahkan ke Panitera Muda tepat waktu', satuan: 'Berkas', mutu: 100, kuantitas: 120, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
        ]
      }
    ]
  },
  {
    id: 'TEMPL_pranata_komputer',
    nama_jabatan: 'Pranata Komputer',
    kategori: 'Kesekretariatan',
    aliases: ['Pranata Komputer', 'Pranata Komputer Ahli Pertama', 'Pranata Komputer Terampil', 'Pengelola TI', 'Staf IT'],
    sasaran_list: [
      {
        sasaran: 'Terpeliharanya infrastruktur jaringan, server, dan ketersediaan sistem informasi peradilan (SIPP/TRANSKEP)',
        indikator_list: [
          { indikator: 'Persentase uptime dan kehandalan koneksi jaringan serta sistem aplikasi peradilan', satuan: '%', mutu: 100, kuantitas: 100, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
        ]
      },
      {
        sasaran: 'Terlaksananya pemeliharaan perangkat keras dan layanan bantuan teknis (helpdesk)',
        indikator_list: [
          { indikator: 'Jumlah laporan pemeliharaan perangkat komputer dan penanganan kendala pengguna yang diselesaikan', satuan: 'Laporan', mutu: 100, kuantitas: 12, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
        ]
      }
    ]
  },
  {
    id: 'TEMPL_kasubbag_ptip',
    nama_jabatan: 'Kasubbag PTIP',
    kategori: 'Kesekretariatan',
    aliases: ['Kasubbag PTIP', 'Kepala Sub Bagian PTIP', 'Kepala Sub Bagian Perencanaan, TI, dan Pelaporan', 'Kasubbag Perencanaan'],
    sasaran_list: [
      {
        sasaran: 'Terlaksananya penyusunan dokumen perencanaan dan penganggaran pengadilan (DIPA/RKA-K/L)',
        indikator_list: [
          { indikator: 'Jumlah dokumen perencanaan anggaran yang disusun dan disahkan tepat waktu', satuan: 'Dokumen', mutu: 100, kuantitas: 2, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
        ]
      },
      {
        sasaran: 'Terlaksananya pelaporan kinerja dan akuntabilitas instansi (LKjIP & Laptah)',
        indikator_list: [
          { indikator: 'Jumlah laporan kinerja instansi yang disusun sesuai pedoman Mahkamah Agung', satuan: 'Laporan', mutu: 100, kuantitas: 4, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
        ]
      }
    ]
  },
  {
    id: 'TEMPL_kasubbag_kepegawaian',
    nama_jabatan: 'Kasubbag Kepegawaian & Ortala',
    kategori: 'Kesekretariatan',
    aliases: ['Kasubbag Kepegawaian', 'Kasubbag Kepegawaian dan Ortala', 'Kepala Sub Bagian Kepegawaian, Organisasi, dan Tata Laksana'],
    sasaran_list: [
      {
        sasaran: 'Terlaksananya pengelolaan layanan administrasi kepegawaian (KGB, KP, Pensiun, dan Cuti Pegawai)',
        indikator_list: [
          { indikator: 'Persentase penyelesaian usulan layanan kepegawaian tepat waktu sesuai SOP', satuan: '%', mutu: 100, kuantitas: 100, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
        ]
      },
      {
        sasaran: 'Terlaksananya pemutakhiran data kepegawaian pada aplikasi SIKEP dan TRANSKEP',
        indikator_list: [
          { indikator: 'Tingkat kelengkapan dan keakuratan data profil pegawai pada sistem kepegawaian', satuan: '%', mutu: 100, kuantitas: 100, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
        ]
      }
    ]
  },
  {
    id: 'TEMPL_kasubbag_umum',
    nama_jabatan: 'Kasubbag Umum & Keuangan',
    kategori: 'Kesekretariatan',
    aliases: ['Kasubbag Umum dan Keuangan', 'Kasubbag Umum & Keuangan', 'Kepala Sub Bagian Umum dan Keuangan'],
    sasaran_list: [
      {
        sasaran: 'Terlaksananya pengelolaan tata laksana keuangan dan realisasi anggaran DIPA 01 & 04',
        indikator_list: [
          { indikator: 'Persentase capaian realisasi anggaran belanja pengadilan secara akuntabel', satuan: '%', mutu: 100, kuantitas: 100, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
        ]
      },
      {
        sasaran: 'Terlaksananya penatausahaan Barang Milik Negara (BMN) dan kebersihan sarana kantor',
        indikator_list: [
          { indikator: 'Jumlah laporan penatausahaan BMN dan pemeliharaan sarana kantor yang diselesaikan', satuan: 'Laporan', mutu: 100, kuantitas: 12, waktu: [1,2,3,4,5,6,7,8,9,10,11,12], pagu: 0 }
        ]
      }
    ]
  }
];

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function toFirestoreDocument(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v);
  }
  return { fields };
}

function writeDoc(collection, docId, data) {
  return new Promise((resolve, reject) => {
    const url = `https://firestore.googleapis.com/v1/projects/transkep-314c0/databases/(default)/documents/${collection}/${docId}`;
    const payload = JSON.stringify(toFirestoreDocument(data));
    const req = https.request(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  console.log('🚀 Mulai injeksi 6 Template Kamus Jabatan ke Firestore master_kinerja...');
  for (const t of TEMPLATES) {
    const docData = {
      id: t.id,
      nama_jabatan: t.nama_jabatan,
      kategori: t.kategori,
      aliases: t.aliases,
      sasaran_list: t.sasaran_list,
      is_firebase: true,
      updated_at: new Date().toISOString(),
      updated_by: 'ZettBOT Lead Architect'
    };
    try {
      await writeDoc('master_kinerja', t.id, docData);
      console.log(`✅ [Berhasil] Injeksi: ${t.id} (${t.nama_jabatan})`);
    } catch (err) {
      console.error(`❌ [Gagal] ${t.id}:`, err.message);
    }
  }
  console.log('🎉 Selesai injeksi master_kinerja!');
}

main();
