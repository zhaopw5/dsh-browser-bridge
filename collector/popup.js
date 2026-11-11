const $ = (id) => document.getElementById(id);
const PING = 'http://127.0.0.1:38999/ping';
const FOLLOW_KEY = 'follow';
const ALL_SITES = '*://*/*';

let currentTab = null;
let host = '';

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function setResult(text, kind) {
  const el = $('result');
  el.textContent = text;
  el.className = kind || '';
}

async function hasAllSites() {
  try {
    return await chrome.permissions.contains({ origins: [ALL_SITES] });
  } catch {
    return false;
  }
}

function paintFollow(on) {
  $('follow').checked = on;
  $('followHint').textContent = on
    ? '所有标签页加载完自动抓，含新开的'
    : '打开后，新标签页不用再点';
  $('state').textContent = on ? '持续抓取中' : '手动模式';
  $('state').className = on ? 'on' : '';
}

async function init() {
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  host = hostOf(currentTab && currentTab.url);

  if (currentTab) {
    $('pageTitle').textContent = currentTab.title || '(无标题)';
    $('pageHost').textContent = host || '(不可访问的页面)';
  }

  const isWeb = !!host && /^https?:/i.test(currentTab.url || '');
  $('grab').disabled = !isWeb;
  if (!isWeb) setResult('这页抓不了（chrome:// 或扩展页）', 'err');

  const { [FOLLOW_KEY]: follow = false } = await chrome.storage.local.get(FOLLOW_KEY);
  const on = follow && (await hasAllSites());
  if (follow && !on) await chrome.storage.local.set({ [FOLLOW_KEY]: false });
  paintFollow(on);

  pingBridge();
}

async function pingBridge() {
  const el = $('bridge');
  try {
    const r = await fetch(PING, { cache: 'no-store' });
    el.textContent = r.ok ? '在线' : '异常';
    el.className = r.ok ? 'ok' : 'bad';
  } catch {
    el.textContent = '未启动';
    el.className = 'bad';
  }
}

$('follow').addEventListener('change', async (e) => {
  const want = e.target.checked;

  if (want) {
    let granted = false;
    try {
      granted = await chrome.permissions.request({ origins: [ALL_SITES] });
    } catch {
      granted = false;
    }
    if (!granted) {
      e.target.checked = false;
      paintFollow(false);
      setResult('没有获得「所有网站」授权，未开启', 'err');
      return;
    }
  }

  await chrome.storage.local.set({ [FOLLOW_KEY]: want });
  paintFollow(want);

  if (want) {
    setResult('已开启：切到别的标签页会立刻抓一次');
    if (currentTab && currentTab.id != null && /^https?:/i.test(currentTab.url || '')) {
      const r = await chrome.runtime.sendMessage({ type: 'capture', tabId: currentTab.id });
      if (r && r.ok) setResult(`已开始 · 当前页已抓（${r.chars} 字）`, 'ok');
    }
  } else {
    try {
      await chrome.permissions.remove({ origins: [ALL_SITES] });
    } catch {
      /* 忽略 */
    }
    setResult('已关闭持续抓取，恢复手动');
  }
});

$('grab').addEventListener('click', async () => {
  if (!currentTab || currentTab.id == null) return;
  $('grab').disabled = true;
  setResult('抓取中…');
  try {
    const r = await chrome.runtime.sendMessage({ type: 'capture', tabId: currentTab.id });
    if (r && r.ok) {
      setResult(`已保存：${r.file}（${r.chars} 字）`, 'ok');
      setTimeout(() => window.close(), 900);
    } else {
      setResult('失败：' + ((r && r.error) || '未知错误'), 'err');
      $('grab').disabled = false;
    }
  } catch (err) {
    setResult('失败：' + (err.message || err), 'err');
    $('grab').disabled = false;
  }
});

init();
