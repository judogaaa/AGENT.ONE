import http from 'node:http';
import pg from 'pg';

const DB_URL = process.env.DATABASE_URL || 'postgres://agentone:agentone@localhost:5432/agentone?sslmode=disable';
const APPLY = process.argv.includes('--apply');

async function main() {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();

  console.log('AGENT.ONE AI Manager Audit Data Cleanup');
  console.log(APPLY ? '  MODE: APPLY (will delete)' : '  MODE: DRY RUN (no changes)');
  console.log('');

  // Find audit dialogs: source = 'ai_manager_audit' OR metadata contains audit marker
  const auditDialogs = await client.query(`
    SELECT d.id, d.title, d.source, d.created_at,
           COALESCE(profiles.display_name, profiles.email, '') AS client_name
    FROM ai_manager_dialogs d
    LEFT JOIN profiles ON d.client_user_id=profiles.id
    WHERE d.source = 'ai_manager_audit'
       OR d.id IN (
         SELECT DISTINCT dialog_id FROM ai_manager_messages
         WHERE metadata::text LIKE '%ai_manager_audit%'
       )
    ORDER BY d.created_at ASC
  `);

  const dialogIds = auditDialogs.rows.map(r => r.id);
  console.log(`Audit dialogs found: ${dialogIds.length}`);
  if (dialogIds.length > 0) {
    auditDialogs.rows.forEach(d => {
      console.log(`  ${d.id} | ${d.client_name || 'unknown'} | ${d.source} | ${d.created_at}`);
    });
  }

  if (dialogIds.length === 0) {
    console.log('Nothing to clean up.');
    await client.end();
    return;
  }

  // Count related records
  const msgCount = await client.query(
    `SELECT COUNT(*) FROM ai_manager_messages WHERE dialog_id = ANY($1)`, [dialogIds]
  );
  const evtCount = await client.query(
    `SELECT COUNT(*) FROM ai_manager_events WHERE dialog_id = ANY($1)`, [dialogIds]
  );
  // Find linked leads
  const linkedLeads = await client.query(
    `SELECT id FROM leads WHERE dialog_id = ANY($1) AND source = 'ai_manager'`, [dialogIds]
  );
  const leadIds = linkedLeads.rows.map(r => r.id);

  console.log('');
  console.log('Related records:');
  console.log(`  Messages: ${msgCount.rows[0].count}`);
  console.log(`  Events:   ${evtCount.rows[0].count}`);
  console.log(`  Leads:    ${leadIds.length}`);

  if (!APPLY) {
    console.log('');
    console.log('Dry run complete. To delete, run:');
    console.log('  node scripts/cleanup_ai_manager_audit_data_2026.mjs --apply');
    await client.end();
    return;
  }

  // Delete in correct order (foreign keys)
  await client.query(`DELETE FROM ai_manager_events WHERE dialog_id = ANY($1)`, [dialogIds]);
  await client.query(`DELETE FROM ai_manager_messages WHERE dialog_id = ANY($1)`, [dialogIds]);
  if (leadIds.length > 0) {
    await client.query(`DELETE FROM leads WHERE id = ANY($1)`, [leadIds]);
  }
  await client.query(`DELETE FROM ai_manager_dialogs WHERE id = ANY($1)`, [dialogIds]);

  console.log('');
  console.log('Cleanup applied:');
  console.log(`  Deleted ${dialogIds.length} dialogs`);
  console.log(`  Deleted ${msgCount.rows[0].count} messages`);
  console.log(`  Deleted ${evtCount.rows[0].count} events`);
  console.log(`  Deleted ${leadIds.length} leads`);

  await client.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
