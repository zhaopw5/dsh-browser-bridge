# DSH 抓页

**中文** | [English](README.en.md)

把**你在 Chrome 里已经登录的页面**，交给**跑在本机的 AI agent**（DeepSeek Harness）读。

浏览器扩展 + 一个只听 `127.0.0.1` 的本地小服务。登录、2FA、验证码都由人来做，agent 只拿渲染后的正文。

> Chrome extension + local bridge. Login yourself, let the local agent read the rendered page.

## 为什么需要它

agent 抓网页通常只有两条路：

- `web_fetch`：拿不到要登录的内网页面（401）、拿不到 JS 渲染后的 DOM
- 截图：只有像素，没有结构，还得人肉翻页

而浏览器扩展跑在**你已经登录的那个会话里**，点一下就能把渲染后的 DOM 交出去——不用改 Chrome 配置、不用 `--remote-debugging-port`（Chrome 136+ 对默认 profile 已经禁了）、不用重新登录。

## 组成

```
extension/         Chrome 扩展（MV3）
  manifest.json    声明：activeTab + scripting + storage
  background.js    抓取、自动抓取白名单监听
  popup.html/js    点图标弹出的面板
server.mjs         本地桥：只听 127.0.0.1:38999，落盘到 inbox/
start-bridge.cmd   Windows 双击启动
```

## 安装

### 1. 起本地桥

```bash
node server.mjs
```

或者 Windows 双击 `start-bridge.cmd`。看到 `listening on http://127.0.0.1:38999` 即可。

### 2. 装扩展

1. Chrome 打开 `chrome://extensions`
2. 打开右上角 **开发者模式**
3. **加载未打包的扩展程序** → 选 `extension` 目录
4. 工具栏图钉里固定「DSH 抓页」

### 3. 用

- **抓一页**：停在目标页 → 点图标 → 「抓取这一页」
- **整站自动**：点图标 → 打开「本站自动抓取」→ Chrome 弹一次授权 → 之后该域名页面加载完自动落盘
- **快捷键**：`Ctrl+Shift+Y` 不弹面板直接抓

抓到的文件落在 `inbox/`：

| 文件 | 内容 |
|---|---|
| `时间-域名.md` | 正文（取 `article`/`main`，没有才退回 `body`），带 url/title 头 |
| `时间-域名.html` | 渲染后的原始 HTML（看表格、链接时用） |
| `时间-域名.json` | 元信息（字数、来源） |
| `last.json` | 最近一次抓取 |

## 权限与边界

申请了什么：

| 权限 | 用途 |
|---|---|
| `activeTab` | 只在你点图标那一下，拿到当前标签页的读取权 |
| `scripting` | 注入一段取正文的脚本 |
| `storage` | 记住哪些站点开了自动抓 |
| `optional_host_permissions` | 只有你打开「本站自动抓取」时才请求该站点，随时可撤 |
| `http://127.0.0.1:38999/*` | 把结果发给本地桥 |

明确不做的事：

- 不读 cookie、密码、`<input>` 里输入的值（`innerText` 里没有这些）
- 不监听浏览历史，不上传任何数据到外网
- 不开 `--remote-debugging-port`，不接管浏览器

> 注意：`server.mjs` 里的 token 是常量，只挡"误发"不挡"恶意本机程序"。它只监听回环地址，暴露面仅限本机。

## 已知限制

- 只抓**顶层文档**，`iframe` / shadow DOM 里的内容拿不到
- 需要交互才出现的内容（展开、下一页、登录后才有的区块）得先手动点到那个状态
- 单页上限 400k 字符正文 / 4MB HTML，超了截断
- `chrome://`、扩展页、`file://` 不支持
- 未打包扩展：换机器、换 profile 要重新加载，Chrome 启动时可能提示开发者模式

## 协议

扩展 `POST /ingest`，JSON：

```json
{
  "url": "https://example.com/page",
  "title": "Page title",
  "at": "2026-11-11T03:11:02.764Z",
  "text": "正文……",
  "html": "<html>……</html>"
}
```

头里带 `X-DSH-Token`。`GET /ping` 用来探活。

## License

MIT
