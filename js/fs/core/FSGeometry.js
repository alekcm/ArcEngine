// FSGeometry.js — the one description of a system tile's geometry.
//
// A tile is a square with four areas in the corners. The printed tile (the
// scan) has its own orientation; the board has another one after the player
// rotates the tile during setup. Every place of the game that turns an area,
// walks to a neighbouring area, compares the sides of two tiles or asks which
// corner is the top-left one must use THIS class:
//
//   rules   — adjacency, paths, the objective spaces, the setup cells;
//   view    — where a quadrant is drawn and where a piece stands;
//   interface, setup — the preview of a rotated tile.
//
// A second copy of that arithmetic anywhere is how "the same map works
// differently in the panel and on the board" starts.

class TileGeometry {
    /** The areas of a printed tile, in the order top-left, top-right, bottom-left, bottom-right. */
    static POSITIONS = ['TL', 'TR', 'BL', 'BR'];

    /** One quarter-turn clockwise in board coordinates (x right, row down). */
    static CLOCKWISE = { TL: 'TR', TR: 'BR', BR: 'BL', BL: 'TL' };

    /** The step of a neighbour by the side of a tile. */
    static OFFSETS = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] };

    /** The opposing half-edges that meet on a shared gold border. */
    static TOUCHING = {
        N: { TL: 'BL', TR: 'BR' },
        S: { BL: 'TL', BR: 'TR' },
        E: { TR: 'TL', BR: 'BL' },
        W: { TL: 'TR', BL: 'BR' },
    };

    /** The areas of ONE tile that share a gold line (the snake through the centre). */
    static SAME_TILE = [['TL', 'TR'], ['BL', 'BR'], ['TL', 'BL'], ['TR', 'BR']];

    /** @param {string} pos @returns {number} 0..3, -1 for an unknown name */
    static index(pos) {
        return TileGeometry.POSITIONS.indexOf(pos);
    }

    /** @param {string} pos @param {number} turns quarter-turns clockwise */
    static rotate(pos, turns) {
        let out = pos;
        for (let i = 0; i < turns; i++) out = TileGeometry.CLOCKWISE[out] || out;
        return out;
    }

    /** The area of the printed face that ends up at `pos` after the rotation. */
    static sourceOf(pos, turns) {
        const t = ((turns % 4) + 4) % 4;
        return TileGeometry.rotate(pos, (4 - t) % 4);
    }

    /** The areas of one tile next to `pos` (no diagonals). */
    static adjacentPositions(pos) {
        const out = [];
        for (const pair of TileGeometry.SAME_TILE) {
            if (pair[0] === pos) out.push(pair[1]);
            if (pair[1] === pos) out.push(pair[0]);
        }
        return out;
    }

    /** Do two grid cells share a full side? */
    static cellsTouch(a, b) {
        if (!a || !b) return false;
        return Math.abs(Number(a.row) - Number(b.row)) + Math.abs(Number(a.col) - Number(b.col)) === 1;
    }

    /** The side of `a` that faces `b`; null unless the cells share a side. */
    static sideBetween(a, b) {
        if (!TileGeometry.cellsTouch(a, b)) return null;
        if (Number(a.row) === Number(b.row)) return Number(b.col) > Number(a.col) ? 'E' : 'W';
        return Number(b.row) > Number(a.row) ? 'S' : 'N';
    }

    /** The cell one step from `cell` over `side`. */
    static cellAcross(cell, side) {
        const off = TileGeometry.OFFSETS[side];
        if (!off || !cell) return null;
        return { row: Number(cell.row) + off[0], col: Number(cell.col) + off[1] };
    }

    /** Do the areas of two tiles that share `side` meet on the gold border? */
    static areasTouch(side, posA, posB) {
        const pairs = TileGeometry.TOUCHING[side];
        return !!pairs && pairs[posA] === posB;
    }

    /** The unit square of an area on the printed face: {x, y, w, h} in 0..1. */
    static rect(pos) {
        const half = 0.5;
        const at = { TL: [0, 0], TR: [half, 0], BL: [0, half], BR: [half, half] }[pos];
        return { x: at ? at[0] : 0, y: at ? at[1] : 0, w: half, h: half };
    }

    /** The centre of an area on the printed face, in 0..1 of the tile. */
    static center(pos) {
        const r = TileGeometry.rect(pos);
        return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    }

    /** A short human name of a side, as the panel shows it. */
    static sideName(side) {
        return ({ N: 'сверху', E: 'справа', S: 'снизу', W: 'слева' })[side] || side;
    }
}
