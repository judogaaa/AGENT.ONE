import http from 'node:http';
const BASE = 'http://localhost:8080';

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
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    });
    r.on('error', e => resolve({ status: 0, error: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

function assert(label, condition, detail) {
  console.log(condition ? `  ✅ ${label}` : `  ❌ ${label}: ${detail || ''}`);
  return condition;
}

let allOk = true;
function check(label, condition, detail) {
  if (!assert(label, condition, detail)) allOk = false;
}

const cli = (await req('POST', '/api/auth/signin', { email: 'client@agentone.ru', password: 'client123' })).body.data.token;
const biz = (await req('POST', '/api/auth/signin', { email: 'demo@agentone.ru', password: 'demo123' })).body.data.token;

console.log('\n=== Reset AI Manager settings ===');
const reset = await req('PUT', '/api/business/ai-manager/settings', {
  mode: 'assistive', enabled: true, tone: 'professional',
  welcomeMessage: '', handoffMessage: '', deliveryPolicy: '', warrantyPolicy: '',
  paymentPolicy: '', discountPolicy: '', forbiddenTopics: '',
  autoCreateLeads: true, autoSuggestProducts: true, autoSuggestCheckout: true, handoffOnUnknown: true
}, biz);
check('settings reset 200', reset.status === 200 && reset.body.ok, reset.status);

console.log('\n=== ShopPage AI Manager dialog ===');
const r1 = await req('POST', '/api/ai-manager/chat', { shopSlug: 'technomarket', message: 'Здравствуйте', source: 'manual_qa' }, cli);
const did = r1.body.data.dialogId;
check('greeting 200', r1.status === 200 && r1.body.ok);
check('greeting has dialogId', !!did);

const r2 = await req('POST', '/api/ai-manager/chat', { shopSlug: 'technomarket', dialogId: did, message: 'Подберите айфон до 200000', source: 'manual_qa' }, cli);
const shopSlugs = [...new Set((r2.body.data.products || []).map(p => p.shopSlug))];
check('search returns products', r2.body.data.products.length > 0);
check('only same shop products', shopSlugs.length === 1 && shopSlugs[0] === 'technomarket', shopSlugs.join(', '));
const allHaveImages = (r2.body.data.products || []).every(p => Array.isArray(p.images) && p.images.length > 0 && p.images[0]);
check('all suggested products have images', allHaveImages);

const r3 = await req('POST', '/api/ai-manager/chat', { shopSlug: 'technomarket', dialogId: did, message: 'Какая гарантия?', source: 'manual_qa' }, cli);
check('warranty honest when empty', (r3.body.data.message || '').toLowerCase().includes('не указан') || (r3.body.data.message || '').toLowerCase().includes('уточнить'), r3.body.data.message);

const r4 = await req('POST', '/api/ai-manager/chat', { shopSlug: 'technomarket', dialogId: did, message: 'Есть ли скидка?', source: 'manual_qa' }, cli);
check('discount honest when empty', (r4.body.data.message || '').toLowerCase().includes('не указан') || (r4.body.data.message || '').toLowerCase().includes('уточнить'), r4.body.data.message);

const r5 = await req('POST', '/api/ai-manager/chat', { shopSlug: 'technomarket', dialogId: did, message: 'Передайте продавцу', source: 'manual_qa' }, cli);
check('handoff request creates lead', r5.body.data.lead.created === true, JSON.stringify(r5.body.data.lead));
check('handoff status lead_created', r5.body.data.status === 'lead_created');

const rUnknown = await req('POST', '/api/ai-manager/chat', { shopSlug: 'technomarket', message: 'something absolutely unknown xyz123', source: 'manual_qa' }, cli);
check('unknown intent does not create lead', rUnknown.body.data.lead.created === false, JSON.stringify(rUnknown.body.data.lead));

console.log('\n=== ProductPage AI Manager dialog ===');
const shop = await req('GET', '/api/shop/technomarket');
const pid = shop.body.data.products[0].id;
const r6 = await req('POST', '/api/ai-manager/chat', { shopSlug: 'technomarket', productId: pid, message: 'Есть ли этот товар?', source: 'manual_qa' }, cli);
const did2 = r6.body.data.dialogId;
check('product availability honest', (r6.body.data.message || '').toLowerCase().includes('уточнить') || (r6.body.data.message || '').toLowerCase().includes('не имею доступа'), r6.body.data.message);

const r7 = await req('POST', '/api/ai-manager/chat', { shopSlug: 'technomarket', dialogId: did2, productId: pid, message: 'Подберите похожий', source: 'manual_qa' }, cli);
check('similar products returned', r7.body.data.products.length > 0);

const r8 = await req('POST', '/api/ai-manager/chat', { shopSlug: 'technomarket', dialogId: did2, productId: pid, message: 'Создать заявку', source: 'manual_qa' }, cli);
check('create lead request works', r8.body.data.lead.created === true, JSON.stringify(r8.body.data.lead));

console.log('\n=== Account dialogs ===');
const dialogs = await req('GET', '/api/my/ai-manager/dialogs', null, cli);
check('client dialogs visible', dialogs.body.data.dialogs.length > 0);
const dlg = dialogs.body.data.dialogs.find(d => d.id === did);
check('shop dialog in list', !!dlg);
check('dialog status persisted', dlg.status === 'lead_created');

const detail = await req('GET', `/api/my/ai-manager/dialogs/${did}`, null, cli);
check('dialog detail has messages', detail.body.data.messages.length >= 4);

const leads = await req('GET', '/api/my/leads', null, cli);
const foundLead = leads.body.data.leads.find(l => l.id === r5.body.data.lead.id);
check('lead visible in my leads', !!foundLead);
check('lead source is ai_manager', foundLead?.source === 'ai_manager');
check('lead status new', foundLead?.status === 'new');

console.log('\n=== Business AI Manager settings persistence ===');
const s1 = await req('GET', '/api/business/ai-manager/settings', null, biz);
check('settings get 200', s1.status === 200 && s1.body.ok);
const orig = s1.body.data.settings;

await req('PUT', '/api/business/ai-manager/settings', {
  mode: 'auto_reply_and_lead', enabled: true, deliveryPolicy: 'Курьером', warrantyPolicy: '1 год'
}, biz);
const s2 = await req('GET', '/api/business/ai-manager/settings', null, biz);
check('settings persist after update', s2.body.data.settings.mode === 'auto_reply_and_lead' && s2.body.data.settings.deliveryPolicy === 'Курьером');

console.log('\n=== Business dialogs / takeover / reply ===');
const bizDlg = await req('GET', '/api/business/ai-manager/dialogs', null, biz);
check('business sees dialogs', bizDlg.body.data.dialogs.length > 0);
const bd = bizDlg.body.data.dialogs.find(d => d.id === did);
check('business sees client dialog', !!bd);
check('business dialog has lead context', !!bd.leadId);

const takeover = await req('POST', `/api/business/ai-manager/dialogs/${did}/takeover`, {}, biz);
check('takeover 200', takeover.status === 200 && takeover.body.ok);
const reply = await req('POST', `/api/business/ai-manager/dialogs/${did}/reply`, { message: 'Здравствуйте, это продавец. Готов помочь.' }, biz);
check('manual reply 200', reply.status === 200 && reply.body.ok);

const clientDetail = await req('GET', `/api/my/ai-manager/dialogs/${did}`, null, cli);
const bizReplyMsg = clientDetail.body.data.messages.find(m => m.senderRole === 'business');
check('client sees business reply', !!bizReplyMsg && bizReplyMsg.message.includes('продавец'));

console.log('\n=== Restore settings ===');
await req('PUT', '/api/business/ai-manager/settings', orig, biz);
const s3 = await req('GET', '/api/business/ai-manager/settings', null, biz);
check('settings restored', s3.body.data.settings.mode === orig.mode);

console.log(allOk ? '\n✅ Manual QA simulation passed' : '\n❌ Manual QA simulation failed');
process.exit(allOk ? 0 : 1);
