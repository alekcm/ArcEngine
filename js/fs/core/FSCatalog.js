// FSCatalog.js — the printed side of Forbidden Stars in one place.
//
// Everything that comes straight from the components (FSData.js) or from a
// printed rule that belongs to a faction is looked up HERE and nowhere else.
// The rules engine, the board view and the interface all ask the same object,
// so a faction colour, a unit profile or the asset limit of the Tyranids can
// not differ between the map, the panel and the combat table.
//
// The catalogue keeps no game state: it is read-only after construction.

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
const FS_FACTION_TRAITS = {
    'тираниды': { assetLimit: { reinforcement: 4 } },
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
        return limits[kind] || 3;
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

    // --- names of the cards ---------------------------------------------------

    /** The first letters of a word: «бойзов», «бойзы» and «Бойзы» are one unit. */
    stem(word) {
        const w = String(word || '').toLowerCase();
        return w.slice(0, Math.min(4, w.length));
    }

    /** Are two printed names the same unit/thing? Russian endings differ on the cards. */
    sameName(a, b) {
        // Quotes and punctuation differ between the card and the sheet:
        // «Ктан» / «К'тана», «(Гвардейцы)» / «гвардейцы».
        const clean = t => String(t || '').toLowerCase().replace(/['\u2019]/g, '').replace(/[^а-яёa-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const x = clean(a);
        const y = clean(b);
        if (!x || !y) return false;
        if (x === y) return true;
        const words = s => s.split(/\s+/).filter(Boolean);
        const wx = words(x);
        const wy = words(y);
        const last = wx[wx.length - 1];
        const last2 = wy[wy.length - 1];
        if (last && last2 && this.stem(last) === this.stem(last2)) return true;
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
