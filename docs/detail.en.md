# Browser collectors

Pages captured by the **DSH Page Grab** extension in Chrome or Edge land here.

| Collector | Status | Notes |
|---|---|---|
| Chrome | Connected | reports `chrome` at runtime |
| Edge | Connected | same extension, reports `edge` |

The switches below decide which collectors are accepted.

---

**Collector directory** (single copy, no duplicate):

```
~/.dsh/plugins/dsh-browser-bridge/collector
```

Point the browser's *Load unpacked* at it. Upgrades update the files in place: hit **Reload** on the extension card and the path stays valid.

Captures attach to the **most recent session**: the runtime context shows the latest one, and the model can pull the body with the `browser_page` tool.
