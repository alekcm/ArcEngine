#!/usr/bin/env python3
"""door-preview.py — a picture of the corridor door, built from what the engine really creates.

    node nemesis/tools/door-map.mjs          # 1) writes /tmp/door.json: one door, mesh by mesh
    python3 nemesis/tools/door-preview.py    # 2) writes /tmp/door_zbuf.png: that door, drawn

This is not a Babylon render. It is a plain z-buffered, flat-shaded rasteriser of the same boxes,
with the same perspective camera as the scene (Y up). It omits fog and bloom, but includes only
meshes enabled for the state selected by door-map.mjs (open by default, --closed for the panel and
red lamps). This makes the preview useful for checking both the sealed and open door.
"""
import json
import math
import subprocess
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/door_zbuf.png'
data = json.load(open('/tmp/door.json'))
TEXT = data['text']
meshes = [m for m in data['meshes'] if m.get('enabled', True) and not m['name'].startswith('cn_')]

W, H = 880, 600
C = (2.6, 3.15, 4.35)          # eye
T = (0.0, 1.42, 0.0)           # target
FOV = math.radians(35)


def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(a):
    l = math.sqrt(sum(x * x for x in a)) or 1.0
    return (a[0] / l, a[1] / l, a[2] / l)


def dot(a, b): return sum(x * y for x, y in zip(a, b))


fwd = norm(sub(T, C))
right = norm(cross(fwd, (0, 1, 0)))
up = cross(right, fwd)
F = 1 / math.tan(FOV / 2)


def project(p):
    d = sub(p, C)
    x, y, z = dot(d, right), dot(d, up), dot(d, fwd)
    if z < 0.05:
        return None
    return (W / 2 + (x / z) * F * (H / 2), H / 2 - (y / z) * F * (H / 2), z)


def hex2rgb(h):
    h = (h or '#7a8794').lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


LIGHT = norm((-0.5, 0.8, 0.35))
img = [[(7, 11, 16)] * W for _ in range(H)]
depth = [[1e9] * W for _ in range(H)]


def tri(p0, p1, p2, colour):
    (x0, y0, z0), (x1, y1, z1), (x2, y2, z2) = p0, p1, p2
    minx = max(0, int(min(x0, x1, x2))); maxx = min(W - 1, int(max(x0, x1, x2)))
    miny = max(0, int(min(y0, y1, y2))); maxy = min(H - 1, int(max(y0, y1, y2)))
    if minx > maxx or miny > maxy:
        return
    d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if abs(d) < 1e-9:
        return
    r, g, b = colour
    for y in range(miny, maxy + 1):
        row_img, row_dep = img[y], depth[y]
        for x in range(minx, maxx + 1):
            a = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / d
            bb = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / d
            c = 1 - a - bb
            if a < -0.001 or bb < -0.001 or c < -0.001:
                continue
            z = a * z0 + bb * z1 + c * z2
            if z < row_dep[x]:
                row_dep[x] = z
                row_img[x] = (r, g, b)


def quad(pts, base, emissive=False):
    pr = [project(p) for p in pts]
    if any(q is None for q in pr):
        return
    nrm = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])))
    if dot(nrm, norm(sub(C, pts[0]))) < 0:
        nrm = tuple(-x for x in nrm)
    k = 1.0 if emissive else 0.30 + 0.78 * max(0.0, dot(nrm, LIGHT))
    c = tuple(min(255, int(v * k)) for v in base)
    tri(pr[0], pr[1], pr[2], c)
    tri(pr[0], pr[2], pr[3], c)


def box(cx, cy, cz, w, h, d, base, emissive=False):
    x0, x1 = cx - w / 2, cx + w / 2
    y0, y1 = cy - h / 2, cy + h / 2
    z0, z1 = cz - d / 2, cz + d / 2
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
         (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    for q in ([0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]):
        quad([v[i] for i in q], base, emissive)


# the deck and a hint of the corridor rails: backdrop, drawn first, depth-tested as usual
box(0, -0.06, 0.5, 5.4, 0.12, 6.0, hex2rgb('#2b3542'))
for s in (-1, 1):
    box(s * 1.78, 0.92, 0.5, 0.09, 0.09, 5.2, hex2rgb('#3a464f'))
    for zz in (-1.8, 2.6):
        box(s * 1.78, 0.5, zz, 0.07, 0.5, 0.07, hex2rgb('#3a464f'))

for m in meshes:
    nm = m['name']
    if nm == 'apipe':
        cy, cz, L, dia = m['y'], m['z'], 2.58, 0.12
        ring = [(cy + math.cos((i + 0.5) * math.pi / 3) * dia / 2,
                 cz + math.sin((i + 0.5) * math.pi / 3) * dia / 2) for i in range(6)]
        for i in range(6):
            j = (i + 1) % 6
            quad([(-L / 2, ring[i][0], ring[i][1]), (L / 2, ring[i][0], ring[i][1]),
                  (L / 2, ring[j][0], ring[j][1]), (-L / 2, ring[j][0], ring[j][1])], hex2rgb(m['hex'] or '#8c96a0'))
        continue
    box(m['x'], m['y'], m['z'], m['w'], m['h'], m['d'], hex2rgb(m['hex']), nm in ('alamp', 'lel'))

hdr = f'P6\n{W} {H}\n255\n'.encode()
body = bytearray()
for y in range(H):
    row = img[y]
    for x in range(W):
        body += bytes(row[x])
open('/tmp/door_zbuf.ppm', 'wb').write(hdr + bytes(body))
subprocess.run(['convert', '/tmp/door_zbuf.ppm', OUT], check=True)

# the number, printed flat on the plate at its own size (1.9008 x 0.9504), exactly as the game
# paints it: one stencil on the plate's upper face, digits readable from the passage
hw, hd = 1.9008 / 2, 0.9504 / 2
tl = project((-hw, 1.845, -hd))[:2]
tr = project((hw, 1.845, -hd))[:2]
br = project((hw, 1.845, hd))[:2]
bl = project((-hw, 1.845, hd))[:2]
subprocess.run(['convert', '-size', '512x256', 'xc:none', '-font', 'DejaVu-Sans-Bold', '-pointsize', '248',
                '-gravity', 'center', '-fill', '#b9c7d8', '-stroke', '#1b2632', '-strokewidth', '9',
                '-annotate', '+0+6', TEXT, '/tmp/door_digits.png'], check=True)
persp = (f'0,0 {tl[0]:.2f},{tl[1]:.2f} 512,0 {tr[0]:.2f},{tr[1]:.2f} '
         f'512,256 {br[0]:.2f},{br[1]:.2f} 0,256 {bl[0]:.2f},{bl[1]:.2f}')
subprocess.run(['convert', OUT, '(', '/tmp/door_digits.png', '-virtual-pixel', 'transparent',
                '-set', 'option:distort:viewport', f'{W}x{H}+0+0',
                '-distort', 'Perspective', persp, ')', '-composite', OUT], check=True)
print('door preview →', OUT)
