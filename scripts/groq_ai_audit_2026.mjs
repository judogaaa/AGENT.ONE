import fs from 'fs';
import path from 'path';

const BASE = 'http://localhost:8080';
const results = [];

function ok(label) { results.push({ label, status: 'PASS' }); }
function fail(label, detail) { results.push({ label, status: 'FAIL', detail }); }
function skip(label, detail) { results.push({ label, status: 'SKIP', detail }); }

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text };
}

function unwrap(r) {
  if (r.data && r.data.ok === true && r.data.data !== undefined) return r.data.data;
  return r.data;
}

async function signin(email, password) {
  const r = await api('POST', '/api/auth/signin', { email, password });
  const d = unwrap(r);
  return d?.token || null;
}

function walk(dir, exts) {
  const out = [];
  for (const x of fs.readdirSync(dir)) {
    const p = path.join(dir, x);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some(e => p.endsWith(e))) out.push(p);
  }
  return out;
}

// Security scan
const forbiddenFrontend = ['GROQ_API_KEY', 'gsk_', 'api.groq.com', 'VITE_GROQ'];
const clientFiles = walk('client/src', ['.js', '.jsx', '.ts', '.tsx', '.css', '.html']);
let frontendHits = 0;
for (const f of clientFiles) {
  const c = fs.readFileSync(f, 'utf8');
  for (const term of forbiddenFrontend) {
    if (c.includes(term)) {
      frontendHits++;
      fail(`Frontend leak: ${term} in ${f}`);
    }
  }
}
if (frontendHits === 0) ok('No GROQ key/api.groq.com in client/src');

const distFiles = walk('client/dist', ['.js', '.css', '.html']);
let distHits = 0;
for (const f of distFiles) {
  const c = fs.readFileSync(f, 'utf8');
  for (const term of forbiddenFrontend) {
    if (c.includes(term)) {
      distHits++;
      fail(`Bundle leak: ${term} in ${f}`);
    }
  }
}
if (distHits === 0) ok('No GROQ key/api.groq.com in client/dist');

// Server code allowed to contain api.groq.com
const serverFiles = walk('server/cmd', ['.go']);
let serverGroqFound = false;
for (const f of serverFiles) {
  const c = fs.readFileSync(f, 'utf8');
  if (c.includes('api.groq.com')) serverGroqFound = true;
}
if (serverGroqFound) ok('api.groq.com present only in server code');
else fail('api.groq.com not found in server code');

// Health
const health = await api('GET', '/api/health');
if (health.status === 200 && health.data?.data?.status === 'ok') ok('Health endpoint');
else fail('Health endpoint', health.text);

const healthData = unwrap(health);
const groqConfigured = healthData?.ai === true;

// Auth guards
const guestAssistant = await api('POST', '/api/assistant/chat', { message: 'hi' });
if (guestAssistant.status === 401) ok('Assistant guest → 401');
else fail('Assistant guest guard', guestAssistant.status);

const guestAIManager = await api('POST', '/api/ai-manager/chat', { shopSlug: 'test-shop', message: 'hi' });
if (guestAIManager.status === 401) ok('AI Manager guest → 401');
else fail('AI Manager guest guard', guestAIManager.status);

const bizToken = await signin('demo@agentone.ru', 'demo123');
const cliToken = await signin('client@agentone.ru', 'client123');

if (!bizToken) fail('Business login');
if (!cliToken) fail('Client login');

const bizAssistant = await api('POST', '/api/assistant/chat', { message: 'hi' }, bizToken);
if (bizAssistant.status === 403) ok('Assistant business → 403');
else fail('Assistant business guard', bizAssistant.status);

const cliCopilot = await api('POST', '/api/business/copilot/reply', { message: 'hi' }, cliToken);
if (cliCopilot.status === 403) ok('Copilot client → 403');
else fail('Copilot client guard', cliCopilot.status);

// Business copilot
if (bizToken) {
  const copilot = await api('POST', '/api/business/copilot/reply', { message: 'Сколько стоит ваш самый популярный товар?', style: 'professional', channel: 'site', scenario: 'auto' }, bizToken);
  const copilotData = unwrap(copilot);
  if (copilot.status === 200 && copilotData?.reply) {
    ok('Business copilot reply');
    const r = copilotData.reply.toLowerCase();
    if (r.includes('бесплатная доставка') || r.includes('гарантия') || r.includes('скидка')) {
      fail('Copilot invented business promise', copilotData.reply.slice(0, 200));
    } else {
      ok('Copilot no invented promises');
    }
  } else {
    fail('Business copilot reply', copilot.text);
  }
}

// AI Manager settings persistence with new fields
if (bizToken) {
  const payload = {
    aiGreeting: 'Здравствуйте! Я AI-менеджер магазина Test. Помогу с выбором.',
    aiTone: 'friendly',
    aiStylePrompt: 'Обращайся на "вы", будь вежлив.',
    aiForbiddenClaims: 'Не обещать бесплатную доставку.',
    aiPreferredCTA: 'Оставьте заявку — продавец уточнит детали.',
  };
  const save = await api('PUT', '/api/business/ai-manager/settings', payload, bizToken);
  if (save.status === 200) ok('AI Manager settings save new fields');
  else fail('AI Manager settings save', save.text);

  const get = await api('GET', '/api/business/ai-manager/settings', null, bizToken);
  const settingsData = unwrap(get);
  const s = settingsData?.settings;
  if (s && s.aiGreeting === payload.aiGreeting && s.aiTone === payload.aiTone && s.aiStylePrompt === payload.aiStylePrompt) {
    ok('AI Manager settings persistence');
  } else {
    fail('AI Manager settings persistence', JSON.stringify({ expected: payload.aiGreeting, got: s?.aiGreeting }));
  }
}

// Assistant chat
if (cliToken) {
  const assistant = await api('POST', '/api/assistant/chat', { message: 'Нужен ноутбук до 50000', context: { compareIds: [], lastProductIds: [] } }, cliToken);
  const assistantData = unwrap(assistant);
  if (assistant.status === 200 && assistantData?.reply) {
    ok('Assistant chat reply');
  } else {
    fail('Assistant chat reply', assistant.text);
  }
}

// AI Manager chat with shop context
if (cliToken) {
  const shopSlug = 'technomarket';
  const shop = await api('GET', '/api/shop/' + shopSlug);
  const shopData = unwrap(shop);
  const firstProduct = shopData?.products?.[0];
  const body = { shopSlug, message: 'Привет', productId: firstProduct?.id || '', source: 'shop_page' };
  const chat = await api('POST', '/api/ai-manager/chat', body, cliToken);
  const chatData = unwrap(chat);
  if (chat.status === 200 && chatData?.message) {
    ok('AI Manager chat reply');
  } else {
    fail('AI Manager chat reply', chat.text);
  }

  const chat2 = await api('POST', '/api/ai-manager/chat', { shopSlug, message: 'Расскажи про гарантию', productId: firstProduct?.id || '' }, cliToken);
  const chat2Data = unwrap(chat2);
  if (chat2.status === 200 && chat2Data?.message) {
    const m = chat2Data.message.toLowerCase();
    if (m.includes('этои информации нет')) ok('AI Manager safe fallback on missing warranty');
    else if (m.includes('гарантия')) fail('AI Manager invented warranty', chat2Data.message.slice(0, 200));
    else ok('AI Manager warranty answer');
  } else {
    fail('AI Manager warranty question', chat2.text);
  }
}

// Fallback behavior: if key disabled simulation is not possible live, at least verify provider logic is present
if (!groqConfigured) {
  skip('Groq live test', 'GROQ_API_KEY not configured on server');
} else {
  ok('Groq configured on server (health ai=true)');
}

// Final summary
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
const skipped = results.filter(r => r.status === 'SKIP').length;
console.log('\nAGENT.ONE Groq AI Audit 2026');
console.log('Backend:', BASE);
console.log('');
for (const r of results) {
  const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
  console.log(`  ${icon} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(`\nResults: ${passed} passed, ${failed} failed, ${skipped} skipped`);
if (failed > 0) process.exit(1);
