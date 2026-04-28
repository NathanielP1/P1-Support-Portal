const MONDAY_API_URL = 'https://api.monday.com/v2';
const BOARD_ID = 18397707072;
const GROUP_ID = 'group_mm02mf1h'; // Open Cases

function getRigStatusId(rigName) {
  if (!rigName) return 2;
  if (rigName.includes('P3')) return 8;
  if (rigName.includes('P2')) return 0;
  if (rigName.includes('Ultimate')) return 1;
  if (rigName.includes('4DOF') || rigName.includes('S ')) return 3;
  if (rigName.includes('Spyder')) return 4;
  if (rigName.includes('Flight') || rigName.includes('Latitude') || rigName.includes('RotorRig') || rigName.includes('Cessna')) return 6;
  if (rigName.includes('P1')) return 2;
  return 2;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const MONDAY_API_KEY = process.env.MONDAY_API_KEY;

  try {
    if (req.method === 'GET') {
      const query = `
        query {
          boards(ids: [${BOARD_ID}]) {
            items_page(limit: 100) {
              items {
                id
                name
                url
                column_values {
                  id
                  text
                  value
                }
              }
            }
          }
        }
      `;

      const r = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': MONDAY_API_KEY, 'API-Version': '2024-01' },
        body: JSON.stringify({ query }),
      });

      const data = await r.json();
      if (data.errors) {
        console.error('Monday errors:', JSON.stringify(data.errors));
        return res.status(500).json({ error: 'Monday API error', details: data.errors });
      }

      const items = data?.data?.boards?.[0]?.items_page?.items || [];
      const tickets = items.map(item => {
        const cv = {};
        (item.column_values || []).forEach(col => { cv[col.id] = col.text || ''; });
        return {
          id: item.id,
          name: item.name,
          url: item.url,
          ticketNum: cv['text_mm024qb'] || '',
          email: cv['emailt365s7d9'] || '',
          rig: cv['status'] || '',
          issue: cv['long_text_mm01mw0d'] || '',
          status: cv['color_mm02nprs'] || '',
          assignee: cv['person'] || '',
          date: cv['date4'] || '',
          typeOfHelp: cv['single_selectgcj60gd'] || '',
        };
      });

      return res.status(200).json({ tickets });

    } else if (req.method === 'POST') {
      const {
        customerName, customerEmail, rig, motionPlatform, monitors,
        graphicsCard, wheelbase, issueCategory, issueDescription, source,
        // legacy field names from customer portal
        name, email, issue, typeOfHelp, pedals, addOns, purchaseDate, resolution,
      } = req.body;

      const resolvedName = customerName || name || 'Customer';
      const resolvedEmail = customerEmail || email || '';
      const resolvedRig = rig || '';
      const resolvedDesc = issueDescription || issue || '';
      const resolvedSource = source || 'form';

      const today = new Date().toISOString().split('T')[0];

      const rigSummary = [
        resolvedRig && `Rig: ${resolvedRig}`,
        motionPlatform && `Motion: ${motionPlatform}`,
        monitors && `Monitors: ${monitors}`,
        resolution && `Resolution: ${resolution}`,
        graphicsCard && `GPU: ${graphicsCard}`,
        wheelbase && `Wheelbase: ${wheelbase}`,
        pedals && `Pedals: ${pedals}`,
        addOns && `Add-ons: ${addOns}`,
        purchaseDate && `Purchase date: ${purchaseDate}`,
      ].filter(Boolean).join(' | ');

      const fullDescription = resolvedDesc
        ? `${resolvedDesc}${rigSummary ? '\n\n' + rigSummary : ''}`
        : `Submitted via ${resolvedSource === 'rufus' ? 'Rufus AI' : 'support portal'}${rigSummary ? '\n\n' + rigSummary : ''}`;

      const columnValues = JSON.stringify({
        emailt365s7d9: { email: resolvedEmail, text: resolvedEmail },
        date4: { date: today },
        long_text_mm01mw0d: fullDescription,
        status: { index: getRigStatusId(resolvedRig) },
        single_selectgcj60gd: { label: issueCategory || typeOfHelp || 'System Troubleshooting/Help' },
        color_mm02nprs: { label: 'Open' },
      });

      const mutation = `
        mutation {
          create_item(
            board_id: ${BOARD_ID},
            group_id: "${GROUP_ID}",
            item_name: ${JSON.stringify(resolvedName)},
            column_values: ${JSON.stringify(columnValues)}
          ) {
            id
            name
          }
        }
      `;

      const response = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': MONDAY_API_KEY, 'API-Version': '2024-01' },
        body: JSON.stringify({ query: mutation }),
      });

      const data = await response.json();
      if (data.errors) {
        console.error('Monday API error:', JSON.stringify(data.errors));
        return res.status(500).json({ error: 'Failed to create ticket', details: data.errors });
      }

      const itemId = data?.data?.create_item?.id;
      return res.status(200).json({ success: true, itemId });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Tickets error:', error);
    return res.status(500).json({ error: 'Failed to process request', message: error.message });
  }
}
