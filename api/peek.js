// /api/peek.js －－回傳第三方 API 的原始內容（最多 2KB）
export default async function handler(req, res) {
  const token = (req.query?.token ?? '').toString().trim();
  if (!token) return res.status(400).json({ error: 'no token' });

  const url = `${process.env.THIRDPARTY_API_URL}?token=${encodeURIComponent(token)}`;
  try {
    const apiResp = await fetch(url, { method: 'GET' });
    const ct = apiResp.headers.get('content-type') || '';
    const status = apiResp.status;

    let body;
    if (ct.includes('application/json')) {
      body = await apiResp.json();
    } else {
      const text = await apiResp.text();
      body = text.slice(0, 2000); // 截斷避免太長
    }

    res.status(200).json({ ok: apiResp.ok, status, contentType: ct, body });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
