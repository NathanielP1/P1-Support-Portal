export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/customers?select=*&order=created_at.desc`,
      {
        headers: {
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'Accept': 'application/json',
        }
      }
    );
    const customers = await r.json();
    // Strip passwords before sending to frontend
    const safe = (customers || []).map(({ password, ...rest }) => rest);
    return res.status(200).json({ customers: safe });
  } catch(error) {
    console.error('Customers error:', error);
    return res.status(500).json({ error: 'Failed to load customers' });
  }
}
