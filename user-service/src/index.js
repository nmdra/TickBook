require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { connectDB, initUsersTable } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(helmet());
app.use(cors());
app.use(express.json());

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
};

startServer();

module.exports = app;
