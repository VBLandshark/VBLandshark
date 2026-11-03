"""Builds a light, simple SVG map of the Virginia Beach rec centers with major roads.
Road and water shapes: US Census TIGERweb (public domain), simplified. Output: vb-rec-centers-map.svg
Usage: python3 make_rec_map.py [out.svg]"""
import json, math, re, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, 'vb_map_data.json')))
X = lambda lon: (lon + 76.23) / .28 * 800
Y = lambda lat: (36.95 - lat) / .23 * 821
VB = (140, 95, 640, 640)          # viewBox x, y, w, h

CENTERS = [  # key, name, lat, lon, color (same as the PDF), label side
    ('bay', 'Bayside',       36.8991895, -76.1266792, '#2f6fb5', 'right'),
    ('wf',  'Williams Farm', 36.8647003, -76.1585640, '#7a5a2f', 'right'),
    ('kv',  'Kempsville',    36.8145069, -76.1520948, '#1f8a7a', 'right'),
    ('bow', 'Bow Creek',     36.8229380, -76.0907781, '#8a4fb0', 'left'),
    ('gn',  'Great Neck',    36.8850173, -76.0572260, '#c2571a', 'right'),
    ('st',  'Seatack',       36.8357351, -75.9995902, '#5b7a1f', 'left'),
    ('pa',  'Princess Anne', 36.7647075, -76.0207343, '#b33a5b', 'below'),
]
INTERSTATES = {'I-64', 'I-264'}
SHOW = ['I-264', 'I-64', 'Shore Dr', 'Virginia Beach Blvd', 'Independence Blvd', 'Princess Anne Rd', 'Lynnhaven Pkwy',
        'First Colonial Rd', 'Great Neck Rd', 'Laskin Rd', 'General Booth Blvd', 'Dam Neck Rd', 'Nimmo Pkwy', 'Birdneck Rd',
        'Holland Rd', 'Kempsville Rd', 'Northampton Blvd']
# label: (road, x, y, angle) — placed by hand along each road
LABELS = [
    ('I-264', 415, 393, 8), ('Shore Dr', 236, 148, 5), ('Virginia Beach Blvd', 300, 374, 4),
    ('Independence Blvd', 272, 236, -84), ('Princess Anne Rd', 335, 573, 38), ('Lynnhaven Pkwy', 474, 452, -88),
    ('First Colonial Rd', 583, 318, 70), ('Great Neck Rd', 520, 318, -80), ('General Booth Blvd', 664, 560, -76),
    ('Dam Neck Rd', 560, 584, -3), ('Nimmo Pkwy', 560, 661, -1), ('Holland Rd', 404, 520, 58), ('Kempsville Rd', 178, 492, -64),
    ('Birdneck Rd', 676, 447, 78),
]

def paths(d):
    return [[tuple(map(float, p.split())) for p in seg.split('L')] for seg in d.lstrip('M').split('M') if seg]

def svg(out):
    x0, y0, w, h = VB
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {w} {h}" width="{w}" height="{h}" font-family="Carlito, Liberation Sans, Arial, sans-serif">',
         '<defs><clipPath id="c"><rect x="%d" y="%d" width="%d" height="%d" rx="10"/></clipPath></defs>' % VB,
         '<g clip-path="url(#c)">',
         f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" fill="#f6f5ef"/>']
    o += [f'<path d="{d}" fill="#d4e7ee" fill-rule="evenodd"/>' for d in D['water']]
    # minor major roads first, then interstates on top
    for name in SHOW:
        d = D['roads'].get(name)
        if not d or name in INTERSTATES:
            continue
        o.append(f'<path d="{d}" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>')
        o.append(f'<path d="{d}" fill="none" stroke="#c8c6bc" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>')
    for name in ('I-264', 'I-64'):
        d = D['roads'][name]
        o.append(f'<path d="{d}" fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>')
        o.append(f'<path d="{d}" fill="none" stroke="#e5b07a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>')
    for name, x, y, a in LABELS:
        o.append(f'<text x="{x}" y="{y}" transform="rotate({a} {x} {y})" text-anchor="middle" font-size="10.5" fill="#7d7a6e" '
                 f'stroke="#f6f5ef" stroke-width="3" paint-order="stroke" letter-spacing=".02em">{name}</text>')
    # water labels
    o.append('<text x="725" y="560" transform="rotate(-76 725 560)" text-anchor="middle" font-size="14" font-style="italic" fill="#6e98a8" letter-spacing=".12em">ATLANTIC OCEAN</text>')
    o.append('<text x="300" y="118" text-anchor="middle" font-size="13" font-style="italic" fill="#6e98a8" letter-spacing=".1em">CHESAPEAKE BAY</text>')
    o.append('<text x="440" y="250" text-anchor="middle" font-size="10" font-style="italic" fill="#6e98a8">Lynnhaven</text>')
    # oceanfront marker
    o.append('<text x="712" y="352" text-anchor="end" font-size="10.5" fill="#7d7a6e" stroke="#f6f5ef" stroke-width="3" paint-order="stroke">Oceanfront</text>')
    for k, n, la, lo, col, side in CENTERS:
        x, y = X(lo), Y(la)
        o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="8" fill="{col}" stroke="#ffffff" stroke-width="2.5"/>')
        tx = x + 13 if side == 'right' else x - 13 if side == 'left' else x
        anchor = {'right': 'start', 'left': 'end'}.get(side, 'middle')
        ty = y + 25 if side == 'below' else y + 5
        o.append(f'<text x="{tx:.1f}" y="{ty:.1f}" text-anchor="{anchor}" font-size="15" font-weight="700" fill="{col}" '
                 f'stroke="#ffffff" stroke-width="4" paint-order="stroke">{n}</text>')
    # north arrow and scale (1 mi)
    nx, ny = x0 + 28, y0 + 34
    o.append(f'<path d="M{nx} {ny-16} l7 18 l-7 -5 l-7 5 z" fill="#7d7a6e"/><text x="{nx}" y="{ny+16}" text-anchor="middle" font-size="11" font-weight="700" fill="#7d7a6e">N</text>')
    mi = 800 / (.28 * 69.17 * math.cos(math.radians(36.83)))   # px per mile
    sx, sy = x0 + 18, y0 + h - 22
    o.append(f'<path d="M{sx} {sy}h{2*mi:.1f}" stroke="#7d7a6e" stroke-width="2"/><path d="M{sx} {sy-4}v8M{sx+mi:.1f} {sy-3}v6M{sx+2*mi:.1f} {sy-4}v8" stroke="#7d7a6e" stroke-width="1.5"/>')
    o.append(f'<text x="{sx + mi:.1f}" y="{sy-8}" text-anchor="middle" font-size="10" fill="#7d7a6e">2 miles</text>')
    o.append('</g>')
    o.append(f'<rect x="{x0+.5}" y="{y0+.5}" width="{w-1}" height="{h-1}" rx="10" fill="none" stroke="#d8d5c8"/>')
    o.append('</svg>')
    open(out, 'w').write('\n'.join(o))
    print('wrote', out)

svg(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'vb-rec-centers-map.svg'))
