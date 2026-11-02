---
name: build
description: Dev server, build and code checks — dev server (tools/dev-server.mjs), archive builder (tools/build.mjs, asset-scan.mjs, zip.mjs), tsc type check and the Forbidden Stars rules audit (tools/check.mjs, tools/fs-audit.mjs, tsconfig.json, globals.d.ts), assets. Read before editing tools/, before adding a script or an asset, on a tsc error or a failed rules check, and before building the archive.
---

# Dev server, build, code checks

```
node tools/check.mjs         # game and editor types + the rules audit (check.bat — the same with a pause)
node tools/check.mjs --types
node tools/check.mjs --rules
run.bat                      # dev server + browser, port 8080 (or the next free one)
run.bat 9000 --no-open
build.bat                    # dist/arcengine-<GAME_VERSION>.zip
build.bat --version=0.2.0    # stamp the version into the build
build.bat --no-zip           # only the build/ folder
build.bat --keep-unused      # keep assets without references
build.bat --force            # build despite failed checks
node tools/make-character.mjs          # regenerate assets/models/character.glb (the sample character)
node tools/make-character.mjs --check  # exit 1 if the file differs from the generator
node tools/make-sounds.mjs             # regenerate assets/sounds/*.wav (the sample sounds, skill sound)
node tools/make-sounds.mjs --check     # exit 1 if a file differs from the generator
```

Git: what stays out of the repository — `.gitignore`; `.gitattributes` (`* -text`) — files go
byte for byte, no line-ending conversion.

## Dev server (`tools/dev-server.mjs`)

- `Cache-Control: no-store` on everything: there is no build step, otherwise the browser
  keeps running the old `.js` (`no-cache` will not do — it allows 304).
- On start — an asset check with the same scanner the builder uses; Range requests; MIME.

## Builder (`tools/build.mjs`)

`[1/4] checks -> [2/4] build/ -> [3/4] dist/*.zip -> [4/4] report`. Any failure stops the
build (`--force` — bypass).

| Check | Why |
|---|---|
| asset references resolve | 404 at runtime |
| `node --check` on every script | nothing else catches a syntax error |
| `index.html` exists, `js/Constants.js` is the first local script | entry point in the root; constant globals are read at load |
| no external scripts or URLs | zero dependencies: everything is in the archive |
| file names — ASCII without spaces | unpacking and URLs on the hosting |
| path case matches the disk (via `readdir`) | developed on Windows, served from Linux |
| no absolute paths `src="/…"` | the game may be served from a nested path |

Only the whitelist `CODE_FILES` (`tools/asset-scan.mjs`) goes into `build/`, plus the assets
that have LITERAL `'assets/…'` references in code. A path built from pieces
(`'assets/' + name`) is invisible to the scanner — add such files to `EXTRA_REFS`.
`?v=<version>` is appended to `<script src>` at build time; runtime cache busting of scripts
is impossible. `zip.mjs` writes a fixed mtime — the same tree gives the same bytes.

## Type check (`tsc`)

TypeScript 7 (`npx --yes -p typescript@7.0.2 tsc`, version — in `tools/check.mjs`) checks JS
via JSDoc and compiles nothing. Two programs — the game and the editor have different sets of globals:

| Config | Files |
|---|---|
| `tsconfig.json` | `js/*.js`, `globals.d.ts`, `libs/*.d.ts` |
| `_utils/editor/tsconfig.json` | `_utils/editor/*.js` + kit modules without `main.js` (the editor has its own) |

Mode: `strict` without `noImplicitAny`, `strictNullChecks`, `useUnknownInCatchVariables` — it
catches typos in fields and methods and Babylon calls that do not match the API, without
demanding JSDoc on every parameter. `libs/babylon.d.ts` — types for exactly Babylon 9.26:
upgrading `babylon.js` = a new file (`cdn.jsdelivr.net/npm/babylonjs@<version>/babylon.d.ts`).
`.mjs` (tools, editor server) is not checked by tsc: the tools are one-shot scripts.

Pitfalls:
- An object literal in JS is "open": `const X = { … }` accepts any `X.typo`. Above every
  namespace — `/** @satisfies {Record<string, any>} */`. It also forbids adding fields from
  outside (`X.newField = …` is an error): declare the field in the literal
  (`World3D.toon: null` + `World3D.toon = ArcToon`). Inside methods `this` stays loose.
- A literal field set to `null` without JSDoc is `any`: nothing that goes through it is
  checked. Needs `/** @type {Location3D | null} */`.
- `querySelector`/`getElementById` return `Element`/`HTMLElement`: `.value`, `.checked`,
  `.disabled`, `.dataset` — through a cast `/** @type {HTMLInputElement} */ (el)`.
- A global named like a built-in browser class (`History`, `Image`, `Location`…) — error
  "Cannot redeclare": hence `EditHistory`.
- `window.NAME` of a constant in the editor — `/** @type {any} */ (window).NAME`: the `Window`
  type has no constants.

## Rules audit (`tools/fs-audit.mjs`)

There are no unit tests of the game: they passed while the rules were wrong, so they were
deleted. The witness of the rules is `tools/fs-audit.mjs`: every check quotes a line of
`docs/forbidden-stars/01-rules-reference.md`, builds the state of exactly that case in a
`node:vm` with `FSData.js`, `FSEffects.js` and `FSRules.js` (the `index.html` order), and looks
at what the engine does. A failed check prints what was expected and what came out.

```
node tools/fs-audit.mjs            all checks
node tools/fs-audit.mjs combat     only the checks whose id or text contains the word
```

The audit is grouped by the sections of the Rules Reference: planning, advance, deploy,
strategize and dominate, combat, retreats, capacity/refresh/victory, orbital strike,
structures and command level, movement corners, and the card texts (every printed combat,
event and order card must parse into steps the engine has a handler for, and every card must
run on a prepared board without an error). A new rule in the engine means a new check with the
sentence it comes from — quoting the rule is what makes the check readable later.

Adding a check: `rule('id', '«quoted sentence»', () => { … })` with `eq(actual, expected, what)`;
helpers `empty()`, `game(seed)`, `guard`/`olk`, `worldOf`/`voidOf`, `advance`, `battleFor`,
`playCombat`. Keep the id short and the section name in `head('…')`.
