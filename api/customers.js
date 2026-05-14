import bcrypt from 'bcryptjs';

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
      const r = await fetch(`${sbUrl}/rest/v1/customers?select=*&order=created_at.desc`, { headers });
      const customers = await r.json();
      const safe = (customers || []).map(({ password, ...rest }) => rest);
      return res.status(200).json({ customers: safe });

    } else if (req.method === 'POST') {
      const { action, email, data } = req.body;

      if (action === 'create') {
        if (data.password) {
          data.password = await bcrypt.hash(data.password, 10);
        }
        const r = await fetch(`${sbUrl}/rest/v1/customers`, {
          method: 'POST',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify(data),
        });
        if (!r.ok) {
          const err = await r.text();
          console.error('Supabase create error:', err);
          return res.status(400).json({ error: 'Failed to create customer. Email may already exist.' });
        }
        return res.status(200).json({ success: true });
      }

      if (action === 'update') {
        const updateData = { ...data };
        delete updateData.email;
        if (!updateData.password) delete updateData.password;
        if (updateData.password) {
          updateData.password = await bcrypt.hash(updateData.password, 10);
        }
        const r = await fetch(`${sbUrl}/rest/v1/customers?email=eq.${encodeURIComponent(email)}`, {
          method: 'PATCH',
          headers: { ...headers, 'Prefer': 'return=minimal' },
          body: JSON.stringify(updateData),
        });
        if (!r.ok) {
          const err = await r.text();
          console.error('Supabase update error:', err);
          return res.status(400).json({ error: 'Failed to update customer.' });
        }
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Invalid action' });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Customers error:', error);
    return res.status(500).json({ error: 'Server error' });
  }
}
