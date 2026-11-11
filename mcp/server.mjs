#!/usr/bin/env node
// browser-bridge MCP 服务端（stdio，零依赖）。
//
// 把 DSH 抓页插件落盘的页面暴露成 MCP 工具，任何支持 MCP 的客户端
// （Codex CLI、Claude Code、Cursor…）都能读。
//
// 协议：JSON-RPC 2.0，换行分隔，走 stdin/stdout。
// 注意：stdout 只能出协议消息，所有日志走 stderr。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const INBOX =
  process.env.DSH_BROWSER_BRIDGE_INBOX ||
  path.join(os.homedir(), '.dsh', 'browser-bridge', 'inbox');

const SERVER_INFO = { name: 'browser-bridge', version: '0.1.0' };
const SUPPORTED_PROTOCOLS = ['2026-07-28', '2025-06-18', '2024-11-05'];
const DEFAULT_MAX_CHARS = 20000;

const log = (...a) => process.stderr.write('[browser-bridge-mcp] ' + a.join(' ') + '\n');

// ---------- 读取落盘文件 ----------

function parseCapture(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const meta = {};
  let body = raw;
  if (m) {
    body = raw.slice(m[0].length);
    for (const line of m[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return {
    id: path.basename(file, '.md'),
    url: meta.url || '',
    title: meta.title || '',
    captured: meta.captured || '',
    text: body.trim(),
  };
}

function listCaptures(limit = 20) {
  let names = [];
  try {
    names = fs.readdirSync(INBOX).filter((n) => n.endsWith('.md') && n !== 'latest.md');
  } catch {
    return [];
  }
  const files = names
    .map((n) => {
      const full = path.join(INBOX, n);
      try {
        return { full, mtime: fs.statSync(full).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, Math.max(1, limit));
  return files.map((f) => {
    try {
      return parseCapture(f.full);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function findCapture(id) {
  if (!id) return listCaptures(1)[0] || null;
  const file = path.join(INBOX, `${id}.md`);
  if (!fs.existsSync(file)) {
    const hit = listCaptures(200).find((c) => c.id === id || c.id.includes(id));
    return hit || null;
  }
  return parseCapture(file);
}

// ---------- 工具定义 ----------

const TOOLS = [
  {
    name: 'browser_page',
    description:
      '读取用户在浏览器里抓取的网页正文。当用户说「这个页面」「我刚抓的」「读这个网页」时先用它，而不是去猜工作区里的同名文件。不带 id 时返回最近一次抓取。',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: '抓取 id，形如 20261111-140721-getfoxyproxy.org；省略取最近一次' },
        maxChars: { type: 'number', description: '最多返回多少字符，默认 20000' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'browser_list',
    description: '列出最近抓取的网页（id、时间、标题、URL、字数），用来定位要读哪一份。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回条数，默认 10' },
      },
      additionalProperties: false,
    },
  },
];

function callTool(name, args) {
  const a = args || {};
  if (name === 'browser_page') {
    const cap = findCapture(a.id);
    if (!cap) {
      return {
        content: [{ type: 'text', text: `还没有抓取记录（目录：${INBOX}）。先在浏览器里点一下「DSH 抓页」扩展。` }],
      };
    }
    const limit = Number.isFinite(a.maxChars) ? Math.max(500, a.maxChars) : DEFAULT_MAX_CHARS;
    const body = cap.text.length > limit ? cap.text.slice(0, limit) + '\n\n…（已截断）' : cap.text;
    return {
      content: [
        {
          type: 'text',
          text: `# ${cap.title || '(无标题)'}\n${cap.url}\n抓取时间：${cap.captured}\n\n${body}`,
        },
      ],
    };
  }

  if (name === 'browser_list') {
    const limit = Number.isFinite(a.limit) ? a.limit : 10;
    const items = listCaptures(limit);
    if (!items.length) {
      return { content: [{ type: 'text', text: '还没有抓取记录。' }] };
    }
    const lines = items.map(
      (c, i) => `${i + 1}. ${c.id}\n   ${c.title || '(无标题)'}\n   ${c.url}\n   ${c.captured} · ${c.text.length} 字`
    );
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }

  return { content: [{ type: 'text', text: `未知工具：${name}` }], isError: true };
}

// ---------- JSON-RPC ----------

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

function negotiate(requested) {
  if (!requested) return SUPPORTED_PROTOCOLS[0];
  return SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0];
}

function handle(msg) {
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize': {
      reply(id, {
        protocolVersion: negotiate(params && params.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          '用户的浏览器里装了「DSH 抓页」扩展。需要读他正在看的网页时，用 browser_page；不确定有哪些抓取时先 browser_list。',
      });
      return;
    }
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return;
    case 'ping':
      reply(id, {});
      return;
    case 'tools/list':
      reply(id, { tools: TOOLS });
      return;
    case 'tools/call': {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      try {
        reply(id, callTool(name, args));
      } catch (e) {
        reply(id, { content: [{ type: 'text', text: '读取失败：' + (e.message || e) }], isError: true });
      }
      return;
    }
    default:
      if (!isNotification) replyError(id, -32601, `method not found: ${method}`);
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    log('跳过非 JSON 行');
    return;
  }
  try {
    handle(msg);
  } catch (e) {
    log('处理失败：' + (e && e.message ? e.message : e));
    if (msg && msg.id != null) replyError(msg.id, -32603, 'internal error');
  }
});

rl.on('close', () => process.exit(0));
log(`ready · inbox=${INBOX}`);
