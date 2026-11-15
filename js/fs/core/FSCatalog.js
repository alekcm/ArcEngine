// FSCatalog.js — the printed side of Forbidden Stars in one place.
//
// Everything that comes straight from the components (FSData.js) or from a
// printed rule that belongs to a faction is looked up HERE and nowhere else.
// The rules engine, the board view and the interface all ask the same object,
// so a faction colour, a unit profile or the asset limit of the Tyranids can
// not differ between the map, the panel and the combat table.
//
// The catalogue keeps no game state: it is read-only after construction.

// The faces of a combat die: the rules speak of them by kind, the panel and the
// log by their names. One place holds both spellings.
const FACE_KINDS = ['att', 'def', 'morale', 'blank'];
const FACE_NAMES = { att: 'атака', def: 'оборона', morale: 'мораль', blank: 'пусто' };

/** The printed name of a die face; an unknown face is named as it is written. */
function fsFaceName(face) {
    return FACE_NAMES[face] || String(face || '');
}

/** The structure profiles printed on the tokens (07-tokens.md). */
const FS_STRUCTURE_STATS = {
    bastion: { cost: 2, combat: 2, health: 3, morale: 2, kl: 0, name: 'Бастион' },
    city: { cost: 3, combat: 0, health: 0, morale: 0, kl: 0, name: 'Город' },
    factory: { cost: 2, combat: 0, health: 0, morale: 0, kl: 0, name: 'Фабрика' },
};

/**
 * The faction traits that are NOT printed in FSData.js: they are rules of the
 * sheet or of the rulebook. One record per faction keeps each exception in a
 * single place.
 *
 * assetLimit — 07-tokens.md: «у игрока не может быть больше 3 жетонов каждого
 *   типа (у Тиранидов — до 4)».
 */
// assetLimit — «у игрока не может быть больше 3 жетонов каждого типа
// (у Тиранидов — до 4)»: предел поднимается на 1 для ЛЮБОГО типа жетона, а не
// только для подкреплений. Раньше здесь стояло `{ reinforcement: 4 }`, и
// четвёртый жетон кузницы у Тиранидов молча терялся.
const FS_FACTION_TRAITS = {
    'тираниды': { assetLimit: { any: 4 } },
};

class FactionCatalog {
    /** @param {any} data FSData.js: { factions, tiles, combat, orders, events } */
    constructor(data) {
        this.data = data || {};
    }

    // --- factions -------------------------------------------------------------

    get factions() {
        return this.data.factions || [];
    }

    /** @param {string} id */
    faction(id) {
        return this.factions.find(f => f.id === id) || null;
    }

    /** @param {any} player a player record of the state */
    factionOfPlayer(player) {
        return player ? this.faction(player.faction) : null;
    }

    /** @param {any} unit a unit record of the state */
    factionOfUnit(unit) {
        return unit ? this.faction(unit.faction) : null;
    }

    /** @param {string} id */
    factionName(id) {
        const f = this.faction(id);
        return f ? f.name : id;
    }

    /** @param {string} id */
    factionColor(id) {
        const f = this.faction(id);
        return f ? f.color : '#8899aa';
    }

    /** @param {string} id */
    ability(id) {
        const f = this.faction(id);
        return (f && f.ability) || null;
    }

    /** A trait of the faction sheet that the data does not carry. */
    trait(factionId, name, fallback) {
        const t = FS_FACTION_TRAITS[factionId];
        const value = t ? t[name] : undefined;
        if (value === undefined || value === null) return fallback;
        if (typeof value === 'object' && !Array.isArray(value)) {
            const out = Object.assign({}, fallback || {});
            for (const k of Object.keys(value)) out[k] = value[k];
            return out;
        }
        return value;
    }

    // --- units and structures -------------------------------------------------

    /** @param {string} factionId */
    units(factionId) {
        const f = this.faction(factionId);
        return (f && f.units) || [];
    }

    /** @param {string} factionId @param {string} unitId */
    unit(factionId, unitId) {
        return this.units(factionId).find(u => u.id === unitId) || null;
    }

    /** The printed profile of a unit record that stands on the board. */
    unitOfUnit(unit) {
        const f = this.factionOfUnit(unit);
        if (!f) return null;
        return f.units.find(u => u.id === unit.unit) || null;
    }

    /** @param {string} type 'bastion' | 'city' | 'factory' */
    structure(type) {
        return FS_STRUCTURE_STATS[type] || FS_STRUCTURE_STATS.factory;
    }

    /** @param {string} type */
    structureName(type) {
        return this.structure(type).name || type;
    }

    // --- tiles ----------------------------------------------------------------

    get tiles() {
        return this.data.tiles || [];
    }

    /** @param {string} id */
    tile(id) {
        return this.tiles.find(t => t.id === id) || null;
    }

    /** The two printed faces of one physical tile (1A / 1B). */
    tileFaces(id) {
        const physical = String(id).replace(/[AB]$/, '');
        return this.tiles.filter(t => t.id.replace(/[AB]$/, '') === physical);
    }

    // --- cards ----------------------------------------------------------------

    /** @param {string} kind 'combat' | 'events' | 'orders' */
    cards(kind) {
        return this.data[kind] || [];
    }

    /** @param {string} factionId @param {string} name */
    card(kind, factionId, name) {
        return this.cards(kind).find(c => c.faction === factionId && c.name === name) || null;
    }

    /**
     * A card by its printed name, without a faction: the event decks are shared,
     * so an event is looked up by the name alone. The first card of the kind with
     * that name wins — the data has one of each.
     */
    cardNamed(kind, name) {
        return this.cards(kind).find(c => c.name === name) || null;
    }

    /** @param {string} factionId */
    baseCombatCards(factionId) {
        return this.cards('combat').filter(c => c.faction === factionId && !c.upgrade);
    }

    /** @param {string} factionId */
    upgradeCombatCards(factionId) {
        return this.cards('combat').filter(c => c.faction === factionId && !!c.upgrade);
    }

    /** @param {string} factionId */
    eventCards(factionId) {
        return this.cards('events').filter(c => c.faction === factionId);
    }

    /** @param {string} factionId */
    orderCards(factionId) {
        return this.cards('orders').filter(c => c.faction === factionId);
    }

    // --- assets ---------------------------------------------------------------

    /** The printed ceiling of one asset kind for a player of the faction. */
    assetLimit(factionId, kind) {
        const limits = this.trait(factionId, 'assetLimit', {});
        // `any` — предел, поднятый для всех типов сразу (особенность фракции);
        // иначе действует предел именно этого жетона, затем общий.
        return Math.max(limits[kind] || 0, limits.any || 0) || 3;
    }

    /**
     * The limit for a player RECORD (state.players[seat]): the printed limit of
     * the faction, or the higher one a card has raised for the whole game. Every
     * place that asks «is there room for one more token» uses this.
     */
    assetLimitFor(player, kind) {
        const data = player || {};
        return Math.max(this.assetLimit(data.faction, kind), data.assetLimit || 0);
    }

    // --- colours --------------------------------------------------------------

    /** The faction colour darkened (amt < 0) or lightened (amt > 0). */
    shade(hex, amt) {
        const n = parseInt(String(hex || '').replace('#', ''), 16);
        if (!Number.isFinite(n)) return '#888888';
        const f = v => Math.max(0, Math.min(255, Math.round(v + amt * 2.55)));
        return '#' + (((f((n >> 16) & 255)) << 16) | ((f((n >> 8) & 255)) << 8) | f(n & 255)).toString(16).padStart(6, '0');
    }

    /** The army paint: a primary and two secondary colours, chosen in the lobby. */
    palette(pal, fallback) {
        const hex = c => /^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? String(c).toLowerCase() : null;
        const base = hex(fallback) || '#888888';
        pal = pal || {};
        return {
            primary: hex(pal.primary) || base,
            secondary1: hex(pal.secondary1) || this.shade(base, 48),
            secondary2: hex(pal.secondary2) || this.shade(base, -38),
        };
    }

    /** @param {string} factionId */
    defaultPalette(factionId) {
        return this.palette(null, this.factionColor(factionId));
    }

    /** Turn a colour around the hue circle; optional saturation/lightness make neutral factions distinguishable. */
    hueShift(hex, deg, saturation, lightness) {
        const n = parseInt(String(hex || '').replace('#', ''), 16);
        if (!Number.isFinite(n)) return '#888888';
        const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), l0 = (max + min) / 2;
        let h = 0, sat = 0, l = l0;
        if (max !== min) {
            const d = max - min;
            sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h /= 6;
        }
        // A grey has no hue to turn: give it one, so another seat can have a
        // real colour. Explicit values let the palette search add contrast too.
        if (sat < 0.12) sat = 0.45;
        if (saturation !== undefined && saturation !== null) sat = Math.max(0, Math.min(1, Number(saturation)));
        if (lightness !== undefined && lightness !== null) l = Math.max(0, Math.min(1, Number(lightness)));
        h = (((h + deg / 360) % 1) + 1) % 1;
        const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat, p = 2 * l - q;
        const ch = t => {
            t = ((t % 1) + 1) % 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const to = v => Math.max(0, Math.min(255, Math.round(v * 255)));
        return '#' + ((to(ch(h + 1 / 3)) << 16) | (to(ch(h)) << 8) | to(ch(h - 1 / 3))).toString(16).padStart(6, '0');
    }

    /** CIE Lab 1976 distance: unlike raw RGB it reflects visible colour separation. */
    colorDistance(a, b) {
        const lab = hex => {
            const n = parseInt(String(hex || '').replace('#', ''), 16);
            if (!Number.isFinite(n)) return null;
            const linear = value => {
                const v = value / 255;
                return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            };
            const r = linear((n >> 16) & 255), g = linear((n >> 8) & 255), blue = linear(n & 255);
            const x = (r * 0.4124564 + g * 0.3575761 + blue * 0.1804375) / 0.95047;
            const y = r * 0.2126729 + g * 0.7151522 + blue * 0.072175;
            const z = (r * 0.0193339 + g * 0.119192 + blue * 0.9503041) / 1.08883;
            const f = value => value > 216 / 24389
                ? Math.cbrt(value) : (24389 / 27 * value + 16) / 116;
            const fx = f(x), fy = f(y), fz = f(z);
            return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
        };
        const left = lab(a), right = lab(b);
        if (!left || !right) return 0;
        return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
    }

    /**
     * The primary paint of every seat of a table — `Map seat → '#rrggbb'`.
     * A player who chose his own colours keeps them; the first player of a
     * faction gets the faction colour; every next player of the SAME faction
     * gets the candidate with the greatest minimum CIE Lab separation from the
     * colours already used. The search varies hue, saturation and lightness, so
     * pale/grey faction colours do not yield near-identical pastel twins. The
     * lobby and newGame call the same function, so the player sees the paint
     * they will use. `players` — anything with `seat`, `faction` and `palette`.
     */
    autoPrimaries(players) {
        const hex = c => /^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? String(c).toLowerCase() : null;
        const list = (players || []).filter(p => p && p.faction).slice().sort((a, b) => Number(a.seat) - Number(b.seat));
        const out = new Map();
        for (const p of list) {
            const chosen = p.palette && hex(p.palette.primary);
            if (chosen) { out.set(p.seat, chosen); continue; }
            const base = this.factionColor(p.faction);
            const twin = list.some(q => q.faction === p.faction && Number(q.seat) < Number(p.seat));
            if (!twin) { out.set(p.seat, base); continue; }
            const taken = [...out.values()];
            const candidates = [];
            for (const lightness of [0.38, 0.5, 0.62]) {
                for (const saturation of [0.35, 0.5, 0.65]) {
                    for (let deg = 0; deg < 360; deg += 30) {
                        const candidate = this.hueShift(base, deg, saturation, lightness);
                        if (!candidates.includes(candidate)) candidates.push(candidate);
                    }
                }
            }
            let best = base, bestDistance = -1;
            for (const candidate of candidates) {
                if (taken.includes(candidate)) continue;
                const distance = taken.length ? Math.min(...taken.map(t => this.colorDistance(candidate, t))) : 0;
                if (distance > bestDistance) { bestDistance = distance; best = candidate; }
            }
            out.set(p.seat, best);
        }
        return out;
    }

    /** The paint of one seat of the table (see autoPrimaries) as a full palette. */
    autoPalette(players, seat, factionId) {
        const primaries = this.autoPrimaries(players);
        return this.palette(null, primaries.get(seat) || this.factionColor(factionId));
    }

    // --- names of the cards ---------------------------------------------------

    /** The first letters of a word: «бойзов», «бойзы» and «Бойзы» are one unit. */
    stem(word) {
        const w = String(word || '').toLowerCase();
        return w.slice(0, Math.min(4, w.length));
    }

    /**
     * The spellings of one model that differ between the faction sheet and the
     * cards by more than a Russian ending: «Сестры ренетентии» (02) against
     * «Сестра Репентия» / «Сестру Ренентию» (04, 06), «Вилькирии» (02) against
     * «Валькирия» (04). The sheet keeps its printing; the comparison reads both
     * sides through the same key.
     * @type {[RegExp, string][]}
     */
    static get NAME_ALIASES() {
        return [[/ренетент/g, 'репент'], [/ренент/g, 'репент'], [/вилькири/g, 'валькири']];
    }

    /** Are two printed names the same unit/thing? Russian endings differ on the cards. */
    sameName(a, b) {
        // Quotes and punctuation differ between the card and the sheet:
        // «Ктан» / «К'тана», «(Гвардейцы)» / «гвардейцы»; so does the «ё»:
        // «Лёгкие крейсеры Непокорный» (02) and «Легкий Крейсер» (04).
        const clean = t => {
            let s = String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/['\u2019]/g, '')
                .replace(/[^а-яa-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
            for (const [re, to] of FactionCatalog.NAME_ALIASES) s = s.replace(re, to);
            return s;
        };
        const x = clean(a);
        const y = clean(b);
        if (!x || !y) return false;
        if (x === y) return true;
        const words = s => s.split(/\s+/).filter(Boolean);
        const wx = words(x);
        const wy = words(y);
        // The LAST word decides when both names are phrases: «Сестры
        // ренетентии» и «Сестры битвы» начинаются с одного слова, но это
        // разные отряды («Виды Комморры»).
        const last = wx[wx.length - 1];
        const last2 = wy[wy.length - 1];
        if (last && last2 && this.stem(last) === this.stem(last2)) return true;
        // Two phrases are compared word by word: «Легкий Крейсер» (04) is
        // «Лёгкие крейсеры Непокорный» (02) and «Гранд-Крейсер» is «Гранд-
        // крейсеры Месть», but «Сестры ренетентии» is not «Сестры битвы» and
        // «Инквизиторские штурмовики» are not «Инквизиторские крейсеры» — the
        // names glued together would share their first four letters.
        if (wx.length > 1 && wy.length > 1) {
            const m = Math.min(wx.length, wy.length);
            for (let i = 0; i < m; i++) {
                const n = Math.min(3, wx[i].length, wy[i].length);
                if (wx[i].slice(0, n) !== wy[i].slice(0, n)) return false;
            }
            return true;
        }
        // The whole name without the spaces: «Гвардейцы» and «Гвардеец».
        const sx = x.replace(/\s+/g, '');
        const sy = y.replace(/\s+/g, '');
        const n = Math.min(4, sx.length, sy.length);
        if (sx.slice(0, n) === sy.slice(0, n)) return true;
        // The short names: «Ктан» and «К'тана» are the same unit.
        const n3 = Math.min(3, sx.length, sy.length);
        return sx.slice(0, n3) === sy.slice(0, n3);
    }
}

/** The one catalogue the whole game reads. */
const FS_CATALOG = new FactionCatalog(typeof FS_DATA !== 'undefined' ? FS_DATA : null);
