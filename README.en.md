# dsh-browser-bridge

**English** | [中文](README.md)

Hand any **page you're already logged into in a browser** to a **local AI agent** (DeepSeek Harness).

One repo, two halves:

```
collector/         browser collector (Chrome / Edge extension, MV3)
lib/ locale/ docs/ the DSH plugin itself
```

The collector reads the page; the plugin feeds it into the model's context. They talk over one HTTP endpoint and share no code.

## Why

An agent normally has two ways to read a page, and both fall short:

- `web_fetch` can't pass login walls (401) or see DOM rendered by JavaScript
- Screenshots are pixels: no structure, and someone has to scroll and re-shoot

The extension runs inside **the session you are already logged into**. One click hands over the rendered DOM — no Chrome flags, no `--remote-debugging-port` (blocked for the default profile since Chrome 136), no re-login.

## Install

### 1. The plugin

```bash
dsh plugin add zhaopw5/dsh-browser-bridge
```

For local development, place the repo at `~/.dsh/plugins/dsh-browser-bridge` and add to the profile's `package.json`:

```json
"dsh-browser-bridge": "link:C:/Users/<you>/.dsh/plugins/dsh-browser-bridge"
```

plus `"dsh-browser-bridge"` in `dsh.profile.bundles`.

### 2. The collector

After the plugin starts, `~/.dsh/plugins/dsh-browser-bridge/collector` is the extension directory (**single copy, no duplicates**).

1. Open `chrome://extensions` or `edge://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → pick the `collector` directory
4. Pin it to the toolbar

Chrome and Edge share one codebase: the extension detects its host at runtime (`userAgentData`, falling back to `Edg/`) and reports `chrome` or `edge` accordingly.

### 3. Use

- **One page**: open it → click the icon → *Grab this page*
- **Whole site**: click the icon → turn on *Auto-grab this site* → approve the one-time prompt → every page on that host is captured on load
- **Hotkey**: `Ctrl+Shift+Y` grabs without opening the panel

The plugin's settings page has exactly two switches: Chrome collector, Edge collector.

Captures land in `~/.dsh/browser-bridge/inbox/`:

| File | Contents |
|---|---|
| `timestamp-host.md` | body text (`article`/`main`, falling back to `body`) with a url/title header |
| `timestamp-host.html` | rendered HTML |
| `timestamp-host.json` | metadata |
| `last.json` | most recent capture |

## Model side

The plugin registers three things:

1. **A prompt section** stating that a collector exists, when to use it, and not to substitute a same-named file from the workspace
2. **A runtime context line**, recomputed every turn:
   ```
   浏览器桥：最近一次抓取是「…」（https://…），12 秒前，来自 chrome。文件：…
   ```
3. **A `browser_page` tool** so the model can pull the body without reading the whole file into context

Captures attach to the session whose prompt was assembled most recently, so page captured in project A is used by session A first.

## Protocol

The collector `POST`s to `/ingest` with an `X-DSH-Token` header:

```json
{
  "url": "https://example.com/page",
  "title": "Page title",
  "at": "2026-11-11T03:11:02.764Z",
  "browser": "chrome",
  "text": "body text…",
  "html": "<html>…</html>"
}
```

`GET /ping` is the health check and reports the collectors and the collector directory.

## Permissions and limits

The collector asks for `activeTab` + `scripting` + `storage`, plus optional per-site grants:

- reads the active tab only when you click the icon
- never reads cookies, passwords, or values typed into `<input>`
- never watches browsing history, never sends anything off the machine
- listens on `127.0.0.1:38999` only

Known limits:

- top-level document only; `iframe` and shadow DOM are out of reach
- content hidden behind interaction must be opened first
- 400k characters of text / 4 MB of HTML per page, then truncated
- `chrome://`, extension pages and `file://` are rejected

## License

MIT
