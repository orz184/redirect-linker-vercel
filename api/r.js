// /api/r.js
function isValidToken(t) {
  // 視你的 token 特徵放寬或調整
  return typeof t === 'string' && t.trim().length >= 1 && t.trim().length <= 500;
}

export default async function handler(req, res) {
  const token = (req.query?.token ?? '').toString().trim();
  if (!isValidToken(token)) {
    res.status(400).send('Invalid token');
    return;
  }

  try {
    const apiResp = await fetch(process.env.THIRDPARTY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...(process.env.THIRDPARTY_API_KEY
          ? { 'X-Api-Key': process.env.THIRDPARTY_API_KEY }
          : {})
      },
      body: JSON.stringify({ token })
    });

    if (!apiResp.ok) {
      res.status(502).send('Third-party API error');
      return;
    }

    const data = await apiResp.json();
    if (!data.download_url) {
      res.status(500).send('No download_url in API response');
      return;
    }

    // 302 轉址到第三方直鏈（jDownloader/IDM 會自動跟隨）
    res.setHeader('Cache-Control', 'no-store');
    res.status(302).setHeader('Location', data.download_url).end();
  } catch (e) {
    res.status(502).send('Failed to resolve download url');
  }
}
