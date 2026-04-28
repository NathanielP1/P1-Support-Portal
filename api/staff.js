export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
      const r = await fetch(`${sbUrl}/rest/v1/staff?select=id,email,name,role,created_at&order=created_at.asc`, { headers });
      const staff = await r.json();
      return res.status(200).json({ staff: staff || [] });

    } else if (req.method === 'POST') {
      const { action, email, data } = req.body;

      if (action === 'create') {
        const r = await fetch(`${sbUrl}/rest/v1/staff`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify(data),
        });
        if (!r.ok) {
          const err = await r.text();
          console.error('Supabase create staff error:', err);
          return res.status(400).json({ error: 'Failed to create staff member. Email may already exist.' });
        }
        return res.status(200).json({ success: true });
      }

      if (action === 'remove') {
        const r = await fetch(`${sbUrl}/rest/v1/staff?email=eq.${encodeURIComponent(email)}`, {
          method: 'DELETE',
          headers: { ...headers, 'Prefer': 'return=minimal' },
        });
        if (!r.ok) return res.status(400).json({ error: 'Failed to remove staff member.' });
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Invalid action' });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Staff error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
