// One-off asset tool: cuts the card ILLUSTRATIONS out of the scanned atlases in Witcher/ into
// client/art/<ID>.webp (the folder the client already reads instead of placeholders).
//
//  - action cards (starter + common): the whole 579 × 899 cell. The client draws the card frame
//    cut from the same scans (tools/frames.mjs) on top in the same pixel space, so the art lines
//    up with the frame exactly; the printed icons, name and cost under the frame are covered.
//  - monsters: the illustration above the name box of the small monster card.
//  - elixirs: the illustration between the name box and the flavour strip.
//  - equipment and companions (Ивенты 1): the whole card — it is shown as printed, the text
//    of these cards is never hidden. Other event cards are parchment only and are typeset by
//    the client (outcomes must stay covered until picked).
//
// Needs `sharp`, which is NOT a dependency of the game — run once on a developer machine:
//   SHARP=/path/to/node_modules/sharp node witcher/tools/art.mjs [actions|monsters|potions|bombs|gear|trail]
// Output (committed): witcher/client/art/*.webp. A hand-made file with the same ID but another
// extension (jpg/png) wins in the art index only if this one is deleted.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';
import { CARDS } from '../shared/engine/util.mjs';
import { MONSTERS, POTIONS, LEGENDS, LEGATTACKS, LEGMOVES, RUINS } from '../shared/data/gen-data.mjs';
import { EVENTS } from '../shared/data/events-data.mjs';
import { BOMBS } from '../shared/data/bombs-data.mjs';
import { MASTERS, UNIQUES, MUTAGENS } from '../shared/data/trail-data.mjs';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP || 'sharp');
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '../../Witcher');
const OUT = path.join(HERE, '../client/art');
const W = 579, H = 899;
const ATLAS = {
    A: 'Ведьмаки/31CF952873EE4D08B5859BA3EDF6FE2D3BD34A9A_httpcloud3steamusercontentcomugc20339843692024610201309DCB81F4B7AA9B217E29D4656DD593C544458.jpg',
    B: 'Ведьмаки/1058E3132D875A0D4B5202AC5990B30F6AEDD39F_httpcloud3steamusercontentcomugc2033984369202461196236CD89275EB685C16C282EB1B610F952BCBB4B6.jpg',
    S: 'Ведьмаки/Стартовые колоды.jpg',
    MON: 'Монстры/Упрощённые карты монстров.jpg',
    POT: 'Доп колоды/Зелья.jpg',
    BOMB: 'Доп колоды/Бомбы.jpg',
    M: 'Ведьмаки/4E644DF6BCD4C59326ADA604F3FE2B1A029470CD_httpcloud3steamusercontentcomugc2033984369202594531F621553636B9C5DE48E7E4D8956E483531A1F905.jpg',
    U: 'Ведьмаки/Трофеи и стартовые карты.jpg',
    MUT: 'Доп колоды/Мутагены.jpg',
    EV1: 'События/Ивенты 1.jpg',
    EV2: 'События/Ивенты 2.jpg',
    LEG: 'Легендарные монстры/Легендарные монстры.jpg',
    LATK: 'Легендарные монстры/Атаки.jpg',
    LMOVE: 'Легендарные монстры/Движение.jpg',
};
const cellOf = (c) => { const m = /^r(\d+)c(\d+)$/.exec(c); return [+m[1], +m[2]]; };
const atlases = new Map();
async function atlas(k) {
    // Decode each atlas once (they are 10–20k pixels on a side).
    if (!atlases.has(k)) atlases.set(k, await sharp(path.join(SRC, ATLAS[k]), { limitInputPixels: false }).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
    return atlases.get(k);
}
/** Cut a rectangle of cell (r, c) and save it as webp of the given width. */
async function cut(k, cell, box, file, width, cw = W, ch = H) {
    const { data, info } = await atlas(k);
    const [r, c] = cellOf(cell);
    await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 }, limitInputPixels: false })
        .extract({ left: (c - 1) * cw + box.x, top: (r - 1) * ch + box.y, width: box.w, height: box.h })
        .resize({ width }).webp({ quality: 78 }).toFile(path.join(OUT, file));
}

async function actions() {
    let n = 0;
    for (const c of Object.values(CARDS)) {
        if (c.printed) continue;
        const k = c.starter ? 'S' : c.id.startsWith('W-A') ? 'A' : 'B';
        await cut(k, c.cell, { x: 0, y: 0, w: W, h: H }, `${c.id}.webp`, 420);
        n++;
    }
    console.log('карты действий:', n);
}
async function monsters() {
    for (const m of MONSTERS) await cut('MON', m.cell, { x: 0, y: 0, w: W, h: 600 }, `${m.id}.webp`, 420);
    console.log('монстры:', MONSTERS.length);
}
async function bombs() {
    for (const b of BOMBS) await cut('BOMB', b.cell, { x: 60, y: 500, w: W - 120, h: 252 }, `${b.id}.webp`, 420);
    console.log('бомбы:', BOMBS.length);
}
/** «По следу монстра»: master/unique actions and mutagens are shown as printed (whole card). */
async function trail() {
    for (const c of [...MASTERS, ...UNIQUES]) await cut(c.printed, c.cell, { x: 0, y: 0, w: W, h: H }, `${c.id}.webp`, 480);
    for (const m of MUTAGENS) await cut('MUT', m.cell, { x: 0, y: 0, w: W, h: H }, `${m.id}.webp`, 480);
    console.log('мастерские/уникальные действия и мутагены:', MASTERS.length + UNIQUES.length + MUTAGENS.length);
}
async function potions() {
    for (const p of POTIONS) await cut('POT', p.cell, { x: 0, y: 236, w: W, h: 510 }, `${p.id}.webp`, 420);
    console.log('эликсиры:', POTIONS.length);
}
async function gear() {
    // Printed full-art cards: the cell is in the card's `src` («Ивенты 2 · r6c2»).
    const ids = Object.keys(EVENTS).filter(id => EVENTS[id].gear);
    for (const id of ids) {
        const [book, cell] = EVENTS[id].src.split(' · ');
        await cut(book === 'Ивенты 2' ? 'EV2' : 'EV1', cell, { x: 0, y: 0, w: W, h: H }, `${id}.webp`, 579);
    }
    console.log('снаряжение и спутники:', ids.length);
}

fs.mkdirSync(OUT, { recursive: true });
/** Witcher trophies (Ведьмаки/Трофеи.md): the printed card, columns 2–5 of the atlas, 4 per school. */
async function witcherTrophies() {
    for (let r = 1; r <= 7; r++) for (let c = 2; c <= 5; c++) {
        const n = (r - 1) * 4 + (c - 1);
        await cut('U', `r${r}c${c}`, { x: 0, y: 0, w: W, h: H }, `WITCHER-TROPHY-${String(n).padStart(2, '0')}.webp`, 420);
    }
    console.log('трофеи ведьмаков: 28');
}
/** «Легендарная охота»: large cards (929 × 1160 cells), combat and movement cards, ruin tokens — as printed. */
async function legend() {
    for (const l of LEGENDS) await cut('LEG', l.cell, { x: 0, y: 0, w: 929, h: 1160 }, `${l.id}.webp`, 640, 929, 1160);
    for (const a of LEGATTACKS) await cut('LATK', a.cell, { x: 0, y: 0, w: W, h: H }, `${a.id}.webp`, 420);
    for (const m of LEGMOVES) await cut('LMOVE', m.cell, { x: 0, y: 0, w: W, h: H }, `${m.id}.webp`, 420);
    for (const r of RUINS) await sharp(path.join(SRC, 'Легендарные монстры', r.file)).resize({ width: 200 }).webp({ quality: 80 }).toFile(path.join(OUT, `${r.id}.webp`));
    console.log('легендарная охота:', LEGENDS.length + LEGATTACKS.length + LEGMOVES.length + RUINS.length);
}
const only = process.argv[2];
if (only === 'legend') await legend();
if (only === 'wtrophies') await witcherTrophies();
if (!only || only === 'actions') await actions();
if (!only || only === 'monsters') await monsters();
if (!only || only === 'potions') await potions();
if (!only || only === 'bombs') await bombs();
if (!only || only === 'gear') await gear();
if (!only || only === 'trail') await trail();
