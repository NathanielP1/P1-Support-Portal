const RSS_FEEDS = [
  { name: 'Motorsport.com', url: 'https://www.motorsport.com/rss/all/news/' },
  { name: 'RaceDepartment', url: 'https://www.racedepartment.com/news/index.rss' },
  { name: 'iRacing', url: 'https://www.iracing.com/feed/' },
  { name: 'Asetek SimSports', url: 'https://www.asetek.com/simracing/news/feed/' },
  { name: 'MOZA Racing', url: 'https://mozaracing.com/blogs/news.atom' },
  { name: 'Heusinkveld', url: 'https://heusinkveld.com/news/feed/' },
  { name: 'Vero Motion', url: 'https://veromotion.com/blog/feed/' },
  { name: 'Qubic System', url: 'https://www.qubic-system.com/feed/' },
  { name: 'BDH Racesim', url: 'https://www.bdhracesim.co.uk/feed/' },
];

function parseRSS(xml, sourceName) {
  const items = [];
  const itemRx = /<item[^>]*>([\s\S]*?)<\/item>/gi;
  const entryRx = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  const titleRx = /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;
  const linkRx = /<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i;
  const linkRx2 = /<link[^>]*>(https?:\/\/[^<]+)<\/link>/i;
  const dateRx = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i;
  const dateRx2 = /<published[^>]*>([\s\S]*?)<\/published>/i;
  const dateRx3 = /<updated[^>]*>([\s\S]*?)<\/updated>/i;
  const descRx = /<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i;
  const summaryRx = /<summary[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/summary>/i;
  const enclosureRx = /<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image[^"']*["']/i;
  const mediaRx = /<media:content[^>]+url=["']([^"']+)["'][^>]*>/i;
  const imgTagRx = /<img[^>]+src=["']([^"']+)["']/i;

  let match;
  const blocks = [];
  while ((match = itemRx.exec(xml)) !== null) blocks.push(match[1]);
  while ((match = entryRx.exec(xml)) !== null) blocks.push(match[1]);

  for (const block of blocks.slice(0, 5)) {
    const title = (titleRx.exec(block)?.[1] || '').trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const url = (linkRx.exec(block)?.[1] || linkRx2.exec(block)?.[1] || '').trim();
    const rawDate = dateRx.exec(block)?.[1] || dateRx2.exec(block)?.[1] || dateRx3.exec(block)?.[1] || '';
    const rawDesc = descRx.exec(block)?.[1] || summaryRx.exec(block)?.[1] || '';
    const cleanDesc = rawDesc.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim().slice(0, 200);
    const image = enclosureRx.exec(block)?.[1] || mediaRx.exec(block)?.[1] || imgTagRx.exec(rawDesc)?.[1] || null;

    if (title && url) {
      items.push({ title, url, source: sourceName, summary: cleanDesc, image, date: rawDate ? new Date(rawDate).toISOString() : new Date().toISOString() });
    }
  }
  return items;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  const dbHeaders = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
  };

  try {
    if (req.method === 'GET') {
      const [pinsRes, ...feedResults] = await Promise.allSettled([
        fetch(`${supabaseUrl}/rest/v1/news_pins?order=created_at.desc`, { headers: dbHeaders }),
        ...RSS_FEEDS.map(f =>
          fetch(f.url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; P1Portal/1.0)' }, signal: AbortSignal.timeout(5000) })
            .then(r => r.text())
            .then(xml => parseRSS(xml, f.name))
            .catch(() => [])
        ),
      ]);

      const pins = pinsRes.status === 'fulfilled' ? await pinsRes.value.json().catch(() => []) : [];
      const articles = feedResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);
      articles.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Filter to last 180 days; fall back to unfiltered if too few pass
      const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
      const recent = articles.filter(a => { try { return new Date(a.date) >= cutoff; } catch { return true; } });
      const finalArticles = recent.length >= 5 ? recent : articles;

      return res.status(200).json({ pinned: Array.isArray(pins) ? pins : [], articles: finalArticles });

    } else if (req.method === 'POST') {
      const { title, source, url, summary, pinned_by } = req.body;
      if (!title) return res.status(400).json({ error: 'title required' });
      const r = await fetch(`${supabaseUrl}/rest/v1/news_pins`, {
        method: 'POST',
        headers: { ...dbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify({ title, source: source || null, url: url || null, summary: summary || null, pinned: true, pinned_by: pinned_by || null }),
      });
      const data = await r.json();
      return res.status(201).json({ pin: Array.isArray(data) ? data[0] : data });

    } else if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      await fetch(`${supabaseUrl}/rest/v1/news_pins?id=eq.${id}`, { method: 'DELETE', headers: dbHeaders });
      return res.status(200).json({ ok: true });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('News error:', error);
    return res.status(500).json({ error: 'Failed to process request', message: error.message });
  }
}
