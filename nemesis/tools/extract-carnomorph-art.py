#!/usr/bin/env python3
"""Extract illustration-only thumbnails from the supplied Carnomorph sheets.

Run from the repository root with Pillow installed. Rules text is deliberately kept out of
these crops: the client renders the current Redux-adapted wording next to the illustration.
The event IDs follow engine IDs, not the source sheet's position.
"""
from pathlib import Path
from PIL import Image

root = Path('Nemesis/dlc/Карноморфы')
out = Path('nemesis/client/art/carnomorph')
sheets = {label: Image.open(next(root.glob(pattern))).convert('RGB') for label, pattern in {
    'event': '*Карноморфы - События.png',
    'attack': '*Карноморфы - Атака.png',
    'mutation': '*Карноморфы - Мутация Персонажей.png',
}.items()}
# Physical sheet, 1-based, for each stable engine event ID.
event_indices = [1, 2, 3, 4, 6, 5, 7, 9, 10, 11, 8, 13, 12, 14, 15, 16, 17, 18, 19, 20]
mutations = ['adaptation', 'regeneration', 'gastric', 'boilingBlood', 'claw', 'scream',
             'escapeArtist', 'mimicry', 'senses', 'genomeError', 'shapeChange', 'trickster']

def extract(sheet, cols, rows, index, box):
    col, row = (index - 1) % cols, (index - 1) // cols
    cw, ch = sheet.width / cols, sheet.height / rows
    x1, y1, x2, y2 = box
    part = sheet.crop(tuple(round(n) for n in ((col+x1)*cw, (row+y1)*ch, (col+x2)*cw, (row+y2)*ch)))
    part.thumbnail((480, 280), Image.Resampling.LANCZOS)
    return part

def save(kind, name, image):
    folder = out / kind
    folder.mkdir(parents=True, exist_ok=True)
    image.save(folder / (name + '.jpg'), quality=83, optimize=True, progressive=True)

for idx, physical in enumerate(event_indices, 1):
    save('event', 'carnoEvent' + str(idx), extract(sheets['event'], 5, 4, physical, (.06, .11, .94, .43)))
attack_indices = [1, 2, 3, 4, 5, 9, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 19]
for idx, physical in enumerate(attack_indices, 1):
    save('attack', 'carnoAttack' + str(idx), extract(sheets['attack'], 5, 4, physical, (.25, .05, .96, .54)))
for idx, name in enumerate(mutations, 1):
    save('mutation', name, extract(sheets['mutation'], 4, 3, idx, (.04, .03, .96, .33)))

# Redux Carnomorph sheets. The stable data ids are in sheet order, so the physical card number
# is simply the index here. Art is shared by duplicate attack/butcher cards to keep the deck small.
redux_root = Path('Nemesis/dlc/Redux Карноморфы')
redux_sheets = {label: Image.open(next(redux_root.glob(pattern))).convert('RGB') for label, pattern in {
    'attack': '*CarnoAttackDeck.png',
    'event': '*CarnoEventDeck.png',
    'mutation': '*CarnoMutationDeck.png',
    'butcher': '*CarnoButcherDeck.png',
}.items()}
redux_attacks = ['bash', 'bite', 'devour', 'miss', 'regurgitate', 'slash', 'spawn', 'whiplash']
redux_mutations = ['adaptation', 'boilingBlood', 'claw', 'contortionist', 'escapeMaster', 'gastric',
                   'geneticMalfunction', 'mimicry', 'regenerativeTissue', 'scream', 'shapeshift', 'sharpenedSenses']

def save_redux(kind, name, image):
    folder = out / 'redux' / kind
    folder.mkdir(parents=True, exist_ok=True)
    image.save(folder / (name + '.jpg'), quality=82, optimize=True, progressive=True)

for idx, name in enumerate(redux_attacks, 1):
    save_redux('attack', name, extract(redux_sheets['attack'], 4, 2, idx, (.02, .04, .98, .54)))
for idx in range(1, 21):
    save_redux('event', 'rxEvent' + str(idx), extract(redux_sheets['event'], 5, 4, idx, (.04, .04, .96, .34)))
for idx, name in enumerate(redux_mutations, 1):
    save_redux('mutation', name, extract(redux_sheets['mutation'], 4, 3, idx, (.03, .02, .97, .38)))
save_redux('', 'butcher', extract(redux_sheets['butcher'], 3, 3, 1, (.02, .02, .98, .78)))
