// /api/debug.js
import crypto from 'crypto';

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  'Accept': '*/*'
};

function computeCookieFromHtml(html) {
  const m = html.match(/var\s+a=toNumbers\("([0-9a-f]+)"\),b=toNumbers\("([0-9a-f]+)"\),c=toNumbers\("([0-9a-f]+)"\)/i);
  if (!m) return null;
  const key = Buffer.from(m[1], 'hex');
  const iv  = Buffer.from(m[2], 'hex');
  const cph = Buffer.from(m[3], 'hex');
  try {
    const d1 = crypto.createDecipheriv('aes-128-cbc', key, iv).setAutoPadding(false);
    const p1 = Buffer.concat([d1.update(cph), d1.final()]);
    return p1.toString('hex').toLowerCase();
  } catch {}
  try {
    const d2 = crypto.createDecipheriv('aes-128-cbc', key, iv);
    const p2 = Buffer.concat([d2.update(cph), d2.final()]);
    return p2.toString('hex').toLowerCase();
  } catch {}
  return null;
}

export default async function handler(req, res) {
  const token = (req.query?.token ?? '').toString().trim();
  if (!token) return res.status(400).json({ error: 'no token' });

  const base = (process.env.THIRDPARTY_API_URL || '').replace(/\?$/, '');
  const u1 = `${base}?token=${encodeURIComponent(token)}`;

  try {
    const r1 = await fetch(u1, { method: 'GET', headers: { ...COMMON_HEADERS, 'Referer': base } });
    const ct1 = r1.headers.get('content-type') || '';
    let body1;
    if (ct1.includes('application/json')) body1 = await r1.json();
    else body1 = (await r1.text()).slice(0, 2000);

    let cookieVal = null, step2 = null;

    if (typeof body1 === 'string' && /slowAES\.decrypt\(/i.test(body1)) {
      cookieVal = computeCookieFromHtml(body1);
      const u2 = `${base}?token=${encodeURIComponent(token)}&i=1`;
      const r2 = await fetch(u2, {
        method: 'GET',
        headers: {
          ...COMMON_HEADERS,
          'Referer': base,
          ...(cookieVal ? { 'Cookie': `__test=${cookieVal};` } : {})
        }
      });
      const ct2 = r2.headers.get('content-type') || '';
      let body2;
      if (ct2.includes('application/json')) body2 = await r2.json();
      else body2 = (await r2.text()).slice(0, 2000);
      step2 = { status: r2.status, contentType: ct2, body: body2 };
    }

    res.status(200).json({
      step1: { status: r1.status, contentType: ct1, body: body1 },
      cookieComputed: cookieVal ? `${cookieVal.slice(0,8)}...(${cookieVal.length} hex chars)` : null,
      step2: step2
    });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
