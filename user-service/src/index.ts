import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { AppDataSource, initializeDataSource } from './config/data-source';
import { connectConsumer, disconnectConsumer, disconnectProducer } from './config/kafka';
import { ensureDatabaseSchema } from './config/schema';
import swaggerSpec from './config/swagger';
import userRoutes from './routes/userRoutes';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;
const publicDir = path.resolve(process.cwd(), 'public');

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/users', userRoutes);

const start = async (): Promise<void> => {
  try {
    await initializeDataSource();
    logger.success('Database connection successful.');
    await ensureDatabaseSchema();
  } catch (error) {
    logger.error(
      `Database initialization failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  }

  void connectConsumer();

  app.listen(PORT, () => {
    logger.highlight(`User Service running on port ${PORT}`);
    logger.info(`Swagger docs available at http://localhost:${PORT}/api-docs`);
  });
};

const shutdown = async (signal: 'SIGTERM' | 'SIGINT'): Promise<void> => {
  logger.warn(`${signal} received. Shutting down gracefully...`);
  await disconnectConsumer();
  await disconnectProducer();

  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    logger.info('Database connection closed.');
  }

  process.exit(0);
};

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

void start();

export default app;
