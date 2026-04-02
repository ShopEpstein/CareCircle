export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (!KV_URL || !KV_TOKEN) {
    return res.status(503).json({ error: 'KV not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN in Vercel environment variables.' });
  }

  async function kvCmd(...args) {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const data = await r.json();
    return data.result ?? null;
  }

  if (req.method === 'GET') {
    const [rawC, rawA] = await Promise.all([
      kvCmd('GET', 'cc_candidates'),
      kvCmd('GET', 'cc_ads'),
    ]);
    return res.status(200).json({
      candidates: rawC ? JSON.parse(rawC) : [],
      ads: rawA ? JSON.parse(rawA) : [],
    });
  }

  if (req.method === 'POST') {
    const { candidates, ads } = req.body;
    const ops = [];
    if (candidates !== undefined) ops.push(kvCmd('SET', 'cc_candidates', JSON.stringify(candidates)));
    if (ads !== undefined) ops.push(kvCmd('SET', 'cc_ads', JSON.stringify(ads)));
    await Promise.all(ops);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
