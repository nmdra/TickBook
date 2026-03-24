const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
const notificationRoutes = require('./routes/notificationRoutes');
const { startRouter } = require('./workers/router');
const { startChannelWorker } = require('./workers/channelWorker');

const envPath = path.resolve(__dirname, '..', '.env');
const envExamplePath = path.resolve(__dirname, '..', '.env.example');

dotenv.config({
  path: fs.existsSync(envPath) ? envPath : envExamplePath,
});

const app = express();
const PORT = process.env.PORT || 3005;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/notifications', notificationRoutes);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     responses:
 *       200:
 *         description: Notification service is healthy
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const start = async () => {
  app.listen(PORT, () => {
    console.log(`Notification Service running on port ${PORT}`);
  });

  await startRouter();

  const channels = (process.env.NOTIFICATION_WORKER_CHANNELS || 'email,sms,push,whatsapp')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  await Promise.all(
    channels.map((channel) =>
      startChannelWorker(channel).catch((err) => {
        console.warn(`Failed to start channel worker ${channel}:`, err.message);
      })
    )
  );
};

start().catch((err) => {
  console.error('Notification service failed to start:', err.message);
  process.exit(1);
});

module.exports = app;
