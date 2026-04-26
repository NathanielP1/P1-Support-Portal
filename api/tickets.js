export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const query = `
      query {
        boards(ids: [18397707072]) {
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

    const r = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': process.env.MONDAY_API_KEY,
        'API-Version': '2024-01',
      },
      body: JSON.stringify({ query }),
    });

    const data = await r.json();
    console.log('Monday response status:', r.status);

    if (data.errors) {
      console.error('Monday errors:', JSON.stringify(data.errors));
      return res.status(500).json({ error: 'Monday API error', details: data.errors });
    }

    const items = data?.data?.boards?.[0]?.items_page?.items || [];

    const tickets = items.map(item => {
      // Build a lookup by column ID
      const cv = {};
      (item.column_values || []).forEach(col => {
        cv[col.id] = col.text || '';
      });

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

  } catch(error) {
    console.error('Tickets fetch error:', error);
    return res.status(500).json({ error: 'Failed to load tickets', message: error.message });
  }
}
