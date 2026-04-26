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
        `${process.env.SUPABASE_URL}/rest/v1/customers`,
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
        console.error('Supabase create error:', err);
        return res.status(400).json({ error: 'Failed to create customer. Email may already exist.' });
      }
      return res.status(200).json({ success: true });
    }

    if (action === 'update') {
      // Build update payload (exclude email from update, don't update password if empty)
      const updateData = { ...data };
      delete updateData.email;
      if (!updateData.password) delete updateData.password;

      const r = await fetch(
        `${process.env.SUPABASE_URL}/rest/v1/customers?email=eq.${encodeURIComponent(email)}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': process.env.SUPABASE_KEY,
            'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(updateData)
        }
      );
      if (!r.ok) {
        const err = await r.text();
        console.error('Supabase update error:', err);
        return res.status(400).json({ error: 'Failed to update customer.' });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch(error) {
    console.error('Manage customer error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
