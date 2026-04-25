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

  try {
    // Query Supabase for the customer
    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/customers?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=*`,
      {
        headers: {
          'apikey': process.env.SUPABASE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );

    const customers = await response.json();

    if (!customers || customers.length === 0) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    const customer = customers[0];

    // Check password
    if (customer.password !== password) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    // Return customer data without the password
    const {
      password: _,
      id: __,
      created_at: ___,
      ...customerData
    } = customer;

    // Map snake_case database fields to camelCase for the frontend
    return res.status(200).json({
      customer: {
        name: customerData.name,
        rig: customerData.rig,
        motionPlatform: customerData.motion_platform,
        monitors: customerData.monitors,
        resolution: customerData.resolution,
        graphicsCard: customerData.graphics_card,
        wheelbase: customerData.wheelbase,
        pedals: customerData.pedals,
        addOns: customerData.add_ons,
        purchaseDate: customerData.purchase_date,
        email: customerData.email,
      }
    });

  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: 'Connection error. Please try again.' });
  }
}
