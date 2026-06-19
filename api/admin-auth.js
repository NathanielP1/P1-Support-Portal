import bcrypt from 'bcryptjs';

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

    // Verify password. Supports bcrypt hashes ($2a/$2b/$2y) and, during the
    // transition, legacy plaintext values. Once all rows are bcrypt, the
    // plaintext fallback can be removed.
    const stored = member.password || '';
    const isBcrypt = stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$');
    let passwordMatch = false;
    if (isBcrypt) {
      passwordMatch = await bcrypt.compare(password, stored);
    } else {
      passwordMatch = stored === password;
    }

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    const { password: _, ...memberData } = member;
    return res.status(200).json({ staff: memberData });

  } catch (error) {
    console.error('Admin auth error:', error);
    return res.status(500).json({ error: 'Connection error. Please try again.' });
  }
}
