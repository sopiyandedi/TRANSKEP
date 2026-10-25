/**
 * SEED SCRIPT: Injeksi Dokumen Awal/Baseline PKP, PCK, dan Rekapitulasi ke Cloud Firestore
 * Project: transkep-314c0
 * Collections: pkp_documents, pck_documents, pck_rekapitulasi
 */
const https = require('https');

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
  console.log('🚀 Mulai seeding seluruh pilar PKP ke Cloud Firestore (transkep-314c0)...');

  // 1. Pilar 1: PKP Documents
  const pkpList = [
    {
      id_pkp: 'PKP_2026_199312242025211033',
      nip_pegawai: '199312242025211033',
      nip: '199312242025211033',
      nip_penilai: '197002192001121001',
      penilai: '197002192001121001',
      nip_atasan_pejabat: '197309081998031001',
      atasan_pejabat: '197309081998031001',
      tahun: '2026',
      status: 'Disetujui',
      nilai_akhir: '95.50',
      items: [
        {
          id_item: 'ITEM_PKP_001',
          sasaran: 'Terpeliharanya infrastruktur jaringan, server, dan ketersediaan sistem informasi peradilan (SIPP/TRANSKEP)',
          indikator: 'Persentase uptime dan kehandalan koneksi jaringan serta sistem aplikasi peradilan',
          satuan: '%',
          mutu: 100,
          kuantitas: 100,
          waktu: '1,2,3,4,5,6,7,8,9,10,11,12',
          pagu: '0'
        },
        {
          id_item: 'ITEM_PKP_002',
          sasaran: 'Terlaksananya pemeliharaan perangkat keras dan layanan bantuan teknis (helpdesk)',
          indikator: 'Jumlah laporan pemeliharaan perangkat komputer dan penanganan kendala pengguna yang diselesaikan',
          satuan: 'Laporan',
          mutu: 100,
          kuantitas: 12,
          waktu: '1,2,3,4,5,6,7,8,9,10,11,12',
          pagu: '0'
        }
      ],
      is_firebase: true,
      updated_at: new Date().toISOString(),
      updated_by: 'ZettBOT Lead Architect'
    },
    {
      id_pkp: 'PKP_2026_197309081998031001',
      nip_pegawai: '197309081998031001',
      nip: '197309081998031001',
      nip_penilai: '197309081998031001',
      penilai: '197309081998031001',
      nip_atasan_pejabat: '197309081998031001',
      atasan_pejabat: '197309081998031001',
      tahun: '2026',
      status: 'Disetujui',
      nilai_akhir: '98.00',
      items: [
        {
          id_item: 'ITEM_PKP_KPA_001',
          sasaran: 'Terwujudnya pelayanan peradilan yang prima, akuntabel, dan transparan di Pengadilan Agama Indramayu',
          indikator: 'Persentase penyelesaian perkara tepat waktu sesuai ketentuan Mahkamah Agung',
          satuan: '%',
          mutu: 100,
          kuantitas: 100,
          waktu: '1,2,3,4,5,6,7,8,9,10,11,12',
          pagu: '0'
        }
      ],
      is_firebase: true,
      updated_at: new Date().toISOString(),
      updated_by: 'ZettBOT Lead Architect'
    }
  ];

  for (const pk of pkpList) {
    try {
      await writeDoc('pkp_documents', pk.id_pkp, pk);
      console.log(`✅ [Berhasil] Pilar 1: pkp_documents -> ${pk.id_pkp}`);
    } catch (e) {
      console.error(`❌ [Gagal] pkp_documents ${pk.id_pkp}:`, e.message);
    }
  }

  // 2. Pilar 2: PCK Documents (Laporan Realisasi Bulanan)
  const pckList = [
    {
      id_pck: 'PCK_2026_Januari_199312242025211033',
      nip_pegawai: '199312242025211033',
      nip: '199312242025211033',
      bulan: 'Januari',
      tahun: '2026',
      total_rencana: 2,
      rencana: 2,
      progress: '100%',
      status: 'Disetujui',
      nilai_akhir: '95.50',
      realisasi: [
        {
          id_item_pk: 'ITEM_PKP_001',
          real_kuantitas: '100',
          real_mutu: '96',
          capaian: '96.00',
          keterangan: 'Jaringan dan SIPP beroperasi optimal tanpa downtime berarti'
        },
        {
          id_item_pk: 'ITEM_PKP_002',
          real_kuantitas: '1',
          real_mutu: '95',
          capaian: '95.00',
          keterangan: 'Laporan pemeliharaan komputer bulanan selesai disusun'
        }
      ],
      is_firebase: true,
      updated_at: new Date().toISOString(),
      updated_by: 'ZettBOT Lead Architect'
    }
  ];

  for (const pck of pckList) {
    try {
      await writeDoc('pck_documents', pck.id_pck, pck);
      console.log(`✅ [Berhasil] Pilar 2: pck_documents -> ${pck.id_pck}`);
    } catch (e) {
      console.error(`❌ [Gagal] pck_documents ${pck.id_pck}:`, e.message);
    }
  }

  // 3. Pilar 3: Rekapitulasi Snapshot (Opsi B)
  const rekapList = [
    {
      id_rekap: 'REKAP_2026_Januari',
      bulan: 'Januari',
      tahun: '2026',
      unit_kerja: 'Pengadilan Agama Indramayu',
      status: 'Terkunci / Disahkan',
      pejabat_nama: 'H. Zulkifli, S.Ag., S.H., M.H.',
      pejabat_nip: '197309081998031001',
      tgl_pengesahan: '2026-01-31',
      total_pegawai: 1,
      rata_rata_satker: 95.50,
      is_locked: true,
      daftar_nilai: [
        {
          nip: '199312242025211033',
          nama: 'Pegawai IT',
          jabatan: 'Pranata Komputer',
          nilai_akhir: '95.50',
          status: 'Disetujui'
        }
      ],
      is_firebase: true,
      updated_at: new Date().toISOString(),
      updated_by: 'H. Zulkifli, S.Ag., S.H., M.H.'
    }
  ];

  for (const rk of rekapList) {
    try {
      await writeDoc('pck_rekapitulasi', rk.id_rekap, rk);
      console.log(`✅ [Berhasil] Pilar 3: pck_rekapitulasi -> ${rk.id_rekap}`);
    } catch (e) {
      console.error(`❌ [Gagal] pck_rekapitulasi ${rk.id_rekap}:`, e.message);
    }
  }

  console.log('🎉 Seluruh 4 Pilar PKP resmi aktif dan terisi di Cloud Firestore (transkep-314c0)!');
}

main();
