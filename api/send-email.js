export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { subject, htmlContent } = req.body;
  if (!subject || !htmlContent) return res.status(400).json({ error: 'Missing fields' });

  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_KEY) return res.status(500).json({ error: 'API key not configured' });

  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'CareCircle Network', email: 'campaigns@transbidlive.faith' },
        to: [{ email: 'campaigns@transbidlive.faith', name: 'CareCircle Inbox' }],
        subject,
        htmlContent
      })
    });

    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
