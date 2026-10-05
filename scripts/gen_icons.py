"""Gera os ícones do app (PWA + Android) a partir de um desenho vetorial simples.
Uso: .venv/Scripts/python.exe scripts/gen_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'web' / 'public' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)
TOP, BOTTOM = (29, 78, 216), (3, 105, 161)  # gradiente da marca (#1D4ED8 → #0369A1)


def draw_icon(size: int, maskable: bool) -> Image.Image:
    s = size * 4  # supersampling para bordas suaves
    img = Image.new('RGBA', (s, s))
    grad = Image.new('RGBA', (s, s))
    gd = ImageDraw.Draw(grad)
    for y in range(s):
        t = y / s
        gd.line([(0, y), (s, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)) + (255,))
    mask = Image.new('L', (s, s), 0)
    radius = 0 if maskable else int(s * 0.22)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=255)
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    # Área segura: maskable usa 80% central (spec), normal usa ~88%
    k = s * (0.62 if maskable else 0.70)
    cx, cy = s / 2, s / 2 + s * 0.02
    w = k / 2
    white = (255, 255, 255, 255)
    # Livro aberto (duas páginas)
    lw = int(k * 0.07)
    d.polygon([(cx, cy - w * 0.55), (cx - w, cy - w * 0.75), (cx - w, cy + w * 0.45), (cx, cy + w * 0.65)], outline=white, width=lw)
    d.polygon([(cx, cy - w * 0.55), (cx + w, cy - w * 0.75), (cx + w, cy + w * 0.45), (cx, cy + w * 0.65)], outline=white, width=lw)
    d.line([(cx, cy - w * 0.55), (cx, cy + w * 0.65)], fill=white, width=lw)
    # "+" da marca
    pr, pw = w * 0.36, int(k * 0.085)
    px, py = cx + w * 0.78, cy - w * 0.95
    d.ellipse([px - pr * 1.25, py - pr * 1.25, px + pr * 1.25, py + pr * 1.25], fill=(245, 158, 11, 255))
    d.line([(px - pr * 0.6, py), (px + pr * 0.6, py)], fill=white, width=pw)
    d.line([(px, py - pr * 0.6), (px, py + pr * 0.6)], fill=white, width=pw)
    return img.resize((size, size), Image.LANCZOS)


for size in (192, 512):
    draw_icon(size, False).save(OUT / f'icon-{size}.png')
    draw_icon(size, True).save(OUT / f'maskable-{size}.png')
draw_icon(1024, False).save(ROOT / 'web' / 'resources-icon.png')  # base para os ícones Android (Capacitor)
print('Ícones gerados em', OUT)


# ---------------- Android (Capacitor): ícones de launcher e tela de abertura ----------------
RES = ROOT / 'web' / 'android' / 'app' / 'src' / 'main' / 'res'
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def draw_foreground(size: int) -> Image.Image:
    """Camada da frente do ícone adaptativo: só o desenho, sem fundo, dentro da zona segura (66/108)."""
    full = draw_icon(size * 4, True)
    s = size * 4
    # Recorta o desenho do fundo: tudo que não é branco/laranja vira transparente
    px = full.load()
    for y in range(s):
        for x in range(s):
            r, g, b, a = px[x, y]
            if not ((r > 200 and g > 200 and b > 200) or (r > 200 and 120 < g < 190 and b < 60)):
                px[x, y] = (0, 0, 0, 0)
    inner = full.resize((int(size * 66 / 108), int(size * 66 / 108)), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    off = (size - inner.width) // 2
    out.paste(inner, (off, off), inner)
    return out


if RES.exists():
    for name, k in DENSITIES.items():
        d = RES / f'mipmap-{name}'
        legacy = int(48 * k)
        draw_icon(legacy, False).save(d / 'ic_launcher.png')
        rnd = draw_icon(legacy, True)
        mask = Image.new('L', rnd.size, 0)
        ImageDraw.Draw(mask).ellipse([0, 0, legacy - 1, legacy - 1], fill=255)
        rnd.putalpha(mask)
        rnd.save(d / 'ic_launcher_round.png')
        draw_foreground(int(108 * k)).save(d / 'ic_launcher_foreground.png')
    # Fundo do ícone adaptativo = azul da marca
    (RES / 'values' / 'ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1D4ED8</color>\n</resources>\n',
        encoding='utf-8')
    # Tela de abertura: gradiente da marca + ícone no centro, em todos os tamanhos já existentes
    for splash in RES.rglob('splash.png'):
        w, h = Image.open(splash).size
        bg = Image.new('RGB', (w, h))
        gd = ImageDraw.Draw(bg)
        for y in range(h):
            t = y / h
            gd.line([(0, y), (w, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
        logo = draw_foreground(int(min(w, h) * 0.45))
        bg.paste(logo, ((w - logo.width) // 2, (h - logo.height) // 2), logo)
        bg.save(splash)
    print('Ícones e splash do Android atualizados em', RES)
