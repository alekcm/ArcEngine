#!/usr/bin/env python3
"""Export user-supplied Unity Chytrid meshes as OBJ for Babylon.

Requires UnityPy (install outside the repository); never exports collider meshes.
The original materials use a normal map but no diffuse image, so it is retained as a bump map.
"""
from pathlib import Path
import UnityPy

SOURCE = Path('Nemesis/dlc/Хитриды')
OUT = Path('nemesis/client/art/chytrids/models')
OUT.mkdir(parents=True, exist_ok=True)
for key, filename in {'stinkhorn':'Отросток', 'deathcap':'Шляпка', 'chyQueen':'Королева'}.items():
    env = UnityPy.load(str(SOURCE / (filename + '.unity3d')))
    rendered = {obj.read().m_Mesh.m_PathID for obj in env.objects if obj.type.name == 'MeshFilter'}
    meshes = [(obj.read().export(), obj.read().m_Name) for obj in env.objects if obj.type.name == 'Mesh' and obj.path_id in rendered]
    if not meshes: raise RuntimeError('Missing rendered mesh: ' + filename)
    text, name = max(meshes, key=lambda x: len(x[0]))
    (OUT / (key + '.obj')).write_text(text, encoding='utf-8')
    for obj in env.objects:
        if obj.type.name == 'Texture2D':
            data = obj.read()
            if 'NMap' in data.m_Name:
                image = data.image.convert('RGB')
                image.save(OUT / (key + '-normal.jpg'), quality=85, optimize=True)
                break
    print(key, name, len(text))
