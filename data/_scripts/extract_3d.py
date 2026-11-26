#!/usr/bin/env python3
"""Extract meshes and textures from Unity assetbundles → data/3d/.

Outputs:
  data/3d/models/*.obj       one OBJ per mesh  (mesh.read().export())
  data/3d/textures/*.png     one PNG per texture (Texture2D.image)
  data/3d/assetbundles.json  inventory: bundle source, mesh/texture names,
                             vertex/triangle counts, texture sizes

Naming: inventory key = AssetBundle m_Name (beor, ailei, arev, maggot,
menhir1..3, niamh, best2). The best2 bundle (BestCoinEver2 counter piece)
carries three Cyrillic-named textures; its smallest texture (16x32) and
the mesh are saved as `counter` — matching the verified inventory.
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
        bundle_name = None
        meshes = []
        textures = []  # (name, PIL image)
        for obj in env.objects:
            if obj.type.name == 'AssetBundle':
                bundle_name = obj.read().m_Name
            elif obj.type.name == 'Mesh':
                data = obj.read()
                meshes.append((data.m_Name, data.export()))
            elif obj.type.name == 'Texture2D':
                data = obj.read()
                textures.append((data.m_Name, data.image))

        key = bundle_name or (meshes[0][0] if meshes else path.stem)
        # best2 (BestCoinEver2): mesh Cylinder + smallest texture -> `counter`
        if key == 'best2':
            mesh_name = 'counter'
            tex_name = 'counter'
            tex_img = min(textures, key=lambda t: t[1].width * t[1].height)[1]
        else:
            mesh_name = meshes[0][0] if meshes else key
            tex_name, tex_img = textures[0] if textures else (key, None)

        entry = {'source': path.name, 'mesh': None, 'texture': None}
        if meshes:
            obj_text = next(t for n, t in meshes if n == mesh_name) if any(
                n == mesh_name for n, _ in meshes) else meshes[0][1]
            (MODELS / f'{mesh_name}.obj').write_text(obj_text, encoding='utf-8')
            entry['mesh'] = {
                'name': mesh_name,
                'file': f'models/{mesh_name}.obj',
                'vertices': obj_text.count('v '),
                'triangles': max(0, obj_text.count('f ')),
            }
        if tex_img is not None:
            tex_img.save(TEXTURES / f'{tex_name}.png')
            entry['texture'] = {
                'name': tex_name,
                'file': f'textures/{tex_name}.png',
                'width': tex_img.width,
                'height': tex_img.height,
            }
        if key in inventory:
            print(f'WARN duplicate bundle key {key}', file=sys.stderr)
        inventory[key] = entry
        mesh, tex = entry['mesh'], entry['texture']
        print(f'{key}: mesh={mesh and mesh["name"]} tex={tex and tex["name"]} '
              f'{tex and (tex["width"], tex["height"])}')

    # drop leftovers from earlier runs (e.g. niamh.001.obj from Cylinder pass)
    keep_m = {e['mesh']['file'].split('/')[-1] for e in inventory.values() if e['mesh']}
    keep_t = {e['texture']['file'].split('/')[-1] for e in inventory.values() if e['texture']}
    for p in MODELS.glob('*.obj'):
        if p.name not in keep_m:
            p.unlink()
    for p in TEXTURES.glob('*.png'):
        if p.name not in keep_t:
            p.unlink()

    OUT_JSON.write_text(json.dumps(inventory, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{len(inventory)} bundles -> {OUT_JSON}; '
          f'{len(list(MODELS.glob("*.obj")))} OBJ, {len(list(TEXTURES.glob("*.png")))} PNG')


if __name__ == '__main__':
    main()
