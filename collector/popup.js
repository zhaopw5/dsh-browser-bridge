const $ = (id) => document.getElementById(id);
const PING = 'http://127.0.0.1:38999/ping';
const AUTO_KEY = 'autoHosts';

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

async function getAutoHosts() {
  const { [AUTO_KEY]: hosts = [] } = await chrome.storage.local.get(AUTO_KEY);
  return hosts;
}

async function setAutoHosts(hosts) {
  await chrome.storage.local.set({ [AUTO_KEY]: hosts });
}

function paintAuto(on, hosts) {
  $('toggle').checked = on;
  const el = $('state');
  el.textContent = on ? '本站自动：开' : '本站自动：关';
  el.className = on ? 'on' : '';
  $('switchHint').innerHTML = on
    ? `已开启：<b>${host}</b> 的页面加载完自动抓`
    : '打开后，这个站点的页面加载完自动抓';
  $('autoCount').textContent = hosts.length ? `自动站点 ${hosts.length} 个` : '';
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

  const hosts = await getAutoHosts();
  const on = isWeb && hosts.includes(host);
  paintAuto(on, hosts);
  if (!isWeb) $('toggle').disabled = true;

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

$('toggle').addEventListener('change', async (e) => {
  if (!host) return;
  const wantOn = e.target.checked;
  const hosts = await getAutoHosts();
  const next = new Set(hosts);

  if (wantOn) {
    let granted = false;
    try {
      granted = await chrome.permissions.request({ origins: [`*://${host}/*`] });
    } catch {
      granted = false;
    }
    if (!granted) {
      e.target.checked = false;
      setResult('没有授权，未开启', 'err');
      paintAuto(false, hosts);
      return;
    }
    next.add(host);
    await setAutoHosts([...next]);
    setResult('已开启，之后这个站点自动抓', 'ok');
    paintAuto(true, [...next]);
  } else {
    next.delete(host);
    await setAutoHosts([...next]);
    try {
      await chrome.permissions.remove({ origins: [`*://${host}/*`] });
    } catch {
      /* 忽略 */
    }
    setResult('已关闭这个站点的自动抓取', '');
    paintAuto(false, [...next]);
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
