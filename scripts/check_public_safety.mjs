// Inspect committed files without printing credential values to CI logs.
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const files = execFileSync('git', ['ls-files', '-z'], {encoding:'utf8'}).split('\0').filter(Boolean)
const problems = []
const isText = /\.(?:md|mdc|txt|json|ya?ml|[cm]?js|jsx|ts|tsx|go|sh|ps1|css|html|xml|toml|ini|conf|sql|example|gitignore|dockerignore|gitattributes|mod|sum|svg)$|^(?:\.env.*|Dockerfile|Makefile)$/i
const checks = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['github-token', /\b(?:ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[A-Za-z0-9_]{25,}\b/g],
  ['openai-key', /\bsk-(?:proj-|svcacct-|admin-)[A-Za-z0-9_-]{28,}\b/g],
  ['groq-key', /\bgsk_[A-Za-z0-9_-]{28,}\b/g],
  ['openrouter-key', /\bsk-or-v1-[A-Fa-f0-9]{40,}\b/g],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ['aws-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['personal-windows-path', /[A-Za-z]:\\Users\\[^\\\r\n"' ]+\\/g],
  ['root-ssh-path', /\/root\/\.ssh\//g],
]
for (const path of files) {
  if (/(?:^|\/)\.env(?:$|\.(?!example$|.*\.example$))/i.test(path) && !path.endsWith('.env.example')) problems.push(path+': tracked environment file')
  if (!isText.test(path)) continue
  const bytes=readFileSync(path)
  if (bytes.includes(0)) continue
  const text=bytes.toString('utf8')
  for (const [label,re] of checks) {
    re.lastIndex=0
    for(const m of text.matchAll(re)) {
      const line=text.slice(0,m.index).split('\n').length
      problems.push(path+':'+line+': '+label)
    }
  }
}
const env='.env.production.example'
if(files.includes(env)) {
  const seen=new Set()
  readFileSync(env,'utf8').split('\n').forEach((line,i)=>{
    const m=/^([A-Z][A-Z0-9_]*)=/.exec(line)
    if(!m)return
    if(seen.has(m[1])) problems.push(env+':'+(i+1)+': duplicate key '+m[1])
    seen.add(m[1])
  })
}
if(problems.length) {
  console.error('Public repository safety scan FAILED. Values intentionally omitted:')
  problems.forEach(item=>console.error('  '+item))
  process.exitCode=1
} else console.log('Public repository safety scan passed: '+files.length+' tracked files')
