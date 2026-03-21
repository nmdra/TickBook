import 'reflect-metadata';
import dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { Profile } from '../entities/Profile';
import { User } from '../entities/User';

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required');
}

const shouldUseSsl = !/sslmode=disable/i.test(process.env.DATABASE_URL);
const ssl = shouldUseSsl ? { rejectUnauthorized: false } : false;

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl,
  extra: shouldUseSsl
    ? {
        ssl: { rejectUnauthorized: false },
      }
    : {},
  synchronize: false,
  logging: false,
  entities: [User, Profile],
});

export const initializeDataSource = async (): Promise<DataSource> => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  return AppDataSource;
};
