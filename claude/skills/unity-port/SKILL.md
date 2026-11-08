---
name: unity-port
description: Moving a prototype made on the kit to Unity — tools/export-unity.mjs (scene, UI, constants, assets and the MIGRATION.md report into a Unity project), the ArcRuntime package in unity/com.arcengine.runtime (C# twin of the kit's JS API and the scene importer), porting game code JS -> C#, the arc-base tag. Read before exporting to Unity, porting game code to C#, editing unity/ or tools/export-unity.mjs, and when the user asks how a prototype moves to Unity. Not needed while prototyping.
---

# Porting a prototype to Unity

Prototyping stays pure JS — nothing here applies until the move. What moves by itself is DATA:
`Constants.js`, `Objects.js`, `UILayout.js`, the terrain and the assets. What moves by hand is the
game code, and it moves line by line because the package mirrors the kit's API:
`UI.get('score')` -> `UI.Get("score")`, `location.findByTag('coin')` -> `app.Location.FindByTag("coin")`.

```
node tools/export-unity.mjs --report           # only the report, dist/MIGRATION.md — any time, no Unity
node tools/export-unity.mjs <UnityProject>     # Assets/ArcExport/ + Packages/com.arcengine.runtime
Unity.exe -batchmode -projectPath <UnityProject> -executeMethod ArcEngine.Editor.ArcImporter.ImportCli -logFile import.log
Unity.exe -batchmode -projectPath <UnityProject> -runTests -testPlatform EditMode -testResults r.xml -logFile t.log
```

In the Unity editor the import is the menu **ArcEngine > Import export**. Batchmode exit code 0 —
no errors; the log lines start with `ArcEngine`. Unity must not have the project open meanwhile.

## The chain

1. **Unity project**: Unity 6 (6000.x), the Universal 3D (URP) template — it brings the Input System
   the camera reads. Nothing else to install: the package pulls glTFast (GLB models) itself.
2. **Export** (`tools/export-unity.mjs`) writes `Assets/ArcExport/`: `arc-export.json` (every
   constant, object and UI record with all fields, terrain grid sizes, golden numbers), `terrain.bytes`
   (heights, float32), `assets/…` under their kit paths, `MIGRATION.md`; and copies the package into
   `Packages/com.arcengine.runtime` — the same version as the export, no download. A project whose
   `Packages/manifest.json` already references the package (a `file:` path to the kit's `unity/`
   folder) keeps the reference. A package file edited inside the Unity project is not overwritten
   (`.arc-export.json` there remembers what the export wrote) — the export prints it.
3. **Import** (`ArcImporter`) builds `Assets/Arc/Scene.unity` and checks itself (below).
4. **Report** — `Assets/ArcExport/MIGRATION.md` (or `dist/MIGRATION.md` with `--report`), built
   from the code on every run, so it is never stale and nobody keeps it by hand:
   - the features: every game file with its header comment — the description the file starts
     with, like every file of the kit (a file without one is marked: its feature is unknown);
   - every kit call of the game code with its C# twin, and calls with no twin (BABYLON,
     `World3D.*`, the view, DOM, timers) — port by hand;
   - kit members no `API` row knows (`UI.scale`, `location.loadGround`…) — a twin to add to the
     package plus an `API` row, or a typo;
   - the scene contract (tags and UI ids the code asks for that the scene does not have), the
     constants the game reads, what the prototype changed in the kit since `arc-base`, what never ports.
5. **Port** each game file (`js/` minus the kit's modules — `KIT_FILES`) to C# in `Assets/Game/`
   with an asmdef referencing `ArcEngine.Runtime` (tests can then reference it too).
6. **Check**: import exit code 0, tests, Play.

## Game code: JS -> C#

```csharp
using ArcEngine;
using UnityEngine;

public class Game : IArcGame                     // ArcApp finds it by name (gameClass = "Game")
{
    public Game(ArcApp app) { … }                // constructor(app)
    public void Update(float dt) { … }           // update(dt) — called before location, camera, sound
}
```

| JS | C# |
|---|---|
| `app.location`, `app.camera` | `app.Location`, `app.Camera` |
| `rec.def.x`, `rec.mesh` | `rec.Def.x` (records keep the file's field names), `rec.Mesh` |
| `findByTag('t')[0] \|\| null` | `var l = app.Location.FindByTag("t"); var r = l.Count > 0 ? l[0] : null;` |
| `const el = UI.get('id'); if (el) …` | `var el = UI.Get("id"); if (el) …` (a component: `if (el)` is the null guard) |
| `el.setText(s)`, `setValue(v)`, `show(on)`, `onClick(fn)` | `SetText`, `SetValue`, `Show`, `OnClick(() => …)` |
| `Model3D.clips(rec.mesh).play('run', { loop: false, then: 'idle' })` | `Model3D.Clips(rec.Mesh).Play("run", new ClipOptions { Loop = false, Then = "idle" })` |
| `Sound3D.play('assets/sounds/x.wav', { at: def, volume: 0.7 })` | `Sound3D.Play("assets/sounds/x.wav", new SoundOptions { At = def, Volume = 0.7f })` |
| `camera.follow(obj)` | `app.Camera.Follow(obj)` — obj is an `IMapPoint` (a `Def` is one) |
| `typeof GAME_X !== 'undefined' ? GAME_X : 8` | `Arc.Const("GAME_X", 8f)` — the `ArcConstants` asset |
| `World3D.engine.getFps()`, `Store.get`, `IS_MOBILE`, `Math.random()` | `World3D.GetFps()`, `Store.Get` (PlayerPrefs), `Arc.IsMobile`, `Random.value` |

Logic keeps its map numbers (px, y down the map): only the view converts. Methods and objects are
PascalCase, data fields keep their JS names. A twin that is missing is a C# method to add to the
package under the same name — plus a row in `API` of `export-unity.mjs`, so the report knows it.

## Coordinates — one conversion

| Map (px) | Unity (m) |
|---|---|
| `x` | `X = x / 100` |
| height | `Y = h / 100` |
| `y` (down the map) | `Z = −y / 100` |
| `rot [x, y, z]°` | `Euler(−x, y, z)` — `y` stays the heading (0 — along +x, 90 — down the map) |

In code: `ArcSpace.ToWorld / ToMap / Rotation / Heading / Direction`. The kit's Babylon scene is
right-handed, Unity's left-handed: the Unity world is the kit's world mirrored in Z, which is why a
spin angle changes sign (`Location3D.SpinPart`) while what is seen on screen does not.
Models sit under a `model` node that undoes what the importers do (`Model3D.FitRotation`): both
glTFast and Unity's FBX importer mirror X; FBX gets 180° about Y, glTF 90° (glTF front +Z -> the
kit's nose +X).

**Golden checks.** The export computes in JS — with the kit's own `Terrain3D` and FBX parser —
terrain heights at 45 points, every object's position, every model's bounds and the centroid of its
distinct vertices; the importer recomputes them in C# and fails on a mismatch. The centroid is what
catches a turned or mirrored model (a box looks the same; the kit's mill moves its centroid by
19 cm). An FBX with unusual axes or a new importer version shows up here, not in a screenshot.

## What the importer builds

```
ArcApp (ArcApp: constants, assets, gameClass)   <- REBUILT on every import; put own objects outside
  Sun (directional, WORLD3D_SUN_*)              fog, sky, ambient — ArcApp.ApplyRenderConstants
  Location (Location3D)
    Terrain (Terrain3D: terrain.bytes, meshes built on enable, never saved)
    Objects / <name> (LocationObject: Def) / model (fit) / <prefab instance> (+ Clips3D for GLB)
  Main Camera (CameraController — the kit's game camera)
  UI (Canvas + CanvasScaler: reference height UI_REF_HEIGHT, match height; UIElement per record)
EventSystem (Input System UI module)
```

`Assets/Arc/ArcConstants.asset` — the constants (a re-import OVERWRITES the values: tune in
`Constants.js` while the prototype lives, in the asset once it has moved). `ArcAssets.asset` — kit
path -> asset; a model's clips are `path#clip`. `gameClass` survives a re-import.

## Never ported (the report repeats it)

Toon bands, ink edges, silhouette outline and the shadow color (URP Shader Graph / Renderer Feature
work), `Instances3D` (-> GPU instancing), `Debug3D`, the editor, camera pan by the middle button,
touch and zoom to the cursor, text shadow. Ground beyond the location edge: heights from the ring
grid, not from the noise.

## arc-base

A prototype is a copy of the kit. Tag the commit it was copied from: `git tag arc-base <commit>`.
The report then lists changed kit modules and new files since then — a changed kit module has a
C# twin that knows nothing of the change: port it by hand (in `Assets/`, not in the package).

## The package (`unity/com.arcengine.runtime`)

| File | What |
|---|---|
| `Runtime/Arc.cs` | `Arc.Const`, `Arc.Hex/Css`, `IMapPoint`, `Store`, `World3D.GetFps` |
| `Runtime/ArcConstants.cs`, `ArcAssets.cs` | the constants asset; the asset registry by kit path |
| `Runtime/ArcSpace.cs` | the coordinate conversion |
| `Runtime/ArcApp.cs` | `main.js`: `app`, the frame loop, `IArcGame`, render constants |
| `Runtime/Location3D.cs`, `LocationObject.cs`, `Terrain3D.cs`, `Model3D.cs`, `Clips3D.cs` | location, records, ground, models, clips (Playables mixer, the kit's weights) |
| `Runtime/Sound3D.cs` | the kit's sound math on 2D AudioSources |
| `Runtime/UI.cs`, `UIElement.cs`, `UIBuilder.cs` | `UI.Get`, the elements, record -> uGUI |
| `Runtime/CameraController.cs` | the game camera |
| `Editor/ArcImporter.cs` | import, golden checks, TMP essentials |
| `Tests/Editor/ArcRuntimeTests.cs` | coordinates, sound, UI layout against the kit's `UI.resolve`, import self-check |

The kit has no C# compiler: after editing `unity/`, export into a Unity project whose manifest
points at the folder (`"com.arcengine.runtime": "file:<path to unity/com.arcengine.runtime>"`, plus
`"testables": ["com.arcengine.runtime"]`), run the import and the tests in batchmode. Unity writes
`.meta` files into the folder — they belong to the repository (scenes reference the GUIDs).
`arc-export.json` format change: `FORMAT` in `export-unity.mjs` and `Format` in `ArcImporter.cs`
together — `tests/unity-export.test.mjs` compares them.

## Pitfalls (each already cost an iteration)

- `AssetDatabase.ImportPackage` is only queued in a batchmode call — the TMP essentials (without
  them every text is invisible) are unpacked from the `.unitypackage` by hand.
- The URP template runs the Input System only: legacy `Input.*` throws. The package reads input
  under `ARC_INPUT_SYSTEM` (asmdef `versionDefines`).
- glTFast imports clips for Mecanim (loop on) and puts an Animator on the model root; `Clips3D`
  plays them through a Playables mixer. A Legacy clip cannot be played that way.
- `JsonUtility` gives 0 for a missing field (an invisible element, a silent sound): the export writes
  every field (`normalizeObject`, `normalizeUI`).
- A MonoBehaviour cannot have `Update(float)` — the per-frame calls are `Tick(dt)`; a MonoBehaviour
  or ScriptableObject class lives in a file of the same name.
- The camera distance uses `Screen.height` like the kit uses the canvas height: a batchmode frame
  (no window) is framed differently from Play mode.
- A bounds check with a loose tolerance passed a model turned by 180° — the centroid check exists
  because of it; `SelfCheck_CatchesATurnedOrMirroredModel` keeps it honest.
