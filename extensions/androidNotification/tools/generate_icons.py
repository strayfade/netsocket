from PIL import Image
from pathlib import Path

src = Path(r"c:\Users\Noah\Documents\GitHub\netsocket\frontend\public\favicon.png")
res = Path(r"c:\Users\Noah\Documents\GitHub\netsocket\extensions\AndroidNotification\app\src\main\res")
img = Image.open(src).convert("RGBA")
pixels = list(img.getdata())

out = []
for r, g, b, a in pixels:
    lum = (r + g + b) / 3
    if lum < 40:
        out.append((0, 0, 0, 0))
    else:
        alpha = max(a, 255 if lum > 180 else int(lum))
        out.append((255, 255, 255, alpha))

logo = Image.new("RGBA", img.size)
logo.putdata(out)
bbox = logo.getbbox()
if bbox:
    logo = logo.crop(bbox)


def fit_on_canvas(src_logo, size, pad_ratio=0.22, bg=None):
    canvas = Image.new("RGBA", (size, size), bg if bg else (0, 0, 0, 0))
    max_dim = int(size * (1 - 2 * pad_ratio))
    ratio = min(max_dim / src_logo.width, max_dim / src_logo.height)
    w = max(1, int(src_logo.width * ratio))
    h = max(1, int(src_logo.height * ratio))
    scaled = src_logo.resize((w, h), Image.Resampling.NEAREST)
    x = (size - w) // 2
    y = (size - h) // 2
    canvas.paste(scaled, (x, y), scaled)
    return canvas


drawable = res / "drawable"
drawable.mkdir(parents=True, exist_ok=True)

fit_on_canvas(logo, 432, pad_ratio=0.28).save(drawable / "ic_launcher_foreground.png")

for density, size in [
    ("mdpi", 48),
    ("hdpi", 72),
    ("xhdpi", 96),
    ("xxhdpi", 144),
    ("xxxhdpi", 192),
]:
    d = res / f"mipmap-{density}"
    d.mkdir(parents=True, exist_ok=True)
    icon = fit_on_canvas(logo, size, pad_ratio=0.18, bg=(0, 0, 0, 255))
    icon.save(d / "ic_launcher.png")
    icon.save(d / "ic_launcher_round.png")

for density, size in [
    ("mdpi", 24),
    ("hdpi", 36),
    ("xhdpi", 48),
    ("xxhdpi", 72),
    ("xxxhdpi", 96),
]:
    d = res / f"drawable-{density}"
    d.mkdir(parents=True, exist_ok=True)
    fit_on_canvas(logo, size, pad_ratio=0.12).save(d / "ic_notification.png")

fit_on_canvas(logo, 96, pad_ratio=0.12).save(drawable / "ic_notification.png")
fit_on_canvas(logo, 192, pad_ratio=0.18, bg=(0, 0, 0, 255)).save(drawable / "ic_launcher.png")

print("logo size", logo.size)
print("wrote launcher + notification assets")
