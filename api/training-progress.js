// api/training-progress.js
// Records module completions and quiz scores to Supabase training_progress table.
// Sends a notification email to Chase via Brevo on every event.
//
// POST /api/training-progress
// Body: {
//   email, name, role,
//   module_id, module_title,
//   quiz_score (0–100 or null),
//   modules_completed, total_modules, all_complete,
//   schedule_data (optional — for session requests)
// }

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://dzbhoycmgaofvrpfajpc.supabase.co';
const ROLE_LABELS = {
  b2b: 'Territory Field Rep (B2B)',
  b2c: 'Family Outreach Rep (B2C)',
  as:  'Assisting Seniors BDR',
  rsm: 'Regional Sales Manager'
};

async function sendEmail(subject, htmlContent) {
  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_KEY) return;
  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': BREVO_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      sender: { name: 'CareCircle Training', email: 'campaigns@transbidlive.faith' },
      to: [
        { email: 'contactfire757@gmail.com', name: 'Chase Turnquest' },
        { email: 'campaigns@transbidlive.faith', name: 'CareCircle Inbox' }
      ],
      subject,
      htmlContent
    })
  });
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://carecircle.fit', 'https://www.carecircle.fit'];
  res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : 'https://carecircle.fit');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    email, name, role,
    module_id, module_title,
    quiz_score,
    modules_completed, total_modules, all_complete,
    schedule_data
  } = req.body || {};

  if (!email || !name || !role || !module_id) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const completedAt = new Date().toISOString();
  const roleLabel = ROLE_LABELS[role] || role;

  // Upsert — if they redo a module, update the score and timestamp
  const { error: dbError } = await supabase
    .from('training_progress')
    .upsert({
      email:         email.toLowerCase().trim(),
      name,
      role,
      module_id,
      module_title,
      quiz_score:    quiz_score ?? null,
      completed_at:  completedAt
    }, { onConflict: 'email,module_id' });

  if (dbError) {
    console.error('training_progress upsert error:', dbError);
    // Non-fatal — still send email
  }

  // ── Build notification email ──────────────────────────────────
  const isScheduleRequest = module_id === 'schedule_request';
  const scoreText = quiz_score != null ? ` &nbsp;·&nbsp; Score: <strong>${quiz_score}%</strong>` : '';
  const progressText = (modules_completed != null && total_modules != null)
    ? `${modules_completed} of ${total_modules} modules complete`
    : '';
  const completionBadge = all_complete
    ? `<div style="background:#22c55e;color:#fff;padding:10px 18px;border-radius:8px;font-weight:700;font-size:15px;display:inline-block;margin-bottom:16px">🎓 ALL MODULES COMPLETE</div><br>`
    : '';

  let subject, htmlContent;

  if (isScheduleRequest && schedule_data) {
    subject = `📅 Session Request — ${name} (${roleLabel})`;
    htmlContent = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#1a2f5a;margin-bottom:4px">Role-Play Session Request</h2>
        <p style="color:#666;margin-top:0">${new Date(completedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600;width:140px">Name</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${name}</td></tr>
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600">Email</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${email}</td></tr>
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600">Role</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${roleLabel}</td></tr>
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600">Session Type</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${schedule_data.type || '—'}</td></tr>
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600">Preferred Day</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${schedule_data.day || '—'}</td></tr>
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600">Preferred Time</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${schedule_data.time || '—'}</td></tr>
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600">Notes</td><td style="padding:8px 12px">${schedule_data.notes || '—'}</td></tr>
        </table>
        <p style="margin-top:20px;color:#888;font-size:12px">Sent from CareCircle Training Portal</p>
      </div>`;
  } else {
    const eventLabel = all_complete ? '🎓 Training Complete' : '📘 Module Completed';
    subject = `${eventLabel} — ${name} · ${module_title}`;
    htmlContent = `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#1a2f5a;margin-bottom:4px">${eventLabel}</h2>
        <p style="color:#666;margin-top:0">${new Date(completedAt).toLocaleString('en-US', { timeZone: 'America/Chicago' })} CT</p>
        ${completionBadge}
        <table style="width:100%;border-collapse:collapse;margin-top:8px">
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600;width:140px">Name</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${name}</td></tr>
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600">Email</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${email}</td></tr>
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600">Role</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${roleLabel}</td></tr>
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600">Module</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${module_title}${scoreText}</td></tr>
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600">Progress</td><td style="padding:8px 12px">${progressText || '—'}</td></tr>
        </table>
        <p style="margin-top:20px;color:#888;font-size:12px">Sent from CareCircle Training Portal</p>
      </div>`;
  }

  // Fire email — non-blocking, don't fail the response if it errors
  sendEmail(subject, htmlContent).catch(e => console.error('Email send error:', e));

  return res.status(200).json({ ok: true });
};
