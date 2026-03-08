require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');

const { initDB } = require('./config/db');
const { createRedisClient } = require('./config/redis');
const { createKafkaProducer, disconnectKafka } = require('./config/kafka');
const swaggerSpec = require('./swagger');
const eventRoutes = require('./routes/eventRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Swagger docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Routes
app.use('/api/events', eventRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const start = async () => {
  try {
    await initDB();
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  }

  createRedisClient();
  await createKafkaProducer();

  app.listen(PORT, () => {
    console.log(`Event Service running on port ${PORT}`);
    console.log(`Swagger docs available at http://localhost:${PORT}/api-docs`);
  });
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await disconnectKafka();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await disconnectKafka();
  process.exit(0);
});

start();

module.exports = app;
