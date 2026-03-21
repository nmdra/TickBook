import { AppDataSource } from './data-source';
import { logger } from '../utils/logger';

export const ensureDatabaseSchema = async (): Promise<void> => {
  const queryRunner = AppDataSource.createQueryRunner();

  await queryRunner.connect();

  try {
    await queryRunner.startTransaction();

    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS pgcrypto;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        refresh_token VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS refresh_token VARCHAR(255);
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN role SET DEFAULT 'user';
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        address VARCHAR(255),
        phone_number VARCHAR(50),
        total_tickets_booked INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT fk_profiles_user_id
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS user_id UUID;
    `);

    await queryRunner.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS name VARCHAR(255);
    `);

    await queryRunner.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS address VARCHAR(255);
    `);

    await queryRunner.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50);
    `);

    await queryRunner.query(`
      ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS total_tickets_booked INTEGER DEFAULT 0;
    `);

    await queryRunner.query(`
      UPDATE profiles
      SET total_tickets_booked = 0
      WHERE total_tickets_booked IS NULL;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'profiles_user_id_unique'
        ) THEN
          ALTER TABLE profiles
          ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_profiles_user_id'
        ) THEN
          ALTER TABLE profiles
          ADD CONSTRAINT fk_profiles_user_id
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      INSERT INTO profiles (user_id, name, total_tickets_booked)
      SELECT
        u.id,
        split_part(u.email, '@', 1),
        0
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.user_id = u.id
      );
    `);

    await queryRunner.commitTransaction();
    logger.success('Database schema check complete: users and profiles tables are ready.');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
};
