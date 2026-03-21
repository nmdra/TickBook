CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS new_id UUID DEFAULT gen_random_uuid();

UPDATE users
SET new_id = gen_random_uuid()
WHERE new_id IS NULL;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS new_id UUID DEFAULT gen_random_uuid();

UPDATE profiles
SET new_id = gen_random_uuid()
WHERE new_id IS NULL;

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS new_user_id UUID;

UPDATE profiles p
SET new_user_id = u.new_id
FROM users u
WHERE p.user_id::text = u.id::text
  AND p.new_user_id IS NULL;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS fk_profiles_user_id;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_unique;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_pkey;

ALTER TABLE users RENAME COLUMN id TO legacy_id;
ALTER TABLE users RENAME COLUMN new_id TO id;
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE profiles RENAME COLUMN id TO legacy_id;
ALTER TABLE profiles RENAME COLUMN new_id TO id;
ALTER TABLE profiles RENAME COLUMN user_id TO legacy_user_id;
ALTER TABLE profiles RENAME COLUMN new_user_id TO user_id;
ALTER TABLE profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_unique UNIQUE (user_id);
ALTER TABLE profiles ADD CONSTRAINT fk_profiles_user_id
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
