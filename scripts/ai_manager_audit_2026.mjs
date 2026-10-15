import http from 'node:http';
import https from 'node:https';

const BASE = 'http://localhost:8080';
const SHOP_SLUG = 'technomarket';
let errors = 0;

function fail(label, detail) { errors++; console.error(`  ❌ ${label}: ${detail || ''}`); }
function ok(label) { console.log(`  ✅ ${label}`); }

function req(method, path, body, token) {
  return new Promise(resolve => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = http.request(BASE + path, { method, headers, timeout: 10000 }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d, raw: d.substring(0, 120) }); }
      });
    });
    r.on('error', e => resolve({ status: 0, error: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

function checkImageUrl(url) {
  return new Promise(resolve => {
    if (!url || typeof url !== 'string') return resolve(false);
    const fullUrl = url.startsWith('http') ? url : (BASE + (url.startsWith('/') ? url : '/' + url));
    const getter = fullUrl.startsWith('https') ? https.get : http.get;
    getter(fullUrl, { timeout: 5000 }, res => {
      resolve(res.statusCode === 200 && (res.headers['content-type'] || '').startsWith('image/'));
    }).on('error', () => resolve(false));
  });
}

async function assert(desc, condition, detail) { if (condition) ok(desc); else fail(desc, detail); }

async function main() {
  console.log('AGENT.ONE AI Manager 24/7 Audit v1\n');

  // Auth
  const cli = await req('POST', '/api/auth/signin', { email: 'client@agentone.ru', password: 'client123' });
  await assert('client signin', cli.status === 200 && cli.body.ok, cli.status);
  const cliToken = cli.body.data?.token;
  const biz = await req('POST', '/api/auth/signin', { email: 'demo@agentone.ru', password: 'demo123' });
  const bizToken = biz.body.data?.token;

  // 1. Guest guard
  console.log('\n── Guards ──');
  let r = await req('POST', '/api/ai-manager/chat', { shopSlug: SHOP_SLUG, message: 'test' });
  await assert('guest /api/ai-manager/chat → 401', r.status === 401, r.status);

  // 2. Business guard
  r = await req('POST', '/api/ai-manager/chat', { shopSlug: SHOP_SLUG, message: 'test' }, bizToken);
  await assert('business /api/ai-manager/chat → 403', r.status === 403, r.status);

  // 3-6. Client chat + history saved
  console.log('\n── Client chat ──');
  r = await req('POST', '/api/ai-manager/chat', { shopSlug: SHOP_SLUG, message: 'ai_manager_audit hello', source: 'ai_manager_audit' }, cliToken);
  await assert('client chat 200', r.status === 200 && r.body.ok, r.status);
  const dialogId = r.body.data?.dialogId;
  await assert('response contains dialogId', !!dialogId, JSON.stringify(r.body).substring(0, 100));

  // Continue dialog
  r = await req('POST', '/api/ai-manager/chat', { shopSlug: SHOP_SLUG, dialogId, message: 'ai_manager_audit price question', source: 'ai_manager_audit' }, cliToken);
  await assert('continue dialog 200', r.status === 200 && r.body.ok, r.status);

  // 7. Product question
  const shopRes = await req('GET', '/api/shop/' + SHOP_SLUG);
  const products = shopRes.body.data?.products || [];
  const product = products[0];
  await assert('shop has products', products.length > 0);
  if (product) {
    r = await req('POST', '/api/ai-manager/chat', { shopSlug: SHOP_SLUG, productId: product.id, message: 'ai_manager_audit product question', source: 'ai_manager_audit' }, cliToken);
    await assert('product question 200', r.status === 200 && r.body.ok, r.status);
  }

  // 8-9. Shop search only same shop
  r = await req('POST', '/api/ai-manager/chat', { shopSlug: SHOP_SLUG, dialogId, message: 'айфон до 500000', source: 'ai_manager_audit' }, cliToken);
  await assert('shop search 200', r.status === 200 && r.body.ok, r.status);
  const suggested = r.body.data?.products || [];
  await assert('search returned products', suggested.length > 0, suggested.length);
  const otherShop = suggested.find(p => p.shopSlug && p.shopSlug !== SHOP_SLUG);
  await assert('no products from other shops', !otherShop, otherShop?.shopSlug);

  // 10-12. Lead creation
  r = await req('POST', '/api/ai-manager/chat', { shopSlug: SHOP_SLUG, dialogId, message: 'создай заявку ai_manager_audit', source: 'ai_manager_audit' }, cliToken);
  await assert('lead request 200', r.status === 200 && r.body.ok, r.status);
  await assert('lead created flag', r.body.data?.lead?.created === true, JSON.stringify(r.body.data?.lead));

  const leadId = r.body.data?.lead?.id;
  await assert('lead id present', !!leadId);

  const myLeads = await req('GET', '/api/my/leads', null, cliToken);
  const foundLead = (myLeads.body.data?.leads || []).find(l => l.id === leadId);
  await assert('client /api/my/leads sees lead', !!foundLead);

  const bizLeads = await req('GET', '/api/my/leads', null, bizToken);
  const foundBizLead = (bizLeads.body.data?.leads || []).find(l => l.id === leadId);
  await assert('business /api/my/leads sees lead', !!foundBizLead);

  // 13-15. Business settings
  console.log('\n── Business settings ──');
  r = await req('GET', '/api/business/ai-manager/settings', null, bizToken);
  await assert('business get settings 200', r.status === 200 && r.body.ok, r.status);
  const originalSettings = r.body.data?.settings || {};
  const originalMode = originalSettings.mode;

  r = await req('PUT', '/api/business/ai-manager/settings', { mode: 'auto_reply_and_lead', deliveryPolicy: 'ai_manager_audit delivery', handoffMessage: 'ai_manager_audit handoff' }, bizToken);
  await assert('business update settings 200', r.status === 200 && r.body.ok, r.status);
  await assert('settings mode updated', r.body.data?.settings?.mode === 'auto_reply_and_lead', r.body.data?.settings?.mode);

  r = await req('GET', '/api/business/ai-manager/settings', null, bizToken);
  await assert('settings persist after re-login/get', r.status === 200 && r.body.data?.settings?.mode === 'auto_reply_and_lead', r.body.data?.settings?.mode);

  // Strict settings coverage
  console.log('\n── Settings persistence ──');
  const testValues = {
    welcomeMessage: 'audit welcome message',
    deliveryPolicy: 'audit delivery policy',
    warrantyPolicy: 'audit warranty policy',
    paymentPolicy: 'audit payment policy',
    discountPolicy: 'audit discount policy',
    autoCreateLeads: true,
    autoSuggestProducts: true,
    autoSuggestCheckout: true,
    handoffOnUnknown: true,
  };
  r = await req('PUT', '/api/business/ai-manager/settings', testValues, bizToken);
  await assert('save all text rules and toggles 200', r.status === 200 && r.body.ok, r.status);

  r = await req('GET', '/api/business/ai-manager/settings', null, bizToken);
  const s1 = r.body.data?.settings || {};
  await assert('saved welcomeMessage persists', s1.welcomeMessage === testValues.welcomeMessage, s1.welcomeMessage);
  await assert('saved deliveryPolicy persists', s1.deliveryPolicy === testValues.deliveryPolicy, s1.deliveryPolicy);
  await assert('saved warrantyPolicy persists', s1.warrantyPolicy === testValues.warrantyPolicy, s1.warrantyPolicy);
  await assert('saved paymentPolicy persists', s1.paymentPolicy === testValues.paymentPolicy, s1.paymentPolicy);
  await assert('saved discountPolicy persists', s1.discountPolicy === testValues.discountPolicy, s1.discountPolicy);
  await assert('saved autoCreateLeads true persists', s1.autoCreateLeads === true, s1.autoCreateLeads);
  await assert('saved autoSuggestProducts true persists', s1.autoSuggestProducts === true, s1.autoSuggestProducts);
  await assert('saved autoSuggestCheckout true persists', s1.autoSuggestCheckout === true, s1.autoSuggestCheckout);
  await assert('saved handoffOnUnknown true persists', s1.handoffOnUnknown === true, s1.handoffOnUnknown);

  // Empty string persistence
  r = await req('PUT', '/api/business/ai-manager/settings', {
    warrantyPolicy: '',
    paymentPolicy: '',
    discountPolicy: '',
    deliveryPolicy: 'audit delivery policy',
  }, bizToken);
  await assert('save empty policies 200', r.status === 200 && r.body.ok, r.status);

  r = await req('GET', '/api/business/ai-manager/settings', null, bizToken);
  const s2 = r.body.data?.settings || {};
  await assert('warrantyPolicy empty persists', s2.warrantyPolicy === '', JSON.stringify(s2.warrantyPolicy));
  await assert('paymentPolicy empty persists', s2.paymentPolicy === '', JSON.stringify(s2.paymentPolicy));
  await assert('discountPolicy empty persists', s2.discountPolicy === '', JSON.stringify(s2.discountPolicy));
  await assert('deliveryPolicy kept', s2.deliveryPolicy === 'audit delivery policy', s2.deliveryPolicy);

  // False toggles persistence
  r = await req('PUT', '/api/business/ai-manager/settings', {
    autoCreateLeads: false,
    autoSuggestProducts: false,
    autoSuggestCheckout: false,
    handoffOnUnknown: false,
  }, bizToken);
  await assert('save false toggles 200', r.status === 200 && r.body.ok, r.status);

  r = await req('GET', '/api/business/ai-manager/settings', null, bizToken);
  const s3 = r.body.data?.settings || {};
  await assert('autoCreateLeads false persists', s3.autoCreateLeads === false, s3.autoCreateLeads);
  await assert('autoSuggestProducts false persists', s3.autoSuggestProducts === false, s3.autoSuggestProducts);
  await assert('autoSuggestCheckout false persists', s3.autoSuggestCheckout === false, s3.autoSuggestCheckout);
  await assert('handoffOnUnknown false persists', s3.handoffOnUnknown === false, s3.handoffOnUnknown);

  // Restore settings
  await req('PUT', '/api/business/ai-manager/settings', originalSettings, bizToken);

  // 16-18. Business dialogs + cross-shop blocked
  console.log('\n── Business dialogs ──');
  r = await req('GET', '/api/business/ai-manager/dialogs', null, bizToken);
  await assert('business list dialogs 200', r.status === 200 && r.body.ok, r.status);
  const bizDialogs = r.body.data?.dialogs || [];
  await assert('business sees dialogs', bizDialogs.length > 0, bizDialogs.length);
  const testDialog = bizDialogs.find(d => d.id === dialogId);
  await assert('business sees own dialog', !!testDialog);

  // Open dialog detail
  r = await req('GET', '/api/business/ai-manager/dialogs/' + dialogId, null, bizToken);
  await assert('business open own dialog 200', r.status === 200 && r.body.ok, r.status);
  await assert('messages present', (r.body.data?.messages || []).length >= 2, (r.body.data?.messages || []).length);

  // 19-21. Takeover + manual reply + client sees
  r = await req('POST', '/api/business/ai-manager/dialogs/' + dialogId + '/takeover', {}, bizToken);
  await assert('business takeover 200', r.status === 200 && r.body.ok, r.status);

  r = await req('POST', '/api/business/ai-manager/dialogs/' + dialogId + '/reply', { message: 'ai_manager_audit business reply' }, bizToken);
  await assert('business manual reply 200', r.status === 200 && r.body.ok, r.status);

  r = await req('GET', '/api/my/ai-manager/dialogs/' + dialogId, null, cliToken);
  await assert('client sees dialog after business reply 200', r.status === 200 && r.body.ok, r.status);
  const msgs = r.body.data?.messages || [];
  const hasBusinessReply = msgs.some(m => m.senderRole === 'business' && m.message.includes('ai_manager_audit business reply'));
  await assert('client sees business manual reply', hasBusinessReply, msgs.length);

  // 22. Disabled mode
  console.log('\n── Disabled mode ──');
  await req('PUT', '/api/business/ai-manager/settings', { mode: 'off', enabled: false }, bizToken);
  const disabledDialog = await req('POST', '/api/ai-manager/chat', { shopSlug: SHOP_SLUG, message: 'ai_manager_audit disabled test', source: 'ai_manager_audit' }, cliToken);
  await assert('disabled mode returns handoff/disabled', disabledDialog.status === 200 && disabledDialog.body.data?.handoff === true, JSON.stringify(disabledDialog.body));
  await req('PUT', '/api/business/ai-manager/settings', { mode: originalMode || 'assistive', enabled: true }, bizToken);

  // 23. No fake claims
  console.log('\n── No-fake rules ──');
  const warrantyRes = await req('POST', '/api/ai-manager/chat', { shopSlug: SHOP_SLUG, message: 'Какая гарантия?', source: 'ai_manager_audit' }, cliToken);
  const warrantyText = (warrantyRes.body.data?.message || '').toLowerCase();
  await assert('warranty question avoids fake claims when policy empty', warrantyText.includes('не указан') || warrantyText.includes('уточнить'), warrantyText.substring(0, 80));

  // 24. Checkout help
  const checkoutRes = await req('POST', '/api/ai-manager/chat', { shopSlug: SHOP_SLUG, message: 'Как оформить заказ?', source: 'ai_manager_audit' }, cliToken);
  const checkoutText = (checkoutRes.body.data?.message || '').toLowerCase();
  await assert('checkout help no Оплатить', !checkoutText.includes('оплатит'), checkoutText.substring(0, 80));
  await assert('checkout help no ЮKassa/card/sbp claims', !checkoutText.includes('юkassa') && !checkoutText.includes('юкасса') && !checkoutText.includes('картой') && !checkoutText.includes('сбп'), checkoutText.substring(0, 80));

  // 25-26. Product images valid + no inactive/no-photo
  console.log('\n── Product suggestions integrity ──');
  const searchRes = await req('POST', '/api/ai-manager/chat', { shopSlug: SHOP_SLUG, message: 'айфон', source: 'ai_manager_audit' }, cliToken);
  const prods = searchRes.body.data?.products || [];
  await assert('suggestions returned', prods.length > 0, prods.length);
  let imgOk = true;
  for (const p of prods.slice(0, 3)) {
    const imgs = p.images || [];
    if (imgs.length === 0) { imgOk = false; break; }
    const ok = await checkImageUrl(imgs[0]);
    if (!ok) { imgOk = false; break; }
  }
  await assert('suggestion images valid HTTP 200', imgOk);

  console.log(`\n${errors === 0 ? '✅ All AI Manager checks passed' : '❌ ' + errors + ' error(s)'}`);
  process.exit(errors > 0 ? 1 : 0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
