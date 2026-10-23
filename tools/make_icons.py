"""Genera los íconos de la extensión (icons/icon16.png … icon128.png) sin dependencias externas.

Dos diseños:
- 48 y 128 px (chrome://extensions y la tienda): el colorido de icons/icon.svg, un icono grande y
  cinco círculos de colores, como una pantalla de inicio.
- 16 y 32 px (la pestaña y la barra de Chrome): icons/icon-small.svg, un círculo gris con cuatro
  huecos. Discreto y monocromático, para que la pestaña se vea tranquila como la nueva pestaña de Chrome.

Uso:  python tools/make_icons.py
"""
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
SS = 4  # supermuestreo por eje (bordes suaves)

# ---- diseño colorido (todo en un lienzo de 128) ----
BG_TOP, BG_BOTTOM = (0x2B, 0x3A, 0x55), (0x1B, 0x22, 0x33)
SHAPES = [
    ('rrect', (20, 20, 78, 78, 17), (0x8A, 0xB4, 0xF8)),
    ('circle', (96, 34, 13), (0xFD, 0xD6, 0x63)),
    ('circle', (96, 65, 13), (0xF2, 0x8B, 0x82)),
    ('circle', (34, 96, 13), (0x81, 0xC9, 0x95)),
    ('circle', (65, 96, 13), (0xC5, 0x8A, 0xF9)),
    ('circle', (96, 96, 13), (0x78, 0xD9, 0xEC)),
]

# ---- diseño discreto: círculo gris con cuatro huecos (dejan ver el color de la pestaña) ----
SMALL_GRAY = (0xAE, 0xB3, 0xB8)
SMALL_HOLES = [(34, 34, 60, 60, 7), (68, 34, 94, 60, 7), (34, 68, 60, 94, 7), (68, 68, 94, 94, 7)]


def in_rrect(x, y, x0, y0, x1, y1, r):
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r and x0 <= x <= x1 and y0 <= y <= y1


def in_circle(x, y, cx, cy, r):
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def sample_colorful(x, y):
    if not in_rrect(x, y, 4, 4, 124, 124, 28):
        return None
    t = (x + y) / 256
    col = [BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t for i in range(3)]
    for kind, p, c in SHAPES:
        if (kind == 'rrect' and in_rrect(x, y, *p)) or (kind == 'circle' and in_circle(x, y, *p)):
            col = list(c)
    return col


def sample_small(x, y):
    if not in_circle(x, y, 64, 64, 60) or any(in_rrect(x, y, *h) for h in SMALL_HOLES):
        return None
    return list(SMALL_GRAY)


def pixel(px, py, size, sample):
    k = 128 / size
    acc, hits = [0.0, 0.0, 0.0], 0
    for sy in range(SS):
        for sx in range(SS):
            col = sample((px + (sx + 0.5) / SS) * k, (py + (sy + 0.5) / SS) * k)
            if col is None:
                continue
            for i in range(3):
                acc[i] += col[i]
            hits += 1
    if not hits:
        return (0, 0, 0, 0)
    return tuple(round(a / hits) for a in acc) + (round(255 * hits / (SS * SS)),)


def png(size, sample):
    rows = b''.join(b'\x00' + b''.join(bytes(pixel(x, y, size, sample)) for x in range(size)) for y in range(size))

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for s in (16, 32, 48, 128):
        with open(os.path.join(OUT, f'icon{s}.png'), 'wb') as f:
            f.write(png(s, sample_small if s <= 32 else sample_colorful))
        print(f'icons/icon{s}.png')
