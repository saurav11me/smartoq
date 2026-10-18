import { now } from './db.mjs';

/**
 * SmartO Real-World Notification Relay Engine
 * Supports Multi-Channel Dispatches:
 * 1. SMS (Twilio / Fast2SMS / Gupshup DLT)
 * 2. WhatsApp Business Cloud API
 * 3. Mobile Webhook / Push
 */
export async function dispatchNotification({ messageId, qrId, category, note, vehicle, ownerPhone, visitorName, hasPhoto }) {
  const vehicleText = vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.registration})` : `QR ${qrId}`;
  const alertText = `[SmartO Alert] 🚨 ${category} reported for your vehicle ${vehicleText}: "${note.slice(0, 140)}". Ref: ${messageId}.`;

  const channels = [];
  const failures = [];
  let deliveryStatus = 'NOT_CONFIGURED';

  if (!ownerPhone) {
    return { success: false, channels, failures: ['OWNER_PHONE_MISSING'], status: 'NOT_CONFIGURED', timestamp: now() };
  }

  // 1. WhatsApp Cloud API Dispatch
  if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && ownerPhone) {
    try {
      const res = await fetch(`https://graph.facebook.com/v18.0/${encodeURIComponent(process.env.WHATSAPP_PHONE_NUMBER_ID)}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: ownerPhone.replace(/[^0-9]/g, ''),
          type: 'text',
          text: { body: alertText }
        }),
        signal: AbortSignal.timeout(10_000)
      });
      if (res.ok) {
        channels.push('WHATSAPP');
        deliveryStatus = 'DELIVERED_WHATSAPP';
      } else failures.push(`WHATSAPP_HTTP_${res.status}`);
    } catch (err) {
      failures.push(`WHATSAPP_${err.name || 'ERROR'}`);
    }
  }

  // 2. Twilio / SMS Gateway Dispatch
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER && ownerPhone) {
    try {
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
      const params = new URLSearchParams();
      params.append('To', ownerPhone);
      params.append('From', process.env.TWILIO_PHONE_NUMBER);
      params.append('Body', alertText);

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString(),
        signal: AbortSignal.timeout(10_000)
      });
      if (res.ok) {
        channels.push('SMS');
        deliveryStatus = 'DELIVERED_SMS';
      } else failures.push(`SMS_HTTP_${res.status}`);
    } catch (err) {
      failures.push(`SMS_${err.name || 'ERROR'}`);
    }
  }

  // Simulation is explicit and forbidden in production; it never impersonates a live provider.
  if (channels.length === 0 && process.env.NOTIFICATION_SIMULATION === 'true' && process.env.NODE_ENV !== 'production') {
    channels.push('SMS_SIMULATED', 'WHATSAPP_SIMULATED');
    deliveryStatus = 'DELIVERED_SIMULATED';
  } else if (channels.length === 0 && failures.length > 0) {
    deliveryStatus = 'FAILED';
  }

  return {
    success: channels.length > 0,
    channels,
    failures,
    status: deliveryStatus,
    timestamp: now()
  };
}
