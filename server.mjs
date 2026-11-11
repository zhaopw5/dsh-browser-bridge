// DSH 抓页 —— 本地桥。只听 127.0.0.1，收扩展 POST 过来的页面，落盘到 inbox/。
// 启动：node server.mjs   （或双击 start-bridge.cmd）

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INBOX = path.join(HERE, 'inbox');
const PORT = 38999;
const TOKEN = 'dsh-bridge-7f3a91c2e5';
const MAX_BODY = 40 * 1024 * 1024;

fs.mkdirSync(INBOX, { recursive: true });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,x-dsh-token',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function safeHost(u) {
  try {
    return new URL(u).hostname.replace(/[^a-z0-9.-]/gi, '_');
  } catch {
    return 'unknown-host';
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/ping') {
    return send(res, 200, { ok: true, inbox: INBOX, pid: process.pid });
  }

  if (req.method !== 'POST' || req.url !== '/ingest') {
    return send(res, 404, { ok: false, error: 'not found' });
  }

  if (req.headers['x-dsh-token'] !== TOKEN) {
    return send(res, 403, { ok: false, error: 'bad token' });
  }

  const chunks = [];
  let size = 0;
  let aborted = false;

  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY) {
      aborted = true;
      req.destroy();
      return;
    }
    chunks.push(c);
  });

  req.on('end', () => {
    if (aborted) return;
    let page;
    try {
      page = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return send(res, 400, { ok: false, error: 'bad json' });
    }

    const now = new Date();
    const base = `${stamp(now)}-${safeHost(page.url || '')}`;
    const mdPath = path.join(INBOX, `${base}.md`);
    const htmlPath = path.join(INBOX, `${base}.html`);
    const metaPath = path.join(INBOX, `${base}.json`);

    const header = [
      '---',
      `url: ${page.url || ''}`,
      `title: ${(page.title || '').replace(/\s+/g, ' ')}`,
      `captured: ${page.at || now.toISOString()}`,
      '---',
      '',
    ].join('\n');

    try {
      fs.writeFileSync(mdPath, header + (page.text || '') + '\n', 'utf8');
      if (page.html) fs.writeFileSync(htmlPath, page.html, 'utf8');
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            url: page.url,
            title: page.title,
            at: page.at,
            textChars: (page.text || '').length,
            htmlChars: (page.html || '').length,
            md: path.basename(mdPath),
            html: page.html ? path.basename(htmlPath) : null,
          },
          null,
          2
        ),
        'utf8'
      );
      fs.writeFileSync(path.join(INBOX, 'last.json'), JSON.stringify({ base, at: now.toISOString() }), 'utf8');
    } catch (e) {
      console.error('[dsh-bridge] write failed', e);
      return send(res, 500, { ok: false, error: String(e.message || e) });
    }

    console.log(`[dsh-bridge] ${now.toLocaleTimeString()} ← ${page.title || page.url}`);
    return send(res, 200, { ok: true, file: path.basename(mdPath) });
  });

  req.on('error', () => {
    /* client aborted */
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`[dsh-bridge] 端口 ${PORT} 已被占用——本地桥大概已经在跑了，不用再起一个。`);
    process.exit(0);
  }
  throw e;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[dsh-bridge] listening on http://127.0.0.1:${PORT}`);
  console.log(`[dsh-bridge] inbox: ${INBOX}`);
});
