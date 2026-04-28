export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
      const r = await fetch(`${supabaseUrl}/rest/v1/knowledge_snippets?order=created_at.desc`, { headers });
      const data = await r.json();
      return res.status(200).json({ snippets: data });

    } else if (req.method === 'POST') {
      const { title, content, category } = req.body;
      if (!title || !content) return res.status(400).json({ error: 'title and content required' });
      const r = await fetch(`${supabaseUrl}/rest/v1/knowledge_snippets`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ title, content, category: category || null }),
      });
      const data = await r.json();
      return res.status(201).json({ snippet: Array.isArray(data) ? data[0] : data });

    } else if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      await fetch(`${supabaseUrl}/rest/v1/knowledge_snippets?id=eq.${id}`, { method: 'DELETE', headers });
      return res.status(200).json({ ok: true });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Snippets error:', error);
    return res.status(500).json({ error: 'Failed to process request', message: error.message });
  }
}
