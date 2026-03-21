import { AppDataSource } from './data-source';
import { logger } from '../utils/logger';

const getColumnType = async (
  queryRunner: ReturnType<typeof AppDataSource.createQueryRunner>,
  tableName: string,
  columnName: string
): Promise<string | null> => {
  const result = await queryRunner.query(
    `
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    `,
    [tableName, columnName]
  );

  return result[0]?.data_type ?? null;
};

const tableExists = async (
  queryRunner: ReturnType<typeof AppDataSource.createQueryRunner>,
  tableName: string
): Promise<boolean> => {
  const result = await queryRunner.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `,
    [tableName]
  );

  return Boolean(result[0]?.exists);
};

const ensureIntegerSequence = async (
  queryRunner: ReturnType<typeof AppDataSource.createQueryRunner>,
  tableName: 'users' | 'profiles'
): Promise<void> => {
  const sequenceName = `${tableName}_id_seq`;

  await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS ${sequenceName}`);
  await queryRunner.query(
    `ALTER TABLE ${tableName} ALTER COLUMN id SET DEFAULT nextval('${sequenceName}')`
  );
  await queryRunner.query(
    `
      SELECT setval(
        '${sequenceName}',
        COALESCE((SELECT MAX(id) FROM ${tableName}), 0) + 1,
        false
      )
    `
  );
  await queryRunner.query(`ALTER SEQUENCE ${sequenceName} OWNED BY ${tableName}.id`);
};

const convertUuidSchemaToInteger = async (
  queryRunner: ReturnType<typeof AppDataSource.createQueryRunner>
): Promise<void> => {
  await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS users_id_seq`);
  await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS new_id INTEGER`);
  await queryRunner.query(
    `ALTER TABLE users ALTER COLUMN new_id SET DEFAULT nextval('users_id_seq')`
  );
  await queryRunner.query(`UPDATE users SET new_id = nextval('users_id_seq') WHERE new_id IS NULL`);
  await queryRunner.query(
    `SELECT setval('users_id_seq', COALESCE((SELECT MAX(new_id) FROM users), 0) + 1, false)`
  );
  await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey`);
  await queryRunner.query(`ALTER TABLE users RENAME COLUMN id TO legacy_uuid_id`);
  await queryRunner.query(`ALTER TABLE users RENAME COLUMN new_id TO id`);
  await queryRunner.query(`ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id)`);
  await queryRunner.query(`ALTER SEQUENCE users_id_seq OWNED BY users.id`);

  if (await tableExists(queryRunner, 'profiles')) {
    const profileUserIdType = await getColumnType(queryRunner, 'profiles', 'user_id');

    if (profileUserIdType === 'uuid') {
      await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS profiles_id_seq`);
      await queryRunner.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS new_id INTEGER`);
      await queryRunner.query(
        `ALTER TABLE profiles ALTER COLUMN new_id SET DEFAULT nextval('profiles_id_seq')`
      );
      await queryRunner.query(
        `UPDATE profiles SET new_id = nextval('profiles_id_seq') WHERE new_id IS NULL`
      );
      await queryRunner.query(
        `SELECT setval('profiles_id_seq', COALESCE((SELECT MAX(new_id) FROM profiles), 0) + 1, false)`
      );
      await queryRunner.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS new_user_id INTEGER`);
      await queryRunner.query(`
        UPDATE profiles p
        SET new_user_id = u.id
        FROM users u
        WHERE p.user_id::text = u.legacy_uuid_id::text
          AND p.new_user_id IS NULL
      `);
      await queryRunner.query(`ALTER TABLE profiles DROP CONSTRAINT IF EXISTS fk_profiles_user_id`);
      await queryRunner.query(
        `ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_unique`
      );
      await queryRunner.query(`ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_pkey`);
      await queryRunner.query(`ALTER TABLE profiles RENAME COLUMN id TO legacy_uuid_id`);
      await queryRunner.query(`ALTER TABLE profiles RENAME COLUMN new_id TO id`);
      await queryRunner.query(`ALTER TABLE profiles RENAME COLUMN user_id TO legacy_user_id`);
      await queryRunner.query(`ALTER TABLE profiles RENAME COLUMN new_user_id TO user_id`);
      await queryRunner.query(`ALTER TABLE profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id)`);
      await queryRunner.query(
        `ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id)`
      );
      await queryRunner.query(`
        ALTER TABLE profiles
        ADD CONSTRAINT fk_profiles_user_id
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE
      `);
      await queryRunner.query(`ALTER SEQUENCE profiles_id_seq OWNED BY profiles.id`);
    }
  }
};

export const ensureDatabaseSchema = async (): Promise<void> => {
  const queryRunner = AppDataSource.createQueryRunner();

  await queryRunner.connect();

  try {
    await queryRunner.startTransaction();

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'user',
        refresh_token VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    const userIdType = await getColumnType(queryRunner, 'users', 'id');

    if (userIdType === 'uuid') {
      await convertUuidSchemaToInteger(queryRunner);
    }

    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS refresh_token VARCHAR(255);
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN id SET NOT NULL;
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
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL UNIQUE,
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
      ADD COLUMN IF NOT EXISTS user_id INTEGER;
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

    await ensureIntegerSequence(queryRunner, 'users');
    await ensureIntegerSequence(queryRunner, 'profiles');

    await queryRunner.commitTransaction();
    logger.success('Database schema check complete: users and profiles tables are ready.');
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
};
