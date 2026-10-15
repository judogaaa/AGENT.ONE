// Reset client demo orders — manual script for demo prep
// Run: node scripts/reset_client_demo_orders_2026.mjs

import pg from 'pg';

const DB = process.env.DATABASE_URL || 'postgres://agentone:agentone@localhost:5432/agentone?sslmode=disable';
const CLIENT_EMAIL = 'client@agentone.ru';

const pool = new pg.Pool({ connectionString: DB, max: 1 });

try {
  // 1. Find client user
  const { rows: users } = await pool.query("SELECT id FROM profiles WHERE email=$1", [CLIENT_EMAIL]);
  if (users.length === 0) { console.error(`Client ${CLIENT_EMAIL} not found`); process.exit(1); }
  const userId = users[0].id;
  console.log(`Client: ${CLIENT_EMAIL} (${userId})`);

  // 2. Delete old order_items for this client
  const { rows: oldOrders } = await pool.query("SELECT id FROM orders WHERE user_id=$1", [userId]);
  if (oldOrders.length > 0) {
    const ids = oldOrders.map(o => o.id);
    for (const oid of ids) {
      await pool.query("DELETE FROM order_items WHERE order_id=$1", [oid]);
    }
    for (const oid of ids) {
      await pool.query("DELETE FROM orders WHERE id=$1", [oid]);
    }
    console.log(`Deleted ${ids.length} old orders`);
  }

  // 3. Get some active products for items
  const { rows: products } = await pool.query("SELECT p.id, p.name, p.price, s.slug as shop_slug, p.shop_id FROM products p JOIN shops s ON p.shop_id=s.id WHERE p.is_active=true AND s.is_published=true AND p.price > 0 ORDER BY p.price DESC LIMIT 5");
  if (products.length < 2) { console.error('Not enough active products'); process.exit(1); }

  // 4. Create completed order (7 days ago)
  const prod1 = products[0], prod2 = products[1];
  const orderId1 = 'demo-' + Date.now().toString(36);
  const sevenDays = new Date(Date.now() - 7*24*3600*1000).toISOString();

  await pool.query(
    "INSERT INTO orders (id, shop_id, user_id, customer_name, customer_phone, customer_email, total_amount, payment_method, payment_status, delivery_method, order_status, source, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)",
    [orderId1, prod1.shop_id, userId, 'Иван Петров', '+7 (999) 123-45-67', CLIENT_EMAIL, prod1.price + prod2.price, 'store', 'paid', 'pickup', 'completed', 'site', sevenDays]
  );
  await pool.query("INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity) VALUES ($1,$2,$3,$4,$5,$6)",
    ['oi1-' + Date.now().toString(36), orderId1, prod1.id, prod1.name, prod1.price, 1]);
  await pool.query("INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity) VALUES ($1,$2,$3,$4,$5,$6)",
    ['oi2-' + Date.now().toString(36), orderId1, prod2.id, prod2.name, prod2.price, 1]);
  console.log(`Created completed order: ${orderId1.slice(0,8)} — ${(prod1.price+prod2.price).toLocaleString()}₽`);

  // 5. Create new order (just now)
  const prod3 = products[2] || products[0];
  const orderId2 = 'demo-' + (Date.now()+1).toString(36);
  await pool.query(
    "INSERT INTO orders (id, shop_id, user_id, customer_name, customer_phone, customer_email, total_amount, payment_method, payment_status, delivery_method, order_status, source, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)",
    [orderId2, prod3.shop_id, userId, 'Иван Петров', '+7 (999) 123-45-67', CLIENT_EMAIL, prod3.price, 'cash', 'not_paid', 'delivery_agreement', 'accepted', 'site', new Date().toISOString()]
  );
  await pool.query("INSERT INTO order_items (id, order_id, product_id, product_name, price, quantity) VALUES ($1,$2,$3,$4,$5,$6)",
    ['oi3-' + Date.now().toString(36), orderId2, prod3.id, prod3.name, prod3.price, 1]);
  console.log(`Created accepted order: ${orderId2.slice(0,8)} — ${prod3.price.toLocaleString()}₽`);

  // 6. Verify
  const { rows: verify } = await pool.query("SELECT COUNT(*) as cnt FROM orders WHERE user_id=$1", [userId]);
  console.log(`\nClient now has ${verify[0].cnt} orders`);
  console.log('Done.');
} finally {
  await pool.end();
}
