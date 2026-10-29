// _stub3d.mjs — the headless BABYLON stub shared by the door tests and the door preview.
// It records every mesh the corridor builder creates (name, size, position, material), which is
// how a test — or tools/door-map.mjs — answers "what is really on that door?" without a browser.
const meshes = [];
let uid = 0;
class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setAll(v) { this.x = this.y = this.z = v; return this; }
    clone() { return new V3(this.x, this.y, this.z); }
    addInPlace(o) { this.x += o.x; this.y += o.y; this.z += o.z; return this; }
    add(o) { return new V3(this.x + o.x, this.y + o.y, this.z + o.z); }
    subtract(o) { return new V3(this.x - o.x, this.y - o.y, this.z - o.z); }
    scale(k) { return new V3(this.x * k, this.y * k, this.z * k); }
    length() { return Math.hypot(this.x, this.y, this.z); }
    normalize() { const l = this.length() || 1; return new V3(this.x / l, this.y / l, this.z / l); }
    dot(o) { return this.x * o.x + this.y * o.y + this.z * o.z; }
    static Dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    static Lerp(a, b, t) { return new V3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); }
    static Cross(a, b) { return new V3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
    static Zero() { return new V3(); }
    static Up() { return new V3(0, 1, 0); }
}
const mat = (hex, emissive) => ({ hex, emissive, uniqueId: ++uid, alpha: 1, scale: null, dispose() {}, freeze() {}, unfreeze() {} });
const allNodes = [];
const node = (name) => ({ name, position: new V3(), rotation: new V3(), scaling: new V3(1, 1, 1), parent: null,
    enabled: true, dispose() {}, setEnabled(v) { this.enabled = v !== false; }, isEnabled() { return this.enabled; },
    computeWorldMatrix() {}, bakeCurrentTransformIntoVertices() {} });
const mesh = (name, opts) => {
    const m = Object.assign(node(name), { opts: opts || {}, material: null, isPickable: true,
        convertToFlatShadedMesh() { return this; } });
    meshes.push(m); return m;
};
/** A 2D context stub that records what the stencil actually paints. */
function makeCtx(rec) {
    const state = { fillStyle: '#000', strokeStyle: '#000', shadowBlur: 0, font: '', textAlign: '', textBaseline: '', lineWidth: 1, lineJoin: 'miter' };
    const ctx = {
        clearRect() { rec.length = 0; },
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {},
        fill() {}, stroke() {},
        measureText(t) { return { width: String(t).length * 34 }; },
        fillText(t, x, y) {
            const px = /(\d+)px/.exec(state.font);
            rec.push({ kind: 'fill', text: String(t), fill: state.fillStyle, stroke: null, blur: state.shadowBlur, size: px ? Number(px[1]) : 0, x, y });
        },
        strokeText(t, x, y) {
            const px = /(\d+)px/.exec(state.font);
            rec.push({ kind: 'stroke', text: String(t), fill: null, stroke: state.strokeStyle, width: state.lineWidth, blur: state.shadowBlur, size: px ? Number(px[1]) : 0, x, y });
        },
    };
    for (const k of Object.keys(state)) {
        Object.defineProperty(ctx, k, { get: () => state[k], set: v => { state[k] = v; } });
    }
    return ctx;
}
class DynamicTexture {
    constructor(name, opts) {
        this.name = name; this.width = opts.width; this.height = opts.height; this.rec = [];
        this.ctx = makeCtx(this.rec); this.updates = 0;
    }
    getContext() { return this.ctx; }
    update() { this.updates++; }
    dispose() {}
}
class C3 {
    constructor(r = 0, g = 0, b = 0) { this.r = r; this.g = g; this.b = b; }
    scale(k) { return new C3(this.r * k, this.g * k, this.b * k); }
}
const fromHex = (hex) => {
    const s = String(hex).replace(/^#/, '');
    const n = Number.parseInt(s, 16);
    return new C3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.document = { createElement: () => ({ getContext: () => null }) };
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true }); } catch { /* already defined */ }
globalThis.window = {
    BABYLON: {
        MeshBuilder: {
            CreateBox: (n, o) => mesh(n, o), CreateSphere: (n, o) => mesh(n, o), CreateCylinder: (n, o) => mesh(n, o),
            CreateTorus: (n, o) => mesh(n, o), CreatePolyhedron: (n, o) => mesh(n, o), CreateDisc: (n, o) => mesh(n, o),
            CreatePlane: (n, o) => mesh(n, o), CreateGround: (n, o) => mesh(n, o),
        },
        TransformNode: class { constructor(name) { Object.assign(this, node(name)); allNodes.push(this); } },
        Vector3: V3,
        Mesh: { MergeMeshes: (arr) => arr[0], BILLBOARDMODE_ALL: 7 },
        DynamicTexture,
        StandardMaterial: class {
            constructor(name) {
                this.name = name; this.uniqueId = ++uid; this.diffuseTexture = null; this.disableLighting = false;
                this.emissiveColor = { r: 0, g: 0, b: 0, scale: () => ({}) };
                this.diffuseColor = null; this.specularColor = { scale: () => ({}) };
            }
            dispose() {} freeze() {}
        },
        Color3: Object.assign(C3, {
            FromHexString: fromHex,
            Black: () => new C3(0, 0, 0),
        }),
        Color4: class {},
    },
};

export { meshes, allNodes, V3, mat, node, mesh, makeCtx };
