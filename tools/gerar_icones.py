"""Gera os ícones PNG do PWA (uso: python tools/gerar_icones.py)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "app" / "icons"

def icone(size, maskable=False):
    s = 4 * size  # supersampling
    img = Image.new("RGB", (s, s))
    d = ImageDraw.Draw(img)
    a, b = (123, 44, 191), (192, 63, 162)
    for y in range(s):  # gradiente diagonal aproximado (vertical)
        t = y / s
        d.line([(0, y), (s, y)], fill=tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3)))
    m = s * (0.22 if maskable else 0.14)
    W = s - 2 * m
    w = (255, 255, 255)
    # Congresso Nacional estilizado: cúpula do Senado (esq.), cuia da Câmara (dir.), torres, plataforma
    top = m + W * 0.66          # topo da plataforma
    r = W * 0.17
    d.pieslice([m + W*0.24 - r, top - r, m + W*0.24 + r, top + r], 180, 360, fill=w)        # cúpula
    d.pieslice([m + W*0.76 - r*1.25, top - 2*r*0.9, m + W*0.76 + r*1.25, top], 0, 180, fill=w)  # cuia
    d.rectangle([m + W*0.43, m + W*0.08, m + W*0.48, top], fill=w)                               # torre 1
    d.rectangle([m + W*0.52, m + W*0.08, m + W*0.57, top], fill=w)                               # torre 2
    d.rectangle([m + W*0.02, top, m + W*0.98, top + W*0.07], fill=w)                             # plataforma
    d.rectangle([m + W*0.12, top + W*0.14, m + W*0.88, top + W*0.18], fill=w)                    # espelho d'água
    return img.resize((size, size), Image.LANCZOS)

OUT.mkdir(parents=True, exist_ok=True)
icone(192).save(OUT / "icon-192.png")
icone(512).save(OUT / "icon-512.png")
icone(180).save(OUT / "apple-touch-icon.png")
icone(512, maskable=True).save(OUT / "maskable-512.png")
print("ok", sorted(p.name for p in OUT.iterdir()))
