// DSH 抓页 —— 点图标弹面板；可以手动抓一页，也可以对某个站点开"自动抓"。
// 不读 cookie、不发外网。

const ENDPOINT = 'http://127.0.0.1:38999/ingest';
const TOKEN = 'dsh-bridge-7f3a91c2e5';
const AUTO_KEY = 'autoHosts';

// 每个标签页最近一次自动抓的 url，防重复
const lastAuto = new Map();

// ---------- 面板消息 ----------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'capture') return;
  capture(msg.tabId, { silent: false })
    .then((r) => sendResponse(r))
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true;
});

// ---------- 快捷键：直接抓，不弹面板 ----------
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'capture-now') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) capture(tab.id, { silent: false });
});

// ---------- 自动抓：白名单站点加载完就抓 ----------
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete') return;
  const url = tab && tab.url;
  if (!url || !/^https?:/i.test(url)) return;

  const host = hostOf(url);
  if (!host) return;

  const { [AUTO_KEY]: hosts = [] } = await chrome.storage.local.get(AUTO_KEY);
  if (!hosts.includes(host)) return;

  const granted = await chrome.permissions
    .contains({ origins: [`*://${host}/*`] })
    .catch(() => false);
  if (!granted) return;

  const prev = lastAuto.get(tabId);
  if (prev && prev.url === url && Date.now() - prev.at < 6000) return;
  lastAuto.set(tabId, { url, at: Date.now() });

  capture(tabId, { silent: true });
});

chrome.tabs.onRemoved.addListener((tabId) => lastAuto.delete(tabId));

// ---------- 抓取 ----------
async function capture(tabId, { silent = false } = {}) {
  if (tabId == null) return { ok: false, error: 'no tab' };

  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return { ok: false, error: '找不到标签页' };
  }
  if (!/^https?:/i.test(tab.url || '')) return { ok: false, error: '只支持 http/https' };

  let data;
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: pageSnapshot,
    });
    data = res && res.result;
  } catch (e) {
    if (!silent) badge('ERR', '#c62828');
    return { ok: false, error: '注入失败：' + ((e && e.message) || e) };
  }
  if (!data) {
    if (!silent) badge('ERR', '#c62828');
    return { ok: false, error: '页面无内容' };
  }

  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-DSH-Token': TOKEN },
      body: JSON.stringify(data),
    });
    if (!resp.ok) {
      if (!silent) badge('ERR', '#c62828');
      return { ok: false, error: '桥返回 ' + resp.status };
    }
    const j = await resp.json();
    if (!silent) badge('OK', '#2e7d32');
    else badge('A', '#0b57d0');
    return { ok: true, file: j.file, title: data.title, chars: data.text.length };
  } catch {
    if (!silent) badge('ERR', '#c62828');
    return { ok: false, error: '连不上本地桥' };
  }
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

// 这段会被注入到页面里执行，必须自包含（不能引用外部变量）。
function pageSnapshot() {
  const pick =
    document.querySelector('article.doc, article, main, [role="main"]') || document.body;
  const text = (pick.innerText || '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    url: location.href,
    title: document.title,
    at: new Date().toISOString(),
    text: text.slice(0, 400000),
    html: document.documentElement.outerHTML.slice(0, 4000000),
  };
}

function badge(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
}
