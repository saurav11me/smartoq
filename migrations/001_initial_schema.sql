-- ==============================================================================
-- SmartO (Smart Vehicle QR) Enterprise PostgreSQL Schema v2.0
-- Target Concurrency: 100,000 Active Scans & Operations
-- Engines: AWS Aurora PostgreSQL / Supabase / Neon
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(32),
  role VARCHAR(32) NOT NULL CHECK(role IN ('ADMIN', 'OWNER', 'SHOWROOM_MANAGER', 'FLEET_MANAGER')),
  password_salt VARCHAR(64) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. Sessions (Distributed Token Store)
CREATE TABLE IF NOT EXISTS sessions (
  token_hash VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- 3. Showrooms / Dealer Network
CREATE TABLE IF NOT EXISTS showrooms (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(64) NOT NULL UNIQUE,
  city VARCHAR(128) NOT NULL,
  state VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_showrooms_code ON showrooms(code);
CREATE INDEX IF NOT EXISTS idx_showrooms_status ON showrooms(status);

-- 4. Vehicles
CREATE TABLE IF NOT EXISTS vehicles (
  id VARCHAR(64) PRIMARY KEY,
  registration VARCHAR(64) NOT NULL UNIQUE,
  make VARCHAR(128) NOT NULL,
  model VARCHAR(128) NOT NULL,
  category VARCHAR(64) NOT NULL,
  color VARCHAR(64),
  owner_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  verification_status VARCHAR(32) NOT NULL DEFAULT 'VERIFIED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_owner_id ON vehicles(owner_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_reg ON vehicles(registration);

-- 5. Batches
CREATE TABLE IF NOT EXISTS batches (
  id VARCHAR(64) PRIMARY KEY,
  prefix VARCHAR(32) NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  status VARCHAR(32) NOT NULL,
  created_by VARCHAR(64) NOT NULL REFERENCES users(id),
  template_version VARCHAR(64) NOT NULL DEFAULT 'SVQR-2.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_batches_prefix ON batches(prefix);

-- 6. QR Units (Central Identity Entity)
CREATE TABLE IF NOT EXISTS qr_units (
  id VARCHAR(64) PRIMARY KEY,
  qr_id VARCHAR(64) NOT NULL UNIQUE,
  public_token VARCHAR(128) NOT NULL UNIQUE,
  batch_id VARCHAR(64) REFERENCES batches(id) ON DELETE SET NULL,
  status VARCHAR(32) NOT NULL,
  showroom_id VARCHAR(64) REFERENCES showrooms(id) ON DELETE SET NULL,
  vehicle_id VARCHAR(64) REFERENCES vehicles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qr_units_public_token ON qr_units(public_token);
CREATE INDEX IF NOT EXISTS idx_qr_units_status ON qr_units(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_units_vehicle_id ON qr_units(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_qr_units_showroom_id ON qr_units(showroom_id);

-- 7. Inventory Ledger (Append-Only Event Stream)
CREATE TABLE IF NOT EXISTS inventory_events (
  id VARCHAR(64) PRIMARY KEY,
  qr_id VARCHAR(64) NOT NULL REFERENCES qr_units(id) ON DELETE CASCADE,
  event_type VARCHAR(64) NOT NULL,
  from_location VARCHAR(128),
  to_location VARCHAR(128),
  actor_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_events_qr_id ON inventory_events(qr_id, created_at DESC);

-- 8. Messages & Citizen Alert Reports
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(64) PRIMARY KEY,
  qr_id VARCHAR(64) NOT NULL REFERENCES qr_units(id) ON DELETE CASCADE,
  category VARCHAR(128) NOT NULL,
  note TEXT NOT NULL,
  visitor_name VARCHAR(128),
  reply_channel VARCHAR(128),
  photo_data TEXT,
  notification_status VARCHAR(64) NOT NULL DEFAULT 'DELIVERED',
  status VARCHAR(32) NOT NULL DEFAULT 'NEW',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_qr_id ON messages(qr_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status, created_at DESC);

-- 9. Audit Events (Governance & Compliance)
CREATE TABLE IF NOT EXISTS audit_events (
  id VARCHAR(64) PRIMARY KEY,
  actor_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
  actor_label VARCHAR(255) NOT NULL,
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);

-- 10. Mobile Phone OTP Store
CREATE TABLE IF NOT EXISTS otp_codes (
  id VARCHAR(64) PRIMARY KEY,
  phone VARCHAR(32) NOT NULL,
  code VARCHAR(16) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_codes_lookup ON otp_codes(phone, expires_at);
