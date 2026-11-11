# DSH Page Grab

[中文](README.md) | **English**

Hand any **page you're already logged into in Chrome** to a **local AI agent** (DeepSeek Harness).

A Chrome extension plus a tiny loopback-only service. You do the login, the 2FA, the captcha — the agent only gets the rendered page.

## Why this exists

An agent normally has two ways to read a web page, and both fall short:

- `web_fetch` can't get past login walls (401), and can't see DOM that JavaScript renders
- Screenshots are pixels: no structure, no links, and someone has to scroll and re-shoot every page

An extension runs inside **the session you're already logged into**. One click hands over the rendered DOM — no Chrome flags, no `--remote-debugging-port` (blocked for the default profile since Chrome 136), no re-login.

## Layout

```
extension/         Chrome extension (MV3)
  manifest.json    activeTab + scripting + storage
  background.js    capture logic, auto-capture whitelist
  popup.html/js    the panel behind the toolbar icon
server.mjs         local bridge: 127.0.0.1:38999 only, writes into inbox/
start-bridge.cmd   double-click launcher (Windows)
```

## Install

### 1. Start the bridge

```bash
node server.mjs
```

Or double-click `start-bridge.cmd` on Windows. Wait for `listening on http://127.0.0.1:38999`.

### 2. Load the extension

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → pick the `extension` directory
4. Pin "DSH 抓页" from the puzzle-piece menu

### 3. Use it

- **One page**: open it → click the icon → **Grab this page**
- **Whole site**: click the icon → turn on **Auto-grab this site** → approve the one-time Chrome prompt → every page on that host is captured on load
- **Hotkey**: `Ctrl+Shift+Y` grabs without opening the panel

Output lands in `inbox/`:

| File | Contents |
|---|---|
| `timestamp-host.md` | body text (`article`/`main`, falling back to `body`) with a url/title header |
| `timestamp-host.html` | rendered HTML (for tables and link structure) |
| `timestamp-host.json` | metadata (sizes, source) |
| `last.json` | most recent capture |

## Permissions and boundaries

| Permission | Why |
|---|---|
| `activeTab` | read the current tab, only for the moment you click the icon |
| `scripting` | inject the body-extraction script |
| `storage` | remember which hosts have auto-grab enabled |
| `optional_host_permissions` | requested per site only when you enable auto-grab; revocable anytime |
| `http://127.0.0.1:38999/*` | deliver the result to the local bridge |

What it explicitly does **not** do:

- Read cookies, passwords, or values typed into `<input>` (`innerText` contains none of that)
- Watch your browsing history, or send anything off the machine
- Open `--remote-debugging-port` or take over the browser

> Note: the token in `server.mjs` is a constant. It stops stray POSTs, not a hostile local process. The server binds loopback only, so the exposure is limited to your own machine.

## Known limits

- Top-level document only — `iframe` and shadow DOM content is not reached
- Anything hidden until interaction (expanders, pagination, post-login blocks) must be opened first
- 400k characters of text / 4 MB of HTML per page, then truncated
- `chrome://`, extension pages and `file://` are rejected
- Unpacked extension: reload it after moving machines or profiles; Chrome may nag about developer mode

## Protocol

The extension `POST`s JSON to `/ingest`:

```json
{
  "url": "https://example.com/page",
  "title": "Page title",
  "at": "2026-11-11T03:11:02.764Z",
  "text": "body text…",
  "html": "<html>…</html>"
}
```

with an `X-DSH-Token` header. `GET /ping` is the health check.

## License

MIT
