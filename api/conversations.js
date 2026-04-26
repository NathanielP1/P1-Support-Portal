export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    try {
      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/conversations?select=*&order=created_at.desc&limit=200`,
        {
          headers: {
            'apikey': process.env.SUPABASE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
            'Accept': 'application/json',
          }
        }
      );
      const conversations = await r.json();
      return res.status(200).json({ conversations: conversations || [] });
    } catch(error) {
      return res.status(500).json({ error: 'Failed to load conversations' });
    }
  }

  if (req.method === 'POST') {
    // Log a conversation message
    const { customer_email, customer_name, role, content } = req.body;
    try {
      await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/conversations`,
        {
          method: 'POST',
          headers: {
            'apikey': process.env.SUPABASE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ customer_email, customer_name, role, content })
        }
      );
      return res.status(200).json({ success: true });
    } catch(error) {
      return res.status(500).json({ error: 'Failed to log conversation' });
    }
  }
}
