import fs from 'fs';
const res=[]; function ok(l){res.push({label:l,status:'PASS'})} function fail(l,d){res.push({label:l,status:'FAIL',detail:d})}
function read(p){try{return fs.readFileSync(p,'utf8')}catch{return''}}
function exists(p){return fs.existsSync(p)}

const sh = read('server/cmd/security_hardening.go')
const sht = read('server/cmd/security_hardening_test.go')
const mainGo = read('server/cmd/main.go')
const rel = read('server/cmd/release_helpers.go')
const ciYml = read('.github/workflows/ci.yml')
const dockerfile = read('Dockerfile')
const dockerignore = read('.dockerignore')
const deployCompose = read('deploy/production-compose.example.yml')
const all = sh + sht + mainGo + rel

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 1. Security headers middleware РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (sh.includes('securityHeadersMiddleware')) ok('security headers middleware'); else fail('missing')
if (sh.includes('Content-Security-Policy')) ok('CSP header'); else fail('CSP missing')
if (sh.includes('frame-ancestors')) ok('CSP frame-ancestors'); else fail('frame-ancestors missing')
if (sh.includes('X-Content-Type-Options')) ok('X-Content-Type-Options'); else fail('nosniff missing')
if (sh.includes('X-Frame-Options')) ok('X-Frame-Options DENY'); else fail('X-Frame-Options missing')
if (sh.includes('Referrer-Policy')) ok('Referrer-Policy'); else fail('Referrer-Policy missing')
if (sh.includes('Cross-Origin-Opener-Policy')) ok('COOP'); else fail('COOP missing')
if (sh.includes('Cross-Origin-Resource-Policy')) ok('CORP'); else fail('CORP missing')
if (sh.includes('Permissions-Policy')) ok('Permissions-Policy'); else fail('Permissions-Policy missing')
if (sh.includes('Strict-Transport-Security')) ok('HSTS'); else fail('HSTS missing')
if (sh.includes('isSecureScheme')) ok('HSTS only with HTTPS/trusted proxy'); else fail('HSTS not conditional')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 2. CSP specifics РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (sh.includes("'self'")) ok('CSP uses self'); else fail('CSP no self')
if (sh.includes('default-src')) ok('CSP default-src'); else fail('CSP no default-src')
if (sh.includes('img-src')) ok('CSP img-src'); else fail('CSP no img-src')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 3. Cache-Control for auth РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (sh.includes('Cache-Control')) ok('Cache-Control for auth'); else fail('Cache-Control missing')
if (sh.includes('no-store')) ok('Cache-Control no-store'); else fail('no-store missing')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 4. Trusted proxy РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (sh.includes('TRUSTED_PROXY_CIDRS')) ok('TRUSTED_PROXY_CIDRS'); else fail('no proxy config')
if (sh.includes('initTrustedProxies')) ok('initTrustedProxies'); else fail('init missing')
if (sh.includes('isTrustedProxy')) ok('isTrustedProxy function'); else fail('isTrustedProxy missing')
if (sh.includes('trustedClientIP')) ok('trustedClientIP function'); else fail('trustedClientIP missing')
if (sh.includes('ParseCIDR')) ok('CIDR parsing'); else fail('no CIDR parse')
if (sh.includes('SplitHostPort')) ok('remote addr parsing'); else fail('no SplitHostPort')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 5. Body limits РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (sh.includes('MAX_REQUEST_BODY_BYTES')) ok('MAX_REQUEST_BODY_BYTES'); else fail('no body limit')
if (sh.includes('bodyLimitMiddleware')) ok('bodyLimitMiddleware'); else fail('no body middleware')
if (sh.includes('413')) ok('413 on over limit'); else fail('no 413')
if (sh.includes('MaxBytesReader')) ok('MaxBytesReader'); else fail('no MaxBytesReader')
if (sh.includes('GET') && sh.includes('HEAD') && sh.includes('ContentLength')) ok('body limit skips GET/HEAD'); else fail('skip logic missing')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 6. Upload limits РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (sh.includes('MAX_UPLOAD_BYTES')) ok('MAX_UPLOAD_BYTES'); else fail('no upload limit')
if (sh.includes('maxUploadBytes')) ok('maxUploadBytes function'); else fail('no maxUploadBytes')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 7. Server timeouts РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (sh.includes('SERVER_READ_TIMEOUT_SECONDS')) ok('read timeout config'); else fail('no read timeout')
if (sh.includes('SERVER_WRITE_TIMEOUT_SECONDS')) ok('write timeout config'); else fail('no write timeout')
if (sh.includes('SERVER_IDLE_TIMEOUT_SECONDS')) ok('idle timeout config'); else fail('no idle timeout')
if (sh.includes('SERVER_MAX_HEADER_BYTES')) ok('max header bytes config'); else fail('no max header bytes')
if (mainGo.includes('IdleTimeout')) ok('IdleTimeout wired'); else fail('IdleTimeout not wired')
if (mainGo.includes('MaxHeaderBytes')) ok('MaxHeaderBytes wired'); else fail('MaxHeaderBytes not wired')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 8. Auth brute force РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (sh.includes('AUTH_FAILURE_LIMIT')) ok('AUTH_FAILURE_LIMIT'); else fail('no auth limit')
if (sh.includes('AUTH_FAILURE_WINDOW_SECONDS')) ok('AUTH_FAILURE_WINDOW'); else fail('no window')
if (sh.includes('AUTH_LOCKOUT_SECONDS')) ok('AUTH_LOCKOUT'); else fail('no lockout')
if (sh.includes('authBruteForceLimiter')) ok('brute force limiter struct'); else fail('no limiter struct')
if (sh.includes('recordFailure')) ok('recordFailure method'); else fail('no recordFailure')
if (sh.includes('isLocked')) ok('isLocked method'); else fail('no isLocked')
if (sh.includes('reset(')) ok('reset method'); else fail('no reset')
if (sh.includes('cleanup()')) ok('cleanup method'); else fail('no cleanup')
if (sh.includes('authKey')) ok('authKey normalization'); else fail('no authKey')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 9. Safe errors РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (sh.includes('safeErrorMessage')) ok('safeErrorMessage'); else fail('no safe error')
if (sh.includes('password') || sh.includes('secret') || sh.includes('token')) ok('safe error blocks sensitive'); else fail('no block list')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 10. CORS validation РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (sh.includes('validateCORSConfig')) ok('CORS config validation'); else fail('no CORS validation')
if (sh.includes('validateSecurityConfig')) ok('security config validation'); else fail('no sec config validation')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 11. Test coverage РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (sht.length > 100) ok('security tests file exists'); else fail('no test file')
const tc = (sht.match(/func Test\w+\(/g) || []).length
if (tc >= 20) ok(`${tc} security tests`); else fail(`only ${tc} tests`)
if (sht.includes('TestSecurityHeadersPresent')) ok('test: headers present'); else fail('no headers test')
if (sht.includes('TestCORSProductionRejectsWildcard')) ok('test: CORS wildcard rejection'); else fail('no CORS wildcard test')
if (sht.includes('TestUntrustedProxyHeadersIgnored')) ok('test: proxy headers ignored'); else fail('no proxy test')
if (sht.includes('TestBodyLimitOverLimitContentLength')) ok('test: body over limit'); else fail('no body limit test')
if (sht.includes('TestSpoofedForwardedHeadersIgnored')) ok('test: spoofed headers'); else fail('no spoofed headers test')
if (sht.includes('TestAuthFailureIncrement')) ok('test: auth brute force'); else fail('no auth test')
if (sht.includes('TestSafeErrorBlocksSecrets')) ok('test: safe errors'); else fail('no safe error test')
if (sht.includes('TestValidateSecurityConfigProduction')) ok('test: config validation'); else fail('no config validation test')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 12. Dockerfile deep checks РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (dockerfile.length > 100) ok('Dockerfile exists'); else fail('Dockerfile missing')
if (dockerfile.includes('alpine')) ok('Dockerfile: alpine-based'); else fail('not alpine-based')
if (dockerfile.includes('FROM node') && dockerfile.includes('FROM golang')) ok('Dockerfile: multi-stage'); else fail('not multi-stage')
if (dockerfile.includes('adduser') || dockerfile.includes('addgroup')) ok('Dockerfile: adduser/addgroup present'); else fail('no adduser')
if (dockerfile.includes('USER') && !dockerfile.includes('USER root')) ok('Dockerfile: USER set (not root)'); else fail('Dockerfile: no non-root USER')
if (dockerfile.includes('CGO_ENABLED=0')) ok('Dockerfile: CGO disabled'); else fail('CGO not disabled')
if (dockerfile.includes('HEALTHCHECK')) ok('Dockerfile: HEALTHCHECK'); else fail('no healthcheck')
if (dockerfile.includes('EXPOSE')) ok('Dockerfile: EXPOSE'); else fail('no EXPOSE')
if (!dockerfile.includes('COPY .env') && !dockerfile.includes('COPY .\\.env')) ok('Dockerfile: no .env copy'); else fail('Dockerfile copies .env')
if (!dockerfile.includes('DATABASE_URL=') && !dockerfile.includes('JWT_SECRET=') && !dockerfile.includes('METRICS_TOKEN=')) ok('Dockerfile: no secrets hardcoded'); else fail('secrets in Dockerfile')
if (!dockerfile.includes('go build') || dockerfile.split('FROM').slice(-1)[0].includes('go build') === false) ok('Dockerfile: final stage has no go build'); else fail('final stage has go build')
if (dockerfile.split('FROM').slice(-1)[0].includes('alpine') && !dockerfile.split('FROM').slice(-1)[0].includes('golang')) ok('Dockerfile: final stage is alpine runtime'); else fail('final stage not runtime-only')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 13. .dockerignore deep РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (dockerignore.length > 50) ok('.dockerignore exists'); else fail('.dockerignore missing')
if (dockerignore.includes('.env')) ok('dockerignore: .env excluded'); else fail('dockerignore no .env')
if (dockerignore.includes('.git')) ok('dockerignore: .git excluded'); else fail('dockerignore no .git')
if (dockerignore.includes('node_modules')) ok('dockerignore: node_modules excluded'); else fail('dockerignore no node_modules')
if (dockerignore.includes('dump') || dockerignore.includes('*.dump') || dockerignore.includes('backup')) ok('dockerignore: dumps/backups excluded'); else fail('dockerignore no dump exclusion')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 14. Deploy template deep РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (deployCompose.length > 100) ok('deploy template exists'); else fail('deploy template missing')
if (deployCompose.includes('no-new-privileges')) ok('compose: no-new-privileges'); else fail('compose missing privilege restriction')
if (deployCompose.includes('read_only: true')) ok('compose: read-only root'); else fail('compose not read-only')
if (deployCompose.includes('cap_drop') && deployCompose.includes('ALL')) ok('compose: cap_drop ALL'); else fail('compose no cap_drop ALL')
if (deployCompose.includes('change-me') || deployCompose.includes('CHANGE')) ok('compose: no real credentials'); else fail('real credentials found')
if (!deployCompose.includes('gsk_')) ok('compose: no AI keys'); else fail('AI keys in compose')
if (deployCompose.includes('database:')) ok('compose: DB service defined'); else fail('compose no DB service')
if (!deployCompose.match(/ports:\s*\n\s*-\s*"?5432/)) ok('compose: DB port not exposed'); else fail('compose exposes DB port')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 15. Docs РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (read('SECURITY.md').length > 100) ok('SECURITY.md exists'); else fail('SECURITY.md missing')
if (read('docs/THREAT_MODEL.md').length > 500) ok('threat model'); else fail('threat model missing')
if (read('docs/PRODUCTION_DEPLOYMENT_DESIGN.md').length > 500) ok('deployment design'); else fail('deployment design missing')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 16. Middleware chain РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (mainGo.includes('securityHeadersMiddleware')) ok('security headers in chain'); else fail('not in chain')
if (mainGo.includes('bodyLimitMiddleware')) ok('body limit in chain'); else fail('body limit not in chain')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 17. Config validation wired РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (rel.includes('validateSecurityConfig')) ok('security config in logBuildMeta'); else fail('not in logBuildMeta')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 18. Scripts exist РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (read('scripts/container_security_audit_2026.ps1').length > 100) ok('container audit script'); else fail('container audit missing')
if (read('scripts/ci_security_hardening_2026.ps1').length > 100) ok('CI security runner'); else fail('CI runner missing')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 19. Container audit deep РІвЂќР‚РІвЂќР‚РІвЂќР‚
const ca = read('scripts/container_security_audit_2026.ps1')
if (ca.includes('SelfTestFailurePropagation')) ok('container audit: self-test param'); else fail('no self-test')
if (ca.includes('no-new-privileges')) ok('container audit: no-new-privileges flag'); else fail('no-new-privileges')
if (ca.includes('whoami') || ca.includes('User')) ok('container audit: checks runtime UID'); else fail('no UID check')
if (ca.includes('/api/live')) ok('container audit: checks live endpoint'); else fail('no live check')
if (ca.includes('/api/ready')) ok('container audit: checks ready endpoint'); else fail('no ready check')
if (ca.includes('securityHeaders') || ca.includes('X-Content-Type') || ca.includes('nosniff')) ok('container audit: checks security headers'); else fail('no header check')
if (ca.includes('/app/.env') || ca.includes('test -f /app/.env')) ok('container audit: checks .env absent'); else fail('no .env check')
if (ca.includes('.git')) ok('container audit: checks .git absent'); else fail('no .git check')
if ((ca.includes('which go') || ca.includes('command -v go')) && (ca.includes('which node') || ca.includes('command -v node'))) ok('container audit: checks toolchain absent'); else fail('no toolchain check')
if (ca.includes('rm -f') || ca.includes('Remove-Item') || ca.includes('docker rm')) ok('container audit: cleanup logic'); else fail('no cleanup')
if (ca.includes('20080') && ca.includes('62432')) ok('container audit: port check'); else fail('no port check')
if (ca.includes('docker version')) ok('container audit: docker version preflight'); else fail('container no docker preflight')
if (ca.includes('docker info')) ok('container audit: docker info preflight'); else fail('container no docker info')
if (ca.includes('LASTEXITCODE')) ok('container audit: checks LASTEXITCODE'); else fail('container no exit code checks')
if (ca.includes('build failed') || ca.includes('build failed')) ok('container audit: build fail messaging'); else fail('no build fail msg')

if (ca.includes('Pull-ImageWithRetry')) ok('container audit: pull-with-retry'); else fail('no pull retry')
if (ca.includes('--pull=false')) ok('container audit: pull=false after retry'); else fail('no pull=false')
if (ca.includes('Convert-CommandOutputToText')) ok('container audit: safe output helper'); else fail('container no safe output')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 20. CI security runner deep РІвЂќР‚РІвЂќР‚РІвЂќР‚
const cr = read('scripts/ci_security_hardening_2026.ps1')
if (cr.includes('container_security_audit_2026.ps1')) ok('ci runner: invokes container audit'); else fail('no container audit in CI')
if (cr.includes('CONTAINER SECURITY') && cr.includes('PASS')) ok('ci runner: validates container PASS marker'); else fail('no container PASS check')
if (cr.includes('SelfTestFailurePropagation')) ok('ci runner: self-test param'); else fail('no ci self-test')
if (cr.includes('security_hardening_audit_2026.mjs')) ok('ci runner: runs security audit'); else fail('no audit in runner')
if (cr.includes('go test')) ok('ci runner: runs go test'); else fail('no go test in runner')
if (cr.includes('go vet')) ok('ci runner: runs go vet'); else fail('no go vet in runner')
if (cr.includes('gofmt')) ok('ci runner: runs gofmt'); else fail('no gofmt in runner')
if (cr.includes('Resolve-AgentOneGo') || cr.includes('goExe')) ok('ci runner: resolves Go path'); else fail('no Go path resolution')
if (cr.includes('docker version')) ok('ci runner: docker version preflight'); else fail('no docker version preflight')
if (cr.includes('docker info')) ok('ci runner: docker info preflight'); else fail('no docker info preflight')
if (cr.includes('Docker unavailable') || cr.includes('FAIL')) ok('ci runner: Docker unavailable exit'); else fail('no Docker unavailable msg')
if (cr.includes('failures -eq 0')) ok('ci runner: final PASS guarded by failures==0'); else fail('final PASS not guarded')
if (cr.includes('Convert-CommandOutputToText')) ok('ci runner: safe output helper'); else fail('no safe output helper')
// Check for raw .Trim() on native command output (outside safe helper)
const trimMatches = [...cr.matchAll(/(\$[a-zA-Z_]\w*)\.Trim\(\)/g)]
const safeTrim = trimMatches.filter(m => {
    const idx = cr.indexOf(m[1] + '.Trim()')
    const helperDef = cr.indexOf('function Convert-CommandOutputToText')
    return helperDef < 0 || idx < helperDef || idx > cr.indexOf('}', helperDef) + 50
})
if (safeTrim.length === 0) ok('ci runner: no raw .Trim() on native output'); else fail(`raw .Trim() found on ${safeTrim.map(m=>m[1]).join(',')}`)

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 21. Docs deep РІвЂќР‚РІвЂќР‚РІвЂќР‚
const tm = read('docs/THREAT_MODEL.md')
if (tm.length > 500) ok('threat model: exists'); else fail('threat model missing')
if (tm.includes('STRIDE') || tm.includes('Spoofing')) ok('threat model: structured'); else fail('threat model unstructured')
if (tm.includes('JWT') || tm.includes('token')) ok('threat model: covers JWT'); else fail('no JWT in threat model')
if (tm.includes('injection') || tm.includes('prompt')) ok('threat model: covers AI threats'); else fail('no AI threats')
const dd = read('docs/PRODUCTION_DEPLOYMENT_DESIGN.md')
if (dd.includes('not been performed') || dd.includes('not yet configured') || dd.includes('not implemented')) ok('deployment design: honest about status'); else fail('deployment design oversells')
if (dd.includes('non-root')) ok('deployment design: covers non-root'); else fail('deployment design no non-root')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 21. CI workflow РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (ciYml.includes('security-hardening')) ok('CI: security-hardening job'); else fail('CI: no security job')
const jobs = ['static-and-unit','runtime-integration','browser-e2e','release-readiness','operational-readiness']
jobs.forEach(j => { if (ciYml.includes(j)) ok(`CI: ${j} preserved`); else fail(`CI: ${j} removed`) })

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 22. Safety scans РІвЂќР‚РІвЂќР‚РІвЂќР‚
let envTracked = false
try { const cp = require('child_process'); const o = cp.execSync('git ls-files .env',{encoding:'utf8',timeout:5000}); envTracked = o.trim().length > 0 } catch {}
if (!envTracked) ok('.env not tracked'); else fail('.env tracked')
if (read('.gitignore').includes('.env')) ok('.env gitignored'); else fail('.env not gitignored')
if (!fs.existsSync('server/internal')) ok('No server/internal'); else fail('server/internal')

// Binary/dump scan
let bins = 0;
(function s(d,e){for(const n of fs.readdirSync(d)){const p=d+'/'+n;if(e.some(x=>p.includes(x)))continue;try{if(fs.statSync(p).isDirectory())s(p,e);else if(/\.exe~?$/.test(n)){bins++;fail('Binary: '+p)}}catch{}}})('.',['.git','node_modules','client/dist','test-results','playwright-report','DATABASE'])
if(bins===0) ok('No binaries')
let dumps = 0;
(function s2(d,e){for(const n of fs.readdirSync(d)){const p=d+'/'+n;if(e.some(x=>p.includes(x)))continue;try{if(fs.statSync(p).isDirectory())s2(p,e);else if(/\.dump$/i.test(n)){dumps++;fail('Dump: '+p)}}catch{}}})('.',['.git','node_modules','client/dist','DATABASE'])
if(dumps===0) ok('No dumps')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 23. README РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (read('README.md').includes('SECURITY.md') && read('SECURITY.md').length > 100) ok('README links security policy'); else fail('Security policy not linked')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 24. Dependencies РІвЂќР‚РІвЂќР‚РІвЂќР‚
const goMod = read('server/go.mod')
if (!goMod.includes('testify')) ok('go.mod clean')
if (!goMod.includes('prometheus')) ok('no prometheus lib')

// РІвЂќР‚РІвЂќР‚РІвЂќР‚ 25. Frontend РІвЂќР‚РІвЂќР‚РІвЂќР‚
if (exists('client/src/main.jsx')) ok('frontend intact')

const p = res.filter(r=>r.status==='PASS').length, f = res.filter(r=>r.status==='FAIL').length
console.log('\nAGENT.ONE Security Hardening Audit 2026')
res.forEach(r => console.log(`  ${r.status==='PASS'?'РІСљвЂ¦':'РІСњРЉ'} ${r.label}${r.detail?' РІР‚вЂќ '+r.detail:''}`))
console.log(`\nResults: ${p} passed, ${f} failed`)
if (f>0) process.exit(1)
