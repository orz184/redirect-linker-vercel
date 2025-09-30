// /api/r.js
import crypto from 'crypto';

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  'Accept': '*/*'
};

// 取代兩個檔案裡的 urlFromJson 函式
function urlFromJson(obj) {
  if (!obj) return null;

  // 如果是陣列，逐一嘗試
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const u = urlFromJson(item);
      if (u) return u;
    }
    return null;
  }

  // 如果是物件
  if (typeof obj === 'object') {
    // 1) 最常見字段
    if (typeof obj.url === 'string') return obj.url;
    const candidates = ['download_url', 'link', 'downloadUrl', 'result'];
    for (const k of candidates) {
      if (typeof obj[k] === 'string') return obj[k];
    }

    // 2) 你的實際格式：files[0].url
    if (Array.isArray(obj.files)) {
      for (const f of obj.files) {
        if (typeof f?.url === 'string') return f.url;
        const u = urlFromJson(f);
        if (u) return u;
      }
    }

    // 3) 有些 API 會包在 data 裡
    if (obj.data) {
      const u = urlFromJson(obj.data);
      if (u) return u;
    }
  }

  return null;
}


function urlFromText(t) {
  const m = t.match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0] : null;
}

function computeCookieFromHtml(html) {
  // 解析 var a=toNumbers("..."),b=toNumbers("..."),c=toNumbers("...");
  const m = html.match(/var\s+a=toNumbers\("([0-9a-f]+)"\),b=toNumbers\("([0-9a-f]+)"\),c=toNumbers\("([0-9a-f]+)"\)/i);
  if (!m) return null;
  const key = Buffer.from(m[1], 'hex'); // AES-128 key
  const iv  = Buffer.from(m[2], 'hex'); // IV
  const cph = Buffer.from(m[3], 'hex'); // ciphertext (16 bytes)

  // slowAES.decrypt(..., 2, key, iv) => AES-CBC
  // 嘗試無 padding 與預設 PKCS#7 兩個路徑
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

  // Step 1: 先打 ?token=
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

    // Step 1 是反爬頁 → 算 cookie
    if (hasChallenge) {
      const cookieVal = computeCookieFromHtml(t1); // 16 bytes -> hex
      // Step 2: 帶 cookie 打 ?token=...&i=1
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
  const token = (req.query?.token ?? '').toString().trim();
  if (!token) return res.status(400).send('Invalid token');

  try {
    const direct = await resolveDirectUrl(token);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(302).setHeader('Location', direct).end();
  } catch (e) {
    // 想看更細節可改回傳 e.message
    return res.status(502).send('Failed to resolve download url');
  }
}
