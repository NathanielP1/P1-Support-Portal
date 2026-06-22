import crypto from 'crypto';
import bcrypt from 'bcryptjs';

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const cleanEmail = email.toLowerCase().trim();
  console.log('AUTH VERSION: crypto-sha256');

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    console.log('SUPABASE_URL present:', !!supabaseUrl);
    console.log('SUPABASE_KEY present:', !!supabaseKey);
    console.log('Attempting login for:', cleanEmail);

    const queryUrl = `${supabaseUrl}/rest/v1/customers?email=eq.${encodeURIComponent(cleanEmail)}&limit=1`;
    console.log('Query URL:', queryUrl);

    const response = await fetch(queryUrl, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    });

    console.log('Supabase response status:', response.status);

    const text = await response.text();
    console.log('Supabase raw response:', text);

    let customers;
    try {
      customers = JSON.parse(text);
    } catch(e) {
      console.error('Failed to parse Supabase response:', text);
      return res.status(500).json({ error: 'Database error. Please try again.' });
    }

    if (!Array.isArray(customers) || customers.length === 0) {
      console.log('No customer found for email:', cleanEmail);
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    const customer = customers[0];
    console.log('Customer found:', customer.name);

    const storedPassword = customer.password || '';
    const isBcrypt = storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$');

    // Verify password. bcrypt is the target scheme; SHA-256 and plaintext are
    // accepted as fallbacks during the transition and can be removed once all
    // customer rows are bcrypt.
    let passwordMatch = false;
    if (isBcrypt) {
      passwordMatch = await bcrypt.compare(password, storedPassword);
    } else {
      const hashedInput = hashPassword(password);
      passwordMatch = storedPassword === hashedInput || storedPassword === password;
    }
    console.log('Password match:', passwordMatch);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    return res.status(200).json({
      customer: {
        name: customer.name,
        rig: customer.rig,
        motionPlatform: customer.motion_platform,
        monitors: customer.monitors,
        resolution: customer.resolution,
        graphicsCard: customer.graphics_card,
        wheelbase: customer.wheelbase,
        pedals: customer.pedals,
        addOns: customer.add_ons,
        purchaseDate: customer.purchase_date,
        email: customer.email,
        specialistName: customer.specialist_name || null,
        specialistEmail: customer.specialist_email || null,
        mustSetPassword: customer.must_set_password || false,
      }
    });

  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: 'Connection error. Please try again.' });
  }
}
