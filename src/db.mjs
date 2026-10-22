import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const file = resolve(process.env.SQLITE_PATH || 'data/smart-vehicle.sqlite');
mkdirSync(dirname(file), { recursive: true });
export const db = new DatabaseSync(file);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('ADMIN','OWNER','SHOWROOM_MANAGER','SALES_AGENT')),
  password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS showrooms (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL, state TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY, registration TEXT NOT NULL UNIQUE, make TEXT NOT NULL,
  model TEXT NOT NULL, category TEXT NOT NULL, color TEXT, owner_id TEXT REFERENCES users(id),
  verification_status TEXT NOT NULL DEFAULT 'VERIFIED', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY, prefix TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
  status TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, template_version TEXT NOT NULL DEFAULT 'SVQR-1.0'
);
CREATE TABLE IF NOT EXISTS qr_units (
  id TEXT PRIMARY KEY, qr_id TEXT NOT NULL UNIQUE, public_token TEXT NOT NULL UNIQUE,
  batch_id TEXT REFERENCES batches(id), status TEXT NOT NULL,
  showroom_id TEXT REFERENCES showrooms(id), vehicle_id TEXT REFERENCES vehicles(id),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS qr_status_idx ON qr_units(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS qr_vehicle_idx ON qr_units(vehicle_id);
CREATE TABLE IF NOT EXISTS inventory_events (
  id TEXT PRIMARY KEY, qr_id TEXT NOT NULL REFERENCES qr_units(id), event_type TEXT NOT NULL,
  from_location TEXT, to_location TEXT, actor_id TEXT REFERENCES users(id), reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inventory_qr_idx ON inventory_events(qr_id, created_at DESC);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, qr_id TEXT NOT NULL REFERENCES qr_units(id), category TEXT NOT NULL,
  note TEXT NOT NULL, visitor_name TEXT, reply_channel TEXT, photo_data TEXT,
  notification_status TEXT NOT NULL DEFAULT 'DELIVERED', status TEXT NOT NULL DEFAULT 'NEW',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_status_idx ON messages(status, created_at DESC);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY, actor_id TEXT REFERENCES users(id), actor_label TEXT NOT NULL,
  action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_events(created_at DESC);
CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY, phone TEXT NOT NULL, code TEXT NOT NULL,
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS otp_phone_idx ON otp_codes(phone, expires_at);
`);

// Idempotent migrations for existing SQLite databases. Only the expected
// duplicate-column error is ignored; every other migration failure is fatal.
function addColumn(sql) {
  try { db.exec(sql); }
  catch (error) {
    if (!String(error?.message || '').toLowerCase().includes('duplicate column name')) throw error;
  }
}

addColumn("ALTER TABLE messages ADD COLUMN photo_data TEXT;");
addColumn("ALTER TABLE messages ADD COLUMN notification_status TEXT DEFAULT 'PENDING';");
addColumn("ALTER TABLE users ADD COLUMN phone TEXT;");
addColumn("ALTER TABLE users ADD COLUMN showroom_id TEXT REFERENCES showrooms(id);");
addColumn("ALTER TABLE qr_units ADD COLUMN fee_collected REAL DEFAULT 0;");
addColumn("ALTER TABLE qr_units ADD COLUMN payment_mode TEXT;");
addColumn("ALTER TABLE qr_units ADD COLUMN activated_at TEXT;");
addColumn("ALTER TABLE qr_units ADD COLUMN activated_by TEXT REFERENCES users(id);");
addColumn("ALTER TABLE qr_units ADD COLUMN installation_confirmed_at TEXT;");
addColumn("ALTER TABLE qr_units ADD COLUMN final_scan_confirmed_at TEXT;");
addColumn("ALTER TABLE qr_units ADD COLUMN category TEXT DEFAULT 'VEHICLE';");
addColumn("ALTER TABLE qr_units ADD COLUMN agent_id TEXT;");
addColumn("ALTER TABLE qr_units ADD COLUMN is_showroom_pending INTEGER DEFAULT 0;");
addColumn("ALTER TABLE vehicles ADD COLUMN chassis_number TEXT;");
addColumn("ALTER TABLE vehicles ADD COLUMN engine_number TEXT;");
addColumn("ALTER TABLE vehicles ADD COLUMN emergency_contact TEXT;");
addColumn("ALTER TABLE vehicles ADD COLUMN brand TEXT;");
addColumn("ALTER TABLE vehicles ADD COLUMN emergency_1_phone TEXT;");
addColumn("ALTER TABLE vehicles ADD COLUMN emergency_1_relation TEXT DEFAULT 'Father';");
addColumn("ALTER TABLE vehicles ADD COLUMN emergency_2_phone TEXT;");
addColumn("ALTER TABLE vehicles ADD COLUMN emergency_2_relation TEXT DEFAULT 'Mother';");

addColumn("ALTER TABLE showrooms ADD COLUMN region TEXT DEFAULT 'Central Bihar';");
addColumn("ALTER TABLE showrooms ADD COLUMN address TEXT;");
addColumn("ALTER TABLE showrooms ADD COLUMN map_url TEXT;");
addColumn("ALTER TABLE showrooms ADD COLUMN category TEXT DEFAULT 'Two Wheeler';");
addColumn("ALTER TABLE showrooms ADD COLUMN brand TEXT DEFAULT 'Maruti Suzuki';");
addColumn("ALTER TABLE showrooms ADD COLUMN owner_name TEXT;");
addColumn("ALTER TABLE showrooms ADD COLUMN owner_phone TEXT;");
addColumn("ALTER TABLE showrooms ADD COLUMN manager_name TEXT;");
addColumn("ALTER TABLE showrooms ADD COLUMN manager_phone TEXT;");
addColumn("ALTER TABLE showrooms ADD COLUMN pending_dues REAL DEFAULT 0;");

addColumn("ALTER TABLE batches ADD COLUMN category TEXT DEFAULT 'VEHICLE';");
addColumn("ALTER TABLE batches ADD COLUMN series_start TEXT;");
addColumn("ALTER TABLE batches ADD COLUMN series_end TEXT;");

db.exec(`
CREATE TABLE IF NOT EXISTS qr_sequences (
  prefix TEXT PRIMARY KEY,
  last_val INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sales_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  region TEXT DEFAULT 'Bihar',
  status TEXT DEFAULT 'ACTIVE',
  user_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_allocations (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES sales_agents(id),
  quantity INTEGER NOT NULL,
  series_start TEXT NOT NULL,
  series_end TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  allocated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  city TEXT NOT NULL,
  address TEXT,
  principal_name TEXT,
  contact_phone TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id),
  qr_id TEXT NOT NULL REFERENCES qr_units(id) UNIQUE,
  child_name TEXT NOT NULL,
  class_sec TEXT NOT NULL,
  roll_no TEXT,
  blood_group TEXT,
  parent_name TEXT,
  parent_phone_1 TEXT NOT NULL,
  parent_phone_2 TEXT,
  address TEXT,
  emergency_note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_requests (
  id TEXT PRIMARY KEY,
  showroom_id TEXT NOT NULL REFERENCES showrooms(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  preferred_category TEXT DEFAULT 'ALL',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'FULFILLED', 'REJECTED')),
  allocated_series_start TEXT,
  allocated_series_end TEXT,
  allocated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  fulfilled_at TEXT
);
CREATE INDEX IF NOT EXISTS stock_req_showroom_idx ON stock_requests(showroom_id, status);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  product_sku TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price REAL NOT NULL,
  total_amount REAL NOT NULL,
  payment_status TEXT DEFAULT 'PENDING',
  payment_mode TEXT,
  razorpay_payment_id TEXT,
  order_status TEXT DEFAULT 'DISPATCHED',
  tracking_awb TEXT,
  allotted_qr_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_phone_idx ON orders(customer_phone);

CREATE TABLE IF NOT EXISTS masked_calls (
  id TEXT PRIMARY KEY,
  qr_id TEXT NOT NULL,
  vehicle_id TEXT,
  caller_phone TEXT NOT NULL,
  owner_phone TEXT NOT NULL,
  virtual_bridge_number TEXT NOT NULL,
  call_duration_seconds INTEGER DEFAULT 0,
  status TEXT DEFAULT 'COMPLETED',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS masked_calls_qr_idx ON masked_calls(qr_id);

CREATE TABLE IF NOT EXISTS decal_replacements (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
  old_qr_id TEXT NOT NULL,
  new_qr_id TEXT,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'REQUESTED',
  fee REAL DEFAULT 149,
  created_at TEXT NOT NULL
);
`);

addColumn("ALTER TABLE orders ADD COLUMN access_token_hash TEXT;");
addColumn("ALTER TABLE decal_replacements ADD COLUMN tracking_awb TEXT;");
addColumn("ALTER TABLE decal_replacements ADD COLUMN shipping_address TEXT;");
addColumn("ALTER TABLE decal_replacements ADD COLUMN shipping_city TEXT;");
addColumn("ALTER TABLE decal_replacements ADD COLUMN shipping_pincode TEXT;");
addColumn("ALTER TABLE decal_replacements ADD COLUMN payment_status TEXT DEFAULT 'PENDING';");

// Enforce identity invariants in the database as well as in application code.
// Resolve any legacy duplicate active QRs per vehicle before applying the unique index.
db.exec(`
  UPDATE qr_units
  SET status = 'DEACTIVATED'
  WHERE id IN (
    SELECT q1.id
    FROM qr_units q1
    JOIN qr_units q2 ON q1.vehicle_id = q2.vehicle_id AND q1.id <> q2.id
    WHERE q1.status = 'ACTIVE' AND q2.status = 'ACTIVE'
      AND q1.updated_at < q2.updated_at
  );

  CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx
    ON users(phone) WHERE phone IS NOT NULL AND phone <> '';
  CREATE UNIQUE INDEX IF NOT EXISTS qr_one_active_per_vehicle_idx
    ON qr_units(vehicle_id) WHERE status = 'ACTIVE' AND vehicle_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS otp_expiry_idx ON otp_codes(expires_at);
  CREATE INDEX IF NOT EXISTS replacement_vehicle_status_idx ON decal_replacements(vehicle_id, status);
`);

// Opportunistic cleanup keeps the local starter database bounded.
db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
db.prepare('DELETE FROM otp_codes WHERE expires_at <= ?').run(new Date().toISOString());

export const now = () => new Date().toISOString();
export const id = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
export const token = () => randomBytes(32).toString('base64url');

import { scrypt } from 'node:crypto';
import { promisify } from 'node:util';
const scryptAsync = promisify(scrypt);

export const passwordRecord = (password) => {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
};

export const verifyPassword = (password, salt, hash) => {
  const expected=Buffer.from(hash,'hex'),actual=scryptSync(password,salt,64);
  return expected.length===actual.length && timingSafeEqual(expected,actual);
};

export const verifyPasswordAsync = async (password, salt, hash) => {
  const expected = Buffer.from(hash, 'hex');
  const actual = await scryptAsync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export const hashPasswordAsync = async (password) => {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(password, salt, 64);
  return { salt, hash: derived.toString('hex') };
};

export function seedUser(email, name, role, password, showroom_id = null) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    if (showroom_id) {
      db.prepare('UPDATE users SET showroom_id = ? WHERE email = ?').run(showroom_id, email);
    }
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  }
  const record = passwordRecord(password);
  const user = { id: id('usr'), email, name, role, showroom_id, ...record, created_at: now() };
  db.prepare('INSERT INTO users (id,email,name,role,showroom_id,password_salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?)')
    .run(user.id, user.email, user.name, user.role, user.showroom_id, user.salt, user.hash, user.created_at);
  return user;
}

function seed() {
  const bootstrapEmail = String(process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@smartoqr.in').trim().toLowerCase();
  const bootstrapPassword = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || 'SmartOAdminPass2026!#');
  
  const existingBootstrap = db.prepare("SELECT id FROM users WHERE email=?").get(bootstrapEmail);
  if (!existingBootstrap && bootstrapEmail && bootstrapPassword.length >= 14) {
    seedUser(bootstrapEmail, 'Program Administrator', 'ADMIN', bootstrapPassword);
  }

  const existingAdmin = db.prepare("SELECT * FROM users WHERE email='admin@smarto.local'").get();
  const admin = existingAdmin || seedUser('admin@smarto.local', 'SmartO Program Admin', 'ADMIN', 'SmartO-Demo-2026!');

  const existingOwner = db.prepare("SELECT * FROM users WHERE email='owner@smarto.local'").get();
  const owner = existingOwner || seedUser('owner@smarto.local', 'Aarav Kumar', 'OWNER', 'Owner-Demo-2026!');

  // Seed Bihar State Dealership Showrooms & Regional Hubs
  const showroomData = [
    // Patna (Capital Hub)
    { code: 'PAT-001', name: 'Patna Central Motors', city: 'Patna', state: 'Bihar', status: 'ACTIVE' },
    { code: 'PAT-002', name: 'Bailey Road Hyundai', city: 'Patna', state: 'Bihar', status: 'ACTIVE' },
    { code: 'PAT-003', name: 'Kankarbagh Tata Motors', city: 'Patna', state: 'Bihar', status: 'ACTIVE' },
    { code: 'PAT-004', name: 'Boring Road Honda Two-Wheelers', city: 'Patna', state: 'Bihar', status: 'ACTIVE' },
    { code: 'PAT-005', name: 'Anisabad Mahindra Commercials', city: 'Patna', state: 'Bihar', status: 'ACTIVE' },
    { code: 'PAT-006', name: 'Danapur Toyota Prime', city: 'Patna', state: 'Bihar', status: 'ACTIVE' },
    { code: 'PAT-007', name: 'Exhibition Road Kia World', city: 'Patna', state: 'Bihar', status: 'ACTIVE' },
    { code: 'PAT-008', name: 'Rajendra Nagar Hero MotoCorp', city: 'Patna', state: 'Bihar', status: 'ACTIVE' },
    { code: 'PAT-014', name: 'Kankarbagh Mahindra Prime', city: 'Patna', state: 'Bihar', status: 'ACTIVE' },

    // Muzaffarpur (North Bihar Hub)
    { code: 'MZA-001', name: 'Muzaffarpur Auto Hub (Gobarsahi)', city: 'Muzaffarpur', state: 'Bihar', status: 'ACTIVE' },
    { code: 'MZA-002', name: 'Mithila Maruti Suzuki Arena (Bairiya)', city: 'Muzaffarpur', state: 'Bihar', status: 'ACTIVE' },
    { code: 'MZA-003', name: 'Muzaffarpur Tata Commercial (Ramdayalu)', city: 'Muzaffarpur', state: 'Bihar', status: 'ACTIVE' },

    // Gaya (Magadh Region Hub)
    { code: 'GAY-001', name: 'Gaya Highway Motors (Dobhi Road)', city: 'Gaya', state: 'Bihar', status: 'ACTIVE' },
    { code: 'GAY-002', name: 'Magadh Hyundai Hub (Bodhgaya Bypass)', city: 'Gaya', state: 'Bihar', status: 'ACTIVE' },
    { code: 'GAY-003', name: 'Gaya Royal Enfield & TVS Center', city: 'Gaya', state: 'Bihar', status: 'ACTIVE' },

    // Bhagalpur (East Bihar / Silk City Hub)
    { code: 'BGP-001', name: 'Bhagalpur Smart Fleet (Zero Mile)', city: 'Bhagalpur', state: 'Bihar', status: 'ACTIVE' },
    { code: 'BGP-002', name: 'Silk City Mahindra Prime (Barari)', city: 'Bhagalpur', state: 'Bihar', status: 'ACTIVE' },
    { code: 'BGP-003', name: 'Anga Tata Motors (Tilkamanjhi)', city: 'Bhagalpur', state: 'Bihar', status: 'ACTIVE' },

    // Darbhanga (Mithilanchal Hub)
    { code: 'DBG-001', name: 'Darbhanga Auto Junction (Laheriasarai)', city: 'Darbhanga', state: 'Bihar', status: 'ACTIVE' },
    { code: 'DBG-002', name: 'Mithilanchal Hyundai & Kia (Delhi More)', city: 'Darbhanga', state: 'Bihar', status: 'ACTIVE' },

    // Purnia (Seemanchal Hub)
    { code: 'PUR-001', name: 'Seemanchal Motors Purnia (Line Bazar)', city: 'Purnia', state: 'Bihar', status: 'ACTIVE' },
    { code: 'PUR-002', name: 'Purnia Nexa Arena (Maranga Industrial)', city: 'Purnia', state: 'Bihar', status: 'ACTIVE' },

    // Begusarai (Industrial Belt)
    { code: 'BEG-001', name: 'Begusarai Industrial Auto Hub (Harrakh)', city: 'Begusarai', state: 'Bihar', status: 'ACTIVE' },
    { code: 'BEG-002', name: 'Ganga Valley Hero & Honda (Zero Mile)', city: 'Begusarai', state: 'Bihar', status: 'ACTIVE' },

    // Ara / Bhojpur (Western Gateway)
    { code: 'ARA-001', name: 'Bhojpur Hyundai & Tata (Gangi Bypass)', city: 'Ara', state: 'Bihar', status: 'ACTIVE' },
    { code: 'ARA-002', name: 'Veer Kunwar Singh Motors (Nawada Road)', city: 'Ara', state: 'Bihar', status: 'ACTIVE' },

    // Chapra / Saran Division
    { code: 'CHP-001', name: 'Saran Auto Wheels Chapra (Dahiyawan)', city: 'Chapra', state: 'Bihar', status: 'ACTIVE' },
    { code: 'CHP-002', name: 'Chapra Mahindra Commercial Hub (NH-19)', city: 'Chapra', state: 'Bihar', status: 'ACTIVE' },

    // Samastipur Hub
    { code: 'SMP-001', name: 'Samastipur Maruti Arena (Tajpur Road)', city: 'Samastipur', state: 'Bihar', status: 'ACTIVE' },
    { code: 'SMP-002', name: 'Samastipur Two-Wheeler Hub (Mohanpur)', city: 'Samastipur', state: 'Bihar', status: 'ACTIVE' },

    // Katihar (Rail & Trade Junction)
    { code: 'KTH-001', name: 'Katihar Motors & Commercials (Mirchaibari)', city: 'Katihar', state: 'Bihar', status: 'ACTIVE' },

    // Sasaram / Rohtas (GT Road Hub)
    { code: 'SAS-001', name: 'Rohtas Highway Auto Hub (GT Road)', city: 'Sasaram', state: 'Bihar', status: 'ACTIVE' },

    // Motihari / East Champaran Hub
    { code: 'MTH-001', name: 'Champaran Gateway Motors (Chhatauni)', city: 'Motihari', state: 'Bihar', status: 'ACTIVE' },

    // Bihar Sharif / Nalanda Hub
    { code: 'NAL-001', name: 'Nalanda Auto Hub (Ramchandrapur)', city: 'Bihar Sharif', state: 'Bihar', status: 'ACTIVE' },

    // Regional Interstate Hub
    { code: 'NCR-001', name: 'Noida Regional Transit Hub', city: 'Noida', state: 'Uttar Pradesh', status: 'INACTIVE' }
  ];

  const putShowroom = db.prepare(`INSERT OR IGNORE INTO showrooms (id,name,code,city,state,status,created_at) VALUES (?,?,?,?,?,?,?)`);
  const showroomMap = {};
  for (const s of showroomData) {
    const existing = db.prepare('SELECT id FROM showrooms WHERE code = ?').get(s.code);
    const sId = existing ? existing.id : id('shr');
    putShowroom.run(sId, s.name, s.code, s.city, s.state, s.status, now());
    showroomMap[s.code] = sId;
  }

  // Seed 20 Verified Vehicles across categories
  const vehicleData = [
    { reg: 'BR01AB1234', make: 'Maruti Suzuki', model: 'Baleno', cat: 'Car', color: 'Pearl White' },
    { reg: 'BR01CD5678', make: 'Hyundai', model: 'Creta SX', cat: 'Car', color: 'Titan Grey' },
    { reg: 'BR01EF9922', make: 'Tata', model: 'Nexon EV', cat: 'Car', color: 'Daytona Grey' },
    { reg: 'BR01GH3456', make: 'Mahindra', model: 'Scorpio-N', cat: 'Car', color: 'Napoli Black' },
    { reg: 'BR01JK7890', make: 'Honda', model: 'Activa 6G', cat: 'Two Wheeler', color: 'Imperial Red' },
    { reg: 'BR01LM1122', make: 'Royal Enfield', model: 'Classic 350', cat: 'Two Wheeler', color: 'Gunmetal Grey' },
    { reg: 'BR02PQ3344', make: 'Kia', model: 'Seltos GT', cat: 'Car', color: 'Glacier White' },
    { reg: 'BR02RS5566', make: 'Toyota', model: 'Fortuner Legender', cat: 'Car', color: 'Attitude Black' },
    { reg: 'BR02TU7788', make: 'Tata', model: 'Punch Creative', cat: 'Car', color: 'Atomic Orange' },
    { reg: 'BR02VW9900', make: 'Maruti Suzuki', model: 'Brezza ZXi', cat: 'Car', color: 'Magma Grey' },
    { reg: 'BR06AA1212', make: 'TVS', model: 'Jupiter 125', cat: 'Two Wheeler', color: 'Dawn Orange' },
    { reg: 'BR06BB3434', make: 'Hyundai', model: 'Venue Turbo', cat: 'Car', color: 'Denim Blue' },
    { reg: 'BR06CC5656', make: 'Mahindra', model: 'Thar 4x4', cat: 'Car', color: 'Rocky Beige' },
    { reg: 'BR06DD7878', make: 'Suzuki', model: 'Access 125', cat: 'Two Wheeler', color: 'Matte Platinum' },
    { reg: 'BR09EE9090', make: 'Tata', model: 'Harrier Dark', cat: 'Car', color: 'Oberon Black' },
    { reg: 'BR09FF1234', make: 'Honda', model: 'City ZX', cat: 'Car', color: 'Radiant Red' },
    { reg: 'BR09GG5678', make: 'Maruti Suzuki', model: 'Swift VXi', cat: 'Car', color: 'Fire Red' },
    { reg: 'BR09HH9012', make: 'Hero', model: 'Splendor Plus', cat: 'Two Wheeler', color: 'Black Silver' },
    { reg: 'BR01TR4433', make: 'Tata', model: 'Ace Gold', cat: 'Commercial', color: 'Arctic White' },
    { reg: 'BR02TR7766', make: 'Mahindra', model: 'Bolero Maxi Truck', cat: 'Commercial', color: 'Diamond White' }
  ];

  const putVehicle = db.prepare(`INSERT OR IGNORE INTO vehicles (id,registration,make,model,category,color,owner_id,verification_status,created_at) VALUES (?,?,?,?,?,?,?,'VERIFIED',?)`);
  const vehicleMap = {};
  for (const v of vehicleData) {
    const existing = db.prepare('SELECT id FROM vehicles WHERE registration = ?').get(v.reg);
    const vId = existing ? existing.id : id('veh');
    putVehicle.run(vId, v.reg, v.make, v.model, v.cat, v.color, owner.id, now());
    vehicleMap[v.reg] = vId;
  }

  // Seed QR Units across Lifecycles
  const existingQrs = db.prepare('SELECT count(*) AS n FROM qr_units').get().n;
  if (existingQrs < 20) {
    const putQr = db.prepare(`INSERT OR IGNORE INTO qr_units (id,qr_id,public_token,batch_id,status,showroom_id,vehicle_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`);
    const putEvt = db.prepare(`INSERT INTO inventory_events (id,qr_id,event_type,from_location,to_location,actor_id,reason,created_at) VALUES (?,?,?,?,?,?,?,?)`);

    // Assign active QRs to the 20 vehicles
    let qrNum = 1001;
    for (const [reg, vId] of Object.entries(vehicleMap)) {
      const qId = id('qr');
      const qrCode = `SV-BR-${String(qrNum++).padStart(8, '0')}`;
      const pubToken = token();
      const shrId = showroomMap['PAT-001'] || Object.values(showroomMap)[0];
      putQr.run(qId, qrCode, pubToken, null, 'ACTIVE', shrId, vId, now(), now());
      putEvt.run(id('evt'), qId, 'QR_ACTIVATED', `SHOWROOM:${shrId}`, `VEHICLE:${vId}`, admin.id, 'Official vehicle decal activation', now());
    }

    // Add Showroom Stock QRs
    for (let i = 0; i < 15; i++) {
      const qId = id('qr');
      const qrCode = `SV-BR-${String(qrNum++).padStart(8, '0')}`;
      const shrId = Object.values(showroomMap)[i % Object.values(showroomMap).length];
      putQr.run(qId, qrCode, token(), null, 'SHOWROOM_STOCK', shrId, null, now(), now());
    }

    // Add Central Stock QRs
    for (let i = 0; i < 10; i++) {
      const qId = id('qr');
      const qrCode = `SV-BR-${String(qrNum++).padStart(8, '0')}`;
      putQr.run(qId, qrCode, token(), null, 'CENTRAL_STOCK', null, null, now(), now());
    }
  }

  // Seed Incident Messages
  const existingMsgs = db.prepare('SELECT count(*) AS n FROM messages').get().n;
  if (existingMsgs < 5) {
    const activeQrsList = db.prepare("SELECT q.id, q.qr_id, v.registration, v.make, v.model FROM qr_units q JOIN vehicles v ON v.id=q.vehicle_id WHERE q.status='ACTIVE' LIMIT 8").all();
    const putMsg = db.prepare(`INSERT OR IGNORE INTO messages (id,qr_id,category,note,visitor_name,reply_channel,photo_data,notification_status,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'DELIVERED',?,?,?)`);

    const incidentTemplates = [
      { cat: 'Parking / Blocking', note: 'Vehicle is double-parked behind residential gate #4. Kindly move slightly.', name: 'Prem Shankar (Security)' },
      { cat: 'Vehicle Issue', note: 'Driver side headlight left ON in basement parking level B2.', name: 'Rohan Gupta' },
      { cat: 'Emergency / Safety', note: 'Rear bumper scratch reported at traffic signal crossing near Bailey road.', name: 'Sub-Inspector Sharma' },
      { cat: 'Parking / Blocking', note: 'Parked directly in front of commercial store entrance. Customers unable to enter.', name: 'Store Manager' },
      { cat: 'Vehicle Issue', note: 'Rear right tire pressure looks very low (~18 PSI). Please check before highway drive.', name: 'Fuel Station Attendant' },
      { cat: 'Emergency / Safety', note: 'Driver window rolled down halfway during heavy monsoon rain.', name: 'Bystander Citizen' },
      { cat: 'Traffic / Safety Concern', note: 'Parked on sharp blind corner near school gate. Creating severe traffic bottleneck.', name: 'Traffic Warden' }
    ];

    let mIdx = 0;
    for (const q of activeQrsList) {
      if (mIdx >= incidentTemplates.length) break;
      const t = incidentTemplates[mIdx++];
      const mId = id('msg');
      const mTime = new Date(Date.now() - (mIdx * 18 * 60 * 1000)).toISOString();
      putMsg.run(mId, q.id, t.cat, t.note, t.name, null, null, 'NEW', mTime, mTime);
    }
  }

  // Seed Showroom Dealer Managers
  const mzaShr = db.prepare("SELECT id FROM showrooms WHERE code='MZA-001'").get();
  const patShr = db.prepare("SELECT id FROM showrooms WHERE code='PAT-001'").get();

  const dealerMza = seedUser('dealer.mza@smarto.local', 'Vikramaditya (Muzaffarpur Hub)', 'SHOWROOM_MANAGER', 'Dealer-Demo-2026!', mzaShr?.id);
  const dealerPat = seedUser('dealer.patna@smarto.local', 'Rajesh Verma (Patna Central)', 'SHOWROOM_MANAGER', 'Dealer-Demo-2026!', patShr?.id);

  // Seed Initial Stock Requisitions
  const reqCount = db.prepare('SELECT count(*) AS n FROM stock_requests').get().n;
  if (reqCount === 0 && mzaShr && patShr) {
    const putReq = db.prepare(`INSERT INTO stock_requests (id, showroom_id, requested_by, quantity, preferred_category, notes, status, allocated_series_start, allocated_series_end, allocated_by, created_at, fulfilled_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
    
    // Pending Requisition from Muzaffarpur Auto Hub
    putReq.run(
      id('req'), mzaShr.id, dealerMza.id, 50, '4-Wheeler Car / SUV',
      'Festival season delivery rush. Require 50 QR decals for Maruti Arena & Hyundai Creta delivery bay.',
      'PENDING', null, null, null,
      new Date(Date.now() - 3600000 * 4).toISOString(), null
    );

    // Fulfilled Requisition for Patna Central Motors
    putReq.run(
      id('req'), patShr.id, dealerPat.id, 25, 'ALL',
      'Regular monthly stock allocation for Bailey Road and Exhibition road new vehicle fitments.',
      'FULFILLED', 'SV-BR-00001001', 'SV-BR-00001025', admin.id,
      new Date(Date.now() - 3600000 * 48).toISOString(), new Date(Date.now() - 3600000 * 24).toISOString()
    );
  }

  // Initialize fee collection on active vehicles
  db.prepare(`UPDATE qr_units SET fee_collected = 499, payment_mode = 'UPI', activated_at = created_at WHERE status = 'ACTIVE' AND (fee_collected IS NULL OR fee_collected = 0)`).run();

  // Seed Sales Team Agents
  const existingAgents = db.prepare('SELECT count(*) AS n FROM sales_agents').get().n;
  if (existingAgents === 0) {
    const putAgent = db.prepare(`INSERT INTO sales_agents (id, name, phone, email, region, status, created_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`);
    const ag1 = id('sag');
    const ag2 = id('sag');
    putAgent.run(ag1, 'Vikrant Kumar (Field Ops Lead)', '+919876543210', 'vikrant@smartoqr.in', 'Patna / Central Bihar', now());
    putAgent.run(ag2, 'Arun Kumar (Marketing & School Lead)', '+919876543211', 'arun@smartoqr.in', 'Bihar State Wide', now());

    // Initialize sequence counter if empty
    db.prepare(`INSERT OR IGNORE INTO qr_sequences (prefix, last_val) VALUES ('SVBR', 0)`).run();
    db.prepare(`INSERT OR IGNORE INTO qr_sequences (prefix, last_val) VALUES ('BR-01', 0)`).run();
    db.prepare(`INSERT OR IGNORE INTO qr_sequences (prefix, last_val) VALUES ('SCH', 0)`).run();
  }

  // Seed Demo Schools
  const existingSchools = db.prepare('SELECT count(*) AS n FROM schools').get().n;
  if (existingSchools === 0) {
    const putSchool = db.prepare(`INSERT INTO schools (id, name, code, city, address, principal_name, contact_phone, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`);
    putSchool.run(id('sch'), "St. Michael's High School", 'SCH-PAT-001', 'Patna', 'Digha Ghat, Patna, Bihar 800011', 'Fr. Norbert Menezes', '+916122262532', now());
    putSchool.run(id('sch'), 'Delhi Public School Patna', 'SCH-PAT-002', 'Patna', 'Danapur Cantonment, Patna, Bihar 801503', 'Dr. B. Singh', '+916122558800', now());
    putSchool.run(id('sch'), 'Loyola High School', 'SCH-PAT-003', 'Patna', 'Kurji, Sadaquat Ashram, Patna, Bihar 800010', 'Bro. Joseph', '+916122262272', now());
  }
}

seed();

