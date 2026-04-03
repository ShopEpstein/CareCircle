// api/training-auth.js
// Validates that a training portal login email has a completed onboarding record
// in contractor_submissions. Blocks access if no record found.
//
// POST /api/training-auth
// Body: { email: string }
// Response: { allowed: true, name, role } | { allowed: false, reason }

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://dzbhoycmgaofvrpfajpc.supabase.co';

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowed = ['https://carecircle.fit', 'https://www.carecircle.fit'];
  res.setHeader('Access-Control-Allow-Origin', allowed.includes(origin) ? origin : 'https://carecircle.fit');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ allowed: false, reason: 'Valid email required.' });
  }

  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  const { data, error } = await supabase
    .from('contractor_submissions')
    .select('legal_name, assigned_role, status')
    .eq('email', email.toLowerCase().trim())
    .eq('status', 'complete')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return res.status(200).json({
      allowed: false,
      reason: 'No completed onboarding found for this email. Please complete contractor onboarding first or contact Chase.'
    });
  }

  return res.status(200).json({
    allowed: true,
    name: data.legal_name,
    role: data.assigned_role
  });
};
