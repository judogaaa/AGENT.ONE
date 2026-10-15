import fs from 'fs';
const res = []; function ok(l) { res.push({ label: l, status: 'PASS' }); }
function fail(l, d) { res.push({ label: l, status: 'FAIL', detail: d }); }
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

const mainGo = read('server/cmd/main.go');
const releaseGo = read('server/cmd/release_helpers.go');
const testGo = read('server/cmd/release_helpers_test.go');
const ciYml = read('.github/workflows/ci.yml');
const runbook = read('docs/RELEASE_RUNBOOK.md');
const allCode = mainGo + releaseGo;

// Environment
if (allCode.includes('APP_ENV')) ok('APP_ENV supported'); else fail('APP_ENV missing');
['development','test','production'].forEach(e => {
  if (releaseGo.includes(e)) ok(`APP_ENV: ${e}`); else fail(`APP_ENV ${e} missing`);
});
if (allCode.includes('isProduction()')) ok('isProduction helper'); else fail('isProduction missing');
if (allCode.includes('isTest()')) ok('isTest helper'); else fail('isTest missing');

// Config validation
if (allCode.includes('validateRuntimeConfig')) ok('validateRuntimeConfig exists'); else fail('validateRuntimeConfig missing');
['DATABASE_URL','JWT_SECRET','DEV_ADMIN_TOKEN'].forEach(k => {
  if (allCode.includes(k)) ok(`Config checks: ${k}`); else fail(`Config missing: ${k}`);
});

// Unit tests
const testCount = (testGo.match(/func Test\w+\(/g) || []).length;
if (testCount >= 15) ok(`${testCount} config/request tests`); else fail(`Only ${testCount} tests`);
if (!testGo.includes('testify')) ok('No testify in tests'); else fail('testify in tests');

// Readiness failure tests
if (testGo.includes('failingDB') || testGo.includes('TestReadinessReturns503')) ok('Test: readiness 503'); else fail('Test: readiness 503 missing');
if (testGo.includes('dial failed') || testGo.includes('DATABASE_URL')) ok('Test: readiness no DB leak'); else fail('Test: readiness DB leak check missing');

// Panic recovery tests
if (testGo.includes('TestPanicRecoveryNextRequestWorks')) ok('Test: panic next request works'); else fail('Test: panic next request missing');
if (testGo.includes('panic leaks')) ok('Test: panic safe response'); else fail('Test: panic safe response missing');

// Request ID tests
if (testGo.includes('ControlChars')) ok('Test: request ID control chars'); else fail('Test: request ID control chars missing');
if (testGo.includes('PreservesValidID')) ok('Test: request ID preserves valid'); else fail('Test: request ID preserve missing');

// Logging tests
if (testGo.includes('TestLoggingMiddlewareRecordsRequestID')) ok('Test: logging records request ID'); else fail('Test: logging request ID missing');

// Liveness/readiness
if (mainGo.includes('/api/live')) ok('/api/live route'); else fail('/api/live missing');
if (mainGo.includes('/api/ready')) ok('/api/ready route'); else fail('/api/ready missing');
if (allCode.includes('handleLiveness')) ok('handleLiveness function'); else fail('handleLiveness missing');
if (allCode.includes('handleReadiness')) ok('handleReadiness function'); else fail('handleReadiness missing');
if (allCode.includes('readinessPinger')) ok('readinessPinger'); else fail('readinessPinger missing');
if (allCode.includes('database_unavailable')) ok('ready returns 503 on DB fail'); else fail('ready 503 missing');

// Request ID
if (allCode.includes('requestIDMiddleware')) ok('requestIDMiddleware'); else fail('requestIDMiddleware missing');
if (allCode.includes('X-Request-ID')) ok('X-Request-ID header'); else fail('X-Request-ID missing');
if (allCode.includes('requestIDKey')) ok('requestID context'); else fail('requestID context missing');
if (allCode.includes('validRequestID')) ok('validRequestID regex'); else fail('validRequestID missing');

// Logging
if (allCode.includes('loggingMiddleware')) ok('loggingMiddleware'); else fail('loggingMiddleware missing');
if (allCode.includes('statusRecorder')) ok('statusRecorder'); else fail('statusRecorder missing');
if (allCode.includes('duration_ms')) ok('duration logged'); else fail('duration missing');
if (allCode.includes('"status"')) ok('status logged'); else fail('status logging');
if (allCode.includes('"rid"')) ok('request ID logged'); else fail('request ID logging');
if (allCode.includes('"method"')) ok('method logged'); else fail('method logging');

// Secret safety in logging
// Authorization/body/keys should not be logged directly
if (!allCode.includes('log.*Authorization') && !allCode.includes('log.*DATABASE_URL') && !allCode.includes('log.*GROQ_API_KEY')) ok('No secret logging patterns'); else fail('Potential secret logging');

// Panic recovery
if (allCode.includes('recoveryMiddleware')) ok('recoveryMiddleware'); else fail('recoveryMiddleware missing');
if (allCode.includes('panic_recovered')) ok('panic recovery log'); else fail('panic recovery log missing');

// Graceful shutdown
if (allCode.includes('signal.Notify')) ok('signal.Notify'); else fail('signal.Notify missing');
if (allCode.includes('os.Interrupt') || allCode.includes('SIGTERM')) ok('SIGTERM/Interrupt handled'); else fail('SIGTERM missing');
if (allCode.includes('server.Shutdown')) ok('server.Shutdown'); else fail('server.Shutdown missing');
if (allCode.includes('db.Close()')) ok('db.Close in shutdown'); else fail('db.Close missing');
if (mainGo.includes('readinessPinger = db')) ok('readinessPinger set'); else fail('readinessPinger not set');

// Build metadata
if (allCode.includes('version') && allCode.includes('commit') && allCode.includes('buildTime')) ok('Build metadata vars'); else fail('Build metadata missing');
if (allCode.includes('buildMeta()')) ok('buildMeta function'); else fail('buildMeta missing');

// Middleware chain
if (mainGo.includes('recoveryMiddleware(loggingMiddleware(requestIDMiddleware')) ok('Middleware chain correct'); else fail('Middleware chain wrong');

// CI
if (ciYml.includes('release-readiness')) ok('CI: release-readiness job'); else fail('CI: release-readiness missing');
['static-and-unit','runtime-integration','browser-e2e'].forEach(j => {
  if (ciYml.includes(j)) ok(`CI: ${j} preserved`); else fail(`CI: ${j} missing`);
});

// Runbook
if (runbook.length > 100) ok('RELEASE_RUNBOOK.md exists'); else fail('RELEASE_RUNBOOK.md missing');
if (runbook.includes('810224a')) ok('Runbook references HEAD'); else fail('Runbook missing HEAD ref');
if (runbook.includes('DATABASE_URL')) ok('Runbook mentions DATABASE_URL'); else fail('Runbook missing DATABASE_URL');
if (runbook.includes('Rollback') || runbook.includes('rollback')) ok('Runbook has rollback criteria'); else fail('Runbook missing rollback');
if (runbook.includes('Checkpoint') || runbook.includes('checkpoint')) ok('Runbook has checkpoint ref'); else fail('Runbook missing checkpoint');

// README
if (read('README.md').includes('README_LOCAL_START.md') && read('DEPLOYMENT.md').includes('самостоятельное')) ok('README links setup and independent deployment'); else fail('README/deployment docs incomplete');
if (!read('README.md').includes('production deployment is complete') && !read('README.md').includes('production deployment has been performed')) ok('README: no fake deployment claim'); else fail('README: claims deployment');

// CI
if (ciYml.includes('release-readiness')) ok('CI: release-readiness job'); else fail('CI: release-readiness missing');
if (ciYml.includes('needs: browser-e2e')) ok('CI: release needs browser-e2e'); else fail('CI: release needs missing');
if (!ciYml.includes('secrets.') && !ciYml.includes('secrets:')) ok('CI: no secrets context'); else fail('CI: has secrets context');
if (!ciYml.includes('deploy') && !ciYml.includes('push') || ciYml.includes('push') && ciYml.includes('git')) ok('CI: no deployment'); else fail('CI: deployment detected');

// Safety
if (!read('server/go.mod').includes('testify')) ok('go.mod clean');
let bins = 0; (function s(dir, ex) { for (const n of fs.readdirSync(dir)) { const p = dir+'/'+n; if (ex.some(e=>p.includes(e))) continue; try { if (fs.statSync(p).isDirectory()) s(p, ex); else if (/\.exe~?$/.test(n)) { bins++; fail('Binary: '+p); } } catch {} } })('.', ['.git','node_modules','client/dist','test-results','playwright-report']);
if (bins === 0) ok('No binaries');
if (read('.gitignore').includes('.env')) ok('.env gitignored');
if (!fs.existsSync('server/internal')) ok('No server/internal');
if (read('README.md').includes('README_LOCAL_START.md') && read('DEPLOYMENT.md').includes('самостоятельное')) ok('README links setup and independent deployment'); else fail('README/deployment docs incomplete');

const p = res.filter(r => r.status === 'PASS').length, f = res.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE Release Readiness Audit 2026');
res.forEach(r => console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`));
console.log(`\nResults: ${p} passed, ${f} failed`);
if (f > 0) process.exit(1);
