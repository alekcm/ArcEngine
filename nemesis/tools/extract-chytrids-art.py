#!/usr/bin/env python3
"""Extract illustration-only Chytrid card art; texts are rendered by the client."""
from pathlib import Path
from PIL import Image
root = Path('Nemesis/dlc/Хитриды')
out = Path('nemesis/client/art/chytrids')
for kind, pattern in {'event': '*События*', 'attack': '*Атака*'}.items():
    sheet = Image.open(next(root.glob(pattern))).convert('RGB')
    folder = out / kind
    folder.mkdir(parents=True, exist_ok=True)
    cw, ch = sheet.width / 6, sheet.height / 4
    attack_sheet_order = [0, 1, 2, 3, 4, 6, 5, 19, 12, 9, 10, 11, 7, 13, 17, 8, 16, 15, 18, 14]
    event_sheet_order = [0,19,3,9,16,2,12,5,14,6,1,11,17,4,15,18,10,7,8,13]
    for i in range(20):
        sheet_index = (attack_sheet_order if kind == 'attack' else event_sheet_order)[i]
        col, row = sheet_index % 6, sheet_index // 6
        crop = sheet.crop(tuple(round(n) for n in ((col+.05)*cw, (row+.08)*ch, (col+.95)*cw, (row+.53)*ch)))
        crop.thumbnail((480, 280), Image.Resampling.LANCZOS)
        crop.save(folder / ('chy' + kind.title() + str(i+1) + '.jpg'), quality=83, optimize=True, progressive=True)
