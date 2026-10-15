const BASE = 'http://localhost:8080';
const results = [];

function ok(label) { results.push({ label, status: 'PASS' }); }
function fail(label, detail) { results.push({ label, status: 'FAIL', detail }); }

async function api(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
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
  return unwrap(r)?.token || null;
}

// Public shop
const shop = await api('GET', '/api/shop/technomarket');
const shopData = unwrap(shop);
if (shop.status === 200 && shopData?.shop) ok('GET /api/shop/technomarket');
else fail('Shop by slug', shop.status);

const s = shopData?.shop || {};
['name','slug','description','category'].forEach(f => {
  if (s[f]) ok(`Shop has ${f}`); else fail(`Shop missing ${f}`);
});
if (s.showAiManager !== false) ok('showAiManager true');
else fail('showAiManager');

// Products
const prods = shopData?.products || [];
if (prods.length > 0) ok(`Shop has ${prods.length} products`);
else fail('No products');

// Shops list
const shops = await api('GET', '/api/shops');
const shopsData = unwrap(shops);
if ((shopsData?.shops || []).length >= 3) ok('GET /api/shops >= 3');
else fail('Shops count');

// Favorites/cart/compare for client
const cli = await signin('client@agentone.ru', 'client123');
if (!cli) fail('Client login'); else ok('Client login');

const pid = prods[0]?.id;
if (pid) {
  const addFav = await api('POST', '/api/my/favorites/' + pid, null, cli);
  if (addFav.status === 200) ok('Favorite on shop product');
  else fail('Favorite add', addFav.status);
  await api('DELETE', '/api/my/favorites/' + pid, null, cli);
}

// Guest favorite guard
const guestFav = await api('POST', '/api/my/favorites/' + (pid || 'abc'), null);
if (guestFav.status === 401) ok('Guest favorite → 401');
else fail('Guest favorite guard', guestFav.status);

// Business settings
const biz = await signin('demo@agentone.ru', 'demo123');
if (!biz) fail('Business login'); else {
  ok('Business login');
  const myShop = await api('GET', '/api/my/shop', null, biz);
  const myData = unwrap(myShop);
  if (myShop.status === 200 && myData?.shop) ok('GET /api/my/shop');
  else fail('Business my shop', myShop.status);

  // Save original shop values
  const origShop = myData?.shop || {};
  const origTagline = origShop.tagline || '';
  const origAbout = origShop.about || '';
  const origDesc = origShop.description || '';
  const origCity = origShop.city || '';
  const origShowAi = origShop.showAiManager;

  // Save original AI settings
  const origAI = await api('GET', '/api/business/ai-manager/settings', null, biz);
  const origAIData = unwrap(origAI)?.settings || {};

  // Update tagline
  const update = await api('PUT', '/api/my/shop', { tagline: 'Audit test tagline' }, biz);
  if (update.status === 200) ok('PUT /api/my/shop tagline');
  else fail('Update tagline', update.status);

  // Update about
  await api('PUT', '/api/my/shop', { about: 'Audit test about' }, biz);

  // Update city
  await api('PUT', '/api/my/shop', { city: 'AuditCity' }, biz);

  // Update showAiManager
  await api('PUT', '/api/my/shop', { showAiManager: true }, biz);

  // AI Manager settings
  const aiGet = await api('GET', '/api/business/ai-manager/settings', null, biz);
  if (aiGet.status === 200) ok('GET ai-manager/settings');
  else fail('AI manager settings get', aiGet.status);

  const aiSave = await api('PUT', '/api/business/ai-manager/settings', {
    aiGreeting: 'Hello! I am AI manager.',
    aiTone: 'friendly',
    aiStylePrompt: 'Be polite',
    aiForbiddenClaims: 'No free delivery promises',
    aiPreferredCTA: 'Leave a request',
  }, biz);
  if (aiSave.status === 200) ok('PUT ai-manager/settings greeting/style');
  else fail('AI manager settings save', aiSave.status);

  // Restore original shop data
  await api('PUT', '/api/my/shop', {
    tagline: origTagline, about: origAbout, description: origDesc, city: origCity,
    showAiManager: origShowAi,
  }, biz);

  // Restore original AI settings
  await api('PUT', '/api/business/ai-manager/settings', {
    aiGreeting: origAIData.aiGreeting || '',
    aiTone: origAIData.aiTone || 'professional',
    aiStylePrompt: origAIData.aiStylePrompt || '',
    aiForbiddenClaims: origAIData.aiForbiddenClaims || '',
    aiPreferredCTA: origAIData.aiPreferredCTA || '',
  }, biz);

  // Dashboard
  const stats = await api('GET', '/api/business/dashboard/stats', null, biz);
  if (stats.status === 200) ok('Business dashboard');
  else fail('Dashboard', stats.status);
}

// AI Manager chat
if (cli && pid) {
  const chat = await api('POST', '/api/ai-manager/chat', {
    shopSlug: 'technomarket', message: 'Расскажи про товары', productId: pid, source: 'shop_page',
  }, cli);
  if (chat.status === 200 && unwrap(chat)?.message) ok('AI Manager chat on shop');
  else fail('AI Manager chat', chat.status);
}

// No API key leaks
const shopText = JSON.stringify(shopData);
if (shopText.includes('GROQ_API_KEY') || shopText.includes('gsk_')) fail('API key in shop response');
else ok('No API key in shop response');

// Summary
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE Shop Storefront Audit 2026');
console.log('Backend:', BASE, '\n');
for (const r of results) {
  console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
