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

export function createBatch(actor, { prefix = 'SV-BR', quantity, templateVersion = 'SVQR-2.0' }) {
  const count = Number(quantity);
  if (!Number.isInteger(count) || count < 1 || count > 10000) throw new HttpError(400, 'Quantity must be a whole number from 1 to 10,000.');
  if (!/^[A-Z0-9-]{2,18}$/.test(prefix)) throw new HttpError(400, 'Prefix may contain uppercase letters, numbers and hyphens only.');
  
  const batchId = id('bat'), at = now(), first = db.prepare('SELECT count(*) AS n FROM qr_units WHERE qr_id LIKE ?').get(`${prefix}-%`).n + 1;
  transaction(() => {
    db.prepare('INSERT INTO batches (id,prefix,quantity,status,created_by,created_at,template_version) VALUES (?,?,?,?,?,?,?)')
      .run(batchId, prefix, count, 'GENERATED', actor.id, at, String(templateVersion).slice(0, 32));
    const insert = db.prepare(`INSERT INTO qr_units (id,qr_id,public_token,batch_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`);
    const event = db.prepare(`INSERT INTO inventory_events (id,qr_id,event_type,from_location,to_location,actor_id,created_at) VALUES (?,?,?,?,?,?,?)`);
    for (let i = 0; i < count; i++) {
      const serial = String(first + i).padStart(8, '0'), qrId = `${prefix}-${serial}`, unitId = id('qr'), atUnit = now();
      insert.run(unitId, qrId, token(), batchId, 'GENERATED', atUnit, atUnit);
      event.run(id('evt'), unitId, 'GENERATED', 'SYSTEM', 'PRODUCTION', actor.id, atUnit);
    }
    audit(actor, 'BATCH_CREATED', 'batch', batchId, { prefix, quantity: count, templateVersion });
  });
  return { id: batchId, prefix, quantity: count, status: 'GENERATED', createdAt: at };
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
  return db.prepare('SELECT id,name,code,city,state,status,created_at FROM showrooms ORDER BY name').all();
}

export function createShowroom(actor, input) {
  const name = String(input.name || '').trim();
  if (name.length < 3 || name.length > 120) throw new HttpError(400, 'Showroom name must be between 3 and 120 characters.');

  let code = String(input.code || '').trim().toUpperCase();
  if (!code) {
    const prefix = (input.city ? String(input.city).slice(0, 3).toUpperCase() : 'HUB');
    const count = db.prepare('SELECT count(*) AS n FROM showrooms').get().n + 1;
    code = `${prefix}-${String(count).padStart(3, '0')}`;
  }
  if (code.length < 3 || code.length > 20) throw new HttpError(400, 'Dealer code must be between 3 and 20 characters.');

  const existing = db.prepare('SELECT id FROM showrooms WHERE code = ?').get(code);
  if (existing) throw new HttpError(409, `A showroom with dealer code "${code}" already exists.`);

  const city = String(input.city || 'Patna').trim();
  const state = String(input.state || 'Bihar').trim();
  const status = ['ACTIVE', 'INACTIVE'].includes(input.status) ? input.status : 'ACTIVE';

  const showroomId = id('shr');
  const at = now();

  db.prepare(`INSERT INTO showrooms (id, name, code, city, state, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(showroomId, name, code, city, state, status, at);

  audit(actor, 'SHOWROOM_CREATED', 'showroom', showroomId, { name, code, city, state, status });

  return db.prepare('SELECT id, name, code, city, state, status, created_at FROM showrooms WHERE id = ?').get(showroomId);
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
  const q = db.prepare(`SELECT q.id,q.qr_id,q.status,v.make,v.model,v.category,v.color
    FROM qr_units q LEFT JOIN vehicles v ON v.id=q.vehicle_id WHERE q.public_token=?`).get(tokenValue);
  if (!q || q.status !== 'ACTIVE') return { active: false };
  return { active: true, qrId: q.qr_id, vehicle: { make: q.make, model: q.model, category: q.category, color: q.color } };
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
  const totalAllocated = db.prepare("SELECT count(*) AS n FROM qr_units WHERE showroom_id = ?").get(showroomId).n;
  const feesCollected = db.prepare("SELECT coalesce(sum(fee_collected), 0) AS total FROM qr_units WHERE showroom_id = ? AND status = 'ACTIVE'").get(showroomId).total;

  // Recent Stock Requisitions
  const stockRequests = db.prepare('SELECT * FROM stock_requests WHERE showroom_id = ? ORDER BY created_at DESC LIMIT 8').all(showroomId);

  // Recent 10 Vehicle Decal Fitments
  const recentFitments = db.prepare(`
    SELECT q.id, q.qr_id, q.status, q.fee_collected, q.payment_mode, coalesce(q.activated_at, q.updated_at) AS fitted_at,
           v.registration, v.make, v.model, v.category, v.color,
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
      feesCollected
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

  let reg = String(input.registration || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const chassis = String(input.chassisNumber || input.chassis || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const engine = String(input.engineNumber || input.engine || '').trim().toUpperCase().replace(/[\s-]/g, '');

  if (!reg && !chassis) {
    throw new HttpError(400, 'Either a vehicle registration number OR chassis VIN number is required for showroom delivery.');
  }

  // If new showroom vehicle with pending RTO plate, assign temporary registration identifier
  if (!reg) {
    reg = `TEMP-${chassis.length >= 6 ? chassis.slice(-6) : id('temp').slice(-6)}`;
  }

  const make = String(input.make || '').trim();
  const model = String(input.model || '').trim();
  const category = String(input.category || 'Car').trim();
  const color = String(input.color || '').trim();
  const emergencyContact = input.emergencyContact ? normalizePhone(input.emergencyContact) : null;
  const feeCollected = Number(input.feeCollected || 0);
  const paymentMode = String(input.paymentMode || 'UPI').trim();
  const ownerName = String(input.ownerName || '').trim();
  const ownerPhone = input.ownerPhone ? normalizePhone(input.ownerPhone) : null;

  if (rawCode.length < 4 || rawCode.length > 200) throw new HttpError(400, 'Enter a valid QR decal identifier.');
  if (reg.length < 4 || reg.length > 18) throw new HttpError(400, 'Enter a valid vehicle registration or chassis identifier.');
  if (make.length < 2 || make.length > 60 || model.length < 1 || model.length > 60) throw new HttpError(400, 'Enter valid vehicle make and model values.');
  if (!['Car', 'Two Wheeler', 'Motorcycle', 'Commercial'].includes(category)) throw new HttpError(400, 'Choose a supported vehicle category.');
  if (!Number.isFinite(feeCollected) || feeCollected < 0 || feeCollected > 100000) throw new HttpError(400, 'Enter a valid collected fee.');
  if (!['UPI', 'Cash', 'Card', 'Complimentary'].includes(paymentMode)) throw new HttpError(400, 'Choose a supported payment mode.');

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

    const byRegistration = db.prepare('SELECT * FROM vehicles WHERE registration = ?').get(reg);
    const byChassis = chassis ? db.prepare('SELECT * FROM vehicles WHERE chassis_number = ?').get(chassis) : null;
    if (byRegistration && byChassis && byRegistration.id !== byChassis.id) throw new HttpError(409, 'Registration and chassis belong to different vehicles.');
    let v = byRegistration || byChassis;
    const at = now();
    if (!v) {
      const vId = id('veh');
      db.prepare(`INSERT INTO vehicles
        (id, registration, make, model, category, color, chassis_number, engine_number, emergency_contact, verification_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED', ?)`)
        .run(vId, reg, make, model, category, color || null, chassis || null, engine || null, emergencyContact, at);
      v = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vId);
    } else {
      if (chassis && v.chassis_number && chassis !== v.chassis_number) throw new HttpError(409, 'Chassis number does not match the registered vehicle.');
      if (engine && v.engine_number && engine !== v.engine_number) throw new HttpError(409, 'Engine number does not match the registered vehicle.');
      db.prepare(`UPDATE vehicles SET chassis_number=coalesce(chassis_number,?),engine_number=coalesce(engine_number,?),
        emergency_contact=coalesce(emergency_contact,?),color=coalesce(color,?) WHERE id=?`)
        .run(chassis || null, engine || null, emergencyContact, color || null, v.id);
    }

    const alreadyActive = db.prepare("SELECT qr_id FROM qr_units WHERE vehicle_id=? AND status='ACTIVE' AND id<>?").get(v.id, q.id);
    if (alreadyActive) throw new HttpError(409, `Vehicle already has active QR ${alreadyActive.qr_id}.`);

    if (ownerPhone) {
      let owner = db.prepare('SELECT * FROM users WHERE phone = ?').get(ownerPhone);
      if (owner && owner.role !== 'OWNER') throw new HttpError(409, 'This phone number belongs to a non-owner account.');
      if (!owner) {
        const uId = id('usr');
        const pass = passwordRecord(randomBytes(32).toString('base64url'));
        const email = `owner_${ownerPhone.slice(-6)}_${randomBytes(4).toString('hex')}@smarto.local`;
        db.prepare(`INSERT INTO users (id, email, name, role, phone, password_salt, password_hash, created_at)
          VALUES (?, ?, ?, 'OWNER', ?, ?, ?, ?)`)
          .run(uId, email, ownerName || `Vehicle Owner (${reg})`, ownerPhone, pass.salt, pass.hash, at);
        owner = db.prepare('SELECT * FROM users WHERE id = ?').get(uId);
      }
      if (v.owner_id && v.owner_id !== owner.id) throw new HttpError(409, 'Vehicle is already linked to a different owner account.');
      db.prepare('UPDATE vehicles SET owner_id = ? WHERE id = ?').run(owner.id, v.id);
    }

    db.prepare(`UPDATE qr_units SET status='ACTIVE',vehicle_id=?,fee_collected=?,payment_mode=?,activated_at=?,activated_by=?,
      installation_confirmed_at=?,final_scan_confirmed_at=?,updated_at=? WHERE id=?`)
      .run(v.id, feeCollected, paymentMode, at, actor.id, at, at, at, q.id);
    db.prepare(`INSERT INTO inventory_events (id,qr_id,event_type,from_location,to_location,actor_id,reason,created_at)
      VALUES (?,?,'QR_ACTIVATED',?,?,?,?,?)`)
      .run(id('evt'), q.id, `SHOWROOM:${showroomId}`, `VEHICLE:${v.id}`, actor.id, `Verified showroom fitment to ${reg}`, at);
    audit(actor, 'DECAL_ACTIVATED', 'qr_unit', q.id, {
      qrId: q.qr_id,
      registration: reg,
      feeCollected,
      paymentMode,
      ownerPhoneLast4: ownerPhone?.slice(-4) || null
    });

    return {
      success: true,
      qrId: q.qr_id,
      publicToken: q.public_token,
      registration: reg,
      make: v.make,
      model: v.model,
      category: v.category,
      feeCollected,
      paymentMode,
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
  const name = String(input.customerName || '').trim();
  const phone = String(input.customerPhone || '').trim().replace(/[^0-9+]/g, '');
  const address = String(input.address || '').trim();
  const city = String(input.city || '').trim();
  const stateVal = String(input.state || 'Bihar').trim();
  const pincode = String(input.pincode || '').trim();
  const sku = String(input.productSku || 'SMARTO-CAR-PACK').trim();
  const quantity = parseInt(input.quantity, 10) || 1;

  if (!name || name.length < 2) throw new HttpError(400, 'Please enter your full delivery name.');
  const normalizedPhone = normalizePhone(phone);
  if (!address || address.length < 5) throw new HttpError(400, 'Please enter your complete shipping street address.');
  if (!city) throw new HttpError(400, 'Please enter your shipping city.');
  const normalizedPincode = validatePincode(pincode);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new HttpError(400, 'Order quantity must be between 1 and 10 kits.');

  const catalog = storeCatalog();
  const prod = catalog.find(p => p.sku === sku);
  if (!prod) throw new HttpError(400, 'Choose a valid store product.');
  const unitPrice = prod.price;
  const totalAmount = unitPrice * quantity;

  const orderId = id('ord');
  const at = now();
  const accessToken = randomBytes(32).toString('base64url');
  const accessTokenHash = createHash('sha256').update(accessToken).digest('hex');

  db.prepare(`
    INSERT INTO orders (id, customer_name, customer_phone, address, city, state, pincode, product_sku, product_name, quantity, unit_price, total_amount, payment_status, payment_mode, order_status, access_token_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NULL, 'AWAITING_PAYMENT', ?, ?)
  `).run(orderId, name, normalizedPhone, address, city, stateVal, normalizedPincode, prod.sku, prod.name, quantity, unitPrice, totalAmount, accessTokenHash, at);

  return {
    success: true,
    orderId,
    accessToken,
    productName: prod.name,
    quantity,
    totalAmount,
    customerName: name,
    paymentStatus: 'PENDING',
    orderStatus: 'AWAITING_PAYMENT',
    message: 'Order draft created. No payment or inventory allocation has occurred yet.'
  };
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
