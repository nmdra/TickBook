const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'paymentdb',
});

const initDB = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      booking_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'usd',
      status VARCHAR(50) DEFAULT 'pending',
      payment_method VARCHAR(100) DEFAULT 'pending_selection',
      stripe_checkout_session_id VARCHAR(255),
      stripe_payment_intent_id VARCHAR(255),
      stripe_customer_id VARCHAR(255),
      checkout_url TEXT,
      failure_reason TEXT,
      provider_response JSONB,
      paid_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const alterQueries = [
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'usd'",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_checkout_session_id VARCHAR(255)",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255)",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS checkout_url TEXT",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS failure_reason TEXT",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS provider_response JSONB",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP",
    "ALTER TABLE payments ALTER COLUMN payment_method SET DEFAULT 'pending_selection'",
    "ALTER TABLE payments ALTER COLUMN currency SET DEFAULT 'usd'",
    "ALTER TABLE payments ALTER COLUMN created_at SET DEFAULT NOW()",
    "ALTER TABLE payments ALTER COLUMN updated_at SET DEFAULT NOW()",
    "CREATE INDEX IF NOT EXISTS idx_payments_booking_id ON payments (booking_id)",
    "CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status)",
    "CREATE INDEX IF NOT EXISTS idx_payments_stripe_checkout_session_id ON payments (stripe_checkout_session_id)",
    "CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_intent_id ON payments (stripe_payment_intent_id)",
  ];

  await pool.query(createTableQuery);

  for (const query of alterQueries) {
    await pool.query(query);
  }

  console.log('Database initialized: payments table ready');
};

module.exports = { pool, initDB };
