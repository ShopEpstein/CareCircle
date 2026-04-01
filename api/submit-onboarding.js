// api/submit-onboarding.js
// CareCircle Network — Contractor Onboarding Submission Handler
// Vercel serverless function — runs server-side with service_role key
// Sensitive data (SSN/EIN/routing/account) never touches the browser in plaintext
//
// Deploy: drop this file in /api/ in the CareCircle repo — Vercel auto-routes it
// Endpoint: POST /api/submit-onboarding

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://dzbhoycmgaofvrpfajpc.supabase.co';

// SERVICE_ROLE key — set this in Vercel environment variables, NEVER hardcode
// Vercel Dashboard → CareCircle project → Settings → Environment Variables
// Key: SUPABASE_SERVICE_ROLE_KEY
// Value: (paste service role key from Supabase → Project Settings → API → service_role)
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Encryption passphrase for pgcrypto — set in Vercel env vars
// Key: SENSITIVE_DATA_ENCRYPTION_KEY
// Value: generate a strong random string and store it — NEVER change it after first use
const ENCRYPTION_KEY = process.env.SENSITIVE_DATA_ENCRYPTION_KEY;

module.exports = async function handler(req, res) {
  // CORS — allow from carecircle.fit and local dev
  res.setHeader('Access-Control-Allow-Origin', 'https://care-circle-nu.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_SERVICE_ROLE_KEY || !ENCRYPTION_KEY) {
    console.error('Missing environment variables: SUPABASE_SERVICE_ROLE_KEY or SENSITIVE_DATA_ENCRYPTION_KEY');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Service role client — bypasses RLS, used only server-side
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  try {
    const payload = req.body;

    // ── Basic validation ──────────────────────────────────────
    if (!payload.legal_name || !payload.email || !payload.assigned_role) {
      return res.status(400).json({ error: 'Missing required fields: legal_name, email, assigned_role' });
    }

    const submissionId = payload.submission_id || ('OB-' + Date.now());
    const sessionToken = payload.session_token || 'unknown';
    const submittedAt = new Date().toISOString();

    // ── 1. Insert core contractor record ─────────────────────
    const { data: submission, error: submissionError } = await supabase
      .from('contractor_submissions')
      .insert({
        submission_id:          submissionId,
        session_token:          sessionToken,
        submitted_at:           submittedAt,
        status:                 'complete',
        legal_name:             payload.legal_name,
        preferred_name:         payload.preferred_name || null,
        email:                  payload.email,
        phone:                  payload.phone,
        mailing_address:        payload.mailing_address,
        emergency_contact:      payload.emergency_contact,
        assigned_role:          payload.assigned_role,
        assigned_role_label:    payload.assigned_role_label || null,
        prefilled_by_admin:     payload.prefilled_by_admin || false,
        authorized_products:    payload.authorized_products || [],
        sales_experience_years: payload.sales_experience_years || null,
        experience_notes:       payload.experience_notes || null,
        prior_experience_tags:  payload.prior_experience_tags || [],
        has_transportation:     payload.has_transportation || false,
        vehicle_type:           payload.vehicle_type || null,
        availability:           payload.availability || null,
        working_hours_pref:     payload.working_hours_pref || null,
        work_method:            payload.work_method || null,
        geography:              payload.geography || null,
        has_smartphone:         payload.has_smartphone || false,
        has_laptop:             payload.has_laptop || false,
        has_quiet_space:        payload.has_quiet_space || false,
        has_daily_email:        payload.has_daily_email || false,
        has_call_log:           payload.has_call_log || false,
        payment_method:         payload.payment_method || 'ach',
        bank_name:              payload.bank_name || null,
        zelle_contact:          payload.zelle_contact || null,
        w9_entity_type:         payload.w9_entity_type || null,
        w9_business_name:       payload.w9_business_name || null,
        w9_address:             payload.w9_address || null,
        w9_city:                payload.w9_city || null,
        w9_state:               payload.w9_state || null,
        w9_zip:                 payload.w9_zip || null,
        commission_tier:        'silver',
        relationship_closer:    false,
      })
      .select('id')
      .single();

    if (submissionError) {
      console.error('Submission insert error:', submissionError);
      return res.status(500).json({ error: 'Failed to save contractor record', detail: submissionError.message });
    }

    const submissionUUID = submission.id;

    // ── 2. Insert document acknowledgments ───────────────────
    const docAcks = [];

    if (payload.ica_signature) {
      docAcks.push({
        submission_id:        submissionUUID,
        document_type:        'independent_contractor_agreement',
        signer_legal_name:    payload.ica_signature.name,
        agreed:               payload.ica_signature.agreed,
        signed_at:            submittedAt,
        signed_at_display:    payload.ica_signature.timestamp_display,
        checkboxes_confirmed: payload.ica_signature.checkboxes || ['ica_agree'],
        document_version:     '1.0',
      });
    }

    if (payload.exhibit_signature) {
      docAcks.push({
        submission_id:        submissionUUID,
        document_type:        'commission_schedule_exhibit_a',
        signer_legal_name:    payload.exhibit_signature.name,
        agreed:               payload.exhibit_signature.agreed,
        signed_at:            submittedAt,
        signed_at_display:    payload.exhibit_signature.timestamp_display,
        checkboxes_confirmed: payload.exhibit_signature.checkboxes || ['exhibit_agree'],
        document_version:     '1.0',
      });
    }

    if (payload.handbook_signature) {
      docAcks.push({
        submission_id:        submissionUUID,
        document_type:        'contractor_handbook_receipt',
        signer_legal_name:    payload.handbook_signature.name,
        agreed:               true,
        signed_at:            submittedAt,
        signed_at_display:    submittedAt,
        checkboxes_confirmed: payload.handbook_signature.checkboxes || [
          'handbook_received', 'handbook_understand', 'handbook_confidential'
        ],
        document_version:     '1.0',
      });
    }

    if (docAcks.length > 0) {
      const { error: docError } = await supabase
        .from('document_acknowledgments')
        .insert(docAcks);

      if (docError) {
        console.error('Doc acks insert error:', docError);
        // Non-fatal — log but continue
      }
    }

    // ── 3. Insert sensitive data (encrypted via pgcrypto) ────
    // Only processed server-side. Never returned to browser.
    if (payload.sensitive) {
      const s = payload.sensitive;

      // Use pgcrypto pgp_sym_encrypt via raw SQL
      const sensitiveInsert = await supabase.rpc('insert_sensitive_contractor_data', {
        p_submission_id:       submissionUUID,
        p_tax_id_type:         s.tax_id_type || null,
        p_tax_id:              s.tax_id || null,
        p_bank_routing:        s.bank_routing || null,
        p_bank_account:        s.bank_account || null,
        p_bank_account_type:   s.bank_account_type || null,
        p_encryption_key:      ENCRYPTION_KEY,
      });

      if (sensitiveInsert.error) {
        console.error('Sensitive data insert error:', sensitiveInsert.error);
        // Log for manual recovery — don't fail the whole submission
      }
    }

    // ── 4. Insert final acknowledgments ──────────────────────
    if (payload.final_acknowledgments) {
      const fa = payload.final_acknowledgments;
      const { error: ackError } = await supabase
        .from('onboarding_final_acknowledgments')
        .insert({
          submission_id:         submissionUUID,
          ack_handbook:          fa.ack_handbook || false,
          ack_commission:        fa.ack_commission || false,
          ack_commission_only:   fa.ack_commission_only || false,
          ack_clawback:          fa.ack_clawback || false,
          ack_confidentiality:   fa.ack_confidentiality || false,
          ack_private_pay:       fa.ack_private_pay || false,
          ack_assisting_seniors: fa.ack_assisting_seniors || false,
          ack_conduct:           fa.ack_conduct || false,
          confirmed_at:          submittedAt,
        });

      if (ackError) {
        console.error('Final acks insert error:', ackError);
      }
    }

    // ── 5. Mark prefill token as used (if applicable) ────────
    if (payload.prefill_token) {
      await supabase
        .from('admin_prefill_tokens')
        .update({ used: true, used_at: submittedAt })
        .eq('token', payload.prefill_token)
        .eq('used', false);
    }

    // ── 6. Respond success ───────────────────────────────────
    return res.status(200).json({
      success: true,
      submission_id: submissionId,
      internal_id: submissionUUID,
      submitted_at: submittedAt,
    });

  } catch (err) {
    console.error('Unhandled error in submit-onboarding:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
};
