export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_KEY;
  const headers = {
    'apikey': sbKey,
    'Authorization': `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  };

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${sbUrl}/rest/v1/kb_videos?order=created_at.desc`, { headers });
      const data = await r.json();
      return res.status(200).json({ videos: Array.isArray(data) ? data : [] });

    } else if (req.method === 'POST') {
      const { title, url, notes, category } = req.body;
      if (!title || !url) return res.status(400).json({ error: 'title and url required' });
      const r = await fetch(`${sbUrl}/rest/v1/kb_videos`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ title, url, notes: notes || null, category: category || null }),
      });
      const data = await r.json();
      return res.status(201).json({ video: Array.isArray(data) ? data[0] : data });

    } else if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      await fetch(`${sbUrl}/rest/v1/kb_videos?id=eq.${id}`, { method: 'DELETE', headers });
      return res.status(200).json({ ok: true });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('KB videos error:', error);
    return res.status(500).json({ error: 'Failed to process request', message: error.message });
  }
}
