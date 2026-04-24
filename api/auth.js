// Simple auth endpoint
// In production this would check against Supabase database
// For now, hardcoded demo customers to get the portal running

const DEMO_CUSTOMERS = {
  'demo@podium1racing.com': {
    password: 'p1demo',
    name: 'Marcus Reid',
    initials: 'MR',
    rig: 'P1 Ultimate',
    motionPlatform: 'D-BOX GS-5',
    monitors: '45" LG Ultragear OLED (triple)',
    resolution: '10320 × 1440',
    graphicsCard: 'RTX 4090',
    wheelbase: 'Asetek Invicta 27Nm',
    pedals: 'Heusinkveld Ultimate+ (throttle/clutch) + Simucube Active Pedal (brake)',
    addOns: '5.1 Surround Sound, Qubic BT-1 Belt Tensioner',
    purchaseDate: 'January 2025',
  }
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const customer = DEMO_CUSTOMERS[email.toLowerCase()];

  if (!customer || customer.password !== password) {
    return res.status(401).json({ error: 'Incorrect email or password' });
  }

  // Return customer data without the password
  const { password: _, ...customerData } = customer;
  return res.status(200).json({ customer: customerData });
};
