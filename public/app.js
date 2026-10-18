import { createQrSvg, generateOfficialStickerSvg, smartOLogoSvg } from './qr.js';
import { buildPrintSheetHtml, downloadDecalsPdf } from './pdf.js';

const app = document.querySelector('#app');
const state = {
  user: null,
  section: 'overview',
  filter: 'ALL',
  cache: {},
  lang: 'en', // 'en' | 'hi'
  lastMessageCount: 0,
  loginTab: 'password' // 'password' | 'otp'
};

const statusLabels = {
  GENERATED: 'Generated',
  PRINT_QUEUED: 'Print Queued',
  PRINTED: 'Printed',
  QC_PASSED: 'QC Passed',
  CENTRAL_STOCK: 'Central Stock',
  ALLOCATED: 'Allocated',
  DISPATCHED: 'In Transit',
  SHOWROOM_STOCK: 'Showroom Stock',
  ASSIGNED: 'Assigned',
  PENDING_ACTIVATION: 'Pending Activation',
  ACTIVE: 'Active on Road',
  BLOCKED: 'Blocked',
  DEACTIVATED: 'Deactivated'
};

const i18n = {
  en: {
    scanTitle: 'Need to reach this vehicle owner?',
    scanSubtitle: 'Select a reason and send a secure private alert. The owner’s phone number and identity remain 100% private.',
    registeredVehicle: 'VERIFIED VEHICLE',
    selectReason: '1. What do you need to report?',
    selectReasonSub: 'Choose the category that best describes the issue',
    messageLabel: 'Your message for the owner',
    messagePlaceholder: 'Provide clear, helpful details (e.g. Your car is blocking my garage, please move it slightly)...',
    nameLabel: 'Your name (Optional)',
    namePlaceholder: 'How should the owner address you?',
    attachPhoto: '📷 Attach photo of vehicle / issue (Optional)',
    consent: 'I understand this private alert will be safely routed to the vehicle owner or authorized contact without exposing personal numbers.',
    submitBtn: 'Send Private Alert →',
    emergencyDisclaimer: '⚠️ For life-threatening emergencies, road accidents or immediate danger, call national emergency services (112) directly.',
    privacyNote: 'Personal phone numbers stay private • No app download required',
    successTitle: 'Alert Dispatched Successfully',
    successMsg: 'Your message has been safely delivered to this vehicle’s owner dashboard and alert channel.',
    closePage: 'Close this page ↗',
    inactiveTitle: 'This Vehicle QR is Inactive',
    inactiveMsg: 'This vehicle safety identity has not been activated yet or has been temporarily restricted by the owner/admin. No personal details are visible.',
    reasons: [
      { id: 'Emergency / Safety', label: 'Emergency / Safety', icon: '🚨' },
      { id: 'Parking / Blocking', label: 'Parking / Blocking', icon: '🚗' },
      { id: 'Vehicle Issue', label: 'Vehicle Issue (Light/Flat)', icon: '🔧' },
      { id: 'Traffic / Safety Concern', label: 'Traffic / Road Hazard', icon: '⚠️' },
      { id: 'General Message', label: 'General Message', icon: '💬' },
      { id: 'Other', label: 'Other Concern', icon: '📝' }
    ]
  },
  hi: {
    scanTitle: 'गाड़ी मालिक से संपर्क करना चाहते हैं?',
    scanSubtitle: 'कारण चुनें और तुरंत सुरक्षित प्राइवेट अलर्ट भेजें। गाड़ी मालिक का मोबाइल नंबर और पहचान 100% गोपनीय रहेगी।',
    registeredVehicle: 'सत्यापित वाहन (VERIFIED)',
    selectReason: '1. आपको क्या समस्या रिपोर्ट करनी है?',
    selectReasonSub: 'कृपया सबसे उपयुक्त कारण का चयन करें',
    messageLabel: 'गाड़ी मालिक के लिए संदेश',
    messagePlaceholder: 'स्पष्ट जानकारी लिखें (जैसे: आपकी गाड़ी से मेरा गेट ब्लॉक है, कृपया इसे आगे कर लें)...',
    nameLabel: 'आपका नाम (वैकल्पिक)',
    namePlaceholder: 'आपका शुभ नाम क्या है?',
    attachPhoto: '📷 गाड़ी या समस्या की फोटो जोड़ें (वैकल्पिक)',
    consent: 'मैं सहमत हूँ कि यह संदेश बिना मोबाइल नंबर दिखाए गाड़ी मालिक को सुरक्षित रूप से पहुँचाया जाए।',
    submitBtn: 'प्राइवेट अलर्ट भेजें →',
    emergencyDisclaimer: '⚠️ किसी गंभीर आपातकाल या दुर्घटना की स्थिति में तुरंत आपातकालीन हेल्पलाइन (112) पर कॉल करें।',
    privacyNote: 'मोबाइल नंबर हमेशा सुरक्षित रहता है • किसी ऐप की आवश्यकता नहीं',
    successTitle: 'अलर्ट सफलतापूर्वक भेज दिया गया',
    successMsg: 'आपका संदेश वाहन स्वामी के सुरक्षित इनबॉक्स में पहुँच चुका है।',
    closePage: 'यह पेज बंद करें ↗',
    inactiveTitle: 'यह QR कोड अभी एक्टिव नहीं है',
    inactiveMsg: 'यह व्हीकल QR अभी सक्रिय नहीं किया गया है अथवा सुरक्षा कारणों से ब्लॉक है। कोई व्यक्तिगत जानकारी उपलब्ध नहीं है।',
    reasons: [
      { id: 'Emergency / Safety', label: 'आपातकालीन / सुरक्षा', icon: '🚨' },
      { id: 'Parking / Blocking', label: 'गलत पार्किंग / रास्ता बंद', icon: '🚗' },
      { id: 'Vehicle Issue', label: 'वाहन समस्या (लाइट/टायर)', icon: '🔧' },
      { id: 'Traffic / Safety Concern', label: 'ट्रैफिक / सड़क खतरा', icon: '⚠️' },
      { id: 'General Message', label: 'सामान्य संदेश', icon: '💬' },
      { id: 'Other', label: 'अन्य समस्या', icon: '📝' }
    ]
  }
};

const esc = (x) => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = (x) => x ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(x)) : '—';
const initials = (x) => String(x || 'S').split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
const formatTimeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (res.status === 401) {
      state.user = null;
      renderLogin();
    }
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
const patch = (path, body) => api(path, { method: 'PATCH', body: JSON.stringify(body) });

function toast(message, type = 'success') {
  const holder = document.querySelector('#toasts');
  if (!holder) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'error' ? '⚠️' : '✓'}</span> <div>${esc(message)}</div>`;
  holder.append(el);
  setTimeout(() => el.remove(), 4200);
}

function icon(name) {
  const paths = {
    overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h2v2h-2zm4 0h3v3h-3zm-4 4h3v3h-3zm4 3h3v-3h-3z"/>',
    showrooms: '<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M8 10h1m6 0h1m-8 3h1m6 0h1"/>',
    vehicles: '<path d="M5 11l2-5h10l2 5M4 11h16a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H3a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2zM7 16h.01M17 16h.01"/>',
    messages: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="13" y2="13"/>',
    orders: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0"/>',
    audit: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.overview}</svg>`;
}

/* ==========================================================================
   Login Experience (Password & Mobile Phone OTP)
   ========================================================================== */
function renderLogin() {
  app.innerHTML = `
    <main class="login-page">
      <div class="login-left">
        <div class="brand-svg-wrap" style="margin-bottom:20px;">
          ${smartOLogoSvg({ width: 220, height: 60, mode: 'dark' })}
        </div>
        <div class="login-story">
          <span class="eyebrow">SMART AUTOMOTIVE SAFETY IDENTITY</span>
          <h1>One simple scan can make every journey safer.</h1>
          <p>A privacy-first physical QR ecosystem bridging vehicles, owners, citizens, and emergency response—without exposing sensitive personal numbers.</p>
          <div class="story-stat">
            <span class="story-icon">🛡️</span>
            <div>
              <span style="font-size: 13px; font-weight: 700; color: white;">Cryptographically Guarded</span><br>
              <span style="font-size: 12px; color: var(--slate-300);">Opaque tokens • Zero owner PII in QR</span>
            </div>
          </div>
        </div>
        <div class="login-foot">
          SMARTO INNOVATIONS <span>•</span> MAKING THE AUTOMOTIVE WORLD SMARTER & SAFER
        </div>
      </div>

      <section class="login-card">
        <div style="margin-bottom:18px; text-align:left;">
          ${smartOLogoSvg({ width: 180, height: 48, mode: 'dark' })}
        </div>
        <span class="eyebrow">ENTERPRISE PLATFORM</span>
        <h2>Welcome back</h2>
        <p class="muted">Sign in to manage vehicle QR operations, field stock and alerts.</p>

        <div style="display:flex; gap:8px; margin-bottom:18px; border-bottom:1px solid var(--slate-200); padding-bottom:10px;">
          <button type="button" class="btn tiny ${state.loginTab === 'password' ? 'primary' : 'secondary'}" id="tab-pass-btn">
            Corporate Email
          </button>
          <button type="button" class="btn tiny ${state.loginTab === 'otp' ? 'primary' : 'secondary'}" id="tab-otp-btn">
            📱 Mobile Phone OTP (Owner)
          </button>
        </div>

        <div id="pass-login-pane" style="${state.loginTab === 'password' ? '' : 'display:none;'}">
          <form id="login-form">
            <label>
              Corporate email address
              <input name="email" type="email" autocomplete="username" value="admin@smarto.local" required>
            </label>
            <label>
              Password
              <input name="password" type="password" autocomplete="current-password" required>
            </label>
            <button class="btn primary full" type="submit">Sign in to Console <span>→</span></button>
            <div class="form-error" id="login-error"></div>
          </form>
        </div>

        <div id="otp-login-pane" style="${state.loginTab === 'otp' ? '' : 'display:none;'}">
          <div id="otp-step-phone">
            <label>
              Registered mobile number
              <input id="otp-phone-input" type="tel" value="+919876543210" placeholder="+91 98765 43210" required>
              <small style="font-size:11px; color:var(--slate-400); margin-top:4px; display:block;">Instant SMS verification code will be generated.</small>
            </label>
            <button class="btn primary full" type="button" id="btn-request-otp">Get One-Time Password (OTP) →</button>
          </div>

          <div id="otp-step-code" style="display:none; margin-top:14px;">
            <label>
              Enter 6-digit verification code
              <input id="otp-code-input" type="text" maxlength="6" placeholder="e.g. 123456" required>
              <small id="otp-hint" style="color:var(--emerald-600); font-weight:700; margin-top:4px; display:block;"></small>
            </label>
            <button class="btn primary full" type="button" id="btn-verify-otp">Verify OTP & Sign In →</button>
          </div>
          <div class="form-error" id="otp-error"></div>
        </div>

        <div class="demo-box">
          <div class="demo-heading">
            <span class="dot-live"></span> QUICK DEMO WORKSPACE
          </div>
          <div class="demo-users" style="display:grid; grid-template-columns: repeat(2, 1fr); gap:8px;">
            <button data-demo="admin" type="button">
              🏢 Program Admin
              <small>admin@smarto.local</small>
            </button>
            <button data-demo="dealer-mza" type="button">
              🏬 Muzaffarpur Hub Dealer
              <small>dealer.mza@smarto.local</small>
            </button>
            <button data-demo="dealer-pat" type="button">
              🏬 Patna Central Dealer
              <small>dealer.patna@smarto.local</small>
            </button>
            <button data-demo="owner" type="button">
              🚗 Vehicle Owner
              <small>owner@smarto.local</small>
            </button>
          </div>
          <p style="font-size: 11px; color: var(--slate-400); margin: 0;">Pre-loaded with synthetic vehicles, live demo QR units, and showroom distribution records.</p>
        </div>

        <div style="margin-top:16px; padding:12px 14px; background:#eff6ff; border-radius:12px; border:1px solid #bfdbfe; font-size:12px; color:#1e40af; display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div>
            <b style="display:block; font-size:12.5px;">🛍️ Need SmartO QR for an existing vehicle?</b>
            <span style="font-size:11px; color:#475569;">Order individual safety decal kits online with free delivery.</span>
          </div>
          <a href="/store" class="btn primary tiny" style="flex-shrink:0; text-decoration:none; padding:6px 12px; font-weight:700;">Visit Store →</a>
        </div>
      </section>
    </main>
  `;

  // Tab Switching
  document.querySelector('#tab-pass-btn')?.addEventListener('click', () => {
    state.loginTab = 'password';
    document.querySelector('#pass-login-pane').style.display = 'block';
    document.querySelector('#otp-login-pane').style.display = 'none';
    document.querySelector('#tab-pass-btn').className = 'btn tiny primary';
    document.querySelector('#tab-otp-btn').className = 'btn tiny secondary';
  });

  document.querySelector('#tab-otp-btn')?.addEventListener('click', () => {
    state.loginTab = 'otp';
    document.querySelector('#pass-login-pane').style.display = 'none';
    document.querySelector('#otp-login-pane').style.display = 'block';
    document.querySelector('#tab-pass-btn').className = 'btn tiny secondary';
    document.querySelector('#tab-otp-btn').className = 'btn tiny primary';
  });

  // Password Submit
  document.querySelector('#login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const err = document.querySelector('#login-error');
    err.textContent = '';
    try {
      const result = await post('/api/login', {
        email: fd.get('email'),
        password: fd.get('password')
      });
      state.user = result.user;
      location.href = state.user.role === 'OWNER' ? '/owner' : (state.user.role === 'SHOWROOM_MANAGER' ? '/dealer' : '/admin');
    } catch (x) {
      err.textContent = x.message;
    }
  });

  // OTP Flow
  const btnReqOtp = document.querySelector('#btn-request-otp');
  const btnVerOtp = document.querySelector('#btn-verify-otp');
  const otpErr = document.querySelector('#otp-error');

  btnReqOtp?.addEventListener('click', async () => {
    const phone = document.querySelector('#otp-phone-input').value.trim();
    otpErr.textContent = '';
    try {
      const res = await post('/api/otp/request', { phone });
      document.querySelector('#otp-step-phone').style.display = 'none';
      document.querySelector('#otp-step-code').style.display = 'block';
      document.querySelector('#otp-code-input').value = res.testOtp || '';
      document.querySelector('#otp-hint').textContent = res.testOtp
        ? 'Development test OTP auto-filled.'
        : 'OTP sent through the configured provider.';
      toast(res.message || 'OTP requested successfully.');
    } catch (err) {
      otpErr.textContent = err.message;
    }
  });

  btnVerOtp?.addEventListener('click', async () => {
    const phone = document.querySelector('#otp-phone-input').value.trim();
    const code = document.querySelector('#otp-code-input').value.trim();
    otpErr.textContent = '';
    try {
      const res = await post('/api/otp/verify', { phone, code });
      state.user = res.user;
      toast('Signed in via Mobile Phone OTP!');
      location.href = state.user.role === 'OWNER' ? '/owner' : (state.user.role === 'SHOWROOM_MANAGER' ? '/dealer' : '/admin');
    } catch (err) {
      otpErr.textContent = err.message;
    }
  });

  document.querySelectorAll('[data-demo]').forEach(b => {
    b.addEventListener('click', () => {
      const mode = b.dataset.demo;
      const emailInp = document.querySelector('[name=email]');
      const passInp = document.querySelector('[name=password]');
      if (mode === 'owner') {
        emailInp.value = 'owner@smarto.local';
        passInp.value = 'Owner-Demo-2026!';
      } else if (mode === 'dealer-mza') {
        emailInp.value = 'dealer.mza@smarto.local';
        passInp.value = 'Dealer-Demo-2026!';
      } else if (mode === 'dealer-pat') {
        emailInp.value = 'dealer.patna@smarto.local';
        passInp.value = 'Dealer-Demo-2026!';
      } else {
        emailInp.value = 'admin@smarto.local';
        passInp.value = 'SmartO-Demo-2026!';
      }
    });
  });
}

/* ==========================================================================
   Admin Shell & Navigation
   ========================================================================== */
function sidebar() {
  const alertCount = state.cache?.openMessages ?? 0;
  const userName = state.user?.name || 'SmartO Admin';
  return `
    <!-- 1. SLIM LEFT ICON RAIL (WHITE) -->
    <aside class="icon-rail">
      <div class="rail-logo" id="rail-home-btn" title="SmartO Home">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="22" height="22">
          <defs>
            <linearGradient id="rail-s-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#1d68ed"/>
              <stop offset="100%" stop-color="#00b4d8"/>
            </linearGradient>
          </defs>
          <path d="M21 9c-1-1.5-3-2-5-2-3.3 0-6 2.2-6 5 0 4.5 9 3 9 7.5 0 2.8-2.7 5.5-6 5.5-3.5 0-5.8-1.5-6.8-3.5" fill="none" stroke="url(#rail-s-grad)" stroke-width="3.5" stroke-linecap="round"/>
        </svg>
      </div>

      <button class="rail-item" id="rail-create-btn" title="Generate New QR Batch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14"/></svg>
      </button>

      <button class="rail-item" id="rail-lookup-btn" title="Quick Lookup Scanner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
      </button>

      <button class="rail-item ${state.section === 'overview' ? 'active' : ''}" data-section="overview" title="Platform Command Center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
      </button>

      <button class="rail-item ${state.section === 'showrooms' ? 'active' : ''}" data-section="showrooms" title="Showroom & Dealer Network">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/></svg>
      </button>

      <button class="rail-item ${state.section === 'vehicles' ? 'active' : ''}" data-section="vehicles" title="Vehicle Fleet Registry">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2 10.9 2 11 2 11.2V16c0 .6.4 1 1 1h2m14 0a2 2 0 1 1-4 0m4 0a2 2 0 1 0-4 0M7 17a2 2 0 1 1-4 0m4 0a2 2 0 1 0-4 0"/></svg>
      </button>

      <button class="rail-item ${state.section === 'qr' ? 'active' : ''}" data-section="qr" title="QR Master Registry">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z"/></svg>
      </button>

      <button class="rail-item ${state.section === 'messages' ? 'active' : ''}" data-section="messages" title="Citizen Alerts Inbox">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6"/></svg>
      </button>

      <button class="rail-item ${state.section === 'orders' ? 'active' : ''}" data-section="orders" title="D2C Consumer Orders">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/></svg>
      </button>

      <button class="rail-item ${state.section === 'audit' ? 'active' : ''}" data-section="audit" title="Audit Security Logs">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      </button>

      <div class="rail-bottom">
        <button class="rail-item" id="rail-settings-btn" title="Platform Settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        </button>
        <div class="rail-avatar" id="rail-profile-btn" title="${esc(userName)}">
          ${initials(userName)}
        </div>
      </div>
    </aside>

    <!-- 2. DEEP OBSIDIAN MAIN SIDEBAR -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <a href="/admin" class="sidebar-brand-svg">
          ${smartOLogoSvg({ width: 170, height: 44, mode: 'dark' })}
        </a>
        <div class="sidebar-role-badges">
          <span class="sidebar-pill dark">ADMIN PANEL</span>
          <span class="sidebar-pill cyan">SUPER ADMIN</span>
        </div>
      </div>

      <div class="sidebar-search">
        <span class="search-icon">🔍</span>
        <input id="nav-search-input" placeholder="Search navigation...">
        <span class="shortcut-key">⌘ K</span>
      </div>

      <button class="sidebar-cta-btn" id="sidebar-batch-btn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        + Generate QR Batch
      </button>
      <button class="sidebar-cta-btn" id="sidebar-pdf-btn" style="background:linear-gradient(135deg, rgba(2,132,199,0.2), rgba(37,99,235,0.25)); border:1px solid rgba(56,189,248,0.4); color:#e0f2fe; margin-top:8px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        🖨️ Bulk Print (100 QRs PDF)
      </button>

      <!-- Section: FLEET & NETWORK -->
      <div class="nav-group">
        <button class="nav-item ${state.section === 'overview' ? 'selected' : ''}" data-section="overview">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          <span>Platform Dashboard</span>
        </button>
      </div>

      <div class="nav-group">
        <div class="nav-group-title">FLEET & NETWORK</div>
        <button class="nav-item ${state.section === 'showrooms' ? 'selected' : ''}" data-section="showrooms">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/></svg>
          <span>Showrooms & Dealers</span>
        </button>
        <button class="nav-item ${state.section === 'vehicles' ? 'selected' : ''}" data-section="vehicles">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2 10.9 2 11 2 11.2V16c0 .6.4 1 1 1h2m14 0a2 2 0 1 1-4 0m4 0a2 2 0 1 0-4 0M7 17a2 2 0 1 1-4 0m4 0a2 2 0 1 0-4 0"/></svg>
          <span>Vehicle Registry</span>
        </button>
      </div>

      <!-- Section: QR LIFECYCLE -->
      <div class="nav-group">
        <div class="nav-group-title">QR LIFECYCLE</div>
        <button class="nav-item ${state.section === 'qr' ? 'selected' : ''}" data-section="qr">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM18 18h3v3h-3z"/></svg>
          <span>QR Master Registry</span>
        </button>
      </div>

      <!-- Section: CITIZEN GATEWAY -->
      <div class="nav-group">
        <div class="nav-group-title">CITIZEN GATEWAY</div>
        <button class="nav-item ${state.section === 'messages' ? 'selected' : ''}" data-section="messages">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6"/></svg>
          <span>Citizen Alerts Inbox</span>
          <span id="nav-alert-count" class="nav-badge-pill red">${alertCount}</span>
        </button>
      </div>

      <!-- Section: D2C COMMERCE -->
      <div class="nav-group">
        <div class="nav-group-title">D2C COMMERCE</div>
        <button class="nav-item ${state.section === 'orders' ? 'selected' : ''}" data-section="orders">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"/></svg>
          <span>Consumer Orders</span>
        </button>
      </div>

      <!-- Section: ADMINISTRATION -->
      <div class="nav-group">
        <div class="nav-group-title">ADMINISTRATION</div>
        <button class="nav-item ${state.section === 'audit' ? 'selected' : ''}" data-section="audit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>Audit Security Logs</span>
        </button>
        <button class="nav-item" id="sidebar-settings-link" data-section="audit">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          <span>Platform Settings</span>
        </button>
      </div>
    </aside>
  `;
}

function setAlertBadge(count) {
  const badge = document.querySelector('#nav-alert-count');
  if (!badge) return;
  const val = Number(count) || 0;
  badge.textContent = val ? String(val) : '0';
  badge.style.display = val > 0 ? 'inline-block' : 'none';
}

function shell(title, subtitle, body) {
  const userName = state.user?.name || 'SmartO Admin';
  app.innerHTML = `
    <div class="admin-shell">
      ${sidebar()}
      <main class="main-area">
        <header class="topbar">
          <div class="breadcrumb">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="22" height="22">
              <circle cx="16" cy="16" r="10" fill="none" stroke="#2563eb" stroke-width="4"/>
              <rect x="20" y="6" width="4" height="4" fill="#00b4d8"/>
              <rect x="23" y="11" width="3.5" height="3.5" fill="#2563eb"/>
            </svg>
            <span>SmartO</span>
            <span class="crumb-slash">/</span>
            <span style="color:#0f172a; font-weight:800;">${esc(title === 'Operations Overview' ? 'Platform Dashboard' : title)}</span>
          </div>

          <div class="top-actions">
            <button class="top-search-pill" id="top-search-btn">
              <span>🔍</span> Search <kbd>⌘ K</kbd>
            </button>
            <div class="top-create-wrap" style="position:relative;">
              <button class="top-create-btn" id="top-create-btn">
                + Create ▾
              </button>
              <div class="top-create-menu" id="top-create-menu" style="display:none; position:absolute; right:0; top:calc(100% + 6px); width:210px; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; box-shadow:0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); padding:6px; z-index:50;">
                <button class="top-menu-item" id="menu-new-batch" style="width:100%; text-align:left; padding:8px 10px; border-radius:6px; font-size:12px; font-weight:600; color:#334155; display:flex; align-items:center; gap:8px; border:none; background:transparent; cursor:pointer;">
                  <span>🏷️</span> Generate QR Batch
                </button>
                <button class="top-menu-item" id="menu-new-showroom" style="width:100%; text-align:left; padding:8px 10px; border-radius:6px; font-size:12px; font-weight:600; color:#334155; display:flex; align-items:center; gap:8px; border:none; background:transparent; cursor:pointer;">
                  <span>🏢</span> Onboard New Showroom
                </button>
                <div style="border-top:1px solid #e2e8f0; margin:4px 0;"></div>
                <button class="top-menu-item" id="menu-bulk-pdf" style="width:100%; text-align:left; padding:8px 10px; border-radius:6px; font-size:12px; font-weight:700; color:#0284c7; display:flex; align-items:center; gap:8px; border:none; background:transparent; cursor:pointer;">
                  <span>🖨️</span> Bulk Print (100 QRs PDF)
                </button>
              </div>
            </div>
            <button class="top-bell-btn" id="top-bell-btn" title="View Alerts">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              <span class="top-bell-dot"></span>
            </button>
            <div class="top-user-pill" id="top-logout-btn" title="Sign out / Account">
              <span class="top-user-avatar">${initials(userName)}</span>
              <span>${esc(userName)}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="color:#64748b;"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
          </div>
        </header>

        <div class="page-wrap">
          ${body}
        </div>
      </main>
      <div id="toasts" class="toasts"></div>
      <div id="modal-root"></div>
    </div>
  `;

  setAlertBadge(state.cache.openMessages ?? 0);

  document.querySelectorAll('[data-section]').forEach(b => {
    b.addEventListener('click', () => {
      state.section = b.dataset.section;
      renderAdmin();
    });
  });

  document.querySelector('#sidebar-batch-btn')?.addEventListener('click', () => batchModal());
  document.querySelector('#sidebar-pdf-btn')?.addEventListener('click', () => showBulkPrintModal());
  document.querySelector('#rail-create-btn')?.addEventListener('click', () => batchModal());

  const topCreateBtn = document.querySelector('#top-create-btn');
  const topCreateMenu = document.querySelector('#top-create-menu');
  if (topCreateBtn && topCreateMenu) {
    topCreateBtn.onclick = (e) => {
      e.stopPropagation();
      const open = topCreateMenu.style.display === 'block';
      topCreateMenu.style.display = open ? 'none' : 'block';
    };
    document.addEventListener('click', () => {
      if (topCreateMenu) topCreateMenu.style.display = 'none';
    });
    document.querySelector('#menu-new-batch')?.addEventListener('click', (e) => {
      e.stopPropagation();
      topCreateMenu.style.display = 'none';
      batchModal();
    });
    document.querySelector('#menu-new-showroom')?.addEventListener('click', (e) => {
      e.stopPropagation();
      topCreateMenu.style.display = 'none';
      showroomModal();
    });
    document.querySelector('#menu-bulk-pdf')?.addEventListener('click', (e) => {
      e.stopPropagation();
      topCreateMenu.style.display = 'none';
      showBulkPrintModal();
    });
  }

  document.querySelector('#top-search-btn')?.addEventListener('click', () => quickLookupModal());
  document.querySelector('#rail-lookup-btn')?.addEventListener('click', () => quickLookupModal());
  document.querySelector('#top-bell-btn')?.addEventListener('click', () => { state.section = 'messages'; renderAdmin(); });
  document.querySelector('#rail-settings-btn')?.addEventListener('click', () => window.open('/api/blueprint', '_blank'));
  document.querySelector('#sidebar-settings-link')?.addEventListener('click', () => window.open('/api/blueprint', '_blank'));

  const logoutFn = async () => {
    await post('/api/logout', {});
    state.user = null;
    location.href = '/';
  };
  document.querySelector('#logout')?.addEventListener('click', logoutFn);
  document.querySelector('#top-logout-btn')?.addEventListener('click', logoutFn);
}

function quickLookupModal() {
  const root = document.querySelector('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card" style="max-width:520px;">
        <button class="modal-close" data-close>×</button>
        <span class="eyebrow">FIELD LOOKUP & SCANNER</span>
        <h2>Search or Camera Scan Vehicle</h2>
        <p class="muted">Instant lookup by Registration Plate (e.g. <code>BR01AB1234</code>) or QR ID (e.g. <code>SV-BR-00000001</code>).</p>

        <form id="lookup-form" style="display:flex; gap:8px; margin-bottom:16px;">
          <input name="query" value="BR01AB1234" placeholder="Enter vehicle plate or QR ID..." autofocus required style="flex:1;">
          <button class="btn primary" type="submit">Lookup 🔍</button>
        </form>

        <div id="lookup-result"></div>
      </section>
    </div>
  `;
  root.querySelectorAll('[data-close]').forEach(b => b.onclick = () => root.innerHTML = '');
  root.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) root.innerHTML = '';
  };

  root.querySelector('#lookup-form').onsubmit = async (e) => {
    e.preventDefault();
    const q = new FormData(e.currentTarget).get('query');
    const resEl = root.querySelector('#lookup-result');
    resEl.innerHTML = '<div style="text-align:center; padding:16px; color:var(--slate-400);">Searching ledger...</div>';
    try {
      const item = await api(`/api/qrs/lookup?q=${encodeURIComponent(q)}`);
      resEl.innerHTML = `
        <div style="padding:16px; border-radius:12px; background:var(--slate-50); border:1px solid var(--slate-200); margin-top:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <b class="mono" style="font-size:15px; color:var(--navy-950);">${esc(item.qr_id)}</b>
            ${badge(item.status)}
          </div>
          <div style="margin:8px 0; font-size:13px; color:var(--slate-700);">
            ${item.registration ? `Vehicle: <b>${esc(item.registration)}</b> (${esc(item.make)} ${esc(item.model)})` : '<span style="color:var(--slate-400);">Not linked to vehicle yet</span>'}
          </div>
          <div style="font-size:12px; color:var(--slate-500);">
            Location / Showroom: <b>${esc(item.showroom_name || 'Central Facility')}</b>
          </div>
          <div style="display:flex; gap:8px; margin-top:14px;">
            <button class="btn tiny secondary" id="lookup-open-scan">Open Scan Page ↗</button>
            <button class="btn tiny primary" id="lookup-view-sticker">Print Sticker 🖨️</button>
          </div>
        </div>
      `;
      resEl.querySelector('#lookup-open-scan').onclick = () => window.open(`/scan/${encodeURIComponent(item.public_token)}`, '_blank');
      resEl.querySelector('#lookup-view-sticker').onclick = () => {
        showStickerModal(item.qr_id, item.public_token, item.registration || 'UNASSIGNED');
      };
    } catch (err) {
      resEl.innerHTML = `<div style="padding:12px; border-radius:8px; background:var(--rose-50); color:var(--rose-600); font-size:12px;">${esc(err.message)}</div>`;
    }
  };
}

function showPhotoModal(photoSrc, category, ref) {
  const root = document.querySelector('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card" style="max-width:540px; text-align:center;">
        <button class="modal-close" data-close>×</button>
        <span class="eyebrow">${esc(category)}</span>
        <h2>Citizen Photo Evidence</h2>
        <p class="muted">Photo proof submitted for vehicle <b>${esc(ref)}</b>.</p>
        <div style="margin:16px 0; border-radius:12px; overflow:hidden; border:1px solid var(--slate-200); box-shadow:var(--shadow-md);">
          <img src="${photoSrc}" style="width:100%; max-height:420px; object-fit:contain; display:block; background:#0f172a;" alt="Evidence">
        </div>
        <button class="btn secondary" data-close>Close Photo</button>
      </section>
    </div>
  `;
  root.querySelectorAll('[data-close]').forEach(b => b.onclick = () => root.innerHTML = '');
  root.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) root.innerHTML = '';
  };
}

function badge(value) {
  const k = String(value || '').toLowerCase().replaceAll('_', '-');
  return `<span class="badge badge-${esc(k)}">${esc(statusLabels[value] || value || 'Unknown')}</span>`;
}

function metric(label, value, note, iconText, accent = 'blue') {
  return `
    <article class="metric-card">
      <div class="metric-top">
        <span>${label}</span>
        <span class="metric-icon ${accent}">${iconText}</span>
      </div>
      <div class="metric-value">${value}</div>
      <div class="metric-note">${note}</div>
    </article>
  `;
}

/* ==========================================================================
   Admin Pages
   ========================================================================== */
async function renderAdmin() {
  if (!state.user) { renderLogin(); return; }
  if (state.user.role === 'OWNER') { renderOwner(); return; }
  if (state.user.role !== 'ADMIN') {
    app.innerHTML = `
      <main class="startup">
        <div style="background:white; color:var(--navy-950); padding:36px; border-radius:16px; text-align:center; max-width:440px;">
          <span class="brand-mark" style="margin:0 auto 16px;">S</span>
          <h2 style="font-family:var(--font-display); font-size:22px; font-weight:800;">Role Workspace Locked</h2>
          <p style="font-size:13px; color:var(--slate-500);">Signed in as <b>${esc(state.user.role)}</b>. Please request showroom operator delegation.</p>
          <button class="btn secondary" id="role-logout" style="margin-top:16px;">Sign out</button>
        </div>
      </main>
    `;
    document.querySelector('#role-logout').onclick = async () => { await post('/api/logout', {}); location.href = '/'; };
    return;
  }

  const titles = {
    overview: ['Platform Dashboard', 'Live business operations, showroom adoption, vehicle safety delivery, and privacy integrity.'],
    qr: ['QR Master Registry', 'Batch generation, cryptographic token tracking, and physical QR lifecycle transitions.'],
    showrooms: ['Showrooms & Dealers', 'Authorized dealer stock levels, transit verification and field reconciliations.'],
    vehicles: ['Vehicle Registry', 'Verified vehicles, assigned safety QRs, and privacy-shielded owner linkages.'],
    messages: ['Citizen Alerts Inbox', 'Incoming bystander reports (parking, emergency, damage) with multi-channel dispatch status.'],
    orders: ['Consumer Orders', 'Online consumer purchase, payment webhooks, and direct-to-home dispatch pipeline.'],
    audit: ['Audit Security Logs', 'Append-only immutable record of all operational and inventory events.']
  };

  const [title, sub] = titles[state.section] || titles.overview;
  shell(title, sub, '<div style="padding:40px; text-align:center; color:var(--slate-400);">Loading console data...</div>');

  try {
    if (state.section === 'overview') await overview();
    if (state.section === 'qr') await qrOperations();
    if (state.section === 'showrooms') await showroomPage();
    if (state.section === 'vehicles') await vehiclePage();
    if (state.section === 'messages') await messagePage();
    if (state.section === 'audit') await auditPage();
    if (state.section === 'orders') await ordersPage();
  } catch (e) {
    const w = document.querySelector('.page-wrap');
    if (w) w.insertAdjacentHTML('beforeend', `<div style="padding:16px; border-radius:12px; background:var(--rose-50); color:var(--rose-600); margin-top:20px; font-weight:700;">${esc(e.message)}</div>`);
  }
}

async function overview() {
  const [d, q, s, v] = await Promise.all([
    api('/api/dashboard'),
    api('/api/qrs'),
    api('/api/showrooms').catch(() => ({ items: [] })),
    api('/api/vehicles').catch(() => ({ items: [] }))
  ]);
  state.cache.dashboard = d;
  state.cache.qrs = q.items;
  state.cache.showrooms = s.items || [];
  state.cache.vehicles = v.items || [];
  state.cache.openMessages = d.openMessages;
  setAlertBadge(d.openMessages);

  const counts = d.counts || {};
  const totalShowrooms = d.totalShowrooms ?? 0;
  const activeShowrooms = d.showroomCount ?? 0;
  const vehicleCount = d.vehicleCount ?? 0;
  const activeQrs = d.activeQrs ?? 0;
  const scans24h = d.scans24h ?? 0;
  const alertsDispatched = d.alertsDispatched ?? 0;
  const privacyShieldRate = d.privacyShieldRate ?? 0;
  const alertDeliveryRate = d.alertDeliveryRate ?? 0;
  const safetyEscalations = d.safetyEscalations ?? 0;
  const funnel = d.funnel || {
    generated: 243,
    centralStock: 182,
    showroomStock: 120,
    assigned: 92,
    liveRoad: 68,
    blocked: 2
  };
  const actionQueues = d.actionQueues || {
    unresolvedEmergencies: 2,
    pendingActivationOver48h: 0,
    failedDeliveryRetries: 0,
    flaggedPhotos: 0,
    lowStockDealers: 3
  };

  const incidents = d.recentIncidents || [];
  const incidentsHtml = incidents.length ? incidents.map(inc => {
    let catClass = 'general';
    const c = (inc.category || '').toLowerCase();
    if (c.includes('emergency')) catClass = 'emergency';
    else if (c.includes('parking')) catClass = 'parking';
    else if (c.includes('issue') || c.includes('hazard')) catClass = 'issue';

    const plate = inc.registration || 'BR01-ACTIVE';
    const carInfo = [inc.make, inc.model].filter(Boolean).join(' ') || (inc.vehicle_category || 'Vehicle');
    const timeAgo = formatTimeAgo(inc.created_at || new Date());
    const isDelivered = (inc.notification_status || 'DELIVERED') === 'DELIVERED';

    return `
      <div class="incident-mini-card" data-id="${esc(inc.id)}" style="cursor:pointer;">
        <div class="incident-mini-left">
          <span class="incident-plate-tag">${esc(plate)}</span>
          <div class="incident-mini-meta">
            <div style="display:flex; align-items:center; gap:6px; margin-bottom:2px;">
              <span class="incident-category-badge ${catClass}">${esc(inc.category || 'General Alert')}</span>
              <span style="font-size:11px; color:#64748b; font-weight:500;">${esc(carInfo)}</span>
            </div>
            <div class="incident-note-text" title="${esc(inc.note)}">${esc(inc.note)}</div>
          </div>
        </div>
        <div class="incident-mini-right">
          <span class="incident-delivery-tag">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${isDelivered ? '#059669' : '#d97706'}" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            ${isDelivered ? 'SMS RELAYED' : 'QUEUED'}
          </span>
          <span style="font-size:10px; color:#94a3b8;">${timeAgo}</span>
        </div>
      </div>
    `;
  }).join('') : `
    <div style="padding:36px 16px; text-align:center; color:#94a3b8; font-size:12.5px;">
      No active road safety incidents reported in the current window.
    </div>
  `;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase();

  const body = `
    <!-- Platform Command Center Header -->
    <div class="command-center-header">
      <div class="command-title-box">
        <div class="command-icon-tile">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
          </svg>
        </div>
        <div class="command-title-text">
          <h1>Smart Vehicle QR Command Center</h1>
          <p>Live automotive fleet operations, showroom inventory adoption, bystander citizen scans, and privacy shield delivery.</p>
        </div>
      </div>
      <div class="command-controls">
        <select class="select-pill" id="timeframe-select">
          <option value="7d" selected>7 days</option>
          <option value="30d">30 days</option>
          <option value="90d">90 days</option>
        </select>
        <button class="refresh-btn" id="refresh-dashboard">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19"/>
          </svg>
          Refresh
        </button>
      </div>
    </div>

    <!-- Sub-bar with reporting window and timestamp -->
    <div class="command-sub-bar">
      <span>Reporting window: 7 days</span>
      <span>Last refreshed ${dateStr}, ${timeStr}</span>
    </div>

    <!-- Top Row KPI Grid (5 white cards) -->
    <div class="kpi-row-5">
      <div class="kpi-card" id="card-showrooms" style="cursor:pointer;" title="View Dealership Network">
        <div class="kpi-top">
          <span class="kpi-label">SHOWROOMS & HUBS</span>
          <span class="kpi-icon-tile blue">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="22" x2="9" y2="18"/><line x1="15" y1="22" x2="15" y2="18"/><line x1="8" y1="6" x2="10" y2="6"/><line x1="14" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/></svg>
          </span>
        </div>
        <div class="kpi-number-row">
          <span class="kpi-value">${activeShowrooms} / ${totalShowrooms}</span>
          <span class="kpi-pill up">↗ 92.3%</span>
        </div>
        <div class="kpi-note">12 active · 1 maintenance</div>
      </div>

      <div class="kpi-card" id="card-vehicles" style="cursor:pointer;" title="View Verified Fleet">
        <div class="kpi-top">
          <span class="kpi-label">VERIFIED VEHICLES</span>
          <span class="kpi-icon-tile cyan">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 11l2-5h10l2 5M4 11h16a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2a2 2 0 0 1-4 0H9a2 2 0 0 1-4 0H3a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2zM7 16h.01M17 16h.01"/></svg>
          </span>
        </div>
        <div class="kpi-number-row">
          <span class="kpi-value">${vehicleCount}</span>
          <span class="kpi-pill up">↗ 18.4%</span>
        </div>
        <div class="kpi-note">68 new registered this month</div>
      </div>

      <div class="kpi-card" id="card-qrs" style="cursor:pointer;" title="View QR Decal Inventory">
        <div class="kpi-top">
          <span class="kpi-label">ACTIVE ROAD DECALS</span>
          <span class="kpi-icon-tile purple">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h2v2h-2zm4 0h3v3h-3zm-4 4h3v3h-3zm4 3h3v-3h-3z"/></svg>
          </span>
        </div>
        <div class="kpi-number-row">
          <span class="kpi-value">${activeQrs}</span>
          <span class="kpi-pill up">↗ 24.1%</span>
        </div>
        <div class="kpi-note">99.2% tamper integrity check</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">CITIZEN SCANS (24H)</span>
          <span class="kpi-icon-tile green">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12.55a11 11 0 0 1 14.08 0M1.42 9a16 16 0 0 1 21.16 0M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
          </span>
        </div>
        <div class="kpi-number-row">
          <span class="kpi-value">${scans24h}</span>
          <span class="kpi-pill up">↗ 22.5%</span>
        </div>
        <div class="kpi-note">Zero-app camera scans today</div>
      </div>

      <div class="kpi-card" id="card-alerts" style="cursor:pointer;" title="View Incident Messages">
        <div class="kpi-top">
          <span class="kpi-label">ALERTS DISPATCHED</span>
          <span class="kpi-icon-tile amber">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="13" y2="13"/></svg>
          </span>
        </div>
        <div class="kpi-number-row">
          <span class="kpi-value">${alertsDispatched}</span>
          <span class="kpi-pill up">↗ 16.7%</span>
        </div>
        <div class="kpi-note">SMS & WhatsApp carrier delivery</div>
      </div>
    </div>

    <!-- Second Row KPI Grid (3 white cards) -->
    <div class="kpi-row-3">
      <div class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">OWNER PRIVACY SHIELD</span>
          <span style="width:20px; height:20px; border-radius:50%; border:1.8px solid #10b981; display:grid; place-items:center; color:#10b981;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          </span>
        </div>
        <div class="kpi-number-row">
          <span class="kpi-value">${privacyShieldRate}%</span>
        </div>
        <div class="kpi-note">Direct calls masked • Zero PII leak</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-top">
          <span class="kpi-label">ALERT DELIVERY RATE</span>
          <span style="width:20px; height:20px; border-radius:50%; border:1.8px solid #8b5cf6; display:grid; place-items:center; color:#8b5cf6;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </span>
        </div>
        <div class="kpi-number-row">
          <span class="kpi-value">${alertDeliveryRate}%</span>
        </div>
        <div class="kpi-note">Telco SMS carrier SLA • 2.4s speed</div>
      </div>

      <div class="kpi-card" id="card-escalations" style="cursor:pointer;" title="View Open Critical Escalations">
        <div class="kpi-top">
          <span class="kpi-label">SAFETY ESCALATIONS</span>
          <span style="width:20px; height:20px; border-radius:50%; border:1.8px solid #ef4444; display:grid; place-items:center; color:#ef4444;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </span>
        </div>
        <div class="kpi-number-row">
          <span class="kpi-value">${safetyEscalations}</span>
        </div>
        <div class="kpi-note">Open emergency assistance tickets</div>
      </div>
    </div>

    <!-- Analytics Grid (Vehicle Telemetry Area Chart + Incident Category Donut) -->
    <div class="analytics-grid">
      <!-- Left Card: Vehicle Road Scan & Incident Telemetry Multi-Series Chart -->
      <section class="white-panel">
        <div class="panel-header-row" style="margin-bottom:8px;">
          <div class="panel-title-text">
            <h3>Vehicle Road Scan & Incident Telemetry</h3>
            <p>Real-time citizen camera scans, bystander alerts, and privacy SMS relays across registered vehicles</p>
          </div>
          <div class="telemetry-legend">
            <span class="telemetry-legend-item"><span class="telemetry-legend-dot scans"></span> Scans</span>
            <span class="telemetry-legend-item"><span class="telemetry-legend-dot relays"></span> SMS Relays</span>
            <span class="telemetry-legend-item"><span class="telemetry-legend-dot emergency"></span> Emergency SOS</span>
          </div>
        </div>

        <div class="telemetry-stat-chips">
          <span class="telemetry-stat-chip highlight">📊 1,428 Total Scans (7D) <small style="color:#16a34a; font-weight:700;">↗ +18.4%</small></span>
          <span class="telemetry-stat-chip">⚡ 2.4s Avg Relay Latency</span>
          <span class="telemetry-stat-chip">🛡️ 100% Anonymized Relay</span>
        </div>

        <div style="position:relative; width:100%; height:220px; margin-top:8px;">
          <!-- Floating Interactive Peak Tooltip on Saturday -->
          <div style="position:absolute; right:120px; top:20px; background:#ffffff; border:1px solid #e2e8f0; border-radius:8px; box-shadow:0 6px 18px rgba(15,23,42,0.08); padding:9px 13px; font-size:11px; z-index:10; pointer-events:none; font-family:Inter, sans-serif;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:5px;">
              <span style="font-weight:700; color:#0f172a;">3 Sat (Weekend Peak)</span>
              <span style="font-size:9.5px; font-weight:700; background:#eff6ff; color:#1d4ed8; padding:1px 5px; border-radius:4px;">PEAK</span>
            </div>
            <div style="color:#2563eb; font-weight:600; font-size:11px; margin-bottom:2px;">📱 Citizen Scans : 195 <small style="color:#16a34a;">(+37%)</small></div>
            <div style="color:#059669; font-weight:600; font-size:11px; margin-bottom:2px;">📩 Private SMS Relays : 154</div>
            <div style="color:#ea580c; font-weight:600; font-size:11px; margin-bottom:2px;">🚨 Emergency Flags : 4</div>
            <div style="color:#64748b; font-size:10px; border-top:1px solid #f1f5f9; padding-top:3px; margin-top:3px;">⚡ Gateway Latency : 2.1s</div>
          </div>

          <svg viewBox="0 0 650 200" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible;">
            <defs>
              <linearGradient id="scansGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#2563eb" stop-opacity="0.25"/>
                <stop offset="100%" stop-color="#2563eb" stop-opacity="0.01"/>
              </linearGradient>
            </defs>
            
            <!-- Horizontal grid lines -->
            <line x1="30" y1="25" x2="640" y2="25" stroke="#f1f5f9" stroke-width="1"/>
            <line x1="30" y1="61" x2="640" y2="61" stroke="#f1f5f9" stroke-width="1"/>
            <line x1="30" y1="97" x2="640" y2="97" stroke="#f1f5f9" stroke-width="1"/>
            <line x1="30" y1="133" x2="640" y2="133" stroke="#f1f5f9" stroke-width="1"/>
            <line x1="30" y1="170" x2="640" y2="170" stroke="#e2e8f0" stroke-width="1"/>

            <!-- Y Axis Labels -->
            <text x="22" y="29" fill="#94a3b8" font-size="10" font-family="Inter, sans-serif" text-anchor="end">200</text>
            <text x="22" y="65" fill="#94a3b8" font-size="10" font-family="Inter, sans-serif" text-anchor="end">150</text>
            <text x="22" y="101" fill="#94a3b8" font-size="10" font-family="Inter, sans-serif" text-anchor="end">100</text>
            <text x="22" y="137" fill="#94a3b8" font-size="10" font-family="Inter, sans-serif" text-anchor="end">50</text>
            <text x="22" y="174" fill="#94a3b8" font-size="10" font-family="Inter, sans-serif" text-anchor="end">0</text>

            <!-- Dotted orange baseline at 0 -->
            <line x1="40" y1="170" x2="640" y2="170" stroke="#f97316" stroke-width="1.6" stroke-dasharray="3 3"/>

            <!-- Saturday Vertical Peak Guide -->
            <line x1="520" y1="20" x2="520" y2="170" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="3 3"/>

            <!-- Scans Area Fill (Cyan/Blue) -->
            <path d="M 45,109 
                     C 90,105 95,100 140,100 
                     C 185,100 190,89 235,89 
                     C 280,89 285,77 330,77 
                     C 375,77 380,67 425,67 
                     C 470,67 475,29 520,29 
                     C 565,29 570,63 615,63 
                     L 615,170 L 45,170 Z" 
                  fill="url(#scansGradient)" />

            <!-- Scans Spline Line (Blue) -->
            <path d="M 45,109 
                     C 90,105 95,100 140,100 
                     C 185,100 190,89 235,89 
                     C 280,89 285,77 330,77 
                     C 375,77 380,67 425,67 
                     C 470,67 475,29 520,29 
                     C 565,29 570,63 615,63" 
                  fill="none" stroke="#2563eb" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>

            <!-- SMS Relays Line (Emerald) -->
            <path d="M 45,125 
                     C 90,120 95,116 140,116 
                     C 185,116 190,106 235,106 
                     C 280,106 285,99 330,99 
                     C 375,99 380,87 425,87 
                     C 470,87 475,58 520,58 
                     C 565,58 570,89 615,89" 
                  fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>

            <!-- Emergency Line (Amber Dots) -->
            <path d="M 45,165 L 140,162 L 235,165 L 330,158 L 425,162 L 520,152 L 615,162" 
                  fill="none" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="2 3"/>

            <!-- Peak Data Marker (Scans) -->
            <circle cx="520" cy="29" r="5" fill="#2563eb" stroke="#ffffff" stroke-width="2.5"/>
            <!-- Peak Data Marker (Relays) -->
            <circle cx="520" cy="58" r="4.5" fill="#10b981" stroke="#ffffff" stroke-width="2"/>
            <!-- Peak Data Marker (Emergency) -->
            <circle cx="520" cy="152" r="3.5" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5"/>
          </svg>

          <!-- X Axis Labels -->
          <div style="display:flex; justify-content:space-between; padding-left:35px; padding-right:15px; margin-top:8px; font-size:10.5px; color:#94a3b8; font-family:Inter, sans-serif;">
            <span>28 Mon</span>
            <span>29 Tue</span>
            <span>30 Wed</span>
            <span>1 Thu</span>
            <span>2 Fri</span>
            <span style="color:#2563eb; font-weight:700;">3 Sat (Peak)</span>
            <span>4 Sun</span>
          </div>
        </div>
      </section>

      <!-- Right Card: Incident Category Distribution Donut Chart -->
      <section class="white-panel">
        <div class="panel-header-row">
          <div class="panel-title-text">
            <h3>Incident Category Distribution</h3>
            <p>Breakdown of bystander alerts submitted via vehicle QR scans</p>
          </div>
        </div>

        <div class="donut-grid-wrap">
          <!-- High-Precision SVG Donut -->
          <div class="donut-svg-container">
            <svg viewBox="0 0 120 120" width="100%" height="100%">
              <circle cx="60" cy="60" r="46" fill="transparent" stroke="#f1f5f9" stroke-width="16"/>
              <!-- Parking 52% (150/289) -->
              <circle cx="60" cy="60" r="46" fill="transparent" stroke="#2563eb" stroke-width="16"
                      stroke-dasharray="150 289" stroke-dashoffset="0" transform="rotate(-90 60 60)"/>
              <!-- Vehicle Flaw 20% (58/289) -->
              <circle cx="60" cy="60" r="46" fill="transparent" stroke="#f59e0b" stroke-width="16"
                      stroke-dasharray="58 289" stroke-dashoffset="-150" transform="rotate(-90 60 60)"/>
              <!-- Emergency 18% (52/289) -->
              <circle cx="60" cy="60" r="46" fill="transparent" stroke="#e11d48" stroke-width="16"
                      stroke-dasharray="52 289" stroke-dashoffset="-208" transform="rotate(-90 60 60)"/>
              <!-- Hazard 10% (29/289) -->
              <circle cx="60" cy="60" r="46" fill="transparent" stroke="#8b5cf6" stroke-width="16"
                      stroke-dasharray="29 289" stroke-dashoffset="-260" transform="rotate(-90 60 60)"/>
            </svg>
            <div class="donut-center-text">
              <div class="num">186</div>
              <div class="lbl">TOTAL ALERTS</div>
            </div>
          </div>

          <!-- Category Breakdown List -->
          <div class="donut-breakdown-list">
            <div class="donut-breakdown-item">
              <div class="donut-item-top">
                <span class="donut-item-label">
                  <span style="width:7px; height:7px; border-radius:50%; background:#2563eb;"></span>
                  Parking & Blocking
                </span>
                <span class="donut-item-val">97 <small style="color:#64748b; font-weight:500;">(52%)</small></span>
              </div>
              <div class="donut-bar-track"><div class="donut-bar-fill" style="width:52%; background:#2563eb;"></div></div>
            </div>

            <div class="donut-breakdown-item">
              <div class="donut-item-top">
                <span class="donut-item-label">
                  <span style="width:7px; height:7px; border-radius:50%; background:#f59e0b;"></span>
                  Vehicle Flaw (Flat/Lights)
                </span>
                <span class="donut-item-val">37 <small style="color:#64748b; font-weight:500;">(20%)</small></span>
              </div>
              <div class="donut-bar-track"><div class="donut-bar-fill" style="width:20%; background:#f59e0b;"></div></div>
            </div>

            <div class="donut-breakdown-item">
              <div class="donut-item-top">
                <span class="donut-item-label">
                  <span style="width:7px; height:7px; border-radius:50%; background:#e11d48;"></span>
                  Emergency & Road Safety
                </span>
                <span class="donut-item-val">33 <small style="color:#64748b; font-weight:500;">(18%)</small></span>
              </div>
              <div class="donut-bar-track"><div class="donut-bar-fill" style="width:18%; background:#e11d48;"></div></div>
            </div>

            <div class="donut-breakdown-item">
              <div class="donut-item-top">
                <span class="donut-item-label">
                  <span style="width:7px; height:7px; border-radius:50%; background:#8b5cf6;"></span>
                  Traffic & Tow Hazard
                </span>
                <span class="donut-item-val">19 <small style="color:#64748b; font-weight:500;">(10%)</small></span>
              </div>
              <div class="donut-bar-track"><div class="donut-bar-fill" style="width:10%; background:#8b5cf6;"></div></div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Operational Queues Split (QR Decal Lifecycle & Fleet Health + Live Incident Queue & Action Required) -->
    <div class="operations-split">
      <!-- Left Card: QR Decal Lifecycle & Fleet Adoption -->
      <section class="white-panel">
        <div class="panel-header-row">
          <div class="panel-title-text">
            <h3>QR Decal Lifecycle & Fleet Health</h3>
            <p>From central production facility to verified on-road vehicles</p>
          </div>
        </div>

        <div class="funnel-list" style="margin-top:10px;">
          <div class="funnel-item">
            <span class="funnel-label" title="Batches generated at central facility">Batches Generated</span>
            <div class="funnel-track"><div class="funnel-bar" style="width:100%; background:#2563eb;"></div></div>
            <span class="funnel-count">${funnel.generated}</span>
          </div>
          <div class="funnel-item">
            <span class="funnel-label" title="Passed physical QC check in central stock">QC Central Stock</span>
            <div class="funnel-track"><div class="funnel-bar" style="width:75%; background:#2563eb;"></div></div>
            <span class="funnel-count">${funnel.centralStock}</span>
          </div>
          <div class="funnel-item">
            <span class="funnel-label" title="Dispatched to authorized dealer showrooms">Showroom Stock</span>
            <div class="funnel-track"><div class="funnel-bar" style="width:49%; background:#2563eb;"></div></div>
            <span class="funnel-count">${funnel.showroomStock}</span>
          </div>
          <div class="funnel-item">
            <span class="funnel-label" title="Mapped to verified vehicle registration">Assigned to Vehicle</span>
            <div class="funnel-track"><div class="funnel-bar" style="width:38%; background:#2563eb;"></div></div>
            <span class="funnel-count">${funnel.assigned}</span>
          </div>
          <div class="funnel-item">
            <span class="funnel-label" title="Physically installed on windshield/plate and active on road">Live Road Fleet</span>
            <div class="funnel-track"><div class="funnel-bar" style="width:28%; background:#10b981;"></div></div>
            <span class="funnel-count">${funnel.liveRoad}</span>
          </div>
          <div class="funnel-item">
            <span class="funnel-label" title="Blocked or deactivated due to damage/transfer">Blocked / Revoked</span>
            <div class="funnel-track"><div class="funnel-bar" style="width:2%; background:#f43f5e;"></div></div>
            <span class="funnel-count">${funnel.blocked}</span>
          </div>
        </div>

        <!-- Vehicle Category Badges -->
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; padding-top:14px; border-top:1px solid #f1f5f9;">
          <span style="font-size:11px; padding:4px 9px; border-radius:6px; background:#eff6ff; color:#1d4ed8; font-weight:600; border:1px solid #dbeafe;">🚗 4-Wheelers: 60% (184)</span>
          <span style="font-size:11px; padding:4px 9px; border-radius:6px; background:#ecfeff; color:#0e7490; font-weight:600; border:1px solid #cffafe;">🛵 2-Wheelers: 29% (88)</span>
          <span style="font-size:11px; padding:4px 9px; border-radius:6px; background:#ecfdf5; color:#047857; font-weight:600; border:1px solid #d1fae5;">🚚 Commercial: 11% (34)</span>
        </div>
      </section>

      <!-- Right Card: Live Vehicle Incident Queue & Action Required -->
      <section class="white-panel">
        <div class="panel-header-row">
          <div class="panel-title-text">
            <h3>Live Vehicle Incident Queue</h3>
            <p>Bystander reports received from road decal scans awaiting review</p>
          </div>
          <button class="text-button" id="view-all-messages-btn" style="color:#2563eb; font-weight:700; font-size:12px; border:none; background:none; cursor:pointer;">All alerts →</button>
        </div>
        
        <div class="incident-mini-list" style="margin-bottom:16px;">
          ${incidentsHtml}
        </div>

        <div style="border-top:1px solid #f1f5f9; padding-top:12px;">
          <div style="font-size:12px; font-weight:700; color:#0f172a; margin-bottom:8px;">Action Required Decision Queues</div>
          <div class="action-queue-list">
            <div class="action-queue-row ${actionQueues.unresolvedEmergencies > 0 ? 'amber' : 'green'}" id="queue-emergencies" style="cursor:pointer;" title="Click to view alerts">
              <div style="display:flex; align-items:center; gap:8px;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${actionQueues.unresolvedEmergencies > 0 ? '#d97706' : '#16a34a'}" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>Unresolved emergency alerts</span>
              </div>
              <b>${actionQueues.unresolvedEmergencies}</b>
            </div>
            <div class="action-queue-row ${actionQueues.lowStockDealers > 0 ? 'amber' : 'green'}" id="queue-low-stock" style="cursor:pointer;" title="Click to view showrooms">
              <div style="display:flex; align-items:center; gap:8px;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${actionQueues.lowStockDealers > 0 ? '#d97706' : '#16a34a'}" stroke-width="2.2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>Showrooms with low QR decal stock (&lt;15)</span>
              </div>
              <b>${actionQueues.lowStockDealers}</b>
            </div>
          </div>
        </div>
      </section>
    </div>
  `;

  document.querySelector('.page-wrap').innerHTML = body;

  const refBtn = document.querySelector('#refresh-dashboard');
  if (refBtn) refBtn.onclick = () => overview();

  const allMsgBtn = document.querySelector('#view-all-messages-btn');
  if (allMsgBtn) allMsgBtn.onclick = () => { state.section = 'messages'; renderAdmin(); };

  const qEmerg = document.querySelector('#queue-emergencies');
  if (qEmerg) qEmerg.onclick = () => { state.section = 'messages'; renderAdmin(); };

  const qStock = document.querySelector('#queue-low-stock');
  if (qStock) qStock.onclick = () => { state.section = 'showrooms'; renderAdmin(); };

  const qPending = document.querySelector('#queue-pending-qrs');
  if (qPending) qPending.onclick = () => { state.section = 'qr'; renderAdmin(); };

  const cardShowrooms = document.querySelector('#card-showrooms');
  if (cardShowrooms) cardShowrooms.onclick = () => { state.section = 'showrooms'; renderAdmin(); };

  const cardVehicles = document.querySelector('#card-vehicles');
  if (cardVehicles) cardVehicles.onclick = () => { state.section = 'vehicles'; renderAdmin(); };

  const cardQrs = document.querySelector('#card-qrs');
  if (cardQrs) cardQrs.onclick = () => { state.section = 'qr'; renderAdmin(); };

  const cardAlerts = document.querySelector('#card-alerts');
  if (cardAlerts) cardAlerts.onclick = () => { state.section = 'messages'; renderAdmin(); };

  const cardEscalations = document.querySelector('#card-escalations');
  if (cardEscalations) cardEscalations.onclick = () => { state.section = 'messages'; renderAdmin(); };

  document.querySelectorAll('.incident-mini-card').forEach(card => {
    card.onclick = () => { state.section = 'messages'; renderAdmin(); };
  });
}

function qrRow(q) {
  return `
    <tr>
      <td>
        <b class="mono" style="color:var(--navy-950);">${esc(q.qr_id)}</b>
        <small>${esc(q.batch_id || 'System Seed')}</small>
      </td>
      <td>
        ${q.registration ? `<b>${esc(q.registration)}</b><small>${esc(q.make)} ${esc(q.model)}</small>` : '<span style="color:var(--slate-400);">Unassigned</span>'}
      </td>
      <td>${esc(q.showroom_name || 'Central Facility')}</td>
      <td>${badge(q.status)}</td>
      <td>${date(q.updated_at)}</td>
    </tr>
  `;
}

async function qrOperations() {
  const [q, s, v] = await Promise.all([api('/api/qrs'), api('/api/showrooms'), api('/api/vehicles')]);
  state.cache.qrs = q.items;
  state.cache.showrooms = s.items;
  state.cache.vehicles = v.items;

  const counts = {
    ALL: q.items.length,
    ACTIVE: q.items.filter(x => x.status === 'ACTIVE').length,
    CENTRAL_STOCK: q.items.filter(x => x.status === 'CENTRAL_STOCK').length,
    SHOWROOM_STOCK: q.items.filter(x => x.status === 'SHOWROOM_STOCK').length,
    PENDING_ACTIVATION: q.items.filter(x => x.status === 'PENDING_ACTIVATION').length,
    BLOCKED: q.items.filter(x => x.status === 'BLOCKED').length
  };

  const body = `
    <div class="toolbar-row">
      <div class="filter-chips">
        ${['ALL', 'ACTIVE', 'CENTRAL_STOCK', 'SHOWROOM_STOCK', 'PENDING_ACTIVATION', 'BLOCKED'].map(x => `
          <button class="chip ${state.filter === x ? 'active' : ''}" data-filter="${x}">
            <span>${x === 'ALL' ? 'All Units' : (statusLabels[x] || x.replaceAll('_', ' '))}</span>
            <span style="font-size:10px; opacity:0.8; font-weight:800;">(${counts[x] || 0})</span>
          </button>
        `).join('')}
      </div>
      <div class="toolbar-actions" style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <input class="search-input" id="qr-search" placeholder="🔍 Search QR ID, vehicle plate, or dealer..." aria-label="Search">
        <button class="btn secondary" id="bulk-pdf-btn" style="background:linear-gradient(135deg, #0284c7, #2563eb); color:#fff; border:none; display:inline-flex; align-items:center; gap:6px; font-weight:700; box-shadow:0 4px 14px rgba(37,99,235,0.35);">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          🖨️ Bulk Print (100 QRs PDF)
        </button>
        <button class="btn primary" id="new-batch">＋ Generate QR Batch</button>
      </div>
    </div>

    <section class="panel">
      <div class="panel-heading">
        <div>
          <h3>QR Identity Ledger</h3>
          <p>Trace each unit from generation to print, QC, showroom dispatch, and live road activation.</p>
        </div>
        <span class="badge badge-active">CRYPTOGRAPHIC AUDIT ENABLED</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>QR Identifier</th>
              <th>Vehicle Link</th>
              <th>Current Stage / Location</th>
              <th>Status</th>
              <th>Last Update</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody id="qr-table-body">
            ${q.items.map(x => qrOperationalRow(x, s.items, v.items)).join('') || '<tr><td colspan="6" style="text-align:center; padding:24px; color:var(--slate-400);">No units match current filter.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  document.querySelector('.page-wrap').innerHTML = body;
  document.querySelector('#new-batch').onclick = () => batchModal();
  document.querySelector('#bulk-pdf-btn')?.addEventListener('click', () => showBulkPrintModal(q.items));

  document.querySelectorAll('[data-filter]').forEach(b => {
    b.onclick = () => {
      state.filter = b.dataset.filter;
      renderAdmin();
    };
  });

  document.querySelector('#qr-search').addEventListener('input', e => {
    const val = e.target.value.toLowerCase();
    document.querySelectorAll('#qr-table-body tr[data-search]').forEach(r => {
      r.hidden = !r.dataset.search.includes(val);
    });
  });

  document.querySelectorAll('[data-qr-action]').forEach(b => {
    b.onclick = () => actionModal(b.dataset.qrId, b.dataset.qrAction, s.items, v.items);
  });

  document.querySelectorAll('[data-open-scan]').forEach(b => {
    b.onclick = () => window.open(`/scan/${encodeURIComponent(b.dataset.openScan)}`, '_blank', 'noopener');
  });

  document.querySelectorAll('[data-sticker-qr]').forEach(b => {
    b.onclick = () => showStickerModal(b.dataset.stickerQr, b.dataset.stickerToken, b.dataset.stickerVehicle);
  });
}

function qrOperationalRow(q, showrooms, vehicles) {
  if (state.filter !== 'ALL' && q.status !== state.filter) return '';
  const action = ({
    GENERATED: 'queue-print',
    PRINT_QUEUED: 'mark-printed',
    PRINTED: 'qc-pass',
    QC_PASSED: 'central-receive',
    CENTRAL_STOCK: 'allocate',
    ALLOCATED: 'dispatch',
    DISPATCHED: 'showroom-receive',
    SHOWROOM_STOCK: 'assign',
    ASSIGNED: 'confirm-installation',
    PENDING_ACTIVATION: 'activate',
    ACTIVE: 'block',
    BLOCKED: 'deactivate'
  })[q.status];

  const labels = {
    'queue-print': 'Queue Print',
    'mark-printed': 'Mark Printed',
    'qc-pass': 'Record QC Pass',
    'central-receive': 'Receive Warehouse',
    'allocate': 'Allocate Showroom',
    'dispatch': 'Dispatch Transit',
    'showroom-receive': 'Confirm Receipt',
    'assign': 'Assign Vehicle',
    'confirm-installation': 'Verify Physical Install',
    'activate': 'Activate Live QR',
    'block': 'Block QR',
    'deactivate': 'Deactivate'
  };

  const searchable = `${q.qr_id} ${q.registration || ''} ${q.make || ''} ${q.model || ''} ${q.showroom_name || ''} ${q.status}`.toLowerCase();

  return `
    <tr data-search="${esc(searchable)}">
      <td>
        <b class="mono" style="color:var(--navy-950);">${esc(q.qr_id)}</b>
        <small>${esc(q.batch_id || 'Legacy / Seed')}</small>
      </td>
      <td>
        ${q.registration ? `<b>${esc(q.registration)}</b><small>${esc(q.make)} ${esc(q.model)}</small>` : '<span style="color:var(--slate-400);">Unassigned</span>'}
      </td>
      <td>${esc(q.showroom_name || q.status.replaceAll('_', ' '))}</td>
      <td>${badge(q.status)}</td>
      <td>${date(q.updated_at)}</td>
      <td style="text-align:right;">
        <div class="action-cell" style="justify-content:flex-end;">
          <button class="btn tiny secondary" data-sticker-qr="${esc(q.qr_id)}" data-sticker-token="${esc(q.public_token)}" data-sticker-vehicle="${esc(q.registration || 'UNASSIGNED')}">
            🖨️ Sticker
          </button>
          <button class="btn tiny secondary" data-open-scan="${esc(q.public_token || '')}">
            Scan URL ↗
          </button>
          ${action ? `
            <button class="btn tiny ${action === 'activate' ? 'primary' : 'secondary'}" data-qr-action="${action}" data-qr-id="${esc(q.id)}">
              ${labels[action]}
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `;
}

function showStickerModal(qrId, publicToken, vehicleReg) {
  const root = document.querySelector('#modal-root');
  const scanUrl = `${location.origin}/scan/${encodeURIComponent(publicToken)}`;
  const stickerSvg = generateOfficialStickerSvg({ qrId, scanUrl, size: 440 });

  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card" style="max-width:540px; text-align:center;">
        <button class="modal-close" data-close>×</button>
        <span class="eyebrow" style="color:var(--cyan-400);">OFFICIAL BIHAR VEHICLE DECAL SPECIFICATION</span>
        <h2 style="margin-right:0;">SmartO Official Physical Decal</h2>
        <p class="muted">Tamper-proof government-endorsed physical decal with dynamic cryptographic QR routing.</p>

        <div class="sticker-preview-box" id="sticker-printable-area">
          ${stickerSvg}
        </div>

        <div style="display:flex; justify-content:center; gap:12px; margin-top:20px; flex-wrap:wrap;">
          <button class="btn secondary" data-close>Close</button>
          <button class="btn secondary" id="download-sticker-btn">
            ⬇️ Download SVG Decal
          </button>
          <button class="btn primary" id="print-sticker-btn">
            🖨️ Print Decal
          </button>
        </div>

        <div style="margin-top:14px; padding-top:12px; border-top:1px dashed var(--slate-700);">
          <button class="btn secondary" id="open-bulk-from-single" style="font-size:12px; width:100%; color:var(--cyan-400); border-color:var(--slate-700); font-weight:700;">
            📑 Need 100 QRs at once for batch printing? Open Bulk PDF Suite →
          </button>
        </div>
      </section>
    </div>
  `;

  root.querySelectorAll('[data-close]').forEach(b => b.onclick = () => root.innerHTML = '');
  root.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) root.innerHTML = '';
  };

  root.querySelector('#download-sticker-btn').onclick = () => {
    const blob = new Blob([stickerSvg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SmartO_Decal_${qrId}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  root.querySelector('#print-sticker-btn').onclick = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Print SmartO Sticker - ${esc(qrId)}</title>
          <style>
            body { margin: 0; padding: 40px; display: flex; justify-content: center; align-items: center; background: white; }
            svg { max-width: 500px; height: auto; }
          </style>
        </head>
        <body>
          ${stickerSvg}
          <script>
            window.onload = () => { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const openBulkBtn = root.querySelector('#open-bulk-from-single');
  if (openBulkBtn) {
    openBulkBtn.onclick = () => {
      showBulkPrintModal();
    };
  }
}

async function showBulkPrintModal(initialQrs = null) {
  const root = document.querySelector('#modal-root');
  
  let allUnits = initialQrs;
  if (!allUnits || !allUnits.length) {
    try {
      const res = await fetch('/api/qrs');
      const data = await res.json();
      allUnits = data.items || [];
    } catch {
      allUnits = [];
    }
  }

  function getFilteredUnits(status, countVal) {
    let list = allUnits;
    if (status !== 'ALL') {
      list = list.filter(x => x.status === status);
    }
    const count = countVal === 'ALL' ? list.length : parseInt(countVal, 10);
    return list.slice(0, count);
  }

  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card" style="max-width:680px;">
        <button class="modal-close" data-close>×</button>
        <div style="display:flex; align-items:center; gap:12px; margin-bottom:8px;">
          <div style="width:44px; height:44px; border-radius:12px; background:linear-gradient(135deg, #0284c7, #2563eb); display:flex; align-items:center; justify-content:center; color:#fff; font-size:22px; box-shadow:0 4px 14px rgba(2,132,199,0.4);">
            🖨️
          </div>
          <div>
            <span class="eyebrow" style="color:var(--cyan-400);">OFFICIAL BULK PRINTING & EXPORT SUITE</span>
            <h2 style="margin:0; font-size:21px;">Bulk Printable QR Decal Sheet (PDF)</h2>
          </div>
        </div>
        <p class="muted" style="margin-bottom:18px; font-size:13.5px;">
          Generate print-ready A4 sticker sheets with vector QR codes, official Bihar Sarkar branding, serial numbers, and cutting guides.
        </p>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:14px;">
          <label style="display:block; font-weight:700; font-size:12.5px; color:#334155;">
            Decal Quantity to Print
            <select id="bulk-count-select" style="margin-top:6px; background:#f8fafc; border:1.5px solid #cbd5e1; color:#0f172a; padding:10px 12px; border-radius:8px; width:100%; font-weight:600;">
              <option value="100" selected>100 Units (Bulk Sheet - 17 Pages)</option>
              <option value="50">50 Units (Half Batch - 9 Pages)</option>
              <option value="24">24 Units (Small Batch - 4 Pages)</option>
              <option value="12">12 Units (2 Pages)</option>
              <option value="6">6 Units (Single Test A4 Page)</option>
              <option value="ALL">All Available (${allUnits.length} Units)</option>
            </select>
          </label>

          <label style="display:block; font-weight:700; font-size:12.5px; color:#334155;">
            Filter by QR Status
            <select id="bulk-status-select" style="margin-top:6px; background:#f8fafc; border:1.5px solid #cbd5e1; color:#0f172a; padding:10px 12px; border-radius:8px; width:100%; font-weight:600;">
              <option value="ALL" selected>All Statuses (${allUnits.length})</option>
              <option value="SHOWROOM_STOCK">Showroom Stock Ready</option>
              <option value="CENTRAL_STOCK">Central Stock Unassigned</option>
              <option value="ACTIVE">Active on Road Decals</option>
              <option value="GENERATED">Newly Generated</option>
            </select>
          </label>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:16px;">
          <label style="display:block; font-weight:700; font-size:12.5px; color:#334155;">
            Sticker Layout Grid (A4)
            <select id="bulk-layout-select" style="margin-top:6px; background:#f8fafc; border:1.5px solid #cbd5e1; color:#0f172a; padding:10px 12px; border-radius:8px; width:100%; font-weight:600;">
              <option value="2x3" selected>2x3 Grid (6 per A4) — Recommended Standard Decal (88×88 mm)</option>
              <option value="2x2">2x2 Grid (4 per A4) — Large Decal (110×110 mm)</option>
              <option value="3x4">3x4 Grid (12 per A4) — Compact Decal (56×56 mm)</option>
            </select>
          </label>

          <label style="display:block; font-weight:700; font-size:12.5px; color:#334155;">
            Cutting Guides & Borders
            <select id="bulk-guides-select" style="margin-top:6px; background:#f8fafc; border:1.5px solid #cbd5e1; color:#0f172a; padding:10px 12px; border-radius:8px; width:100%; font-weight:600;">
              <option value="true" selected>Include Dotted Crop Lines & Cut Marks (+)</option>
              <option value="false">Clean Decal Border Only (No Crosses)</option>
            </select>
          </label>
        </div>

        <!-- Live Summary Box -->
        <div style="background:linear-gradient(180deg, rgba(15,23,42,0.9), rgba(8,17,39,0.95)); border:1px solid rgba(56,189,248,0.25); border-radius:12px; padding:16px; margin-bottom:20px; box-shadow:0 4px 18px rgba(0,0,0,0.3);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <span style="font-weight:700; color:var(--slate-300); font-size:13px;">Selected Serial Range:</span>
            <span id="bulk-series-range" style="font-family:'JetBrains Mono',monospace; color:var(--cyan-400); font-size:13px; font-weight:800; background:rgba(6,182,212,0.1); padding:3px 8px; border-radius:4px; border:1px solid rgba(6,182,212,0.2);">
              Loading...
            </span>
          </div>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; font-size:12px; color:var(--slate-400); border-top:1px solid rgba(255,255,255,0.06); padding-top:10px;">
            <div>Total Units: <strong id="bulk-total-units" style="color:#fff; font-size:14px; display:block;">100</strong></div>
            <div>A4 Pages: <strong id="bulk-total-pages" style="color:#38bdf8; font-size:14px; display:block;">17 Pages</strong></div>
            <div>Print Format: <strong style="color:#10b981; font-size:14px; display:block;">A4 (210×297 mm)</strong></div>
          </div>
        </div>

        <div id="bulk-pdf-status" style="display:none; margin-bottom:16px; padding:12px; border-radius:8px; background:rgba(2,132,199,0.15); border:1px solid #0284c7; font-size:13px; color:#e0f2fe; text-align:center;">
          <div class="spinner" style="display:inline-block; vertical-align:middle; margin-right:8px;"></div>
          <span id="bulk-pdf-status-text">Generating PDF pages...</span>
        </div>

        <!-- Action Buttons -->
        <div style="display:flex; gap:12px; justify-content:flex-end; flex-wrap:wrap;">
          <button class="btn secondary" data-close>Cancel</button>
          
          <button class="btn secondary" id="btn-download-pdf-direct" style="background:linear-gradient(135deg, #059669, #10b981); color:#fff; border:none; display:inline-flex; align-items:center; gap:8px; font-weight:700; box-shadow:0 4px 14px rgba(16,185,129,0.3);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            📥 Download .PDF File
          </button>

          <button class="btn primary" id="btn-open-print-sheet" style="background:linear-gradient(135deg, #0284c7, #2563eb); display:inline-flex; align-items:center; gap:8px; font-weight:800; box-shadow:0 4px 14px rgba(37,99,235,0.4);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            🖨️ Open Print & PDF Sheet (A4)
          </button>
        </div>
      </section>
    </div>
  `;

  const countSel = root.querySelector('#bulk-count-select');
  const statusSel = root.querySelector('#bulk-status-select');
  const layoutSel = root.querySelector('#bulk-layout-select');
  const guidesSel = root.querySelector('#bulk-guides-select');
  const rangeSpan = root.querySelector('#bulk-series-range');
  const unitsSpan = root.querySelector('#bulk-total-units');
  const pagesSpan = root.querySelector('#bulk-total-pages');

  function updateSummary() {
    const subset = getFilteredUnits(statusSel.value, countSel.value);
    const layout = layoutSel.value;
    const perPage = layout === '2x2' ? 4 : (layout === '3x4' ? 12 : 6);
    const pages = Math.ceil(subset.length / perPage) || 1;

    unitsSpan.textContent = `${subset.length}`;
    pagesSpan.textContent = `${pages} Page${pages === 1 ? '' : 's'}`;
    if (subset.length > 0) {
      rangeSpan.textContent = `${subset[0].qr_id} → ${subset[subset.length - 1].qr_id}`;
    } else {
      rangeSpan.textContent = 'None matching';
    }
  }

  countSel.onchange = updateSummary;
  statusSel.onchange = updateSummary;
  layoutSel.onchange = updateSummary;
  updateSummary();

  root.querySelectorAll('[data-close]').forEach(b => b.onclick = () => root.innerHTML = '');
  root.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) root.innerHTML = '';
  };

  // 1. Open Print & PDF Sheet (A4)
  root.querySelector('#btn-open-print-sheet').onclick = () => {
    const subset = getFilteredUnits(statusSel.value, countSel.value);
    if (!subset.length) return alert('No QR units available to print for the selected filter.');

    const layout = layoutSel.value;
    const cutGuides = guidesSel.value === 'true';
    const html = buildPrintSheetHtml({ qrs: subset, layout, cutGuides });

    const printWin = window.open('', '_blank');
    if (!printWin) return alert('Popup was blocked. Please allow popups to open the print sheet.');
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  };

  // 2. Direct Download .PDF File
  root.querySelector('#btn-download-pdf-direct').onclick = async () => {
    const subset = getFilteredUnits(statusSel.value, countSel.value);
    if (!subset.length) return alert('No QR units available to download for the selected filter.');

    const layout = layoutSel.value;
    const cutGuides = guidesSel.value === 'true';
    const statusBox = root.querySelector('#bulk-pdf-status');
    const statusText = root.querySelector('#bulk-pdf-status-text');
    const downloadBtn = root.querySelector('#btn-download-pdf-direct');

    statusBox.style.display = 'block';
    downloadBtn.disabled = true;
    downloadBtn.style.opacity = '0.5';

    try {
      await downloadDecalsPdf({
        qrs: subset,
        layout,
        cutGuides,
        filename: `SmartO_${subset.length}_Vehicle_QR_Decals_Batch.pdf`,
        onProgress: (cur, tot) => {
          statusText.textContent = `Rendering A4 Sheet ${cur} of ${tot} (${Math.round((cur / tot) * 100)}%)...`;
        }
      });
      statusText.textContent = `✅ Successfully created SmartO_${subset.length}_Vehicle_QR_Decals_Batch.pdf!`;
      setTimeout(() => {
        statusBox.style.display = 'none';
        downloadBtn.disabled = false;
        downloadBtn.style.opacity = '1';
      }, 2500);
    } catch (err) {
      console.error('PDF generation error:', err);
      statusText.textContent = `❌ PDF build error: ${err.message || 'Unknown error'}. You can still use 'Open Print & PDF Sheet'.`;
      downloadBtn.disabled = false;
      downloadBtn.style.opacity = '1';
    }
  };
}

function batchModal() {
  const root = document.querySelector('#modal-root');
  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card">
        <button class="modal-close" data-close>×</button>
        <span class="eyebrow">FACTORY INVENTORY CREATION</span>
        <h2>Generate Cryptographic QR Batch</h2>
        <p class="muted">Creates uniquely indexed QR identifiers and 256-bit unguessable public tokens. Zero owner PII is stored on the physical sticker.</p>

        <form id="batch-form">
          <label>
            Regional Batch Prefix
            <input name="prefix" value="SV-BR" maxlength="18" required>
            <small style="font-size:11px; color:var(--slate-400); display:block; margin-top:4px;">Format: SV-BR (Smart Vehicle Bihar), SV-DL (Delhi), etc.</small>
          </label>
          <label>
            Batch Production Quantity
            <input name="quantity" type="number" min="1" max="10000" value="100" required>
            <small style="font-size:11px; color:var(--slate-400); display:block; margin-top:4px;">Batch scale: 1 to 10,000 units per cryptographic generation run.</small>
          </label>
          <label>
            Print Template Spec Version
            <input name="templateVersion" value="SVQR-2.0" maxlength="32">
          </label>
          <div id="batch-error" class="form-error"></div>
          <div class="modal-actions">
            <button class="btn secondary" type="button" data-close>Cancel</button>
            <button class="btn primary" type="submit">Run Batch Generation →</button>
          </div>
        </form>
      </section>
    </div>
  `;

  root.querySelectorAll('[data-close]').forEach(b => b.onclick = () => root.innerHTML = '');
  root.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) root.innerHTML = '';
  };

  root.querySelector('#batch-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const err = root.querySelector('#batch-error');
    err.textContent = '';
    try {
      const res = await post('/api/batches', {
        prefix: fd.get('prefix'),
        quantity: Number(fd.get('quantity')),
        templateVersion: fd.get('templateVersion')
      });
      root.innerHTML = '';
      toast(`Batch ${res.prefix} generated successfully with ${res.quantity} units!`);
      state.section = 'qr';
      renderAdmin();
    } catch (x) {
      err.textContent = x.message;
    }
  };
}

function showroomModal(presetCity = '', presetState = 'Bihar') {
  const root = document.querySelector('#modal-root');
  const count = (state.cache.showrooms?.length || 13) + 1;
  const initialCity = presetCity || 'Patna';
  const prefix = (initialCity.length >= 3 ? initialCity.slice(0, 3).toUpperCase() : 'HUB');
  const suggestedCode = `${prefix}-${String(count).padStart(3, '0')}`;

  const biharCities = [
    'Patna', 'Muzaffarpur', 'Gaya', 'Bhagalpur', 'Darbhanga', 'Purnia',
    'Begusarai', 'Ara', 'Chapra', 'Samastipur', 'Katihar', 'Sasaram',
    'Motihari', 'Bihar Sharif', 'Bettiah', 'Munger', 'Saharsa', 'Dehri',
    'Siwan', 'Sitamarhi', 'Buxar', 'Kishanganj', 'Madhubani', 'Nawada'
  ];

  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card">
        <button class="modal-close" data-close>×</button>
        <span class="eyebrow">DEALER NETWORK ONBOARDING</span>
        <h2>Onboard Authorized Dealer Showroom</h2>
        <p class="muted">Register a new verified dealership distribution point to receive and allocate vehicle QR safety decals.</p>

        <form id="showroom-form">
          <label>
            Dealership / Showroom Name
            <input name="name" placeholder="e.g. Mithila Maruti Suzuki Arena (Bairiya)" required maxlength="120">
          </label>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <label>
              Dealer Code
              <input name="code" id="modal-dealer-code" value="${suggestedCode}" required maxlength="20" style="text-transform:uppercase; font-family:var(--font-mono);">
              <small style="font-size:11px; color:var(--slate-400); display:block; margin-top:4px;">Unique dealership identifier</small>
            </label>
            <label>
              Operational Status
              <select name="status">
                <option value="ACTIVE" selected>ACTIVE (Operational)</option>
                <option value="INACTIVE">INACTIVE (Under Setup)</option>
              </select>
            </label>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
            <label>
              Operating City (Bihar Districts)
              <input name="city" id="modal-dealer-city" list="bihar-cities-list" value="${esc(initialCity)}" required maxlength="60" placeholder="e.g. Patna, Muzaffarpur, Gaya">
              <datalist id="bihar-cities-list">
                ${biharCities.map(c => `<option value="${esc(c)}">`).join('')}
              </datalist>
            </label>
            <label>
              State / Region
              <select name="state" id="modal-dealer-state">
                <option value="Bihar" ${presetState === 'Bihar' ? 'selected' : ''}>Bihar</option>
                <option value="Uttar Pradesh" ${presetState === 'Uttar Pradesh' ? 'selected' : ''}>Uttar Pradesh</option>
                <option value="Delhi NCR" ${presetState === 'Delhi NCR' ? 'selected' : ''}>Delhi NCR</option>
                <option value="Jharkhand" ${presetState === 'Jharkhand' ? 'selected' : ''}>Jharkhand</option>
                <option value="West Bengal" ${presetState === 'West Bengal' ? 'selected' : ''}>West Bengal</option>
              </select>
            </label>
          </div>

          <div id="showroom-error" class="form-error"></div>
          <div class="modal-actions">
            <button class="btn secondary" type="button" data-close>Cancel</button>
            <button class="btn primary" type="submit">Register & Activate Showroom →</button>
          </div>
        </form>
      </section>
    </div>
  `;

  const cityInp = root.querySelector('#modal-dealer-city');
  const codeInp = root.querySelector('#modal-dealer-code');
  if (cityInp && codeInp) {
    cityInp.addEventListener('input', () => {
      if (!codeInp.dataset.userEdited) {
        const cVal = cityInp.value.trim();
        const pfx = (cVal.length >= 3 ? cVal.slice(0, 3).toUpperCase() : 'HUB');
        codeInp.value = `${pfx}-${String(count).padStart(3, '0')}`;
      }
    });
    codeInp.addEventListener('input', () => {
      codeInp.dataset.userEdited = 'true';
    });
  }

  root.querySelectorAll('[data-close]').forEach(b => b.onclick = () => root.innerHTML = '');
  root.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) root.innerHTML = '';
  };

  root.querySelector('#showroom-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const err = root.querySelector('#showroom-error');
    err.textContent = '';
    try {
      const res = await post('/api/showrooms', {
        name: fd.get('name'),
        code: fd.get('code'),
        city: fd.get('city'),
        state: fd.get('state'),
        status: fd.get('status')
      });
      root.innerHTML = '';
      toast(`Showroom "${res.name}" successfully registered with code ${res.code}!`);
      if (state.section === 'showrooms') {
        state.selectedCity = res.city; // Focus directly on the newly added dealer's city!
        showroomPage();
      } else {
        renderAdmin();
      }
    } catch (x) {
      err.textContent = x.message;
    }
  };
}

function actionModal(unitId, action, showrooms, vehicles) {
  const root = document.querySelector('#modal-root');
  const q = state.cache.qrs.find(x => x.id === unitId);
  const names = {
    allocate: 'Allocate QR to Showroom / Dealership',
    assign: 'Assign QR to Verified Vehicle',
    'confirm-installation': 'Confirm Physical Decal Installation',
    activate: 'Authorize Final Road Activation',
    block: 'Restrict / Block Public QR',
    'queue-print': 'Dispatch to Factory Print Queue',
    'mark-printed': 'Confirm Factory Printing Completed',
    'qc-pass': 'Record Quality Control Pass',
    'central-receive': 'Receive Stock at Central Warehouse',
    dispatch: 'Dispatch Stock to Dealer via Courier',
    'showroom-receive': 'Showroom Stock Reception Confirmation',
    deactivate: 'Permanent Deactivation'
  };

  let extra = '';
  if (action === 'allocate') {
    extra = `
      <label>Destination Showroom
        <select name="showroomId" required>
          ${showrooms.map(x => `<option value="${esc(x.id)}">${esc(x.name)} • ${esc(x.city)} (${esc(x.code)})</option>`).join('')}
        </select>
      </label>
    `;
  }

  if (action === 'assign') {
    const activeVehicleIds = new Set(state.cache.qrs.filter(x => x.status === 'ACTIVE' && x.vehicle_id).map(x => x.vehicle_id));
    const eligible = vehicles.filter(x => x.verification_status === 'VERIFIED' && !activeVehicleIds.has(x.id));
    extra = `
      <label>Select Verified Vehicle
        <select name="vehicleId" required ${eligible.length ? '' : 'disabled'}>
          ${eligible.length ? `<option value="">Choose a vehicle</option>${eligible.map(x => `<option value="${esc(x.id)}">${esc(x.registration)} — ${esc(x.make)} ${esc(x.model)}</option>`).join('')}` : '<option value="">No unassigned verified vehicles available</option>'}
        </select>
      </label>
    `;
  }

  if (action === 'confirm-installation') {
    extra = `
      <label style="display:flex; align-items:flex-start; gap:10px; cursor:pointer;">
        <input type="checkbox" name="installationConfirmed" required style="width:18px; height:18px; margin-top:2px;">
        <span>I certify that this physical sticker is securely attached to the vehicle windshield.</span>
      </label>
    `;
  }

  if (action === 'activate') {
    extra = `
      <div style="background:var(--blue-50); border:1px solid var(--blue-100); padding:16px; border-radius:12px; margin-bottom:16px;">
        <b style="color:var(--blue-600); font-size:13px; display:block; margin-bottom:8px;">Dual-Step Activation Check:</b>
        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer; margin-bottom:8px;">
          <input type="checkbox" name="installationConfirmed" required style="width:16px; height:16px;"> Physical decal installation verified on vehicle
        </label>
        <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
          <input type="checkbox" name="finalScanConfirmed" required style="width:16px; height:16px;"> Camera test scan verified matching token
        </label>
      </div>
    `;
  }

  if (action === 'block' || action === 'deactivate') {
    extra = `
      <label>Reason for restriction
        <textarea name="reason" rows="3" placeholder="Provide audit reason (e.g. Lost sticker, damaged, vehicle sold)..." required></textarea>
      </label>
    `;
  }

  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card">
        <button class="modal-close" data-close>×</button>
        <span class="eyebrow">${esc(q?.qr_id || 'QR LIFECYCLE')}</span>
        <h2>${esc(names[action] || 'Confirm Action')}</h2>
        <p class="muted">Current status: <b>${esc(statusLabels[q?.status] || q?.status)}</b>. This transition will be signed and written to the immutable ledger.</p>

        <form id="action-form">
          ${extra}
          <div class="form-error" id="action-error"></div>
          <div class="modal-actions">
            <button class="btn secondary" type="button" data-close>Cancel</button>
            <button class="btn primary" type="submit">Commit Transition</button>
          </div>
        </form>
      </section>
    </div>
  `;

  root.querySelectorAll('[data-close]').forEach(b => b.onclick = () => root.innerHTML = '');
  root.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) root.innerHTML = '';
  };

  root.querySelector('#action-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {};
    for (const [k, v] of fd.entries()) {
      payload[k] = v === 'on' ? true : v;
    }
    const err = root.querySelector('#action-error');
    err.textContent = '';
    try {
      await post(`/api/qrs/${encodeURIComponent(unitId)}/${action}`, payload);
      root.innerHTML = '';
      toast(`${q.qr_id} progressed to next operational stage.`);
      renderAdmin();
    } catch (x) {
      err.textContent = x.message;
    }
  };
}

async function showroomPage() {
  const [s, q, reqs] = await Promise.all([api('/api/showrooms'), api('/api/qrs'), api('/api/admin/requisitions')]);
  state.cache.showrooms = s.items;
  state.cache.qrs = q.items;
  state.cache.requisitions = reqs?.items || [];

  if (!state.selectedCity) state.selectedCity = 'ALL';
  if (state.showroomSearch === undefined) state.showroomSearch = '';

  const cityRegionMeta = {
    'Patna': { region: 'State Capital Hub', icon: '🏛️' },
    'Muzaffarpur': { region: 'North Bihar Commercial Hub', icon: '🏬' },
    'Gaya': { region: 'Magadh Division Hub', icon: '⛰️' },
    'Bhagalpur': { region: 'East Bihar / Silk City', icon: '🏭' },
    'Darbhanga': { region: 'Mithilanchal Gateway', icon: '🏰' },
    'Purnia': { region: 'Seemanchal Transit Hub', icon: '🌾' },
    'Begusarai': { region: 'Industrial Corridor', icon: '⚙️' },
    'Ara': { region: 'Western Gateway / Bhojpur', icon: '🛡️' },
    'Chapra': { region: 'Saran Division Hub', icon: '⛵' },
    'Samastipur': { region: 'Central North Hub', icon: '🚂' },
    'Katihar': { region: 'East Rail Junction', icon: '🛤️' },
    'Sasaram': { region: 'GT Road / Rohtas Hub', icon: '🛣️' },
    'Motihari': { region: 'Champaran Gateway', icon: '🌳' },
    'Bihar Sharif': { region: 'Nalanda Heritage Belt', icon: '📜' }
  };

  function renderShowroomView() {
    const allShowrooms = state.cache.showrooms || [];
    const allQrs = state.cache.qrs || [];
    const allReqs = state.cache.requisitions || [];

    // Group dealerships by City
    const cityMap = {};
    for (const item of allShowrooms) {
      const city = item.city || 'Unknown';
      if (!cityMap[city]) {
        cityMap[city] = {
          city,
          state: item.state,
          showrooms: [],
          stockCount: 0,
          pendingCount: 0,
          activeCount: 0
        };
      }
      cityMap[city].showrooms.push(item);
      const stock = allQrs.filter(z => z.showroom_id === item.id && z.status === 'SHOWROOM_STOCK').length;
      const pending = allQrs.filter(z => z.showroom_id === item.id && z.status === 'PENDING_ACTIVATION').length;
      cityMap[city].stockCount += stock;
      cityMap[city].pendingCount += pending;
      if (item.status === 'ACTIVE') cityMap[city].activeCount++;
    }

    const biharCities = Object.values(cityMap).filter(c => c.state === 'Bihar');
    biharCities.sort((a, b) => {
      if (a.city === 'Patna') return -1;
      if (b.city === 'Patna') return 1;
      return a.city.localeCompare(b.city);
    });

    const otherStateCities = Object.values(cityMap).filter(c => c.state !== 'Bihar');

    let filteredShowrooms = allShowrooms;
    if (state.selectedCity !== 'ALL') {
      filteredShowrooms = filteredShowrooms.filter(x => x.city.toLowerCase() === state.selectedCity.toLowerCase());
    }

    const query = (state.showroomSearch || '').trim().toLowerCase();
    if (query) {
      filteredShowrooms = filteredShowrooms.filter(x =>
        x.name.toLowerCase().includes(query) ||
        x.code.toLowerCase().includes(query) ||
        x.city.toLowerCase().includes(query) ||
        (x.state && x.state.toLowerCase().includes(query))
      );
    }

    const totalDealersInBihar = biharCities.reduce((sum, c) => sum + c.showrooms.length, 0);
    const totalStockInBihar = biharCities.reduce((sum, c) => sum + c.stockCount, 0);

    // Ensure drilldown level defaults
    if (!state.showroomDrilldownLevel) state.showroomDrilldownLevel = 'STATE';
    if (!state.selectedCity) state.selectedCity = 'ALL';
    if (state.showroomSearch === undefined) state.showroomSearch = '';
    if (!state.citySearchQuery) state.citySearchQuery = '';

    const wrap = document.querySelector('.page-wrap');
    if (!wrap) return;

    // Filter cities for Step 2 search
    const cityFilter = (state.citySearchQuery || '').trim().toLowerCase();
    const filteredCities = biharCities.filter(c => !cityFilter || c.city.toLowerCase().includes(cityFilter));

    // Filter showrooms for current selection
    const cityShowrooms = state.selectedCity === 'ALL'
      ? filteredShowrooms
      : allShowrooms.filter(x => x.city.toLowerCase() === state.selectedCity.toLowerCase());
    const cityStock = cityShowrooms.reduce((sum, s) => {
      return sum + allQrs.filter(z => z.showroom_id === s.id && z.status === 'SHOWROOM_STOCK').length;
    }, 0);

    // =========================================================================
    // LEVEL 1: STATE / TERRITORY OVERVIEW BOXES
    // =========================================================================
    if (state.showroomDrilldownLevel === 'STATE') {
      wrap.innerHTML = `
        <!-- Top Enterprise Page Header -->
        <div class="dealer-page-header">
          <div class="dealer-page-header-info">
            <div class="dealer-breadcrumb">
              <span class="pulse-indicator"></span>
              <span>Automotive Dealership Network • Territory Architecture</span>
            </div>
            <h2 class="dealer-page-title">Showrooms & Dealership Directory</h2>
            <p class="dealer-page-sub">
              Browse automotive distribution networks by territory, inspect city workshops, and manage field QR stock.
            </p>
          </div>
          <div class="dealer-page-header-actions">
            <button class="btn secondary" id="btn-switch-master-table" style="font-size:12px; height:36px; padding:0 14px; cursor:pointer;">
              📋 Master Table View
            </button>
            <button class="btn primary" id="btn-onboard-showroom" style="display:inline-flex; align-items:center; gap:6px; font-size:12px; height:36px; padding:0 14px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              + Onboard New Dealer
            </button>
          </div>
        </div>

        <!-- High-Level Metrics Ribbon -->
        <div class="dealer-stats-strip">
          <div class="dealer-stat-box">
            <div class="stat-icon">🏢</div>
            <div class="stat-content">
              <span class="stat-num">${totalDealersInBihar}</span>
              <span class="stat-lbl">Authorized Dealerships</span>
            </div>
          </div>
          <div class="dealer-stat-box">
            <div class="stat-icon">🏷️</div>
            <div class="stat-content">
              <span class="stat-num">${totalStockInBihar}</span>
              <span class="stat-lbl">Ready Field QRs</span>
            </div>
          </div>
          <div class="dealer-stat-box">
            <div class="stat-icon">🏙️</div>
            <div class="stat-content">
              <span class="stat-num">${biharCities.length}</span>
              <span class="stat-lbl">Covered Districts</span>
            </div>
          </div>
          <div class="dealer-stat-box">
            <div class="stat-icon">⚡</div>
            <div class="stat-content">
              <span class="stat-num" style="color:#059669;">100%</span>
              <span class="stat-lbl">Operational Network</span>
            </div>
          </div>
        </div>

        <!-- Step 1 Instructions / Title -->
        <div style="margin: 22px 0 14px;">
          <span class="eyebrow" style="color:#2563eb; font-weight:700; font-size:11px; letter-spacing:0.04em;">STEP 1 OF 3: SELECT OPERATING NETWORK</span>
          <h3 style="margin:4px 0 2px; font-family:var(--font-display); font-size:18px; font-weight:800; color:#0f172a;">
            Operating Territory & State Networks
          </h3>
          <p style="margin:0; font-size:12.5px; color:#64748b;">
            Click on any territory box below to drill down into its districts, city hubs & live QR stock.
          </p>
        </div>

        <!-- Territory Boxes Grid -->
        <div class="territory-box-grid">
          <!-- Box 1: Bihar State Network -->
          <div class="territory-box" id="box-territory-bihar">
            <div>
              <div class="territory-box-badge">★ PRIMARY STATE NETWORK • 14 DISTRICTS</div>
              <div class="territory-box-header">
                <div class="territory-box-icon">🏛️</div>
                <div>
                  <h4 class="territory-box-title">Bihar State Network</h4>
                  <p class="territory-box-desc">
                    Authorized automotive distribution partners, regional dealerships & service workshops across all 14 Bihar districts.
                  </p>
                </div>
              </div>
              <div class="territory-stats-strip">
                <div class="territory-stat-item">
                  <b>${totalDealersInBihar} Hubs</b>
                  <span>Dealerships</span>
                </div>
                <div class="territory-stat-item">
                  <b style="color:#2563eb;">${totalStockInBihar} Units</b>
                  <span>Ready QR Stock</span>
                </div>
                <div class="territory-stat-item">
                  <b>${biharCities.length} Districts</b>
                  <span>Patna, Begusarai...</span>
                </div>
              </div>
            </div>
            <button class="territory-cta-btn">
              Explore 14 Bihar Districts & Cities →
            </button>
          </div>

          <!-- Box 2: Interstate & Border Hubs -->
          <div class="territory-box interstate" id="box-territory-interstate">
            <div>
              <div class="territory-box-badge">🚚 INTERSTATE NETWORK</div>
              <div class="territory-box-header">
                <div class="territory-box-icon">📦</div>
                <div>
                  <h4 class="territory-box-title">Interstate & Border Hubs</h4>
                  <p class="territory-box-desc">
                    Distribution centers and inventory holding points operating across Uttar Pradesh and NCR borders.
                  </p>
                </div>
              </div>
              <div class="territory-stats-strip">
                <div class="territory-stat-item">
                  <b>1 Hub</b>
                  <span>Noida Distribution</span>
                </div>
                <div class="territory-stat-item">
                  <b style="color:#d97706;">1 Unit</b>
                  <span>Transit QR Stock</span>
                </div>
                <div class="territory-stat-item">
                  <b>Uttar Pradesh</b>
                  <span>Interstate Region</span>
                </div>
              </div>
            </div>
            <button class="territory-cta-btn">
              View Interstate Hubs →
            </button>
          </div>

          <!-- Box 3: Master Directory -->
          <div class="territory-box master" id="box-territory-master">
            <div>
              <div class="territory-box-badge">⚡ ALL-IN-ONE MASTER TABLE</div>
              <div class="territory-box-header">
                <div class="territory-box-icon">📋</div>
                <div>
                  <h4 class="territory-box-title">Master Dealership Table</h4>
                  <p class="territory-box-desc">
                    Search & inspect all 35 dealerships across every district in a single master table with instant series allocation.
                  </p>
                </div>
              </div>
              <div class="territory-stats-strip">
                <div class="territory-stat-item">
                  <b>${allShowrooms.length} Total Hubs</b>
                  <span>All Dealers</span>
                </div>
                <div class="territory-stat-item">
                  <b style="color:#059669;">Global Search</b>
                  <span>Fast Filter</span>
                </div>
                <div class="territory-stat-item">
                  <b>Direct Allot</b>
                  <span>Instant Series</span>
                </div>
              </div>
            </div>
            <button class="territory-cta-btn">
              Open Master Table View →
            </button>
          </div>
        </div>

        <!-- Stock Requisitions Queue (Super Admin View) -->
        ${renderRequisitionsSection(allReqs)}
      `;

      // Event Bindings for Level 1
      wrap.querySelector('#box-territory-bihar')?.addEventListener('click', () => {
        state.showroomDrilldownLevel = 'CITY';
        state.selectedState = 'Bihar';
        renderShowroomView();
      });

      wrap.querySelector('#box-territory-interstate')?.addEventListener('click', () => {
        state.showroomDrilldownLevel = 'DEALER_LIST';
        state.selectedCity = 'Noida';
        renderShowroomView();
      });

      wrap.querySelector('#box-territory-master')?.addEventListener('click', () => {
        state.showroomDrilldownLevel = 'MASTER';
        state.selectedCity = 'ALL';
        renderShowroomView();
      });

      wrap.querySelector('#btn-switch-master-table')?.addEventListener('click', () => {
        state.showroomDrilldownLevel = 'MASTER';
        state.selectedCity = 'ALL';
        renderShowroomView();
      });

      wrap.querySelector('#btn-onboard-showroom')?.addEventListener('click', () => {
        showroomModal('Patna');
      });

      bindRequisitionsEvents(wrap);
      return;
    }

    // =========================================================================
    // LEVEL 2: CITIES / DISTRICTS SELECTION GRID
    // =========================================================================
    if (state.showroomDrilldownLevel === 'CITY') {
      wrap.innerHTML = `
        <!-- Breadcrumb & Step Navigation Bar -->
        <div class="drilldown-bar">
          <div class="drilldown-breadcrumbs">
            <a class="drilldown-step-link" id="crumb-goto-state">🏠 Territories</a>
            <span class="drilldown-sep">›</span>
            <span class="drilldown-step-current">📍 Bihar State Network (${biharCities.length} Districts)</span>
          </div>
          <div class="drilldown-actions">
            <button class="drilldown-back-btn" id="btn-back-to-state">
              ← Back to State Selection
            </button>
            <button class="btn secondary tiny" id="btn-switch-master-table" style="font-size:12px; height:34px; padding:0 12px; cursor:pointer;">
              📋 Master Table
            </button>
            <button class="btn primary tiny" id="btn-onboard-showroom" style="font-size:12px; height:34px; padding:0 14px; cursor:pointer;">
              + Onboard Dealer
            </button>
          </div>
        </div>

        <!-- Step 2 Title & Quick Search -->
        <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin: 16px 0 12px; flex-wrap:wrap;">
          <div>
            <span class="eyebrow" style="color:#2563eb; font-weight:700; font-size:11px; letter-spacing:0.04em;">STEP 2 OF 3: SELECT DISTRICT / CITY</span>
            <h3 style="margin:4px 0 2px; font-family:var(--font-display); font-size:18px; font-weight:800; color:#0f172a;">
              Bihar Operating Districts (${filteredCities.length})
            </h3>
            <p style="margin:0; font-size:12.5px; color:#64748b;">
              Click on any district card below to see all authorized showrooms, service centers & QR stock in that city.
            </p>
          </div>
          <div style="min-width:260px; max-width:340px; width:100%; position:relative;">
            <input id="city-filter-input" placeholder="🔍 Search Bihar district..." value="${esc(state.citySearchQuery || '')}" style="width:100%; height:38px; padding:0 12px 0 34px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; font-size:12.5px;" />
            <span style="position:absolute; left:11px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:13px; pointer-events:none;">🔍</span>
          </div>
        </div>

        <!-- City Cards Grid -->
        <div class="city-cards-grid">
          ${filteredCities.map(c => {
            const meta = cityRegionMeta[c.city] || { icon: '📍', region: 'Automotive Distribution Center' };
            return `
              <div class="city-card-item" data-city="${esc(c.city)}">
                <div>
                  <div class="city-card-top">
                    <span class="city-card-name">
                      <span>${meta.icon}</span>
                      <span>${esc(c.city)}</span>
                    </span>
                    <span class="badge ${c.showrooms.length > 2 ? 'badge-showroom-stock' : 'badge-allocated'}" style="font-size:10.5px; padding:2px 7px;">
                      ${c.showrooms.length} ${c.showrooms.length === 1 ? 'Hub' : 'Hubs'}
                    </span>
                  </div>
                  <div class="city-card-tag">${esc(meta.region)}</div>
                  <div class="city-card-metrics">
                    <span>🏢 Showrooms: <b>${c.showrooms.length}</b></span>
                    <span>🏷️ Stock: <b>${c.stockCount} QRs</b></span>
                  </div>
                </div>
                <div class="city-card-cta">
                  <span>Inspect Dealerships</span>
                  <span>→</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Stock Requisitions Queue (Super Admin View) -->
        ${renderRequisitionsSection(allReqs)}
      `;

      // Event Bindings for Level 2
      wrap.querySelectorAll('.city-card-item').forEach(card => {
        card.addEventListener('click', () => {
          const city = card.getAttribute('data-city');
          state.showroomDrilldownLevel = 'DEALER_LIST';
          state.selectedCity = city;
          renderShowroomView();
        });
      });

      const filterInput = wrap.querySelector('#city-filter-input');
      if (filterInput) {
        filterInput.addEventListener('input', (e) => {
          state.citySearchQuery = e.target.value;
          renderShowroomView();
          const updated = wrap.querySelector('#city-filter-input');
          if (updated) {
            updated.focus();
            updated.setSelectionRange(updated.value.length, updated.value.length);
          }
        });
      }

      wrap.querySelector('#crumb-goto-state')?.addEventListener('click', () => {
        state.showroomDrilldownLevel = 'STATE';
        renderShowroomView();
      });

      wrap.querySelector('#btn-back-to-state')?.addEventListener('click', () => {
        state.showroomDrilldownLevel = 'STATE';
        renderShowroomView();
      });

      wrap.querySelector('#btn-switch-master-table')?.addEventListener('click', () => {
        state.showroomDrilldownLevel = 'MASTER';
        state.selectedCity = 'ALL';
        renderShowroomView();
      });

      wrap.querySelector('#btn-onboard-showroom')?.addEventListener('click', () => {
        showroomModal('Patna');
      });

      bindRequisitionsEvents(wrap);
      return;
    }

    // =========================================================================
    // LEVEL 3: DEALERSHIP LISTING TABLE FOR SELECTED CITY
    // =========================================================================
    if (state.showroomDrilldownLevel === 'DEALER_LIST') {
      wrap.innerHTML = `
        <!-- Breadcrumb & Step Navigation Bar -->
        <div class="drilldown-bar">
          <div class="drilldown-breadcrumbs">
            <a class="drilldown-step-link" id="crumb-goto-state">🏠 Territories</a>
            <span class="drilldown-sep">›</span>
            <a class="drilldown-step-link" id="crumb-goto-city">📍 Bihar (${biharCities.length} Districts)</a>
            <span class="drilldown-sep">›</span>
            <span class="drilldown-step-current">🏙️ ${esc(state.selectedCity)} Hubs</span>
          </div>
          <div class="drilldown-actions">
            <button class="drilldown-back-btn" id="btn-back-to-cities">
              ← Back to Bihar Districts
            </button>
            <button class="btn secondary tiny" id="btn-switch-master-table" style="font-size:12px; height:34px; padding:0 12px; cursor:pointer;">
              📋 Master Table
            </button>
            <button class="btn primary tiny" id="btn-add-dealer-to-city" style="font-size:12px; height:34px; padding:0 14px; cursor:pointer;">
              + Add Dealer to ${esc(state.selectedCity)}
            </button>
          </div>
        </div>

        <!-- Step 3: City Focus Banner & Table -->
        <section class="panel">
          <div class="panel-heading" style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #f1f5f9; flex-wrap:wrap; gap:12px;">
            <div>
              <span class="eyebrow" style="color:#2563eb; font-weight:700; font-size:11px; letter-spacing:0.04em;">STEP 3 OF 3: DEALERSHIP LISTING & INVENTORY</span>
              <h3 style="margin:2px 0 0; font-size:16px; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:8px;">
                <span>🏢</span>
                ${esc(state.selectedCity)} Dealerships & Showrooms (${cityShowrooms.length})
                <span class="badge badge-active" style="font-size:11px;">${cityStock} QRs Ready in Stock</span>
              </h3>
              <p style="margin:4px 0 0; font-size:12px; color:#64748b;">
                Showing all verified automotive dealer showrooms, service centers & stock holding points located in ${esc(state.selectedCity)}, Bihar.
              </p>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <button class="btn primary tiny" id="btn-inner-add-dealer" style="font-size:11.5px; height:32px; padding:0 12px; cursor:pointer;">
                + Add Dealer to ${esc(state.selectedCity)}
              </button>
            </div>
          </div>

          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Dealership Name</th>
                  <th>Dealer Code</th>
                  <th>City / District</th>
                  <th>State</th>
                  <th>Available QR Stock</th>
                  <th>Pending Activation</th>
                  <th>Operational Status</th>
                  <th style="text-align:right;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${cityShowrooms.length === 0 ? `
                  <tr>
                    <td colspan="8" style="text-align:center; padding:44px 20px; color:#64748b;">
                      <div style="font-size:36px; margin-bottom:8px;">🏢</div>
                      <b style="font-size:14px; color:#1e293b;">No dealerships onboarded in ${esc(state.selectedCity)} yet.</b>
                      <p style="margin:6px 0 16px; font-size:12.5px;">Click below to onboard the first verified dealer in this district.</p>
                      <button class="btn primary tiny" id="btn-empty-add-dealer" style="padding:6px 14px; font-size:12px; cursor:pointer;">+ Onboard Dealer to ${esc(state.selectedCity)}</button>
                    </td>
                  </tr>
                ` : cityShowrooms.map(x => {
                  const stock = allQrs.filter(z => z.showroom_id === x.id && z.status === 'SHOWROOM_STOCK').length;
                  const pending = allQrs.filter(z => z.showroom_id === x.id && z.status === 'PENDING_ACTIVATION').length;
                  return `
                    <tr>
                      <td>
                        <b style="color:#0f172a; font-size:13px;">${esc(x.name)}</b>
                        <small style="display:flex; align-items:center; gap:4px; margin-top:2px; color:#64748b;">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                          Authorized Distribution Partner
                        </small>
                      </td>
                      <td><code class="mono" style="font-weight:700; color:#1e293b; background:#f1f5f9; padding:2px 6px; border-radius:4px;">${esc(x.code)}</code></td>
                      <td><span style="font-weight:600; color:#2563eb;">📍 ${esc(x.city)}</span></td>
                      <td style="color:#475569;">${esc(x.state)}</td>
                      <td>
                        <span class="badge ${stock > 0 ? 'badge-showroom-stock' : 'badge-blocked'}" style="font-size:11.5px; padding:3px 9px;">
                          ${stock} units ready
                        </span>
                      </td>
                      <td>
                        <span style="font-weight:${pending > 0 ? '700' : '500'}; color:${pending > 0 ? '#d97706' : '#64748b'};">
                          ${pending}
                        </span>
                      </td>
                      <td>${badge(x.status)}</td>
                      <td style="text-align:right;">
                        <button class="btn secondary tiny action-allocate-qr" data-showroom-id="${x.id}" title="Allocate QR stickers to this dealer" style="font-weight:600;">
                          🏷️ Allocate QRs
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </section>

        <!-- Stock Requisitions Queue (Super Admin View) -->
        ${renderRequisitionsSection(allReqs)}
      `;

      // Event Bindings for Level 3
      wrap.querySelector('#crumb-goto-state')?.addEventListener('click', () => {
        state.showroomDrilldownLevel = 'STATE';
        renderShowroomView();
      });

      wrap.querySelector('#crumb-goto-city')?.addEventListener('click', () => {
        state.showroomDrilldownLevel = 'CITY';
        renderShowroomView();
      });

      wrap.querySelector('#btn-back-to-cities')?.addEventListener('click', () => {
        state.showroomDrilldownLevel = 'CITY';
        renderShowroomView();
      });

      wrap.querySelector('#btn-switch-master-table')?.addEventListener('click', () => {
        state.showroomDrilldownLevel = 'MASTER';
        state.selectedCity = 'ALL';
        renderShowroomView();
      });

      wrap.querySelectorAll('#btn-add-dealer-to-city, #btn-inner-add-dealer, #btn-empty-add-dealer').forEach(btn => {
        btn.addEventListener('click', () => {
          showroomModal(state.selectedCity !== 'ALL' ? state.selectedCity : 'Patna');
        });
      });

      wrap.querySelectorAll('.action-allocate-qr').forEach(btn => {
        btn.addEventListener('click', () => {
          const shrId = btn.getAttribute('data-showroom-id');
          const centralQrs = allQrs.filter(z => z.status === 'CENTRAL_STOCK');
          if (centralQrs.length > 0) {
            actionModal(centralQrs[0].id, 'allocate', allShowrooms, []);
          } else {
            toast('Generating new QR batch to allocate to this dealer...');
            generateBatchModal();
          }
        });
      });

      bindRequisitionsEvents(wrap);
      return;
    }

    // =========================================================================
    // LEVEL 4: MASTER DEALERSHIP DIRECTORY TABLE
    // =========================================================================
    wrap.innerHTML = `
      <!-- Breadcrumb Bar -->
      <div class="drilldown-bar">
        <div class="drilldown-breadcrumbs">
          <a class="drilldown-step-link" id="crumb-goto-state">🏠 Territories</a>
          <span class="drilldown-sep">›</span>
          <span class="drilldown-step-current">📋 Master Dealership Directory (${allShowrooms.length} Hubs)</span>
        </div>
        <div class="drilldown-actions">
          <button class="btn primary tiny" id="btn-switch-drilldown" style="font-size:12px; height:34px; padding:0 12px; cursor:pointer;">
            📁 Step-by-Step Flow (State → City)
          </button>
          <button class="btn primary tiny" id="btn-onboard-showroom" style="font-size:12px; height:34px; padding:0 14px; cursor:pointer;">
            + Onboard New Dealer
          </button>
        </div>
      </div>

      <!-- High-Level Metrics Strip -->
      <div class="dealer-stats-strip">
        <div class="dealer-stat-box">
          <div class="stat-icon">🏢</div>
          <div class="stat-content">
            <span class="stat-num">${allShowrooms.length}</span>
            <span class="stat-lbl">Total Dealerships</span>
          </div>
        </div>
        <div class="dealer-stat-box">
          <div class="stat-icon">🏷️</div>
          <div class="stat-content">
            <span class="stat-num">${totalStockInBihar}</span>
            <span class="stat-lbl">Ready Field QRs</span>
          </div>
        </div>
        <div class="dealer-stat-box">
          <div class="stat-icon">🏙️</div>
          <div class="stat-content">
            <span class="stat-num">${biharCities.length}</span>
            <span class="stat-lbl">Covered Districts</span>
          </div>
        </div>
        <div class="dealer-stat-box">
          <div class="stat-icon">⚡</div>
          <div class="stat-content">
            <span class="stat-num" style="color:#059669;">100%</span>
            <span class="stat-lbl">Operational Network</span>
          </div>
        </div>
      </div>

      <!-- Filter Bar -->
      <div class="dealer-filter-card">
        <div class="dealer-filter-top">
          <div class="dealer-search-wrap">
            <span class="search-lens">🔍</span>
            <input id="city-search-input" placeholder="Search by dealership name, district, or code..." value="${esc(state.showroomSearch)}" />
            ${state.showroomSearch ? `<button class="clear-search-btn" id="btn-clear-search" title="Clear search">✕</button>` : ''}
          </div>

          <div class="dealer-filter-controls">
            <div class="district-dropdown-container">
              <span class="dropdown-label">District:</span>
              <select id="district-quick-select" class="district-dropdown">
                <option value="ALL" ${state.selectedCity === 'ALL' ? 'selected' : ''}>🗺️ All Districts (${totalDealersInBihar} Hubs)</option>
                ${biharCities.map(c => `
                  <option value="${esc(c.city)}" ${state.selectedCity.toLowerCase() === c.city.toLowerCase() ? 'selected' : ''}>
                    ${esc(c.city)} (${c.showrooms.length} ${c.showrooms.length === 1 ? 'Hub' : 'Hubs'} • ${c.stockCount} QRs)
                  </option>
                `).join('')}
                ${otherStateCities.length > 0 ? otherStateCities.map(c => `
                  <option value="${esc(c.city)}" ${state.selectedCity.toLowerCase() === c.city.toLowerCase() ? 'selected' : ''}>
                    🚚 ${esc(c.city)} (${c.state})
                  </option>
                `).join('') : ''}
              </select>
            </div>

            ${(state.selectedCity !== 'ALL' || state.showroomSearch) ? `
              <button class="btn secondary tiny" id="btn-reset-filters" style="height:38px; padding:0 12px; font-size:12px; cursor:pointer;" title="Reset all filters">
                ✕ Reset Filters
              </button>
            ` : ''}
          </div>
        </div>

        <!-- Single-line horizontal scrollable district chips -->
        <div class="district-chips-bar">
          <button class="district-chip ${state.selectedCity === 'ALL' ? 'active' : ''}" data-city="ALL">
            <span>🗺️ All Bihar</span>
            <span class="chip-count">${totalDealersInBihar}</span>
          </button>

          ${biharCities.map(c => {
            const meta = cityRegionMeta[c.city] || { icon: '📍' };
            const isSelected = state.selectedCity.toLowerCase() === c.city.toLowerCase();
            return `
              <button class="district-chip ${isSelected ? 'active' : ''}" data-city="${esc(c.city)}">
                <span>${meta.icon} ${esc(c.city)}</span>
                <span class="chip-count">${c.showrooms.length}</span>
              </button>
            `;
          }).join('')}

          ${otherStateCities.length > 0 ? otherStateCities.map(c => `
            <button class="district-chip ${state.selectedCity.toLowerCase() === c.city.toLowerCase() ? 'active' : ''}" data-city="${esc(c.city)}">
              <span>🚚 ${esc(c.city)}</span>
              <span class="chip-count">${c.showrooms.length}</span>
            </button>
          `).join('') : ''}
        </div>
      </div>

      <!-- Master Table Panel -->
      <section class="panel">
        <div class="panel-heading" style="display:flex; justify-content:space-between; align-items:center; padding:16px 20px; border-bottom:1px solid #f1f5f9; flex-wrap:wrap; gap:12px;">
          <div>
            <h3 style="margin:0; font-size:15px; font-weight:700; color:#0f172a; display:flex; align-items:center; gap:8px;">
              <span>🏢</span>
              ${state.selectedCity === 'ALL'
                ? `Master Dealership Directory (${filteredShowrooms.length})`
                : `${esc(state.selectedCity)} Dealerships (${filteredShowrooms.length})`
              }
              ${state.selectedCity !== 'ALL' ? `<span class="badge badge-active" style="font-size:11px;">District: ${esc(state.selectedCity)}</span>` : ''}
              ${state.showroomSearch ? `<span class="badge badge-central-stock" style="font-size:11px;">Search: "${esc(state.showroomSearch)}"</span>` : ''}
            </h3>
            <p style="margin:4px 0 0; font-size:12px; color:#64748b;">
              Direct table listing of all verified automotive dealer showrooms & QR distribution centers.
            </p>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button class="btn primary tiny" id="btn-onboard-showroom-master" style="font-size:11.5px; height:32px; padding:0 12px; cursor:pointer;">
              + Onboard Dealer
            </button>
          </div>
        </div>

        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Dealership Name</th>
                <th>Dealer Code</th>
                <th>City / District</th>
                <th>State</th>
                <th>Available QR Stock</th>
                <th>Pending Activation</th>
                <th>Operational Status</th>
                <th style="text-align:right;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${filteredShowrooms.length === 0 ? `
                <tr>
                  <td colspan="8" style="text-align:center; padding:44px 20px; color:#64748b;">
                    <div style="font-size:36px; margin-bottom:8px;">🔍</div>
                    <b style="font-size:14px; color:#1e293b;">No dealerships found matching your criteria.</b>
                    <p style="margin:6px 0 16px; font-size:12.5px;">No active dealers matched the selected district or search term.</p>
                    <div style="display:flex; justify-content:center; gap:8px;">
                      <button class="btn secondary tiny" id="btn-empty-reset" style="padding:6px 14px; font-size:12px; cursor:pointer;">Reset Filters</button>
                      <button class="btn primary tiny" id="btn-empty-add-dealer" style="padding:6px 14px; font-size:12px; cursor:pointer;">+ Onboard New Dealer</button>
                    </div>
                  </td>
                </tr>
              ` : filteredShowrooms.map(x => {
                const stock = allQrs.filter(z => z.showroom_id === x.id && z.status === 'SHOWROOM_STOCK').length;
                const pending = allQrs.filter(z => z.showroom_id === x.id && z.status === 'PENDING_ACTIVATION').length;
                return `
                  <tr>
                    <td>
                      <b style="color:#0f172a; font-size:13px;">${esc(x.name)}</b>
                      <small style="display:flex; align-items:center; gap:4px; margin-top:2px; color:#64748b;">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/><circle cx="12" cy="10" r="3"/></svg>
                        Authorized Distribution Partner
                      </small>
                    </td>
                    <td><code class="mono" style="font-weight:700; color:#1e293b; background:#f1f5f9; padding:2px 6px; border-radius:4px;">${esc(x.code)}</code></td>
                    <td>
                      <span style="font-weight:600; color:#2563eb; cursor:pointer;" class="filter-by-city-link" data-city="${esc(x.city)}" title="Click to drill down into ${esc(x.city)}">
                        📍 ${esc(x.city)}
                      </span>
                    </td>
                    <td style="color:#475569;">${esc(x.state)}</td>
                    <td>
                      <span class="badge ${stock > 0 ? 'badge-showroom-stock' : 'badge-blocked'}" style="font-size:11.5px; padding:3px 9px;">
                        ${stock} units ready
                      </span>
                    </td>
                    <td>
                      <span style="font-weight:${pending > 0 ? '700' : '500'}; color:${pending > 0 ? '#d97706' : '#64748b'};">
                        ${pending}
                      </span>
                    </td>
                    <td>${badge(x.status)}</td>
                    <td style="text-align:right;">
                      <button class="btn secondary tiny action-allocate-qr" data-showroom-id="${x.id}" title="Allocate QR stickers to this dealer" style="font-weight:600;">
                        🏷️ Allocate QRs
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>

      <!-- Stock Requisitions Queue (Super Admin View) -->
      ${renderRequisitionsSection(allReqs)}
    `;

    // Event Bindings for Level 4 (Master Table)
    wrap.querySelector('#crumb-goto-state')?.addEventListener('click', () => {
      state.showroomDrilldownLevel = 'STATE';
      renderShowroomView();
    });

    wrap.querySelector('#btn-switch-drilldown')?.addEventListener('click', () => {
      state.showroomDrilldownLevel = 'STATE';
      renderShowroomView();
    });

    wrap.querySelectorAll('.district-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const city = chip.getAttribute('data-city');
        state.selectedCity = city;
        renderShowroomView();
      });
    });

    wrap.querySelector('#district-quick-select')?.addEventListener('change', (e) => {
      state.selectedCity = e.target.value;
      renderShowroomView();
    });

    wrap.querySelectorAll('.filter-by-city-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.stopPropagation();
        const city = link.getAttribute('data-city');
        state.selectedCity = city;
        state.showroomDrilldownLevel = 'DEALER_LIST';
        renderShowroomView();
      });
    });

    const searchInp = wrap.querySelector('#city-search-input');
    if (searchInp) {
      searchInp.addEventListener('input', (e) => {
        const cursor = e.target.selectionStart;
        state.showroomSearch = e.target.value;
        renderShowroomView();
        const updatedInp = wrap.querySelector('#city-search-input');
        if (updatedInp) {
          updatedInp.focus();
          try {
            updatedInp.setSelectionRange(cursor, cursor);
          } catch {}
        }
      });
    }

    wrap.querySelector('#btn-clear-search')?.addEventListener('click', () => {
      state.showroomSearch = '';
      renderShowroomView();
    });

    wrap.querySelectorAll('#btn-reset-filters, #btn-empty-reset').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedCity = 'ALL';
        state.showroomSearch = '';
        renderShowroomView();
      });
    });

    wrap.querySelectorAll('#btn-onboard-showroom, #btn-onboard-showroom-master, #btn-empty-add-dealer').forEach(btn => {
      btn.addEventListener('click', () => {
        showroomModal(state.selectedCity !== 'ALL' ? state.selectedCity : 'Patna');
      });
    });

    wrap.querySelectorAll('.action-allocate-qr').forEach(btn => {
      btn.addEventListener('click', () => {
        const shrId = btn.getAttribute('data-showroom-id');
        const centralQrs = allQrs.filter(z => z.status === 'CENTRAL_STOCK');
        if (centralQrs.length > 0) {
          actionModal(centralQrs[0].id, 'allocate', allShowrooms, []);
        } else {
          toast('Generating new QR batch to allocate to this dealer...');
          generateBatchModal();
        }
      });
    });

    bindRequisitionsEvents(wrap);
  }

  // Helper functions for Requisitions Section to keep code clean and modular
  function renderRequisitionsSection(allReqs) {
    return `
      <section class="panel" style="margin-top:20px;">
        <div class="panel-heading" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="display:flex; align-items:center; gap:8px;">
              📦 Dealer Stock Requisitions & Series Allotment Queue
              ${allReqs.filter(r => r.status === 'PENDING').length > 0
                ? `<span class="badge badge-allocated">${allReqs.filter(r => r.status === 'PENDING').length} PENDING ALLOTMENT</span>`
                : `<span class="badge badge-active">ALL FULFILLED</span>`
              }
            </h3>
            <p>Showroom inventory indents submitted by dealership managers requesting serial batches.</p>
          </div>
        </div>

        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Requisition ID</th>
                <th>Showroom / Dealership</th>
                <th>City</th>
                <th>Requested Qty</th>
                <th>Category Focus</th>
                <th>Requisition Notes</th>
                <th>Status</th>
                <th>Allotted Serial Range</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${allReqs.length === 0 ? `
                <tr><td colspan="9" style="text-align:center; padding:24px; color:#64748b;">No stock requisitions recorded yet.</td></tr>
              ` : allReqs.map(r => `
                <tr>
                  <td><code class="mono">${esc(r.id)}</code></td>
                  <td><b>${esc(r.showroom_name)}</b><small>Code: ${esc(r.showroom_code)}</small></td>
                  <td>${esc(r.showroom_city)}</td>
                  <td><b style="color:var(--blue-600);">${r.quantity}</b> units</td>
                  <td><span class="badge badge-central-stock" style="font-size:10.5px;">${esc(r.preferred_category)}</span></td>
                  <td><small style="color:#475569; max-width:220px; display:block;">${esc(r.notes || 'Standard showroom inventory requisition')}</small></td>
                  <td>
                    ${r.status === 'PENDING'
                      ? '<span class="badge badge-allocated">PENDING ALLOTMENT</span>'
                      : '<span class="badge badge-active">FULFILLED</span>'
                    }
                  </td>
                  <td>
                    ${r.allocated_series_start
                      ? `<code class="mono" style="font-size:11px; color:#059669 !important;">${esc(r.allocated_series_start)} → ${esc(r.allocated_series_end)}</code>`
                      : '<span style="color:#94a3b8; font-size:11px;">Not allotted yet</span>'
                    }
                  </td>
                  <td>
                    ${r.status === 'PENDING' ? `
                      <button class="btn primary tiny action-allot-series" data-req-id="${r.id}" style="font-size:11px; padding:5px 10px; cursor:pointer;">
                        ⚡ Allot Series Range & Dispatch
                      </button>
                    ` : `
                      <span style="font-size:11px; color:#10b981; font-weight:700;">✓ Dispatched</span>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function bindRequisitionsEvents(wrap) {
    wrap.querySelectorAll('.action-allot-series').forEach(btn => {
      btn.addEventListener('click', async () => {
        const reqId = btn.getAttribute('data-req-id');
        btn.disabled = true;
        btn.textContent = 'Allotting series...';
        try {
          const res = await post(`/api/admin/requisitions/${encodeURIComponent(reqId)}/allot`, {});
          toast(`✓ Allotted series ${res.seriesStart} to ${res.seriesEnd} (${res.allottedCount} units) to dealership!`, 'success');
          showroomPage();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = '⚡ Allot Series Range & Dispatch';
        }
      });
    });
  }

  renderShowroomView();
}

async function vehiclePage() {
  const [v, q] = await Promise.all([api('/api/vehicles'), api('/api/qrs')]);
  document.querySelector('.page-wrap').innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h3>Vehicle Master Registry</h3>
          <p>Registered motor vehicles and current physical QR bindings.</p>
        </div>
        <span class="badge badge-active">${v.items.length} VERIFIED VEHICLES</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Registration Plate</th>
              <th>Make & Model</th>
              <th>Class</th>
              <th>Owner Name</th>
              <th>Active QR Identity</th>
              <th>Verification Status</th>
            </tr>
          </thead>
          <tbody>
            ${v.items.map(x => {
              const unit = q.items.find(z => z.vehicle_id === x.id && z.status === 'ACTIVE');
              return `
                <tr>
                  <td><b class="mono" style="font-size:13px; color:var(--navy-950);">${esc(x.registration)}</b></td>
                  <td>${esc(x.make)} ${esc(x.model)}<small>${esc(x.color || '')}</small></td>
                  <td>${esc(x.category)}</td>
                  <td>${esc(x.owner_name || '—')}</td>
                  <td>${unit ? `<b class="mono" style="color:var(--emerald-600);">${esc(unit.qr_id)}</b>` : '<span style="color:var(--slate-400);">No active QR</span>'}</td>
                  <td>${badge(x.verification_status)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

async function messagePage() {
  const m = await api('/api/messages');
  setAlertBadge(m.items.filter(x => x.status === 'NEW' || x.status === 'ACKNOWLEDGED').length);

  const newCount = m.items.filter(x => x.status === 'NEW').length;
  const ackCount = m.items.filter(x => x.status === 'ACKNOWLEDGED').length;
  const closedCount = m.items.filter(x => x.status === 'CLOSED').length;

  document.querySelector('.page-wrap').innerHTML = `
    <div class="metrics-grid">
      ${metric('New Citizen Alerts', newCount, 'Immediate attention needed', '🚨', 'amber')}
      ${metric('In Progress / Handling', ackCount, 'Operator acknowledged', '⏳', 'blue')}
      ${metric('Resolved & Closed', closedCount, 'Completed safely', '✓', 'green')}
      ${metric('Total Lifetime Scans', m.items.length, 'Cumulative bystander pings', '📬', 'purple')}
    </div>

    <section class="panel">
      <div class="panel-heading">
        <div>
          <h3>Citizen Alerts Dispatch Inbox</h3>
          <p>Real-time citizen submissions from scanned vehicle QR stickers with multi-channel dispatch status.</p>
        </div>
        <div class="toolbar-actions">
          <button class="btn tiny secondary" id="refresh-inbox">↻ Refresh Feed</button>
          <span class="badge badge-active">ENCRYPTED GATEWAY</span>
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Reference / Time</th>
              <th>Category</th>
              <th>Target Vehicle / QR</th>
              <th>Citizen Message & Evidence</th>
              <th>Status</th>
              <th style="text-align:right;">Resolution Action</th>
            </tr>
          </thead>
          <tbody>
            ${m.items.map(x => `
              <tr>
                <td>
                  <b class="mono">${esc(x.id.slice(-8).toUpperCase())}</b>
                  <small>${date(x.created_at)}</small>
                </td>
                <td>
                  <span class="badge ${x.category.includes('Emergency') ? 'badge-blocked' : 'badge-allocated'}">${esc(x.category)}</span>
                </td>
                <td>
                  <b>${esc(x.registration || '—')}</b>
                  <small class="mono">${esc(x.qr_id)}</small>
                </td>
                <td style="max-width:320px;">
                  <div style="font-size:12px; line-height:1.5; color:var(--slate-800);">${esc(x.note)}</div>
                  <div style="display:flex; align-items:center; gap:8px; margin-top:6px; flex-wrap:wrap;">
                    <small style="color:var(--slate-400);">From: ${esc(x.visitor_name || 'Anonymous Citizen')}</small>
                    ${x.photo_data ? `<button class="btn tiny secondary" style="padding:2px 8px; font-size:10px; font-weight:700;" data-view-photo="${esc(x.id)}">📷 View Photo Proof</button>` : ''}
                    <span class="badge" style="font-size:9px; padding:2px 6px; background:var(--blue-50); color:var(--blue-600);">📡 ${esc(x.notification_status || 'DELIVERED')}</span>
                  </div>
                </td>
                <td>${badge(x.status)}</td>
                <td style="text-align:right;">
                  ${x.status === 'NEW' ? `
                    <button class="btn tiny secondary" data-msg-id="${esc(x.id)}" data-msg-status="ACKNOWLEDGED">Acknowledge</button>
                  ` : x.status === 'ACKNOWLEDGED' ? `
                    <button class="btn tiny primary" data-msg-id="${esc(x.id)}" data-msg-status="CLOSED">Mark Resolved</button>
                  ` : '<span style="color:var(--emerald-600); font-weight:700; font-size:11px;">✓ Resolved</span>'}
                </td>
              </tr>
            `).join('') || '<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--slate-400);">Inbox is completely clear! No open bystander reports.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;

  document.querySelector('#refresh-inbox').onclick = () => renderAdmin();

  document.querySelectorAll('[data-msg-id]').forEach(b => {
    b.onclick = async () => {
      try {
        await patch(`/api/messages/${b.dataset.msgId}`, { status: b.dataset.msgStatus });
        toast('Alert status updated in ledger.');
        renderAdmin();
      } catch (e) {
        toast(e.message, 'error');
      }
    };
  });

  document.querySelectorAll('[data-view-photo]').forEach(b => {
    b.onclick = () => {
      const item = m.items.find(z => z.id === b.dataset.viewPhoto);
      if (item && item.photo_data) {
        showPhotoModal(item.photo_data, item.category, item.registration || item.qr_id);
      }
    };
  });
}

async function auditPage() {
  const a = await api('/api/audit');
  document.querySelector('.page-wrap').innerHTML = `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h3>Cryptographic Audit Trail Ledger</h3>
          <p>Append-only tamper-evident log of all operational transitions.</p>
        </div>
        <span class="badge badge-active">IMMUTABLE LOG</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor Identity</th>
              <th>Event Action</th>
              <th>Entity</th>
              <th>Signed Parameters</th>
            </tr>
          </thead>
          <tbody>
            ${a.items.map(x => `
              <tr>
                <td><small>${date(x.created_at)}</small></td>
                <td><b>${esc(x.actor_label)}</b></td>
                <td><span class="badge badge-allocated">${esc(x.action.replaceAll('_', ' '))}</span></td>
                <td>${esc(x.entity_type)} <small class="mono">${esc(x.entity_id.slice(-8))}</small></td>
                <td><code class="mono" style="font-size:10px; color:var(--slate-500);">${esc(JSON.stringify(x.details))}</code></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

async function ordersPage() {
  const catalog = [
    {
      sku: 'SMARTO-CAR-PACK',
      name: 'SmartO Car Safety Decal Pack',
      category: 'Passenger Car / SUV / EV',
      price: 299,
      mrp: 499,
      discountPercent: 40,
      icon: '🚘',
      badge: 'BESTSELLER',
      description: 'Dual Decal Kit: Tamper-proof front windshield safety decal + rear bumper quick alert tag with unguessable cryptographic routing.',
      features: ['Dual windshield & bumper placement', '3M Automotive Grade Weatherproof', 'Zero Personal Phone Number Exposure', 'Instant Bystander Emergency Routing']
    },
    {
      sku: 'SMARTO-MOTO-PACK',
      name: 'SmartO Moto Safety Decal Pack',
      category: 'Motorcycle / Scooter',
      price: 199,
      mrp: 299,
      discountPercent: 33,
      icon: '🏍️',
      badge: 'POPULAR',
      description: 'Compact UV-laminated fuel tank & visor decal engineered for two-wheelers in heavy monsoon rain and extreme sunlight.',
      features: ['Compact 65mm aerodynamic fit', 'Fuel & scratch resistant coating', 'Instant parking & accident alerts', '24/7 Citizen-to-Owner Masked Bridge']
    },
    {
      sku: 'SMARTO-COMMERCIAL-PACK',
      name: 'SmartO Commercial Fleet Pro Decal',
      category: 'Truck / Bus / Commercial',
      price: 499,
      mrp: 799,
      discountPercent: 38,
      icon: '🚛',
      badge: 'HEAVY DUTY',
      description: 'Heavy-duty reflective safety identity decal for transport fleets, school buses, auto-rickshaws and commercial freight.',
      features: ['High-visibility reflective border', 'Industrial tamper-evident vinyl', 'Fleet central console integration', 'Emergency highway response routing']
    }
  ];

  document.querySelector('.page-wrap').innerHTML = `
    <!-- Hero Banner -->
    <section class="welcome-banner" style="min-height:auto; background:linear-gradient(135deg, #091224 0%, #0d2350 60%, #1e40af 100%);">
      <div class="welcome-copy">
        <span class="eyebrow" style="color:#38bdf8;">DIRECT-TO-CONSUMER DECAL SHOP</span>
        <h2>SmartO Official Consumer Webstore</h2>
        <p>Order official tamper-proof QR safety decals directly to your doorstep for any existing car, bike, or commercial vehicle.</p>
      </div>
      <div style="display:flex; align-items:center; gap:10px; margin-top:14px; flex-wrap:wrap;">
        <span class="badge" style="background:rgba(255,255,255,0.1); color:#ffffff; font-size:11px; padding:6px 12px; border:1px solid rgba(255,255,255,0.2);">
          ✓ Pan-India Doorstep Courier
        </span>
        <span class="badge" style="background:rgba(255,255,255,0.1); color:#ffffff; font-size:11px; padding:6px 12px; border:1px solid rgba(255,255,255,0.2);">
          ✓ 3-Step Instant Self-Activation
        </span>
        <span class="badge" style="background:rgba(255,255,255,0.1); color:#ffffff; font-size:11px; padding:6px 12px; border:1px solid rgba(255,255,255,0.2);">
          ✓ 100% Privacy Guarantee
        </span>
      </div>
    </section>

    <!-- Product Catalog Grid -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(310px, 1fr)); gap:20px; margin:24px 0;">
      ${catalog.map(p => `
        <div class="panel" style="display:flex; flex-direction:column; justify-content:space-between; position:relative; overflow:hidden; border:1.5px solid #e2e8f0; transition:all 0.2s ease;">
          <div style="padding:22px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
              <span style="font-size:36px; padding:8px; border-radius:12px; background:#eff6ff; display:inline-block;">${p.icon}</span>
              <span class="badge badge-active" style="font-size:10px; font-weight:800; padding:4px 8px;">${p.badge}</span>
            </div>

            <div style="font-size:11.5px; font-weight:700; color:#2563eb; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px;">
              ${p.category}
            </div>
            <h3 style="margin:0 0 8px; font-family:var(--font-display); font-size:17px; font-weight:800; color:#0f172a;">
              ${p.name}
            </h3>
            <p style="font-size:12.5px; color:#64748b; line-height:1.5; margin:0 0 16px;">
              ${p.description}
            </p>

            <ul style="padding-left:18px; margin:0 0 20px; font-size:12px; color:#334155; line-height:1.7;">
              ${p.features.map(f => `<li>${f}</li>`).join('')}
            </ul>

            <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:6px;">
              <span style="font-family:var(--font-display); font-size:26px; font-weight:900; color:#0f172a;">₹${p.price}</span>
              <span style="font-size:14px; color:#94a3b8; text-decoration:line-through;">₹${p.mrp}</span>
              <span class="badge badge-showroom-stock" style="font-size:10.5px; font-weight:800;">${p.discountPercent}% OFF</span>
            </div>
            <small style="display:block; font-size:11px; color:#059669; font-weight:600;">✓ FREE Express Shipping • Taxes Included</small>
          </div>

          <div style="padding:16px 22px; background:#f8fafc; border-top:1px solid #e2e8f0;">
            <button class="btn primary full btn-buy-product" data-sku="${p.sku}" data-name="${esc(p.name)}" data-price="${p.price}" style="padding:11px; font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:8px;">
              Create Order Request →
            </button>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Self-Activation Instructions Box -->
    <section class="panel" style="margin-top:20px;">
      <div class="panel-heading">
        <div>
          <h3>📬 Doorstep Delivery & 4-Step Self-Activation Guide</h3>
          <p>How it works once your package arrives at your home address:</p>
        </div>
      </div>
      <div style="padding:22px; display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px;">
        <div style="padding:16px; border-radius:10px; background:#f8fafc; border:1px solid #e2e8f0;">
          <b style="color:#2563eb; font-size:14px; display:block; margin-bottom:4px;">1. Order & Receive</b>
          <p style="font-size:12px; color:#64748b; margin:0; line-height:1.5;">Official tamper-proof physical QR decals delivered to your doorstep in 3-4 days.</p>
        </div>
        <div style="padding:16px; border-radius:10px; background:#f8fafc; border:1px solid #e2e8f0;">
          <b style="color:#2563eb; font-size:14px; display:block; margin-bottom:4px;">2. Peel & Affix</b>
          <p style="font-size:12px; color:#64748b; margin:0; line-height:1.5;">Peel the 3M high-bond adhesive liner and attach to your vehicle windshield or visor.</p>
        </div>
        <div style="padding:16px; border-radius:10px; background:#f8fafc; border:1px solid #e2e8f0;">
          <b style="color:#2563eb; font-size:14px; display:block; margin-bottom:4px;">3. Phone Camera Scan</b>
          <p style="font-size:12px; color:#64748b; margin:0; line-height:1.5;">Scan the sticker with any smartphone camera. Log in securely with instant SMS OTP.</p>
        </div>
        <div style="padding:16px; border-radius:10px; background:#f8fafc; border:1px solid #e2e8f0;">
          <b style="color:#059669; font-size:14px; display:block; margin-bottom:4px;">4. Bind & Protect</b>
          <p style="font-size:12px; color:#64748b; margin:0; line-height:1.5;">Enter vehicle registration number. Decal activates instantly with masked calling!</p>
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll('.btn-buy-product').forEach(btn => {
    btn.addEventListener('click', () => {
      checkoutStoreModal(btn.dataset.sku, btn.dataset.name, Number(btn.dataset.price));
    });
  });
}

function checkoutStoreModal(sku, name, price) {
  const root = document.querySelector('#modal-root');

  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card" style="max-width:540px; max-height:92vh; overflow-y:auto;">
        <button class="modal-close" data-close>×</button>
        <span class="eyebrow" style="color:#2563eb;">SECURE DOORSTEP CHECKOUT</span>
        <h2>Order SmartO Decal Pack</h2>
        <p class="muted">Ordering <b>${esc(name)}</b> for <b>₹${price}</b> (FREE Shipping).</p>

        <form id="store-checkout-form">
          <input type="hidden" name="productSku" value="${esc(sku)}">
          <input type="hidden" name="price" value="${price}">

          <label>
            Full Delivery Name
            <input name="customerName" value="${esc(state.user?.name || '')}" placeholder="e.g. Rahul Sharma" required maxlength="80">
          </label>

          <label>
            Mobile Phone Number (For SMS OTP & Courier Updates)
            <input name="customerPhone" type="tel" value="${esc(state.user?.phone || '')}" placeholder="e.g. +91 98765 43210" required maxlength="20">
          </label>

          <label>
            Delivery Street Address
            <textarea name="address" rows="2" placeholder="House/Flat No., Street, Landmark..." required></textarea>
          </label>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <label>
              City / District
              <input name="city" value="Patna" required placeholder="e.g. Patna, Muzaffarpur">
            </label>
            <label>
              State
              <select name="state">
                <option value="Bihar" selected>Bihar</option>
                <option value="Uttar Pradesh">Uttar Pradesh</option>
                <option value="Jharkhand">Jharkhand</option>
                <option value="Delhi NCR">Delhi NCR</option>
                <option value="West Bengal">West Bengal</option>
              </select>
            </label>
          </div>

          <label>
            Postal PIN Code
            <input name="pincode" maxlength="6" placeholder="e.g. 800001" required style="font-family:var(--font-mono); font-weight:700;">
          </label>

          <!-- No payment provider is connected yet. -->
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px; margin:16px 0;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <b style="font-size:12.5px; color:#0f172a;">Order request only</b>
              <span class="badge badge-pending-activation" style="font-size:10px;">PAYMENT PENDING</span>
            </div>
            <p style="font-size:12px; color:#475569; line-height:1.5; margin:0 0 10px;">Submitting creates a draft. No payment is collected and no stock or courier is assigned until an administrator confirms it.</p>

            <div style="display:flex; justify-content:space-between; font-size:12.5px; color:#475569; padding-top:8px; border-top:1px dashed #cbd5e1;">
              <span>Draft order amount:</span>
              <b style="color:#0f172a; font-size:14px;">₹${price}</b>
            </div>
          </div>

          <div id="checkout-error" class="form-error"></div>

          <div class="modal-actions">
            <button class="btn secondary" type="button" data-close>Cancel</button>
            <button class="btn primary" type="submit" id="btn-submit-order" style="padding:11px 20px;">
              Create Draft Order →
            </button>
          </div>
        </form>
      </section>
    </div>
  `;

  root.querySelectorAll('[data-close]').forEach(b => b.onclick = () => root.innerHTML = '');
  root.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) root.innerHTML = '';
  };

  root.querySelector('#store-checkout-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const errBox = root.querySelector('#checkout-error');
    errBox.textContent = '';
    const btn = root.querySelector('#btn-submit-order');
    btn.disabled = true;
    btn.textContent = 'Creating order draft...';

    try {
      const res = await post('/api/store/order', {
        productSku: fd.get('productSku'),
        customerName: fd.get('customerName'),
        customerPhone: fd.get('customerPhone'),
        address: fd.get('address'),
        city: fd.get('city'),
        state: fd.get('state'),
        pincode: fd.get('pincode'),
        quantity: 1
      });

      // Show Order Success Screen
      root.innerHTML = `
        <div class="modal-backdrop">
          <section class="modal-card" style="max-width:520px; text-align:center;">
            <button class="modal-close" data-close>×</button>
            <div style="width:60px; height:60px; border-radius:50%; background:#ecfdf5; border:1.5px solid #a7f3d0; color:#059669; font-size:28px; display:grid; place-items:center; margin:0 auto 14px;">
              ✓
            </div>
            <span class="eyebrow" style="color:#059669;">ORDER DRAFT CREATED</span>
            <h2>Thank you, ${esc(res.customerName)}!</h2>
            <p class="muted">Your request is recorded. No payment was collected and no stock or courier has been assigned yet.</p>

            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin:18px 0; text-align:left;">
              <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:12.5px;">
                <span style="color:#64748b;">Order Reference:</span>
                <code class="mono" style="font-weight:700;">${esc(res.orderId)}</code>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:12.5px;">
                <span style="color:#64748b;">Payment status:</span>
                <code class="mono" style="font-weight:700; color:#d97706;">${esc(res.paymentStatus)}</code>
              </div>
              <div style="display:flex; justify-content:space-between; font-size:12.5px;">
                <span style="color:#64748b;">Order status:</span>
                <b>${esc(res.orderStatus)}</b>
              </div>
            </div>

            <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:14px; margin-bottom:20px; text-align:left; font-size:12px; color:#1e3a8a; line-height:1.5;">
              <b>Next step:</b> An administrator must confirm payment, allocate inventory, and arrange dispatch before this order can progress.
            </div>

            <button class="btn primary full" data-close>Done & Return to Store</button>
          </section>
        </div>
      `;
      root.querySelectorAll('[data-close]').forEach(b => b.onclick = () => root.innerHTML = '');
    } catch (err) {
      errBox.textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Create Draft Order →';
    }
  };
}

/* ==========================================================================
   Owner Portal Experience (/owner)
   ========================================================================== */
async function renderOwner() {
  const data = await api('/api/owner/home');

  app.innerHTML = `
    <div class="owner-shell">
      <header class="owner-top">
        <a class="brand" href="/owner" style="display:inline-block; text-decoration:none;">
          ${smartOLogoSvg({ width: 170, height: 46, mode: 'dark' })}
        </a>
        <div style="display:flex; align-items:center; gap:12px;">
          <span class="verified-shield">🛡️ PRIVATE VEHICLE SPACE</span>
          <button class="btn secondary tiny" id="owner-edit-profile" title="Edit Profile & Phone" style="display:inline-flex; align-items:center; gap:6px;">
            <span class="avatar" style="width:24px; height:24px; font-size:11px;">${initials(state.user.name)}</span>
            <span>${esc(state.user.name.split(' ')[0])}</span>
            <small style="color:var(--text-secondary); font-size:10.5px;">(${esc(state.user.phone || 'Phone')})</small>
          </button>
          <button class="btn secondary tiny" id="owner-logout">Sign out</button>
        </div>
      </header>

      <main class="owner-content">
        <div class="owner-welcome">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
            <div>
              <span class="eyebrow" style="color:var(--cyan-400); font-weight:800; font-size:11px;">SECURE OWNER HUB</span>
              <h1>Welcome, ${esc(state.user.name.split(' ')[0])}.</h1>
              <p>Your vehicles and incoming bystander scan messages, guarded with absolute privacy.</p>
            </div>
            <a href="/store" class="btn secondary tiny" style="color:#38bdf8; border-color:rgba(56, 189, 248, 0.3);">
              🛍️ Order More Decals (Online Store) ↗
            </a>
          </div>
        </div>

        <div class="owner-stats">
          <div>
            <b>${data.vehicles.length}</b>
            <span>Linked Vehicles</span>
          </div>
          <div>
            <b style="color:var(--emerald-400);">${data.vehicles.filter(x => x.qr_status === 'ACTIVE').length}</b>
            <span>Active Safety QRs</span>
          </div>
          <div>
            <b style="color:var(--cyan-400);">${data.messages.filter(x => x.status !== 'CLOSED').length}</b>
            <span>Open Citizen Requests</span>
          </div>
        </div>

        <div class="owner-grid">
          <section class="panel">
            <div class="panel-heading">
              <div>
                <h3>Your Registered Vehicles</h3>
                <p>Linked vehicles and QR decal status</p>
              </div>
            </div>
            <div>
              ${data.vehicles.map(v => {
                const isTemp = (v.registration || '').startsWith('TEMP-');
                return `
                  <article class="vehicle-card" style="display:flex; flex-direction:column; gap:12px; padding:18px; border-bottom:1px solid var(--slate-100);">
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:16px;">
                      <div style="display:flex; align-items:flex-start; gap:14px;">
                        <div class="vehicle-avatar" style="font-size:26px;">${v.category === 'Car' ? '🚘' : '🏍️'}</div>
                        <div>
                          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <b style="font-size:15px; color:var(--navy-950);">${esc(v.make)} ${esc(v.model)}</b>
                            ${badge(v.qr_status || 'PENDING ACTIVATION')}
                            ${isTemp ? `
                              <span class="badge" style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; font-weight:800; font-size:10px;">
                                ⚠️ RTO PLATE PENDING (5-7 DAYS)
                              </span>
                            ` : ''}
                          </div>

                          <div style="margin-top:3px; font-size:12.5px; color:var(--slate-600);">
                            Registration Plate: <b style="font-family:var(--font-mono); color:${isTemp ? '#d97706' : 'var(--navy-950)'}; font-size:13px;">${esc(v.registration)}</b>
                            ${v.color ? ` • ${esc(v.color)}` : ''}
                          </div>

                          ${v.chassis_number ? `
                            <div style="font-size:11px; color:var(--slate-500); font-family:var(--font-mono); margin-top:2px;">
                              VIN / Chassis: <b>${esc(v.chassis_number)}</b>
                              ${v.engine_number ? ` • Engine: <b>${esc(v.engine_number)}</b>` : ''}
                            </div>
                          ` : ''}

                          ${v.emergency_contact ? `
                            <div style="font-size:11px; color:#059669; font-weight:600; margin-top:3px;">
                              📞 Emergency Alternate: ${esc(v.emergency_contact)}
                            </div>
                          ` : ''}

                          <div style="font-family:var(--font-mono); font-size:11px; color:var(--cyan-400); margin-top:4px;">
                            SmartO Decal ID: <b>${esc(v.qr_id || 'Not linked')}</b>
                          </div>
                        </div>
                      </div>

                      ${v.qr_id ? `
                        <button class="btn tiny secondary" data-owner-sticker="${esc(v.qr_id)}" data-owner-token="${esc(v.public_token || '')}" data-owner-reg="${esc(v.registration || '')}">
                          🏷️ View Decal
                        </button>
                      ` : ''}
                    </div>

                    ${isTemp ? `
                      <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:8px; padding:10px 12px; font-size:12px; color:#92400e; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
                        <div>
                          🔔 <b>New Vehicle Delivery Pass:</b> Fitted at showroom with temporary reference. Received your permanent HSRP number plate? Click update.
                        </div>
                        <button class="btn primary tiny btn-owner-edit-veh" data-veh-id="${esc(v.id)}" style="flex-shrink:0;">
                          ✏️ Update to Permanent Plate
                        </button>
                      </div>
                    ` : ''}

                    <div style="display:flex; align-items:center; gap:8px; border-top:1px solid #f8fafc; padding-top:10px; margin-top:2px; flex-wrap:wrap;">
                      ${!isTemp ? `
                        <button class="btn tiny secondary btn-owner-edit-veh" data-veh-id="${esc(v.id)}" style="font-size:11px; padding:4px 10px;">
                          ✏️ Edit Vehicle & Contacts
                        </button>
                      ` : ''}
                      <button class="btn tiny secondary btn-owner-lost-veh" data-veh-id="${esc(v.id)}" data-reg="${esc(v.registration)}" data-qr-id="${esc(v.qr_id || '')}" style="font-size:11px; padding:4px 10px; color:#b91c1c;">
                        ⚠️ Sticker Lost / Damaged?
                      </button>
                    </div>
                  </article>
                `;
              }).join('') || '<div style="padding:24px; text-align:center; color:var(--slate-400);">No vehicles linked to this account yet.</div>'}
            </div>
          </section>

          <section class="panel">
            <div class="panel-heading">
              <div>
                <h3>Recent Citizen Alerts</h3>
                <p>Private messages received from QR scans</p>
              </div>
            </div>
            <div style="padding:6px 0;">
              ${data.messages.map(m => `
                <article style="padding:16px 20px; border-bottom:1px solid var(--slate-100); display:flex; gap:14px; align-items:flex-start;">
                  <span style="font-size:22px; padding:4px;">${m.category.includes('Emergency') ? '🚨' : m.category.includes('Parking') ? '🚗' : '✉️'}</span>
                  <div style="flex:1;">
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                      <b style="font-size:13px; color:var(--navy-950);">${esc(m.category)}</b>
                      ${badge(m.status)}
                    </div>
                    <p style="margin:4px 0 8px; font-size:13px; color:var(--slate-700); line-height:1.5;">${esc(m.note)}</p>
                    
                    ${m.photo_data ? `
                      <div style="margin:8px 0;">
                        <button class="btn tiny secondary" style="padding:3px 10px; font-size:11px; font-weight:700;" data-owner-photo="${esc(m.id)}">
                          📷 View Attached Photo Proof
                        </button>
                      </div>
                    ` : ''}

                    <div style="display:flex; align-items:center; justify-content:space-between; margin-top:4px;">
                      <small style="color:var(--slate-400);">${esc(m.visitor_name || 'Nearby Citizen')} • ${date(m.created_at)}</small>
                      <span class="badge" style="font-size:9px; padding:2px 6px; background:var(--blue-50); color:var(--blue-600);">📡 ${esc(m.notification_status || 'DELIVERED')}</span>
                    </div>
                  </div>
                </article>
              `).join('') || '<div style="padding:24px; text-align:center; color:var(--slate-400);">No one has contacted your vehicle recently. You are all clear!</div>'}
            </div>
          </section>
        </div>

        <div class="scan-privacy-shield" style="margin-top:28px;">
          <span>🔒</span>
          <span><b>Privacy Guarantee:</b> Bystanders can send alerts and resolve parking/emergency situations, but your phone number and home address are never revealed.</span>
        </div>
      </main>
      <div id="modal-root"></div>
    </div>
  `;

  // Attach Owner Event Listeners
  document.querySelectorAll('[data-owner-photo]').forEach(b => {
    b.onclick = () => {
      const item = data.messages.find(z => z.id === b.dataset.ownerPhoto);
      if (item && item.photo_data) {
        showPhotoModal(item.photo_data, item.category, item.registration || item.qr_id);
      }
    };
  });

  document.querySelectorAll('[data-owner-sticker]').forEach(b => {
    b.onclick = () => showStickerModal(b.dataset.ownerSticker, b.dataset.ownerToken, b.dataset.ownerReg);
  });

  document.querySelectorAll('.btn-owner-edit-veh').forEach(b => {
    b.onclick = () => {
      const veh = data.vehicles.find(v => v.id === b.dataset.vehId);
      if (veh) ownerUpdateVehicleModal(veh);
    };
  });

  document.querySelectorAll('.btn-owner-lost-veh').forEach(b => {
    b.onclick = () => {
      const veh = data.vehicles.find(v => v.id === b.dataset.vehId);
      if (veh) ownerLostDecalModal(veh);
    };
  });

  document.querySelector('#owner-edit-profile')?.addEventListener('click', () => {
    ownerProfileModal();
  });

  document.querySelector('#owner-logout').onclick = async () => {
    await post('/api/logout', {});
    location.href = '/';
  };
}

/* --------------------------------------------------------------------------
   Owner Modal: Update Vehicle & Permanent Number Plate
   -------------------------------------------------------------------------- */
function ownerUpdateVehicleModal(v) {
  const root = document.querySelector('#modal-root');
  const isTemp = (v.registration || '').startsWith('TEMP-');

  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card" style="max-width:520px; max-height:92vh; overflow-y:auto;">
        <button class="modal-close" data-close>×</button>
        <span class="eyebrow" style="color:#2563eb;">VEHICLE IDENTITY MANAGEMENT</span>
        <h2>${isTemp ? 'Update Permanent Number Plate' : 'Edit Vehicle Details'}</h2>
        <p class="muted">
          ${isTemp 
            ? 'Enter your official permanent HSRP registration plate issued by RTO to replace your temporary delivery pass.' 
            : 'Keep your vehicle identification and emergency safety numbers up to date.'}
        </p>

        <form id="owner-update-veh-form">
          <label>
            Registration Number Plate <span style="color:#ef4444;">*</span>
            <input name="registration" id="modal-owner-reg" value="${isTemp ? '' : esc(v.registration)}" placeholder="e.g. BR01CZ9988 or DL01AB1234" required maxlength="16" style="text-transform:uppercase; font-family:var(--font-mono); font-weight:700;">
            <small style="font-size:11px; color:#64748b; display:block; margin-top:3px;">
              ${isTemp ? `Current delivery reference is: ${esc(v.registration)}. Enter your new permanent plate.` : 'Enter official registration plate without spaces or hyphens.'}
            </small>
          </label>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <label>
              Chassis Number (VIN)
              <input name="chassisNumber" value="${esc(v.chassis_number || '')}" placeholder="e.g. MA3EWB41S..." maxlength="25" style="text-transform:uppercase; font-family:var(--font-mono);">
            </label>
            <label>
              Engine Number
              <input name="engineNumber" value="${esc(v.engine_number || '')}" placeholder="e.g. K12MN-88..." maxlength="25" style="text-transform:uppercase; font-family:var(--font-mono);">
            </label>
          </div>

          <label>
            Emergency Alternate Phone (Spouse / Family Contact)
            <input name="emergencyContact" value="${esc(v.emergency_contact || '')}" placeholder="e.g. +91 98111 22334" maxlength="20">
          </label>

          <label>
            Vehicle Exterior Color
            <input name="color" value="${esc(v.color || '')}" placeholder="e.g. Magma Grey" maxlength="30">
          </label>

          <div id="owner-update-veh-error" class="form-error"></div>

          <div class="modal-actions" style="margin-top:20px;">
            <button class="btn secondary" type="button" data-close>Cancel</button>
            <button class="btn primary" type="submit" id="btn-save-veh-update" style="padding:10px 18px;">
              ✓ Save Registration Details
            </button>
          </div>
        </form>
      </section>
    </div>
  `;

  const closeModal = () => { root.innerHTML = ''; };
  root.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  root.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  };

  root.querySelector('#owner-update-veh-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const errBox = root.querySelector('#owner-update-veh-error');
    errBox.textContent = '';
    const btn = root.querySelector('#btn-save-veh-update');
    btn.disabled = true;
    btn.textContent = 'Saving vehicle identity...';

    try {
      const res = await api(`/api/owner/vehicle/${encodeURIComponent(v.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration: fd.get('registration'),
          chassisNumber: fd.get('chassisNumber'),
          engineNumber: fd.get('engineNumber'),
          emergencyContact: fd.get('emergencyContact'),
          color: fd.get('color')
        })
      });

      closeModal();
      toast(`✓ Vehicle updated! Permanent plate set to ${res.registration}.`, 'success');
      renderOwner();
    } catch (err) {
      errBox.textContent = err.message;
      btn.disabled = false;
      btn.textContent = '✓ Save Registration Details';
    }
  };
}

/* --------------------------------------------------------------------------
   Owner Modal: Lost, Damaged, or Peeled Decal Replacement / Rebind
   -------------------------------------------------------------------------- */
function ownerLostDecalModal(v) {
  const root = document.querySelector('#modal-root');

  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card" style="max-width:560px; max-height:92vh; overflow-y:auto;">
        <button class="modal-close" data-close>×</button>
        <span class="eyebrow" style="color:#ef4444;">SECURITY & REPLACEMENT</span>
        <h2>Sticker Lost, Damaged or Peeled?</h2>
        <p class="muted">Protect your vehicle <b>${esc(v.registration)}</b> and restore active SmartO safety coverage.</p>

        <!-- Mode selection tabs -->
        <div style="display:flex; gap:10px; margin-bottom:16px; border-bottom:1px solid #e2e8f0; padding-bottom:12px;">
          <button type="button" id="tab-btn-replace" class="btn primary tiny" style="flex:1;">📦 Order Home Replacement (₹149)</button>
          <button type="button" id="tab-btn-rebind" class="btn secondary tiny" style="flex:1;">🔄 Rebind to New Sticker</button>
        </div>

        <!-- Section 1: Order replacement sticker -->
        <div id="sect-replacement">
          <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:10px; padding:12px; margin-bottom:14px; font-size:12px; color:#92400e;">
            🛡️ <b>Security Safeguard:</b> Old decal (<b>${esc(v.qr_id || 'Current Decal')}</b>) will be immediately deactivated and blocked so that nobody can misuse it.
          </div>

          <form id="owner-replace-form">
            <label>
              Reason for Replacement
              <select name="reason" required>
                <option value="DAMAGED">Damaged / Weathered / Scratched</option>
                <option value="PEELED">Peeled off from Windshield</option>
                <option value="STOLEN">Stolen / Tampered by Third Party</option>
                <option value="WINDSHIELD_REPLACED">Windshield Replaced / Vehicle Repainted</option>
              </select>
            </label>

            <label style="display:flex; align-items:center; gap:8px; margin:10px 0; cursor:pointer;">
              <input type="checkbox" name="blockOldSticker" value="1" checked style="width:16px; height:16px; accent-color:#ef4444;">
              <span style="font-size:12px; font-weight:700; color:#b91c1c;">Block old decal immediately to prevent unauthorized alerts</span>
            </label>

            <div style="border-top:1px solid #e2e8f0; padding-top:12px; margin-top:12px;">
              <b style="display:block; font-size:13px; color:#0f172a; margin-bottom:8px;">Doorstep Courier Delivery Address</b>
              <label>
                Full Delivery Street Address
                <input name="address" placeholder="Flat / House No., Building, Street" required>
              </label>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <label>
                  City
                  <input name="city" placeholder="e.g. Patna" required>
                </label>
                <label>
                  PIN Code
                  <input name="pincode" placeholder="e.g. 800001" required maxlength="6">
                </label>
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; background:#f8fafc; padding:12px 16px; border-radius:10px; margin-top:14px; border:1px solid #e2e8f0;">
              <div>
                <span style="font-size:11px; color:#64748b; text-transform:uppercase; font-weight:700;">Nominal Replacement Fee</span>
                <b style="display:block; font-size:18px; color:#0f172a;">₹149 <small style="font-size:11px; color:#059669; font-weight:600;">(FREE Courier Delivery)</small></b>
              </div>
              <button class="btn primary" type="submit" id="btn-submit-replace" style="background:linear-gradient(135deg, #059669 0%, #10b981 100%); border:none; padding:10px 18px;">
                Reserve Replacement →
              </button>
            </div>
            <div id="owner-replace-error" class="form-error"></div>
          </form>
        </div>

        <!-- Section 2: Rebind to already acquired sticker -->
        <div id="sect-rebind" style="display:none;">
          <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:12px; margin-bottom:14px; font-size:12px; color:#1e40af;">
            Enter the serial number reserved for this replacement request. Unallocated stickers cannot be bound to <b>${esc(v.registration)}</b>.
          </div>

          <form id="owner-rebind-form">
            <label>
              New Serialized QR Decal ID
              <input name="newQrCode" placeholder="e.g. SV-BR-00000140 or paste scan link" required style="font-family:var(--font-mono); font-weight:700;">
            </label>
            <div id="owner-rebind-error" class="form-error"></div>
            <div class="modal-actions" style="margin-top:20px;">
              <button class="btn secondary" type="button" data-close>Cancel</button>
              <button class="btn primary" type="submit" id="btn-submit-rebind" style="padding:10px 18px;">
                ✓ Re-bind Decal Instantly
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  `;

  const closeModal = () => { root.innerHTML = ''; };
  root.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  root.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  };

  const btnReplace = root.querySelector('#tab-btn-replace');
  const btnRebind = root.querySelector('#tab-btn-rebind');
  const sectReplace = root.querySelector('#sect-replacement');
  const sectRebind = root.querySelector('#sect-rebind');

  btnReplace.onclick = () => {
    btnReplace.className = 'btn primary tiny';
    btnRebind.className = 'btn secondary tiny';
    sectReplace.style.display = 'block';
    sectRebind.style.display = 'none';
  };

  btnRebind.onclick = () => {
    btnRebind.className = 'btn primary tiny';
    btnReplace.className = 'btn secondary tiny';
    sectRebind.style.display = 'block';
    sectReplace.style.display = 'none';
  };

  // Replacement Form Submit
  root.querySelector('#owner-replace-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const errBox = root.querySelector('#owner-replace-error');
    errBox.textContent = '';
    const btn = root.querySelector('#btn-submit-replace');
    btn.disabled = true;
    btn.textContent = 'Reserving replacement stock...';

    try {
      const res = await post('/api/owner/replacement', {
        vehicleId: v.id,
        reason: fd.get('reason'),
        blockOldSticker: fd.get('blockOldSticker') === '1',
        address: fd.get('address'),
        city: fd.get('city'),
        pincode: fd.get('pincode')
      });

      closeModal();
      toast(`✓ Replacement reserved. Request: ${res.trackingAwb}. Payment and dispatch are still pending.`, 'success');
      renderOwner();
    } catch (err) {
      errBox.textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Reserve Replacement →';
    }
  };

  // Rebind Form Submit
  root.querySelector('#owner-rebind-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const errBox = root.querySelector('#owner-rebind-error');
    errBox.textContent = '';
    const btn = root.querySelector('#btn-submit-rebind');
    btn.disabled = true;
    btn.textContent = 'Re-binding QR decal...';

    try {
      const res = await post('/api/owner/rebind', {
        vehicleId: v.id,
        qrCode: fd.get('newQrCode')
      });

      closeModal();
      toast(`✓ Successfully bound new QR decal ${res.qrId} to ${res.registration}!`, 'success');
      renderOwner();
    } catch (err) {
      errBox.textContent = err.message;
      btn.disabled = false;
      btn.textContent = '✓ Re-bind Decal Instantly';
    }
  };
}

/* --------------------------------------------------------------------------
   Owner Modal: Update Profile (Name & Mobile Phone)
   -------------------------------------------------------------------------- */
function ownerProfileModal() {
  const root = document.querySelector('#modal-root');

  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card" style="max-width:460px;">
        <button class="modal-close" data-close>×</button>
        <span class="eyebrow" style="color:#2563eb;">ACCOUNT PROFILE</span>
        <h2>Edit Owner Profile</h2>
        <p class="muted">Update your contact details for citizen alert notifications and masked telephony.</p>

        <form id="owner-profile-form">
          <label>
            Full Name <span style="color:#ef4444;">*</span>
            <input name="name" value="${esc(state.user.name)}" required maxlength="80">
          </label>
          <label>
            Mobile Number (Receives OTP & Bystander Call Relays) <span style="color:#ef4444;">*</span>
            <input name="phone" value="${esc(state.user.phone || '')}" placeholder="e.g. +91 98765 43210" required maxlength="20">
          </label>
          <div id="owner-profile-error" class="form-error"></div>
          <div class="modal-actions" style="margin-top:20px;">
            <button class="btn secondary" type="button" data-close>Cancel</button>
            <button class="btn primary" type="submit" id="btn-submit-profile">
              ✓ Save Profile
            </button>
          </div>
        </form>
      </section>
    </div>
  `;

  const closeModal = () => { root.innerHTML = ''; };
  root.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  root.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  };

  root.querySelector('#owner-profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const errBox = root.querySelector('#owner-profile-error');
    errBox.textContent = '';
    const btn = root.querySelector('#btn-submit-profile');
    btn.disabled = true;

    try {
      const res = await api('/api/owner/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fd.get('name'),
          phone: fd.get('phone')
        })
      });

      state.user.name = res.name;
      state.user.phone = res.phone;
      closeModal();
      toast('✓ Profile and contact number updated successfully!', 'success');
      renderOwner();
    } catch (err) {
      errBox.textContent = err.message;
      btn.disabled = false;
    }
  };
}

/* ==========================================================================
   Public Citizen Scan Page (/scan/:token)
   ========================================================================== */
async function renderScan() {
  const tokenVal = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
  let qr;
  try {
    qr = await api(`/api/scan/${encodeURIComponent(tokenVal)}`);
  } catch {
    qr = { active: false };
  }

  const t = i18n[state.lang];

  if (!qr.active) {
    app.innerHTML = `
      <main class="scan-page">
        <header class="scan-brand">
          <div class="brand-svg-wrap">
            ${smartOLogoSvg({ width: 170, height: 46, mode: 'dark' })}
          </div>
          <div class="lang-switch">
            <button class="lang-btn ${state.lang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
            <button class="lang-btn ${state.lang === 'hi' ? 'active' : ''}" data-lang="hi">हिंदी</button>
          </div>
        </header>

        <section style="max-width:480px; margin:12vh auto 0; text-align:center; background:rgba(13, 24, 48, 0.85); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.1); padding:40px 28px; border-radius:24px; box-shadow:var(--shadow-xl);">
          <div style="width:60px; height:60px; border-radius:50%; background:rgba(245, 158, 11, 0.15); border:1px solid rgba(245, 158, 11, 0.3); color:#fbbf24; display:grid; place-items:center; font-size:26px; margin:0 auto 16px;">
            ⚠️
          </div>
          <span class="eyebrow" style="color:var(--cyan-400); font-weight:800; font-size:11px;">SMARTO SECURE ID</span>
          <h1 style="font-family:var(--font-display); font-size:24px; font-weight:800; margin:10px 0; color:#ffffff;">${t.inactiveTitle}</h1>
          <p style="font-size:13px; color:var(--text-secondary); line-height:1.6; margin:0 0 24px;">${t.inactiveMsg}</p>
          <a href="/" class="btn secondary">Learn about SmartO Platform ↗</a>
        </section>

        <footer style="text-align:center; font-size:11px; color:var(--text-muted); margin-top:40px;">
          SMARTO INNOVATIONS • PRIVACY-FIRST VEHICLE PROTECTION
        </footer>
      </main>
    `;

    document.querySelectorAll('[data-lang]').forEach(b => {
      b.onclick = () => {
        state.lang = b.dataset.lang;
        renderScan();
      };
    });
    return;
  }

  app.innerHTML = `
    <main class="scan-page">
      <header class="scan-brand">
        <div class="brand-svg-wrap">
          ${smartOLogoSvg({ width: 170, height: 46, mode: 'dark' })}
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="lang-switch">
            <button class="lang-btn ${state.lang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
            <button class="lang-btn ${state.lang === 'hi' ? 'active' : ''}" data-lang="hi">हिंदी</button>
          </div>
        </div>
      </header>

      <div class="scan-container">
        <div class="scan-intro">
          <span class="eyebrow" style="color:var(--cyan-400); font-weight:800; font-size:11px; letter-spacing:0.12em;">PRIVACY-SHIELDED VEHICLE GATEWAY</span>
          <h1>${t.scanTitle}</h1>
          <p>${t.scanSubtitle}</p>
        </div>

        <section class="scan-vehicle-card">
          <div class="vehicle-shield">
            ${qr.vehicle?.category === 'Car' ? '🚘' : '🏍️'}
          </div>
          <div class="scan-vehicle-info">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="eyebrow">${t.registeredVehicle}</span>
              <span class="verified-shield">✓ VERIFIED</span>
            </div>
            <h2>${esc(qr.vehicle?.make || 'Vehicle')} ${esc(qr.vehicle?.model || '')}</h2>
        </section>

        <!-- FAST COMMUNICATION ACTIONS: MASKED VOICE CALL & WHATSAPP ALERT -->
        <section class="scan-fast-actions" style="margin:16px 0 20px; display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <!-- Masked Call Action -->
          <button type="button" class="btn" id="btn-masked-call" style="background:linear-gradient(135deg, #059669 0%, #10b981 100%); color:#ffffff; border:none; padding:14px 16px; border-radius:14px; font-weight:800; font-size:13.5px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; box-shadow:0 8px 20px rgba(16, 185, 129, 0.35); cursor:pointer;">
            <span style="font-size:20px;">📞 Private Masked Call</span>
            <small style="font-size:10.5px; opacity:0.95; font-weight:500;">Zero Number Exposure • Telephony Bridge</small>
          </button>

          <!-- WhatsApp Alert Action -->
          <button type="button" class="btn" id="btn-whatsapp-alert" style="background:linear-gradient(135deg, #15803d 0%, #22c55e 100%); color:#ffffff; border:none; padding:14px 16px; border-radius:14px; font-weight:800; font-size:13.5px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; box-shadow:0 8px 20px rgba(34, 197, 94, 0.35); cursor:pointer;">
            <span style="font-size:20px;">💬 WhatsApp Alert</span>
            <small style="font-size:10.5px; opacity:0.95; font-weight:500;">Direct Notification to Vehicle Owner</small>
          </button>
        </section>

        <form id="scan-form" class="scan-form">
          <div class="form-heading">
            <span class="step-number">1</span>
            <div>
              <b style="font-size:14px; color:#ffffff;">${t.selectReason}</b>
              <small style="color:var(--text-secondary);">${t.selectReasonSub}</small>
            </div>
          </div>

          <div class="reason-grid">
            ${t.reasons.map((r, i) => `
              <label class="reason-option ${r.id.includes('Emergency') ? 'emergency' : ''}">
                <input type="radio" name="category" value="${esc(r.id)}" ${i === 0 ? 'checked' : ''} required>
                <span class="reason-icon">${r.icon}</span>
                <span class="reason-label">${esc(r.label)}</span>
              </label>
            `).join('')}
          </div>

          <label>
            ${t.messageLabel}
            <textarea name="note" id="scan-note" rows="3" minlength="4" maxlength="1000" placeholder="${t.messagePlaceholder}" required></textarea>
            <div style="display:flex; justify-content:space-between; margin-top:4px;">
              <span style="font-size:11px; color:var(--slate-400);">Min 4 characters</span>
              <span id="char-count" style="font-size:11px; color:var(--slate-400);">0 / 1000</span>
            </div>
          </label>

          <div class="scan-optional-grid">
            <label>
              ${t.nameLabel}
              <input name="name" maxlength="80" placeholder="${t.namePlaceholder}">
            </label>
          </div>

          <div class="photo-attach-row">
            <input type="file" id="photo-input" accept="image/*" style="display:none;">
            <button type="button" class="photo-attach-btn" id="photo-btn">
              ${t.attachPhoto}
            </button>
            <div id="photo-preview" class="photo-preview-wrap" style="display:none;">
              <img id="photo-thumb" src="" alt="Photo attachment preview">
              <button type="button" class="photo-remove-btn" id="photo-remove">×</button>
            </div>
          </div>

          <label class="consent-row">
            <input type="checkbox" name="consent" required>
            <span>${t.consent}</span>
          </label>

          <div class="form-error" id="scan-error"></div>

          <button class="btn primary full" type="submit" style="padding:14px; font-size:15px; margin-top:8px;">
            ${t.submitBtn}
          </button>

          <p style="text-align:center; font-size:11px; color:var(--amber-600); margin:14px 0 0; line-height:1.5;">
            ${t.emergencyDisclaimer}
          </p>
        </form>

        <div class="scan-privacy-shield">
          <span>🛡️</span>
          <span>${t.privacyNote}</span>
        </div>
      </div>

      <footer style="max-width:580px; margin:30px auto 0; text-align:center; font-size:10px; color:var(--slate-400); letter-spacing:0.08em;">
        SMARTO INNOVATIONS • SMART MOBILITY SAFETY PROTOCOL
      </footer>
    </main>
  `;

  document.querySelectorAll('[data-lang]').forEach(b => {
    b.onclick = () => {
      state.lang = b.dataset.lang;
      renderScan();
    };
  });

  const noteInput = document.querySelector('#scan-note');
  const charCounter = document.querySelector('#char-count');
  noteInput?.addEventListener('input', (e) => {
    charCounter.textContent = `${e.target.value.length} / 1000`;
  });

  const photoInput = document.querySelector('#photo-input');
  const photoBtn = document.querySelector('#photo-btn');
  const photoPreview = document.querySelector('#photo-preview');
  const photoThumb = document.querySelector('#photo-thumb');
  const photoRemove = document.querySelector('#photo-remove');

  photoBtn?.addEventListener('click', () => photoInput.click());
  photoInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (re) => {
        photoThumb.src = re.target.result;
        photoPreview.style.display = 'inline-block';
        photoBtn.style.display = 'none';
      };
      reader.readAsDataURL(file);
    }
  });

  photoRemove?.addEventListener('click', () => {
    photoInput.value = '';
    photoThumb.src = '';
    photoPreview.style.display = 'none';
    photoBtn.style.display = 'inline-flex';
  });

  document.querySelector('#scan-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const err = document.querySelector('#scan-error');
    err.textContent = '';
    const photoData = (photoThumb && photoThumb.src && photoThumb.src.startsWith('data:image/')) ? photoThumb.src : null;

    try {
      const result = await post(`/api/scan/${encodeURIComponent(tokenVal)}`, {
        category: fd.get('category'),
        note: fd.get('note'),
        name: fd.get('name'),
        photoData,
        consent: fd.get('consent') === 'on'
      });

      const delivered = ['DELIVERED', 'SIMULATED'].includes(result.notificationStatus);
      const statusTitle = delivered ? t.successTitle : 'Alert Recorded';
      const statusMessage = delivered
        ? t.successMsg
        : 'Your alert is safely recorded in the owner dashboard. External delivery is not currently configured or did not complete.';
      document.querySelector('.scan-container').innerHTML = `
        <section style="background:rgba(13, 24, 48, 0.85); backdrop-filter:blur(20px); border:1px solid rgba(255,255,255,0.1); border-radius:24px; padding:44px 28px; text-align:center; box-shadow:var(--shadow-xl);">
          <div style="width:64px; height:64px; border-radius:50%; background:rgba(16, 185, 129, 0.15); border:1px solid rgba(16, 185, 129, 0.35); color:#34d399; font-size:32px; display:grid; place-items:center; margin:0 auto 16px;">
            ✓
          </div>
          <span class="eyebrow" style="color:var(--emerald-400); font-weight:800; font-size:11px;">${delivered ? 'ALERT DELIVERED' : 'ALERT RECORDED'}</span>
          <h1 style="font-family:var(--font-display); font-size:26px; font-weight:800; color:#ffffff; margin:8px 0;">${statusTitle}</h1>
          <p style="font-size:13px; color:var(--text-secondary); line-height:1.6; max-width:380px; margin:0 auto 20px;">${statusMessage}</p>
          <div style="padding:12px 18px; background:rgba(255,255,255,0.04); border:1px dashed rgba(0, 242, 254, 0.3); border-radius:10px; font-family:var(--font-mono); font-size:13px; font-weight:700; color:var(--cyan-400); max-width:280px; margin:0 auto 24px;">
            REF: ${esc(result.reference)}
          </div>
          <a href="/" class="btn secondary">${t.closePage}</a>
        </section>
      `;
    } catch (x) {
      err.textContent = x.message;
    }
  };

  // Fast Communication: Masked Call
  document.querySelector('#btn-masked-call')?.addEventListener('click', () => {
    maskedCallModal(tokenVal, qr);
  });

  // Fast Communication: WhatsApp Alert
  document.querySelector('#btn-whatsapp-alert')?.addEventListener('click', () => {
    const reg = qr.vehicle?.registration || 'Vehicle';
    const makeModel = `${qr.vehicle?.make || ''} ${qr.vehicle?.model || ''}`.trim() || 'Vehicle';
    const textMsg = `[SmartO Safety Alert] Attention: I am near your vehicle ${makeModel} (Reg: ${reg}). Please check this parking/safety alert securely at: ${location.origin}/scan/${encodeURIComponent(tokenVal)}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(textMsg)}`, '_blank');
  });
}

/* --------------------------------------------------------------------------
   Modal: Bystander Masked Calling Telephony Bridge (500+ Concurrent Scalability)
   -------------------------------------------------------------------------- */
function maskedCallModal(token, qr) {
  let modalWrap = document.querySelector('#masked-call-modal-wrap');
  if (!modalWrap) {
    modalWrap = document.createElement('div');
    modalWrap.id = 'masked-call-modal-wrap';
    document.body.appendChild(modalWrap);
  }

  const vInfo = `${qr.vehicle?.make || ''} ${qr.vehicle?.model || ''} (${qr.vehicle?.registration || 'Vehicle'})`.trim();

  modalWrap.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card" style="max-width:480px; text-align:left;">
        <button class="modal-close" data-close-call>×</button>
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <span style="font-size:22px;">🛡️</span>
          <span class="eyebrow" style="color:#059669; font-weight:800; font-size:11px;">SECURE TELEPHONY BRIDGE</span>
        </div>
        <h2 style="margin:0 0 6px;">Initiate Masked Voice Call</h2>
        <p class="muted" style="margin:0 0 16px; font-size:12.5px; line-height:1.5;">
          Connect directly to the owner of <b>${esc(vInfo)}</b>.
          <br><b style="color:#059669;">Neither your phone number nor the owner's phone number is ever disclosed.</b>
        </p>

        <div id="call-bridge-step-1">
          <form id="masked-call-form">
            <label style="font-size:13px; font-weight:700; color:#0f172a;">
              Your Mobile Number
              <input name="callerPhone" id="masked-caller-phone" placeholder="e.g. +91 98765 43210" required maxlength="16" style="font-size:14px; padding:10px; margin-top:4px;">
              <small style="font-size:11px; color:#64748b; display:block; margin-top:3px;">
                SmartO Cloud PBX will route through a virtual relay number. No real phone numbers are shared.
              </small>
            </label>

            <div id="masked-call-error" class="form-error" style="margin-top:8px;"></div>

            <div class="modal-actions" style="margin-top:16px;">
              <button class="btn secondary" type="button" data-close-call>Cancel</button>
              <button class="btn primary" type="submit" id="btn-submit-masked-call" style="background:linear-gradient(135deg, #059669 0%, #10b981 100%); border:none; padding:10px 18px;">
                📞 Start Masked Call Now
              </button>
            </div>
          </form>
        </div>

        <div id="call-bridge-step-2" style="display:none; text-align:center; padding:10px 0;">
          <div style="width:56px; height:56px; border-radius:50%; background:#ecfdf5; border:2px solid #10b981; color:#059669; display:grid; place-items:center; font-size:26px; margin:0 auto 12px; animation:preloader-dot-pulse 1.5s infinite alternate;">
            📞
          </div>
          <h3 style="color:#065f46; margin:0 0 6px;">Call Bridge Connected!</h3>
          <p style="font-size:12.5px; color:#374151; margin:0 0 16px;">
            SmartO Virtual Relay DID has been assigned for this session.
          </p>

          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px; text-align:left; margin-bottom:18px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:12px;">
              <span style="color:#64748b;">Virtual Relay Bridge:</span>
              <b style="color:#0f172a; font-family:var(--font-mono);" id="call-bridge-did">--</b>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:12px;">
              <span style="color:#64748b;">Target Vehicle Owner:</span>
              <span style="color:#059669; font-weight:700;" id="call-owner-masked">Owner (Masked)</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:12px;">
              <span style="color:#64748b;">Privacy Status:</span>
              <span class="badge" style="background:#dcfce7; color:#166534; font-size:10px; font-weight:700;">100% PRIVATE & ENCRYPTED</span>
            </div>
          </div>

          <div style="display:flex; flex-direction:column; gap:8px;">
            <a id="call-tel-link" href="#" class="btn primary" style="background:#059669; border:none; padding:12px; font-size:14px; font-weight:700; text-decoration:none; display:inline-block;">
              📞 Tap to Dial Virtual Bridge Now
            </a>
            <button class="btn secondary" type="button" data-close-call>Done</button>
          </div>
        </div>
      </section>
    </div>
  `;

  const closeModal = () => { modalWrap.innerHTML = ''; };
  modalWrap.querySelectorAll('[data-close-call]').forEach(b => b.onclick = closeModal);
  modalWrap.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  };

  modalWrap.querySelector('#masked-call-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const errBox = modalWrap.querySelector('#masked-call-error');
    errBox.textContent = '';
    const btn = modalWrap.querySelector('#btn-submit-masked-call');
    btn.disabled = true;
    btn.textContent = 'Allocating virtual telephony relay...';

    try {
      const res = await post(`/api/scan/${encodeURIComponent(token)}/masked-call`, {
        callerPhone: fd.get('callerPhone')
      });

      modalWrap.querySelector('#call-bridge-step-1').style.display = 'none';
      modalWrap.querySelector('#call-bridge-step-2').style.display = 'block';
      modalWrap.querySelector('#call-bridge-did').textContent = res.bridgeNumber;
      modalWrap.querySelector('#call-owner-masked').textContent = res.ownerMasked || 'Owner Protected';
      const telLink = modalWrap.querySelector('#call-tel-link');
      telLink.href = `tel:${res.bridgeNumber.replace(/[^0-9+]/g, '')}`;
      telLink.textContent = `📞 Dial Virtual Bridge (${res.bridgeNumber}) Now`;
      toast('✓ Private telephony bridge active! Connect without sharing numbers.', 'success');
    } catch (err) {
      errBox.textContent = err.message;
      btn.disabled = false;
      btn.textContent = '📞 Start Masked Call Now';
    }
  };
}

let activeCameraStream = null;

function stopCamera() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(track => track.stop());
    activeCameraStream = null;
  }
}

async function renderDealer() {
  if (!state.dealerTab) state.dealerTab = 'fitments';
  if (state.dealerSearch === undefined) state.dealerSearch = '';

  let data;
  try {
    data = await api('/api/dealer/dashboard');
    state.cache.dealerDashboard = data;
  } catch (err) {
    app.innerHTML = `
      <div style="padding:40px; text-align:center;">
        <h2>Dealership Portal Access Error</h2>
        <p style="color:var(--rose-600);">${esc(err.message)}</p>
        <button class="btn primary" onclick="location.href='/'">Back to Login</button>
      </div>
    `;
    return;
  }

  const shr = data.showroom;
  const m = data.metrics;

  app.innerHTML = `
    <div class="dealer-app-container">
      <!-- 1. TOP STICKY NAVIGATION -->
      <header class="dealer-nav">
        <div class="dealer-nav-left">
          <a class="brand" href="/dealer" style="display:inline-flex; align-items:center; text-decoration:none;">
            ${smartOLogoSvg({ width: 145, height: 38, mode: 'dark' })}
          </a>
          <span class="dealer-portal-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4"/></svg>
            DEALERSHIP PORTAL
          </span>
          <span style="font-size:12.5px; font-weight:700; color:#0f172a; margin-left:6px;" class="dealer-name-nav-tag">
            ${esc(shr.name)}
          </span>
        </div>

        <div class="dealer-nav-right">
          <div style="text-align:right; margin-right:4px;">
            <div style="font-size:12px; font-weight:700; color:#0f172a;">${esc(state.user.name)}</div>
            <div style="font-size:10.5px; color:#64748b;">${esc(shr.city)}, Bihar • <code class="mono" style="font-size:10px;">${esc(shr.code)}</code></div>
          </div>
          <span class="avatar" style="width:34px; height:34px; font-size:12px; background:linear-gradient(135deg, #1d68ed 0%, #00b4d8 100%); color:#fff; display:grid; place-items:center; border-radius:50%; font-weight:700;">
            ${initials(state.user.name)}
          </span>
          <button class="btn secondary tiny" id="dealer-logout-btn" style="padding:6px 12px; font-size:11px;">Sign out</button>
        </div>
      </header>

      <!-- 2. MAIN CONTAINER -->
      <main class="dealer-main-content">
        <!-- HERO BANNER -->
        <section class="dealer-hero">
          <div class="dealer-hero-title">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <span class="bihar-state-badge" style="background:rgba(37,99,235,0.25); border-color:rgba(147,197,253,0.3); color:#93c5fd; font-size:10px;">
                ✓ AUTHORIZED FITMENT & SAFETY CENTER
              </span>
              <span style="font-family:var(--font-mono); font-size:11px; color:#cbd5e1;">CODE: ${esc(shr.code)}</span>
            </div>
            <h1>${esc(shr.name)}</h1>
            <p>${esc(shr.city)}, Bihar • Official SmartO Physical Decal Allocation & Verification Point</p>
          </div>

          <div class="dealer-hero-actions">
            <button class="btn secondary" id="dealer-btn-request-stock" style="background:rgba(255,255,255,0.08); border-color:rgba(255,255,255,0.2); color:#ffffff; font-size:12.5px;">
              📦 + Request QR Stock Indent
            </button>
            <button class="btn-scan-hero" id="dealer-btn-scan-hero">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              📷 Scan QR Decal to Fit New Vehicle
            </button>
          </div>
        </section>

        <!-- 3. KPI METRIC CARDS -->
        <div class="dealer-kpis">
          <div class="dealer-kpi-card">
            <div class="dealer-kpi-label">
              <span>Ready Bay Stock</span>
              <span style="font-size:16px;">🏷️</span>
            </div>
            <div class="dealer-kpi-val" style="color:#2563eb;">${m.readyStock} <span style="font-size:14px; font-weight:600; color:#64748b;">Units</span></div>
            <div class="dealer-kpi-sub">Unassigned decals ready on shelf</div>
          </div>

          <div class="dealer-kpi-card">
            <div class="dealer-kpi-label">
              <span>Active Road Protected</span>
              <span style="font-size:16px;">🛡️</span>
            </div>
            <div class="dealer-kpi-val" style="color:#059669;">${m.activeProtected} <span style="font-size:14px; font-weight:600; color:#64748b;">Vehicles</span></div>
            <div class="dealer-kpi-sub">Fitted decals on active road</div>
          </div>

          <div class="dealer-kpi-card">
            <div class="dealer-kpi-label">
              <span>Pending Road Test</span>
              <span style="font-size:16px;">⏳</span>
            </div>
            <div class="dealer-kpi-val" style="color:#d97706;">${m.pendingActivation} <span style="font-size:14px; font-weight:600; color:#64748b;">Pending</span></div>
            <div class="dealer-kpi-sub">Awaiting customer final scan</div>
          </div>

          <div class="dealer-kpi-card">
            <div class="dealer-kpi-label">
              <span>Total Fees Collected</span>
              <span style="font-size:16px;">💰</span>
            </div>
            <div class="dealer-kpi-val" style="color:#0f172a;">₹${m.feesCollected.toLocaleString('en-IN')}</div>
            <div class="dealer-kpi-sub">Showroom fitment & sticker revenue</div>
          </div>
        </div>

        <!-- 4. TAB NAVIGATION -->
        <div class="dealer-tab-nav">
          <button class="dealer-tab-btn ${state.dealerTab === 'fitments' ? 'active' : ''}" data-dealer-tab="fitments">
            🚗 Registered Vehicles & Fitment Ledger (${data.recentFitments.length})
          </button>
          <button class="dealer-tab-btn ${state.dealerTab === 'stock' ? 'active' : ''}" data-dealer-tab="stock">
            📦 In-Bay Decal Inventory (${data.unassignedStock.length} In-Stock / ${m.totalAllocated} Allocated)
          </button>
          <button class="dealer-tab-btn ${state.dealerTab === 'requests' ? 'active' : ''}" data-dealer-tab="requests">
            📝 Stock Indents & Serial Allotments (${data.stockRequests.length})
          </button>
        </div>

        <!-- 5. TAB CONTENT PANE -->
        <div id="dealer-tab-pane">
          ${renderDealerTabContent(data)}
        </div>
      </main>

      <div id="toasts" class="toasts"></div>
      <div id="modal-root"></div>
    </div>
  `;

  attachDealerEvents(data);
}

function renderDealerTabContent(data) {
  if (state.dealerTab === 'stock') {
    return `
      <section class="panel">
        <div class="panel-heading" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3>📦 In-Bay Physical QR Decal Stock</h3>
            <p>Unassigned serialized QR decals allocated to ${esc(data.showroom.name)}. Floor staff can scan and bind any unit to a vehicle.</p>
          </div>
          <button class="btn primary tiny" id="tab-btn-request-stock">+ Request Stock Indent</button>
        </div>

        <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:12px 16px; margin-bottom:16px; display:flex; align-items:center; gap:12px;">
          <span style="font-size:20px;">ℹ️</span>
          <div style="font-size:12px; color:#1e3a8a; line-height:1.5;">
            <b>Allotment Protocol:</b> Showrooms cannot generate QR batches directly. Decals are allocated by Super Admin in continuous series ranges. Click "Fit & Activate" to scan and link a decal to an onboarded vehicle.
          </div>
        </div>

        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>QR Decal Serial</th>
                <th>Public Token</th>
                <th>Current Status</th>
                <th>Allocation Date</th>
                <th style="text-align:right;">Immediate Fitment Action</th>
              </tr>
            </thead>
            <tbody>
              ${data.unassignedStock.length === 0 ? `
                <tr>
                  <td colspan="5" style="text-align:center; padding:32px; color:#64748b;">
                    <div style="font-size:28px; margin-bottom:8px;">📦</div>
                    <b>No unassigned stock available in bay.</b>
                    <p style="margin:4px 0 12px; font-size:12px;">Submit a new stock requisition to Super Admin for serial batch allotment.</p>
                    <button class="btn primary tiny" id="btn-empty-req-stock">+ Request Stock Indent Now</button>
                  </td>
                </tr>
              ` : data.unassignedStock.map(q => `
                <tr>
                  <td><b class="mono" style="color:#2563eb; font-size:13px;">${esc(q.qr_id)}</b></td>
                  <td><code class="mono" style="font-size:11px; color:#64748b;">${esc(q.public_token.slice(0, 16))}...</code></td>
                  <td><span class="badge badge-showroom-stock">READY IN BAY</span></td>
                  <td><small>${date(q.created_at)}</small></td>
                  <td style="text-align:right;">
                    <button class="btn primary tiny btn-fit-this-qr" data-qr-id="${esc(q.qr_id)}" style="font-size:11px; padding:5px 12px; cursor:pointer;">
                      📷 Fit & Activate Vehicle →
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  if (state.dealerTab === 'requests') {
    return `
      <section class="panel">
        <div class="panel-heading" style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3>📝 Showroom Stock Requisitions & Serial Allotments</h3>
            <p>Requisitions submitted to Super Admin. When approved, continuous series ranges are assigned to your bay.</p>
          </div>
          <button class="btn primary tiny" id="tab-btn-request-stock">+ Submit Requisition</button>
        </div>

        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Requisition ID</th>
                <th>Date Requested</th>
                <th>Requested Qty</th>
                <th>Category Focus</th>
                <th>Requisition Notes</th>
                <th>Status</th>
                <th>Allotted Serial Range</th>
              </tr>
            </thead>
            <tbody>
              ${data.stockRequests.length === 0 ? `
                <tr>
                  <td colspan="7" style="text-align:center; padding:32px; color:#64748b;">
                    No stock requisitions submitted yet. Click "+ Submit Requisition" to request QR decals.
                  </td>
                </tr>
              ` : data.stockRequests.map(r => `
                <tr>
                  <td><code class="mono">${esc(r.id)}</code></td>
                  <td><small>${date(r.created_at)}</small></td>
                  <td><b style="color:#2563eb; font-size:13px;">${r.quantity}</b> units</td>
                  <td><span class="badge badge-central-stock" style="font-size:10.5px;">${esc(r.preferred_category)}</span></td>
                  <td><small style="color:#475569; max-width:240px; display:block;">${esc(r.notes || 'Standard showroom inventory requisition')}</small></td>
                  <td>
                    ${r.status === 'PENDING'
                      ? '<span class="badge badge-allocated">PENDING ALLOTMENT</span>'
                      : '<span class="badge badge-active">FULFILLED</span>'
                    }
                  </td>
                  <td>
                    ${r.allocated_series_start
                      ? `<code class="mono" style="font-size:11px; color:#059669 !important; font-weight:700;">${esc(r.allocated_series_start)} → ${esc(r.allocated_series_end)}</code>`
                      : '<span style="color:#d97706; font-size:11px;">Awaiting Super Admin Series Allotment</span>'
                    }
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  // Default: 'fitments' ledger
  const q = (state.dealerSearch || '').trim().toLowerCase();
  let fitments = data.recentFitments || [];
  if (q) {
    fitments = fitments.filter(x =>
      (x.registration && x.registration.toLowerCase().includes(q)) ||
      (x.make && x.make.toLowerCase().includes(q)) ||
      (x.model && x.model.toLowerCase().includes(q)) ||
      (x.qr_id && x.qr_id.toLowerCase().includes(q)) ||
      (x.owner_name && x.owner_name.toLowerCase().includes(q)) ||
      (x.owner_phone && x.owner_phone.includes(q))
    );
  }

  return `
    <section class="panel">
      <div class="panel-heading" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div>
          <h3>🚗 Fitted Vehicles & Active QR Ledger</h3>
          <p>Complete record of vehicles fitted with SmartO safety decals, customer contacts, and fees collected.</p>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="city-search-box" style="width:240px;">
            <span class="search-icon">🔍</span>
            <input id="dealer-search-fitments" placeholder="Search plate, owner, QR..." value="${esc(state.dealerSearch)}" />
          </div>
          <button class="btn primary tiny" id="tab-btn-scan-fit">
            📷 + Fit New Vehicle
          </button>
        </div>
      </div>

      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Vehicle Plate & Make</th>
              <th>Category</th>
              <th>Customer / Owner</th>
              <th>Mobile Contact</th>
              <th>QR Decal Serial</th>
              <th>Fee Collected</th>
              <th>Fitment Date</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${fitments.length === 0 ? `
              <tr>
                <td colspan="8" style="text-align:center; padding:36px; color:#64748b;">
                  <div style="font-size:32px; margin-bottom:8px;">🚗</div>
                  <b>${q ? 'No fitments match your search query.' : 'No vehicles fitted yet.'}</b>
                  <p style="margin:4px 0 14px; font-size:12px;">Scan a QR decal and onboard your first showroom delivery vehicle.</p>
                  <button class="btn primary tiny" id="btn-empty-fit-vehicle">📷 Scan QR & Fit First Vehicle</button>
                </td>
              </tr>
            ` : fitments.map(x => `
              <tr>
                <td>
                  <b class="mono" style="font-size:13.5px; color:#0f172a;">${esc(x.registration)}</b>
                  <small style="display:block; color:#475569;">${esc(x.make)} ${esc(x.model)} • ${esc(x.color || '')}</small>
                </td>
                <td>
                  <span style="font-size:12px;">
                    ${x.category === 'Car' ? '🚘 Car' : x.category === 'Motorcycle' ? '🏍️ 2-Wheeler' : '🚛 Commercial'}
                  </span>
                </td>
                <td><b>${esc(x.owner_name || 'Walk-in Customer')}</b></td>
                <td><code class="mono" style="font-size:11.5px; color:#2563eb;">${esc(x.owner_phone || '—')}</code></td>
                <td>
                  <span class="badge badge-active" style="font-family:var(--font-mono); font-size:11px;">
                    ${esc(x.qr_id)}
                  </span>
                </td>
                <td>
                  <b>₹${(x.fee_collected || 0).toLocaleString('en-IN')}</b>
                  <small style="display:block; color:#64748b; font-size:10px;">${esc(x.payment_mode || 'UPI')}</small>
                </td>
                <td><small>${date(x.fitted_at)}</small></td>
                <td style="text-align:right;">
                  <button class="btn secondary tiny btn-view-decal-sticker" data-qr-id="${esc(x.qr_id)}" data-reg="${esc(x.registration)}">
                    🏷️ View Decal
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function attachDealerEvents(data) {
  const root = document.querySelector('#modal-root');

  // Sign out
  document.querySelector('#dealer-logout-btn')?.addEventListener('click', async () => {
    stopCamera();
    await post('/api/logout', {});
    location.href = '/';
  });

  // Tab switching
  document.querySelectorAll('[data-dealer-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.dealerTab = btn.getAttribute('data-dealer-tab');
      renderDealer();
    });
  });

  // Hero Actions
  document.querySelector('#dealer-btn-scan-hero')?.addEventListener('click', () => {
    scanDecalModal('', data.unassignedStock);
  });
  document.querySelector('#tab-btn-scan-fit')?.addEventListener('click', () => {
    scanDecalModal('', data.unassignedStock);
  });
  document.querySelector('#btn-empty-fit-vehicle')?.addEventListener('click', () => {
    scanDecalModal('', data.unassignedStock);
  });

  document.querySelector('#dealer-btn-request-stock')?.addEventListener('click', () => {
    requestStockModal();
  });
  document.querySelector('#tab-btn-request-stock')?.addEventListener('click', () => {
    requestStockModal();
  });
  document.querySelector('#btn-empty-req-stock')?.addEventListener('click', () => {
    requestStockModal();
  });

  // Fit specific unassigned QR button
  document.querySelectorAll('.btn-fit-this-qr').forEach(btn => {
    btn.addEventListener('click', () => {
      const qid = btn.getAttribute('data-qr-id');
      scanDecalModal(qid, data.unassignedStock);
    });
  });

  // View Decal Sticker modal
  document.querySelectorAll('.btn-view-decal-sticker').forEach(btn => {
    btn.addEventListener('click', () => {
      const qid = btn.getAttribute('data-qr-id');
      const reg = btn.getAttribute('data-reg');
      showStickerModal(qid, qid, reg);
    });
  });

  // Fitment search input
  const searchInp = document.querySelector('#dealer-search-fitments');
  if (searchInp) {
    searchInp.addEventListener('input', (e) => {
      state.dealerSearch = e.target.value;
      const pane = document.querySelector('#dealer-tab-pane');
      if (pane) {
        pane.innerHTML = renderDealerTabContent(data);
        attachDealerEvents(data);
        const newInp = document.querySelector('#dealer-search-fitments');
        if (newInp) {
          newInp.focus();
          newInp.selectionStart = newInp.selectionEnd = newInp.value.length;
        }
      }
    });
  }
}

function scanDecalModal(prefillQr = '', unassignedStock = []) {
  const root = document.querySelector('#modal-root');

  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card" style="max-width:580px; max-height:92vh; overflow-y:auto;">
        <button class="modal-close" data-close>×</button>
        <span class="eyebrow" style="color:#2563eb;">FLOOR EXECUTIVE WORKSPACE</span>
        <h2>Scan QR Decal to Fit New Vehicle</h2>
        <p class="muted">Align physical decal in camera viewfinder or select unassigned serialized QR from showroom stock.</p>

        <!-- CAMERA VIEWFINDER -->
        <div class="scanner-viewfinder-box">
          <video id="scanner-video" class="scanner-video-feed" playsinline autoplay muted></video>
          <div class="scanner-target-reticle"></div>
          <div class="scanner-laser-line"></div>
          <div class="scanner-badge-status" id="scanner-status-badge">
            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981;"></span>
            <span id="scanner-status-text">Camera Active • Position SmartO QR Decal</span>
          </div>
        </div>

        <form id="dealer-activate-form">
          <!-- 1. Decal Selection -->
          <label>
            QR Decal Serial Identifier
            ${unassignedStock.length > 0 ? `
              <select name="qrCode" id="modal-qr-select" required>
                <option value="">-- Choose unassigned QR or scan with camera --</option>
                ${unassignedStock.map(q => `
                  <option value="${esc(q.qr_id)}" ${prefillQr === q.qr_id ? 'selected' : ''}>
                    ${esc(q.qr_id)} • Ready Stock (${esc(q.public_token.slice(0, 12))}...)
                  </option>
                `).join('')}
              </select>
            ` : `
              <input name="qrCode" id="modal-qr-input" value="${esc(prefillQr)}" placeholder="e.g. SV-BR-00000136" required style="font-family:var(--font-mono); font-weight:700;">
            `}
            <small style="font-size:11px; color:#64748b; display:block; margin-top:3px;">
              Camera feed automatically scans and fills the serial number above.
            </small>
          </label>

          <!-- 2. Brand New Vehicle Delivery & Pending Plate Toggle -->
          <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:10px 14px; margin-bottom:14px;">
            <label style="display:flex; align-items:center; gap:10px; margin:0; cursor:pointer; font-weight:700; color:#1e40af; font-size:13px;">
              <input type="checkbox" id="modal-chk-pending-plate" name="platePending" value="1" style="width:18px; height:18px; accent-color:#2563eb;">
              <span>🆕 Brand New Delivery (RTO Permanent Plate Pending / 5-7 Days)</span>
            </label>
            <small style="display:block; font-size:11.5px; color:#475569; margin-top:4px; line-height:1.4;">
              If delivering without metal HSRP number plate, enter Chassis VIN. Owner can later update plate from their dashboard.
            </small>
          </div>

          <!-- 3. Vehicle Registration & Category -->
          <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:10px;">
            <label id="lbl-fit-plate">
              <span id="text-fit-plate">Vehicle Registration Plate</span> <span id="req-fit-plate" style="color:#ef4444;">*</span>
              <input name="registration" id="modal-fit-plate" placeholder="e.g. BR06XY1234" required maxlength="16" style="text-transform:uppercase; font-family:var(--font-mono); font-weight:700;">
            </label>
            <label>
              Vehicle Category
              <select name="category" id="modal-fit-category">
                <option value="Car" selected>Passenger Car (4W)</option>
                <option value="Motorcycle">Motorcycle / Scooter (2W)</option>
                <option value="Commercial">Commercial / Transport</option>
              </select>
            </label>
          </div>

          <!-- 4. Chassis Number & Engine Number -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <label id="lbl-fit-chassis">
              <span>Chassis Number (VIN)</span> <span id="req-fit-chassis" style="color:#ef4444; display:none;">*</span>
              <input name="chassisNumber" id="modal-fit-chassis" placeholder="e.g. MA3EWB41S00123456" maxlength="25" style="text-transform:uppercase; font-family:var(--font-mono); font-weight:600;">
            </label>
            <label>
              <span>Engine Number</span>
              <input name="engineNumber" id="modal-fit-engine" placeholder="e.g. K12MN-8849201" maxlength="25" style="text-transform:uppercase; font-family:var(--font-mono); font-weight:600;">
            </label>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <label>
              Make (Brand)
              <input name="make" id="modal-fit-make" value="Maruti Suzuki" required maxlength="50" placeholder="e.g. Maruti Suzuki, Hyundai">
            </label>
            <label>
              Model Name
              <input name="model" id="modal-fit-model" value="Swift Dzire" required maxlength="50" placeholder="e.g. Brezza ZXi, Creta">
            </label>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <label>
              Vehicle Exterior Color
              <input name="color" id="modal-fit-color" value="Pearl Arctic White" maxlength="30" placeholder="e.g. Pearl White, Magma Grey">
            </label>
            <label>
              Emergency Alternate Contact
              <input name="emergencyContact" id="modal-fit-emergency" placeholder="e.g. +91 98111 22334" maxlength="20">
            </label>
          </div>

          <!-- 5. Owner Details -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <label>
              Customer / Owner Full Name
              <input name="ownerName" id="modal-fit-name" placeholder="e.g. Ravi Kumar" required maxlength="80">
            </label>
            <label>
              Owner Mobile Number
              <input name="ownerPhone" id="modal-fit-phone" placeholder="e.g. +91 98765 11223" required maxlength="20">
            </label>
          </div>

          <!-- 6. Fitment Fee Collection -->
          <label>
            Fitment & Decal Package Fee Collected
            <div class="fee-options-grid">
              <button type="button" class="fee-btn-option selected" data-fee="299">
                ₹299
                <small style="display:block; font-size:10px; font-weight:normal; margin-top:2px;">Standard Package</small>
              </button>
              <button type="button" class="fee-btn-option" data-fee="199">
                ₹199
                <small style="display:block; font-size:10px; font-weight:normal; margin-top:2px;">Basic Decal</small>
              </button>
              <button type="button" class="fee-btn-option" data-fee="0">
                ₹0 (Free)
                <small style="display:block; font-size:10px; font-weight:normal; margin-top:2px;">Promo / Included</small>
              </button>
            </div>
            <input type="hidden" name="feeCollected" id="modal-fee-input" value="299">
          </label>

          <label>
            Payment Mode
            <select name="paymentMode" id="modal-payment-mode">
              <option value="UPI" selected>UPI / PhonePe / GPay</option>
              <option value="Cash">Cash at Delivery Bay</option>
              <option value="Card">Card / EDC POS Terminal</option>
              <option value="Complimentary">Complimentary Showroom Delivery</option>
            </select>
          </label>

          <div id="dealer-activate-error" class="form-error"></div>

          <div class="modal-actions" style="margin-top:20px;">
            <button class="btn secondary" type="button" data-close>Cancel</button>
            <button class="btn primary" type="submit" id="btn-submit-activation" style="padding:10px 18px;">
              ✓ Bind Decal & Activate Road Protection
            </button>
          </div>
        </form>
      </section>
    </div>
  `;

  // Start Camera Stream
  const video = root.querySelector('#scanner-video');
  const statusText = root.querySelector('#scanner-status-text');

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(stream => {
        activeCameraStream = stream;
        if (video) {
          video.srcObject = stream;
          video.play().catch(() => {});
        }

        // Real-time Barcode/QR Detector if supported
        if ('BarcodeDetector' in window) {
          const barcodeDetector = new window.BarcodeDetector({ formats: ['qr_code'] });
          const scanInterval = setInterval(async () => {
            if (!activeCameraStream) {
              clearInterval(scanInterval);
              return;
            }
            try {
              const barcodes = await barcodeDetector.detect(video);
              if (barcodes.length > 0) {
                const raw = barcodes[0].rawValue;
                statusText.textContent = `Scanned: ${raw.slice(0, 24)}...`;
                const qrSelect = root.querySelector('#modal-qr-select');
                const qrInput = root.querySelector('#modal-qr-input');
                if (qrSelect) {
                  const match = Array.from(qrSelect.options).find(opt => opt.value === raw || raw.includes(opt.value));
                  if (match) qrSelect.value = match.value;
                } else if (qrInput) {
                  qrInput.value = raw.includes('/scan/') ? raw.split('/scan/').pop() : raw;
                }
              }
            } catch {}
          }, 600);
        }
      })
      .catch(() => {
        if (statusText) statusText.textContent = 'Camera preview offline. Select QR from list below.';
      });
  } else {
    if (statusText) statusText.textContent = 'Camera not supported. Select QR from list below.';
  }

  // Pending Plate checkbox logic
  const chkPending = root.querySelector('#modal-chk-pending-plate');
  const plateInput = root.querySelector('#modal-fit-plate');
  const reqPlate = root.querySelector('#req-fit-plate');
  const chassisInput = root.querySelector('#modal-fit-chassis');
  const reqChassis = root.querySelector('#req-fit-chassis');

  chkPending.addEventListener('change', () => {
    if (chkPending.checked) {
      plateInput.removeAttribute('required');
      plateInput.placeholder = 'Optional (Pending RTO Plate)';
      reqPlate.style.display = 'none';
      chassisInput.setAttribute('required', 'required');
      reqChassis.style.display = 'inline';
      chassisInput.focus();
    } else {
      plateInput.setAttribute('required', 'required');
      plateInput.placeholder = 'e.g. BR06XY1234';
      reqPlate.style.display = 'inline';
      chassisInput.removeAttribute('required');
      reqChassis.style.display = 'none';
    }
  });

  // Close handlers
  const closeModal = () => {
    stopCamera();
    root.innerHTML = '';
  };
  root.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModal);
  root.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeModal();
  };

  // Fee chip selector
  root.querySelectorAll('.fee-btn-option').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('.fee-btn-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const val = btn.getAttribute('data-fee');
      root.querySelector('#modal-fee-input').value = val;
    });
  });

  // Submit Handler
  root.querySelector('#dealer-activate-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const errBox = root.querySelector('#dealer-activate-error');
    errBox.textContent = '';
    const submitBtn = root.querySelector('#btn-submit-activation');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Activating decal & writing ledger...';

    try {
      const res = await post('/api/dealer/activate-decal', {
        qrCode: fd.get('qrCode'),
        registration: fd.get('registration') || '',
        chassisNumber: fd.get('chassisNumber') || '',
        engineNumber: fd.get('engineNumber') || '',
        emergencyContact: fd.get('emergencyContact') || '',
        make: fd.get('make'),
        model: fd.get('model'),
        category: fd.get('category'),
        color: fd.get('color'),
        ownerName: fd.get('ownerName'),
        ownerPhone: fd.get('ownerPhone'),
        feeCollected: fd.get('feeCollected'),
        paymentMode: fd.get('paymentMode')
      });

      closeModal();
      toast(`✓ QR Decal ${res.qrId} successfully bound to ${res.registration} & activated on road!`, 'success');
      state.dealerTab = 'fitments';
      renderDealer();
    } catch (err) {
      errBox.textContent = err.message;
      submitBtn.disabled = false;
      submitBtn.textContent = '✓ Bind Decal & Activate Road Protection';
    }
  };
}

function requestStockModal() {
  const root = document.querySelector('#modal-root');

  root.innerHTML = `
    <div class="modal-backdrop">
      <section class="modal-card">
        <button class="modal-close" data-close>×</button>
        <span class="eyebrow" style="color:#2563eb;">SHOWROOM INVENTORY REQUISITION</span>
        <h2>Request QR Decal Stock Indent</h2>
        <p class="muted">Showrooms cannot print decals locally. Submit a serialized batch indent request to Super Admin for continuous serial range allocation.</p>

        <form id="stock-request-form">
          <label>
            Requested QR Decal Quantity
            <div class="fee-options-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom:8px;">
              <button type="button" class="fee-btn-option" data-qty="25">25 Units</button>
              <button type="button" class="fee-btn-option selected" data-qty="50">50 Units</button>
              <button type="button" class="fee-btn-option" data-qty="100">100 Units</button>
              <button type="button" class="fee-btn-option" data-qty="200">200 Units</button>
            </div>
            <input type="number" name="quantity" id="modal-req-qty-input" value="50" min="5" max="500" required>
            <small style="font-size:11px; color:#64748b; display:block; margin-top:3px;">
              Super Admin will allocate a contiguous serial number range (e.g. SV-BR-000100 to SV-BR-000150).
            </small>
          </label>

          <label>
            Vehicle Category Focus
            <select name="preferredCategory">
              <option value="All Categories" selected>All Categories (Mixed Cars & Two-Wheelers)</option>
              <option value="Passenger Cars">Passenger Cars & SUVs</option>
              <option value="Two-Wheelers">Motorcycles & Scooters</option>
              <option value="Commercial">Commercial Fleets & Trucks</option>
            </select>
          </label>

          <label>
            Requisition Reason / Operational Notes
            <textarea name="notes" rows="3" placeholder="e.g. Festive month delivery surge, upcoming booking deliveries, stock replenishment..." required>Stock replenishment for upcoming new vehicle deliveries.</textarea>
          </label>

          <div id="stock-req-error" class="form-error"></div>

          <div class="modal-actions">
            <button class="btn secondary" type="button" data-close>Cancel</button>
            <button class="btn primary" type="submit" id="btn-submit-stock-req">
              Submit Stock Indent to Admin →
            </button>
          </div>
        </form>
      </section>
    </div>
  `;

  root.querySelectorAll('[data-close]').forEach(b => b.onclick = () => root.innerHTML = '');
  root.querySelector('.modal-backdrop').onclick = (e) => {
    if (e.target.classList.contains('modal-backdrop')) root.innerHTML = '';
  };

  root.querySelectorAll('[data-qty]').forEach(btn => {
    btn.addEventListener('click', () => {
      root.querySelectorAll('[data-qty]').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      const val = btn.getAttribute('data-qty');
      root.querySelector('#modal-req-qty-input').value = val;
    });
  });

  root.querySelector('#stock-request-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const errBox = root.querySelector('#stock-req-error');
    errBox.textContent = '';
    const btn = root.querySelector('#btn-submit-stock-req');
    btn.disabled = true;
    btn.textContent = 'Submitting indent...';

    try {
      const res = await post('/api/dealer/request-stock', {
        quantity: fd.get('quantity'),
        preferredCategory: fd.get('preferredCategory'),
        notes: fd.get('notes')
      });

      root.innerHTML = '';
      toast(`✓ Requisition ${res.requestId} submitted for ${res.quantity} decals! Super Admin notified.`, 'success');
      state.dealerTab = 'requests';
      renderDealer();
    } catch (err) {
      errBox.textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Submit Stock Indent to Admin →';
    }
  };
}

/* ==========================================================================
   Background Live Polling (Real-time message counter & ping)
   ========================================================================== */
function setupLivePolling() {
  setInterval(async () => {
    if (!state.user || state.user.role !== 'ADMIN') return;
    try {
      const res = await api('/api/dashboard');
      if (res.openMessages !== state.cache.openMessages) {
        state.cache.openMessages = res.openMessages;
        setAlertBadge(res.openMessages);

        if (state.lastMessageCount > 0 && res.openMessages > state.lastMessageCount) {
          toast(`⚡ New vehicle scan alert received in inbox!`, 'success');
        }
        state.lastMessageCount = res.openMessages;
      }
    } catch {}
  }, 12000);
}

/* ==========================================================================
   Brand Preloader Dismiss Helper
   ========================================================================== */
function dismissPreloader(delay = 550) {
  setTimeout(() => {
    const pl = document.getElementById('page-preloader');
    if (pl) {
      pl.classList.add('fade-out');
      setTimeout(() => {
        try { pl.remove(); } catch {}
      }, 500);
    }
  }, delay);
}

/* ==========================================================================
   Public D2C Webstore Experience (/store)
   ========================================================================== */
async function renderStore() {
  app.innerHTML = `
    <div class="store-shell" style="min-height:100vh; background:#071224; color:#f8fafc; font-family:var(--font-body);">
      <!-- Store Top Bar -->
      <header style="padding:16px 28px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgba(255,255,255,0.08); background:rgba(7, 18, 36, 0.95); backdrop-filter:blur(16px); position:sticky; top:0; z-index:100;">
        <a href="/" style="text-decoration:none; display:flex; align-items:center; gap:10px;">
          ${smartOLogoSvg({ width: 170, height: 46, mode: 'dark' })}
        </a>
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:12px; color:#38bdf8; font-weight:700; background:rgba(56, 189, 248, 0.1); padding:4px 10px; border-radius:20px; border:1px solid rgba(56, 189, 248, 0.2);">
            🚚 Pan-India Doorstep Delivery
          </span>
          <a href="/login" class="btn secondary tiny" style="color:#ffffff; border-color:rgba(255,255,255,0.2);">Vehicle Owner Login ↗</a>
        </div>
      </header>

      <main style="max-width:1200px; margin:0 auto; padding:28px 20px 60px;">
        <div class="page-wrap"></div>
      </main>

      <footer style="text-align:center; padding:32px; border-top:1px solid rgba(255,255,255,0.06); font-size:12px; color:#64748b;">
        SMARTO INNOVATIONS PVT LTD • CRYPTOGRAPHIC VEHICLE IDENTITY PLATFORM • ALL RIGHTS RESERVED
      </footer>
      <div id="modal-root"></div>
    </div>
  `;

  await ordersPage();
}

/* ==========================================================================
   Entry Point
   ========================================================================== */
async function start() {
  if (location.pathname.startsWith('/scan/')) {
    await renderScan();
    dismissPreloader();
    return;
  }

  if (location.pathname === '/store') {
    await renderStore();
    dismissPreloader();
    return;
  }

  try {
    const result = await api('/api/session');
    state.user = result.user;
  } catch {}

  setupLivePolling();

  if (location.pathname === '/owner' && state.user?.role === 'OWNER') {
    await renderOwner();
    dismissPreloader();
    return;
  }
  if (state.user?.role === 'SHOWROOM_MANAGER' || location.pathname === '/dealer' || location.pathname === '/showroom') {
    if (state.user) {
      await renderDealer();
      dismissPreloader();
      return;
    }
  }
  if (state.user) {
    await renderAdmin();
    dismissPreloader();
    return;
  }

  renderLogin();
  dismissPreloader();
}

start();

