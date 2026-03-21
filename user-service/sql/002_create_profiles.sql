CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

ALTER TABLE users
ADD COLUMN IF NOT EXISTS refresh_token VARCHAR(255);

ALTER TABLE users
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'user';

ALTER TABLE users
ALTER COLUMN role SET DEFAULT 'user';

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
