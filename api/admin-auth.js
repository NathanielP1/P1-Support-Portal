export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const cleanEmail = email.toLowerCase().trim();

  try {
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/staff?email=eq.${encodeURIComponent(cleanEmail)}&limit=1`,
      {
        headers: {
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        }
      }
    );

    const staff = await response.json();

    if (!Array.isArray(staff) || staff.length === 0) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    const member = staff[0];
    if (member.password !== password) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    const { password: _, ...memberData } = member;
    return res.status(200).json({ staff: memberData });

  } catch (error) {
    console.error('Admin auth error:', error);
    return res.status(500).json({ error: 'Connection error. Please try again.' });
  }
}
