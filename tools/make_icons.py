"""Genera los íconos de la extensión (icons/icon16.png … icon128.png) sin dependencias externas.

Mismo diseño que icons/icon.svg: un icono grande y cinco círculos de colores, como una pantalla de inicio.
Uso:  python tools/make_icons.py
"""
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
SS = 4  # supermuestreo por eje (bordes suaves)

BG_TOP, BG_BOTTOM = (0x2B, 0x3A, 0x55), (0x1B, 0x22, 0x33)
SHAPES = [  # (tipo, parámetros en un lienzo de 128, color)
    ('rrect', (20, 20, 78, 78, 17), (0x8A, 0xB4, 0xF8)),
    ('circle', (96, 34, 13), (0xFD, 0xD6, 0x63)),
    ('circle', (96, 65, 13), (0xF2, 0x8B, 0x82)),
    ('circle', (34, 96, 13), (0x81, 0xC9, 0x95)),
    ('circle', (65, 96, 13), (0xC5, 0x8A, 0xF9)),
    ('circle', (96, 96, 13), (0x78, 0xD9, 0xEC)),
]


def in_rrect(x, y, x0, y0, x1, y1, r):
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r and x0 <= x <= x1 and y0 <= y <= y1


def in_circle(x, y, cx, cy, r):
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def pixel(px, py, size):
    k = 128 / size
    acc = [0.0, 0.0, 0.0, 0.0]
    for sy in range(SS):
        for sx in range(SS):
            x = (px + (sx + 0.5) / SS) * k
            y = (py + (sy + 0.5) / SS) * k
            if not in_rrect(x, y, 4, 4, 124, 124, 28):
                continue
            t = (x + y) / 256
            col = [BG_TOP[i] + (BG_BOTTOM[i] - BG_TOP[i]) * t for i in range(3)]
            for kind, p, c in SHAPES:
                if (kind == 'rrect' and in_rrect(x, y, *p)) or (kind == 'circle' and in_circle(x, y, *p)):
                    col = list(c)
            for i in range(3):
                acc[i] += col[i]
            acc[3] += 1
    n = SS * SS
    if not acc[3]:
        return (0, 0, 0, 0)
    return tuple(round(acc[i] / acc[3]) for i in range(3)) + (round(255 * acc[3] / n),)


def png(size):
    rows = b''.join(b'\x00' + b''.join(bytes(pixel(x, y, size)) for x in range(size)) for y in range(size))

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for s in (16, 32, 48, 128):
        with open(os.path.join(OUT, f'icon{s}.png'), 'wb') as f:
            f.write(png(s))
        print(f'icons/icon{s}.png')
