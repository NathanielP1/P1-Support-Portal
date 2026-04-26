export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/staff?select=id,email,name,role,created_at&order=created_at.asc`,
      {
        headers: {
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'Accept': 'application/json',
        }
      }
    );
    const staff = await r.json();
    return res.status(200).json({ staff: staff || [] });
  } catch(error) {
    console.error('Staff error:', error);
    return res.status(500).json({ error: 'Failed to load staff' });
  }
}
