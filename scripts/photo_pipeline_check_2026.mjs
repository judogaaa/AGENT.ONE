// Photo pipeline check for AGENT.ONE demo catalog
// Run with: node scripts/photo_pipeline_check_2026.mjs

import { execSync } from 'child_process';
import { existsSync } from 'fs';

const BASE = 'http://localhost:8080';

// 1. Check backend is running
console.log('1. Checking backend...');
try {
  const r = await fetch(BASE + '/api/health');
  const d = await r.json();
  if (!d.ok) { console.error('Backend health check failed'); process.exit(1); }
  console.log('   OK');
} catch { console.error(`Backend not running on ${BASE}. Start server first.`); process.exit(1); }

// 2. Check photo files exist locally
console.log('2. Checking local photo files...');
execSync('node scripts/check_demo_photos_2026.mjs', { stdio: 'inherit', cwd: '..' });

// 3. Check dist exists
console.log('3. Checking client/dist/demo-products...');
if (!existsSync('client/dist/demo-products/technomarket')) {
  console.log('   dist not found. Running npm build...');
  execSync('npm run build', { stdio: 'inherit', cwd: 'client' });
  if (!existsSync('client/dist/demo-products/technomarket')) {
    console.error('   Build succeeded but demo-products not in dist. Check Vite public dir config.');
    process.exit(1);
  }
}
console.log('   OK');

// 4. HTTP verification
console.log('4. HTTP image verification...');
try {
  execSync('node scripts/verify_demo_images_http_2026.mjs', { stdio: 'inherit', cwd: '..' });
} catch {
  console.error('   Photo HTTP verification FAILED — fix missing/broken images.');
  process.exit(1);
}

// 5. Smoke
console.log('5. Smoke test...');
execSync('node scripts/smoke.mjs', { stdio: 'inherit', cwd: '..' });

console.log('\nPipeline check complete.');
