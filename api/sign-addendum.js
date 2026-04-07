// api/sign-addendum.js
// GET  /api/sign-addendum?id=ADD-001-CONNELY       — fetch addendum record
// POST /api/sign-addendum                           — submit e-signature

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://dzbhoycmgaofvrpfajpc.supabase.co';

async function sendEmail(subject, html) {
  const key = process.env.BREVO_API_KEY;
  if (!key) return;
  await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'accept': 'application/json', 'api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'CareCircle Contracts', email: 'campaigns@transbidlive.faith' },
      to: [
        { email: 'contactfire757@gmail.com', name: 'Chase Turnquest' },
        { email: 'campaigns@transbidlive.faith', name: 'CareCircle Inbox' }
      ],
      subject, htmlContent: html
    })
  });
}

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://carecircle.fit', 'https://www.carecircle.fit'];
  res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : 'https://carecircle.fit');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  // ── GET: fetch addendum by id ─────────────────────────
  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const { data, error } = await supabase
      .from('contractor_addendums')
      .select('addendum_id, contractor_name, contractor_email, addendum_title, terms_json, agreed, signed_at_display')
      .eq('addendum_id', id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Addendum not found' });
    return res.status(200).json(data);
  }

  // ── POST: sign addendum ───────────────────────────────
  if (req.method === 'POST') {
    const { addendum_id, signer_legal_name, agreed } = req.body || {};
    if (!addendum_id || !signer_legal_name || !agreed) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const now = new Date();
    const display = now.toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'full', timeStyle: 'short' }) + ' CT';

    const { data: existing } = await supabase
      .from('contractor_addendums')
      .select('id, agreed, contractor_name, contractor_email, addendum_title')
      .eq('addendum_id', addendum_id)
      .single();

    if (!existing) return res.status(404).json({ error: 'Addendum not found' });
    if (existing.agreed) return res.status(409).json({ error: 'Already signed' });

    const { error } = await supabase
      .from('contractor_addendums')
      .update({ signer_legal_name, agreed: true, signed_at: now.toISOString(), signed_at_display: display })
      .eq('addendum_id', addendum_id);

    if (error) return res.status(500).json({ error: error.message });

    sendEmail(
      `✅ Addendum Signed — ${existing.contractor_name} · ${existing.addendum_title}`,
      `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#1a2f5a">Addendum Signed</h2>
        <table style="width:100%;border-collapse:collapse;margin-top:16px">
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600;width:160px">Addendum</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${existing.addendum_title}</td></tr>
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600">Contractor</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${existing.contractor_name}</td></tr>
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600">Email</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${existing.contractor_email}</td></tr>
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600">Signed As</td><td style="padding:8px 12px;border-bottom:1px solid #eee">${signer_legal_name}</td></tr>
          <tr><td style="padding:8px 12px;background:#f5f5f0;font-weight:600">Timestamp</td><td style="padding:8px 12px">${display}</td></tr>
        </table>
        <p style="margin-top:20px;color:#888;font-size:12px">CareCircle Contracts · TransBid LLC</p>
      </div>`
    ).catch(() => {});

    return res.status(200).json({ ok: true, signed_at_display: display });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
