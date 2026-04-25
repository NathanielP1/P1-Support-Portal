export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      customerName,
      customerEmail,
      rig,
      motionPlatform,
      monitors,
      graphicsCard,
      wheelbase,
      issueCategory,
      issueDescription,
      source // 'form' or 'rufus'
    } = req.body;

    const MONDAY_API_KEY = process.env.MONDAY_API_KEY;
    const BOARD_ID = 18397707072;
    const GROUP_ID = 'group_mm02mf1h'; // Open Cases

    const today = new Date().toISOString().split('T')[0];

    // Build rig summary for the description field
    const rigSummary = [
      rig && `Rig: ${rig}`,
      motionPlatform && `Motion: ${motionPlatform}`,
      monitors && `Monitors: ${monitors}`,
      graphicsCard && `GPU: ${graphicsCard}`,
      wheelbase && `Wheelbase: ${wheelbase}`,
    ].filter(Boolean).join(' | ');

    const fullDescription = issueDescription
      ? `${issueDescription}${rigSummary ? '\n\n' + rigSummary : ''}`
      : `Submitted via ${source === 'rufus' ? 'Rufus AI' : 'support portal'}${rigSummary ? '\n\n' + rigSummary : ''}`;

    // Map rig type to System Type status label IDs
    // P3=8, P2=0, P1=2, P1 Ultimate=1, 4DOF=3, Spyder=4, Flight=6, Commercial=9
    const getRigStatusId = (rigName) => {
      if (!rigName) return 2; // default to P1
      if (rigName.includes('P3')) return 8;
      if (rigName.includes('P2')) return 0;
      if (rigName.includes('Ultimate')) return 1;
      if (rigName.includes('4DOF') || rigName.includes('S ')) return 3;
      if (rigName.includes('Spyder')) return 4;
      if (rigName.includes('Flight') || rigName.includes('Latitude') || rigName.includes('RotorRig') || rigName.includes('Cessna')) return 6;
      if (rigName.includes('P1')) return 2;
      return 2; // default P1
    };

    const itemName = customerName || 'Customer';

    const columnValues = JSON.stringify({
      emailt365s7d9: { email: customerEmail || '', text: customerEmail || '' },
      date4: { date: today },
      long_text_mm01mw0d: fullDescription,
      status: { index: getRigStatusId(rig) },
      single_selectgcj60gd: { label: 'System Troubleshooting/Help' },
      color_mm02nprs: { label: 'Open' },
    });

    const mutation = `
      mutation {
        create_item(
          board_id: ${BOARD_ID},
          group_id: "${GROUP_ID}",
          item_name: ${JSON.stringify(itemName)},
          column_values: ${JSON.stringify(columnValues)}
        ) {
          id
          name
        }
      }
    `;

    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': MONDAY_API_KEY,
        'API-Version': '2024-01',
      },
      body: JSON.stringify({ query: mutation }),
    });

    const data = await response.json();
    console.log('Monday API response:', JSON.stringify(data));

    if (data.errors) {
      console.error('Monday API error:', JSON.stringify(data.errors));
      return res.status(500).json({ error: 'Failed to create ticket', details: data.errors });
    }

    const itemId = data?.data?.create_item?.id;
    console.log('Monday ticket created:', itemId);

    return res.status(200).json({ success: true, itemId });

  } catch (error) {
    console.error('Ticket error:', error);
    return res.status(500).json({ error: 'Failed to create ticket', message: error.message });
  }
}
