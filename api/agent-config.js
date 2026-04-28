export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const headers = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${supabaseUrl}/rest/v1/agent_config?order=updated_at.desc&limit=1`, { headers });
      const data = await r.json();
      const config = Array.isArray(data) && data.length > 0 ? data[0] : null;
      return res.status(200).json({ config });

    } else if (req.method === 'POST') {
      const body = req.body;
      const r = await fetch(`${supabaseUrl}/rest/v1/agent_config`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
      });
      const data = await r.json();
      return res.status(201).json({ config: Array.isArray(data) ? data[0] : data });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Agent config error:', error);
    return res.status(500).json({ error: 'Failed to process request', message: error.message });
  }
}
