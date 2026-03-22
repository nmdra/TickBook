const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'eventdb',
});

const initDB = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      venue VARCHAR(255),
      user_id INTEGER,
      date TIMESTAMP NOT NULL,
      total_tickets INTEGER NOT NULL,
      available_tickets INTEGER NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `;

  const alterQuery = `
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS user_id INTEGER;
  `;

  await pool.query(query);
  await pool.query(alterQuery);
  logger.info('Database initialized');
};

module.exports = { pool, initDB };
