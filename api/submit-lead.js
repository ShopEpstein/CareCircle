// pages/api/submit-lead.js
// CareCircle form submission handler
// Fires on every form submit:
//   1. SMS to the lead (Chase's personal follow-up message via CLAW)
//   2. SMS alert to Chase
//   3. Saves contact to CLAW Dialer contact list
//   4. Sends Brevo email to the lead (if email provided)

const CLAW_BASE = 'https://claw-dialer.vercel.app';
const CHASE_PHONE = '+18503414324';
const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_FROM_EMAIL = 'campaigns@transbidlive.faith';
const BREVO_FROM_NAME = 'Chase @ CareCircle';

// ── Build Chase's personal follow-up SMS to the lead ─────────────────────────
function buildLeadSMS(name, careType, urgency) {
  const first = name ? name.split(' ')[0] : '';
  const greeting = first ? `Hey ${first}` : 'Hey there';
  const urgencyLine =
    urgency === 'As soon as possible'
      ? "I know timing matters — let's get you connected fast."
      : urgency === 'Within 1–2 weeks'
      ? "We have some time to find the right fit."
      : "No rush — happy to help whenever you're ready.";
  const care = careType || 'home care';
  return `${greeting} — Chase here from CareCircle. Thanks for reaching out about ${care}. ${urgencyLine} I'll personally match you with the best vetted agency in your area. Reply anytime. Reply STOP to opt out.`;
}

// ── Build Chase's personal alert SMS ─────────────────────────────────────────
function buildAlertSMS(name, phone, city, careType, urgency, forWhom) {
  return `🔔 CARECIRCLE LEAD\nName: ${name || 'Unknown'}\nPhone: ${phone}\nCity: ${city || 'N/A'}\nCare: ${careType || 'N/A'}\nFor: ${forWhom || 'N/A'}\nUrgency: ${urgency || 'N/A'}`;
}

// ── Brevo email to lead ───────────────────────────────────────────────────────
async function sendBrevoEmail({ to, name, careType, urgency }) {
  if (!BREVO_API_KEY || !to) return;
  const first = name ? name.split(' ')[0] : 'there';
  const subject = `We're on it — your senior care match, ${first}`;
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:30px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#1a3d5c;padding:24px 32px;">
          <span style="font-family:Georgia,serif;font-size:20px;color:#fff;letter-spacing:1px;font-weight:bold;">CareCircle Network</span>
          <span style="font-family:Arial,sans-serif;font-size:11px;color:#7fb3d0;letter-spacing:2px;margin-left:10px;">// GULF COAST</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:16px;color:#1a1a1a;margin:0 0 16px;">Hey ${first},</p>
          <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 16px;">
            Got your request — I'm Chase, and I personally review every match that comes through CareCircle.
          </p>
          <p style="font-size:15px;color:#333;line-height:1.7;margin:0 0 20px;">
            Here's what happens next: I'm pulling up the licensed, vetted agencies that best match <strong>${careType || 'your care needs'}</strong>
            in your area and I'll reach out directly — usually within the hour.
          </p>
          <table width="100%" cellpadding="12" cellspacing="0" style="background:#f0f7ff;border-left:3px solid #1a3d5c;border-radius:3px;margin:0 0 24px;">
            <tr><td>
              <p style="font-size:13px;color:#555;margin:0 0 6px;"><strong>What makes CareCircle different:</strong></p>
              <p style="font-size:13px;color:#555;margin:0 0 4px;">✓ Free matching — agencies pay us, never families</p>
              <p style="font-size:13px;color:#555;margin:0 0 4px;">✓ Every agency is licensed, bonded &amp; insured — verified</p>
              <p style="font-size:13px;color:#555;margin:0 0 4px;">✓ We surface hidden gems most families never find</p>
              <p style="font-size:13px;color:#555;margin:0;">✓ Real human guidance — not a wall of listings</p>
            </td></tr>
          </table>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr><td style="background:#1a3d5c;border-radius:3px;">
              <a href="tel:8503414324" style="display:block;padding:14px 28px;color:#fff;font-weight:bold;font-size:15px;text-decoration:none;letter-spacing:1px;">📞 Call Chase Directly — (850) 341-4324</a>
            </td></tr>
          </table>
          <p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 20px;">
            Or just reply to this email — I'll see it.
          </p>
          <p style="font-size:14px;color:#333;margin:0;">
            — Chase<br>
            <span style="color:#888;font-size:12px;">CareCircle Network · Gulf Coast Florida · (850) 341-4324</span>
          </p>
        </td></tr>
        <tr><td style="background:#f5f5f5;padding:16px 32px;border-top:1px solid #eee;">
          <p style="font-size:11px;color:#aaa;margin:0;line-height:1.5;">
            You're receiving this because you submitted a care request at care-circle-nu.vercel.app.
            Reply STOP to opt out. CareCircle Network · 11000 Tanton Lane, Pensacola FL 32506
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
        to: [{ email: to, name: name || '' }],
        subject,
        htmlContent: html,
      }),
    });
  } catch (e) {
    console.error('Brevo error:', e.message);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    name,
    phone,
    email,
    city,
    careType,
    forWhom,
    urgency,
  } = req.body || {};

  // Require at least a phone number
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  // Normalize phone to E.164
  const digits = phone.replace(/\D/g, '');
  const e164 = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;

  const results = { smsToLead: null, alertToChase: null, contactSaved: null, emailSent: null };

  // ── 1. SMS to lead ───────────────────────────────────────────────────────
  try {
    const leadSMS = buildLeadSMS(name, careType, urgency);
    const r = await fetch(`${CLAW_BASE}/api/twilio?action=sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: e164, body: leadSMS }),
    });
    const d = await r.json();
    results.smsToLead = d.success ? 'sent' : `failed: ${d.error}`;
  } catch (e) {
    results.smsToLead = `error: ${e.message}`;
  }

  // ── 2. Alert SMS to Chase ────────────────────────────────────────────────
  try {
    const alertSMS = buildAlertSMS(name, e164, city, careType, urgency, forWhom);
    const r = await fetch(`${CLAW_BASE}/api/twilio?action=sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: CHASE_PHONE, body: alertSMS }),
    });
    const d = await r.json();
    results.alertToChase = d.success ? 'sent' : `failed: ${d.error}`;
  } catch (e) {
    results.alertToChase = `error: ${e.message}`;
  }

  // ── 3. Save contact to CLAW ──────────────────────────────────────────────
  try {
    const r = await fetch(`${CLAW_BASE}/api/twilio?action=save-carecircle-lead`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name || '',
        phone: e164,
        email: email || '',
        business_name: '',
        notes: `CareCircle lead — ${careType || ''} | For: ${forWhom || ''} | Urgency: ${urgency || ''} | City: ${city || ''}`,
        list_name: 'CareCircle',
        status: 'new',
      }),
    });
    const d = await r.json();
    results.contactSaved = d.ok ? 'saved' : `failed: ${d.error}`;
  } catch (e) {
    results.contactSaved = `error: ${e.message}`;
  }

  // ── 4. Brevo email to lead (if email provided) ───────────────────────────
  if (email) {
    try {
      await sendBrevoEmail({ to: email, name, careType, urgency });
      results.emailSent = 'sent';
    } catch (e) {
      results.emailSent = `error: ${e.message}`;
    }
  } else {
    results.emailSent = 'skipped (no email)';
  }

  return res.status(200).json({ ok: true, results });
}
