export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const mutation = `
      query {
        boards(ids: [18397707072]) {
          items_page(limit: 100, query_params: {order_by: [{column_id: "date4", direction: desc}]}) {
            items {
              id name url created_at
              column_values {
                id text
                ... on StatusValue { label { text } }
                ... on DateValue { date }
                ... on EmailValue { email }
                ... on TextValue { value }
                ... on LongTextValue { value }
                ... on PeopleValue { persons_and_teams { id name kind } }
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
      body: JSON.stringify({ query: mutation }),
    });

    const data = await r.json();
    const items = data?.data?.boards?.[0]?.items_page?.items || [];

    const tickets = items.map(item => {
      const cv = {};
      (item.column_values || []).forEach(col => {
        cv[col.id] = col;
      });
      return {
        id: item.id,
        name: item.name,
        url: item.url,
        ticketNum: cv['text_mm024qb']?.text || '',
        email: cv['emailt365s7d9']?.email || '',
        rig: cv['status']?.label?.text || '',
        issue: cv['long_text_mm01mw0d']?.value || '',
        status: cv['color_mm02nprs']?.label?.text || '',
        assignee: cv['person']?.persons_and_teams?.[0]?.name || '',
        date: cv['date4']?.date || '',
      };
    });

    return res.status(200).json({ tickets });
  } catch(error) {
    console.error('Tickets error:', error);
    return res.status(500).json({ error: 'Failed to load tickets' });
  }
}
