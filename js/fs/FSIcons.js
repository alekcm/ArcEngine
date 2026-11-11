// The icons and the card faces of the game, drawn by hand.
//
// Built-in emoji are never used: every symbol is a vector shape described once in a
// 32×32 box and painted either on a canvas (the textures of the 3D world) or as inline
// SVG (the panels). The cubes, the tokens and the dice faces of the original game are
// drawn here as well, so a card can ask for two cubes of attack without a character from a
// font: the text is real text, the symbols are real shapes.
const FS_ICON_COLOR = {
    att: '#c85a3f',
    def: '#4173ba',
    morale: '#c3a03c',
    any: '#8f86a8',
    ink: '#171310',
    paper: '#f1e8d4',
    steel: '#2b3542',
};

// A glyph of a die face, a cube or a token: coordinates in the unit circle.
// The three combat symbols of the Warhammer setting: the bolter (attack),
// the shield (defence) and the imperial eagle (morale).
const FS_GLYPH = {
    // A bolter, pointing right: barrel, body, magazine and stock.
    att: {
        polys: [
            [[-0.3, -0.44], [1.0, -0.44], [1.0, -0.2], [-0.3, -0.2]],
            [[-0.55, -0.52], [0.35, -0.52], [0.35, 0.2], [-0.55, 0.2]],
            [[0.0, 0.2], [0.3, 0.2], [0.2, 0.85], [-0.1, 0.85]],
            [[-0.55, -0.35], [-1.0, 0.1], [-1.0, 0.5], [-0.55, 0.2]],
        ],
    },
    // A heater shield with a boss in the middle.
    def: {
        polys: [[[0, -1], [0.82, -0.55], [0.82, 0.2], [0, 1], [-0.82, 0.2], [-0.82, -0.55]]],
        dots: [[0, 0.05, 0.24, 'paper']],
    },
    // The imperial eagle: body with a head and two spread wings.
    morale: {
        polys: [
            [[0, -0.95], [0.3, -0.5], [0.2, 0.25], [0, 0.95], [-0.2, 0.25], [-0.3, -0.5]],
            [[-0.25, -0.35], [-1.0, -0.8], [-0.75, -0.4], [-1.0, -0.05], [-0.55, 0.1], [-0.2, 0.15]],
            [[0.25, -0.35], [1.0, -0.8], [0.75, -0.4], [1.0, -0.05], [0.55, 0.1], [0.2, 0.15]],
        ],
    },
    any: { polys: [[[0, -1], [0.82, 0], [0, 1], [-0.82, 0]]], dots: [[0, 0, 0.3]] },
};

function starPoints(count, outer, inner) {
    const pts = [];
    for (let i = 0; i < count * 2; i++) {
        const a = -Math.PI / 2 + i * Math.PI / count;
        const r = i % 2 ? inner : outer;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
}

function iconMap(pts, cx, cy, r) {
    return pts.map(p => [cx + p[0] * r, cy + p[1] * r]);
}

// The shapes of the interface: every entry is a list of parts in the 32×32 box.
// t: 'p' — filled polygon, 'l' — a stroked line, 'c' — a filled circle.
const FS_SHAPES = {
    // --- the combat symbols ---------------------------------------------------
    // cube.* — the plain blazon (dice counts, card icons); token.* — the same
    // blazon enclosed in a circle, as the combat tokens of the game are.
    'cube.att': () => cubeShape('att'),
    'cube.def': () => cubeShape('def'),
    'cube.morale': () => cubeShape('morale'),
    'cube.any': () => cubeShape('any'),
    'token.att': () => tokenShape('att'),
    'token.def': () => tokenShape('def'),
    'token.morale': () => tokenShape('morale'),
    'token.any': () => tokenShape('any'),
    // --- the faces of a die ---------------------------------------------------
    'die.att': () => ({ color: FS_ICON_COLOR.paper, parts: glyphParts('att', 16, 16, 11.5, 'main') }),
    'die.def': () => ({ color: FS_ICON_COLOR.paper, parts: glyphParts('def', 16, 16, 11.5, 'main') }),
    'die.morale': () => ({ color: FS_ICON_COLOR.paper, parts: glyphParts('morale', 16, 16, 11.5, 'main') }),
    'die.blank': () => ({ color: FS_ICON_COLOR.paper, parts: [{ t: 'c', x: 16, y: 16, r: 4, fill: 'dark' }] }),
    // --- the orders -----------------------------------------------------------
    'order.advance': () => ({
        color: '#e4d5b0',
        parts: [
            { t: 'l', pts: [[9, 7], [18, 16], [9, 25]], width: 4.4 },
            { t: 'l', pts: [[17, 7], [26, 16], [17, 25]], width: 4.4, alpha: 0.66 },
        ],
    }),
    'order.strategize': () => ({
        // Two tilted cards of a hand: the strategy order is the cards.
        color: '#e4d5b0',
        parts: [
            { t: 'p', pts: [[22.1, 21.5], [17.5, 3.1], [3.9, 6.5], [8.5, 24.9]], alpha: 0.72 },
            { t: 'p', pts: [[24.2, 28.1], [27.5, 9.4], [13.8, 6.9], [10.5, 25.6]] },
            { t: 'p', pts: [[24.2, 28.1], [27.5, 9.4], [13.8, 6.9], [10.5, 25.6]], fill: 'none', stroke: 1.4 },
            { t: 'p', pts: [[19, 13.4], [21.3, 17.6], [19, 21.8], [16.7, 17.6]], fill: 'dark' },
        ],
    }),
    'order.deploy': () => ({
        // The deploy order is the plus of fresh troops.
        color: '#e4d5b0',
        parts: [
            { t: 'l', pts: [[16, 5], [16, 27]], width: 5.2 },
            { t: 'l', pts: [[5, 16], [27, 16]], width: 5.2 },
        ],
    }),
    // The double-headed eagle of dominion, drawn symmetric around x = 16.
    'order.dominate': () => ({
        color: '#e4d5b0',
        parts: [
            { t: 'p', pts: [[2, 10], [11, 13.4], [9.6, 19], [2, 18]], alpha: .92 },
            { t: 'p', pts: [[30, 10], [21, 13.4], [22.4, 19], [30, 18]], alpha: .92 },
            { t: 'p', pts: [[12.6, 5.6], [13.7, 2.4], [15.4, 4.7], [16, 1.5], [16.6, 4.7], [18.3, 2.4], [19.4, 5.6]], alpha: .9 },
            { t: 'p', pts: [[9.4, 6.8], [14.2, 9], [12.2, 14], [8.6, 10.4]], alpha: .96 },
            { t: 'p', pts: [[22.6, 6.8], [17.8, 9], [19.8, 14], [23.4, 10.4]], alpha: .96 },
            { t: 'p', pts: [[12.4, 22.8], [19.6, 22.8], [22.2, 29.2], [16, 26.4], [9.8, 29.2]], alpha: .94 },
            { t: 'p', pts: [[11.4, 11.8], [20.6, 11.8], [21.8, 22.6], [16, 25.4], [10.2, 22.6]] },
            { t: 'c', x: 8.3, y: 5.3, r: 2.9 },
            { t: 'c', x: 23.7, y: 5.3, r: 2.9 },
            { t: 'p', pts: [[6.1, 4.5], [3.1, 6.2], [6.2, 7.4]] },
            { t: 'p', pts: [[25.9, 4.5], [28.9, 6.2], [25.8, 7.4]] },
            { t: 'c', x: 7.6, y: 5.1, r: .78, fill: 'dark' },
            { t: 'c', x: 24.4, y: 5.1, r: .78, fill: 'dark' },
        ],
    }),
    'order.event': () => ({
        color: '#e4d5b0',
        parts: [
            { t: 'l', pts: [[9, 4], [9, 28]], width: 3 },
            { t: 'p', pts: [[10, 5], [26, 9], [10, 15]] },
        ],
    }),
    // --- the assets of a player -----------------------------------------------
    'asset.materiel': () => ({
        // The materiel a world yields: a green gear.
        color: '#7fce6a',
        parts: [
            { t: 'p', pts: ringPolygon(16, 16, 13.5, 9.5, 8), fill: 'main' },
            { t: 'c', x: 16, y: 16, r: 4.6, fill: 'dark' },
        ],
    }),
    'asset.cache': () => ({
        color: '#c9a86a',
        parts: [
            { t: 'p', pts: [[16, 4], [26, 9], [26, 21], [16, 26], [6, 21], [6, 9]], fill: 'none', stroke: 2.6 },
            { t: 'p', pts: [[16, 10], [21, 13], [21, 19], [16, 22], [11, 19], [11, 13]], fill: 'main' },
        ],
    }),
    // The forge: a blue war hammer.
    'asset.forge': () => ({
        color: '#58a6ff',
        parts: [
            { t: 'p', pts: [[5, 4], [27, 4], [27, 13], [5, 13]] },
            { t: 'p', pts: [[5, 4], [11, 4], [11, 13], [5, 13]], fill: 'dark', alpha: .5 },
            { t: 'p', pts: [[21, 4], [27, 4], [27, 13], [21, 13]], fill: 'dark', alpha: .5 },
            { t: 'p', pts: [[13.3, 7], [18.7, 7], [18.7, 10], [13.3, 10]], fill: 'dark', alpha: .75 },
            { t: 'p', pts: [[14.1, 13], [17.9, 13], [17.3, 28.4], [14.7, 28.4]] },
            { t: 'p', pts: [[13.3, 25], [18.7, 25], [18.7, 29], [13.3, 29]], fill: 'dark', alpha: .85 },
        ],
    }),
    'asset.prosperity': () => ({
        color: '#9ed4a6',
        parts: [
            { t: 'p', pts: [[16, 27], [7, 17], [11, 7], [16, 12], [21, 7], [25, 17]] },
            { t: 'c', x: 16, y: 17, r: 3, fill: 'dark' },
        ],
    }),
    'mark.health': () => ({
        color: '#c9563f',
        parts: [{ t: 'p', pts: [[16, 27], [4, 14], [8, 6], [16, 11], [24, 6], [28, 14]] }],
    }),
    // A skull: the unit capacity printed on a world.
    'mark.skull': () => ({
        color: '#e8e2d2',
        parts: [
            { t: 'c', x: 16, y: 13.5, r: 8, fill: 'main' },
            { t: 'p', pts: [[9.5, 17.5], [22.5, 17.5], [21, 26.5], [11, 26.5]], fill: 'main' },
            { t: 'c', x: 12.4, y: 13.5, r: 2.5, fill: 'dark' },
            { t: 'c', x: 19.6, y: 13.5, r: 2.5, fill: 'dark' },
            { t: 'p', pts: [[16, 17], [14.5, 20.2], [17.5, 20.2]], fill: 'dark' },
            { t: 'l', pts: [[13, 22.5], [13, 26]], width: 1.3 },
            { t: 'l', pts: [[16, 22.5], [16, 26.5]], width: 1.3 },
            { t: 'l', pts: [[19, 22.5], [19, 26]], width: 1.3 },
        ],
    }),

    // --- the marks of the board ------------------------------------------------
    'mark.objective': () => ({
        color: '#d9c48a',
        parts: [
            { t: 'p', pts: ringPolygon(16, 16, 12, 8, 24) },
            { t: 'c', x: 16, y: 16, r: 4.2, fill: 'main' },
        ],
    }),
    'mark.city': () => ({
        color: '#cfd6de',
        parts: [
            { t: 'p', pts: [[6, 26], [6, 10], [10, 10], [10, 6], [14, 6], [14, 10], [18, 10], [18, 6], [22, 6], [22, 10], [26, 10], [26, 26]] },
            { t: 'c', x: 16, y: 19, r: 3, fill: 'dark' },
        ],
    }),
    'mark.bastion': () => ({
        color: '#cfd6de',
        parts: [
            { t: 'p', pts: [[6, 27], [6, 12], [10, 8], [16, 4], [22, 8], [26, 12], [26, 27]] },
            { t: 'p', pts: [[12, 27], [12, 16], [20, 16], [20, 27]], fill: 'dark' },
        ],
    }),
    'mark.ship': () => ({
        color: '#cfd6de',
        parts: [
            { t: 'p', pts: [[16, 3], [24, 20], [16, 16], [8, 20]] },
            { t: 'p', pts: [[12, 24], [20, 24], [16, 29]], alpha: 0.7 },
        ],
    }),
    // A world and a void: the two kinds of an area of a system tile.
    'mark.world': () => ({
        color: '#9fd0a0', parts: [
            { t: 'c', x: 16, y: 16, r: 9, fill: 'none', ring: 2.6 },
            { t: 'l', pts: [[5, 12], [27, 20]], width: 2.2, alpha: 0.85 },
            { t: 'c', x: 12, y: 19, r: 2.4, fill: 'main', alpha: 0.9 },
        ],
    }),
    'mark.void': () => ({
        color: '#8fbfe0', parts: [
            { t: 'c', x: 16, y: 16, r: 8, fill: 'none', ring: 1.8, alpha: 0.75 },
            { t: 'c', x: 12, y: 13, r: 1.7, fill: 'main' },
            { t: 'c', x: 20, y: 19, r: 2.2, fill: 'main' },
        ],
    }),
    'mark.ground': () => ({
        color: '#cfd6de',
        parts: [
            { t: 'c', x: 16, y: 9, r: 4.4 },
            { t: 'p', pts: [[8, 27], [10, 15], [22, 15], [24, 27]] },
        ],
    }),
    'mark.damage': () => ({
        color: '#c8442d',
        parts: [
            { t: 'l', pts: [[8, 8], [24, 24]], width: 4 },
            { t: 'l', pts: [[24, 8], [8, 24]], width: 4 },
            { t: 'c', x: 16, y: 16, r: 6.4, fill: 'none', ring: 2.6 },
        ],
    }),
    // --- the small things of the interface -------------------------------------
    'ui.center': () => ({ color: '#cbd3dc', parts: [{ t: 'c', x: 16, y: 16, r: 6, fill: 'none', ring: 2.6 }, { t: 'l', pts: [[16, 3], [16, 8]], width: 2.6 }, { t: 'l', pts: [[16, 24], [16, 29]], width: 2.6 }, { t: 'l', pts: [[3, 16], [8, 16]], width: 2.6 }, { t: 'l', pts: [[24, 16], [29, 16]], width: 2.6 }] }),
    'ui.full': () => ({
        color: '#cbd3dc',
        parts: [
            { t: 'p', pts: [[5, 5], [13, 5], [13, 8], [8, 8], [8, 13], [5, 13]] },
            { t: 'p', pts: [[27, 5], [27, 13], [24, 13], [24, 8], [19, 8], [19, 5]] },
            { t: 'p', pts: [[5, 27], [5, 19], [8, 19], [8, 24], [13, 24], [13, 27]] },
            { t: 'p', pts: [[27, 27], [19, 27], [19, 24], [24, 24], [24, 19], [27, 19]] },
        ],
    }),
    'ui.close': () => ({ color: '#cbd3dc', parts: [{ t: 'l', pts: [[9, 9], [23, 23]], width: 3.4 }, { t: 'l', pts: [[23, 9], [9, 23]], width: 3.4 }] }),
    'ui.undo': () => ({ color: '#cbd3dc', parts: [{ t: 'l', pts: [[10, 18], [18, 10], [26, 18]], width: 3.4 }, { t: 'l', pts: [[18, 10], [18, 26]], width: 3.4, alpha: 0.6 }] }),
    'ui.next': () => ({ color: '#cbd3dc', parts: [{ t: 'l', pts: [[10, 8], [20, 16], [10, 24]], width: 4 }] }),
    'ui.die': () => ({
        color: '#e6ddc8',
        parts: [
            { t: 'p', pts: [[6, 6], [26, 6], [26, 26], [6, 26]], fill: 'none', stroke: 3 },
            { t: 'c', x: 11.5, y: 11.5, r: 2.2, fill: 'main' },
            { t: 'c', x: 20.5, y: 11.5, r: 2.2, fill: 'main' },
            { t: 'c', x: 11.5, y: 20.5, r: 2.2, fill: 'main' },
            { t: 'c', x: 20.5, y: 20.5, r: 2.2, fill: 'main' },
        ],
    }),
    'ui.card': () => ({
        color: '#e6ddc8',
        parts: [
            { t: 'p', pts: [[7, 4], [25, 4], [25, 28], [7, 28]], fill: 'none', stroke: 2.6 },
            { t: 'l', pts: [[10, 10], [22, 10]], width: 2.2 },
            { t: 'l', pts: [[10, 15], [22, 15]], width: 2.2, alpha: 0.7 },
            { t: 'l', pts: [[10, 20], [17, 20]], width: 2.2, alpha: 0.5 },
        ],
    }),
    'ui.reinforce': () => ({
        color: '#8fc79a',
        parts: [
            { t: 'p', pts: [[14, 5], [18, 5], [18, 14], [27, 14], [27, 18], [18, 18], [18, 27], [14, 27], [14, 18], [5, 18], [5, 14], [14, 14]] },
        ],
    }),
    'ui.check': () => ({ color: '#a9e0b6', parts: [{ t: 'l', pts: [[7, 17], [13, 23], [25, 9]], width: 4 }] }),
    'ui.redo': () => ({ color: '#cbd3dc', parts: [{ t: 'l', pts: [[26, 18], [18, 10], [10, 18]], width: 3.4 }, { t: 'l', pts: [[18, 10], [18, 26]], width: 3.4, alpha: 0.6 }] }),
    'ui.menu': () => ({ color: '#cbd3dc', parts: [{ t: 'l', pts: [[8, 11], [24, 11]], width: 3 }, { t: 'l', pts: [[8, 16], [24, 16]], width: 3, alpha: .8 }, { t: 'l', pts: [[8, 21], [24, 21]], width: 3, alpha: .6 }] }),
    'ui.up': () => ({ color: '#cbd3dc', parts: [{ t: 'l', pts: [[8, 19], [16, 10], [24, 19]], width: 3.6 }] }),
    'ui.down': () => ({ color: '#cbd3dc', parts: [{ t: 'l', pts: [[8, 13], [16, 22], [24, 13]], width: 3.6 }] }),
    'ui.left': () => ({ color: '#cbd3dc', parts: [{ t: 'l', pts: [[19, 8], [10, 16], [19, 24]], width: 3.6 }] }),
    'ui.right': () => ({ color: '#cbd3dc', parts: [{ t: 'l', pts: [[13, 8], [22, 16], [13, 24]], width: 3.6 }] }),
    'ui.storm': () => ({
        color: '#eb6dc6',
        parts: [
            { t: 'p', pts: starPoints(8, 13, 5).map(q => [16 + q[0] * 1.0, 16 + q[1] * 1.0]), alpha: .9 },
            { t: 'c', x: 16, y: 16, r: 4, fill: 'ink' },
        ],
    }),
    // The warthe gate arrows of an event card: the eight directions a card may
    // drag its storm. Printed on the card before it moves anything.
    'ui.storm-n': () => ({ color: '#eb6dc6', parts: [{ t: 'p', pts: [[16.0, 2.0], [27.0, 17.0], [21.0, 17.0], [21.0, 30.0], [11.0, 30.0], [11.0, 17.0], [5.0, 17.0]] }] }),
    'ui.storm-ne': () => ({ color: '#eb6dc6', parts: [{ t: 'p', pts: [[25.9, 6.1], [23.1, 24.5], [18.8, 20.2], [9.6, 29.4], [2.6, 22.4], [11.8, 13.2], [7.5, 8.9]] }] }),
    'ui.storm-e': () => ({ color: '#eb6dc6', parts: [{ t: 'p', pts: [[30.0, 16.0], [15.0, 27.0], [15.0, 21.0], [2.0, 21.0], [2.0, 11.0], [15.0, 11.0], [15.0, 5.0]] }] }),
    'ui.storm-se': () => ({ color: '#eb6dc6', parts: [{ t: 'p', pts: [[25.9, 25.9], [7.5, 23.1], [11.8, 18.8], [2.6, 9.6], [9.6, 2.6], [18.8, 11.8], [23.1, 7.5]] }] }),
    'ui.storm-s': () => ({ color: '#eb6dc6', parts: [{ t: 'p', pts: [[16.0, 30.0], [5.0, 15.0], [11.0, 15.0], [11.0, 2.0], [21.0, 2.0], [21.0, 15.0], [27.0, 15.0]] }] }),
    'ui.storm-sw': () => ({ color: '#eb6dc6', parts: [{ t: 'p', pts: [[6.1, 25.9], [8.9, 7.5], [13.2, 11.8], [22.4, 2.6], [29.4, 9.6], [20.2, 18.8], [24.5, 23.1]] }] }),
    'ui.storm-w': () => ({ color: '#eb6dc6', parts: [{ t: 'p', pts: [[2.0, 16.0], [17.0, 5.0], [17.0, 11.0], [30.0, 11.0], [30.0, 21.0], [17.0, 21.0], [17.0, 27.0]] }] }),
    'ui.storm-nw': () => ({ color: '#eb6dc6', parts: [{ t: 'p', pts: [[6.1, 6.1], [24.5, 8.9], [20.2, 13.2], [29.4, 22.4], [22.4, 29.4], [13.2, 20.2], [8.9, 24.5]] }] }),
    // The printed S-curves of the diagonal pairs: the storm bar with the two
    // pivot arcs. NW/SE («Гнев дракона пустоты»): the top head points left,
    // the bottom head points right. NE/SW is its mirror.
    'ui.storm-nw-se': () => ({ color: '#eb6dc6', parts: [
        { t: 'p', pts: [[4, 14], [28, 14], [28, 18], [4, 18]] },
        { t: 'l', pts: [[10, 14], [10, 8], [8, 5], [5, 5]], width: 2.6 },
        { t: 'p', pts: [[2.5, 5], [9, 2], [9, 8]] },
        { t: 'l', pts: [[22, 18], [22, 24], [24, 27], [27, 27]], width: 2.6 },
        { t: 'p', pts: [[29.5, 27], [23, 24], [23, 30]] },
    ] }),
    'ui.storm-ne-sw': () => ({ color: '#eb6dc6', parts: [
        { t: 'p', pts: [[4, 14], [28, 14], [28, 18], [4, 18]] },
        { t: 'l', pts: [[22, 14], [22, 8], [24, 5], [27, 5]], width: 2.6 },
        { t: 'p', pts: [[29.5, 5], [23, 2], [23, 8]] },
        { t: 'l', pts: [[10, 18], [10, 24], [8, 27], [5, 27]], width: 2.6 },
        { t: 'p', pts: [[2.5, 27], [9, 24], [9, 30]] },
    ] }),
    // «Теософия»: any of the eight directions — eight heads around the centre.
    'ui.storm-any': () => ({ color: '#eb6dc6', parts: [
        { t: 'p', pts: [[16, 3], [13, 9], [19, 9]] },
        { t: 'p', pts: [[16, 29], [13, 23], [19, 23]] },
        { t: 'p', pts: [[29, 16], [23, 13], [23, 19]] },
        { t: 'p', pts: [[3, 16], [9, 13], [9, 19]] },
        { t: 'p', pts: [[25, 7], [19, 9], [23, 13]] },
        { t: 'p', pts: [[7, 25], [9, 19], [13, 23]] },
        { t: 'p', pts: [[7, 7], [9, 13], [13, 9]] },
        { t: 'p', pts: [[25, 25], [19, 23], [23, 19]] },
    ] }),
    'ui.retreat': () => ({
        color: '#cbd3dc',
        parts: [{ t: 'l', pts: [[24, 6], [10, 16], [24, 26]], width: 4 }, { t: 'l', pts: [[17, 6], [3, 16], [17, 26]], width: 4, alpha: 0.6 }],
    }),
};

function shade(hex, k) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '#888888'));
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.max(0, Math.min(255, Math.round(v * k))));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}

// A flat blazon of the combat kind: the bolter, the shield or the eagle,
// drawn large in the 32×32 box so it stays readable at any icon size.
function cubeShape(kind) {
    const color = FS_ICON_COLOR[kind] || FS_ICON_COLOR.any;
    return { color, parts: glyphParts(kind, 16, 16, 12.5, 'main') };
}

// The same blazon enclosed in a circle: the combat token of the game.
function tokenShape(kind) {
    const color = FS_ICON_COLOR[kind] || FS_ICON_COLOR.any;
    return {
        color,
        parts: [
            { t: 'c', x: 16, y: 16, r: 13.5, fill: 'none', ring: 3, stroke: 'main' },
            { t: 'c', x: 16, y: 16, r: 10.5, fill: 'main', alpha: 0.16 },
            ...glyphParts(kind, 16, 16, 7.6, 'main'),
        ],
    };
}

function glyphParts(kind, cx, cy, r, fill, alpha) {
    const g = FS_GLYPH[kind] || FS_GLYPH.any;
    const out = [];
    for (const poly of g.polys || []) out.push({ t: 'p', pts: iconMap(poly, cx, cy, r), fill, alpha });
    for (const line of g.lines || []) out.push({ t: 'l', pts: iconMap(line, cx, cy, r), width: r * (g.width || 0.28), fill, alpha });
    for (const dot of g.dots || []) out.push({ t: 'c', x: cx + dot[0] * r, y: cy + dot[1] * r, r: dot[2] * r, fill: dot[3] || 'main', alpha });
    return out;
}

// A ring with square teeth: the objective token of the board.
function ringPolygon(cx, cy, outer, inner, teeth) {
    const pts = [];
    const step = Math.PI * 2 / teeth;
    for (let i = 0; i < teeth; i++) {
        const a = i * step;
        const r = i % 2 ? inner : outer;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        pts.push([cx + Math.cos(a + step * 0.5) * inner, cy + Math.sin(a + step * 0.5) * inner]);
    }
    return pts;
}

const FSIcons = {
    color: FS_ICON_COLOR,
    shape(name) {
        const make = FS_SHAPES[name];
        if (!make) return null;
        const s = make();
        s.parts = s.parts || [];
        return s;
    },

    resolve(part, base, opts) {
        const fill = part.fill || 'main';
        if (fill === 'none') return 'none';
        if (fill === 'main') return (opts && opts.color) || base;
        if (fill === 'light') return shade((opts && opts.color) || base, 1.28);
        if (fill === 'dark') return shade((opts && opts.color) || base, 0.66);
        if (fill === 'ink') return FS_ICON_COLOR.ink;
        if (fill === 'paper') return FS_ICON_COLOR.paper;
        return fill;
    },

    // Paint a shape in the canvas, centred on (cx, cy).
    // opts.outline — a dark silhouette painted under the colour, in eight small
    // offsets: a thin black rim around the icon, never a repaint of it.
    canvas(ctx, name, cx, cy, size, opts) {
        const shape = this.shape(name);
        if (!shape || !ctx) return false;
        const k = size / 32;
        ctx.save();
        ctx.translate(cx - size / 2, cy - size / 2);
        ctx.scale(k, k);
        const outline = opts && opts.outline;
        const paint = (shiftX, shiftY, mono) => {
            ctx.save();
            ctx.translate(shiftX, shiftY);
            for (const part of shape.parts) {
                // A stroke-only part keeps its opening: the rim widens the
                // stroke instead of introducing a fill of its own.
                const strokeOnly = part.fill === 'none';
                const color = mono ? (strokeOnly ? 'none' : mono) : this.resolve(part, shape.color, opts);
                ctx.globalAlpha = part.alpha == null ? 1 : part.alpha;
                if (part.t === 'p') {
                    ctx.beginPath();
                    part.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
                    ctx.closePath();
                    if (color !== 'none') { ctx.fillStyle = color; ctx.fill(); }
                    if (mono && part.stroke) {
                        ctx.lineWidth = part.stroke + 2.2;
                        ctx.strokeStyle = mono;
                        ctx.stroke();
                    } else if (!mono && part.stroke) {
                        ctx.lineWidth = part.stroke;
                        ctx.strokeStyle = this.resolve({ fill: 'dark' }, shape.color, opts);
                        ctx.stroke();
                    }
                } else if (part.t === 'l') {
                    ctx.beginPath();
                    part.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
                    ctx.lineWidth = (part.width || 2) + (mono ? 1.6 : 0);
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.strokeStyle = mono ? mono : (color === 'none' ? FS_ICON_COLOR.ink : color);
                    ctx.stroke();
                } else if (part.t === 'c') {
                    ctx.beginPath();
                    ctx.arc(part.x, part.y, strokeOnly ? part.r : part.r + (mono ? .9 : 0), 0, Math.PI * 2);
                    if (color !== 'none') { ctx.fillStyle = color; ctx.fill(); }
                    if (mono ? part.ring : part.ring) {
                        ctx.lineWidth = mono ? part.ring + 2.2 : part.ring;
                        ctx.strokeStyle = mono ? mono : this.resolve({ fill: part.stroke || 'dark' }, shape.color, opts);
                        ctx.stroke();
                    }
                }
            }
            ctx.restore();
        };
        if (outline) {
            const rim = typeof outline === 'string' ? outline : '#0d0d0d';
            for (const [dx, dy] of [[-1.15, 0], [1.15, 0], [0, -1.15], [0, 1.15], [-.85, -.85], [.85, -.85], [-.85, .85], [.85, .85]]) {
                paint(dx, dy, rim);
            }
        }
        paint(0, 0, null);
        ctx.restore();
        return true;
    },

    // The same shape as inline SVG: the panels never need a canvas for an icon.
    svg(name, opts) {
        const shape = this.shape(name);
        if (!shape) return '';
        const size = (opts && opts.size) || 32;
        const parts = shape.parts.map(part => {
            const color = this.resolve(part, shape.color, opts);
            const alpha = part.alpha == null ? '' : ' opacity="' + part.alpha + '"';
            if (part.t === 'p') {
                const pts = part.pts.map(p => p[0].toFixed(2) + ',' + p[1].toFixed(2)).join(' ');
                const fill = color === 'none' ? 'none' : color;
                const stroke = part.stroke ? ' stroke="' + this.resolve({ fill: 'dark' }, shape.color, opts) + '" stroke-width="' + part.stroke + '"' : '';
                return '<polygon points="' + pts + '" fill="' + fill + '"' + stroke + alpha + '/>';
            }
            if (part.t === 'l') {
                const d = part.pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');
                return '<path d="' + d + '" fill="none" stroke="' + (color === 'none' ? FS_ICON_COLOR.ink : color)
                    + '" stroke-width="' + (part.width || 2) + '" stroke-linecap="round" stroke-linejoin="round"' + alpha + '/>';
            }
            const stroke = part.ring ? ' stroke="' + this.resolve({ fill: part.stroke || 'dark' }, shape.color, opts) + '" stroke-width="' + part.ring + '"' : '';
            return '<circle cx="' + part.x.toFixed(2) + '" cy="' + part.y.toFixed(2) + '" r="' + part.r.toFixed(2)
                + '" fill="' + (color === 'none' ? 'none' : color) + '"' + stroke + alpha + '/>';
        }).join('');
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="' + size + '" height="' + size + '">'
            + parts + '</svg>';
    },

    // The icon as a CSS background: a span of any size shows it without a font.
    url(name, opts) {
        const svg = this.svg(name, opts);
        if (!svg) return 'none';
        return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
    },

    // The icons a hand of cards may need: the cubes, the tokens and the dice.
    fromCardWord(word) {
        const w = String(word || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (!w) return null;
        if (w === '?') return 'cube.any';
        const kind = /^att/.test(w) ? 'att' : /^def/.test(w) ? 'def' : /^morale/.test(w) ? 'morale' : 'any';
        const token = /token/.test(w);
        return (token ? 'token.' : 'cube.') + kind;
    },

    // --- the rich text of the cards -------------------------------------------
    // «*курсив*», «**жирный**», «`att. cube`» — the markup is turned into runs, and
    // the run of an icon is drawn as a cube, never as a word.
    runs(text) {
        const src = String(text == null ? '' : text);
        const blocks = [];
        let line = [];
        let buf = '';
        const flush = () => { if (buf) { line.push({ t: 'text', v: buf }); buf = ''; } };
        const endLine = () => { flush(); blocks.push(line); line = []; };
        let i = 0;
        while (i < src.length) {
            const ch = src[i];
            if (ch === '`') {
                const j = src.indexOf('`', i + 1);
                if (j > i) { flush(); line.push({ t: 'icon', name: src.slice(i + 1, j).trim() }); i = j + 1; continue; }
            }
            if (ch === '*' && src[i + 1] === '*') {
                const j = src.indexOf('**', i + 2);
                if (j > i) { flush(); line.push({ t: 'text', v: src.slice(i + 2, j), bold: true }); i = j + 2; continue; }
            }
            if (ch === '*') {
                const j = src.indexOf('*', i + 1);
                // One asterisk pair on a card is the required-units prefix —
                // it is always printed bold italic («Гвардеец/Крейсер:»).
                if (j > i) { flush(); line.push({ t: 'text', v: src.slice(i + 1, j), bold: true, italic: true }); i = j + 1; continue; }
            }
            if (ch === '\n') { endLine(); i++; continue; }
            buf += ch; i++;
        }
        endLine();
        // Empty lines of the end are dropped: the card has no blank tail.
        while (blocks.length && !blocks[blocks.length - 1].length) blocks.pop();
        return blocks;
    },

    font(size, run) {
        const italic = run && run.italic ? 'italic ' : '';
        const weight = run && run.bold ? '700' : '400';
        return italic + weight + ' ' + Math.round(size) + 'px "PT Serif", "PT Sans", "Segoe UI", Georgia, serif';
    },

    // Draw the rich text into a box. Icons are drawn inside the text flow, so the
    // words «2 куба морали» never appear on a card — two cubes do.
    drawRich(ctx, text, x, y, width, opts) {
        const o = opts || {};
        const size = o.size || 20;
        const color = o.color || '#2a241d';
        const lineH = Math.round(size * (o.line || 1.3));
        const box = Math.round(size * 1.16);
        const blocks = o.blocks || this.runs(text);
        let cy = y;
        for (const block of blocks) {
            const items = [];
            for (const run of block) {
                if (run.t === 'icon') {
                    items.push({ icon: FSIcons.fromCardWord(run.name) || 'cube.any', w: box + Math.round(size * 0.16), box });
                    continue;
                }
                ctx.font = this.font(size, run);
                for (const word of String(run.v).split(/(\s+)/)) {
                    if (!word) continue;
                    items.push({ text: word, w: ctx.measureText(word).width, bold: run.bold, italic: run.italic });
                }
            }
            let cx = x;
            for (const it of items) {
                const w = it.icon ? it.w : it.w;
                if (cx + w > x + width && cx > x + 0.5 && !/^\s*$/.test(it.text || '')) { cx = x; cy += lineH; }
                if (it.icon) {
                    this.canvas(ctx, it.icon, cx + it.box / 2, cy + lineH * 0.52, it.box, o.iconColor ? { color: o.iconColor } : null);
                } else {
                    ctx.font = this.font(size, it);
                    ctx.fillStyle = it.bold ? (o.boldColor || '#120f0b') : color;
                    ctx.textBaseline = 'alphabetic';
                    ctx.fillText(it.text, cx, cy + size * 0.98);
                }
                cx += w;
            }
            cy += lineH;
        }
        return cy;
    },

    roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
    },

    // --- the face of a combat card --------------------------------------------
    // Everything the card says is on the card: its name, its cubes, its text — with
    // real italics and real bold, and the cubes drawn as cubes.
    cardFace(ctx, W, H, card, opts) {
        const o = opts || {};
        const accent = o.color || '#8a6a3a';
        const pad = Math.round(W * 0.075);
        ctx.clearRect(0, 0, W, H);
        // The parchment of the card.
        const bg = ctx.createLinearGradient(0, 0, W, H);
        bg.addColorStop(0, '#efe4c8');
        bg.addColorStop(0.55, '#e6d9b9');
        bg.addColorStop(1, '#cdbf9d');
        ctx.fillStyle = bg;
        this.roundRect(ctx, 0, 0, W, H, Math.round(W * 0.045));
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(2, Math.round(W * 0.014));
        this.roundRect(ctx, W * 0.022, H * 0.016, W * 0.956, H * 0.968, Math.round(W * 0.035));
        ctx.stroke();
        // The bar of the name.
        ctx.fillStyle = accent;
        this.roundRect(ctx, W * 0.022, H * 0.016, W * 0.956, H * 0.135, Math.round(W * 0.035));
        ctx.fill();
        ctx.fillStyle = '#f7efd9';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const nameSize = Math.round(W * (String(card.name || '').length > 16 ? 0.098 : 0.122));
        ctx.font = '700 ' + nameSize + 'px "PT Serif", "PT Sans", "Segoe UI", Georgia, serif';
        ctx.fillText(String(card.name || ''), W / 2, H * 0.016 + H * 0.0675);
        ctx.textAlign = 'left';
        // The cubes of the card: one icon per point, a small number when there are many.
        const icons = card.icons || {};
        const cy = H * 0.205;
        let cx = pad;
        const cube = Math.round(W * 0.105);
        for (const kind of ['att', 'def', 'morale']) {
            const n = Number(icons[kind] || 0);
            if (!n) continue;
            for (let i = 0; i < Math.min(n, 3); i++) {
                this.canvas(ctx, 'cube.' + kind, cx + cube / 2, cy, cube);
                cx += cube * 0.86;
            }
            if (n > 3) {
                ctx.fillStyle = '#2a241d';
                ctx.font = '700 ' + Math.round(W * 0.062) + 'px "PT Sans", "Segoe UI", sans-serif';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(n), cx, cy);
                cx += W * 0.06;
            }
            cx += W * 0.03;
        }
        // The text of the card, in two parts: the general rule and the unit rule.
        const size = Math.round(W * 0.072);
        let y = H * 0.255;
        y = this.drawRich(ctx, card.general || '', pad, y, W - pad * 2, { size, color: '#241f18', boldColor: '#120f0b' });
        if (card.unit) {
            ctx.strokeStyle = 'rgba(60, 48, 30, .45)';
            ctx.lineWidth = Math.max(1, Math.round(W * 0.006));
            ctx.beginPath();
            ctx.moveTo(pad, y + size * 0.25);
            ctx.lineTo(W - pad, y + size * 0.25);
            ctx.stroke();
            y = this.drawRich(ctx, card.unit, pad, y + size * 0.65, W - pad * 2, { size, color: '#33291d', boldColor: '#120f0b' });
        }
        // The bottom line: the file of the card, not a paragraph of rules.
        ctx.fillStyle = 'rgba(40, 32, 20, .62)';
        ctx.font = '400 ' + Math.round(W * 0.052) + 'px "PT Sans", "Segoe UI", sans-serif';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(card.upgrade ? 'Улучшение' : 'Боевая карта', pad, H - pad * 0.72);
        if (o.faction) {
            ctx.textAlign = 'right';
            ctx.fillText(o.faction, W - pad, H - pad * 0.72);
            ctx.textAlign = 'left';
        }
        return ctx;
    },

    // The closed back of a card: the blazon of the faction on a dark field.
    cardBack(ctx, W, H, color) {
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#191b22';
        this.roundRect(ctx, 0, 0, W, H, Math.round(W * 0.045));
        ctx.fill();
        ctx.strokeStyle = color || '#8a6a3a';
        ctx.lineWidth = Math.max(2, Math.round(W * 0.014));
        this.roundRect(ctx, W * 0.03, H * 0.022, W * 0.94, H * 0.956, Math.round(W * 0.032));
        ctx.stroke();
        const size = Math.round(W * 0.42);
        this.canvas(ctx, 'mark.objective', W / 2, H / 2, size, { color: color || '#c8a24a' });
        return ctx;
    },
};
