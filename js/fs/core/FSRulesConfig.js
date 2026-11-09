// FSRulesConfig.js — the numbers of the game in one place.
//
// The rules engine, the board and the interface read these values. They are
// plain constants of the printed rules (or of the box), not settings of a
// particular party: a party may change them only by a card or an order, which
// the engine handles through the modifiers of the current order.

const FS_RULES_CONFIG = {
    // The board: the rows of the system tiles, top to bottom. Every player has
    // three tiles (their home tile and two base ones), so the board is
    // 3 x players tiles, on an aligned square grid.
    LAYOUTS: { 2: [2, 2, 2], 3: [3, 3, 3], 4: [4, 4, 4] },
    TILE: 100,             // px of one system tile
    MATERIEL_MAX: 14,      // the materiel dial stops at 14
    DICE_MAX: 8,           // no more than eight dice in a combat
    ORDER_TOKENS: 4,       // four order tokens per round
    ROUNDS: 8,             // the game ends after the eighth round
    ORDER_SUPPLY: 2,       // two tokens of every kind in the hand of a player
    AREA_CAP: 3,           // the unit capacity of a void
    AREA_MAX_UNITS: 5,     // no more than five units in one area
    // The structures are shared plastic: 35 in the box (15 cities, 10 factories,
    // 10 bastions), and every player has 9 structure control tokens. There is no
    // "three of each" rule — that number was invented by the engine.
    STRUCTURE_POOL: { city: 15, factory: 10, bastion: 10 },
    STRUCTURE_TOKENS: 9,
};
