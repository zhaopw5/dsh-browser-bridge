// 只干一件事：每 700ms 通知 background 换一帧，做出呼吸效果。
// 跑在 offscreen 文档里，所以不会被 MV3 的 service worker 回收打断。

let bright = true;

setInterval(() => {
  bright = !bright;
  chrome.runtime.sendMessage({ type: 'pulse', bright }).catch(() => {});
}, 700);
