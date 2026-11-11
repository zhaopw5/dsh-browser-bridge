"""抓页扩展图标：浅蓝纯色底 + 白色取景框 + 中心状态灯。

- 空闲：白色小点
- 抓取中：红色呼吸灯，两帧（亮 / 暗）交替模拟呼吸

用法：python make_icon.py
输出：../icons/{16,32,48,128}.png、../icons/on/...、../icons/on-dim/...
"""

import os

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
S = 1024

SOLID = (124, 196, 245)  # 浅蓝纯色
RED = (239, 68, 68)


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def corner(d, x, y, dx, dy, arm, w):
    def rect(x0, y0, x1, y1):
        d.rectangle([min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)], fill="white")

    rect(x, y, x + dx * arm, y + dy * w)
    rect(x, y, x + dx * w, y + dy * arm)


def build(bold=False, dot=True, live=False, dim=False):
    bg = Image.new("RGBA", (S, S), SOLID + (255,))
    bg.putalpha(rounded_mask(S, int(S * 0.225)))

    glyph = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(glyph)

    inset = S * 0.185
    arm = S * 0.26 if bold else S * 0.285
    w = S * 0.085 if bold else S * 0.058
    corner(d, inset, inset, 1, 1, arm, w)
    corner(d, S - inset, inset, -1, 1, arm, w)
    corner(d, inset, S - inset, 1, -1, arm, w)
    corner(d, S - inset, S - inset, -1, -1, arm, w)

    if dot:
        cx = cy = S / 2
        if live:
            r = S * (0.12 if bold else 0.13)
            # 亮帧：实心红点 + 白环；灭帧：灯完全灭掉，只留取景框
            if not dim:
                ring = S * 0.028
                d.ellipse([cx - r - ring, cy - r - ring, cx + r + ring, cy + r + ring], fill="white")
                d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=RED + (255,))
        else:
            r = S * (0.075 if bold else 0.085)
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill="white")

    return Image.alpha_composite(bg, glyph)


def main():
    dirs = {
        "idle": (OUT, dict(live=False)),
        "on": (os.path.join(OUT, "on"), dict(live=True, dim=False)),
        "on-dim": (os.path.join(OUT, "on-dim"), dict(live=True, dim=True)),
    }
    for name, (target, opts) in dirs.items():
        os.makedirs(target, exist_ok=True)
        normal = build(False, **opts)
        bold = build(True, **opts)
        for size in (16, 32, 48, 128):
            src = bold if size == 16 else normal
            src.resize((size, size), Image.LANCZOS).save(os.path.join(target, f"{size}.png"))
        print("wrote", name)


if __name__ == "__main__":
    main()
