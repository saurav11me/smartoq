import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { db, id, now, token, passwordRecord } from './db.mjs';
import { dispatchNotification } from './notifications.mjs';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function audit(actor, action, type, entityId, details = {}) {
  db.prepare(`INSERT INTO audit_events
    (id,actor_id,actor_label,action,entity_type,entity_id,details,created_at) VALUES (?,?,?,?,?,?,?,?)`)
    .run(id('aud'), actor?.id || null, actor?.name || 'Public visitor', action, type, entityId,
      JSON.stringify(details), now());
}

const transaction = (fn) => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};

const otpPepper = process.env.OTP_PEPPER || randomBytes(32).toString('hex');
const requestOtpRate = new Map();
const verifyOtpRate = new Map();
const maskedCallRate = new Map();

function rateLimit(map, key, limit, windowMs, message) {
  const current = Date.now();
  const recent = (map.get(key) || []).filter(time => current - time < windowMs);
  if (recent.length >= limit) throw new HttpError(429, message);
  recent.push(current);
  map.set(key, recent);
  if (map.size > 5000) {
    for (const [entryKey, times] of map) {
      if (!times.some(time => current - time < windowMs)) map.delete(entryKey);
    }
  }
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const normalized = digits.length === 10 ? `+91${digits}` : `+${digits}`;
  if (!/^\+[1-9]\d{9,14}$/.test(normalized)) throw new HttpError(400, 'Enter a valid mobile number including country code.');
  return normalized;
}

function otpHash(phone, code) {
  return createHmac('sha256', otpPepper).update(`${phone}:${code}`).digest('hex');
}

function safeEqualText(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function validatePincode(value) {
  const pincode = String(value || '').trim();
  if (!/^\d{6}$/.test(pincode)) throw new HttpError(400, 'Enter a valid 6-digit postal PIN code.');
  return pincode;
}

export function dashboard() {
  const counts = Object.fromEntries(db.prepare('SELECT status, count(*) AS n FROM qr_units GROUP BY status').all().map(x => [x.status, x.n]));
  const dbMessages = db.prepare(`SELECT m.id, m.category, m.note, m.visitor_name, m.reply_channel, m.photo_data, m.notification_status, m.status, m.created_at,
    q.qr_id, v.registration, v.make, v.model, v.category AS vehicle_category
    FROM messages m
    JOIN qr_units q ON q.id=m.qr_id
    LEFT JOIN vehicles v ON v.id=q.vehicle_id
    ORDER BY m.created_at DESC LIMIT 5`).all();

  const totalQr = Object.values(counts).reduce((a, b) => a + b, 0);
  const totalMessages = db.prepare('SELECT count(*) AS n FROM messages').get().n;
  const deliveredMessages = db.prepare("SELECT count(*) AS n FROM messages WHERE notification_status LIKE 'DELIVERED%'").get().n;
  const messages24h = db.prepare('SELECT count(*) AS n FROM messages WHERE created_at >= ?').get(new Date(Date.now() - 86_400_000).toISOString()).n;
  const emergencyOpen = db.prepare("SELECT count(*) AS n FROM messages WHERE category='Emergency / Safety' AND status!='CLOSED'").get().n;
  const categoryRows = db.prepare('SELECT category, count(*) AS n FROM messages GROUP BY category').all();
  const categoryColors = ['#2563eb', '#f59e0b', '#e11d48', '#8b5cf6', '#10b981', '#64748b'];
  const categoryDistribution = categoryRows.map((row, index) => ({
    category: row.category,
    count: row.n,
    percent: totalMessages ? Math.round((row.n / totalMessages) * 100) : 0,
    color: categoryColors[index % categoryColors.length]
  }));
  const vehicleRows = db.prepare('SELECT category, count(*) AS n FROM vehicles GROUP BY category').all();
  const vehicleTotal = vehicleRows.reduce((sum, row) => sum + row.n, 0);
  const vehicleCount = category => vehicleRows.filter(row => row.category.toLowerCase().includes(category)).reduce((sum, row) => sum + row.n, 0);
  const cars = vehicleCount('car');
  const twoWheelers = vehicleRows.filter(row => /two|motor|scooter/i.test(row.category)).reduce((sum, row) => sum + row.n, 0);
  const commercial = vehicleCount('commercial');
  const percent = count => vehicleTotal ? Math.round((count / vehicleTotal) * 100) : 0;
  const telemetry7d = Array.from({ length: 7 }, (_, index) => {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (6 - index));
    const end = new Date(start.getTime() + 86_400_000);
    const row = db.prepare(`SELECT count(*) AS relays,
      sum(CASE WHEN category='Emergency / Safety' THEN 1 ELSE 0 END) AS emergencies
      FROM messages WHERE created_at>=? AND created_at<?`).get(start.toISOString(), end.toISOString());
    return {
      day: new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' }).format(start),
      scans: 0,
      relays: row.relays || 0,
      emergencies: row.emergencies || 0
    };
  });

  return {
    counts,
    totalQr,
    activeQrs: counts.ACTIVE || 0,
    openMessages: db.prepare("SELECT count(*) AS n FROM messages WHERE status IN ('NEW','ACKNOWLEDGED')").get().n,
    showroomCount: db.prepare("SELECT count(*) AS n FROM showrooms WHERE status='ACTIVE'").get().n,
    totalShowrooms: db.prepare("SELECT count(*) AS n FROM showrooms").get().n,
    vehicleCount: vehicleTotal,
    scans24h: 0,
    alertsDispatched: messages24h,
    privacyShieldRate: 100,
    alertDeliveryRate: totalMessages ? Number(((deliveredMessages / totalMessages) * 100).toFixed(1)) : 0,
    safetyEscalations: emergencyOpen,
    funnel: {
      generated: (counts.GENERATED || 0) + (counts.PRINT_QUEUED || 0) + (counts.PRINTED || 0),
      centralStock: (counts.QC_PASSED || 0) + (counts.CENTRAL_STOCK || 0),
      showroomStock: (counts.ALLOCATED || 0) + (counts.DISPATCHED || 0) + (counts.SHOWROOM_STOCK || 0),
      assigned: (counts.ASSIGNED || 0) + (counts.PENDING_ACTIVATION || 0),
      liveRoad: counts.ACTIVE || 0,
      blocked: (counts.BLOCKED || 0) + (counts.DEACTIVATED || 0)
    },
    telemetry7d,
    categoryDistribution,
    fleetDistribution: {
      cars: { label: 'Passenger 4-Wheelers (Cars/SUVs)', count: cars, percent: percent(cars), color: '#2563eb' },
      twoWheelers: { label: 'Two-Wheelers (Bikes/Scooters)', count: twoWheelers, percent: percent(twoWheelers), color: '#06b6d4' },
      commercial: { label: 'Commercial Fleets & Vans', count: commercial, percent: percent(commercial), color: '#10b981' }
    },
    actionQueues: {
      unresolvedEmergencies: emergencyOpen,
      pendingActivationOver48h: db.prepare("SELECT count(*) AS n FROM qr_units WHERE status='PENDING_ACTIVATION' AND updated_at<?").get(new Date(Date.now() - 172_800_000).toISOString()).n,
      failedDeliveryRetries: db.prepare("SELECT count(*) AS n FROM messages WHERE notification_status IN ('FAILED','NOT_CONFIGURED')").get().n,
      flaggedPhotos: 0,
      lowStockDealers: db.prepare(`SELECT count(*) AS n FROM showrooms s WHERE s.status='ACTIVE' AND
        (SELECT count(*) FROM qr_units q WHERE q.showroom_id=s.id AND q.status='SHOWROOM_STOCK') < 15`).get().n
    },
    recentIncidents: dbMessages,
    pendingActivation: counts.PENDING_ACTIVATION || 0,
    recent: db.prepare(`SELECT action,entity_type,entity_id,actor_label,details,created_at
      FROM audit_events ORDER BY created_at DESC LIMIT 8`).all().map(x => ({ ...x, details: JSON.parse(x.details) }))
  };
}

export function listQrs(status = '') {
  const sql = `SELECT q.id,q.qr_id,q.status,q.batch_id,q.showroom_id,q.vehicle_id,q.created_at,q.updated_at,
      s.name AS showroom_name,v.registration,v.make,v.model,v.category,q.public_token
    FROM qr_units q LEFT JOIN showrooms s ON s.id=q.showroom_id LEFT JOIN vehicles v ON v.id=q.vehicle_id
    ${status ? 'WHERE q.status=?' : ''} ORDER BY q.created_at DESC LIMIT 500`;
  return status ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

export function createBatch(actor, { prefix = 'SVBR', quantity, count: countArg, category = 'VEHICLE', templateVersion = 'SVQR-2.0' }) {
  const count = Number(quantity ?? countArg);
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new HttpError(400, 'Quantity must be a whole number from 1 to 10,000.');
  const cleanPrefix = String(prefix || 'SVBR').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '') || 'SVBR';
  const batchCat = ['SCHOOL', 'VEHICLE'].includes(category) ? category : 'VEHICLE';

  return transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO qr_sequences (prefix, last_val) VALUES (?, 0)`).run(cleanPrefix);
    const seqRow = db.prepare(`SELECT last_val FROM qr_sequences WHERE prefix = ?`).get(cleanPrefix);
    const startNum = (seqRow?.last_val || 0) + 1;
    const endNum = startNum + count - 1;
    db.prepare(`UPDATE qr_sequences SET last_val = ? WHERE prefix = ?`).run(endNum, cleanPrefix);

    const seriesStart = `${cleanPrefix}-${String(startNum).padStart(8, '0')}`;
    const seriesEnd = `${cleanPrefix}-${String(endNum).padStart(8, '0')}`;
    const batchId = id('bat'), at = now();

    db.prepare(`INSERT INTO batches (id, prefix, quantity, category, series_start, series_end, status, created_by, created_at, template_version)
      VALUES (?, ?, ?, ?, ?, ?, 'GENERATED', ?, ?, ?)`)
      .run(batchId, cleanPrefix, count, batchCat, seriesStart, seriesEnd, actor.id, at, String(templateVersion).slice(0, 32));

    const insert = db.prepare(`INSERT INTO qr_units (id, qr_id, public_token, batch_id, category, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'GENERATED', ?, ?)`);
    const event = db.prepare(`INSERT INTO inventory_events (id, qr_id, event_type, from_location, to_location, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);

    for (let i = 0; i < count; i++) {
      const serial = String(startNum + i).padStart(8, '0');
      const qrId = `${cleanPrefix}-${serial}`;
      const unitId = id('qr');
      insert.run(unitId, qrId, token(), batchId, batchCat, at, at);
      event.run(id('evt'), unitId, 'GENERATED', 'SYSTEM', 'PRODUCTION', actor.id, at);
    }

    audit(actor, 'BATCH_CREATED', 'batch', batchId, { prefix: cleanPrefix, quantity: count, category: batchCat, seriesStart, seriesEnd });
    return { id: batchId, batchId, prefix: cleanPrefix, quantity: count, count, category: batchCat, seriesStart, seriesEnd, status: 'GENERATED', createdAt: at };
  });
}

const actions = {
  'queue-print': { from: 'GENERATED', to: 'PRINT_QUEUED', event: 'PRINT_QUEUED' },
  'mark-printed': { from: 'PRINT_QUEUED', to: 'PRINTED', event: 'PRINTED' },
  'qc-pass': { from: 'PRINTED', to: 'QC_PASSED', event: 'QC_PASSED' },
  'qc-fail': { from: 'PRINTED', to: 'BLOCKED', event: 'QC_FAILED' },
  'central-receive': { from: 'QC_PASSED', to: 'CENTRAL_STOCK', event: 'CENTRAL_RECEIVED' },
  'allocate': { from: 'CENTRAL_STOCK', to: 'ALLOCATED', event: 'ALLOCATED', needsShowroom: true },
  'dispatch': { from: 'ALLOCATED', to: 'DISPATCHED', event: 'DISPATCHED' },
  'showroom-receive': { from: 'DISPATCHED', to: 'SHOWROOM_STOCK', event: 'SHOWROOM_RECEIVED' },
  'assign': { from: 'SHOWROOM_STOCK', to: 'ASSIGNED', event: 'ASSIGNED', needsVehicle: true },
  'confirm-installation': { from: 'ASSIGNED', to: 'PENDING_ACTIVATION', event: 'PENDING_ACTIVATION', needsInstallation: true },
  'activate': { from: 'PENDING_ACTIVATION', to: 'ACTIVE', event: 'ACTIVATED', needsActivation: true },
  'block': { from: 'ACTIVE', to: 'BLOCKED', event: 'BLOCKED' },
  'deactivate': { from: 'BLOCKED', to: 'DEACTIVATED', event: 'DEACTIVATED' }
};

export function transitionQr(actor, unitId, action, input = {}) {
  const rule = actions[action];
  if (!rule) throw new HttpError(400, 'Unknown lifecycle action.');
  return transaction(() => {
    const q = db.prepare('SELECT * FROM qr_units WHERE id=?').get(unitId);
    if (!q) throw new HttpError(404, 'QR unit not found.');
    if (q.status !== rule.from) throw new HttpError(409, `Cannot ${action} a QR in ${q.status} status.`);
    let showroomId = q.showroom_id, vehicleId = q.vehicle_id;
    if (rule.needsShowroom) {
      showroomId = String(input.showroomId || '');
      if (!db.prepare("SELECT id FROM showrooms WHERE id=? AND status='ACTIVE'").get(showroomId)) throw new HttpError(400, 'Choose an active showroom.');
    }
    if (rule.needsVehicle) {
      vehicleId = String(input.vehicleId || '');
      const vehicle = db.prepare("SELECT id FROM vehicles WHERE id=? AND verification_status='VERIFIED'").get(vehicleId);
      if (!vehicle) throw new HttpError(400, 'Choose a verified vehicle.');
      if (db.prepare("SELECT id FROM qr_units WHERE vehicle_id=? AND status='ACTIVE'").get(vehicleId)) throw new HttpError(409, 'This vehicle already has an active QR.');
    }
    if (rule.needsInstallation && input.installationConfirmed !== true) throw new HttpError(400, 'Confirm the QR is physically installed before continuing.');
    if (rule.needsActivation) {
      if (!['ADMIN', 'SHOWROOM_MANAGER'].includes(actor.role)) throw new HttpError(403, 'Activation requires an authorized approver.');
      if (!q.installation_confirmed_at || input.finalScanConfirmed !== true) throw new HttpError(400, 'A persisted installation confirmation and final scan are required.');
      if (!vehicleId || !db.prepare("SELECT id FROM vehicles WHERE id=? AND verification_status='VERIFIED'").get(vehicleId)) throw new HttpError(409, 'A verified vehicle assignment is required.');
      if (db.prepare("SELECT id FROM qr_units WHERE vehicle_id=? AND status='ACTIVE' AND id<>?").get(vehicleId, unitId)) throw new HttpError(409, 'Vehicle already has an active QR.');
    }
    const at = now();
    const installationAt = rule.needsInstallation ? at : q.installation_confirmed_at;
    const finalScanAt = rule.needsActivation ? at : q.final_scan_confirmed_at;
    db.prepare('UPDATE qr_units SET status=?,showroom_id=?,vehicle_id=?,installation_confirmed_at=?,final_scan_confirmed_at=?,updated_at=? WHERE id=?')
      .run(rule.to, showroomId, vehicleId, installationAt, finalScanAt, at, unitId);
    const toLocation = vehicleId && ['assign', 'confirm-installation', 'activate', 'block', 'deactivate'].includes(action)
      ? `VEHICLE:${vehicleId}`
      : (showroomId ? `SHOWROOM:${showroomId}` : rule.to);
    db.prepare(`INSERT INTO inventory_events (id,qr_id,event_type,from_location,to_location,actor_id,reason,created_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(id('evt'), unitId, rule.event, q.showroom_id || q.status,
      toLocation, actor.id,
      String(input.reason || '').slice(0, 240), at);
    audit(actor, rule.event, 'qr_unit', unitId, { from: q.status, to: rule.to, showroomId, vehicleId });
    return db.prepare('SELECT id,qr_id,status,showroom_id,vehicle_id,updated_at FROM qr_units WHERE id=?').get(unitId);
  });
}

export function listShowrooms() {
  return db.prepare('SELECT * FROM showrooms ORDER BY name').all();
}

export function createShowroom(actor, input) {
  const name = String(input.name || '').trim();
  if (name.length < 3 || name.length > 120) throw new HttpError(400, 'Showroom name must be between 3 and 120 characters.');

  const city = String(input.city || 'Patna').trim();
  const region = String(input.region || 'Central Bihar').trim();
  const state = String(input.state || 'Bihar').trim();
  const address = String(input.address || '').trim();
  const mapUrl = String(input.mapUrl || input.map_url || '').trim();
  const category = ['Two Wheeler', 'Four Wheeler', 'Commercial', 'Multi-Brand'].includes(input.category) ? input.category : 'Two Wheeler';
  const brand = String(input.brand || 'Maruti Suzuki').trim();
  const ownerName = String(input.ownerName || '').trim();
  const ownerPhone = input.ownerPhone ? normalizePhone(input.ownerPhone) : '';
  const managerName = String(input.managerName || '').trim();
  const managerPhone = input.managerPhone ? normalizePhone(input.managerPhone) : '';

  // Auto-generate unique dealer code e.g. PAT-015
  const prefix = (city.length >= 3 ? city.slice(0, 3).toUpperCase() : 'HUB');
  const count = db.prepare('SELECT count(*) AS n FROM showrooms').get().n + 1;
  const code = `${prefix}-${String(count).padStart(3, '0')}`;

  const showroomId = id('shr');
  const at = now();

  return transaction(() => {
    db.prepare(`INSERT INTO showrooms (id, name, code, city, region, state, address, map_url, category, brand, owner_name, owner_phone, manager_name, manager_phone, status, pending_dues, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', 0, ?)`)
      .run(showroomId, name, code, city, region, state, address, mapUrl, category, brand, ownerName, ownerPhone, managerName, managerPhone, at);

    // Auto-generate login credentials for Showroom Manager
    const cleanCode = code.toLowerCase().replace(/[^a-z0-9]/g, '');
    const managerEmail = `dealer.${cleanCode}@smartoqr.in`;
    const tempPassword = `SmartO@${code.replace('-', '')}2026`;
    const rec = passwordRecord(tempPassword);
    const userId = id('usr');

    db.prepare(`INSERT INTO users (id, email, name, role, phone, showroom_id, password_salt, password_hash, created_at)
      VALUES (?, ?, ?, 'SHOWROOM_MANAGER', ?, ?, ?, ?, ?)`)
      .run(userId, managerEmail, managerName || `${name} Manager`, managerPhone || null, showroomId, rec.salt, rec.hash, at);

    audit(actor, 'SHOWROOM_CREATED', 'showroom', showroomId, { name, code, city, brand, managerEmail });

    const created = db.prepare('SELECT * FROM showrooms WHERE id = ?').get(showroomId);
    return {
      showroom: created,
      managerCredentials: {
        email: managerEmail,
        tempPassword,
        managerName: managerName || `${name} Manager`,
        managerPhone
      }
    };
  });
}

export function listVehicles() {
  return db.prepare(`SELECT v.id,v.registration,v.make,v.model,v.category,v.color,v.verification_status,u.name AS owner_name,u.phone AS owner_phone
    FROM vehicles v LEFT JOIN users u ON u.id=v.owner_id ORDER BY v.created_at DESC`).all();
}

export function listMessages() {
  return db.prepare(`SELECT m.id, m.category, m.note, m.visitor_name, m.reply_channel, m.photo_data, m.notification_status, m.status, m.created_at,
    q.qr_id, v.registration, v.make, v.model FROM messages m JOIN qr_units q ON q.id=m.qr_id
    LEFT JOIN vehicles v ON v.id=q.vehicle_id ORDER BY m.created_at DESC LIMIT 200`).all();
}

export function updateMessage(actor, messageId, status) {
  if (!['ACKNOWLEDGED', 'CLOSED'].includes(status)) throw new HttpError(400, 'Unsupported message status.');
  const item = db.prepare('SELECT id,status FROM messages WHERE id=?').get(messageId);
  if (!item) throw new HttpError(404, 'Message not found.');
  db.prepare('UPDATE messages SET status=?,updated_at=? WHERE id=?').run(status, now(), messageId);
  audit(actor, `MESSAGE_${status}`, 'message', messageId, { from: item.status, to: status });
  return { id: messageId, status };
}

export function publicQr(tokenValue) {
  const q = db.prepare(`SELECT q.id, q.qr_id, q.status, q.category AS qr_category,
    v.make, v.model, v.category, v.brand, v.registration,
    v.emergency_1_phone, v.emergency_1_relation, v.emergency_2_phone, v.emergency_2_relation,
    c.child_name, c.class_sec, c.blood_group, c.parent_name, c.parent_phone_1, c.parent_phone_2,
    s.name AS school_name, s.contact_phone AS school_phone
    FROM qr_units q
    LEFT JOIN vehicles v ON v.id=q.vehicle_id
    LEFT JOIN children c ON c.qr_id=q.id
    LEFT JOIN schools s ON s.id=c.school_id
    WHERE q.public_token=?`).get(tokenValue);

  if (!q || q.status !== 'ACTIVE') return { active: false, qrId: q?.qr_id };

  if (q.qr_category === 'SCHOOL' || q.child_name) {
    return {
      active: true,
      category: 'SCHOOL',
      qrId: q.qr_id,
      child: {
        name: q.child_name,
        school: q.school_name,
        classSec: q.class_sec,
        bloodGroup: q.blood_group,
        contacts: [
          q.parent_phone_1 ? { phone: q.parent_phone_1, relation: 'Parent / Father' } : null,
          q.parent_phone_2 ? { phone: q.parent_phone_2, relation: 'Parent / Mother' } : null,
          q.school_phone ? { phone: q.school_phone, relation: 'School Emergency' } : null
        ].filter(Boolean)
      }
    };
  }

  // Vehicle Decal:
  return {
    active: true,
    category: 'VEHICLE',
    qrId: q.qr_id,
    vehicle: {
      make: q.make || q.brand,
      model: q.model,
      category: q.category,
      registration: q.registration ? `${q.registration.slice(0, 4)}••••${q.registration.slice(-2)}` : 'VERIFIED'
    },
    emergencyContacts: [
      q.emergency_1_phone ? { phone: q.emergency_1_phone, relation: q.emergency_1_relation || 'Father' } : null,
      q.emergency_2_phone ? { phone: q.emergency_2_phone, relation: q.emergency_2_relation || 'Mother' } : null
    ].filter(Boolean)
  };
}

export function lookupQr(query) {
  const clean = String(query || '').trim();
  const q = db.prepare(`SELECT q.id, q.qr_id, q.public_token, q.status, q.showroom_id, q.vehicle_id, q.updated_at,
    s.name AS showroom_name, v.registration, v.make, v.model, v.category
    FROM qr_units q
    LEFT JOIN showrooms s ON s.id=q.showroom_id
    LEFT JOIN vehicles v ON v.id=q.vehicle_id
    WHERE q.qr_id=? OR q.public_token=? OR v.registration=?`).get(clean, clean, clean);
  if (!q) throw new HttpError(404, 'No QR unit found matching identifier or vehicle plate.');
  return q;
}

const publicRate = new Map();

export async function createPublicMessage(tokenValue, input, ip) {
  if (input.consent !== true) throw new HttpError(400, 'Please confirm that this message may be shared with the vehicle owner.');
  
  const current = Date.now();
  const bucket = (publicRate.get(ip) || []).filter(t => current - t < 60_000);
  if (bucket.length >= 10) throw new HttpError(429, 'Rate limit exceeded. Please wait a moment before sending another alert.');
  bucket.push(current);
  publicRate.set(ip, bucket);
  if (publicRate.size > 5000) {
    for (const [key, times] of publicRate) {
      if (!times.some(t => current - t < 60_000)) publicRate.delete(key);
    }
  }

  const q = db.prepare(`SELECT q.id, q.qr_id, q.vehicle_id, v.registration, v.make, v.model, u.phone AS owner_phone
    FROM qr_units q
    LEFT JOIN vehicles v ON v.id = q.vehicle_id
    LEFT JOIN users u ON u.id = v.owner_id
    WHERE q.public_token = ? AND q.status = 'ACTIVE'`).get(tokenValue);
  if (!q) throw new HttpError(404, 'This vehicle QR is not active.');

  const categories = ['Emergency / Safety', 'Parking / Blocking', 'Vehicle Issue', 'Traffic / Safety Concern', 'General Message', 'Other'];
  const category = String(input.category || '');
  if (!categories.includes(category)) throw new HttpError(400, 'Select a valid reason.');

  const note = String(input.note || '').trim();
  if (note.length < 4 || note.length > 1000) throw new HttpError(400, 'Message must be between 4 and 1,000 characters.');

  const visitorName = String(input.name || '').trim().slice(0, 80) || null;
  const replyChannel = String(input.replyChannel || '').trim().slice(0, 80) || null;
  const photoData = (input.photoData && String(input.photoData).startsWith('data:image/')) ? String(input.photoData).slice(0, 2_000_000) : null;
  const messageId = id('msg'), at = now();

  db.prepare(`INSERT INTO messages (id, qr_id, category, note, visitor_name, reply_channel, photo_data, notification_status, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', 'NEW', ?, ?)`).run(messageId, q.id, category, note, visitorName, replyChannel, photoData, at, at);

  // Persist first so a slow or failed external provider cannot lose the alert.
  const dispatchRes = await dispatchNotification({
    messageId: messageId.toUpperCase(),
    qrId: q.qr_id,
    category,
    note,
    vehicle: q.registration ? { registration: q.registration, make: q.make, model: q.model } : null,
    ownerPhone: q.owner_phone,
    visitorName,
    hasPhoto: !!photoData
  });
  db.prepare('UPDATE messages SET notification_status=?,updated_at=? WHERE id=?').run(dispatchRes.status, now(), messageId);

  audit(null, 'PUBLIC_MESSAGE_CREATED', 'message', messageId, {
    qr_id: q.qr_id,
    category,
    has_photo: !!photoData,
    channels: dispatchRes.channels
  });

  return {
    reference: messageId.toUpperCase(),
    message: dispatchRes.success
      ? 'Your alert has been recorded and delivered to the configured owner channel.'
      : 'Your alert has been recorded in the owner dashboard; external delivery is not currently available.',
    notificationStatus: dispatchRes.status
  };
}

export function ownerHome(ownerId) {
  const vehicles = db.prepare(`SELECT v.id,v.registration,v.make,v.model,v.category,v.color,v.chassis_number,v.engine_number,v.emergency_contact,
    q.qr_id,q.public_token,q.status AS qr_status FROM vehicles v LEFT JOIN qr_units q ON q.vehicle_id=v.id AND q.status='ACTIVE'
    WHERE v.owner_id=? ORDER BY v.created_at`).all(ownerId);
  const messages = db.prepare(`SELECT m.id, m.category, m.note, m.visitor_name, m.photo_data, m.notification_status, m.status, m.created_at, q.qr_id,
    v.registration FROM messages m JOIN qr_units q ON q.id=m.qr_id JOIN vehicles v ON v.id=q.vehicle_id
    WHERE v.owner_id=? ORDER BY m.created_at DESC LIMIT 25`).all(ownerId);
  return { vehicles, messages };
}

export function auditLog() {
  return db.prepare(`SELECT id,actor_label,action,entity_type,entity_id,details,created_at FROM audit_events ORDER BY created_at DESC LIMIT 150`)
    .all().map(x => ({ ...x, details: JSON.parse(x.details) }));
}

export function requestOtp(phone, ip = 'unknown') {
  const cleanPhone = normalizePhone(phone);
  rateLimit(requestOtpRate, `${ip}:${cleanPhone}`, 3, 15 * 60_000, 'Too many OTP requests. Try again in 15 minutes.');
  const testMode = process.env.OTP_TEST_MODE === 'true' || process.env.NODE_ENV !== 'production';
  if (!testMode) throw new HttpError(503, 'OTP delivery is not configured. Use password sign-in or configure an approved SMS provider.');

  const code = String(randomInt(100000, 1000000));
  const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM otp_codes WHERE expires_at <= ?').run(now());
  db.prepare('DELETE FROM otp_codes WHERE phone = ?').run(cleanPhone);
  db.prepare('INSERT INTO otp_codes (id, phone, code, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id('otp'), cleanPhone, otpHash(cleanPhone, code), expires, now());
  return { ok: true, phone: cleanPhone, testOtp: code, message: 'Development OTP generated. Never enable OTP_TEST_MODE in production.' };
}

export function verifyOtp(phone, code, ip = 'unknown') {
  const cleanPhone = normalizePhone(phone);
  const cleanCode = String(code || '').trim();
  if (!/^\d{6}$/.test(cleanCode)) throw new HttpError(400, 'Enter the 6-digit OTP code.');
  rateLimit(verifyOtpRate, `${ip}:${cleanPhone}`, 5, 15 * 60_000, 'Too many OTP verification attempts. Try again in 15 minutes.');
  const row = db.prepare('SELECT * FROM otp_codes WHERE phone = ? AND expires_at > ?').get(cleanPhone, now());
  const valid = row && safeEqualText(row.code, otpHash(cleanPhone, cleanCode));
  if (!valid) throw new HttpError(400, 'Invalid or expired OTP code. Please request a new one.');
  db.prepare('DELETE FROM otp_codes WHERE phone = ?').run(cleanPhone);

  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone);
  if (!user) {
    const userId = id('usr');
    const email = `owner_${cleanPhone.slice(-6)}_${randomBytes(4).toString('hex')}@smarto.local`;
    const pass = passwordRecord(randomBytes(32).toString('base64url'));
    db.prepare(`INSERT INTO users (id, email, name, role, phone, password_salt, password_hash, created_at)
      VALUES (?, ?, ?, 'OWNER', ?, ?, ?, ?)`).run(userId, email, `Vehicle Owner (${cleanPhone.slice(-4)})`, cleanPhone, pass.salt, pass.hash, now());
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  }

  audit(user, 'OTP_LOGIN_SUCCESS', 'user', user.id, { phoneLast4: cleanPhone.slice(-4) });
  return { id: user.id, email: user.email, name: user.name, role: user.role, phone: cleanPhone };
}

/* ==========================================================================
   Showroom / Dealer Vendor Operations
   ========================================================================== */

function getActorShowroomId(actor) {
  if (actor.showroom_id) return actor.showroom_id;
  if (actor.role === 'ADMIN') {
    const first = db.prepare('SELECT id FROM showrooms WHERE status = "ACTIVE" LIMIT 1').get();
    return first ? first.id : null;
  }
  throw new HttpError(403, 'Your account is not linked to any authorized dealership showroom.');
}

export function dealerDashboard(actor, requestedShowroomId = null) {
  if (actor.role !== 'ADMIN' && requestedShowroomId && requestedShowroomId !== actor.showroom_id) {
    throw new HttpError(403, 'You cannot access another dealership showroom.');
  }
  const showroomId = actor.role === 'ADMIN' && requestedShowroomId ? requestedShowroomId : getActorShowroomId(actor);
  const shr = db.prepare('SELECT id, name, code, city, state, status, created_at FROM showrooms WHERE id = ?').get(showroomId);
  if (!shr) throw new HttpError(404, 'Dealership showroom not found.');

  // Metric counts
  const readyStock = db.prepare("SELECT count(*) AS n FROM qr_units WHERE showroom_id = ? AND status = 'SHOWROOM_STOCK'").get(showroomId).n;
  const activeProtected = db.prepare("SELECT count(*) AS n FROM qr_units WHERE showroom_id = ? AND status = 'ACTIVE'").get(showroomId).n;
  const pendingActivation = db.prepare("SELECT count(*) AS n FROM qr_units WHERE showroom_id = ? AND status = 'PENDING_ACTIVATION'").get(showroomId).n;
  const feesCollected = db.prepare("SELECT coalesce(sum(fee_collected), 0) AS total FROM qr_units WHERE showroom_id = ? AND status = 'ACTIVE'").get(showroomId).total;
  const pendingDues = db.prepare("SELECT coalesce(sum(fee_collected), 0) AS total FROM qr_units WHERE showroom_id = ? AND is_showroom_pending = 1").get(showroomId).total;
  const customerPaid = feesCollected - pendingDues;
  const totalAllocated = readyStock + activeProtected + pendingActivation;

  // Recent Stock Requisitions
  const stockRequests = db.prepare('SELECT * FROM stock_requests WHERE showroom_id = ? ORDER BY created_at DESC LIMIT 8').all(showroomId);

  // Recent 10 Vehicle Decal Fitments
  const recentFitments = db.prepare(`
    SELECT q.id, q.qr_id, q.status, q.fee_collected, q.payment_mode, q.is_showroom_pending, coalesce(q.activated_at, q.updated_at) AS fitted_at,
           v.registration, v.make, v.model, v.category, v.brand,
           u.name AS owner_name, u.phone AS owner_phone
    FROM qr_units q
    JOIN vehicles v ON v.id = q.vehicle_id
    LEFT JOIN users u ON u.id = v.owner_id
    WHERE q.showroom_id = ? AND q.status = 'ACTIVE'
    ORDER BY coalesce(q.activated_at, q.updated_at) DESC
    LIMIT 10
  `).all(showroomId);

  // Unassigned QR inventory ready for immediate mobile scanning
  const unassignedStock = db.prepare(`
    SELECT id, qr_id, public_token, status, created_at
    FROM qr_units
    WHERE showroom_id = ? AND status = 'SHOWROOM_STOCK'
    ORDER BY qr_id ASC
    LIMIT 100
  `).all(showroomId);

  return {
    showroom: shr,
    metrics: {
      readyStock,
      activeProtected,
      pendingActivation,
      totalAllocated,
      feesCollected,
      pendingDues,
      customerPaid
    },
    stockRequests,
    recentFitments,
    unassignedStock
  };
}

export function dealerRequestStock(actor, input) {
  const showroomId = getActorShowroomId(actor);
  const quantity = parseInt(input.quantity, 10);
  if (isNaN(quantity) || quantity < 5 || quantity > 500) {
    throw new HttpError(400, 'Requisition quantity must be between 5 and 500 units.');
  }

  const preferredCategory = String(input.preferredCategory || 'ALL').trim();
  const notes = String(input.notes || '').trim();
  const reqId = id('req');

  db.prepare(`
    INSERT INTO stock_requests (id, showroom_id, requested_by, quantity, preferred_category, notes, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
  `).run(reqId, showroomId, actor.id, quantity, preferredCategory, notes, now());

  audit(actor, 'STOCK_REQUESTED', 'stock_request', reqId, { showroomId, quantity, preferredCategory });
  return db.prepare('SELECT * FROM stock_requests WHERE id = ?').get(reqId);
}

export function dealerGetRequests(actor) {
  const showroomId = getActorShowroomId(actor);
  return db.prepare('SELECT * FROM stock_requests WHERE showroom_id = ? ORDER BY created_at DESC').all(showroomId);
}

export function adminListRequisitions() {
  return db.prepare(`
    SELECT r.*, s.name AS showroom_name, s.code AS showroom_code, s.city AS showroom_city, u.name AS requester_name
    FROM stock_requests r
    JOIN showrooms s ON s.id = r.showroom_id
    JOIN users u ON u.id = r.requested_by
    ORDER BY CASE WHEN r.status = 'PENDING' THEN 0 ELSE 1 END, r.created_at DESC
  `).all();
}

export function adminAllotStock(actor, requestId) {
  return transaction(() => {
  const req = db.prepare('SELECT * FROM stock_requests WHERE id = ?').get(requestId);
  if (!req) throw new HttpError(404, 'Stock requisition not found.');
  if (req.status !== 'PENDING') throw new HttpError(400, `This request is already marked as ${req.status}.`);

  const qty = req.quantity;
  // Fetch available Central Stock QRs
  let centralQrs = db.prepare("SELECT id, qr_id FROM qr_units WHERE status = 'CENTRAL_STOCK' ORDER BY qr_id ASC LIMIT ?").all(qty);

  // Printing and QC are mandatory. Never manufacture inventory by skipping lifecycle stages.
  if (centralQrs.length < qty) {
    throw new HttpError(409, `Only ${centralQrs.length} QC-approved central-stock units are available; ${qty} are required.`);
  }

  const allottedIds = centralQrs.map(x => x.id);
  const at = now();

  // Allot directly to the showroom
  const putEvt = db.prepare(`INSERT INTO inventory_events (id,qr_id,event_type,from_location,to_location,actor_id,reason,created_at) VALUES (?,?,?,?,?,?,?,?)`);
  const updateUnit = db.prepare(`UPDATE qr_units SET status = 'SHOWROOM_STOCK', showroom_id = ?, updated_at = ? WHERE id = ?`);

  for (const q of centralQrs) {
    updateUnit.run(req.showroom_id, at, q.id);
    putEvt.run(id('evt'), q.id, 'SHOWROOM_RECEIVED', 'CENTRAL_STOCK', `SHOWROOM:${req.showroom_id}`, actor.id, `Stock Requisition ${req.id} fulfilled`, at);
  }

  const seriesStart = centralQrs[0].qr_id;
  const seriesEnd = centralQrs[centralQrs.length - 1].qr_id;

  db.prepare(`
    UPDATE stock_requests
    SET status = 'FULFILLED', allocated_series_start = ?, allocated_series_end = ?, allocated_by = ?, fulfilled_at = ?
    WHERE id = ?
  `).run(seriesStart, seriesEnd, actor.id, at, req.id);

  audit(actor, 'STOCK_ALLOTTED', 'stock_request', req.id, {
    showroomId: req.showroom_id,
    quantity: centralQrs.length,
    seriesStart,
    seriesEnd
  });

  return {
    success: true,
    requestId: req.id,
    allottedCount: centralQrs.length,
    seriesStart,
    seriesEnd,
    fulfilledAt: at
  };
  });
}

export function dealerActivateDecal(actor, input) {
  const showroomId = getActorShowroomId(actor);
  let rawCode = String(input.qrCode || '').trim();

  // Handle URL format: extract token or ID if passed full URL
  if (rawCode.includes('/scan/')) {
    rawCode = rawCode.split('/scan/').pop().split('?')[0].split('#')[0];
  }

  // 1. Owner mobile number is primary & first
  const ownerPhone = input.ownerPhone ? normalizePhone(input.ownerPhone) : null;
  if (!ownerPhone) throw new HttpError(400, 'Owner mobile number is required.');

  // 2. Vehicle registration plate (or temporary plate)
  let reg = String(input.registration || '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (!reg) {
    reg = `TEMP-${id('reg').slice(-6).toUpperCase()}`;
  }

  // 3. Brand auto-select / chosen from dropdown
  const brand = String(input.brand || input.make || 'Maruti Suzuki').trim();
  const model = String(input.model || 'Standard Model').trim();
  const category = String(input.category || 'Car').trim();
  const ownerName = String(input.ownerName || '').trim();

  // 4. Emergency contact details with relation
  const emergency1Phone = input.emergency1Phone ? normalizePhone(input.emergency1Phone) : null;
  const emergency1Relation = String(input.emergency1Relation || 'Father').trim();
  const emergency2Phone = input.emergency2Phone ? normalizePhone(input.emergency2Phone) : null;
  const emergency2Relation = String(input.emergency2Relation || 'Mother').trim();

  // 5. Fixed single fee collection: ₹499 (with GST)
  const feeCollected = 499;

  // 6. Payment mode: UPI, Cash, Card, Showroom Payment (replaces Complimentary)
  const paymentMode = ['UPI', 'Cash', 'Card', 'Showroom Payment'].includes(input.paymentMode) ? input.paymentMode : 'UPI';
  const isShowroomPending = (paymentMode === 'Showroom Payment') ? 1 : 0;

  if (rawCode.length < 4 || rawCode.length > 200) throw new HttpError(400, 'Enter a valid QR decal identifier.');

  return transaction(() => {
    const q = db.prepare(`SELECT * FROM qr_units
      WHERE (qr_id = ? OR id = ? OR public_token = ?) AND showroom_id = ?`)
      .get(rawCode, rawCode, rawCode, showroomId);
    if (!q) {
      const other = db.prepare('SELECT id, qr_id FROM qr_units WHERE qr_id = ? OR id = ? OR public_token = ?').get(rawCode, rawCode, rawCode);
      if (other) throw new HttpError(403, `QR decal ${other.qr_id} belongs to different inventory.`);
      throw new HttpError(404, 'QR decal was not found in this showroom inventory.');
    }
    if (q.status !== 'SHOWROOM_STOCK') throw new HttpError(409, `QR decal ${q.qr_id} must be in SHOWROOM_STOCK before activation.`);

    let v = db.prepare('SELECT * FROM vehicles WHERE registration = ?').get(reg);
    const at = now();
    if (!v) {
      const vId = id('veh');
      db.prepare(`INSERT INTO vehicles
        (id, registration, make, model, category, brand, emergency_1_phone, emergency_1_relation, emergency_2_phone, emergency_2_relation, verification_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', ?)`)
        .run(vId, reg, brand, model, category, brand, emergency1Phone, emergency1Relation, emergency2Phone, emergency2Relation, at);
      v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vId);
    } else {
      db.prepare(`UPDATE vehicles SET make=?,brand=?,emergency_1_phone=?,emergency_1_relation=?,emergency_2_phone=?,emergency_2_relation=? WHERE id=?`)
        .run(brand, brand, emergency1Phone, emergency1Relation, emergency2Phone, emergency2Relation, v.id);
    }

    const alreadyActive = db.prepare("SELECT qr_id FROM qr_units WHERE vehicle_id=? AND status='ACTIVE' AND id<>?").get(v.id, q.id);
    if (alreadyActive) throw new HttpError(409, `Vehicle already has active QR ${alreadyActive.qr_id}.`);

    let owner = db.prepare('SELECT * FROM users WHERE phone = ?').get(ownerPhone);
    if (owner && owner.role !== 'OWNER') throw new HttpError(409, 'This phone number belongs to a non-owner account.');
    if (!owner) {
      const uId = id('usr');
      const pass = passwordRecord(randomBytes(32).toString('base64url'));
      const email = `owner_${ownerPhone.slice(-6)}_${randomBytes(4).toString('hex')}@smartoqr.in`;
      db.prepare(`INSERT INTO users (id, email, name, role, phone, password_salt, password_hash, created_at)
        VALUES (?, ?, ?, 'OWNER', ?, ?, ?, ?)`)
        .run(uId, email, ownerName || `Vehicle Owner (${reg})`, ownerPhone, pass.salt, pass.hash, at);
      owner = db.prepare('SELECT * FROM users WHERE id = ?').get(uId);
    }
    db.prepare('UPDATE vehicles SET owner_id = ? WHERE id = ?').run(owner.id, v.id);

    // If Showroom Payment, increment pending dues on showroom
    if (isShowroomPending) {
      db.prepare(`UPDATE showrooms SET pending_dues = coalesce(pending_dues, 0) + 499 WHERE id = ?`).run(showroomId);
    }

    db.prepare(`UPDATE qr_units SET status='ACTIVE',vehicle_id=?,fee_collected=?,payment_mode=?,is_showroom_pending=?,activated_at=?,activated_by=?,
      installation_confirmed_at=?,final_scan_confirmed_at=?,updated_at=? WHERE id=?`)
      .run(v.id, feeCollected, paymentMode, isShowroomPending, at, actor.id, at, at, at, q.id);

    db.prepare(`INSERT INTO inventory_events (id,qr_id,event_type,from_location,to_location,actor_id,reason,created_at)
      VALUES (?,?,'QR_ACTIVATED',?,?,?,?,?)`)
      .run(id('evt'), q.id, `SHOWROOM:${showroomId}`, `VEHICLE:${v.id}`, actor.id, `Verified showroom fitment to ${reg}`, at);

    audit(actor, 'DECAL_ACTIVATED', 'qr_unit', q.id, {
      qrId: q.qr_id,
      registration: reg,
      feeCollected,
      paymentMode,
      isShowroomPending,
      ownerPhoneLast4: ownerPhone?.slice(-4) || null
    });

    return {
      success: true,
      qrId: q.qr_id,
      publicToken: q.public_token,
      registration: reg,
      brand,
      model: v.model,
      category: v.category,
      feeCollected,
      paymentMode,
      isShowroomPending,
      activatedAt: at
    };
  });
}



export function dealerLedger(actor, search = '') {
  const showroomId = getActorShowroomId(actor);
  const q = `%${String(search || '').trim().toLowerCase()}%`;

  return db.prepare(`
    SELECT q.id, q.qr_id, q.status, q.fee_collected, q.payment_mode, coalesce(q.activated_at, q.updated_at) AS fitted_at,
           v.registration, v.make, v.model, v.category, v.color,
           u.name AS owner_name, u.phone AS owner_phone
    FROM qr_units q
    JOIN vehicles v ON v.id = q.vehicle_id
    LEFT JOIN users u ON u.id = v.owner_id
    WHERE q.showroom_id = ? AND q.status = 'ACTIVE'
      AND (
        lower(q.qr_id) LIKE ? OR
        lower(v.registration) LIKE ? OR
        lower(v.make) LIKE ? OR
        lower(v.model) LIKE ? OR
        lower(coalesce(u.name, '')) LIKE ? OR
        lower(coalesce(u.phone, '')) LIKE ?
      )
    ORDER BY coalesce(q.activated_at, q.updated_at) DESC
  `).all(showroomId, q, q, q, q, q, q);
}

export function dealerAvailableStock(actor) {
  const showroomId = getActorShowroomId(actor);
  return db.prepare(`
    SELECT id, qr_id, public_token, status, created_at
    FROM qr_units
    WHERE showroom_id = ? AND status = 'SHOWROOM_STOCK'
    ORDER BY qr_id ASC
  `).all(showroomId);
}

/* ==========================================================================
   Vehicle Owner Self-Service & Profile Operations
   ========================================================================== */

export function ownerUpdateVehicle(actor, vehicleId, input) {
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ? AND owner_id = ?').get(vehicleId, actor.id);
  if (!v) throw new HttpError(404, 'Vehicle not found or not owned by your account.');

  const newReg = String(input.registration || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const chassis = String(input.chassisNumber || input.chassis || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const engine = String(input.engineNumber || input.engine || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const emergencyContact = String(input.emergencyContact || '').trim();
  const color = String(input.color || v.color || '').trim();

  // If changing registration from TEMP to permanent HSRP plate, check uniqueness
  if (newReg && newReg !== v.registration) {
    if (newReg.length < 4 || newReg.length > 15) throw new HttpError(400, 'Enter a valid vehicle registration plate (e.g. BR06XY1234).');
    const existing = db.prepare('SELECT id FROM vehicles WHERE registration = ? AND id != ?').get(newReg, v.id);
    if (existing) throw new HttpError(409, `Vehicle with registration plate ${newReg} is already registered on the network.`);
  }

  const finalReg = newReg || v.registration;
  const finalChassis = chassis || v.chassis_number;
  const finalEngine = engine || v.engine_number;
  const finalEmergency = emergencyContact || v.emergency_contact;

  db.prepare(`
    UPDATE vehicles
    SET registration = ?, chassis_number = ?, engine_number = ?, emergency_contact = ?, color = ?
    WHERE id = ?
  `).run(finalReg, finalChassis, finalEngine, finalEmergency, color, v.id);

  audit(actor, 'VEHICLE_UPDATED', 'vehicle', v.id, {
    oldRegistration: v.registration,
    newRegistration: finalReg,
    chassis: finalChassis,
    emergencyContact: finalEmergency
  });

  return {
    success: true,
    id: v.id,
    registration: finalReg,
    chassis_number: finalChassis,
    engine_number: finalEngine,
    emergency_contact: finalEmergency,
    color
  };
}

export function ownerUpdateProfile(actor, input) {
  const name = String(input.name || '').trim();
  const phone = input.phone ? normalizePhone(input.phone) : null;

  if (!name || name.length < 2) throw new HttpError(400, 'Please enter a valid full name.');
  const duplicate = phone ? db.prepare('SELECT id FROM users WHERE phone=? AND id<>?').get(phone, actor.id) : null;
  if (duplicate) throw new HttpError(409, 'This mobile number is already linked to another account.');

  db.prepare('UPDATE users SET name = ?, phone = coalesce(?, phone) WHERE id = ?').run(name, phone || null, actor.id);
  audit(actor, 'PROFILE_UPDATED', 'user', actor.id, { name, phoneLast4: phone?.slice(-4) || null });

  return { success: true, name, phone };
}

export function ownerRequestReplacement(actor, input) {
  const vehicleId = input.vehicleId;
  const v = db.prepare('SELECT * FROM vehicles WHERE id = ? AND owner_id = ?').get(vehicleId, actor.id);
  if (!v) throw new HttpError(404, 'Vehicle not found or not owned by your account.');

  const reason = String(input.reason || 'DAMAGED').trim().toUpperCase();
  const address = String(input.address || '').trim();
  const city = String(input.city || '').trim();
  const pincode = validatePincode(input.pincode);
  if (!['DAMAGED', 'LOST', 'STOLEN', 'FADED', 'OTHER'].includes(reason)) throw new HttpError(400, 'Choose a supported replacement reason.');
  if (address.length < 5 || address.length > 240 || city.length < 2 || city.length > 80) throw new HttpError(400, 'Enter a complete replacement delivery address.');

  const activeQr = db.prepare("SELECT * FROM qr_units WHERE vehicle_id = ? AND status = 'ACTIVE'").get(v.id);
  if (!activeQr) throw new HttpError(409, 'This vehicle has no active QR to replace.');

  return transaction(() => {
    const existing = db.prepare("SELECT id FROM decal_replacements WHERE vehicle_id=? AND status IN ('REQUESTED','RESERVED','SHIPPED')").get(v.id);
    if (existing) throw new HttpError(409, 'An open replacement request already exists for this vehicle.');
    const reserved = db.prepare("SELECT id,qr_id FROM qr_units WHERE status='CENTRAL_STOCK' ORDER BY qr_id LIMIT 1").get();
    if (!reserved) throw new HttpError(409, 'No QC-approved replacement decal is currently available.');

    const at = now();
    const shouldBlock = input.blockOldSticker === true || ['LOST', 'STOLEN'].includes(reason);
    if (shouldBlock) {
      db.prepare("UPDATE qr_units SET status='BLOCKED',updated_at=? WHERE id=? AND status='ACTIVE'").run(at, activeQr.id);
      db.prepare(`INSERT INTO inventory_events (id,qr_id,event_type,from_location,to_location,actor_id,reason,created_at)
        VALUES (?,?,'QR_BLOCKED',?,'BLOCKED',?,?,?)`)
        .run(id('evt'), activeQr.id, `VEHICLE:${v.id}`, actor.id, `Owner reported ${reason}`, at);
    }
    db.prepare("UPDATE qr_units SET status='ALLOCATED',updated_at=? WHERE id=? AND status='CENTRAL_STOCK'").run(at, reserved.id);

    const reqId = id('rep');
    const trackingAwb = `REQ-SMARTO-${randomInt(10_000_000, 100_000_000)}`;
    db.prepare(`INSERT INTO decal_replacements
      (id,vehicle_id,old_qr_id,new_qr_id,reason,status,fee,tracking_awb,shipping_address,shipping_city,shipping_pincode,payment_status,created_at)
      VALUES (?,?,?,?,?,'RESERVED',149,?,?,?,?, 'PENDING',?)`)
      .run(reqId, v.id, activeQr.qr_id, reserved.id, reason, trackingAwb, address, city, pincode, at);
    db.prepare(`INSERT INTO inventory_events (id,qr_id,event_type,from_location,to_location,actor_id,reason,created_at)
      VALUES (?,?,'REPLACEMENT_RESERVED','CENTRAL_STOCK',?,?,?,?)`)
      .run(id('evt'), reserved.id, `REPLACEMENT:${reqId}`, actor.id, `Reserved for vehicle ${v.registration}`, at);
    audit(actor, 'REPLACEMENT_RESERVED', 'decal_replacement', reqId, {
      vehicleId: v.id,
      registration: v.registration,
      oldQrId: activeQr.qr_id,
      reason,
      fee: 149,
      pincode
    });

    return {
      success: true,
      replacementId: reqId,
      trackingAwb,
      paymentStatus: 'PENDING',
      fee: 149,
      oldQrId: activeQr.qr_id,
      oldStickerBlocked: shouldBlock,
      message: 'Replacement request recorded and a specific QR has been reserved pending fulfilment.'
    };
  });
}

export function ownerRebindDecal(actor, input) {
  const vehicleId = input.vehicleId;
  const rawQrCode = String(input.qrCode || '').trim();

  const v = db.prepare('SELECT * FROM vehicles WHERE id = ? AND owner_id = ?').get(vehicleId, actor.id);
  if (!v) throw new HttpError(404, 'Vehicle not found or not owned by your account.');

  if (!rawQrCode || rawQrCode.length > 200) throw new HttpError(400, 'Enter the reserved replacement QR identifier.');

  return transaction(() => {
    const newQr = db.prepare('SELECT * FROM qr_units WHERE qr_id = ? OR id = ? OR public_token = ?').get(rawQrCode, rawQrCode, rawQrCode);
    if (!newQr) throw new HttpError(404, `Decal "${rawQrCode}" was not found.`);
    const replacement = db.prepare(`SELECT * FROM decal_replacements
      WHERE vehicle_id=? AND new_qr_id=? AND status IN ('RESERVED','SHIPPED') ORDER BY created_at DESC LIMIT 1`)
      .get(v.id, newQr.id);
    if (!replacement) throw new HttpError(403, 'This decal is not reserved for your vehicle replacement request.');
    if (newQr.status !== 'ALLOCATED' || newQr.vehicle_id) throw new HttpError(409, 'Reserved replacement decal is no longer available.');

    const at = now();
    db.prepare("UPDATE qr_units SET status='DEACTIVATED',updated_at=? WHERE vehicle_id=? AND status IN ('ACTIVE','BLOCKED') AND id<>?")
      .run(at, v.id, newQr.id);
    db.prepare(`UPDATE qr_units SET status='ACTIVE',vehicle_id=?,showroom_id=NULL,updated_at=?,activated_at=?,activated_by=?,
      installation_confirmed_at=?,final_scan_confirmed_at=? WHERE id=?`)
      .run(v.id, at, at, actor.id, at, at, newQr.id);
    db.prepare("UPDATE decal_replacements SET status='COMPLETED' WHERE id=?").run(replacement.id);
    db.prepare(`INSERT INTO inventory_events (id,qr_id,event_type,from_location,to_location,actor_id,reason,created_at)
      VALUES (?,?,'QR_REPLACED',?,?,?,?,?)`)
      .run(id('evt'), newQr.id, `REPLACEMENT:${replacement.id}`, `VEHICLE:${v.id}`, actor.id, `Reserved replacement bound to ${v.registration}`, at);
    audit(actor, 'QR_REBOUND', 'vehicle', v.id, { registration: v.registration, newQrId: newQr.qr_id, replacementId: replacement.id });

    return {
      success: true,
      vehicleId: v.id,
      registration: v.registration,
      qrId: newQr.qr_id,
      message: `Decal ${newQr.qr_id} successfully bound to vehicle ${v.registration}.`
    };
  });
}

/* ==========================================================================
   D2C E-Commerce Storefront Pipeline
   ========================================================================== */

export function storeCatalog() {
  return [
    {
      sku: 'SMARTO-CAR-PACK',
      icon: '🚘',
      name: 'SmartO Car Safety Decal Pack',
      category: 'Car / SUV / EV',
      price: 299,
      mrp: 499,
      discountPercent: 40,
      badge: 'BESTSELLER',
      description: 'Dual Decal Kit: Tamper-proof windshield safety decal + rear bumper quick alert tag with unguessable cryptographic routing.',
      features: ['Dual windshield & bumper placement', '3M Automotive Grade Weatherproof', 'Zero Personal Phone Number Exposure', 'Instant Bystander Emergency Routing']
    },
    {
      sku: 'SMARTO-MOTO-PACK',
      icon: '🏍️',
      name: 'SmartO Moto Safety Decal Pack',
      category: 'Motorcycle / Scooter',
      price: 199,
      mrp: 299,
      discountPercent: 33,
      badge: 'POPULAR',
      description: 'Compact UV-laminated fuel tank & visor decal engineered for two-wheelers in heavy rain and extreme sunlight.',
      features: ['Compact 65mm aerodynamic fit', 'Fuel & scratch resistant coating', 'Instant parking & accident alerts', '24/7 Citizen-to-Owner Masked Bridge']
    },
    {
      sku: 'SMARTO-COMMERCIAL-PACK',
      icon: '🚚',
      name: 'SmartO Commercial Fleet Pro Decal',
      category: 'Truck / Bus / Commercial',
      price: 499,
      mrp: 799,
      discountPercent: 38,
      badge: 'HEAVY DUTY',
      description: 'Heavy-duty reflective safety identity decal for transport fleets, school buses, auto-rickshaws and commercial freight.',
      features: ['High-visibility reflective border', 'Industrial tamper-evident vinyl', 'Fleet central console integration', 'Emergency highway response routing']
    }
  ];
}

export function storeCreateOrder(input) {
  throw new HttpError(403, 'Public retail ordering is currently restricted. SmartO Vehicle QR Decals are exclusively distributed via authorized dealership showrooms, and Child Safety Badges via affiliated schools.');
}



export function storeGetOrders(actor, customerPhone) {
  let clean;
  if (actor.role === 'ADMIN') clean = normalizePhone(customerPhone);
  else {
    const account = db.prepare('SELECT phone FROM users WHERE id=?').get(actor.id);
    if (!account?.phone) throw new HttpError(409, 'Add a verified phone number to your owner profile before viewing orders.');
    clean = account.phone;
  }
  return db.prepare(`SELECT id,customer_name,customer_phone,address,city,state,pincode,product_sku,product_name,quantity,
    unit_price,total_amount,payment_status,payment_mode,order_status,tracking_awb,allotted_qr_id,created_at
    FROM orders WHERE customer_phone=? ORDER BY created_at DESC LIMIT 10`).all(clean);
}

/* ==========================================================================
   Bystander Masked Calling & Telephony Bridge (500+ Concurrent Scalability)
   ========================================================================== */

export async function initiateMaskedCall(token, callerPhone, ip = 'unknown') {
  const cleanCaller = normalizePhone(callerPhone);
  rateLimit(maskedCallRate, `${ip}:${token}`, 3, 15 * 60_000, 'Too many call attempts. Try again in 15 minutes.');

  // Find vehicle and owner by public token
  const q = db.prepare(`
    SELECT q.id, q.qr_id, q.status, v.id AS vehicle_id, v.registration, v.make, v.model, u.phone AS owner_phone
    FROM qr_units q
    JOIN vehicles v ON v.id = q.vehicle_id
    LEFT JOIN users u ON u.id = v.owner_id
    WHERE q.public_token = ? AND q.status = 'ACTIVE'
  `).get(token);

  if (!q) throw new HttpError(404, 'Active protected vehicle not found for this QR token.');
  if (!q.owner_phone) throw new HttpError(400, 'Vehicle owner has not configured a callback phone number yet.');

  const endpoint = String(process.env.TELEPHONY_WEBHOOK_URL || '').trim();
  if (!endpoint) throw new HttpError(503, 'Masked calling is not configured. Send a private alert instead.');
  let parsedEndpoint;
  try { parsedEndpoint = new URL(endpoint); } catch { throw new HttpError(500, 'Telephony provider URL is invalid.'); }
  if (process.env.NODE_ENV === 'production' && parsedEndpoint.protocol !== 'https:') throw new HttpError(500, 'Telephony provider must use HTTPS.');

  let response;
  try {
    response = await fetch(parsedEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callerPhone: cleanCaller, ownerPhone: q.owner_phone, vehicleId: q.vehicle_id, qrId: q.qr_id }),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw new HttpError(502, 'Masked-call provider is temporarily unavailable.');
  }
  if (!response.ok) throw new HttpError(502, 'Masked-call provider rejected the request.');
  const provider = await response.json().catch(() => ({}));
  const virtualRelay = String(provider.bridgeNumber || '').trim();
  if (!/^\+[1-9]\d{9,14}$/.test(virtualRelay.replace(/\s/g, ''))) throw new HttpError(502, 'Masked-call provider returned an invalid bridge number.');
  const callSessionId = String(provider.sessionId || id('call')).slice(0, 80);

  db.prepare(`
    INSERT INTO masked_calls (id, qr_id, vehicle_id, caller_phone, owner_phone, virtual_bridge_number, call_duration_seconds, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 'INITIATED', ?)
  `).run(callSessionId, q.id, q.vehicle_id, cleanCaller, q.owner_phone, virtualRelay, now());

  return {
    success: true,
    sessionId: callSessionId,
    bridgeNumber: virtualRelay,
    ownerMasked: `******${q.owner_phone.slice(-4)}`,
    vehicle: `${q.make} ${q.model} (${q.registration})`,
    message: 'Masked call bridge initiated! Your phone will ring shortly from SmartO Private Relay, connecting you safely to the vehicle owner.'
  };
}

/* ==========================================================================
   Batch Tracking & Auditing
   ========================================================================== */

export function listBatches() {
  return db.prepare(`
    SELECT b.*,
      (SELECT count(*) FROM qr_units WHERE batch_id = b.id) AS total_units,
      (SELECT count(*) FROM qr_units WHERE batch_id = b.id AND status = 'ACTIVE') AS active_count,
      (SELECT count(*) FROM qr_units WHERE batch_id = b.id AND status = 'SHOWROOM_STOCK') AS showroom_count,
      (SELECT count(*) FROM qr_units WHERE batch_id = b.id AND status = 'AGENT_STOCK') AS agent_count,
      u.name AS creator_name
    FROM batches b
    LEFT JOIN users u ON u.id = b.created_by
    ORDER BY b.created_at DESC
    LIMIT 100
  `).all();
}

export function getBatchDetails(batchId) {
  const batch = db.prepare(`
    SELECT b.*, u.name AS creator_name
    FROM batches b
    LEFT JOIN users u ON u.id = b.created_by
    WHERE b.id = ?
  `).get(batchId);
  if (!batch) throw new HttpError(404, 'Batch not found.');

  const units = db.prepare(`
    SELECT q.id, q.qr_id, q.public_token, q.status, q.category, q.updated_at,
           s.name AS showroom_name, v.registration, a.name AS agent_name
    FROM qr_units q
    LEFT JOIN showrooms s ON s.id = q.showroom_id
    LEFT JOIN vehicles v ON v.id = q.vehicle_id
    LEFT JOIN sales_agents a ON a.id = q.agent_id
    WHERE q.batch_id = ?
    ORDER BY q.qr_id ASC
  `).all(batchId);

  const statusSummary = {};
  for (const u of units) {
    statusSummary[u.status] = (statusSummary[u.status] || 0) + 1;
  }

  return { batch, statusSummary, units };
}

/* ==========================================================================
   Sales Team / Field Agent Operations (3-Level Hierarchy)
   ========================================================================== */

export function listSalesAgents() {
  return db.prepare(`
    SELECT a.*,
      (SELECT count(*) FROM qr_units WHERE agent_id = a.id) AS total_assigned,
      (SELECT count(*) FROM qr_units WHERE agent_id = a.id AND status = 'AGENT_STOCK') AS in_hand_stock,
      (SELECT count(*) FROM qr_units WHERE agent_id = a.id AND showroom_id IS NOT NULL) AS distributed_to_showrooms,
      (SELECT count(*) FROM qr_units WHERE agent_id = a.id AND status = 'ACTIVE') AS activated_on_road
    FROM sales_agents a
    ORDER BY a.name ASC
  `).all();
}

export function createSalesAgent(actor, input) {
  const name = String(input.name || '').trim();
  if (name.length < 2) throw new HttpError(400, 'Sales agent name is required.');
  const phone = normalizePhone(input.phone);
  const email = String(input.email || '').trim().toLowerCase();
  const region = String(input.region || 'Bihar').trim();
  const agentId = id('sag');
  const at = now();

  const existing = db.prepare('SELECT id FROM sales_agents WHERE phone = ?').get(phone);
  if (existing) throw new HttpError(409, `An agent with phone ${phone} already exists.`);

  db.prepare(`INSERT INTO sales_agents (id, name, phone, email, region, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`).run(agentId, name, phone, email || null, region, at);

  audit(actor, 'SALES_AGENT_CREATED', 'sales_agent', agentId, { name, phone, region });
  return db.prepare('SELECT * FROM sales_agents WHERE id = ?').get(agentId);
}

export function allocateStockToAgent(actor, { agentId, quantity }) {
  const agent = db.prepare('SELECT * FROM sales_agents WHERE id = ?').get(agentId);
  if (!agent) throw new HttpError(404, 'Sales agent not found.');
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty < 1 || qty > 5000) throw new HttpError(400, 'Allocation quantity must be between 1 and 5,000 units.');

  return transaction(() => {
    // Pull sequential contiguous QRs from available unallocated central inventory
    const availableQrs = db.prepare(`
      SELECT id, qr_id FROM qr_units
      WHERE agent_id IS NULL AND showroom_id IS NULL AND vehicle_id IS NULL
        AND status IN ('CENTRAL_STOCK', 'QC_PASSED', 'PRINTED', 'GENERATED')
      ORDER BY qr_id ASC
      LIMIT ?
    `).all(qty);

    if (availableQrs.length < qty) {
      throw new HttpError(409, `Only ${availableQrs.length} unallocated QRs are available in central inventory; ${qty} were requested.`);
    }

    const seriesStart = availableQrs[0].qr_id;
    const seriesEnd = availableQrs[availableQrs.length - 1].qr_id;
    const at = now();
    const allocId = id('alc');

    db.prepare(`INSERT INTO agent_allocations (id, agent_id, quantity, series_start, series_end, status, allocated_by, created_at)
      VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`).run(allocId, agentId, qty, seriesStart, seriesEnd, actor.id, at);

    const updateUnit = db.prepare(`UPDATE qr_units SET agent_id = ?, status = 'AGENT_STOCK', updated_at = ? WHERE id = ?`);
    const insertEvt = db.prepare(`INSERT INTO inventory_events (id, qr_id, event_type, from_location, to_location, actor_id, reason, created_at)
      VALUES (?, ?, 'AGENT_ALLOCATED', 'CENTRAL_STOCK', ?, ?, ?, ?)`);

    for (const q of availableQrs) {
      updateUnit.run(agentId, at, q.id);
      insertEvt.run(id('evt'), q.id, `AGENT:${agentId}`, actor.id, `Field inventory allocation of ${qty} QRs to ${agent.name}`, at);
    }

    audit(actor, 'AGENT_ALLOCATION_CREATED', 'agent_allocation', allocId, { agentId, agentName: agent.name, qty, seriesStart, seriesEnd });
    return { success: true, allocationId: allocId, quantity: qty, allocatedCount: qty, seriesStart, seriesEnd, agentName: agent.name };
  });
}

export function distributeAgentStockToShowroom(actor, { agentId, showroomId, quantity }) {
  const agent = db.prepare('SELECT * FROM sales_agents WHERE id = ?').get(agentId);
  if (!agent) throw new HttpError(404, 'Sales agent not found.');
  const shr = db.prepare('SELECT * FROM showrooms WHERE id = ?').get(showroomId);
  if (!shr) throw new HttpError(404, 'Showroom not found.');
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty < 1) throw new HttpError(400, 'Enter a valid distribution quantity (e.g. 100).');

  return transaction(() => {
    const agentQrs = db.prepare(`
      SELECT id, qr_id FROM qr_units
      WHERE agent_id = ? AND showroom_id IS NULL AND status = 'AGENT_STOCK'
      ORDER BY qr_id ASC
      LIMIT ?
    `).all(agentId, qty);

    if (agentQrs.length < qty) {
      throw new HttpError(409, `Agent ${agent.name} has only ${agentQrs.length} QRs in hand; ${qty} requested.`);
    }

    const seriesStart = agentQrs[0].qr_id;
    const seriesEnd = agentQrs[agentQrs.length - 1].qr_id;
    const at = now();

    const updateUnit = db.prepare(`UPDATE qr_units SET showroom_id = ?, status = 'SHOWROOM_STOCK', updated_at = ? WHERE id = ?`);
    const insertEvt = db.prepare(`INSERT INTO inventory_events (id, qr_id, event_type, from_location, to_location, actor_id, reason, created_at)
      VALUES (?, ?, 'SHOWROOM_RECEIVED', ?, ?, ?, ?, ?)`);

    for (const q of agentQrs) {
      updateUnit.run(showroomId, at, q.id);
      insertEvt.run(id('evt'), q.id, `AGENT:${agentId}`, `SHOWROOM:${showroomId}`, actor.id, `Distributed by field agent ${agent.name} to ${shr.name}`, at);
    }

    audit(actor, 'SHOWROOM_DISTRIBUTED', 'showroom', showroomId, { agentId, showroomId, qty, seriesStart, seriesEnd });
    return { success: true, quantity: qty, distributedCount: qty, seriesStart, seriesEnd, showroomName: shr.name, agentName: agent.name };
  });
}

/* ==========================================================================
   School & Child Safety Operations
   ========================================================================== */

export function listSchools() {
  return db.prepare(`
    SELECT s.*,
      (SELECT count(*) FROM children WHERE school_id = s.id) AS student_count
    FROM schools s
    ORDER BY s.name ASC
  `).all();
}

export function createSchool(actor, input) {
  const name = String(input.name || '').trim();
  if (name.length < 3) throw new HttpError(400, 'School name is required.');
  const city = String(input.city || 'Patna').trim();
  const address = String(input.address || '').trim();
  const principalName = String(input.principalName || '').trim();
  const contactPhone = normalizePhone(input.contactPhone);
  const count = db.prepare('SELECT count(*) AS n FROM schools').get().n + 1;
  const code = String(input.code || `SCH-${city.slice(0, 3).toUpperCase()}-${String(count).padStart(3, '0')}`).trim().toUpperCase();
  const schoolId = id('sch');
  const at = now();

  db.prepare(`INSERT INTO schools (id, name, code, city, address, principal_name, contact_phone, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`).run(schoolId, name, code, city, address, principalName, contactPhone, at);

  audit(actor, 'SCHOOL_CREATED', 'school', schoolId, { name, code, city });
  return db.prepare('SELECT * FROM schools WHERE id = ?').get(schoolId);
}

export function registerChild(actor, input) {
  const schoolId = String(input.schoolId || '');
  const school = db.prepare('SELECT * FROM schools WHERE id = ?').get(schoolId);
  if (!school) throw new HttpError(404, 'School not found.');

  let q;
  let rawCode = String(input.qrCode || '').trim();
  if (rawCode.includes('/scan/')) rawCode = rawCode.split('/scan/').pop().split('?')[0];

  if (rawCode) {
    q = db.prepare('SELECT * FROM qr_units WHERE qr_id = ? OR id = ? OR public_token = ?').get(rawCode, rawCode, rawCode);
    if (!q) throw new HttpError(404, 'School safety QR code not found.');
    if (q.status === 'ACTIVE') throw new HttpError(409, 'This QR code is already assigned to an active student or vehicle.');
  } else {
    // Auto-pull from available school QR stock
    q = db.prepare(`SELECT * FROM qr_units WHERE category = 'SCHOOL' AND status IN ('CENTRAL_STOCK', 'QC_PASSED', 'PRINTED', 'GENERATED') AND vehicle_id IS NULL ORDER BY qr_id ASC LIMIT 1`).get();
    if (!q) {
      // Auto-pull from general unallocated stock or create on the fly
      q = db.prepare(`SELECT * FROM qr_units WHERE status IN ('CENTRAL_STOCK', 'QC_PASSED', 'PRINTED', 'GENERATED') AND vehicle_id IS NULL AND agent_id IS NULL AND showroom_id IS NULL ORDER BY qr_id ASC LIMIT 1`).get();
    }
    if (!q) {
      // Create a sequential school badge QR on the fly
      db.prepare(`INSERT OR IGNORE INTO qr_sequences (prefix, last_val) VALUES ('SCHBR', 0)`).run();
      const seq = db.prepare(`SELECT last_val FROM qr_sequences WHERE prefix = 'SCHBR'`).get();
      const nextVal = (seq?.last_val || 0) + 1;
      db.prepare(`UPDATE qr_sequences SET last_val = ? WHERE prefix = 'SCHBR'`).run(nextVal);
      const newQrId = `SCHBR-${String(nextVal).padStart(8, '0')}`;
      const newUnitId = id('qr');
      const newTok = token();
      const atNow = now();
      db.prepare(`INSERT INTO qr_units (id, qr_id, public_token, batch_id, category, status, created_at, updated_at) VALUES (?, ?, ?, null, 'SCHOOL', 'CENTRAL_STOCK', ?, ?)`).run(newUnitId, newQrId, newTok, atNow, atNow);
      q = db.prepare('SELECT * FROM qr_units WHERE id = ?').get(newUnitId);
    }
  }

  const childName = String(input.childName || '').trim();
  if (!childName) throw new HttpError(400, 'Child name is required.');
  const classSec = String(input.classSec || input.gradeClass || '').trim();
  const rollNo = String(input.rollNo || '').trim();
  const bloodGroup = String(input.bloodGroup || '').trim();
  const parentName = String(input.parentName || input.fatherName || input.motherName || 'Parent / Guardian').trim();
  const parentPhone1 = normalizePhone(input.parentPhone1 || input.fatherPhone || input.phone);
  const parentPhone2 = (input.parentPhone2 || input.motherPhone) ? normalizePhone(input.parentPhone2 || input.motherPhone) : null;
  const address = String(input.address || input.homeAddress || '').trim();
  const emergencyNote = String(input.emergencyNote || '').trim();

  const childId = id('chd');
  const at = now();

  return transaction(() => {
    db.prepare(`INSERT INTO children (id, school_id, qr_id, child_name, class_sec, roll_no, blood_group, parent_name, parent_phone_1, parent_phone_2, address, emergency_note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(childId, schoolId, q.id, childName, classSec, rollNo, bloodGroup, parentName, parentPhone1, parentPhone2, address, emergencyNote, at);

    db.prepare(`UPDATE qr_units SET category = 'SCHOOL', status = 'ACTIVE', updated_at = ? WHERE id = ?`).run(at, q.id);

    audit(actor, 'CHILD_REGISTERED', 'child', childId, { childName, qrId: q.qr_id, schoolId });
    return { success: true, childId, childName, qrId: q.qr_id, badgeCode: q.qr_id, publicToken: q.public_token, schoolName: school.name };
  });
}

export function listChildren(schoolId = null) {
  const sql = `SELECT c.*, s.name AS school_name, q.qr_id, q.public_token
    FROM children c
    JOIN schools s ON s.id = c.school_id
    JOIN qr_units q ON q.id = c.qr_id
    ${schoolId ? 'WHERE c.school_id = ?' : ''}
    ORDER BY c.created_at DESC LIMIT 200`;
  return schoolId ? db.prepare(sql).all(schoolId) : db.prepare(sql).all();
}
