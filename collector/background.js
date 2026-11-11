// 抓页 —— 点图标弹面板。手动抓一页，或打开「持续抓取」让每个标签页加载完自动抓。
// 不读 cookie、不发外网。

const ENDPOINT = 'http://127.0.0.1:38999/ingest';
const TOKEN = 'dsh-bridge-7f3a91c2e5';
const FOLLOW_KEY = 'follow';
const ALL_SITES = '*://*/*';

// 防重复：同一标签页 + 同一个 URL，30 秒内不重复抓
const lastByTab = new Map();
let lastGlobal = { url: '', at: 0 };

// ---------- 面板消息 ----------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'pulse') {
    chrome.action
      .setIcon({ path: msg.bright ? ICONS.live : ICONS.dim })
      .catch(() => {});
    sendResponse({ ok: true });
    return true;
  }
  if (!msg || msg.type !== 'capture') return;
  capture(msg.tabId, { silent: false })
    .then((r) => sendResponse(r))
    .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true;
});

// ---------- 快捷键：不弹面板直接抓 ----------
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'capture-now') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id != null) capture(tab.id, { silent: false });
});

// ---------- 持续抓取 ----------
async function isFollowing() {
  const { [FOLLOW_KEY]: on = false } = await chrome.storage.local.get(FOLLOW_KEY);
  if (!on) return false;
  return await chrome.permissions.contains({ origins: [ALL_SITES] }).catch(() => false);
}

function shouldSkip(tabId, url) {
  const now = Date.now();
  const prev = lastByTab.get(tabId);
  if (prev && prev.url === url && now - prev.at < 30000) return true;
  if (lastGlobal.url === url && now - lastGlobal.at < 30000) return true;
  lastByTab.set(tabId, { url, at: now });
  lastGlobal = { url, at: now };
  return false;
}

// 页面加载完成
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete') return;
  const url = tab && tab.url;
  if (!url || !/^https?:/i.test(url)) return;
  if (!(await isFollowing())) return;
  if (shouldSkip(tabId, url)) return;
  capture(tabId, { silent: true });
});

// 切到一个已经加载好的标签页
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  if (!(await isFollowing())) return;
  let tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    return;
  }
  if (!tab || tab.status !== 'complete') return;
  if (!/^https?:/i.test(tab.url || '')) return;
  if (shouldSkip(tabId, tab.url)) return;
  capture(tabId, { silent: true });
});

chrome.tabs.onRemoved.addListener((tabId) => lastByTab.delete(tabId));

// ---------- 图标状态：抓取中换成带红灯的图标，并用 offscreen 定时器做呼吸 ----------
const ICONS = {
  idle: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  live: { 16: 'icons/on/16.png', 32: 'icons/on/32.png', 48: 'icons/on/48.png', 128: 'icons/on/128.png' },
  dim: {
    16: 'icons/on-dim/16.png',
    32: 'icons/on-dim/32.png',
    48: 'icons/on-dim/48.png',
    128: 'icons/on-dim/128.png',
  },
};

/** offscreen 文档只用来跑定时器：MV3 的 service worker 会被回收，撑不住动画。 */
async function ensurePulse(on) {
  try {
    if (!chrome.offscreen) return;
    const has = await chrome.offscreen.hasDocument();
    if (on && !has) {
      await chrome.offscreen.createDocument({
        url: 'pulse.html',
        reasons: ['DOM_PARSER'],
        justification: '工具栏图标的呼吸效果需要一个常驻定时器',
      });
    } else if (!on && has) {
      await chrome.offscreen.closeDocument();
    }
  } catch {
    /* 建不了就一直用常亮红灯 */
  }
}

async function syncAction() {
  const on = await isFollowing();
  try {
    await chrome.action.setIcon({ path: on ? ICONS.live : ICONS.idle });
    await chrome.action.setTitle({ title: on ? '抓页 · 持续抓取中' : '抓页' });
    await chrome.action.setBadgeText({ text: '' });
  } catch {
    /* 图标失败不影响抓取 */
  }
  ensurePulse(on).catch(() => {});
}

/** 角标只用来报错：抓取中不打扰，靠绿灯表示状态。 */
function flash(text, color) {
  chrome.action.setBadgeBackgroundColor({ color });
  chrome.action.setBadgeText({ text });
  setTimeout(() => syncAction().catch(() => {}), 2200);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[FOLLOW_KEY]) syncAction().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => syncAction().catch(() => {}));
chrome.runtime.onInstalled.addListener(() => syncAction().catch(() => {}));
syncAction().catch(() => {});

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
    flash('ERR', '#c62828');
    return { ok: false, error: '注入失败：' + ((e && e.message) || e) };
  }
  if (!data) {
    flash('ERR', '#c62828');
    return { ok: false, error: '页面无内容' };
  }

  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-DSH-Token': TOKEN },
      body: JSON.stringify(data),
    });
    if (!resp.ok) {
      flash('ERR', '#c62828');
      return { ok: false, error: '桥返回 ' + resp.status };
    }
    const j = await resp.json();
    // 抓取中不弹角标，手动模式才闪一下 OK
    if (!silent && !(await isFollowing())) flash('OK', '#1e7b34');
    else syncAction().catch(() => {});
    return { ok: true, file: j.file, title: data.title, chars: data.text.length };
  } catch {
    flash('ERR', '#c62828');
    return { ok: false, error: '连不上本地桥' };
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
    browser: detectBrowser(),
    text: text.slice(0, 400000),
    html: document.documentElement.outerHTML.slice(0, 4000000),
  };

  // 同一份代码同时装进 Chrome 和 Edge：按运行时特征上报来源，
  // 插件的 chrome / edge 开关据此放行。
  function detectBrowser() {
    try {
      const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
      const names = brands.map((b) => b.brand || '').join(' ');
      if (/Microsoft Edge/i.test(names)) return 'edge';
      if (/Google Chrome/i.test(names)) return 'chrome';
    } catch {
      /* 老浏览器没有 userAgentData */
    }
    const ua = navigator.userAgent || '';
    if (/\bEdg\//.test(ua)) return 'edge';
    if (/\bChrome\//.test(ua)) return 'chrome';
    return 'chromium';
  }
}
