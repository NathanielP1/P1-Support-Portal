export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, email, data } = req.body;

  try {
    if (action === 'create') {
      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/staff`,
        {
          method: 'POST',
          headers: {
            'apikey': process.env.SUPABASE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(data)
        }
      );
      if (!r.ok) {
        const err = await r.text();
        console.error('Supabase create staff error:', err);
        return res.status(400).json({ error: 'Failed to create staff member. Email may already exist.' });
      }
      return res.status(200).json({ success: true });
    }

    if (action === 'remove') {
      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/staff?email=eq.${encodeURIComponent(email)}`,
        {
          method: 'DELETE',
          headers: {
            'apikey': process.env.SUPABASE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
            'Prefer': 'return=minimal',
          }
        }
      );
      if (!r.ok) {
        return res.status(400).json({ error: 'Failed to remove staff member.' });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch(error) {
    console.error('Manage staff error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
