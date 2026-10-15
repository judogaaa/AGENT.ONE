import { execSync } from 'child_process';
import fs from 'fs';

const results = [];
function ok(label) { results.push({ label, status: 'PASS' }); }
function fail(label, detail) { results.push({ label, status: 'FAIL', detail }); }
const BASE = 'http://localhost:8080';

function psql(sql) {
  try {
    const r = execSync(`docker compose exec -T postgres psql -U agentone -d agentone -tAc "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8', timeout: 20000 });
    return r.trim();
  } catch (e) { return ''; }
}

function psqlExists(sql) {
  return psql(sql).length > 0;
}

// ── Tables ──
if (psqlExists("SELECT 1 FROM pg_tables WHERE tablename='audit_events'")) ok('audit_events table exists');
else fail('audit_events table missing');

if (psqlExists("SELECT 1 FROM pg_tables WHERE tablename='business_verifications'")) ok('business_verifications table exists');
else fail('business_verifications table missing');

if (psqlExists("SELECT 1 FROM information_schema.columns WHERE table_name='shops' AND column_name='verification_status'")) ok('shops.verification_status column exists');
else fail('shops.verification_status column missing');

// ── Indexes ──
const expectedIndexes = [
  ['products shop/active', 'idx_products_shop_active'],
  ['products category', 'idx_products_category'],
  ['shops slug', 'idx_shops_slug'],
  ['shops owner_id', 'idx_shops_owner_id'],
  ['shops verification_status', 'idx_shops_verification_status'],
  ['orders user/created', 'idx_orders_user_created'],
  ['orders shop/created', 'idx_orders_shop_created'],
  ['order_items order_id', 'idx_order_items_order_id'],
  ['leads shop/created', 'idx_leads_shop_created'],
  ['leads customer/created', 'idx_leads_customer_user_created'],
  ['favorites user_id', 'idx_favorites_user_id'],
  ['favorites product_id', 'idx_favorites_product_id'],
  ['ai_dialogs shop/updated', 'idx_ai_dialogs_shop_updated'],
  ['ai_dialogs client/updated', 'idx_ai_dialogs_client_updated'],
  ['ai_messages dialog/created', 'idx_ai_messages_dialog_created'],
  ['verifications user_id', 'idx_business_verifications_user_id'],
  ['verifications shop_id', 'idx_business_verifications_shop_id'],
  ['verifications status', 'idx_business_verifications_status'],
  ['audit_events actor', 'idx_audit_events_actor_created'],
  ['audit_events shop', 'idx_audit_events_shop_created'],
  ['audit_events action', 'idx_audit_events_action_created'],
  ['audit_events entity', 'idx_audit_events_entity'],
];
for (const [label, idxName] of expectedIndexes) {
  if (psqlExists(`SELECT 1 FROM pg_indexes WHERE indexname='${idxName}'`)) ok(`Index: ${label}`);
  else fail(`Index missing: ${label} (${idxName})`);
}

// ── Constraints ──
if (psqlExists("SELECT 1 FROM pg_constraint WHERE conname='chk_shop_verification_status'")) ok('Constraint: shops verification_status CHECK');
else fail('Constraint missing: shops verification_status');

if (psqlExists("SELECT 1 FROM pg_constraint WHERE conname='chk_business_verification_status'")) ok('Constraint: business_verifications status CHECK');
else fail('Constraint missing: business_verifications status');

if (psqlExists("SELECT 1 FROM pg_constraint WHERE conname='chk_profiles_role'")) ok('Constraint: profiles role CHECK');
else fail('Constraint missing: profiles role');

// ── Audit events content ──
const auditCount = psql("SELECT COUNT(*) FROM audit_events");
if (parseInt(auditCount) >= 0) ok(`audit_events has ${auditCount} rows`);
else fail('audit_events query failed');

// No secrets in audit_events metadata
const secretCheck = psql("SELECT COUNT(*) FROM audit_events WHERE metadata::text LIKE '%gsk_%' OR metadata::text LIKE '%key%' OR metadata::text LIKE '%token%'");
if (secretCheck === '0') ok('No secrets in audit_events metadata');
else fail('Possible secrets in audit_events: ' + secretCheck);

// ── Shop verification values ──
const shopStatuses = psql("SELECT DISTINCT verification_status FROM shops");
if (shopStatuses.split('\n').every(s => ['none','pending','approved','rejected',''].includes(s.trim()))) ok('shops.verification_status has valid values');
else fail('shops.verification_status has invalid values: ' + shopStatuses);

// ── Business verification values ──
const bizStatuses = psql("SELECT DISTINCT status FROM business_verifications");
if (bizStatuses.split('\n').every(s => ['pending','approved','rejected',''].includes(s.trim()))) ok('business_verifications.status has valid values');
else fail('business_verifications.status invalid: ' + bizStatuses);

// ── API health check ──
try {
  const r = await fetch(BASE + '/api/health');
  if (r.ok) ok('API health');
  else fail('API health', r.status);
} catch (e) { fail('API health unreachable', e.message); }

// ── Existing audits quick check ──
const gitignore = fs.readFileSync('.gitignore', 'utf8');
if (gitignore.includes('.env')) ok('.env in .gitignore');

// Summary
const passed = results.filter(r => r.status === 'PASS').length;
const failed = results.filter(r => r.status === 'FAIL').length;
console.log('\nAGENT.ONE Database Foundation Audit 2026');
for (const r of results) {
  console.log(`  ${r.status === 'PASS' ? '✅' : '❌'} ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
}
console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
