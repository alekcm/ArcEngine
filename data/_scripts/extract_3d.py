#!/usr/bin/env python3
"""Extract meshes and textures from Unity assetbundles → data/3d/.

Outputs:
  data/3d/models/*.obj       one OBJ per mesh  (mesh.read().export())
  data/3d/textures/*.png     one PNG per texture (Texture2D.image)
  data/3d/assetbundles.json  inventory: bundle source, mesh/texture names,
                             vertex/triangle counts, texture sizes

The 9 bundles in Mods/Assetbundles/ carry steam-URL file names; the real
asset names (beor, ailei, arev, maggot, menhir1..3, niamh, counter) come
from m_Name inside the bundle.
"""
import json
import sys
from pathlib import Path

import UnityPy

ROOT = Path('/home/user/ArcEngine')
SRC = ROOT / 'Mods' / 'Assetbundles'
MODELS = ROOT / 'data' / '3d' / 'models'
TEXTURES = ROOT / 'data' / '3d' / 'textures'
OUT_JSON = ROOT / 'data' / '3d' / 'assetbundles.json'

MODELS.mkdir(parents=True, exist_ok=True)
TEXTURES.mkdir(parents=True, exist_ok=True)


def main() -> None:
    files = sorted(SRC.glob('*.unity3d'))
    if not files:
        sys.exit(f'no .unity3d bundles in {SRC}')
    inventory: dict[str, dict] = {}
    for path in files:
        env = UnityPy.load(str(path))
        entry: dict = {'source': path.name, 'mesh': None, 'texture': None}
        for obj in env.objects:
            if obj.type.name == 'Mesh':
                data = obj.read()
                name = data.m_Name or path.stem
                obj_text = data.export()
                (MODELS / f'{name}.obj').write_text(obj_text, encoding='utf-8')
                entry['mesh'] = {
                    'name': name,
                    'file': f'models/{name}.obj',
                    'vertices': obj_text.count('v '),
                    'triangles': max(0, obj_text.count('f ')),
                }
            elif obj.type.name == 'Texture2D':
                data = obj.read()
                name = data.m_Name or path.stem
                img = data.image
                img.save(TEXTURES / f'{name}.png')
                entry['texture'] = {
                    'name': name,
                    'file': f'textures/{name}.png',
                    'width': img.width,
                    'height': img.height,
                }
        key = (entry['mesh'] or {}).get('name') or (entry['texture'] or {}).get('name') or path.stem
        if key in inventory:
            print(f'WARN duplicate asset name {key} ({path.name} vs {inventory[key]["source"]})',
                  file=sys.stderr)
        inventory[key] = entry
        mesh, tex = entry['mesh'], entry['texture']
        print(f'{path.name[:48]}: mesh={mesh and mesh["name"]} '
              f'tex={tex and tex["name"]} {tex and (tex["width"], tex["height"])}')

    OUT_JSON.write_text(json.dumps(inventory, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(inventory)} bundles -> {OUT_JSON}; '
          f'{len(list(MODELS.glob("*.obj")))} OBJ, {len(list(TEXTURES.glob("*.png")))} PNG')


if __name__ == '__main__':
    main()
