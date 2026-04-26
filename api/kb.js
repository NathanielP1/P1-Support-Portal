export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const FOLDER_ID = '10e83g-ROXyW5UkqqQSNM36U6nreiwNS7';
    const API_KEY = process.env.GOOGLE_API_KEY;

    const url = `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+trashed=false&fields=files(id,name,mimeType,modifiedTime,size)&orderBy=name&key=${API_KEY}`;

    const r = await fetch(url);
    const data = await r.json();

    if (data.error) {
      console.error('Google Drive API error:', data.error);
      return res.status(500).json({ error: 'Failed to load KB articles', details: data.error });
    }

    const files = (data.files || []).map(f => ({
      id: f.id,
      name: f.name.replace(/\.(docx|pdf|doc)$/i, ''), // strip extension for display
      filename: f.name,
      mimeType: f.mimeType,
      modified: f.modifiedTime,
      size: f.size,
      viewUrl: `https://docs.google.com/viewer?url=https://drive.google.com/uc?id=${f.id}&embedded=true`,
      downloadUrl: `https://drive.google.com/uc?export=download&id=${f.id}`,
      previewUrl: `https://drive.google.com/file/d/${f.id}/preview`,
    }));

    return res.status(200).json({ files });

  } catch(error) {
    console.error('KB error:', error);
    return res.status(500).json({ error: 'Failed to load KB articles' });
  }
}
