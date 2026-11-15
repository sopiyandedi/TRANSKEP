const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const suites = [
  { name: 'Fase 1 - Auth, RBAC, RPC Allowlist & Webhook Secrets', file: 'tests/verify_fase1.js' },
  { name: 'Fase 2 - Session Hardening, Formula Injection & Module IDOR', file: 'tests/verify_fase2.js' },
  { name: 'Fase 3A - XSS Escaping, Drive Binary Proxy & URL Schemes', file: 'tests/verify_fase3a.js' },
  { name: 'Fase 3B - Zero-Trust Firestore Auth, CSP/SRI & Drive Access', file: 'tests/verify_fase3b.js' },
  { name: 'Schema & Release Parity - Firestore Rules vs Client & PWA Version', file: 'tests/verify_firestore_schema.js' },
  { name: 'n8n Workflow - Transkep AI Assistant (Docker + Direct Chat)', file: 'tests/verify_n8n_ai_assistant.js' }
];

const startedAt = Date.now();
for (let i = 0; i < suites.length; i++) {
  const s = suites[i];
  console.log(`\n=== [${i + 1}/${suites.length}] Running ${s.name} ===`);
  execFileSync(process.execPath, [path.join(repoRoot, s.file)], {
    cwd: repoRoot,
    stdio: 'inherit'
  });
}

const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(2);
console.log(`\n✅ ALL ${suites.length} SECURITY & SCHEMA SUITES PASSED IN ${elapsedSec}s (0 FAILURES).`);

