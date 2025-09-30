// /api/get-link.js
import crypto from 'crypto';

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  'Accept': '*/*'
};

function urlFromJson(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const cands = ['download_url', 'url', 'link', 'downloadUrl', 'result'];
  for (const k of cands) if (typeof obj[k] === 'string') return obj[k];
  if (obj.data && typeof obj.data === 'object') return urlFromJson(obj.data);
  return null;
}
function urlFromText(t) {
  const m = t.match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0] : null;
}
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

async function resolveDirectUrl(token) {
  const base = (process.env.THIRDPARTY_API_URL || '').replace(/\?$/, '');
  if (!base) throw new Error('THIRDPARTY_API_URL not set');

  const u1 = `${base}?token=${encodeURIComponent(token)}`;
  const r1 = await fetch(u1, { method: 'GET', headers: { ...COMMON_HEADERS, 'Referer': base } });
  const ct1 = r1.headers.get('content-type') || '';
  if (!r1.ok) throw new Error(`first request status ${r1.status}`);

  if (ct1.includes('application/json')) {
    const j1 = await r1.json();
    const u = urlFromJson(j1);
    if (u) return u;
  } else {
    const t1 = await r1.text();
    const hasChallenge = /slowAES\.decrypt\(/i.test(t1);
    const candidate = urlFromText(t1);
    if (!hasChallenge && candidate) return candidate;

    if (hasChallenge) {
      const cookieVal = computeCookieFromHtml(t1);
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
      if (!r2.ok) throw new Error(`challenge step status ${r2.status}`);

      if (ct2.includes('application/json')) {
        const j2 = await r2.json();
        const u = urlFromJson(j2);
        if (u) return u;
      } else {
        const t2 = await r2.text();
        const u = urlFromText(t2);
        if (u) return u;
      }
    }
  }
  throw new Error('no direct url found');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const token = (req.body?.token ?? '').toString().trim();
  if (!token) return res.status(400).json({ error: 'Invalid token' });

  try {
    const direct = await resolveDirectUrl(token);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ download_url: direct });
  } catch (e) {
    return res.status(502).json({ error: 'Failed to get download url' });
  }
}
