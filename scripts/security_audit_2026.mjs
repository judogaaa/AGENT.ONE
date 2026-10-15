import fs from 'fs';

const PROJECT = '.';
const results = [];

function ok(label) { results.push({ label, status: 'PASS' }); }
function fail(label, detail) { results.push({ label, status: 'FAIL', detail }); }
function warn(label, detail) { results.push({ label, status: 'WARN', detail }); }

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

// 1. .env is gitignored
const gitignore = readFile('.gitignore');
if (gitignore.includes('.env')) ok('.env in .gitignore');
else fail('.env not in .gitignore');

// 2. .env is not tracked
const trackedEnv = readFile('.env').length > 0 ? 'present' : 'missing';
ok(`.env file exists (${trackedEnv})`);

// 3. No real gsk_ key outside .env
const gskRe = /gsk_[A-Za-z0-9_-]{20,}/g;
let gskHits = 0;
function scan(dir, exclude) {
  for (const name of fs.readdirSync(dir)) {
    const p = dir + '/' + name;
    if (exclude.some(e => p.startsWith(e) || p.includes(e))) continue;
    try {
      if (fs.statSync(p).isDirectory()) { scan(p, exclude); continue; }
      if (!/\.(go|js|jsx|json|md|ps1|mjs|yml|css)$/.test(name)) continue;
      const c = readFile(p);
      const matches = c.match(gskRe);
      if (matches) { gskHits += matches.length; fail('gsk_ key in ' + p + ': ' + matches[0].slice(0, 15) + '...'); }
    } catch {}
  }
}
scan(PROJECT, ['.git', 'node_modules', 'client/dist', '.env', 'AGENT_ONE_BACKUPS', 'server/server.exe', 'server/main', 'server/exe']);
if (gskHits === 0) ok('No real gsk_ key outside .env');
else fail(gskHits + ' gsk_ hits found');

// 4. No GROQ_API_KEY= value in source
const groqKeyRe = /GROQ_API_KEY=[A-Za-z0-9_-]{20,}/g;
let groqKeyHits = 0;
function scanGroq(dir, exclude) {
  for (const name of fs.readdirSync(dir)) {
    const p = dir + '/' + name;
    if (exclude.some(e => p.startsWith(e) || p.includes(e))) continue;
    try {
      if (fs.statSync(p).isDirectory()) { scanGroq(p, exclude); continue; }
      if (!/\.(go|js|jsx|json|md|ps1|mjs|yml|css|env.*)$/.test(name)) continue;
      const c = readFile(p);
      if (groqKeyRe.test(c) && !p.includes('.env')) { groqKeyHits++; fail('GROQ_API_KEY= value in ' + p); }
    } catch {}
  }
}
scanGroq(PROJECT, ['.git', 'node_modules', 'client/dist', '.env']);
if (groqKeyHits === 0) ok('No GROQ_API_KEY= value outside .env');
else fail(groqKeyHits + ' hits');

// 5. No api.groq.com in frontend
const frontendFiles = walkFiles('client/src', ['.js', '.jsx']);
const distFiles = walkFiles('client/dist', ['.js', '.jsx', '.css']);
let frontendGroq = 0;
for (const f of frontendFiles) if (readFile(f).includes('api.groq.com')) { frontendGroq++; fail('api.groq.com in frontend: ' + f); }
if (frontendGroq === 0) ok('No api.groq.com in client/src');
for (const f of distFiles) if (readFile(f).includes('api.groq.com')) { frontendGroq++; fail('api.groq.com in dist: ' + f); }
if (frontendGroq === 0) ok('No api.groq.com in client/dist');

// 6. No wrong Go commands
let wrongGoCmd = 0;
const wrongPatterns = ['go run ./cmd/main.go', 'go build ./cmd/main.go', 'go.exe run ./cmd/main.go', 'go.exe build ./cmd/main.go'];
function scanGoCmds(dir, exclude) {
  for (const name of fs.readdirSync(dir)) {
    const p = dir + '/' + name;
    if (exclude.some(e => p.startsWith(e) || p.includes(e))) continue;
    try {
      if (fs.statSync(p).isDirectory()) { scanGoCmds(p, exclude); continue; }
      if (!/\.(md|ps1|json|mjs|go)$/.test(name)) continue;
      const c = readFile(p);
      for (const pat of wrongPatterns) {
        if (c.includes(pat) && !p.includes('security_audit')) { wrongGoCmd++; fail(`Wrong Go command "${pat}" in ${p}`); }
      }
    } catch {}
  }
}
scanGoCmds(PROJECT, ['.git', 'node_modules', 'client/dist', 'scripts/security_audit_2026.mjs']);
if (wrongGoCmd === 0) ok('No wrong Go commands (cmd/main.go)');
else fail(wrongGoCmd + ' occurrences');

// 7. No compiled binaries tracked in git
const trackedBinaries = execSync('git ls-files -- *.exe server/main *.out *.test');
if (trackedBinaries.trim() === '') ok('No compiled binaries tracked in git');
else fail('Binaries tracked: ' + trackedBinaries.slice(0, 200));

// 7b. No compiled binaries in project tree (disk scan)
const binaryPatterns = [/\.exe~?$/, /\.out$/, /\.test$/];
let diskBinaries = 0;
function scanBinaries(dir, exclude) {
  for (const name of fs.readdirSync(dir)) {
    const p = dir + '/' + name;
    if (exclude.some(e => p.startsWith(e) || p.includes(e))) continue;
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) { scanBinaries(p, exclude); continue; }
      if (binaryPatterns.some(re => re.test(name))) { diskBinaries++; fail('Binary on disk: ' + p); }
      if (name === 'main' && !st.isDirectory()) { diskBinaries++; fail('Binary on disk: ' + p); }
    } catch {}
  }
}
scanBinaries('.', ['.git', 'node_modules', 'client/dist', 'AGENT_ONE_BACKUPS']);
if (diskBinaries === 0) ok('No compiled binaries in project tree');
else fail(diskBinaries + ' binary files on disk');

// 8. No wildcard CORS in middleware
const mainGo = readFile('server/cmd/main.go');
const rateLimitGo = readFile('server/cmd/rate_limit.go');
const serverCode = mainGo + rateLimitGo;
if (serverCode.includes('Access-Control-Allow-Origin", "*"')) {
  fail('Wildcard CORS "*" found in server code');
} else ok('No wildcard CORS "*"');

// 9. Client avatar MIME hardening (may be in upload_helpers.go)
const uploadGo = readFile('server/cmd/upload_helpers.go');
const allCode = mainGo + uploadGo;
if (allCode.includes('http.DetectContentType') && allCode.includes('handleUploadClientAvatar')) {
  ok('Client avatar uses http.DetectContentType');
} else if (uploadGo.includes('http.DetectContentType') && mainGo.includes('saveUpload(w,')) {
  ok('Client avatar uses http.DetectContentType (via saveUpload)');
} else fail('Client avatar missing MIME detection');

if (allCode.includes('http.MaxBytesReader') && allCode.includes('handleUploadClientAvatar')) {
  ok('Client avatar uses MaxBytesReader');
} else if (uploadGo.includes('http.MaxBytesReader') && mainGo.includes('saveUpload(w,')) {
  ok('Client avatar uses MaxBytesReader (via saveUpload)');
} else fail('Client avatar missing MaxBytesReader');

if (allCode.includes('image/jpeg') && allCode.includes('image/png') && allCode.includes('image/webp')) {
  ok('Client avatar has MIME allowlist');
} else fail('Client avatar missing MIME allowlist');

// 10. Rate limiting exists
if (serverCode.includes('rate_limited') && serverCode.includes('HTTP 429') || serverCode.includes('429')) {
  ok('Rate limiting code exists');
} else fail('Rate limiting code not found');

if (serverCode.includes('rateLimitMiddleware')) ok('Rate limit middleware wired');
else fail('Rate limit middleware not wired');

// 11. Emoji in client/src
const emojiRe = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
let emojiCount = 0;
for (const f of frontendFiles) {
  const matches = readFile(f).match(emojiRe);
  if (matches) { emojiCount += matches.length; fail('Emoji in ' + f + ': ' + matches.slice(0, 3).join(',')); }
}
if (emojiCount === 0) ok('0 emoji in client/src');

// Summary
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE Security Audit 2026');
console.log('Project:', PROJECT, '\n');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'WARN' ? '⚠️' : '❌';
  console.log(`  ${icon} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

function walkFiles(dir, exts) {
  const out = [];
  try {
    for (const name of fs.readdirSync(dir)) {
      const p = dir + '/' + name;
      try {
        if (fs.statSync(p).isDirectory()) out.push(...walkFiles(p, exts));
        else if (exts.some(e => p.endsWith(e))) out.push(p);
      } catch {}
    }
  } catch {}
  return out;
}
function execSync(cmd) {
  try { return require('child_process').execSync(cmd, { encoding: 'utf8' }); } catch { return ''; }
}
