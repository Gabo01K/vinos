const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'orders.db');
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  paypal_order_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  payer_email TEXT,
  payer_name TEXT,
  amount_value TEXT,
  amount_currency TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  qty INTEGER NOT NULL,
  FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
);
`);

const insertOrderStmt = db.prepare(`
  INSERT INTO orders (paypal_order_id, status, payer_email, payer_name, amount_value, amount_currency)
  VALUES (@paypal_order_id, @status, @payer_email, @payer_name, @amount_value, @amount_currency)
`);

const insertItemStmt = db.prepare(`
  INSERT INTO order_items (order_id, product_id, name, price, qty)
  VALUES (@order_id, @product_id, @name, @price, @qty)
`);

const getOrdersStmt = db.prepare(`
  SELECT
    o.id,
    o.paypal_order_id,
    o.status,
    o.payer_email,
    o.payer_name,
    o.amount_value,
    o.amount_currency,
    o.created_at
  FROM orders o
  ORDER BY o.created_at DESC
`);

const getItemsByOrderStmt = db.prepare(`
  SELECT id, order_id, product_id, name, price, qty
  FROM order_items
  WHERE order_id = ?
`);

const upsertOrder = db.prepare(`
  INSERT INTO orders (paypal_order_id, status, payer_email, payer_name, amount_value, amount_currency)
  VALUES (@paypal_order_id, @status, @payer_email, @payer_name, @amount_value, @amount_currency)
  ON CONFLICT(paypal_order_id) DO UPDATE SET
    status = excluded.status,
    payer_email = excluded.payer_email,
    payer_name = excluded.payer_name,
    amount_value = excluded.amount_value,
    amount_currency = excluded.amount_currency
  RETURNING id
`);

const insertOrderWithItems = db.transaction((orderData, items) => {
  const result = upsertOrder.get(orderData);
  const orderId = result.id;

  // Remove old items if updating existing order to avoid duplicates.
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);

  for (const item of items) {
    insertItemStmt.run({ order_id: orderId, ...item });
  }
  return orderId;
});

function saveOrder(orderPayload) {
  const { paypal_order_id, status, payer_email, payer_name, amount_value, amount_currency, items = [] } = orderPayload;
  const orderId = insertOrderWithItems(
    { paypal_order_id, status, payer_email, payer_name, amount_value, amount_currency },
    items
  );
  return orderId;
}

function getOrders() {
  const orders = getOrdersStmt.all();
  return orders.map(order => ({
    ...order,
    items: getItemsByOrderStmt.all(order.id)
  }));
}

module.exports = {
  db,
  saveOrder,
  getOrders
};
