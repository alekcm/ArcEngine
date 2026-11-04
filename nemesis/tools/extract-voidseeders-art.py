#!/usr/bin/env python3
"""Extract illustration-only thumbnails from the supplied Voidseeder sheets.

Run from the repository root with Pillow. Text is rendered separately by the client.
"""
from pathlib import Path
from PIL import Image

root = Path('Nemesis/dlc/Кошмары')
out = Path('nemesis/client/art/voidseeders')
sheets = {kind: Image.open(next(root.glob(pattern))).convert('RGB') for kind, pattern in {
    'event': '*Сеятели Пустоты - События.png',
    'attack': '*Сеятели Бездны - Атака.png',
    'panic': '*Сеятели Пустоты - Паника.png',
}.items()}
for kind, sheet in sheets.items():
    folder = out / kind
    folder.mkdir(parents=True, exist_ok=True)
    # Stable IDs were assigned by effect, not sheet position. Preserve IDs in saves.
    panic_sheet_order = [0, 1, 2, 3, 5, 6, 4, 7, 8, 11, 9, 10, 13, 14, 12, 15, 16, 17, 19, 18]
    attack_sheet_order = [0, 1, 3, 4, 2, 8, 7, 9, 6, 10, 5, 11, 12, 13, 16, 15, 14, 17, 19, 18]
    event_sheet_order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 15]
    for i in range(20):
        sheet_index = {'panic': panic_sheet_order, 'attack': attack_sheet_order, 'event': event_sheet_order}[kind][i]
        col, row = sheet_index % 5, sheet_index // 5
        cw, ch = sheet.width / 5, sheet.height / 4
        part = sheet.crop(tuple(round(n) for n in ((col+.05)*cw, (row+.08)*ch, (col+.95)*cw, (row+.53)*ch)))
        part.thumbnail((480, 280), Image.Resampling.LANCZOS)
        part.save(folder / ('void' + kind.title() + str(i+1) + '.jpg'), quality=83, optimize=True, progressive=True)
