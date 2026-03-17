require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { connectDB, initUsersTable } = require('./config/db');
const { connectConsumer, disconnectConsumer } = require('./config/kafka');
const userRoutes = require('./routes/userRoutes');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api/users', userRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const startServer = async () => {
  try {
    await connectDB();
    await initUsersTable();
  } catch (err) {
    console.error('Failed to initialize database:', err.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`User Service running on port ${PORT}`);
  });

  connectConsumer();
};

process.on('SIGTERM', async () => {
  await disconnectConsumer();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await disconnectConsumer();
  process.exit(0);
});

startServer();

module.exports = app;
