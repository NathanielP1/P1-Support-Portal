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
    const BOARD_ID = '7457539723';
    const GROUP_ID = 'topics'; // "Open" group

    const today = new Date().toISOString().split('T')[0];

    // Build rig summary for the issue field
    const rigSummary = [
      rig && `Rig: ${rig}`,
      motionPlatform && `Motion: ${motionPlatform}`,
      monitors && `Monitors: ${monitors}`,
      graphicsCard && `GPU: ${graphicsCard}`,
      wheelbase && `Wheelbase: ${wheelbase}`,
    ].filter(Boolean).join(' | ');

    const fullIssue = issueDescription
      ? `[${issueCategory || 'Support'}] ${issueDescription}`
      : `[${issueCategory || 'Support'}] Submitted via ${source === 'rufus' ? 'Rufus AI' : 'support portal'}`;

    const itemName = `${customerName || 'Customer'} — ${issueCategory || 'Support Request'}`;

    const columnValues = JSON.stringify({
      text5__1: customerName || '',
      email__1: { email: customerEmail || '', text: customerEmail || '' },
      date5__1: { date: today },
      text7__1: fullIssue + (rigSummary ? ` | ${rigSummary}` : ''),
      priority__1: { label: source === 'rufus' ? 'High' : 'Medium' },
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

    if (data.errors) {
      console.error('Monday API error:', data.errors);
      return res.status(500).json({ error: 'Failed to create ticket' });
    }

    const itemId = data?.data?.create_item?.id;
    console.log('Monday ticket created:', itemId);

    return res.status(200).json({ success: true, itemId });

  } catch (error) {
    console.error('Ticket error:', error);
    return res.status(500).json({ error: 'Failed to create ticket' });
  }
}
