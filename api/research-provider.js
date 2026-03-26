// /api/research-provider.js
// AI-powered provider research endpoint for CareCircle Network
// Calls Claude with web search to research a senior care provider
// Returns formatted JSON for providers.json + sends SMS alert to Chase

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { providerName, city, submittedBy } = req.body || {};
  if (!providerName) return res.status(400).json({ error: 'providerName required' });

  const location = city || 'Northwest Florida';
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
  const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
  const TWILIO_FROM = '+18559600110';
  const CHASE_PHONE = '+18503414324';

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    // Step 1: Send Chase an SMS that research is starting
    if (TWILIO_SID && TWILIO_AUTH) {
      await sendSMS(
        TWILIO_SID, TWILIO_AUTH, TWILIO_FROM, CHASE_PHONE,
        `🔔 CARECIRCLE RESEARCH\nResearching: ${providerName}\nLocation: ${location}\n${submittedBy ? 'Submitted by: ' + submittedBy : 'Admin request'}\nProcessing now...`
      );
    }

    // Step 2: Call Claude API with web search to research the provider
    const researchPrompt = `Research the senior care provider "${providerName}" in ${location}, Florida. 

Search for and compile data from these sources:
1. Google Reviews - star rating, review count, 2-3 representative family quotes
2. FL AHCA (Agency for Health Care Administration) - license status, enforcement actions, complaints
3. CMS Medicare Compare - star ratings, health inspection results (if applicable)
4. BBB - accreditation, complaint count
5. Employee reviews on Indeed/Glassdoor (if available)
6. ProPublica Nursing Home Inspector (if nursing home/rehab)
7. Ownership info - independent vs chain, founded year, owner name

Based on your research, create a JSON object in this EXACT format. Use ONLY real data you found. If data is unavailable, say so in the gaps field. Score 0-10 based on what you found:

{
  "key": "lowercase-hyphenated-name",
  "name": "Full Legal Name",
  "loc": "City, FL",
  "type": "Type of care · Ownership type",
  "founded": YEAR_OR_NULL,
  "ownership": "Ownership details",
  "scores": {
    "overall": "X.X",
    "google": "X.X★ (N reviews)",
    "staff": "X.X★ or Not found",
    "complaints": "Description"
  },
  "sc": {
    "overall": "sc-good|sc-warn|sc-bad",
    "google": "sc-good|sc-warn|sc-bad",
    "staff": "sc-good|sc-warn|sc-bad",
    "complaints": "sc-good|sc-warn|sc-bad"
  },
  "green": [
    {"t": "Short strength title", "b": "Detailed explanation with specific evidence"}
  ],
  "red": [
    {"t": "Short concern title", "b": "Detailed explanation with specific evidence"}
  ],
  "findings": [
    {"t": "good|warn|bad|info", "title": "Finding title", "detail": "Details", "src": "Source name"}
  ],
  "quotes": [
    {"t": "Actual quote text", "a": "Attribution - Source, Date"}
  ],
  "compare": "2-3 sentence overall assessment",
  "gaps": "What data was unavailable"
}

IMPORTANT: 
- Only include REAL data you found via search. Do not fabricate reviews, scores, or quotes.
- If you can't find much data, say so honestly in the gaps field and lower the overall score.
- Score guide: 8.5+ = Excellent (strong across all sources), 7-8.4 = Good, 5.5-6.9 = Mixed signals, below 5.5 = High concern
- Return ONLY the JSON object, no other text.`;

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search'
        }],
        messages: [{
          role: 'user',
          content: researchPrompt
        }]
      })
    });

    if (!claudeResponse.ok) {
      const errText = await claudeResponse.text();
      throw new Error(`Claude API error: ${claudeResponse.status} - ${errText}`);
    }

    const claudeData = await claudeResponse.json();
    
    // Extract the text response (may have multiple content blocks due to tool use)
    let responseText = '';
    for (const block of claudeData.content || []) {
      if (block.type === 'text') {
        responseText += block.text;
      }
    }

    // Parse the JSON from the response
    let providerData;
    try {
      // Clean up potential markdown code fences
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      providerData = JSON.parse(cleaned);
    } catch (parseErr) {
      // If parsing fails, send the raw response to Chase
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

    // Step 3: Send Chase the summary SMS
    const score = providerData.scores?.overall || '?';
    const greenCount = providerData.green?.length || 0;
    const redCount = providerData.red?.length || 0;
    
    if (TWILIO_SID && TWILIO_AUTH) {
      await sendSMS(
        TWILIO_SID, TWILIO_AUTH, TWILIO_FROM, CHASE_PHONE,
        `✅ RESEARCH DONE\n${providerData.name || providerName}\nScore: ${score}/10\n🟢 ${greenCount} strengths\n🔴 ${redCount} concerns\nGoogle: ${providerData.scores?.google || 'N/A'}\nComplaints: ${providerData.scores?.complaints || 'N/A'}\n\nJSON ready to add to providers.json`
      );
    }

    // Return the formatted provider data
    return res.status(200).json({
      success: true,
      parsed: true,
      provider: providerData,
      key: providerData.key || providerName.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-'),
      message: `Research complete for ${providerData.name}. Add to providers.json under key "${providerData.key}".`
    });

  } catch (err) {
    console.error('Research error:', err);
    
    // Alert Chase of failure
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
