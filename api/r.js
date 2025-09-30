import crypto from 'crypto';

function pickUrlFromJson(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const keys = ['download_url', 'url', 'link', 'downloadUrl', 'result'];
  for (const k of keys) if (typeof obj[k] === 'string') return obj[k];
  if (obj.data && typeof obj.data === 'object') return pickUrlFromJson(obj.data);
  return null;
}
function pickUrlFromText(text) {
  const m = text.match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0] : null;
}
function computeCookieFromHtml(html) {
  // 解析類似：var a=toNumbers("..."),b=toNumbers("..."),c=toNumbers("...");
  const m = html.match(/var\s+a=toNumbers\("([0-9a-f]+)"\),b=toNumbers\("([0-9a-f]+)"\),c=toNumbers\("([0-9a-f]+)"\)/i);
  if (!m) return null;
  const key = Buffer.from(m[1], 'hex'); // aes-128 key
  const iv  = Buffer.from(m[2], 'hex'); // iv
  const ciph= Buffer.from(m[3], 'hex'); // ciphertext (16 bytes)

  // 先試無填充，再試預設 PKCS#7
  try {
    const d1 = crypto.createDecipheriv('aes-128-cbc', key, iv).setAutoPadding(false);
    const p1 = Buffer.concat([d1.update(ciph), d1.final()]);
    return p1.toString('hex').toLowerCase();
  } catch {}
  try {
    const d2 = crypto.createDecipheriv('aes-128-cbc', key, iv); // auto padding = true
    const p2 = Buffer.concat([d2.update(ciph), d2.final()]);
    return p2.toString('hex').toLowerCase();
  } catch {}
  return null;
}

async function resolveDirectUrl(token) {
  const base = (process.env.THIRDPARTY_API_URL || '').replace(/\?$/, '');
  if (!base) throw new Error('THIRDPARTY_API_URL not set');

  // 第一次請求：?token=
  const u1 = `${base}?token=${encodeURIComponent(token)}`;
  const r1 = await fetch(u1, { method: 'GET' });
  const ct1 = r1.headers.get('content-type') || '';
  if (!r1.ok) throw new Error(`third-party status ${r1.status}`);

  if (ct1.includes('application/json')) {
    const j = await r1.json();
    const url = pickUrlFromJson(j);
    if (url) return url;
  } else {
    const t = await r1.text();

    // 若已經有可用連結就直接回
    const directInText = pickUrlFromText(t);
    // 但多數情況這裡是 slowAES 反爬頁
    const hasChallenge = /slowAES\.decrypt\(/i.test(t);

    if (!hasChallenge && directInText) return directInText;

    if (hasChallenge) {
      const cookieVal = computeCookieFromHtml(t);
      // 第二次請求：?token=...&i=1 + __test cookie
      const u2 = `${base}?token=${encodeURIComponent(token)}&i=1`;
      const r2 = await fetch(u2, {
        method: 'GET',
        headers: cookieVal ? { 'Cookie': `__test=${cookieVal};` } : {}
      });
      const ct2 = r2.headers.get('content-type') || '';
      if (!r2.ok) throw new Error(`challenge step status ${r2.status}`);

      if (ct2.includes('application/json')) {
        const j2 = await r2.json();
        const url2 = pickUrlFromJson(j2);
        if (url2) return url2;
      } else {
        const t2 = await r2.text();
        const direct2 = pickUrlFromText(t2);
        if (direct2) return direct2;
      }
    }
  }
  throw new Error('no direct url found');
}

export default async function handler(req, res) {
  const token = (req.query?.token ?? '').toString().trim();
  if (!token) return res.status(400).send('Invalid token');

  try {
    const direct = await resolveDirectUrl(token);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(302).setHeader('Location', direct).end();
  } catch (e) {
    return res.status(502).send('Failed to resolve download url');
  }
}
