// api/backfill-training.js
// One-shot admin endpoint: looks up a contractor by email, marks all their
// role-appropriate training modules as complete in training_progress.
//
// POST /api/backfill-training
// Headers: x-admin-token: <ADMIN_PASSWORD>
// Body: { email: "brittany@..." }

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://dzbhoycmgaofvrpfajpc.supabase.co';

const ROLE_MODS = {
  b2b:  ['orientation','products','commission','b2b_pitch','b2b_obj','as_mod','activity','roleplay'],
  b2c:  ['orientation','products','commission','b2c_pitch','b2c_obj','as_mod','activity','roleplay'],
  as:   ['orientation','products','commission','b2b_pitch','b2b_obj','as_mod','activity','roleplay'],
  rsm:  ['orientation','products','commission','b2b_pitch','b2b_obj','b2c_pitch','b2c_obj','as_mod','activity','roleplay'],
};

const MOD_TITLES = {
  orientation: 'Company Orientation & Mission',
  products:    'Products & Pricing',
  commission:  'Your Commission Structure',
  b2b_pitch:   'The B2B Cold Call & Drop-In',
  b2b_obj:     'B2B Objection Handling',
  b2c_pitch:   'The B2C Family Outreach Script',
  b2c_obj:     'B2C Objection Handling',
  as_mod:      'Assisting Seniors Referrals',
  activity:    'Activity Standards & KPIs',
  roleplay:    'Role-Play Prep & Practice Assignment',
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const token = req.headers['x-admin-token'];
  if (!token || token !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  // Look up their name and role from contractor_submissions
  const { data: contractor, error: lookupErr } = await supabase
    .from('contractor_submissions')
    .select('legal_name, assigned_role')
    .eq('email', email.toLowerCase().trim())
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single();

  if (lookupErr || !contractor) {
    return res.status(404).json({ error: 'Contractor not found for that email.' });
  }

  const { legal_name: name, assigned_role: role } = contractor;
  const mods = ROLE_MODS[role] || ROLE_MODS['b2c'];
  const completedAt = new Date().toISOString();
  const errors = [];

  for (const mod_id of mods) {
    const { error } = await supabase
      .from('training_progress')
      .upsert({
        email:        email.toLowerCase().trim(),
        name,
        role,
        module_id:    mod_id,
        module_title: MOD_TITLES[mod_id] || mod_id,
        quiz_score:   null,
        completed_at: completedAt,
      }, { onConflict: 'email,module_id' });
    if (error) errors.push(`${mod_id}: ${error.message}`);
  }

  return res.status(200).json({
    ok: true,
    name,
    role,
    modules_written: mods.length - errors.length,
    total_modules: mods.length,
    errors: errors.length ? errors : undefined,
  });
};
