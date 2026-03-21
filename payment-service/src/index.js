const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '..', '.env');
const envExamplePath = path.resolve(__dirname, '..', '.env.example');

dotenv.config({
  path: fs.existsSync(envPath) ? envPath : envExamplePath,
});

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const { initDB } = require('./config/db');
const { connectConsumer, disconnectConsumer } = require('./config/kafka');
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();
const PORT = process.env.PORT || 3004;

app.use(helmet());
app.use(cors());
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Service is healthy
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/payments', paymentRoutes);

const start = async () => {
  try {
    await initDB();
    console.log('Database connected and initialized');
  } catch (err) {
    console.error('Database initialization failed:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Payment Service running on port ${PORT}`);
    console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
  });

  void connectConsumer();
};

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await disconnectConsumer();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down gracefully...');
  await disconnectConsumer();
  process.exit(0);
});

start();

module.exports = app;
