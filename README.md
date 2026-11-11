# dsh-browser-bridge

[English](README.en.md) | **中文**

把**你在浏览器里已经登录的页面**，交给**跑在本机的 AI agent**（DeepSeek Harness）读。

一个仓库，两个部分：

```
collector/         浏览器采集端（Chrome / Edge 扩展，MV3）
lib/ locale/ docs/ 接入端（DSH 插件本身）
```

采集端读页面，接入端把它送进模型的上下文。两边只靠一条 HTTP 协议握手，没有代码依赖。

## 为什么需要它

agent 读网页通常只有两条路，都不够用：

- `web_fetch`：进不了要登录的内网页面（401），也看不到 JS 渲染后的 DOM
- 截图：只有像素，没有结构，还要人肉翻页

扩展跑在**你已经登录的那个会话里**，点一下就把渲染后的 DOM 交出去——不用改 Chrome 配置、不用 `--remote-debugging-port`（Chrome 136+ 对默认 profile 已禁用）、不用重新登录。

## 装

### 1. 装插件

```bash
dsh plugin add zhaopw5/dsh-browser-bridge
```

或者本地开发时，把仓库放到 `~/.dsh/plugins/dsh-browser-bridge`，在 profile 的 `package.json` 里加：

```json
"dsh-browser-bridge": "link:C:/Users/<you>/.dsh/plugins/dsh-browser-bridge"
```

并在 `dsh.profile.bundles` 里加一行 `"dsh-browser-bridge"`。

### 2. 装采集器

插件启动后，`~/ dsh/plugins/dsh-browser-bridge/collector` 就是扩展目录（**唯一一份，不另存副本**）。

1. `chrome://extensions` 或 `edge://extensions`
2. 打开 **开发者模式 / 开发人员模式**
3. **加载未打包的扩展程序** → 选 `collector` 目录
4. 固定到工具栏

Chrome 和 Edge 用同一份代码：扩展在运行时判断自己在哪个浏览器（`userAgentData` → `Edg/` 兜底），上报的 `browser` 字段就是 `chrome` 或 `edge`。

### 3. 用

- **抓一页**：停在目标页 → 点图标 → 「抓取这一页」
- **整站自动**：点图标 → 打开「本站自动抓取」→ 浏览器弹一次授权 → 之后该域名页面加载完自动落盘
- **快捷键**：`Ctrl+Shift+Y` 不弹面板直接抓

插件配置页只有两个开关：Chrome 采集器、Edge 采集器。

抓到的页面落在 `~/.dsh/browser-bridge/inbox/`：

| 文件 | 内容 |
|---|---|
| `时间-域名.md` | 正文（取 `article`/`main`，没有才退回 `body`），带 url/title 头 |
| `时间-域名.html` | 渲染后的原始 HTML |
| `时间-域名.json` | 元信息 |
| `last.json` | 最近一次抓取 |

## 模型侧

插件注册三样东西：

1. **一段固定提示**：说明采集器存在、什么时候该用、不要拿工作区里的同名旧文件替代
2. **一条运行时上下文**（每轮重算）：
   ```
   浏览器桥：最近一次抓取是「…」（https://…），12 秒前，来自 chrome。文件：…
   ```
3. **`browser_page` 工具**：直接取正文，不用整份文件读进上下文

抓取归属到**最近一次装配 prompt 的会话**，所以 A 项目里抓的页，A 会话优先用。

## 协议

采集端 `POST /ingest`，头里带 `X-DSH-Token`：

```json
{
  "url": "https://example.com/page",
  "title": "Page title",
  "at": "2026-11-11T03:11:02.764Z",
  "browser": "chrome",
  "text": "正文……",
  "html": "<html>……</html>"
}
```

`GET /ping` 探活，返回连接器和采集器路径。

## 权限与边界

采集端只申请 `activeTab` + `scripting` + `storage`，外加按站点的可选授权：

- 只在你点图标那一下读当前标签页
- 不读 cookie、密码、`<input>` 里输入的值
- 不监听浏览历史，不往外网发任何东西
- 只听 `127.0.0.1:38999`

已知限制：

- 只抓顶层文档，`iframe` / shadow DOM 拿不到
- 需要交互才出现的内容得先手动点到那个状态
- 单页上限 400k 字符正文 / 4 MB HTML
- `chrome://`、扩展页、`file://` 不支持

## License

MIT
