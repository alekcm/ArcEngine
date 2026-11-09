// FSWarpStorms.js — warp storms as borders between two system tiles.
//
// A storm never belongs to one tile. It lies on one grid edge: H(row,col) is
// the horizontal border above tile (row,col), V(row,col) is the vertical border
// left of it. An outer border has one neighbouring tile and null on the other
// side. Movement is always a shift from THAT edge, never a new position
// computed from the tile a client happened to click. The board view asks this
// same object for the world coordinates, so the token is drawn between tiles.

/** One canonical edge of the system grid. */
class WarpStormEdge {
    static DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

    /** @param {'H'|'V'} kind @param {number} row @param {number} col */
    constructor(kind, row, col) {
        this.kind = kind === 'V' ? 'V' : 'H';
        this.row = Number(row);
        this.col = Number(col);
    }

    /** A value may be an edge, a storm record, a target or a legacy ref. */
    static from(value) {
        if (value instanceof WarpStormEdge) return value;
        if (!value || typeof value !== 'object') return null;
        if (value.edge) return WarpStormEdge.from(value.edge);
        if ((value.kind === 'H' || value.kind === 'V')
            && Number.isFinite(value.row) && Number.isFinite(value.col)) {
            return new WarpStormEdge(value.kind, value.row, value.col);
        }
        return null;
    }

    /** The edge named by one side of a tile. */
    static fromSystemSide(sys, side) {
        if (!sys) return null;
        const row = Number(sys.row), col = Number(sys.col);
        if (side === 'N') return new WarpStormEdge('H', row, col);
        if (side === 'S') return new WarpStormEdge('H', row + 1, col);
        if (side === 'W') return new WarpStormEdge('V', row, col);
        // Old saves and audit fixtures may omit the side. The legacy rules
        // engine treated such a record as the E side of the same tile.
        return new WarpStormEdge('V', row, col + 1);
    }

    key() { return this.kind + ':' + this.row + ':' + this.col; }

    equals(other) { return !!other && this.key() === other.key(); }

    toJSON() { return { kind: this.kind, row: this.row, col: this.col }; }

    /** The one or two systems separated by this border. */
    tileIds(state) {
        const systems = (state && state.systems) || [];
        const idAt = (row, col) => {
            const sys = systems.find(s => Number(s.row) === row && Number(s.col) === col);
            return sys ? sys.id : null;
        };
        return this.kind === 'H'
            ? [idAt(this.row - 1, this.col), idAt(this.row, this.col)]
            : [idAt(this.row, this.col - 1), idAt(this.row, this.col)];
    }

    /** An edge is legal while at least one tile touches it. */
    exists(state) {
        const [a, b] = this.tileIds(state);
        return a !== null || b !== null;
    }

    /**
     * A new edge relative to the storm's CURRENT edge. A straight move slides
     * along the grid or turns around a corner; a diagonal does both. No tile
     * centre is involved in this calculation.
     * @param {string} dir
     */
    shift(dir) {
        const d = String(dir || '').toUpperCase();
        if (!WarpStormEdge.DIRECTIONS.includes(d)) return null;
        const r = this.row, c = this.col;
        if (this.kind === 'H') {
            if (d === 'N') return new WarpStormEdge('H', r - 1, c);
            if (d === 'S') return new WarpStormEdge('H', r + 1, c);
            if (d === 'E') return new WarpStormEdge('V', r, c + 1);
            if (d === 'W') return new WarpStormEdge('V', r, c);
            const dr = d[0] === 'N' ? -1 : 1;
            const dc = d[1] === 'E' ? 1 : 0;
            return new WarpStormEdge('V', r + dr, c + dc);
        }
        if (d === 'E') return new WarpStormEdge('V', r, c + 1);
        if (d === 'W') return new WarpStormEdge('V', r, c - 1);
        if (d === 'N') return new WarpStormEdge('H', r, c);
        if (d === 'S') return new WarpStormEdge('H', r + 1, c);
        const dr = d[0] === 'S' ? 1 : 0;
        const dc = d[1] === 'E' ? 1 : -1;
        return new WarpStormEdge('H', r + dr, c + dc);
    }

    /** A serialisable reference: the edge is primary, the tile side is an alias. */
    toRef(state, dir) {
        const [a, b] = this.tileIds(state);
        const systems = (state && state.systems) || [];
        const at = (row, col) => systems.find(s => Number(s.row) === row && Number(s.col) === col);
        let system = null, side = null;
        if (this.kind === 'H') {
            const below = at(this.row, this.col);
            const above = at(this.row - 1, this.col);
            if (below) { system = below.id; side = 'N'; }
            else if (above) { system = above.id; side = 'S'; }
        } else {
            const right = at(this.row, this.col);
            const left = at(this.row, this.col - 1);
            if (right) { system = right.id; side = 'W'; }
            else if (left) { system = left.id; side = 'E'; }
        }
        const ref = {
            edge: this.toJSON(), tiles: [a, b], a, b, system, side, key: this.key(),
        };
        if (dir) ref.dir = dir;
        return ref;
    }

    /** The centre of the border in the same world coordinates as the tiles. */
    center(metrics, tile) {
        const T = Number(tile) || 260;
        const m = metrics || {};
        const ox = Number(m.originX) || 0, oy = Number(m.originY) || 0;
        return this.kind === 'H'
            ? { x: ox + this.col * T, y: oy + (this.row - 0.5) * T, horizontal: true }
            : { x: ox + (this.col - 0.5) * T, y: oy + this.row * T, horizontal: false };
    }
}

/** The collection of storms on one board: placement, movement and geometry. */
class WarpStormField {
    constructor() {
        this.directions = WarpStormEdge.DIRECTIONS.slice();
    }

    /** Accept new records, legacy `{system,side}` records and target refs. */
    edgeOf(state, ref) {
        const direct = WarpStormEdge.from(ref);
        if (direct) return direct;
        if (!ref || !state || !state.systems) return null;
        if (ref.system) {
            const sys = state.systems.find(s => s.id === ref.system);
            // Missing/unknown side is the legacy E-side record of that tile.
            return WarpStormEdge.fromSystemSide(sys, ref.side);
        }
        if (ref.a || ref.b) {
            const A = state.systems.find(s => s.id === ref.a) || null;
            const B = state.systems.find(s => s.id === ref.b) || null;
            if (A && B) {
                const side = A.row === B.row ? (B.col > A.col ? 'E' : 'W')
                    : (B.row > A.row ? 'S' : 'N');
                return WarpStormEdge.fromSystemSide(A, side);
            }
        }
        return null;
    }

    keyOf(value) {
        const edge = WarpStormEdge.from(value);
        return edge ? edge.key() : '?';
    }

    keyOfRef(state, ref) {
        const edge = this.edgeOf(state, ref);
        return edge ? edge.key() : '?';
    }

    /** One canonical record: a storm stands between `a` and `b`. */
    record(state, original, edge) {
        const ref = edge.toRef(state);
        const base = original || {};
        return Object.assign({}, base, ref, {
            id: base.id,
            edge: edge.toJSON(),
            a: ref.a,
            b: ref.b,
            tiles: ref.tiles,
            moved: base.moved === true,
        });
    }

    /** Migrate old saves in place; aliases remain for old clients and tests. */
    normalize(state) {
        if (!state || !Array.isArray(state.storms)) return [];
        for (let i = 0; i < state.storms.length; i++) {
            const storm = state.storms[i];
            const edge = this.edgeOf(state, storm);
            // Keep the object identity: the UI and the audit may already hold
            // a reference to this storm while the canonical fields are added.
            if (edge) Object.assign(storm, this.record(state, storm, edge));
        }
        return state.storms;
    }

    create(state, id, edgeLike) {
        const edge = edgeLike instanceof WarpStormEdge ? edgeLike : this.edgeOf(state, edgeLike);
        return edge ? this.record(state, { id, moved: false }, edge) : null;
    }

    /** Move an existing storm record onto an edge, keeping its id and mark. */
    write(state, storm, edgeLike) {
        const edge = edgeLike instanceof WarpStormEdge ? edgeLike : this.edgeOf(state, edgeLike);
        if (!storm || !edge) return false;
        Object.assign(storm, this.record(state, storm, edge));
        return true;
    }

    /** Every legal border of the assembled board, each edge exactly once. */
    allEdges(state) {
        const seen = new Set();
        const out = [];
        for (const sys of (state && state.systems) || []) {
            const row = Number(sys.row), col = Number(sys.col);
            for (const edge of [new WarpStormEdge('H', row, col),
                new WarpStormEdge('H', row + 1, col),
                new WarpStormEdge('V', row, col),
                new WarpStormEdge('V', row, col + 1)]) {
                if (seen.has(edge.key()) || !edge.exists(state)) continue;
                seen.add(edge.key());
                out.push(edge);
            }
        }
        return out;
    }

    /** The borders still free for setup, as serialisable refs. */
    freeEdges(state) {
        const taken = new Set((state.storms || []).map(s => this.keyOfRef(state, s)));
        return this.allEdges(state).filter(e => !taken.has(e.key())).map(e => e.toRef(state));
    }

    /** The storm on the border between two systems, if there is one. */
    stormOn(state, aId, bId) {
        for (const storm of state.storms || []) {
            const edge = this.edgeOf(state, storm);
            if (!edge) continue;
            const [a, b] = edge.tileIds(state);
            if ((a === aId && b === bId) || (a === bId && b === aId)) return storm;
        }
        return null;
    }

    /** The destination of one storm, computed from its current edge. */
    target(state, storm, dir) {
        const edge = this.edgeOf(state, storm);
        if (!edge) return null;
        const next = edge.shift(dir);
        if (!next || !next.exists(state)) return null;
        return next.toRef(state, dir);
    }

    /** All legal moves of this refresh: card directions, occupancy, one move. */
    options(state, dirs) {
        const allowed = Array.isArray(dirs) && dirs.length ? dirs : this.directions;
        const taken = new Set((state.storms || []).map(s => this.keyOfRef(state, s)));
        const out = [];
        for (const storm of state.storms || []) {
            if (storm.moved === true) continue;
            const from = this.edgeOf(state, storm);
            if (!from) continue;
            for (const dir of allowed) {
                const next = from.shift(dir);
                if (!next || !next.exists(state)) continue;
                const key = next.key();
                if (key === from.key() || taken.has(key)) continue;
                out.push({ storm: storm.id, dir, target: next.toRef(state, dir) });
            }
        }
        return out;
    }

    /** World coordinates for the 3D view: never a tile centre plus an offset. */
    position(state, ref, metrics, tile) {
        const edge = this.edgeOf(state, ref);
        if (!edge) return null;
        const p = edge.center(metrics, tile);
        p.edge = edge.toJSON();
        p.key = edge.key();
        p.tiles = edge.tileIds(state);
        return p;
    }
}

const FS_WARP_STORMS = new WarpStormField();
