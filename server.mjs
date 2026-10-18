import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, id, now, verifyPasswordAsync } from './src/db.mjs';
import { HttpError, audit, dashboard, listQrs, createBatch, transitionQr, listShowrooms, createShowroom,
  listVehicles, listMessages, updateMessage, publicQr, createPublicMessage, ownerHome, auditLog,
  requestOtp, verifyOtp, lookupQr,
  dealerDashboard, dealerRequestStock, dealerGetRequests, adminListRequisitions, adminAllotStock,
  dealerActivateDecal, dealerLedger, dealerAvailableStock,
  ownerUpdateVehicle, ownerUpdateProfile, ownerRequestReplacement, ownerRebindDecal,
  storeCatalog, storeCreateOrder, storeGetOrders, initiateMaskedCall } from './src/operations.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 3000);
const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : '';
const sessions = db.prepare(`SELECT s.token_hash,s.expires_at,u.id,u.email,u.name,u.phone,u.role,u.showroom_id
  FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`);
const loginAttempts = new Map();
const orderAttempts = new Map();
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};
const hash = x => createHash('sha256').update(x).digest('hex');
const clientIp = req => {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
};

function consumeRateLimit(map, key, limit, windowMs, message) {
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

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()'
};
if (process.env.NODE_ENV === 'production') securityHeaders['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';

function json(res, status, value) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...securityHeaders
  });
  res.end(JSON.stringify(value));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 3_000_000) { // allow up to 3MB for photo attachments
        reject(new HttpError(413, 'Request payload too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      try { resolveBody(raw ? JSON.parse(raw) : {}); }
      catch { reject(new HttpError(400, 'Invalid JSON request payload.')); }
    });
    req.on('error', reject);
  });
}

function getUser(req) {
  const raw = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('svqr_session='))?.slice('svqr_session='.length);
  if (!raw) return null;
  let tokenValue;
  try { tokenValue = decodeURIComponent(raw); } catch { return null; }
  const row = sessions.get(hash(tokenValue), now());
  return row ? { id: row.id, email: row.email, name: row.name, phone: row.phone, role: row.role, showroom_id: row.showroom_id } : null;
}

function requireUser(user, roles = []) {
  if (!user) throw new HttpError(401, 'Please sign in to continue.');
  if (roles.length && !roles.includes(user.role)) throw new HttpError(403, 'Your role cannot perform this action.');
  return user;
}

function originCheck(req) {
  if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403, 'Cross-site request blocked.');
  const origin = req.headers.origin;
  if (!origin) return;
  const host = req.headers.host;
  let parsed;
  try { parsed = new URL(origin); } catch { throw new HttpError(403, 'Invalid request origin.'); }
  if (!host || parsed.host !== host) throw new HttpError(403, 'Cross-origin request blocked.');
}

async function staticFile(pathname, res) {
  let relative;
  try { relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1)); }
  catch { throw new HttpError(400, 'Invalid URL path.'); }
  if (relative.includes('..') || relative.includes('\\')) return false;
  const file = resolve(root, 'public', relative);
  if (!file.startsWith(resolve(root, 'public') + sep)) return false;
  try { if (!(await stat(file)).isFile()) return false; } catch { return false; }
  const body = await readFile(file);
  res.writeHead(200, {
    'Content-Type': mime[extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    ...securityHeaders,
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"
  });
  res.end(body);
  return true;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname, method = req.method || 'GET';
    const user = getUser(req);

    if (path.startsWith('/api/') && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) originCheck(req);
    
    // Core Health & Session
    if (path === '/api/health' && method === 'GET') return json(res, 200, { ok: true, service: 'smart-vehicle-qr', time: now() });
    if (path === '/api/session' && method === 'GET') return json(res, 200, { user: user ? { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role, showroom_id: user.showroom_id } : null });
    
    // Login with Async Non-blocking Scrypt
    if (path === '/api/login' && method === 'POST') {
      const body = await readBody(req), email = String(body.email || '').trim().toLowerCase(), password = String(body.password || '');
      const key = `${clientIp(req)}:${email}`;
      consumeRateLimit(loginAttempts, key, 10, 60_000, 'Too many sign-in attempts. Please wait one minute.');

      const account = db.prepare('SELECT * FROM users WHERE email=?').get(email);
      if (!account || !(await verifyPasswordAsync(password, account.password_salt, account.password_hash))) {
        throw new HttpError(401, 'Email address or password is incorrect.');
      }
      const sessionToken = randomBytes(32).toString('base64url'), expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(hash(sessionToken), account.id, expires, now());
      audit({ id: account.id, name: account.name }, 'LOGIN', 'user', account.id, { role: account.role, showroom_id: account.showroom_id });
      res.setHeader('Set-Cookie', `svqr_session=${encodeURIComponent(sessionToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secureCookie}`);
      return json(res, 200, { user: { id: account.id, email: account.email, name: account.name, phone: account.phone, role: account.role, showroom_id: account.showroom_id } });
    }

    // Owner Mobile Phone OTP Login
    if (path === '/api/otp/request' && method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, requestOtp(body.phone, clientIp(req)));
    }
    if (path === '/api/otp/verify' && method === 'POST') {
      const body = await readBody(req);
      const verifiedUser = verifyOtp(body.phone, body.code, clientIp(req));
      const sessionToken = randomBytes(32).toString('base64url'), expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(hash(sessionToken), verifiedUser.id, expires, now());
      res.setHeader('Set-Cookie', `svqr_session=${encodeURIComponent(sessionToken)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secureCookie}`);
      return json(res, 200, { user: verifiedUser });
    }

    // Logout
    if (path === '/api/logout' && method === 'POST') {
      if (user) {
        const raw = req.headers.cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('svqr_session='))?.slice('svqr_session='.length);
        if (raw) {
          try { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(decodeURIComponent(raw))); } catch {}
        }
        audit(user, 'LOGOUT', 'user', user.id);
      }
      res.setHeader('Set-Cookie', `svqr_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie}`);
      return json(res, 200, { ok: true });
    }

    // Admin & Operational APIs
    if (path === '/api/dashboard' && method === 'GET') { requireUser(user, ['ADMIN']); return json(res, 200, dashboard()); }
    if (path === '/api/qrs' && method === 'GET') { requireUser(user, ['ADMIN']); return json(res, 200, { items: listQrs(url.searchParams.get('status') || '') }); }
    if (path === '/api/qrs/lookup' && method === 'GET') {
      requireUser(user, ['ADMIN', 'SHOWROOM_MANAGER']);
      return json(res, 200, lookupQr(url.searchParams.get('q')));
    }
    if (path === '/api/batches' && method === 'POST') {
      const actor = requireUser(user, ['ADMIN']), body = await readBody(req);
      return json(res, 201, createBatch(actor, body));
    }
    const unitMatch = path.match(/^\/api\/qrs\/([^/]+)\/([^/]+)$/);
    if (unitMatch && method === 'POST') {
      const actor = requireUser(user, ['ADMIN']), body = await readBody(req);
      return json(res, 200, transitionQr(actor, decodeURIComponent(unitMatch[1]), unitMatch[2], body));
    }
    if (path === '/api/showrooms' && method === 'GET') { requireUser(user, ['ADMIN']); return json(res, 200, { items: listShowrooms() }); }
    if (path === '/api/showrooms' && method === 'POST') {
      const actor = requireUser(user, ['ADMIN']), body = await readBody(req);
      return json(res, 201, createShowroom(actor, body));
    }
    if (path === '/api/vehicles' && method === 'GET') { requireUser(user, ['ADMIN']); return json(res, 200, { items: listVehicles() }); }
    if (path === '/api/messages' && method === 'GET') { requireUser(user, ['ADMIN']); return json(res, 200, { items: listMessages() }); }
    
    const messageMatch = path.match(/^\/api\/messages\/([^/]+)$/);
    if (messageMatch && method === 'PATCH') {
      const actor = requireUser(user, ['ADMIN']), body = await readBody(req);
      return json(res, 200, updateMessage(actor, decodeURIComponent(messageMatch[1]), body.status));
    }

    // Showroom / Dealer Vendor APIs
    if (path === '/api/dealer/dashboard' && method === 'GET') {
      const actor = requireUser(user, ['SHOWROOM_MANAGER', 'ADMIN']);
      return json(res, 200, dealerDashboard(actor, url.searchParams.get('showroomId')));
    }
    if (path === '/api/dealer/request-stock' && method === 'POST') {
      const actor = requireUser(user, ['SHOWROOM_MANAGER', 'ADMIN']), body = await readBody(req);
      return json(res, 201, dealerRequestStock(actor, body));
    }
    if (path === '/api/dealer/requests' && method === 'GET') {
      const actor = requireUser(user, ['SHOWROOM_MANAGER', 'ADMIN']);
      return json(res, 200, { items: dealerGetRequests(actor) });
    }
    if (path === '/api/dealer/activate-decal' && method === 'POST') {
      const actor = requireUser(user, ['SHOWROOM_MANAGER', 'ADMIN']), body = await readBody(req);
      return json(res, 200, dealerActivateDecal(actor, body));
    }
    if (path === '/api/dealer/ledger' && method === 'GET') {
      const actor = requireUser(user, ['SHOWROOM_MANAGER', 'ADMIN']);
      return json(res, 200, { items: dealerLedger(actor, url.searchParams.get('q')) });
    }
    if (path === '/api/dealer/inventory' && method === 'GET') {
      const actor = requireUser(user, ['SHOWROOM_MANAGER', 'ADMIN']);
      return json(res, 200, { items: dealerAvailableStock(actor) });
    }

    // Admin Stock Requisitions & Allotment
    if (path === '/api/admin/requisitions' && method === 'GET') {
      requireUser(user, ['ADMIN']);
      return json(res, 200, { items: adminListRequisitions() });
    }
    const allotMatch = path.match(/^\/api\/admin\/requisitions\/([^/]+)\/allot$/);
    if (allotMatch && method === 'POST') {
      const actor = requireUser(user, ['ADMIN']);
      return json(res, 200, adminAllotStock(actor, decodeURIComponent(allotMatch[1])));
    }

    // Citizen Public Scan Gateway & Masked Voice Calling
    const maskedCallMatch = path.match(/^\/api\/scan\/([^/]+)\/masked-call$/);
    if (maskedCallMatch && method === 'POST') {
      const body = await readBody(req);
      return json(res, 200, await initiateMaskedCall(decodeURIComponent(maskedCallMatch[1]), body.callerPhone, clientIp(req)));
    }
    const scanMatch = path.match(/^\/api\/scan\/([^/]+)$/);
    if (scanMatch && method === 'GET') return json(res, 200, publicQr(decodeURIComponent(scanMatch[1])));
    if (scanMatch && method === 'POST') {
      const body = await readBody(req);
      return json(res, 201, await createPublicMessage(decodeURIComponent(scanMatch[1]), body, clientIp(req)));
    }

    // Owner Portal Self-Service
    if (path === '/api/owner/home' && method === 'GET') {
      const actor = requireUser(user, ['OWNER']);
      return json(res, 200, ownerHome(actor.id));
    }
    const ownerVehMatch = path.match(/^\/api\/owner\/vehicle\/([^/]+)$/);
    if (ownerVehMatch && method === 'PATCH') {
      const actor = requireUser(user, ['OWNER']);
      const body = await readBody(req);
      return json(res, 200, ownerUpdateVehicle(actor, decodeURIComponent(ownerVehMatch[1]), body));
    }
    if (path === '/api/owner/profile' && method === 'PATCH') {
      const actor = requireUser(user, ['OWNER']);
      const body = await readBody(req);
      return json(res, 200, ownerUpdateProfile(actor, body));
    }
    if (path === '/api/owner/replacement' && method === 'POST') {
      const actor = requireUser(user, ['OWNER']);
      const body = await readBody(req);
      return json(res, 201, ownerRequestReplacement(actor, body));
    }
    if (path === '/api/owner/rebind' && method === 'POST') {
      const actor = requireUser(user, ['OWNER']);
      const body = await readBody(req);
      return json(res, 200, ownerRebindDecal(actor, body));
    }

    // D2C Consumer E-Commerce Store
    if (path === '/api/store/products' && method === 'GET') {
      return json(res, 200, { items: storeCatalog() });
    }
    if (path === '/api/store/order' && method === 'POST') {
      consumeRateLimit(orderAttempts, clientIp(req), 5, 60 * 60_000, 'Too many order attempts. Try again later.');
      const body = await readBody(req);
      return json(res, 201, storeCreateOrder(body));
    }
    if (path === '/api/store/orders' && method === 'GET') {
      const actor = requireUser(user, ['OWNER', 'ADMIN']);
      return json(res, 200, { items: storeGetOrders(actor, url.searchParams.get('phone')) });
    }

    // Audit Log & Blueprint
    if (path === '/api/audit' && method === 'GET') { requireUser(user, ['ADMIN']); return json(res, 200, { items: auditLog() }); }
    if (path === '/api/blueprint' && method === 'GET') {
      requireUser(user, ['ADMIN']);
      const file = resolve(root, 'Smart_Vehicle_QR_Developer_Blueprint_Roadmap_v2.0.docx');
      const body = await readFile(file);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="Smart_Vehicle_QR_Blueprint_Roadmap.docx"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      return res.end(body);
    }

    if (path.startsWith('/api/')) return json(res, 404, { error: 'API route not found.' });
    if (await staticFile(path, res)) return;
    if (path.startsWith('/scan/') || path === '/owner' || path === '/admin' || path === '/dealer' || path === '/showroom' || path === '/store') return staticFile('/', res);
    return json(res, 404, { error: 'Page not found.' });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    return json(res, status, { error: status === 500 ? 'Internal service error. Please try again.' : error.message });
  }
});

const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
server.listen(port, host, () => console.log(`Smart Vehicle QR listening at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`));

const cleanupTimer = setInterval(() => {
  const at = now();
  db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(at);
  db.prepare('DELETE FROM otp_codes WHERE expires_at<=?').run(at);
}, 60 * 60_000);
cleanupTimer.unref();

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
