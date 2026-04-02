// /api/research-provider.js
// AI-powered provider research endpoint for CareCircle Network
// Calls Claude with web search using the 7-dimension scoring algorithm
// Saves results to Supabase providers table and sends SMS alert to Chase

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://dzbhoycmgaofvrpfajpc.supabase.co';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { providerName, city, type, context, submittedBy, force } = req.body || {};
  if (!providerName) return res.status(400).json({ error: 'providerName required' });

  const location = city || 'Northwest Florida';
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_FROM = '+18559600110';
  const CHASE_PHONE = '+18503414324';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Step 0: Check Supabase cache — return existing profile instantly if found (skip Claude)
  if (supabaseKey && !force) {
    try {
      const supabase = createClient(SUPABASE_URL, supabaseKey, { auth: { persistSession: false } });
      const providerKey = providerName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const { data: cached } = await supabase
        .from('providers')
        .select('*')
        .eq('provider_key', providerKey)
        .maybeSingle();
      if (cached) {
        return res.status(200).json({
          success: true,
          parsed: true,
          savedToDb: true,
          cached: true,
          provider: cached,
          key: providerKey
        });
      }
    } catch (cacheErr) {
      // Cache lookup failed — fall through to fresh research
      console.error('Cache lookup error:', cacheErr.message);
    }
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    // Step 1: SMS Chase that research is starting
    if (TWILIO_SID && TWILIO_AUTH) {
      await sendSMS(
        TWILIO_SID, TWILIO_AUTH, TWILIO_FROM, CHASE_PHONE,
        `🔔 CARECIRCLE RESEARCH\nResearching: ${providerName}\nLocation: ${location}\n${submittedBy ? 'Submitted by: ' + submittedBy : 'Admin request'}\nProcessing now...`
      );
    }

    // Step 2: Call Claude with web search — 7-dimension scoring algorithm
    const systemPrompt = `You are a senior healthcare intelligence analyst building a high-integrity provider profile for CareCircle.

Your objective is NOT to summarize. Your objective is to EXPOSE REALITY using public, semi-public, and inferable data.

STRICT RULES:
- Do NOT fabricate data. If unknown → say UNKNOWN.
- Prefer patterns over anecdotes.
- Highlight contradictions clearly.
- Be skeptical of marketing claims.
- Assume families are making high-stakes decisions.
- Unknown data must penalize scores. Do not inflate.
- Safety and staffing must be heavily weighted.

SCORING FORMULA (weights):
- Compliance & Safety: 25%
- Clinical Risk: 20%
- Staffing Stability: 20%
- Family Experience: 15%
- Pricing Fairness: 8%
- Transparency: 7%
- Ownership Risk: 5%
- Penalty: −0.5 per significant unknown data gap
- Overall score cannot exceed 10.0, cannot be below 1.0

DATA SCHEMA — Return ONLY a valid JSON object matching this exact schema. No markdown, no commentary, no extra text. Only the JSON object.

{
  "name": "Full provider name",
  "loc": "City, State",
  "type": "Provider type",
  "founded": null or year as number,
  "ownership": "Description of ownership type and owner",
  "scores": {
    "compliance": "X.X/10",
    "clinical": "X.X/10",
    "staffing": "X.X/10",
    "family_experience": "X.X/10",
    "pricing": "X.X/10",
    "transparency": "X.X/10",
    "ownership_risk": "X.X/10",
    "overall": "X.X"
  },
  "score_colors": {
    "compliance": "sc-good|sc-warn|sc-bad|sc-unknown",
    "clinical": "sc-good|sc-warn|sc-bad|sc-unknown",
    "staffing": "sc-good|sc-warn|sc-bad|sc-unknown",
    "family_experience": "sc-good|sc-warn|sc-bad|sc-unknown",
    "pricing": "sc-good|sc-warn|sc-bad|sc-unknown",
    "transparency": "sc-good|sc-warn|sc-bad|sc-unknown",
    "ownership_risk": "sc-good|sc-warn|sc-bad|sc-unknown",
    "overall": "sc-good|sc-warn|sc-bad"
  },
  "clinical_risk_level": "LOW|MODERATE|HIGH|UNKNOWN",
  "recommendation": "RECOMMEND|RECOMMEND_WITH_CAUTION|DO_NOT_RECOMMEND",
  "confidence_pct": 0-100,
  "green": [
    {"t": "Short strength title", "b": "Evidence-backed detail"}
  ],
  "red": [
    {"t": "Short concern title", "b": "Evidence-backed detail"}
  ],
  "findings": [
    {"t": "good|warn|bad|info", "title": "Finding title", "detail": "Specific detail", "src": "Source name"}
  ],
  "quotes": [
    {"t": "Quote text (real if findable, skip if not)", "a": "Attribution — platform, stars, reviewer"}
  ],
  "marketing_claims": ["Claim 1", "Claim 2", "Claim 3"],
  "reality_signals": ["Reality 1", "Reality 2", "Reality 3"],
  "staffing_risk_patterns": ["Pattern 1", "Pattern 2"],
  "best_for": "One sentence: who this provider is best for",
  "avoid_if": "One sentence: who should avoid this provider",
  "compare_note": "2-3 sentence competitive context and summary",
  "gaps": "What we cannot verify — specific data gaps",
  "alternatives_note": "Any better alternatives to suggest, or null"
}

Score color rules:
- sc-good: 7.5+
- sc-warn: 5.0–7.4
- sc-bad: below 5.0
- sc-unknown: data genuinely unavailable

Recommendation rules:
- RECOMMEND: overall 8.0+
- RECOMMEND_WITH_CAUTION: 5.5–7.9
- DO_NOT_RECOMMEND: below 5.5

Use web search to find real data before scoring. Cross-reference: FL AHCA/FHF (quality.healthfinder.fl.gov), CMS Care Compare (medicare.gov/care-compare), Google reviews, Indeed/Glassdoor, Caring.com, A Place for Mom, Seniorly, BBB, news articles, OIG exclusion list.`;

    const userMessage = `Analyze this provider:
Provider Name: ${providerName}
Location: ${location}
${type ? `Type: ${type}` : ''}
${context ? `Additional context: ${context}` : ''}

Return ONLY the JSON object. No other text.`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      throw new Error(`Claude API error: ${claudeResponse.status} - ${errText}`);
    }

    const claudeData = await claudeResponse.json();

    // Extract text blocks (tool use produces multiple content blocks)
    let responseText = '';
    for (const block of claudeData.content || []) {
      if (block.type === 'text') responseText += block.text;
    }

    // Parse the JSON response
    let providerData;
    try {
      let clean = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const startIdx = clean.indexOf('{');
      const endIdx = clean.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        clean = clean.substring(startIdx, endIdx + 1);
      }
      providerData = JSON.parse(clean);
    } catch (parseErr) {
      if (TWILIO_SID && TWILIO_AUTH) {
        await sendSMS(
          TWILIO_SID, TWILIO_AUTH, TWILIO_FROM, CHASE_PHONE,
          `⚠️ RESEARCH COMPLETE (parse issue)\n${providerName}\nCouldn't auto-parse JSON. Check logs.\nRaw length: ${responseText.length} chars`
        );
      }
      return res.status(200).json({
        success: true,
        parsed: false,
        raw: responseText,
        message: 'Research complete but JSON parse failed. Raw response included.'
      });
    }

    // Step 3: Generate URL-safe provider key
    const providerKey = (providerData.name || providerName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Step 4: Save to Supabase providers table
    let savedToDb = false;
    if (supabaseKey) {
      try {
        const supabase = createClient(SUPABASE_URL, supabaseKey, {
          auth: { persistSession: false }
        });

        const { error: upsertError } = await supabase
          .from('providers')
          .upsert({
            provider_key: providerKey,
            name: providerData.name || providerName,
            loc: providerData.loc,
            type: providerData.type || type,
            founded: providerData.founded,
            ownership: providerData.ownership,
            overall_score: parseFloat(providerData.scores?.overall) || null,
            recommendation: providerData.recommendation,
            clinical_risk_level: providerData.clinical_risk_level,
            confidence_pct: providerData.confidence_pct,
            scores: providerData.scores,
            score_colors: providerData.score_colors,
            green: providerData.green,
            red: providerData.red,
            findings: providerData.findings,
            quotes: providerData.quotes,
            marketing_claims: providerData.marketing_claims,
            reality_signals: providerData.reality_signals,
            staffing_risk_patterns: providerData.staffing_risk_patterns,
            best_for: providerData.best_for,
            avoid_if: providerData.avoid_if,
            compare_note: providerData.compare_note,
            gaps: providerData.gaps,
            alternatives_note: providerData.alternatives_note,
            researched_by: submittedBy || 'admin',
            researched_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: 'provider_key' });

        if (upsertError) {
          console.error('Supabase upsert error:', upsertError.message);
        } else {
          savedToDb = true;
        }
      } catch (dbErr) {
        console.error('DB save error:', dbErr.message);
      }
    }

    // Step 5: SMS Chase the summary
    const score = providerData.scores?.overall || '?';
    const greenCount = providerData.green?.length || 0;
    const redCount = providerData.red?.length || 0;

    if (TWILIO_SID && TWILIO_AUTH) {
      await sendSMS(
        TWILIO_SID, TWILIO_AUTH, TWILIO_FROM, CHASE_PHONE,
        `✅ RESEARCH DONE\n${providerData.name || providerName}\nScore: ${score}/10\nRec: ${providerData.recommendation || 'N/A'}\n🟢 ${greenCount} strengths · 🔴 ${redCount} concerns\nConfidence: ${providerData.confidence_pct || '?'}%\n${savedToDb ? '✓ Saved to DB' : '⚠ DB save failed'}`
      );
    }

    return res.status(200).json({
      success: true,
      parsed: true,
      savedToDb,
      provider: providerData,
      key: providerKey
    });

  } catch (err) {
    console.error('Research error:', err);

    if (TWILIO_SID && TWILIO_AUTH) {
      try {
        await sendSMS(
          TWILIO_SID, TWILIO_AUTH, TWILIO_FROM, CHASE_PHONE,
          `❌ RESEARCH FAILED\n${providerName}\nError: ${err.message?.substring(0, 100)}`
        );
      } catch (smsErr) { /* silent */ }
    }

    return res.status(500).json({ error: 'Research failed', detail: err.message });
  }
}

async function sendSMS(sid, auth, from, to, body) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const encoded = Buffer.from(`${sid}:${auth}`).toString('base64');
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${encoded}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ To: to, From: from, Body: body })
  });
}
