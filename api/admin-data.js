// api/admin-data.js
// Admin-only data API — uses service_role key to bypass RLS
// Protected by ADMIN_PASSWORD environment variable
// Endpoint: GET /api/admin-data?action=verify|list|record&id=UUID

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://dzbhoycmgaofvrpfajpc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://carecircle.fit');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Validate admin password
  const token = req.headers['x-admin-token'];
  if (!ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD environment variable not set' });
  }
  if (!token || token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY environment variable not set' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const { action, id, status } = req.query;

  // ── Verify password only ─────────────────────────────────
  if (action === 'verify') {
    return res.status(200).json({ ok: true });
  }

  // ── List all submissions ─────────────────────────────────
  if (action === 'list') {
    let query = supabase
      .from('admin_onboarding_view')
      .select('*')
      .order('submitted_at', { ascending: false })
      .limit(200);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  // ── Single record detail ─────────────────────────────────
  if (action === 'record') {
    if (!id) return res.status(400).json({ error: 'Missing id parameter' });

    const [r1, r2, r3] = await Promise.all([
      supabase.from('contractor_submissions').select('*').eq('id', id).single(),
      supabase.from('document_acknowledgments')
        .select('document_type,signer_legal_name,agreed,signed_at_display')
        .eq('submission_id', id),
      supabase.from('onboarding_final_acknowledgments')
        .select('all_confirmed,confirmed_at')
        .eq('submission_id', id),
    ]);

    if (r1.error || !r1.data) return res.status(404).json({ error: 'Record not found' });
    return res.status(200).json({ record: r1.data, docs: r2.data || [], acks: r3.data || [] });
  }

  return res.status(400).json({ error: 'Invalid action. Use: verify, list, or record' });
};
