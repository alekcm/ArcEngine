---
name: editor
description: The kit's web editor (_utils/editor) — location view with free/game cameras, toon toggle, Global Settings tab (constants inspector from schema.js, saves to Constants.js), Objects tab (location objects in Objects.js — FBX/GLB import into assets/models, properties, gizmo, part spin or animation clip), UI tab (game interface layout in UILayout.js — skill ui), EN/RU interface language (i18n.js), live editing via loader.js, server.mjs API. Read before editing files in _utils/, before adding a constant to the inspector and before adding interface text.
---

# Editor (`_utils/editor`)

```
editor.bat                     # in the kit root: port 8090 (or the next free one), opens the browser
editor.bat 9100 --no-open
```

URL: `http://localhost:8090/_utils/editor/`. Needs only Node. The editor is not part of the
game: it does not go into the build (`BUILD_EXCLUDE`), and the game knows nothing about it.

## Structure

| File | What |
|---|---|
| `server.mjs` | static files from the project ROOT (no-store) + `GET /api/status`, `POST /api/save-constants`, `/api/save-objects`, `/api/save-ui`, `GET /api/tuning` + `POST /api/save-tuning` (door sizes) and `GET /api/board` + `POST /api/save-board` (board parts) for the Nemesis tab, `/api/pick-model`, `/api/import-model`. `EDITOR_API_VERSION` |
| `save.mjs` | writing without HTTP: `patchScalar`, `saveConstants(root, changes)`, `formatObjects`, `saveObjects(root, objects)`, `formatUI`, `saveUI(root, elements)` (skill `ui`), backups, `ERRORS`/`failure`, `isModelPath`; covered by `tests/editor-save.test.mjs` and `tests/ui.test.mjs` |
| `index.html` | header with the language switch `#lang-switch`, view toolbar, canvas `#view-canvas` with the floating chips over it (`#view-info`, `#view-hints`, `#view-speed` — the camera speed slider, bottom right), right pane with tabs `#pane-tabs` (`.pane-panel[data-tab]`: settings, objects, ui); script order: `i18n.js`, `schema.js`, `loader.js`, kit modules (`/libs/babylonjs.loaders.min.js`, `/js/Objects.js`, `/js/UILayout.js`, `/js/World3D.js` … `/js/Model3D.js`, `/js/Gltf3D.js`, `/js/Location3D.js`, `/js/UI.js`; no `Game.js` — the editor does not run the game), `inspector.js`, `objects-panel.js`, `sound-panel.js`, `ui-panel.js`, `lab.js`, `debug-tools.js`, `onboarding.js`, `main.js`. At the end of the body — the tour card `#onboarding` |
| `i18n.js` | `I18N`: language (EN by default, choice in `localStorage` `arcengine.editor.lang`), dictionaries `STRINGS.en/ru`, `t(key, params)`, `pick({ en, ru })`, markup via `data-i18n*`, `lang-changed` event |
| `loader.js` | fetches `/js/Constants.js`, replaces `^const` with `var`, runs it through indirect `eval` — constants become writable `window` properties |
| `schema.js` | `KIT_SCHEMA` — inspector groups and fields, texts `{ en, ru }`; the client's `EDITOR_API_VERSION` |
| `history.js` | `EditHistory`: undo/redo (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y) — entries `{ key, undo, redo }`, the same `key` within 800 ms is merged, `batch(fn)` — one step; in text and number fields Ctrl+Z is the browser's own |
| `inspector.js` | the constants of `Constants.js`: fields from the schema, groups collapsed at startup, dirty highlight, ↺, search in both languages, "Save to Constants.js" (Ctrl+S); `Toast`. A group builds into Global Settings, or into the tab named by its `tab` field (`groupHost`) — one dirty state and one save for all of them (every `[data-role="save-constants"]` button, `Inspector.buttons`) |
| `objects-panel.js` | `ObjectsPanel` — Objects tab: list of `location.objects`, properties of the selected one, move gizmo, click selection, FBX import, "Save to Objects.js", revert; `PaneTabs` — tabs (`TABS`, `current`, choice in `localStorage` `arcengine.editor.tab`, the window `pane-tab` event on a switch) |
| `sound-panel.js` | `SoundPanel` — Sound tab: the AUDIO_* constants (schema groups with `tab: 'sound'`, built by the Inspector into `#sound-groups`) and the list of `assets/sounds` files, a click plays one. It OWNS the file list (`GET /api/sounds` at startup and on window `focus`); the Objects tab reads `SoundPanel.files` — skill `sound` |
| `ui-panel.js` | `UIPanel` — UI tab: the game interface (`UILayout.js`) drawn by the game's `UI.js` over the view, drag and resize, nesting (the list is a tree, the "Inside" row) and stretch, properties, "Save to UILayout.js" — skill `ui` |
| `lab.js` | location view: `Location3D` (objects — a copy of `LOCATION_OBJECTS`) + the game's `CameraController`, camera modes, toon toggle, the camera speed slider over the view, reaction to edits; frame `tick`: `location.update(dt)` -> `camera.update(dt)` -> `renderFrame()` |
| `debug-tools.js` | `DebugTools` — the view toolbar's debug corner: the "view:" select (`Debug3D.setMode`: back faces in red, normals, wireframe) and "Lint scene" (`Debug3D.lint`) with a results panel `#lint-panel` over the view. Binds itself on `DOMContentLoaded` — `lab.js` and `main.js` do not know about it; finding texts come from `Debug3D` and stay English |
| `onboarding.js` | `Onboarding` — the welcome tour over the editor: six slides (`SLIDES`), text in `i18n.js` under `onb.<id>.*` (`title` and `p1…pN` — one key per paragraph; plain prose, no bullet lists). A slide points at the real editor: `target` is a selector, `#onb-spot` frames that element and its 9999px `box-shadow` dims everything else, and `place()` flies the card into the widest free strip beside it (the inspector is on the right — the card steps to its left; the target fills the window — the card sits in its middle). A `tab` field also calls `PaneTabs.show`, and the tab that was open comes back on close. Its own EN/RU switch (`#onb-lang` — the top bar one is dimmed at that moment) and a "don't show again" box: opening sets the `localStorage` flag `arcengine.editor.onboarded`, unticking clears it, so a first run greets and the `#btn-help` "?" button reopens. Keys (captured, so the camera and the panels do not see them): ← → Space Enter, Esc |
| `nemesis/client/editor-panel.js` | `NemesisPanel` — the Nemesis tab, an ES MODULE (`<script type="module">`, the board renderer is a module): its own `Scene3D` over `#nemesis-canvas` (the whole test ship from `nemesis/shared/ship.mjs`), click-to-select + move/rotate/scale gizmo + colour/hide/delete/reset per part, the list of edited parts, Save/revert of `nemesis/client/board-edits.json`; the door-size sliders (schema in `nemesis/client/tuning.js`, labels `{ en, ru }`, `doorSpec()`) live in a collapsed block below. Alt — the neon numbers, F — the whole ship, D — a door |
| `main.js` | `I18N.init()` -> `EditorLoader.load()` -> `EditHistory.init()` -> `PaneTabs.init()` -> `Inspector.init()` -> wrapper around `Inspector.apply` (`constants-changed` event + history entry; `revertAll` — as one step) -> `Lab.init()` (inside — `ObjectsPanel.init(lab)`, `UIPanel.init(canvas)`, `SoundPanel.init()`) -> `Onboarding.init()` (last: the tour greets a first run, and only over an editor that booted) |

Editing a field: `Inspector.apply` writes `window[NAME]` -> `constants-changed` event ->
`Lab.onConstant(name)` by prefix:

| Prefix / name | What happens |
|---|---|
| `WORLD3D_*` | `World3D.applyRenderConstants(view)` — light, shadows, materials, toon, ink edges live |
| `CAMERA_*` | `camera.applyConstants()`; in game mode orientation/start zoom — `home()` right away; `CAMERA_FLY_SPEED` also moves the view's speed slider (`syncSpeedSlider`) |
| `UI_*` | `UIPanel.refresh()` — the interface scale |
| `AUDIO_*` | `Sound3D.applyConstants()` — channel volumes (skill `sound`) |
| `MODEL_*`, `GAME_*` | nothing to apply: read when a clip starts / by the game |
| `LOCATION_GROUND` | `location.loadGround()` |
| `GROUND_TILE_SIZE` | `terrain.applyTileSize()` |
| `TERRAIN_*`, `LOCATION_*` | terrain rebuild at most once per frame, location objects settle on the new ground (`buildTerrain`) |

`WORLD3D_SHADOW_MAP` and `WORLD3D_SHADOW_RADIUS` are read when the view is created — they take effect after F5.

## Nemesis tab

The board of the Nemesis game (a separate game in `nemesis/`, its own server) is edited here, in
the same window: the tab swaps the location view for `#nemesis-canvas` (`body.nemesis-tab` hides the
location toolbar and chips). No separate page, no extra .bat.

**Parts.** `Scene3D` keeps a registry of every mesh it builds: the id is `"<owner>#<n>"`, the owner
is `room:<id>` (floor and walls), `room:<id>:shell`, `room:<id>:obj`, `room:<id>:dyn`, `cor:<id>`
or `hull`, and `n` restarts in every `owner()` step — so an id means the same part on every build.
The id is given in `registerMesh`, called from a wrapper around `scene.addMesh`, NOT from
`onNewMeshAddedObservable`: Babylon 9 fires that one from a `SetImmediate`, i.e. after the build,
when the owner scope is gone (BD-10 in `nemesis/tools/board.test.mjs` guards this).

- Edit mode (`scene.setEditMode(true)`) turns merging off — every wire and bolt stays a separate,
  pickable mesh — and `scene.pickMesh(x, y)` returns the part under the cursor.
- `scene.setEdit(id, { pos, rot, scale, color, glow, hidden, deleted })` records an edit;
  `scene.setEdits(map)` loads a whole set. `mergeStatic()` applies edits BEFORE merging, drops the
  deleted ones (they are switched off, so they vanish from the board but Reset can bring them back).
- "Save" writes `nemesis/client/board-edits.json` (`POST /api/save-board`, `saveBoard` in
  `save.mjs`, backup `_utils/.backups/board-*.json`); `sanitizeEdit()` keeps only known fields,
  rounds coordinates to 0.001 and clamps them to ±1000, accepts `#rrggbb` and ids of
  `[A-Za-z0-9_:.#-]{1,80}`. The game reads the file at boot (`app.js` → `scene.setEdits()` before the
  first `update()`), both in the lobby gallery and in a real session.
- Clicking must be visible and forgiving: `pickMesh` converts CSS pixels to the canvas buffer
  (`HiDPI`), tries the exact ray and then three rings of 8 rays (4/10/18 px) because a cable is
  thinner than a pixel, the selected part gets `renderOutline`, and the status line always says what
  happened. "Find a part" lists every part by owner (`room:013`, `cor:001-002`, `hull`) and name, so
  anything is reachable without aiming.
- The gizmo lives in `gm.gizmos.positionGizmo` / `.rotationGizmo` / `.scaleGizmo`: **`GizmoManager`
  has no `positionGizmo` of its own in Babylon 9.26** (asking for it throws, and a throw inside
  `ensureScene` used to dispose the whole board). `setupGizmo()` runs in its own try/catch — a broken
  gizmo leaves the board and the numeric fields working. Do not set
  `updateGizmoRotationToMatchAttachedMesh` on the scaling gizmo: Babylon logs that it is unsupported.
- Keys: click — select, `1/2/3` — move/rotate/scale gizmo, `Del` — delete/restore the selected part,
  `Esc` — deselect, `F` — whole ship, `D` — a door, `Alt` — neon numbers.

**Door sizes.** The numbers live in `nemesis/client/tuning.js` — `SCHEMA` (groups, labels EN/RU,
ranges) and `doorSpec()`, which derives the actual door from them. Those sliders are in the
"Door sizes" block of the same tab. The renderer only reads `doorSpec()`, so a slider cannot
produce an impossible door (tested: `nemesis/tools/tuning.test.mjs`).

- "Save" (door block) writes ONLY what differs from the table (`TUNE.diff()`) with
  `POST /api/save-tuning` (`saveTuning` in `save.mjs`): every key is filtered by the same schema
  server-side (`sanitizeAll`), the previous file goes to `_utils/.backups/tuning-*.json`.
  "Defaults" saves an empty diff — the game falls back to the table in `tuning.js`.
- `nemesis/client/tuning.json` is local and git-ignored; the game reads it with one `fetch` before
  the scene is built, so saved values apply to a real session.
- A new slider = an item in `tuning.js` `SCHEMA` (with `label: { en, ru }`), a field used by
  `doorSpec()` if it is geometry — the panel builds itself, no editor code changes.

## Saving

`POST /api/save-constants` with `{ changes: [{ name, value }] }`. The server patches ONLY
lines `const NAME = <number>;` (it refuses to touch a formula), a hex literal stays hex,
before writing — a backup in `_utils/.backups/` (last 20). Name — `[A-Za-z_][A-Za-z0-9_]*`.
Rejection — `{ name, ok: false, code, error }`: the client translates `code` (`not_found`,
`not_literal`, `bad_value`, `bad_name`) with the key `err.<code>`, `error` is English text for the log.

`POST /api/save-objects` with `{ objects: [...] }` — `Objects.js` is written WHOLE (header
`OBJECTS_HEADER` + one line per object), backup `Objects-*.js` in the same place. Record:
`{ name, model, kind, x, y, h, rot: [x, y, z], scale: [x, y, z], anim?, clip? }` (old scalar `rot`/`scale`
are expanded into triples; `anim: { part, axis, speed, dir }` and `clip: '…'` are written at the end of the line, if present).
Checks: `model` — `assets/….fbx` or `….glb` in Latin characters without spaces and `..` (`bad_model`),
`sound.src` — the same rules for `.wav`/`.mp3`/`.ogg` in `assets/` (`isSoundPath`), sound volume 0..1,
`falloffMin` and `falloffMax` ≥ 0 (0 — the common AUDIO_FALLOFF_* value, not written),
numbers finite, scale > 0, `anim.axis` from `x -x y -y z -z`, `anim.speed` ≥ 0 (`bad_value`);
object name, `anim.part`, `clip` and `tag` without quotes and control characters (`cleanName`); precision:
position, angles and speed 0.1, scale 0.001, sound volume 0.01. An old server process silently drops new fields and rejects `.glb` with the old "must be ….fbx" text — restart `editor.bat` (the client warns when `api` < `EDITOR_API_VERSION`, now 20).

## Objects tab

- Records — `location.objects` (`{ def, mesh, error, loaded }`, `Location3D.addObject`):
  the panel edits `def` fields and calls `location.placeObject(rec)`. Changing `kind` rebuilds
  the object (material group, ink edges and outline are assigned on add).
- "Tag" and "Hidden at start" rows write the optional `def.tag` and `def.hidden` (`setOptional`:
  an empty value deletes the field). A hidden object stays in the editor's frame as a ghost
  (`Location3D.applyHidden`, `opts.showHidden: true` in `lab.js`) and its row in the list dims —
  otherwise there would be nothing to select and drag. Game code shows it: `location.setHidden(rec, false)`.
- "Sound" section (`renderSound`): the file (`SoundPanel.files` — `GET /api/sounds`, fetched
  ahead by SoundPanel, so rendering never awaits and rows never land in a stale panel),
  volume, Falloff Min and Falloff Max (the two radii the spheres draw), looped/once. The sound
  is heard in the editor right away (`Location3D.updateSound` in the frame loop) — the toolbar's
  "sound" checkbox mutes it (`Sound3D.setMuted`). Default values are not kept in the record.
  Skill `sound`.
- **Sound spheres.** The selected object's sound draws two faint yellow spheres — `falloffMin`
  (full volume) and `falloffMax` (silence beyond). Each is drawn as LINES like a gizmo: three
  great circles (`sphereLines`), so it reads as a volume and hides nothing. A line mesh keeps its
  1 px width at any scale, so ONE unit wireframe scaled to the radius is enough — no geometry is
  rebuilt. They live in the gizmo's utility layer (the toon plugin does not quantize them and
  they draw over the world) and are `isPickable = false`: a sphere covers most of the screen and
  a pickable one would swallow every camera drag through it, so the radii are typed in the panel.
  They are shown only on the Objects tab and only while the view toolbar's "sound" checkbox is
  on: with sound off there is nothing to visualize. That checkbox starts UNCHECKED — the editor
  is a tool, and an object droning on while you work in it is a nuisance.
  `syncSpheres()` runs from `Lab.tick` (the object may be moved by the gizmo or the terrain
  rebuilt under it) and centres them on the MODEL'S OWN position — the same world point Sound3D
  measures from, so what is drawn is what is heard. The radii drawn are the EFFECTIVE ones: the
  record's value, or the `AUDIO_FALLOFF_*` constant when it is 0 (`soundRadii`).
- "Animation" section of a `.glb` model (`Model3D.clips(rec.mesh)` exists): one row "Clip" — a
  `<select>` of `clips.names()`, "— none —" deletes `def.clip` (`setClip`); `Location3D.playClip`
  picks the change up on the next frame.
- "Animation" section of an FBX model (`renderAnim`, `setAnim`): part — a `<select>` of `metadata.part` of the
  model's meshes (model not loaded yet — only the saved part is listed), "— none —" deletes
  `def.anim`. Picking a part sets the axis via `guessAxis`: the thinnest side of the part along
  its axes, the end pointing away from the model center (for the mill's blades — `-y`, front
  view); default speed 10 rpm. `placeObject` is not needed — `Location3D.update` reads
  `def.anim` every frame (`lab.js` calls it in `tick`, the spin is visible in the editor).
  Edits are merged by `field:<index>:anim`.
- "Dirty" layout — `JSON` of the records ≠ `ObjectsPanel.saved`; "Revert" rebuilds all objects from `saved`.
- "Import model…" -> `POST /api/pick-model` `{ title }`: the server opens a system dialog in
  `assets/models/` (Windows: PowerShell `-STA` + WinForms `OpenFileDialog`, path and title
  via env, TopMost owner window). A file inside `assets/` is used in place, one from outside is
  copied into `assets/models/` (Latin name; the same file is not duplicated, a different one
  gets the suffix `-2`). Validation — `.fbx` with a binary FBX header or `.glb` with the `glTF` magic (`not_model`,
  `not_binary`, `not_glb`); a text `.gltf` with external files is not imported. Cancel — `code: 'cancelled'`. Not Windows — `code: 'unsupported'`, the client
  picks a file with `<input type=file>` and sends the bytes to `POST /api/import-model?name=<file>`.
  A new object appears at the frame center on the ground (`camera.groundFocus()`).
- Gizmo — `BABYLON.GizmoManager` (utility layer), modes on the toolbar `#gizmo-modes` and
  keys 1/2/3: move (axes + ground-plane square), rotate (X/Y/Z rings, world axes), scale
  (per axis, center — uniform). Gizmo materials are unlit (`emissiveColor`): lit ones get
  quantized by the toon plugin. The gizmo needs the SCENE's pointer events:
  `ObjectsPanel.init` calls `scene.attachControl()` (View3D turns them off). The camera
  ignores a press on the gizmo — `camera.ignorePointer = (e) => gizmoHit(e)`: `isHovered` plus
  a direct pick of the utility layer (hover does not update without mouse movement). Moving
  along X/Z keeps `h` (the object follows the terrain), along Y — changes `h`. Gizmo rotation
  writes the mesh `rotation` (or `rotationQuaternion` if set) — angles are taken into `rot`,
  `placeObject` resets the quaternion after release.
- History: a step is layout snapshots before/after (`snapshot`/`restore`); the same set of
  models and kinds is edited in place, otherwise objects are rebuilt. Gizmo — one step per
  drag, field — merged by `field:<index>:<field>`.
- A click on a row of the list selects it; a click on the row that is ALREADY selected clears
  the selection, so the property list below folds away (`select(null)`). A double click frames
  the object — its two clicks toggle the selection off first, so the handler selects it again.
- LMB click without movement (≤ 4 px) on an object mesh — select (`scene.pick` filtered by the
  root's `metadata.locationObject`) and switch to the Objects tab; on empty space — deselect.
- Keys (focus not in a field): Del/Backspace — delete, F — frame it, Ctrl+D — duplicate,
  Esc — deselect, Ctrl+S — save (both Constants.js and Objects.js, whichever changed).

## View controls that edit constants

The toolbar's "toon shader" checkbox and the `#view-speed` slider at the bottom right of the
view are quick duplicates of inspector fields (`WORLD3D_TOON`, `CAMERA_FLY_SPEED`): they call
`Inspector.apply(Inspector.fieldByName.NAME, value)`, so the edit is live, joins the same dirty
state, undo and "Save to Constants.js", and comes back to the control through
`constants-changed` (`Lab.syncToonToggle`, `Lab.syncSpeedSlider`). A control over the view needs
`pointer-events: auto` — `.float-chip` is a label by default. The slider takes its range and
step from the schema field, so the bounds live in one place.

## Interface language

- Static markup text — English by default, with attributes `data-i18n` (text),
  `data-i18n-title`, `data-i18n-placeholder`; keys — in `I18N.STRINGS`.
- Text from code — `I18N.t('key', { name: value })`, substitution `{name}`.
- New string = a key in BOTH dictionaries `en` and `ru`; no translation — English is shown.
- Language switch: `applyDom()`, then the `lang-changed` event — the inspector rebuilds
  (expanded groups and search are kept), `lab.js` redraws the hint and the chip.
- Code, comments, the server log and `Constants.js` are not localized — English only.

## New constant in the inspector

1. Literal in `Constants.js` (color — `0xRRGGBB`, mode — an integer).
2. Read in code via `typeof NAME !== 'undefined' ? NAME : default`.
3. Field in `KIT_SCHEMA` (its own tab — `tab: '<name>'` on the group, and a panel with
   `#<name>-groups` in `index.html`): slider `{ name, label: { en, ru }, min, max, step, hint: { en, ru } }`,
   `kind: 'color'` or `kind: 'select'` with `options: [{ value, label: { en, ru } }]`.
   A mode — select only; levels 0/1/2 and no/yes — the ready-made `SCHEMA_LEVELS`, `SCHEMA_NO_YES`.
4. New prefix — add a branch in `Lab.onConstant`.

## Pitfalls

- Edited `server.mjs` or `save.mjs` — restart `editor.bat`: Node reads them once. When
  endpoints change, bump `EDITOR_API_VERSION` in `server.mjs` AND `schema.js` — the client
  warns about an old server.
- Asset paths in the editor are from the root (`assetBase: '/'`): the page lives in
  `/_utils/editor/`, a relative `assets/…` would resolve there.
- Camera keys do not work while focus is in an inspector field — `lab.js` drops focus on a
  press on the view.
- The Babylon frame is rendered every tick (`preserveDrawingBuffer: false`): a "render on
  flag" gate shows garbage from the buffer.
- Without `scene.attachControl()` the gizmo is drawn but cannot be dragged; without
  `camera.ignorePointer` LMB on an arrow also orbits the free camera.
- A comment with a quoted `'assets/…'` is a false reference for the builder's asset scanner
  (it reads comments too): the build fails on a "missing asset". The `Objects.js` header
  writes the path without quotes.
- `Objects.js` on the editor page is a lexical `const`: the panel works with a copy, after
  saving the global is stale, the baseline is `ObjectsPanel.saved`.

## Checklist

0. Interface of the GAME (not of the editor) — skill `ui`.
1. `node tools/check.mjs` passes (editor types — `_utils/editor/tsconfig.json`, skill `build`).
   Editor console without errors, the server dot is green.
2. A new constant shows in the inspector in both languages (EN/RU), the edit applies to the
   scene, "Save to Constants.js" writes exactly one line of `Constants.js`.
3. New interface text switches with the language.
4. Objects: selection by click and in the list, the gizmo drags, "Save to Objects.js" writes a
   file that passes `node --check`, and the scanner (`collectRefs`) sees no missing assets.
5. The game (`run.bat`) starts with the saved values and objects.
6. A new tab, a renamed button or a changed shortcut — the tour slides (`onboarding.js`,
   `onb.*` in both dictionaries) still describe the editor as it is.
