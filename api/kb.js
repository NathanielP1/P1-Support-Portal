export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sbUrl = process.env.SUPABASE_URL;
  const sbKey = process.env.SUPABASE_KEY;
  const sbHeaders = {
    'apikey': sbKey,
    'Authorization': `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  };

  try {
    if (req.method === 'GET') {
      const FOLDER_ID = '10e83g-ROXyW5UkqqQSNM36U6nreiwNS7';
      const API_KEY = process.env.GOOGLE_API_KEY;

      const [driveRes, articlesRes] = await Promise.allSettled([
        fetch(`https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,modifiedTime,size)&orderBy=name&key=${API_KEY}`),
        fetch(`${sbUrl}/rest/v1/kb_articles?order=created_at.desc`, { headers: sbHeaders }),
      ]);

      let driveFiles = [];
      if (driveRes.status === 'fulfilled') {
        const data = await driveRes.value.json();
        if (!data.error) {
          driveFiles = (data.files || []).map(f => ({
            id: f.id,
            name: f.name.replace(/\.(docx|pdf|doc)$/i, ''),
            filename: f.name,
            mimeType: f.mimeType,
            modified: f.modifiedTime,
            size: f.size,
            source: 'drive',
            viewUrl: `https://docs.google.com/viewer?url=https://drive.google.com/uc?id=${f.id}&embedded=true`,
            downloadUrl: `https://drive.google.com/uc?export=download&id=${f.id}`,
            previewUrl: `https://drive.google.com/file/d/${f.id}/preview`,
          }));
        }
      }

      let manualArticles = [];
      if (articlesRes.status === 'fulfilled') {
        const data = await articlesRes.value.json().catch(() => []);
        manualArticles = (Array.isArray(data) ? data : []).map(a => ({
          id: a.id,
          name: a.title,
          category: a.category || null,
          notes: a.notes || null,
          previewUrl: a.url,
          viewUrl: a.url,
          source: 'manual',
          created_at: a.created_at,
        }));
      }

      return res.status(200).json({ files: [...driveFiles, ...manualArticles] });

    } else if (req.method === 'POST') {
      const { title, url, category, notes } = req.body;
      if (!title || !url) return res.status(400).json({ error: 'title and url required' });
      const r = await fetch(`${sbUrl}/rest/v1/kb_articles`, {
        method: 'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body: JSON.stringify({ title, url, category: category || null, notes: notes || null }),
      });
      const data = await r.json();
      return res.status(201).json({ article: Array.isArray(data) ? data[0] : data });

    } else if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      await fetch(`${sbUrl}/rest/v1/kb_articles?id=eq.${id}`, { method: 'DELETE', headers: sbHeaders });
      return res.status(200).json({ ok: true });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('KB error:', error);
    return res.status(500).json({ error: 'Failed to process KB request', message: error.message });
  }
}
