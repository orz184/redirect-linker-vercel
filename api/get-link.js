// /api/get-link.js
function setCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function isValidToken(t) {
  // 視你的 token 特徵放寬或調整
  return typeof t === 'string' && t.trim().length >= 1 && t.trim().length <= 500;
}

export default async function handler(req, res) {
  setCORS(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const token = (req.body?.token ?? '').toString().trim();
  if (!isValidToken(token)) {
    res.status(400).json({ error: 'Invalid token' });
    return;
  }

  try {
    // 依你的第三方 API 規格調整
    const apiResp = await fetch(process.env.THIRDPARTY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 若第三方用 Authorization 帶 token：
        'Authorization': `Bearer ${token}`,
        // 若還需要固定金鑰：
        ...(process.env.THIRDPARTY_API_KEY
          ? { 'X-Api-Key': process.env.THIRDPARTY_API_KEY }
          : {})
      },
      // 若第三方要從 body 取 token（不需要可刪掉）
      body: JSON.stringify({ token })
    });

    if (!apiResp.ok) {
      const detail = await apiResp.text();
      res.status(502).json({ error: 'Third-party API error', detail: detail.slice(0, 800) });
      return;
    }

    const data = await apiResp.json(); // 預期 { download_url, filename? }
    if (!data.download_url) {
      res.status(500).json({ error: 'No download_url in API response' });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ download_url: data.download_url, filename: data.filename ?? null });
  } catch (e) {
    res.status(502).json({ error: 'Failed to get download url' });
  }
}
