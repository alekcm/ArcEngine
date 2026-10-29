// dice.js — the big die in the middle of the screen (real 3D: yellow D12 for noise, red D10 for combat).
import * as Snd from './sound.js';
//
// Two situations show it:
//   * the engine asks the acting player to roll (prompt.kind === 'dice'): everyone sees the die,
//     the acting player clicks it;
//   * a roll result arrived (view.lastRoll.n changed): the die tumbles for a moment on every
//     screen and then lands with the result face toward the camera.
// The dice are Babylon meshes on a small transparent canvas: a dodecahedron (12 faces) and a
// pentagonal trapezohedron (10 kite faces). Every face carries a label plane with its symbol.
const B = () => window.BABYLON;

// Face sets in the order they are printed on the dice (Nemesis Redux values).
const NOISE_FACES = ['1', '1', '2', '2', '3', '3', '4', '4', 'silence', 'danger', 'encounter', 'encounter'];
const COMBAT_FACES = ['crit', '2', '3', '3', '4', '4', '5', '5', '5', '6'];
// The Battle Suit's printed Blue Combat die: two 2s, three 3s, two 4s, one 5, one 6 and a Critical.
const BLUE_FACES = ['crit', '2', '2', '3', '3', '3', '4', '4', '5', '6'];
const ROLL_MS = 1400, SHOW_MS = 2000;
const CANVAS = 240;

function faceText(v) {
    if (v === 'crit') return 'КРИТ';
    if (v === 'silence') return 'Тишина';
    if (v === 'danger') return 'Опасность';
    if (v === 'encounter') return 'Встреча';
    return String(v);
}
/** Short glyph printed on the die face. */
function faceGlyph(v) {
    if (v === 'crit') return '☠';
    if (v === 'silence') return '';
    if (v === 'danger') return '!';
    if (v === 'encounter') return '☠';
    return String(v);
}
function dieTitle(die) { return die === 'noise' ? 'Кубик шума' : die === 'blue' ? 'Синий боевой кубик' : 'Боевой кубик'; }

/** The yaw (about the die's long axis) that points a face normal at the camera. */
function yawToShowFace(normal) { return Math.PI - Math.atan2(normal.x, normal.z); }
function positiveAngle(angle) { const turn = Math.PI * 2; return (angle % turn + turn) % turn; }

/** Build the attack D10 as ten explicit kite faces. Each face carries its own geometry and texture,
 *  rather than discovering planes from a combined mesh and floating a separate number over them. */
export function d10Faces(kind = 'combat') {
    const Bx = B(), R = 1, y0 = 0.105;
    const H = y0 * (Math.cos(Math.PI / 5) + 1) / (1 - Math.cos(Math.PI / 5));
    const upper = [], lower = [];
    for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2, b = a + Math.PI / 5;
        upper.push(new Bx.Vector3(R * Math.cos(a), y0, R * Math.sin(a)));
        lower.push(new Bx.Vector3(R * Math.cos(b), -y0, R * Math.sin(b)));
    }

    const faces = [];
    const addFace = vertices => {
        const center = vertices.reduce((sum, v) => sum.add(v), Bx.Vector3.Zero()).scale(1 / vertices.length);
        const normal = Bx.Vector3.Cross(vertices[1].subtract(vertices[0]), vertices[2].subtract(vertices[0])).normalize();
        if (Bx.Vector3.Dot(normal, center) < 0) normal.scaleInPlace(-1);
        const upHint = Math.abs(normal.y) > 0.92 ? new Bx.Vector3(0, 0, 1) : new Bx.Vector3(0, 1, 0);
        const right = Bx.Vector3.Cross(normal, upHint).normalize();
        const up = Bx.Vector3.Cross(right, normal).normalize();
        let inradius = Infinity;
        for (let i = 0; i < vertices.length; i++) {
            const midpoint = vertices[i].add(vertices[(i + 1) % vertices.length]).scale(0.5);
            inradius = Math.min(inradius, midpoint.subtract(center).length());
        }
        faces.push({ vertices, center, normal, right, up, inradius });
    };

    for (let k = 0; k < 5; k++) {
        const k1 = (k + 1) % 5, k4 = (k + 4) % 5;
        addFace([new Bx.Vector3(0, H, 0), upper[k], lower[k], upper[k1]]);
        addFace([new Bx.Vector3(0, -H, 0), lower[k], upper[k], lower[k4]]);
    }

    // Attach values around the long axis, not in triangle-emission order. Keep the first (critical)
    // face as the anchor so its established result pose does not jump to another side of the die.
    const first = faces[0];
    faces.sort((a, b) => positiveAngle(yawToShowFace(a.normal)) - positiveAngle(yawToShowFace(b.normal)));
    const anchor = faces.indexOf(first);
    const ordered = anchor > 0 ? faces.slice(anchor).concat(faces.slice(0, anchor)) : faces;
    const values = kind === 'blue' ? BLUE_FACES : COMBAT_FACES;
    return ordered.map((face, i) => ({ ...face, value: values[i % values.length] }));
}

/** Geometry for one printed kite face. UVs use the same upright tangent frame as a flat label,
 *  but the label is rasterized into the face material itself and cannot drift independently. */
export function d10FaceVertexData(face) {
    const Bx = B(), labelSize = face.inradius * 1.7;
    const positions = [], normals = [], uvs = [];
    for (const vertex of face.vertices) {
        positions.push(vertex.x, vertex.y, vertex.z);
        normals.push(face.normal.x, face.normal.y, face.normal.z);
        const offset = vertex.subtract(face.center);
        uvs.push(0.5 + Bx.Vector3.Dot(offset, face.right) / labelSize,
                 0.5 - Bx.Vector3.Dot(offset, face.up) / labelSize);
    }
    const winding = Bx.Vector3.Cross(face.vertices[1].subtract(face.vertices[0]), face.vertices[2].subtract(face.vertices[0]));
    const indices = Bx.Vector3.Dot(winding, face.normal) >= 0
        ? [0, 1, 2, 0, 2, 3]
        : [0, 2, 1, 0, 3, 2];
    const data = new (Bx.VertexData)();
    data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs;
    return data;
}

/** Group a flat-shaded mesh's triangles into planar faces: [{center, normal, right, inradius}]. */
export function extractFaces(mesh) {
    const P = mesh.getVerticesData(B().VertexBuffer.PositionKind), I = mesh.getIndices();
    const V = i => new (B().Vector3)(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const faces = [];
    for (let t = 0; t < I.length; t += 3) {
        const a = V(I[t]), b = V(I[t + 1]), c = V(I[t + 2]);
        const n = B().Vector3.Cross(b.subtract(a), c.subtract(a)).normalize();
        if (B().Vector3.Dot(n, a) < 0) n.scaleInPlace(-1);
        let f = faces.find(f => B().Vector3.Dot(f.normal, n) > 0.999);
        if (!f) { f = { normal: n, verts: [] }; faces.push(f); }
        for (const v of [a, b, c]) if (!f.verts.some(w => w.subtract(v).length() < 1e-4)) f.verts.push(v);
    }
    for (const f of faces) {
        f.center = f.verts.reduce((s, v) => s.add(v), B().Vector3.Zero()).scale(1 / f.verts.length);
        // order the vertices around the centre so "right" and the inradius are stable
        const ref = f.verts[0].subtract(f.center).normalize(), ref2 = B().Vector3.Cross(f.normal, ref);
        f.verts.sort((p, q) => Math.atan2(B().Vector3.Dot(p.subtract(f.center), ref2), B().Vector3.Dot(p.subtract(f.center), ref)) - Math.atan2(B().Vector3.Dot(q.subtract(f.center), ref2), B().Vector3.Dot(q.subtract(f.center), ref)));
        let inr = 1e9;
        for (let i = 0; i < f.verts.length; i++) { const m = f.verts[i].add(f.verts[(i + 1) % f.verts.length]).scale(0.5); inr = Math.min(inr, m.subtract(f.center).length()); }
        f.inradius = inr;
        // Label axes of the face. "Up" of the printed number is the world up projected onto the face
        // (the ship's forward axis on the top/bottom faces, where the world up lies in the face);
        // "right" follows from it. The old code took "right" from an arbitrary vertex, which tilted
        // the numbers, and crossed it with the normal in the other order — every face printed upside
        // down, which is what the mirrored-looking dice on the table were. The axis triple
        // (right, up, -normal) must stay a rotation: a mirrored basis would flip the glyphs.
        const upHint = Math.abs(f.normal.y) > 0.92 ? new (B().Vector3)(0, 0, 1) : new (B().Vector3)(0, 1, 0);
        f.right = B().Vector3.Cross(f.normal, upHint).normalize();
        f.up = B().Vector3.Cross(f.right, f.normal).normalize();
    }
    return faces;
}

export class DiceUI {
    constructor(el, onRoll) {
        this.el = el; this.onRoll = onRoll;
        this.lastSeen = null; this.rolling = false; this.pendingResult = null; this.hideTimer = null;
        el.innerHTML = '<div class="dice-title"></div><div class="dice-stage"><canvas class="dice-canvas" width="' + CANVAS + '" height="' + CANVAS + '"></canvas></div><div class="dice-hint"></div>';
        this.canvas = el.querySelector('.dice-canvas'); this.title = el.querySelector('.dice-title'); this.hint = el.querySelector('.dice-hint');
        this.canvas.onclick = () => { if (this.clickable) { this.clickable = false; this.startSpin(); this.onRoll(); } };
        this.die = 'noise'; this.anim = null;
        this.init3d();
    }

    init3d() {
        if (!B()) return;
        const engine = new (B().Engine)(this.canvas, true, { alpha: true, premultipliedAlpha: false, antialias: true });
        const scene = new (B().Scene)(engine); scene.clearColor = new (B().Color4)(0, 0, 0, 0); scene.autoClear = true;
        const cam = new (B().FreeCamera)('dc', new (B().Vector3)(0, 0, -4.6), scene); cam.setTarget(B().Vector3.Zero()); cam.fov = 0.6;
        const h = new (B().HemisphericLight)('dh', new (B().Vector3)(0.3, 1, -0.6), scene); h.intensity = 0.8; h.groundColor = new (B().Color3)(0.25, 0.2, 0.2);
        const d = new (B().DirectionalLight)('dd', new (B().Vector3)(-0.5, -1, 0.7), scene); d.intensity = 0.8;
        this.engine = engine; this.scene = scene;
        this.dice = { noise: this.makeDie(scene, 'noise'), combat: this.makeDie(scene, 'combat'), blue: this.makeDie(scene, 'blue') };
        this.dice.combat.root.setEnabled(false); this.dice.blue.root.setEnabled(false);
        this.t = 0;
        engine.runRenderLoop(() => { if (this.el.classList.contains('hidden')) return; this.t += engine.getDeltaTime() / 1000; this.tick(); scene.render(); });
    }

    /** Build the noise D12 with the existing face-overlay renderer; attack D10s are rebuilt as
     *  ten textured face meshes so body and numerals are literally the same surfaces. */
    makeDie(scene, kind) {
        const root = new (B().TransformNode)('die_' + kind, scene);
        if (kind !== 'noise') return this.makeAttackDie(scene, kind, root);

        const body = B().MeshBuilder.CreatePolyhedron('d12', { type: 2, size: 0.62 }, scene);
        body.convertToFlatShadedMesh(); body.parent = root;
        const mat = new (B().StandardMaterial)('dm_noise', scene);
        mat.diffuseColor = B().Color3.FromHexString('#e6b422'); mat.specularColor = new (B().Color3)(0.5, 0.5, 0.5); mat.specularPower = 32;
        body.material = mat;
        const faces = extractFaces(body);
        faces.forEach((f, i) => {
            f.value = NOISE_FACES[i % NOISE_FACES.length];
            const size = f.inradius * 1.7;
            const plane = B().MeshBuilder.CreatePlane('noise_lbl', { width: size, height: size }, scene);
            const dt = new (B().DynamicTexture)('noise_ldt', { width: 128, height: 128 }, scene, true); dt.hasAlpha = true;
            const ctx = dt.getContext(); ctx.clearRect(0, 0, 128, 128);
            const glyph = faceGlyph(f.value);
            ctx.fillStyle = '#1b1b1b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            if (f.value === 'danger') { ctx.fillStyle = '#7a1010'; ctx.font = 'bold 96px Arial'; }
            else if (f.value === 'encounter') ctx.font = 'bold 84px Arial';
            else ctx.font = 'bold 86px Arial';
            if (glyph) ctx.fillText(glyph, 64, 70);
            if (/^[69]$/.test(glyph)) ctx.fillRect(44, 112, 40, 6);
            dt.update();
            const labelMaterial = new (B().StandardMaterial)('noise_lm', scene);
            labelMaterial.diffuseTexture = dt; labelMaterial.opacityTexture = dt;
            labelMaterial.emissiveColor = new (B().Color3)(0.35, 0.35, 0.35);
            labelMaterial.specularColor = B().Color3.Black(); labelMaterial.backFaceCulling = true;
            plane.material = labelMaterial; plane.parent = root; plane.isPickable = false;
            plane.position = f.center.add(f.normal.scale(0.004));
            const m = B().Matrix.Identity();
            B().Matrix.FromXYZAxesToRef(f.right, f.up, f.normal.scale(-1), m);
            plane.rotationQuaternion = B().Quaternion.FromRotationMatrix(m);
        });
        root.rotationQuaternion = B().Quaternion.Identity();
        return { root, body, faces };
    }

    /** The combat D10 is made from ten individually textured kite surfaces. There are no detached
     *  glyph planes: every symbol is baked into the same face mesh that carries the red die body. */
    makeAttackDie(scene, kind, root) {
        const body = new (B().TransformNode)('d10_body_' + kind, scene);
        body.parent = root; body.scaling.setAll(0.95);
        const faces = d10Faces(kind);
        const baseColor = kind === 'blue' ? '#1d6fb8' : '#b8262c';
        faces.forEach((face, i) => {
            const mesh = new (B().Mesh)('d10_face_' + i, scene);
            d10FaceVertexData(face).applyToMesh(mesh);
            mesh.parent = body; mesh.isPickable = false;

            const texture = new (B().DynamicTexture)('d10_face_texture_' + i, { width: 128, height: 128 }, scene, true);
            texture.wrapU = B().Texture.CLAMP_ADDRESSMODE; texture.wrapV = B().Texture.CLAMP_ADDRESSMODE;
            const ctx = texture.getContext();
            ctx.fillStyle = baseColor; ctx.fillRect(0, 0, 128, 128);
            const glyph = faceGlyph(face.value);
            ctx.fillStyle = '#f7f2ea'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            if (face.value === 'crit') ctx.font = 'bold 84px Arial';
            else ctx.font = 'bold 86px Arial';
            if (glyph) ctx.fillText(glyph, 64, 70);
            if (/^[69]$/.test(glyph)) ctx.fillRect(44, 112, 40, 6);
            texture.update();

            const material = new (B().StandardMaterial)('d10_face_material_' + i, scene);
            material.diffuseTexture = texture; material.diffuseColor = B().Color3.White();
            material.specularColor = new (B().Color3)(0.5, 0.5, 0.5); material.specularPower = 32;
            material.backFaceCulling = true;
            mesh.material = material;
            face.mesh = mesh;
        });
        root.rotationQuaternion = B().Quaternion.Identity();
        return { root, body, faces };
    }

    /** Called on every state update. `opts.title` lets the client rename the die (an unexplored room
     *  must stay "???" until its tile has been turned over). */
    update(view, me, playerName, opts) {
        const pr = view.prompt;
        const roll = view.lastRoll;
        if (this.lastSeen === null) this.lastSeen = roll ? roll.n : 0;   // nothing to replay on (re)connect
        if (roll && roll.n !== this.lastSeen) {
            this.lastSeen = roll.n;
            this.showResult(roll, playerName(roll.player));
        }
        const dicePrompt = pr && pr.kind === 'dice';
        if (dicePrompt && !this.rolling) {
            this.clearHide();
            const mine = !pr.waiting && pr.player === me;
            this.setDie(pr.die);
            this.title.textContent = (opts && opts.title) || pr.title || dieTitle(pr.die);
            this.hint.textContent = mine ? 'Нажмите на кубик, чтобы бросить' : playerName(pr.player) + ' бросает ' + dieTitle(pr.die).toLowerCase() + '…';
            this.el.classList.toggle('mine', mine); this.clickable = mine;
            this.idle = true; this.anim = null;
            this.show();
        } else if (!dicePrompt && !this.rolling && !this.hideTimer) this.hide();
    }

    setDie(die) {
        this.die = die; this.el.classList.toggle('combat', die === 'combat'); this.el.classList.toggle('noise', die === 'noise');
        this.el.classList.toggle('blue', die === 'blue');
        if (this.dice) for (const k of ['noise', 'combat', 'blue']) this.dice[k].root.setEnabled(die === k);
    }
    cur() { return this.dice ? this.dice[this.die] : null; }
    show() { this.el.classList.remove('hidden'); if (this.engine) this.engine.resize(); }
    hide() { this.el.classList.add('hidden'); this.el.classList.remove('mine', 'landed'); this.clickable = false; }
    clearHide() { if (this.hideTimer) { clearTimeout(this.hideTimer); this.hideTimer = null; } }

    /** Present the chosen face square-on to the camera, with its printed up axis vertical. The
     *  D10's long body axis is allowed to lean naturally; forcing it upright was the pose that kept
     *  producing the same narrow, top-heavy view. */
    targetFor(f) {
        const Bx = B();
        const m = Bx.Matrix.Identity();
        Bx.Matrix.FromXYZAxesToRef(f.right, f.up, f.normal.scale(-1), m);
        return Bx.Quaternion.FromRotationMatrix(m.transpose());
    }

    startSpin() {
        this.rolling = true; this.clearHide(); Snd.play('dice');
        this.el.classList.remove('landed'); this.el.classList.add('spinning');
        this.show();
        this.hint.textContent = 'Бросок…';
        const d = this.cur();
        this.idle = false;
        this.anim = { t0: this.t, from: d ? d.root.rotationQuaternion.clone() : null, to: null, axis: new (B().Vector3)(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), turns: 3 + Math.random() * 2 };
        setTimeout(() => this.finishSpin(), ROLL_MS);
    }
    finishSpin() {
        this.el.classList.remove('spinning');
        this.rolling = false;
        if (this.pendingResult) { const r = this.pendingResult; this.pendingResult = null; this.land(r.roll, r.who); }
        else this.hint.textContent = 'Ждём результат…';
    }
    /** A result arrived: if the actor's own spin is running, land when it ends; otherwise spin first. */
    showResult(roll, who) {
        if (this.rolling) { this.pendingResult = { roll, who }; return; }
        this.setDie(roll.die);
        this.title.textContent = dieTitle(roll.die) + (who ? ' — ' + who : '');
        this.pendingResult = { roll, who };
        this.startSpin();
    }
    land(roll, who) {
        this.setDie(roll.die);
        const d = this.cur();
        if (d) {
            const f = d.faces.find(f => f.value === String(roll.value)) || d.faces[0];
            d.root.rotationQuaternion = this.targetFor(f);
        }
        this.anim = null; this.idle = false;
        this.title.textContent = dieTitle(roll.die) + (who ? ' — ' + who : '');
        this.hint.textContent = 'Результат: ' + faceText(roll.value);
        Snd.play('diceLand');
        this.el.classList.add('landed');
        this.clearHide();
        this.hideTimer = setTimeout(() => { this.hideTimer = null; this.hide(); if (this.afterHide) this.afterHide(); }, SHOW_MS);
        if (this.onLanded) setTimeout(() => this.onLanded(), 500);
    }

    /** Per-frame: idle wobble, tumbling spin that settles on the pending result. */
    tick() {
        const d = this.cur(); if (!d) return;
        const Q = B().Quaternion;
        if (this.anim) {
            const a = this.anim, p = Math.min(1, (this.t - a.t0) / (ROLL_MS / 1000));
            const e = 1 - Math.pow(1 - p, 3);
            // settle target: the pending result face if known, else keep tumbling toward a random pose
            if (!a.to && this.pendingResult) { const f = d.faces.find(f => f.value === String(this.pendingResult.roll.value)) || d.faces[0]; a.to = this.targetFor(f); }
            const base = a.to ? Q.Slerp(a.from, a.to, e) : a.from;
            const spin = Q.RotationAxis(a.axis, (1 - e) * a.turns * Math.PI * 2);
            d.root.rotationQuaternion = spin.multiply(base);
            d.root.position.y = Math.abs(Math.sin(p * Math.PI * 2.5)) * (1 - p) * 0.5;
            d.root.scaling.setAll(1 + 0.25 * Math.sin(p * Math.PI));
            if (p >= 1 && !a.to) { a.from = d.root.rotationQuaternion.clone(); a.t0 = this.t; a.turns = 0.5; }   // waiting for the server: keep drifting slowly
        } else if (this.idle) {
            // Keep both combat D10s standing on their long axis while they idle; the D12 may still
            // wobble in pitch and roll. The actual roll animation above continues to tumble freely.
            const pitch = this.die === 'noise' ? Math.sin(this.t * 0.7) * 0.5 : 0;
            const roll = this.die === 'noise' ? 0.3 : 0;
            d.root.rotationQuaternion = Q.RotationYawPitchRoll(this.t * 0.9, pitch, roll);
            d.root.position.y = Math.sin(this.t * 2) * 0.05; d.root.scaling.setAll(1);
        } else { d.root.position.y = 0; d.root.scaling.setAll(1.1); }
    }
}
