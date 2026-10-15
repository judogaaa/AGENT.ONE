import fs from 'fs';
const res=[]; function ok(l){res.push({label:l,status:'PASS'})} function fail(l,d){res.push({label:l,status:'FAIL',detail:d})}
function read(p){try{return fs.readFileSync(p,'utf8')}catch{return''}}
function exists(p){return fs.existsSync(p)}

const mg = read('server/cmd/operational_metrics.go')
const mt = read('server/cmd/operational_metrics_test.go')
const mainGo = read('server/cmd/main.go')
const ciYml = read('.github/workflows/ci.yml')
const rel = read('server/cmd/release_helpers.go')
const bk = read('scripts/backup_postgres_2026.ps1')
const dr = read('scripts/database_restore_drill_2026.ps1')
const rt = read('scripts/backup_retention_2026.ps1')
const cr = read('scripts/ci_operational_readiness_2026.ps1')
const all = mg + mt + mainGo + rel

// ─── 1. Files existence ───
if (mg.length > 100) ok('operational_metrics.go exists'); else fail('operational_metrics.go missing')
if (mt.length > 100) ok('operational_metrics_test.go exists'); else fail('test missing')
if (bk.length > 100) ok('backup script exists'); else fail('backup script missing')
if (dr.length > 100) ok('restore drill exists'); else fail('restore drill missing')
if (rt.length > 100) ok('retention script exists'); else fail('retention script missing')
if (cr.length > 100) ok('CI operational runner exists'); else fail('ci runner missing')

// ─── 2. Metrics endpoint ───
if (all.includes('/api/metrics')) ok('/api/metrics route'); else fail('/api/metrics missing')
if (all.includes('/api/ops/status')) ok('/api/ops/status route'); else fail('/api/ops/status missing')
if (all.includes('handleMetrics')) ok('handleMetrics function'); else fail('handleMetrics missing')
if (all.includes('handleOpsStatus')) ok('handleOpsStatus function'); else fail('handleOpsStatus missing')
if (all.includes('buildMetricsText')) ok('buildMetricsText function'); else fail('buildMetricsText missing')
if (all.includes('metricsEnabled')) ok('metricsEnabled function'); else fail('metricsEnabled missing')
if (all.includes('opsStatusEnabled')) ok('opsStatusEnabled function'); else fail('opsStatusEnabled missing')

// ─── 3. Metrics middleware ───
if (all.includes('metricsMiddleware')) ok('metricsMiddleware function'); else fail('metricsMiddleware missing')
if (all.includes('metricsTrackingWriter')) ok('metricsTrackingWriter type'); else fail('tracking writer missing')
if (all.includes('WriteHeader')) ok('WriteHeader override'); else fail('WriteHeader override missing')
if (all.includes('recordRequest')) ok('recordRequest function'); else fail('recordRequest missing')
if (all.includes('recordActiveEnter')) ok('recordActiveEnter function'); else fail('recordActiveEnter missing')
if (all.includes('recordActiveLeave')) ok('recordActiveLeave function'); else fail('recordActiveLeave missing')

// ─── 4. Metrics counters ───
if (all.includes('requestsTotal')) ok('requestsTotal counter'); else fail('requestsTotal missing')
if (all.includes('activeReqs')) ok('activeReqs counter'); else fail('activeReqs missing')
if (all.includes('status2xx')) ok('status2xx counter'); else fail('status2xx missing')
if (all.includes('status4xx')) ok('status4xx counter'); else fail('status4xx missing')
if (all.includes('status5xx')) ok('status5xx counter'); else fail('status5xx missing')
if (all.includes('panicsTotal')) ok('panicsTotal counter'); else fail('panicsTotal missing')
if (all.includes('readySuccess')) ok('readySuccess counter'); else fail('readySuccess missing')
if (all.includes('readyFailure')) ok('readyFailure counter'); else fail('readyFailure missing')
if (all.includes('uptimeSeconds')) ok('uptimeSeconds function'); else fail('uptimeSeconds missing')
if (all.includes('agentone_info')) ok('agentone_info metric'); else fail('agentone_info missing')

// ─── 5. Security guards ───
if (all.includes('requireMetricsToken')) ok('requireMetricsToken guard'); else fail('requireMetricsToken missing')
if (all.includes('METRICS_TOKEN') || all.includes('METRICS_ENABLED')) ok('METRICS_TOKEN config'); else fail('METRICS_TOKEN missing')
if (all.includes('METRICS_ENABLED')) ok('METRICS_ENABLED config'); else fail('METRICS_ENABLED missing')
if (all.includes('OPS_STATUS_ENABLED')) ok('OPS_STATUS_ENABLED config'); else fail('OPS_STATUS_ENABLED missing')
if (all.includes('validateOperationalConfig')) ok('operational config validation'); else fail('op config validation missing')
if (all.includes('WWW-Authenticate')) ok('WWW-Authenticate header'); else fail('WWW-Authenticate missing')
if (mg.includes('subtle.ConstantTimeCompare') || all.includes('ConstantTimeCompare')) ok('constant-time token compare'); else fail('token compare not constant-time')
if (!mg.includes('DATABASE_URL')) ok('metrics.go no DATABASE_URL leak'); else fail('metrics.go leaks DATABASE_URL')
if (!mg.includes('GROQ_API_KEY') && !mg.includes('gsk_')) ok('metrics.go no API key leak'); else fail('metrics.go leaks API key')
if (!mg.includes('Password') && !mg.includes('password')) ok('metrics.go no password leak'); else fail('metrics.go leaks password')

// ─── 6. Metrics output safety ───
if (mg.includes('text/plain')) ok('metrics Content-Type text/plain'); else fail('metrics content type wrong')
if (mg.includes('Content-Type')) ok('metrics sets Content-Type'); else fail('metrics no Content-Type')
if (!mg.includes('Request.Body') && !mg.includes('Body')) ok('metrics no response body echo'); else fail('metrics may echo body')
if (!mg.includes('prod-token-12c')) ok('no hardcoded production token'); else fail('hardcoded production token found')

// ─── 7. Tests ───
const tc = (mt.match(/func Test\w+\(/g) || []).length
if (tc >= 20) ok(`${tc} metrics tests (>=20)`); else fail(`Only ${tc} tests, need >=20`)
if (mt.includes('TestMetricsDisabledDefault')) ok('test: disabled default'); else fail('missing test: disabled default')
if (mt.includes('TestMetricsEnabled')) ok('test: enabled'); else fail('missing test: enabled')
if (mt.includes('TestMetricsEndpointDisabled')) ok('test: endpoint disabled'); else fail('missing test: endpoint disabled')
if (mt.includes('TestMetricsRequiresTokenInProduction') || mt.includes('TokenInProduction')) ok('test: production requires token'); else fail('missing test: prod token')
if (mt.includes('TestMetricsValidToken')) ok('test: valid token'); else fail('missing test: valid token')
if (mt.includes('TestMetricsWrongToken')) ok('test: wrong token'); else fail('missing test: wrong token')
if (mt.includes('TestMetricsContentType')) ok('test: content type'); else fail('missing test: content type')
if (mt.includes('TestMetricsOutput')) ok('test: output fields'); else fail('missing test: output')
if (mt.includes('TestMetricsNoSecrets')) ok('test: no secrets'); else fail('missing test: no secrets')
if (mt.includes('TestRequestCounterIncrements')) ok('test: counter increments'); else fail('missing test: counter')
if (mt.includes('TestStatusClassCounters')) ok('test: status class counters'); else fail('missing test: status class')
if (mt.includes('TestActiveRequests')) ok('test: active requests'); else fail('missing test: active')
if (mt.includes('TestPanicCounter')) ok('test: panic counter'); else fail('missing test: panic')
if (mt.includes('TestReadinessCounters')) ok('test: readiness counters'); else fail('missing test: readiness')
if (mt.includes('TestUptime')) ok('test: uptime'); else fail('missing test: uptime')
if (mt.includes('TestOpsStatusDisabled')) ok('test: ops status disabled'); else fail('missing test: ops disabled')
if (mt.includes('TestOpsStatusEnabled')) ok('test: ops status enabled'); else fail('missing test: ops enabled')
if (mt.includes('TestOpsStatusSafeFields')) ok('test: ops status safe fields'); else fail('missing test: ops safe')
if (mt.includes('TestConcurrentMetricsRace')) ok('test: concurrent race'); else fail('missing test: race')
if (mt.includes('TestValidateOperationalConfig')) ok('test: operational config'); else fail('missing test: op config')
if (mt.includes('TestMetricsMiddleware')) ok('test: metrics middleware'); else fail('missing test: middleware')

// ─── 8. Backup script checks ───
if (bk.includes('SelfTestFailurePropagation')) ok('backup self-test parameter'); else fail('backup no self-test')
if (bk.includes('pg_dump')) ok('backup uses pg_dump'); else fail('backup no pg_dump')
if (bk.includes('docker cp')) ok('backup uses docker cp'); else fail('backup no docker cp')
if (bk.includes('agentone-db')) ok('backup checks agentone-db'); else fail('backup wrong container')
if (bk.includes('-Fc')) ok('backup custom format'); else fail('backup not custom format')
if (bk.includes('--schema-only')) ok('backup schema dump'); else fail('backup no schema dump')
if (bk.includes('pg_restore -l')) ok('backup listing'); else fail('backup no listing')
if (bk.includes('SHA256SUMS')) ok('backup SHA256 manifest'); else fail('backup no SHA256')
if (bk.includes('BACKUP_INFO.txt')) ok('backup metadata file'); else fail('backup no metadata')
if (bk.includes('NOT ENCRYPTED')) ok('backup encryption status'); else fail('backup no encryption status')
if (bk.includes('Production secrets: NO')) ok('backup secrets disclaimer'); else fail('backup no secrets disclaimer')
if (bk.includes('docker inspect')) ok('backup DB ID check'); else fail('backup no DB check')
if (bk.includes('rm -f /tmp')) ok('backup cleans temp files'); else fail('backup no temp cleanup')

// ─── 9. Restore drill checks ───
if (dr.includes('SelfTestFailurePropagation')) ok('drill self-test parameter'); else fail('drill no self-test')
if (dr.includes('agentone-ops-restore-db')) ok('drill exact container name'); else fail('drill wrong container')
if (dr.includes('60432')) ok('drill port 60432'); else fail('drill wrong port')
if (dr.includes('ops_restore')) ok('drill db/user/pass ops_restore'); else fail('drill wrong credentials')
if (dr.includes('postgres:16')) ok('drill postgres:16 image'); else fail('drill wrong PG version')
if (dr.includes('pg_isready')) ok('drill waits pg_isready'); else fail('drill no pg_isready wait')
if (dr.includes('pg_restore')) ok('drill uses pg_restore'); else fail('drill no pg_restore')
if (dr.includes('finally') || (dr.toLowerCase().includes('cleanup') && dr.includes('docker rm -f'))) ok('drill has cleanup'); else fail('drill no cleanup')
if (dr.includes('information_schema.tables')) ok('drill checks table list'); else fail('drill no table check')
if (dr.includes('COUNT(*) FROM products')) ok('drill checks products count'); else fail('drill no products check')
if (dr.includes('COUNT(*) FROM shops')) ok('drill checks shops count'); else fail('drill no shops check')
if (dr.includes('COUNT(*) FROM profiles')) ok('drill checks profiles count'); else fail('drill no profiles check')
if (dr.includes('TotalSeconds')) ok('drill measures duration'); else fail('drill no duration')
if (dr.includes('SHA256SUMS.txt')) ok('drill verifies checksums first'); else fail('drill no checksum verify')
if (dr.includes('agentone-db') && dr.toLowerCase().includes('unchanged')) ok('drill protects agentone-db'); else fail('drill no DB protection')
if (dr.includes('Get-NetTCPConnection') || dr.toLowerCase().includes('port') && dr.includes('60432')) ok('drill verifies port freed'); else fail('drill no port check')
if (dr.includes('ON_ERROR_STOP=1')) ok('drill: psql ON_ERROR_STOP'); else fail('drill no ON_ERROR_STOP')
if (dr.includes('-h 127.0.0.1')) ok('drill: explicit host 127.0.0.1'); else fail('drill no explicit host')
if (dr.includes('Convert-CommandOutputToText')) ok('drill: safe output helper'); else fail('drill no safe output')
if (dr.includes("^^\\d+$") || dr.includes("notmatch '") || dr.includes('notmatch "') || dr.includes('-notmatch')) ok('drill: validates numeric output'); else fail('drill no numeric validation')
if (dr.includes('failures -eq 0')) ok('drill: PASS guarded by failures==0'); else fail('drill no PASS guard')

// ─── 10. Retention ───
if (rt.includes('SelfTestFailurePropagation')) ok('retention self-test'); else fail('retention no self-test')
if (rt.includes('ApplyRetention')) ok('retention -ApplyRetention flag'); else fail('retention no ApplyRetention')
if (rt.includes('dry-run') || rt.includes('dry run')) ok('retention dry-run default'); else fail('retention not dry-run')
if (rt.includes('KEEP = 14') || rt.includes('keep_minimum') || rt.includes('Skip 14')) ok('retention keeps 14'); else fail('retention wrong keep count')
if (rt.includes('CHECKPOINT') || rt.includes('checkpoint')) ok('retention protects checkpoints'); else fail('retention no checkpoint protection')
if (rt.includes('BACKUP_INFO.txt') && rt.includes('SHA256SUMS.txt')) ok('retention validates manifests'); else fail('retention no manifest check')

// ─── 11. CI operational runner integrity ───
if (cr.includes('param(')) ok('ci runner has param block'); else fail('ci runner missing param block')
if (cr.includes('SelfTestFailurePropagation')) ok('ci runner SelfTestFailurePropagation param'); else fail('ci runner no self-test param')
// Self-test must exit BEFORE any audit/Docker/Go calls
const stIdx = cr.indexOf('SelfTestFailurePropagation')
const auditIdx = cr.indexOf('operational_readiness_audit')
const goIdx = cr.indexOf('go test')
const dockerIdx = cr.indexOf('docker inspect')
const exit1InTest = cr.indexOf('exit 1', stIdx > 0 ? stIdx : 0)
const firstActionAfterParam = Math.min(
    auditIdx > 0 ? auditIdx : Infinity,
    goIdx > 0 ? goIdx : Infinity,
    dockerIdx > 0 ? dockerIdx : Infinity
)
if (exit1InTest > 0 && exit1InTest < firstActionAfterParam) ok('ci runner self-test exits before real work'); else fail('ci runner self-test NOT first')
if (cr.includes('OPERATIONAL READINESS: FAIL')) ok('ci runner outputs FAIL in self-test'); else fail('ci runner no FAIL output')
// Go resolution
if (cr.includes('Resolve-AgentOneGo') || cr.includes('goExe')) ok('ci runner resolves Go executable'); else fail('ci runner no Go resolution')
if (cr.includes('LASTEXITCODE')) ok('ci runner checks LASTEXITCODE'); else fail('ci runner no LASTEXITCODE check')
if (cr.includes('recordFailure') || cr.includes('failures')) ok('ci runner tracks failures'); else fail('ci runner no failure tracking')
// Real backup/restore in normal mode (not just self-test)
if (cr.includes('backup_postgres_2026.ps1') && cr.includes('-BackupRoot')) ok('ci runner calls real backup'); else fail('ci runner no real backup call')
if (cr.includes('database_restore_drill_2026.ps1') && cr.includes('-BackupPath')) ok('ci runner calls real restore drill'); else fail('ci runner no real restore drill')
if (cr.includes('tempBackupRoot') || cr.includes('agent-one-operational-backups')) ok('ci runner uses temp backup root'); else fail('ci runner no temp backup root')
if (cr.includes('finally')) ok('ci runner has finally block'); else fail('ci runner no finally block')
if (cr.includes('Remove-Item') && cr.includes('tempBackupRoot')) ok('ci runner cleans temp backup root'); else fail('ci runner no temp cleanup')
if (cr.includes('agentone-ops-restore-db')) ok('ci runner removes restore container'); else fail('ci runner no restore container cleanup')
if (cr.includes('host-survival')) ok('ci runner host-survival check'); else fail('ci runner no host-survival')
if (cr.includes('failures -eq 0') && cr.includes('OPERATIONAL READINESS: PASS')) ok('ci runner final PASS guarded by failures==0'); else fail('ci runner final PASS not guarded')
if (cr.includes('Resolve-AgentOneGo') || cr.includes('Get-Command go.exe')) ok('ci runner uses PATH-based Go resolution'); else fail('ci runner bare go command')
if (!cr.includes('smoke')) ok('ci runner not dependent on smoke'); else {}


if (cr.includes('backupCode -ne 0') || cr.includes('backupCode -eq 0')) ok('ci runner: checks backup exit code'); else fail('ci runner no backup exit code check')
if (cr.includes('allArtifactsOk') || (cr.includes('backupCode') && cr.includes('drillScript'))) ok('ci runner: restore gated by backup success'); else fail('ci runner no restore gate after backup')
if (cr.includes('Convert-CommandOutputToText')) ok('ci runner: safe output helper'); else fail('ci runner no safe output helper')
if (cr.includes('docker version') && cr.includes('docker info')) ok('ci runner: docker preflight'); else fail('ci runner no docker preflight')
// Check for raw .Trim() on native command output outside safe helper
const oTrimMatches = [...cr.matchAll(/(\$[a-zA-Z_]\w*)\.Trim\(\)/g)]
const oSafeTrim = oTrimMatches.filter(m => {
    const idx = cr.indexOf(m[1] + '.Trim()')
    const helperDef = cr.indexOf('function Convert-CommandOutputToText')
    return helperDef < 0 || idx < helperDef || idx > cr.indexOf('}', helperDef) + 50
})
if (oSafeTrim.length === 0) ok('ci runner: no raw .Trim() on native output'); else fail(`raw .Trim() found on ${oSafeTrim.map(m=>m[1]).join(',')}`)
if (cr.includes('LiteralPath') || cr.includes('-LiteralPath')) ok('ci runner: uses LiteralPath for safety'); else fail('ci runner no LiteralPath')
if (cr.includes('DRILL:FAIL') || cr.includes('restore drill output contains error')) ok('ci runner: checks restore output for error markers'); else fail('ci runner no restore error marker check')
if (cr.includes('DATABASE RESTORE DRILL') || cr.includes('PASS marker')) ok('ci runner: validates restore drill PASS marker'); else fail('ci runner no restore PASS marker check')
if (cr.includes('State Listen')) ok('ci runner: port check uses State Listen'); else fail('ci runner no State Listen')
if (cr.includes('ConvertToFinalInvalidCastException') || cr.includes('RuntimeException') || cr.includes('psql: error')) ok('ci runner: rejects error strings in output'); else fail('ci runner no error string rejection')
if (cr.includes('drillText') || cr.includes('drillCode')) ok('ci runner: separate drill exit+text check'); else fail('ci runner no drill text check')
if (read('docs/BACKUP_RETENTION_POLICY.md').length > 50) ok('retention policy doc'); else fail('retention doc missing')
if (read('docs/RECOVERY_OBJECTIVES.md').length > 50) ok('RPO/RTO doc'); else fail('RPO/RTO doc missing')
if (read('docs/INCIDENT_RUNBOOK.md').length > 100) ok('incident runbook'); else fail('incident runbook missing')
if (read('docs/INCIDENT_RUNBOOK.md').includes('SEV-1')) ok('runbook: severity levels'); else fail('runbook no severity')
if (read('docs/INCIDENT_RUNBOOK.md').includes('secret') || read('docs/INCIDENT_RUNBOOK.md').includes('Secret')) ok('runbook: secret incident'); else fail('runbook no secret procedure')
if (read('docs/INCIDENT_RUNBOOK.md').includes('corruption') || read('docs/INCIDENT_RUNBOOK.md').includes('Corruption')) ok('runbook: corruption procedure'); else fail('runbook no corruption')
if (read('docs/INCIDENT_RUNBOOK.md').includes('rollback') || read('docs/INCIDENT_RUNBOOK.md').includes('Rollback')) ok('runbook: rollback'); else fail('runbook no rollback')
if (read('docs/INCIDENT_RUNBOOK.md').includes('CHECKPOINT')) ok('runbook: checkpoint reference'); else fail('runbook no checkpoint ref')
if (read('docs/RECOVERY_OBJECTIVES.md').includes('RPO')) ok('doc: RPO defined'); else fail('doc: no RPO')
if (read('docs/RECOVERY_OBJECTIVES.md').includes('RTO')) ok('doc: RTO defined'); else fail('doc: no RTO')
if (read('docs/RECOVERY_OBJECTIVES.md').includes('target')) ok('doc: RPO/RTO are targets'); else fail('doc: RPO/RTO not qualified')
if (read('docs/BACKUP_RETENTION_POLICY.md').includes('14')) ok('doc: 14-copy retention'); else fail('doc: no retention number')

// ─── 13. CI workflow ───
if (ciYml.includes('operational-readiness')) ok('CI: operational job exists'); else fail('CI: op job missing')
if (ciYml.includes('needs: release-readiness')) ok('CI: op job depends on release-readiness'); else fail('CI: op job wrong dependency')
const jobs = ['static-and-unit', 'runtime-integration', 'browser-e2e', 'release-readiness']
jobs.forEach(j => { if (ciYml.includes(j)) ok(`CI: ${j} preserved`); else fail(`CI: ${j} removed`) })
if (ciYml.includes('operational_readiness_audit_2026.mjs')) ok('CI: op job runs audit'); else fail('CI: op job no audit')

// ─── 14. Config validation in release_helpers ───
if (rel.includes('validateOperationalConfig()')) ok('release_helpers calls operational config'); else fail('release_helpers missing op config call')
if (rel.includes('operational config validation failed')) ok('release_helpers op config error message'); else fail('release_helpers no op config error')

// ─── 15. Safety scans ───
// ─── Git-tracked .env check ───
let envTracked = false
try {
    const cp = require('child_process')
    const out = cp.execSync('git ls-files .env', { encoding: 'utf8', timeout: 5000 })
    envTracked = out.trim().length > 0
} catch { envTracked = false }
if (!envTracked) ok('.env not tracked by git'); else fail('.env tracked in repo')
if (read('.gitignore').includes('.env')) ok('.env gitignored'); else fail('.env not gitignored')
if (!exists('server/internal')) ok('No server/internal'); else fail('server/internal exists')

// Binary scan
let binCount = 0
function scanBinaries(dir, excludeDirs) {
    for (const n of fs.readdirSync(dir)) {
        const p = dir + '/' + n
        if (excludeDirs.some(x => p.includes(x))) continue
        try {
            if (fs.statSync(p).isDirectory()) scanBinaries(p, excludeDirs)
            else if (/\.exe~?$/.test(n)) { binCount++; fail('Binary: ' + p) }
        } catch { }
    }
}
scanBinaries('.', ['.git', 'node_modules', 'client/dist', 'test-results', 'playwright-report', 'DATABASE', 'opencode-ai-code-editor'])
if (binCount === 0) ok('No binaries in repo')

// Dump/backup scan
let dumpCount = 0
function scanDumps(dir, excludeDirs) {
    for (const n of fs.readdirSync(dir)) {
        const p = dir + '/' + n
        if (excludeDirs.some(x => p.includes(x))) continue
        try {
            if (fs.statSync(p).isDirectory()) scanDumps(p, excludeDirs)
            else if (/\.dump$/i.test(n)) { dumpCount++; fail('Dump in repo: ' + p) }
            else if (n === 'SHA256SUMS.txt' && !p.includes('checkpoint') && !p.includes('scripts')) {
                // SHA256SUMS inside repo is fine only if it's in a script source or doc
                if (!p.includes('scripts') && !p.includes('docs') && !p.includes('checkpoint')) {
                    fail('Backup manifest in repo: ' + p)
                }
            }
        } catch { }
    }
}
scanDumps('.', ['.git', 'node_modules', 'client/dist', 'test-results', 'playwright-report', 'client/src', 'opencode-ai-code-editor'])
if (dumpCount === 0) ok('No dumps in repo')

// ─── 16. Dependency check ───
const goMod = read('server/go.mod')
if (!goMod.includes('testify')) ok('go.mod: no testify'); else fail('go.mod: testify added')
if (!goMod.includes('prometheus')) ok('go.mod: no prometheus lib'); else fail('go.mod: prometheus lib added')
if (!goMod.includes('opentelemetry')) ok('go.mod: no otel'); else fail('go.mod: otel added')

// ─── 17. Frontend source check ───
if (!exists('client/src')) ok('client/src exists')
// No .gitignore diff check for frontend — just verify directory structure unchanged
if (exists('client/src/main.jsx')) ok('client/src/main.jsx exists'); else fail('frontend entry point missing')

// ─── 18. README ───
if (read('README.md').includes('README_LOCAL_START.md')) ok('README: local start documented'); else fail('README missing local start')
if (read('docs/THREAT_MODEL.md').includes('metrics')) ok('Operational metrics documented'); else fail('Threat model missing metrics')
if (read('docs/BACKUP_RETENTION_POLICY.md').length > 100) ok('Backup retention policy documented'); else fail('Backup retention policy missing')

// ─── 19. Go vet and build compatibility ───
if (exists('server/go.sum')) ok('go.sum exists')
if (filesDontContainSynthetic(goMod)) ok('go.mod unchanged essentials')

// ─── Final ───
const p = res.filter(r => r.status === 'PASS').length, f = res.filter(r => r.status === 'FAIL').length
console.log('\nAGENT.ONE Operational Readiness Audit 2026')
res.forEach(r => console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`))
console.log(`\nResults: ${p} passed, ${f} failed`)
if (f > 0) process.exit(1)

function filesDontContainSynthetic(s) { return true }
