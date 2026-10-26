// Warcraft3RTS.js — original low-poly Warcraft III-inspired real-time strategy mission.
// Alliance economy, workers, construction, production queues, selection, formation orders,
// melee/ranged combat, Paladin abilities, Orc raids, fog-free minimap, and a clear victory goal.

class Warcraft3RTS {
    /** @param {{ location: Location3D, camera: CameraController, game: Game | Warcraft3RTS | null }} app */
    constructor(app) {
        this.app = app;
        this.loc = app.location;
        this.view = this.loc.view;
        this.cam = app.camera;
        this.ui = UI;
        this.canvas = World3D.canvas;
        this.scene = this.view.scene;
        this.n = Warcraft3Data.GRID_SIZE;
        this.cell = Warcraft3Data.CELL_SIZE;
        this.rng = this._makeRng(0x5eed31);
        this._nextId = 1;
        this.time = 0;
        this.realTime = 0;
        this.speed = 1;
        this.paused = false;
        this.ended = false;
        this.result = '';
        this.resources = { gold: 1150, lumber: 760, food: 0, foodCap: 10 };
        this.units = [];
        this.structures = [];
        this.trees = [];
        this.projectiles = [];
        this.effects = [];
        this.environment = [];
        this.selected = [];
        this.blocked = new Set();
        this.buildMode = '';
        this.abilityMode = '';
        this.toastTimer = 0;
        this.hudTimer = 0;
        this.aiTimer = 36;
        this.aiWave = 0;
        this.heroRespawn = 0;
        this.pointerDown = null;
        this._bound = null;
        this._lastMiniSync = 0;
        this._materials = new Map();
        this._minimapDots = new Map();
        this._healthVisibleTimer = 0;

        this.playerHall = null;
        this.enemyHall = null;
        this.paladin = null;
        this.blademaster = null;
        this.placementMesh = null;
        this.placementMaterial = null;
        this.selectionBox = this.ui.get('wc3SelectionBox');

        this._resetSimulation();
        this._createMap();
        this._createStartingBases();
        this._createNeutralSites();
        this._createForests();
        this._createRoads();
        this._createStartingArmies();
        this._createPlacementPreview();
        this._prepareCamera();
        this._bindUI();
        this._bindInput();
        this._syncHUD(true);
        this._syncMinimap(true);
        this.toast('АЛЬЯНС: крестьяне добывают золото и лес; ПКМ отдаёт приказ.\nЦель — разрушить Большой зал Орды. ЛКМ выбирает, протяжка выделяет.');
    }

    _makeRng(seed) {
        let s = seed >>> 0;
        return () => {
            s = (s + 0x6D2B79F5) >>> 0;
            let t = s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    _resetSimulation() {
        this._nextId = 1;
        this.time = 0;
        this.paused = false;
        this.ended = false;
        this.result = '';
        this.resources = { gold: 1150, lumber: 760, food: 0, foodCap: 10 };
        this.units = [];
        this.structures = [];
        this.trees = [];
        this.projectiles = [];
        this.effects = [];
        this.environment = [];
        this.selected = [];
        this.blocked = new Set();
        this.buildMode = '';
        this.abilityMode = '';
        this.aiTimer = 36;
        this.aiWave = 0;
        this.heroRespawn = 0;
        this.playerHall = null;
        this.enemyHall = null;
        this.paladin = null;
        this.blademaster = null;
    }

    _id(prefix) { return prefix + '_' + (this._nextId++); }

    _ground(x, y) { return this.loc.terrain.heightAt(x, y); }

    _material(hex, emissive, alpha) {
        const key = hex + '|' + (emissive ? 1 : 0) + '|' + (alpha == null ? 1 : alpha);
        if (this._materials.has(key)) return this._materials.get(key);
        const mat = new BABYLON.StandardMaterial('wc3_mat_' + key.replace(/[^a-z0-9]/gi, ''), this.scene);
        mat.diffuseColor = BABYLON.Color3.FromHexString(hex);
        mat.specularColor = new BABYLON.Color3(0.07, 0.07, 0.07);
        mat.specularPower = 12;
        mat.metadata = { toonGroup: 'prop' };
        if (emissive) {
            mat.emissiveColor = BABYLON.Color3.FromHexString(hex).scale(0.65);
            mat.disableLighting = true;
        }
        if (alpha != null && alpha < 1) {
            mat.alpha = alpha;
            mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
        }
        this._materials.set(key, mat);
        return mat;
    }

    _box(parent, name, x, y, z, w, h, d, color, opts) {
        const mesh = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
        if (parent) mesh.parent = parent;
        mesh.position.set(x, y, z);
        mesh.material = this._material(color, opts && opts.emissive, opts && opts.alpha);
        mesh.isPickable = !(opts && opts.unpickable);
        if (opts && opts.rotationY) mesh.rotation.y = opts.rotationY;
        if (opts && opts.rotationZ) mesh.rotation.z = opts.rotationZ;
        return mesh;
    }

    _cylinder(parent, name, x, y, z, height, diameter, color, sides, opts) {
        const mesh = BABYLON.MeshBuilder.CreateCylinder(name, {
            height, diameter, tessellation: sides || 7,
            diameterTop: opts && opts.diameterTop != null ? opts.diameterTop : diameter,
            diameterBottom: opts && opts.diameterBottom != null ? opts.diameterBottom : diameter,
        }, this.scene);
        if (parent) mesh.parent = parent;
        mesh.position.set(x, y, z);
        mesh.material = this._material(color, opts && opts.emissive, opts && opts.alpha);
        mesh.isPickable = !(opts && opts.unpickable);
        if (opts && opts.rotationX) mesh.rotation.x = opts.rotationX;
        if (opts && opts.rotationZ) mesh.rotation.z = opts.rotationZ;
        return mesh;
    }

    _sphere(parent, name, x, y, z, sx, sy, sz, color, opts) {
        const mesh = BABYLON.MeshBuilder.CreateSphere(name, { diameter: 1, segments: 5 }, this.scene);
        if (parent) mesh.parent = parent;
        mesh.position.set(x, y, z);
        mesh.scaling.set(sx, sy, sz);
        mesh.material = this._material(color, opts && opts.emissive, opts && opts.alpha);
        mesh.isPickable = !(opts && opts.unpickable);
        return mesh;
    }

    _tagEntity(root, entity, kind, opts) {
        root.metadata = Object.assign({}, root.metadata, { w3Entity: entity });
        if (root.getChildMeshes) {
            for (const part of root.getChildMeshes(false)) {
                part.metadata = Object.assign({}, part.metadata, { w3Entity: entity });
            }
        }
        World3D.addObject(this.view, root, kind, opts || {});
        return root;
    }

    _cellIndex(x, y) { return y * this.n + x; }

    _markCell(x, y, occupied) {
        if (x < 0 || y < 0 || x >= this.n || y >= this.n) return;
        const k = this._cellIndex(x, y);
        if (occupied) this.blocked.add(k);
        else this.blocked.delete(k);
    }

    _footprintCells(type, x, y) {
        const def = Warcraft3Data.BUILDINGS[type];
        const w = def ? def.footprint[0] : 1, h = def ? def.footprint[1] : 1;
        const c = Warcraft3Data.worldToCell(x, y);
        const left = c.x - Math.floor(w / 2), top = c.y - Math.floor(h / 2);
        const cells = [];
        for (let gy = top; gy < top + h; gy++) for (let gx = left; gx < left + w; gx++) cells.push({ x: gx, y: gy });
        return { left, top, w, h, cells };
    }

    _createMap() {
        // The main dirt road connects both strongholds through the contested gold mine.
        const patches = [
            { a: [690, 2350], b: [1536, 1536], width: 150 },
            { a: [1536, 1536], b: [2390, 700], width: 150 },
            { a: [690, 2350], b: [430, 2320], width: 112 },
            { a: [2390, 700], b: [2640, 650], width: 112 },
        ];
        for (const p of patches) {
            const dx = p.b[0] - p.a[0], dz = p.b[1] - p.a[1];
            const len = Math.hypot(dx, dz);
            const midX = (p.a[0] + p.b[0]) / 2, midY = (p.a[1] + p.b[1]) / 2;
            const road = BABYLON.MeshBuilder.CreateBox(this._id('dirt_road'), { width: len, height: 3, depth: p.width }, this.scene);
            road.position.set(midX, this._ground(midX, midY) + 1.8, midY);
            road.rotation.y = -Math.atan2(dz, dx);
            road.material = this._material('#987344');
            road.isPickable = false;
            this.environment.push(World3D.addObject(this.view, road, 'prop', { ink: false, outline: false, castShadow: false }));
            // A narrow worn track beside the main road adds a hand-painted Warcraft map feel.
            if (len > 450) {
                const track = BABYLON.MeshBuilder.CreateBox(this._id('road_wear'), { width: len * 0.96, height: 1.5, depth: p.width * 0.34 }, this.scene);
                track.position.set(midX, this._ground(midX, midY) + 3, midY);
                track.rotation.y = -Math.atan2(dz, dx);
                track.material = this._material('#b69a68');
                track.isPickable = false;
                this.environment.push(World3D.addObject(this.view, track, 'prop', { ink: false, outline: false, castShadow: false }));
            }
        }

        // A shallow blue stream and two little bridges break up the broad central meadow.
        const streamSegments = [
            { x: 1265, y: 1120, len: 540, angle: -0.63 },
            { x: 1650, y: 1370, len: 470, angle: -0.63 },
        ];
        for (const s of streamSegments) {
            const water = BABYLON.MeshBuilder.CreateBox(this._id('stream'), { width: s.len, height: 4, depth: 122 }, this.scene);
            water.position.set(s.x, this._ground(s.x, s.y) + 1, s.y);
            water.rotation.y = s.angle;
            water.material = this._material('#397f98', true, 0.82);
            water.isPickable = false;
            this.environment.push(World3D.addObject(this.view, water, 'prop', { ink: false, outline: false, castShadow: false }));
        }
        for (const [x, y, angle] of [[1270, 1115, -0.63], [1644, 1362, -0.63]]) {
            const bridge = BABYLON.MeshBuilder.CreateBox(this._id('bridge'), { width: 168, height: 12, depth: 150 }, this.scene);
            bridge.position.set(x, this._ground(x, y) + 9, y);
            bridge.rotation.y = angle;
            bridge.material = this._material('#765034');
            bridge.isPickable = false;
            this.environment.push(World3D.addObject(this.view, bridge, 'prop', { ink: false, outline: false, castShadow: true }));
        }
    }

    _createStartingBases() {
        this.playerHall = this._createStructure('townhall', 'alliance', 690, 2360, { complete: true, isMain: true });
        this._createStructure('barracks', 'alliance', 1150, 2460, { complete: true });
        this._createStructure('farm', 'alliance', 800, 1930, { complete: true });
        this._createStructure('farm', 'alliance', 1360, 2700, { complete: true });
        this._createStructure('altar', 'alliance', 460, 2650, { complete: true });
        this._createStructure('tower', 'alliance', 460, 2160, { complete: true });

        this.enemyHall = this._createStructure('greatHall', 'horde', 2385, 690, { complete: true, isMain: true });
        this._createStructure('orcBarracks', 'horde', 2050, 850, { complete: true });
        this._createStructure('orcBarracks', 'horde', 2510, 955, { complete: true, isWarMill: true });
        this._createStructure('tower', 'horde', 2760, 900, { complete: true, isOrcTower: true });
    }

    _createNeutralSites() {
        this._createStructure('goldMine', 'neutral', 430, 2320, { complete: true, goldRemaining: 12000 });
        this._createStructure('goldMine', 'neutral', 2640, 650, { complete: true, goldRemaining: 12000 });
        this._createStructure('goldMine', 'neutral', 1536, 1536, { complete: true, goldRemaining: 18000, contested: true });
        this._createSceneryRock(1120, 1750, 1.0);
        this._createSceneryRock(1970, 1260, 1.35);
        this._createSceneryRock(1390, 2040, 0.78);
        this._createSceneryRock(1830, 920, 1.1);
    }

    _createSceneryRock(x, y, scale) {
        const root = BABYLON.MeshBuilder.CreateSphere(this._id('fieldstone'), { diameter: 76, segments: 5 }, this.scene);
        root.scaling.set(1.4 * scale, 0.65 * scale, 1.0 * scale);
        root.position.set(x, this._ground(x, y) + 28 * scale, y);
        root.material = this._material('#797d72');
        root.isPickable = false;
        const cap = this._sphere(root, this._id('fieldstone_cap'), 0, 20 * scale, 16 * scale, 0.85 * scale, 0.52 * scale, 0.75 * scale, '#999681');
        cap.isPickable = false;
        this.environment.push(this._tagEntity(root, { id: this._id('rock'), kind: 'scenery' }, 'prop', { ink: false, outline: false, castShadow: true }));
    }

    _createStructure(type, team, x, y, opts) {
        const def = Warcraft3Data.BUILDINGS[type];
        const o = opts || {};
        const fp = this._footprintCells(type, x, y);
        const pos = { x: (fp.left + fp.w / 2) * this.cell, y: (fp.top + fp.h / 2) * this.cell };
        const b = {
            id: this._id(type), kind: 'building', type, name: def.name, team,
            x: pos.x, y: pos.y, w: fp.w, h: fp.h, cells: fp.cells,
            hp: def.hp, maxHp: def.hp, complete: o.complete !== false,
            progress: o.complete === false ? 0.05 : 1, isMain: !!o.isMain,
            queue: [], queueTimer: 0, goldRemaining: o.goldRemaining || 0,
            attack: def.attack || 0, range: def.range || 0, cooldown: def.cooldown || 0,
            rally: null, builderId: null, buildTime: def.buildTime || 0,
            healthTimer: 0, visual: null, healthBar: null,
            isOrcTower: !!o.isOrcTower, isWarMill: !!o.isWarMill, contested: !!o.contested,
        };
        for (const c of fp.cells) this._markCell(c.x, c.y, true);
        this.structures.push(b);
        b.visual = this._createBuildingVisual(b);
        b.healthBar = this._createHealthBar(b, type === 'goldMine' ? 88 : 96, this._buildingHeight(type) + 26);
        if (type === 'goldMine') {
            const dot = this._createMinimapDot(b);
            b.minimap = dot;
        }
        if (team === 'alliance' && b.complete && def.supply) this.resources.foodCap += def.supply;
        return b;
    }

    _buildingHeight(type) {
        if (type === 'tower') return 230;
        if (type === 'altar') return 190;
        if (type === 'goldMine') return 155;
        if (type === 'farm') return 140;
        if (type === 'barracks' || type === 'orcBarracks') return 165;
        return 210;
    }

    _buildingVisualPart(root, name, x, y, z, w, h, d, color, opts) {
        return this._box(root, name, x, y, z, w, h, d, color, opts);
    }

    _createBuildingVisual(b) {
        const x = b.x, y = b.y, ground = this._ground(x, y);
        const type = b.type, id = b.id;
        const dims = {
            townhall: [270, 18, 238], greatHall: [276, 20, 246],
            barracks: [210, 16, 192], orcBarracks: [210, 18, 195],
            farm: [144, 14, 134], tower: [105, 18, 105], altar: [190, 16, 178], goldMine: [196, 22, 176],
        }[type] || [160, 16, 150];
        const root = BABYLON.MeshBuilder.CreateBox(id + '_foundation', { width: dims[0], height: dims[1], depth: dims[2] }, this.scene);
        root.position.set(x, ground + dims[1] / 2, y);
        root.material = this._material(b.team === 'horde' ? '#5c4c3e' : '#777d7f');
        root.isPickable = true;

        if (!b.complete) {
            const progressH = Math.max(16, this._buildingHeight(type) * b.progress * 0.55);
            this._box(root, id + '_frame_a', -dims[0] * 0.36, progressH / 2 + 10, 0, 11, progressH, 11, '#9a7048');
            this._box(root, id + '_frame_b', dims[0] * 0.36, progressH / 2 + 10, 0, 11, progressH, 11, '#9a7048');
            this._box(root, id + '_frame_c', 0, progressH / 2 + 10, -dims[2] * 0.36, 11, progressH, 11, '#9a7048');
            this._box(root, id + '_frame_d', 0, progressH / 2 + 10, dims[2] * 0.36, 11, progressH, 11, '#9a7048');
            this._box(root, id + '_beam_a', 0, progressH + 16, 0, dims[0] * 0.78, 9, 10, '#9a7048');
            root.metadata = Object.assign({}, root.metadata, { w3Entity: b });
            if (root.getChildMeshes) for (const p of root.getChildMeshes(false)) p.metadata = Object.assign({}, p.metadata, { w3Entity: b });
            return World3D.addObject(this.view, root, 'prop', { ink: true, outline: true, castShadow: true });
        }

        if (type === 'townhall') {
            this._buildingVisualPart(root, id + '_stone', 0, 45, 0, 224, 82, 186, '#b7b4a7');
            this._buildingVisualPart(root, id + '_timber', 0, 53, 96, 72, 68, 16, '#65452b');
            this._buildingVisualPart(root, id + '_door', 0, 29, 106, 34, 48, 5, '#49301f');
            this._cylinder(root, id + '_hall_roof', 0, 116, 0, 76, 216, '#244e90', 5, { diameterTop: 8 });
            this._cylinder(root, id + '_roof_trim', 0, 80, 0, 8, 224, '#d3b45f', 5);
            this._box(root, id + '_banner', 0, 145, 109, 30, 48, 5, '#244fa1');
            this._box(root, id + '_banner_cross_v', 0, 147, 112, 5, 32, 2, '#e8d79a');
            this._box(root, id + '_banner_cross_h', 0, 147, 112, 20, 5, 2, '#e8d79a');
            for (const sx of [-92, 92]) {
                this._cylinder(root, id + '_watchtower_' + sx, sx, 66, 0, 124, 54, '#8b8d86', 6);
                this._cylinder(root, id + '_watchroof_' + sx, sx, 137, 0, 40, 68, '#203f75', 5, { diameterTop: 2 });
            }
        } else if (type === 'greatHall') {
            this._buildingVisualPart(root, id + '_hide', 0, 49, 0, 224, 86, 196, '#75533b');
            this._buildingVisualPart(root, id + '_darkdoor', 0, 27, 103, 62, 49, 5, '#281c19');
            this._box(root, id + '_roof', 0, 104, 0, 248, 25, 216, '#442d24');
            for (const sx of [-88, 88]) {
                this._cylinder(root, id + '_spike_' + sx, sx, 148, 0, 88, 23, '#ddd0a3', 5, { diameterTop: 0 });
                this._box(root, id + '_redcloth_' + sx, sx, 115, 112, 31, 55, 4, '#8c2b24');
            }
            this._box(root, id + '_warpaint', 0, 54, 104, 26, 14, 5, '#c45b32');
        } else if (type === 'barracks') {
            this._buildingVisualPart(root, id + '_wall', 0, 47, 0, 170, 74, 146, '#c2b69a');
            this._box(root, id + '_timber_a', -58, 51, 78, 16, 84, 10, '#67462c');
            this._box(root, id + '_timber_b', 58, 51, 78, 16, 84, 10, '#67462c');
            this._cylinder(root, id + '_blue_roof', 0, 100, 0, 72, 198, '#2b5797', 4, { diameterTop: 4 });
            this._box(root, id + '_sign', 0, 41, 91, 39, 45, 5, '#244fa1');
            this._box(root, id + '_sign_cross1', 0, 42, 95, 6, 30, 2, '#e7cf8a');
            this._box(root, id + '_sign_cross2', 0, 42, 95, 24, 6, 2, '#e7cf8a');
        } else if (type === 'orcBarracks') {
            this._buildingVisualPart(root, id + '_woodwall', 0, 42, 0, 174, 62, 150, '#583e30');
            this._cylinder(root, id + '_roof', 0, 86, 0, 76, 190, '#543127', 5, { diameterTop: 5 });
            this._box(root, id + '_door', 0, 27, 79, 56, 42, 5, '#291b1b');
            this._box(root, id + '_orc_emblem', 0, 62, 79, 42, 24, 4, '#a53c28');
            for (const sx of [-76, 76]) {
                this._cylinder(root, id + '_tusk_' + sx, sx, 96, 48, 62, 18, '#e3d1a4', 5, { diameterTop: 0 });
            }
            if (b.isWarMill) {
                this._cylinder(root, id + '_smokestack', 66, 112, -46, 94, 34, '#382f2b', 6, { diameterTop: 24 });
                this._sphere(root, id + '_smoke', 66, 169, -46, 0.48, 0.62, 0.48, '#88877f', { alpha: 0.55 });
            }
        } else if (type === 'farm') {
            const orc = b.team === 'horde';
            this._buildingVisualPart(root, id + '_barn', 0, 43, 0, 105, 68, 91, orc ? '#62442d' : '#b27b49');
            this._box(root, id + '_barn_door', 0, 27, 48, 34, 44, 5, '#46301e');
            this._cylinder(root, id + '_roof', 0, 94, 0, 58, 137, orc ? '#562d28' : '#9d4332', 4, { diameterTop: 2 });
            if (!orc) {
                this._cylinder(root, id + '_hay', 64, 23, -32, 35, 40, '#d6b35a', 6);
                this._box(root, id + '_blue_trim', 0, 67, 47, 116, 8, 8, '#315596');
            }
        } else if (type === 'tower') {
            const orc = b.team === 'horde' || b.isOrcTower;
            this._cylinder(root, id + '_shaft', 0, 101, 0, 198, 79, orc ? '#5f4939' : '#8a8b83', 8);
            this._cylinder(root, id + '_rim', 0, 177, 0, 18, 108, orc ? '#4d3327' : '#c1b99e', 8);
            this._cylinder(root, id + '_roof', 0, 219, 0, 67, 111, orc ? '#612e28' : '#315a99', 6, { diameterTop: 2 });
            this._box(root, id + '_window', 0, 114, 41, 22, 37, 4, '#302d2a');
            if (orc) {
                this._cylinder(root, id + '_spike', 0, 255, 0, 38, 17, '#e3d1a4', 5, { diameterTop: 0 });
            } else {
                this._box(root, id + '_flag', 0, 262, 1, 38, 25, 4, '#28509a');
            }
        } else if (type === 'altar') {
            this._cylinder(root, id + '_step1', 0, 14, 0, 18, 166, '#9a9b91', 8);
            this._cylinder(root, id + '_step2', 0, 29, 0, 16, 128, '#c4c0a9', 8);
            this._cylinder(root, id + '_obelisk', 0, 105, 0, 148, 62, '#436ca6', 6, { diameterTop: 5, emissive: true });
            this._sphere(root, id + '_light', 0, 189, 0, 0.38, 0.44, 0.38, '#dfc66a', { emissive: true });
            for (const sx of [-68, 68]) this._cylinder(root, id + '_torch_' + sx, sx, 62, 0, 62, 14, '#cabd99', 5);
        } else if (type === 'goldMine') {
            this._sphere(root, id + '_hill', 0, 47, 0, 1.08, 0.72, 0.95, '#665745');
            this._box(root, id + '_entrance', 0, 28, 73, 64, 47, 5, '#251f1c');
            this._cylinder(root, id + '_goldvein_a', -47, 57, 40, 48, 31, '#d7ab39', 5, { diameterTop: 0 });
            this._cylinder(root, id + '_goldvein_b', 48, 39, 51, 40, 27, '#f0c64d', 5, { diameterTop: 0 });
            this._cylinder(root, id + '_goldvein_c', 0, 82, -39, 37, 24, '#be8d29', 5, { diameterTop: 0 });
            this._box(root, id + '_woodbeam_a', -69, 29, 82, 11, 66, 11, '#543923');
            this._box(root, id + '_woodbeam_b', 69, 29, 82, 11, 66, 11, '#543923');
            this._box(root, id + '_woodbeam_c', 0, 62, 82, 148, 10, 11, '#543923');
        }

        root.metadata = Object.assign({}, root.metadata, { w3Entity: b });
        if (root.getChildMeshes) for (const p of root.getChildMeshes(false)) p.metadata = Object.assign({}, p.metadata, { w3Entity: b });
        return World3D.addObject(this.view, root, 'prop', { ink: true, outline: true, castShadow: true });
    }

    _createTree(x, y, idx) {
        const tree = {
            id: this._id('tree'), kind: 'tree', team: 'neutral', x, y,
            cell: Warcraft3Data.worldToCell(x, y), lumber: 520 + Math.floor(this.rng() * 180),
            maxLumber: 700, healthTimer: 0, visual: null,
        };
        const root = BABYLON.MeshBuilder.CreateCylinder(tree.id + '_trunk', { height: 66, diameterTop: 18, diameterBottom: 28, tessellation: 6 }, this.scene);
        root.position.set(x, this._ground(x, y) + 33, y);
        root.material = this._material(idx % 3 === 0 ? '#62452e' : '#755236');
        root.isPickable = true;
        const leaf1 = this._cylinder(root, tree.id + '_crown_a', 0, 58, 0, 95, 106, idx % 4 === 0 ? '#28563b' : '#326b42', 6, { diameterTop: 0 });
        const leaf2 = this._cylinder(root, tree.id + '_crown_b', 0, 112, 0, 79, 82, idx % 5 === 0 ? '#3e7a49' : '#397343', 6, { diameterTop: 0 });
        const leaf3 = this._cylinder(root, tree.id + '_crown_c', 0, 158, 0, 64, 58, '#4b8750', 6, { diameterTop: 0 });
        for (const p of [leaf1, leaf2, leaf3]) p.isPickable = true;
        tree.visual = this._tagEntity(root, tree, 'prop', { ink: false, outline: false, castShadow: false });
        this.trees.push(tree);
        this._markCell(tree.cell.x, tree.cell.y, true);
        return tree;
    }

    _createForests() {
        const clusters = [
            [400, 1970, 320, 255, 18], [1110, 2100, 260, 290, 15], [1080, 2680, 250, 180, 12],
            [2020, 890, 310, 230, 15], [2760, 1010, 225, 330, 14], [2210, 420, 300, 190, 11],
            [1120, 1300, 250, 240, 13], [1870, 1760, 300, 280, 16], [2880, 1980, 170, 430, 13],
            [220, 1060, 210, 360, 10], [780, 840, 220, 190, 9],
        ];
        let count = 0;
        for (const [cx, cy, rx, ry, desired] of clusters) {
            let made = 0, attempts = 0;
            while (made < desired && attempts < desired * 16) {
                attempts++;
                const x = cx + (this.rng() * 2 - 1) * rx;
                const y = cy + (this.rng() * 2 - 1) * ry;
                if (x < 75 || y < 75 || x > this.loc.width - 75 || y > this.loc.height - 75) continue;
                if (Math.hypot(x - 690, y - 2360) < 330 || Math.hypot(x - 2385, y - 690) < 350) continue;
                if (Math.hypot(x - 1536, y - 1536) < 240) continue;
                if (Math.hypot(x - 430, y - 2320) < 170 || Math.hypot(x - 2640, y - 650) < 170) continue;
                if (Math.abs(x + y - 3072) < 135) continue; // keep the road legible
                const c = Warcraft3Data.worldToCell(x, y);
                if (this.blocked.has(this._cellIndex(c.x, c.y))) continue;
                this._createTree(x, y, count++);
                made++;
            }
        }
        // Short, readable rows of trees act as natural landmarks near the outer ridges.
        const ridgeRows = [
            [185, 460, 10, 96], [2850, 2450, 8, 95], [1850, 280, 7, 105],
        ];
        for (const [sx, sy, n, dx] of ridgeRows) {
            for (let i = 0; i < n; i++) {
                const x = sx + dx * i, y = sy + (i % 2 ? 48 : -42);
                const c = Warcraft3Data.worldToCell(x, y);
                if (!this.blocked.has(this._cellIndex(c.x, c.y))) this._createTree(x, y, count++);
            }
        }
    }

    _createRoads() {
        // A small marker by the central mine: blue Alliance and red Horde supply banners.
        const markers = /** @type {[number, number, string][]} */ ([[1440, 1475, '#315fb2'], [1634, 1590, '#a33d31']]);
        for (const [x, y, color] of markers) {
            const pole = BABYLON.MeshBuilder.CreateCylinder(this._id('banner_pole'), { height: 104, diameter: 7, tessellation: 5 }, this.scene);
            pole.position.set(x, this._ground(x, y) + 52, y);
            pole.material = this._material('#55412c');
            pole.isPickable = false;
            this._box(pole, this._id('banner_cloth'), 18, 17, 0, 38, 32, 4, color);
            this.environment.push(World3D.addObject(this.view, pole, 'prop', { ink: false, outline: false, castShadow: false }));
        }
        // A few carved stones and camp braziers make the contested crossroads memorable.
        for (const [x, y] of [[1320, 1610], [1760, 1495], [1480, 1725], [1665, 1295]]) {
            const stump = BABYLON.MeshBuilder.CreateCylinder(this._id('road_stone'), { height: 36, diameterTop: 36, diameterBottom: 53, tessellation: 5 }, this.scene);
            stump.position.set(x, this._ground(x, y) + 18, y);
            stump.material = this._material('#867e69');
            stump.isPickable = false;
            this.environment.push(World3D.addObject(this.view, stump, 'prop', { ink: false, outline: false, castShadow: false }));
        }
    }

    _createStartingArmies() {
        this._createUnit('paladin', 'alliance', 850, 2320, { level: 1, selected: true });
        this._createUnit('peasant', 'alliance', 800, 2110);
        this._createUnit('peasant', 'alliance', 800, 2490);
        this._createUnit('peasant', 'alliance', 900, 2240);
        this._createUnit('footman', 'alliance', 920, 2590);
        this._createUnit('footman', 'alliance', 850, 2580);
        this._createUnit('footman', 'alliance', 720, 2090);
        this._createUnit('archer', 'alliance', 600, 2105);
        this._createUnit('archer', 'alliance', 1190, 2310);

        this._createUnit('blademaster', 'horde', 2170, 1030, { level: 1 });
        this._createUnit('grunt', 'horde', 1930, 860);
        this._createUnit('grunt', 'horde', 2320, 855);
        this._createUnit('grunt', 'horde', 2525, 810);
        this._createUnit('grunt', 'horde', 2250, 400);
        this._createUnit('headhunter', 'horde', 1880, 1030);
        this._createUnit('headhunter', 'horde', 2580, 410);
    }

    _createUnit(type, team, x, y, opts) {
        const def = Warcraft3Data.UNITS[type];
        if (!def) return null;
        const o = opts || {};
        const unit = {
            id: this._id(type), kind: 'unit', type, name: def.name, team,
            x, y, hp: def.hp, maxHp: def.hp, damage: def.damage,
            cooldownBase: def.cooldown, cooldown: this.rng() * 0.45,
            speed: def.speed, range: def.range, food: def.food, role: def.role,
            level: o.level || 1, xp: 0, mana: type === 'paladin' ? 100 : 0,
            order: 'idle', task: null, targetId: null, engageId: null,
            path: [], targetX: x, targetY: y, repath: 0,
            carry: 0, carryKind: '', gatherTimer: 0,
            attackTimer: 0, phase: this.rng() * Math.PI * 2,
            invulnerable: 0, holyCooldown: 0, shieldCooldown: 0,
            healthTimer: 0, visual: null, ring: null, healthBar: null,
            arms: [], legs: [], minimap: null,
        };
        if (team === 'alliance') this.resources.food += unit.food;
        unit.visual = this._createUnitVisual(unit);
        unit.ring = this._createSelectionRing(unit);
        unit.healthBar = this._createHealthBar(unit, type === 'paladin' || type === 'blademaster' ? 68 : 52,
            this._unitHeight(type) + 14);
        unit.minimap = this._createMinimapDot(unit);
        this.units.push(unit);
        if (type === 'paladin') this.paladin = unit;
        if (type === 'blademaster') this.blademaster = unit;
        if (o.selected) this._select([unit]);
        return unit;
    }

    _unitHeight(type) {
        return ({ peasant: 78, footman: 88, archer: 84, paladin: 116, grunt: 96, headhunter: 92, blademaster: 116 })[type] || 84;
    }

    _createUnitVisual(unit) {
        const id = unit.id;
        const isOrc = unit.team === 'horde';
        const isHero = unit.role === 'hero';
        const bodyW = isHero ? 38 : (isOrc ? 42 : 31);
        const bodyH = isHero ? 52 : (isOrc ? 47 : 38);
        const center = isHero ? 55 : (isOrc ? 48 : 40);
        const root = BABYLON.MeshBuilder.CreateBox(id + '_body', { width: bodyW, height: bodyH, depth: isOrc ? 28 : 22 }, this.scene);
        root.position.set(unit.x, this._ground(unit.x, unit.y) + center, unit.y);
        root.material = this._material(this._unitColors(unit.type).body);
        root.isPickable = true;
        const c = this._unitColors(unit.type);
        const small = unit.type === 'peasant' || unit.type === 'archer';
        const h = unit.type === 'peasant' ? 41 : unit.type === 'archer' ? 43 : unit.type === 'footman' ? 45 : unit.type === 'grunt' ? 49 : unit.type === 'headhunter' ? 46 : 56;

        // Belt/tabard and faction marks are deliberately bold so squads read at RTS zoom.
        this._box(root, id + '_tabard', 0, -4, isOrc ? 13 : 12, isOrc ? 25 : 17, 30, 3, c.cloth);
        this._box(root, id + '_belt', 0, -11, 0, bodyW * 0.82, 7, bodyH * 0.53, c.trim);
        if (isOrc) {
            this._box(root, id + '_shoulder_l', 25, 15, 1, 15, 18, 24, c.armor);
            this._box(root, id + '_shoulder_r', -25, 15, 1, 15, 18, 24, c.armor);
            this._box(root, id + '_loincloth', 0, -28, 11, 26, 19, 3, '#7c3028');
        } else if (unit.type === 'footman' || unit.type === 'paladin') {
            this._box(root, id + '_chestplate', 0, 1, 13, bodyW * 0.68, bodyH * 0.65, 3, c.armor);
            this._box(root, id + '_tabard_cross_v', 0, -3, 15, 4, 26, 2, c.trim);
            this._box(root, id + '_tabard_cross_h', 0, -2, 15, 13, 4, 2, c.trim);
            for (const sx of [-1, 1]) this._box(root, id + '_pauldron_' + sx, sx * (bodyW * 0.48), 15, 0, 13, 10, 21, c.trim);
        } else if (unit.type === 'archer') {
            this._box(root, id + '_cape', 0, 2, -14, 24, 37, 3, '#314e3f');
            this._box(root, id + '_quiver', 15, 14, -12, 9, 22, 12, '#765438');
        }

        // Head and a recognizable helmet, hood, headband or tusked Orc face.
        const head = this._sphere(root, id + '_head', 0, h, 0, 20, 22, 19, c.skin);
        if (isOrc) {
            this._box(root, id + '_brow', 0, h + 6, 9, 26, 9, 8, c.armor);
            this._cylinder(root, id + '_tusk_l', 8, h - 10, 13, 17, 7, '#eee1bd', 4, { diameterTop: 1 });
            this._cylinder(root, id + '_tusk_r', -8, h - 10, 13, 17, 7, '#eee1bd', 4, { diameterTop: 1 });
            this._box(root, id + '_eye_glow', 0, h + 1, 11, 12, 3, 2, '#f2a844', { emissive: true });
            if (unit.type === 'blademaster') {
                this._box(root, id + '_headband', 0, h + 10, 0, 27, 6, 23, '#a33b2e');
                this._cylinder(root, id + '_crest', 0, h + 23, -4, 28, 6, '#e0c44b', 4, { diameterTop: 0 });
            } else {
                this._cylinder(root, id + '_hair', 0, h + 17, -3, 23, 27, unit.type === 'headhunter' ? '#2d6f8a' : '#3a5636', 5, { diameterTop: 4 });
            }
        } else if (unit.type === 'peasant') {
            this._cylinder(root, id + '_cap_brim', 0, h + 10, 0, 5, 29, '#8a673d', 7);
            this._cylinder(root, id + '_cap', 0, h + 18, -2, 19, 22, '#c3a367', 6, { diameterTop: 4 });
            this._box(root, id + '_face', 0, h - 1, 10, 12, 7, 2, '#e2bc91');
        } else if (unit.type === 'archer') {
            this._cylinder(root, id + '_hood', 0, h + 7, -1, 18, 30, '#436e50', 6, { diameterTop: 12 });
            this._box(root, id + '_hood_face', 0, h, 11, 15, 11, 4, c.skin);
        } else {
            this._cylinder(root, id + '_helm', 0, h + 9, 0, 23, 27, c.armor, 6, { diameterTop: unit.type === 'paladin' ? 5 : 19 });
            this._box(root, id + '_visor', 0, h + 2, 12, 15, 5, 4, '#33383b');
            if (unit.type === 'paladin') {
                this._cylinder(root, id + '_crest', 0, h + 29, -3, 31, 11, '#d8b449', 5, { diameterTop: 0 });
                this._sphere(root, id + '_halo', 0, h + 36, -4, 0.33, 0.08, 0.25, '#f2d96c', { emissive: true });
            }
        }

        // Animated shoulders and legs: simple loops keep every soldier alive without skeleton assets.
        const armL = new BABYLON.TransformNode(id + '_arm_l_pivot', this.scene);
        armL.parent = root; armL.position.set(bodyW * 0.48, 9, 0);
        const armR = new BABYLON.TransformNode(id + '_arm_r_pivot', this.scene);
        armR.parent = root; armR.position.set(-bodyW * 0.48, 9, 0);
        this._box(armL, id + '_arm_l', 0, -12, 1, 10, 28, 12, c.body);
        this._box(armR, id + '_arm_r', 0, -12, 1, 10, 28, 12, c.body);
        const legL = new BABYLON.TransformNode(id + '_leg_l_pivot', this.scene);
        legL.parent = root; legL.position.set(9, -bodyH * 0.40, 0);
        const legR = new BABYLON.TransformNode(id + '_leg_r_pivot', this.scene);
        legR.parent = root; legR.position.set(-9, -bodyH * 0.40, 0);
        this._box(legL, id + '_leg_l', 0, -12, 0, 12, 28, 13, c.legs);
        this._box(legR, id + '_leg_r', 0, -12, 0, 12, 28, 13, c.legs);
        unit.arms = [armL, armR];
        unit.legs = [legL, legR];

        // Weapons / tools are separately colored and mounted to the hands.
        if (unit.type === 'peasant') {
            this._box(armR, id + '_tool_handle', -5, -22, 9, 4, 32, 4, '#6c482b');
            this._box(armR, id + '_tool_head', -5, -7, 10, 16, 8, 7, '#9da5a2');
        } else if (unit.type === 'archer' || unit.type === 'headhunter') {
            this._cylinder(armR, id + '_bow', -4, -11, 15, 44, 5, unit.type === 'headhunter' ? '#79613d' : '#9b7542', 5, { rotationX: Math.PI / 2 });
            this._box(armR, id + '_arrow', 1, -3, 15, 3, 31, 3, '#d3c18d');
        } else {
            this._box(armR, id + '_sword_grip', -4, -21, 11, 5, 13, 5, '#553a27');
            this._box(armR, id + '_sword_guard', -4, -14, 11, 18, 4, 5, c.trim);
            this._box(armR, id + '_sword_blade', -4, -1, 12, unit.type === 'blademaster' ? 10 : 7, 28, 4,
                unit.type === 'blademaster' ? '#d8d8c8' : c.weapon);
            if (unit.type === 'footman' || unit.type === 'paladin') {
                this._box(armL, id + '_shield', 3, -12, 12, 7, 33, 25, c.cloth);
                this._box(armL, id + '_shield_cross_v', 3, -12, 26, 3, 21, 2, c.trim);
                this._box(armL, id + '_shield_cross_h', 3, -11, 26, 14, 3, 2, c.trim);
            }
            if (unit.type === 'paladin') {
                this._box(armR, id + '_hammer_head', -4, 5, 13, 24, 14, 18, '#d6c48e');
                this._box(armR, id + '_hammer_gem', -4, 5, 23, 8, 8, 3, '#7ec4db', { emissive: true });
            }
            if (unit.type === 'grunt') {
                this._box(armR, id + '_axe_head', -5, 5, 14, 20, 20, 8, '#555859');
                this._box(armR, id + '_axe_edge', -5, 6, 19, 14, 13, 3, '#c0b8a4');
            }
        }

        if (unit.type === 'paladin') {
            this._box(root, id + '_cape', 0, 3, -18, 29, 43, 4, '#234984');
            this._box(root, id + '_cape_trim', 0, -17, -20, 25, 5, 3, '#d8b449');
        }
        this._tagEntity(root, unit, 'actor', { ink: true, outline: true, castShadow: true });
        return root;
    }

    _unitColors(type) {
        const colors = {
            peasant: { body: '#947246', cloth: '#44649a', trim: '#d7bd75', armor: '#7d684c', skin: '#d9ad82', legs: '#5b4835', weapon: '#8c8a7a' },
            footman: { body: '#9da5a8', cloth: '#28509a', trim: '#d4b965', armor: '#c5c7c0', skin: '#d9b28e', legs: '#596471', weapon: '#d5d8d6' },
            archer: { body: '#58764d', cloth: '#2d5797', trim: '#c6aa63', armor: '#6b7c69', skin: '#d9ad82', legs: '#504f3e', weapon: '#a18552' },
            paladin: { body: '#d2cba7', cloth: '#244d96', trim: '#efd36b', armor: '#e5d99c', skin: '#ebc49f', legs: '#b9ad84', weapon: '#ddd8c2' },
            grunt: { body: '#4f8150', cloth: '#a3422d', trim: '#d5ae56', armor: '#554a3c', skin: '#649859', legs: '#43382d', weapon: '#aaa797' },
            headhunter: { body: '#4a805a', cloth: '#286d86', trim: '#d2b354', armor: '#62523b', skin: '#6e9b63', legs: '#3a463e', weapon: '#d6c18e' },
            blademaster: { body: '#477949', cloth: '#8e3427', trim: '#ddbd59', armor: '#52483a', skin: '#69a15b', legs: '#342e29', weapon: '#e0ded2' },
        };
        return colors[type] || colors.footman;
    }

    _createSelectionRing(unit) {
        const ring = BABYLON.MeshBuilder.CreateTorus(unit.id + '_selection_ring', { diameter: unit.role === 'hero' ? 86 : 64, thickness: 3, tessellation: 28 }, this.scene);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(unit.x, this._ground(unit.x, unit.y) + 2.4, unit.y);
        ring.material = this._material(unit.team === 'alliance' ? '#62d9ff' : '#ff5c48', true, 0.86);
        ring.isPickable = false;
        ring.renderingGroupId = World3D.LAYER.ACTOR;
        ring.setEnabled(false);
        return ring;
    }

    _createHealthBar(entity, width, heightOffset) {
        const root = new BABYLON.TransformNode(entity.id + '_health_root', this.scene);
        const bg = BABYLON.MeshBuilder.CreateBox(entity.id + '_health_bg', { width, height: 6, depth: 3 }, this.scene);
        bg.parent = root;
        bg.material = this._material('#2b2523', true, 0.96);
        bg.isPickable = false;
        const fill = BABYLON.MeshBuilder.CreateBox(entity.id + '_health_fill', { width, height: 4, depth: 4 }, this.scene);
        fill.parent = root;
        fill.material = this._material(entity.team === 'horde' ? '#d84836' : '#63c85d', true, 1);
        fill.isPickable = false;
        root.position.set(entity.x, this._ground(entity.x, entity.y) + heightOffset, entity.y);
        root.setEnabled(false);
        return { root, bg, fill, width, heightOffset };
    }

    _updateHealthBar(entity) {
        const bar = entity.healthBar;
        if (!bar || !bar.root || bar.root.isDisposed()) return;
        const ratio = entity.maxHp > 0 ? entity.hp / entity.maxHp : 1;
        const pct = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 1;
        bar.root.position.set(entity.x, this._ground(entity.x, entity.y) + bar.heightOffset, entity.y);
        bar.fill.scaling.x = Math.max(0.001, pct);
        bar.fill.position.x = -(bar.width * (1 - pct)) / 2;
        const visible = this.selected.includes(entity) || entity.healthTimer > 0 || (entity.kind === 'building' && !entity.complete);
        bar.root.setEnabled(visible && entity.hp > 0);
    }

    _createPlacementPreview() {
        const mesh = BABYLON.MeshBuilder.CreateBox('wc3_placement_preview', { width: 1, height: 2, depth: 1 }, this.scene);
        mesh.material = this._material('#48cf84', true, 0.35);
        mesh.isPickable = false;
        mesh.setEnabled(false);
        this.placementMesh = mesh;
        this.placementMaterial = mesh.material;
    }

    _prepareCamera() {
        this.cam.c.limits = 1;
        this.cam.setStrategyMode(true);
        // Warcraft RTS reserves LMB for unit selection and marquee; middle mouse still pans.
        this.cam.ignorePointer = (e) => e.button === 0;
        this.cam.setCustomBounds({ minX: 170, maxX: this.loc.width - 170, minY: 170, maxY: this.loc.height - 170 });
        this.cam.azimuth = -Math.PI * 0.25;
        this.cam.pitch = 57 * Math.PI / 180;
        this.cam.zoomTarget = 0.82;
        this.cam.zoom = 0.82;
        this.cam.zoomToCenter = false;
        this.cam.lookAt(835, 2320);
        this.cam.onHome = () => this.focusSelection();
    }

    _bindUI() {
        const bind = (id, fn) => { const e = this.ui.get(id); if (e) e.onClick(fn); };
        bind('wc3BuildBarracks', () => this.selectBuild('barracks'));
        bind('wc3BuildFarm', () => this.selectBuild('farm'));
        bind('wc3BuildTower', () => this.selectBuild('tower'));
        bind('wc3BuildAltar', () => this.selectBuild('altar'));
        bind('wc3TrainPeasant', () => this.train('peasant'));
        bind('wc3TrainFootman', () => this.train('footman'));
        bind('wc3TrainArcher', () => this.train('archer'));
        bind('wc3HeroLight', () => this.activateHolyLight());
        bind('wc3HeroShield', () => this.activateDivineShield());
        bind('wc3Pause', () => this.togglePause());
        bind('wc3Resume', () => this.togglePause());
        bind('wc3Reset', () => this.restart());
        bind('wc3ResultReset', () => this.restart());
        bind('wc3Menu', () => this.returnToMenu());
        bind('wc3ResultMenu', () => this.returnToMenu());
        bind('wc3Cancel', () => this.cancelMode());
    }

    _bindInput() {
        if (!this.canvas) return;
        const b = this._bound = {
            down: (e) => this._onPointerDown(e),
            move: (e) => this._onPointerMove(e),
            up: (e) => this._onPointerUp(e),
            key: (e) => this._onKeyDown(e),
        };
        this.canvas.addEventListener('pointerdown', b.down);
        this.canvas.addEventListener('pointermove', b.move);
        this.canvas.addEventListener('pointerup', b.up);
        this.canvas.addEventListener('pointercancel', b.up);
        window.addEventListener('keydown', b.key);
    }

    _onKeyDown(e) {
        const target = e.target;
        if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
        if (e.code === 'F10') { e.preventDefault(); this.returnToMenu(); return; }
        if (e.code === 'Escape') { this.cancelMode(); return; }
        if (this.ended) return;
        if (e.code === 'Space' && !e.repeat) { e.preventDefault(); this.togglePause(); return; }
        if (this.paused) return;
        if (e.code === 'KeyB') this.selectBuild('barracks');
        else if (e.code === 'KeyN') this.selectBuild('farm');
        else if (e.code === 'KeyT') this.selectBuild('tower');
        else if (e.code === 'KeyY') this.selectBuild('altar');
        else if (e.code === 'Digit1') this.train('peasant');
        else if (e.code === 'Digit2') this.train('footman');
        else if (e.code === 'Digit3') this.train('archer');
        else if (e.code === 'KeyG') this.activateHolyLight();
        else if (e.code === 'KeyV') this.activateDivineShield();
        else if (e.ctrlKey && e.code === 'KeyA') {
            e.preventDefault();
            this._select(this.units.filter(u => u.team === 'alliance' && u.role !== 'worker'));
        }
    }

    _onPointerDown(e) {
        if (this.paused || this.ended || (e.button !== 0 && e.button !== 2)) return;
        const p = this._canvasPoint(e);
        this.pointerDown = { x: p.x, y: p.y, clientX: e.clientX, clientY: e.clientY, pointerId: e.pointerId, button: e.button, shiftKey: !!e.shiftKey };
        if (e.button === 0) {
            try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
        }
    }

    _canvasPoint(e) {
        const r = this.canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    _onPointerMove(e) {
        const p = this._canvasPoint(e);
        if (this.pointerDown && this.pointerDown.pointerId === e.pointerId && !this.cam.isDragging()) {
            const dx = p.x - this.pointerDown.x, dy = p.y - this.pointerDown.y;
            if (Math.hypot(dx, dy) > 8) this._showSelectionBox(this.pointerDown.x, this.pointerDown.y, p.x, p.y);
        }
        if (this.cam.isDragging()) return;
        const hit = this.view.pointerToGround(p.x, p.y, 0, this.loc.terrain);
        if (!hit) return;
        if (this.buildMode) this._updatePlacementPreview(hit.x, hit.y);
        const entity = this._pickEntity(p.x, p.y);
        const hover = this.ui.get('wc3HoverTxt');
        if (hover) {
            if (this.buildMode) hover.setText(`Размещение: ${Warcraft3Data.BUILDINGS[this.buildMode].name} · ЛКМ — построить · Esc — отмена`);
            else if (entity && entity.kind === 'tree') hover.setText(`Лес · осталось ${Math.max(0, Math.floor(entity.lumber))} древесины · ПКМ крестьянином — рубить`);
            else if (entity && entity.kind === 'building' && entity.type === 'goldMine') hover.setText(`Золотая шахта · запас ${Math.max(0, Math.floor(entity.goldRemaining))} · ПКМ крестьянином — добывать`);
            else if (entity && entity.team === 'horde') hover.setText(`${entity.name} · ${Math.ceil(entity.hp)} / ${entity.maxHp} ОЗ · ПКМ — атаковать`);
            else if (entity && entity.team === 'alliance') hover.setText(`${entity.name} · ${Math.ceil(entity.hp)} / ${entity.maxHp} ОЗ · ЛКМ — выбрать`);
            else hover.setText('ЛКМ — выбрать / рамка · ПКМ — приказ · СКМ — панорама · колесо — зум · WASD — камера');
        }
    }

    _onPointerUp(e) {
        const down = this.pointerDown;
        if (!down || down.pointerId !== e.pointerId || down.button !== e.button) return;
        this.pointerDown = null;
        this._hideSelectionBox();
        const p = this._canvasPoint(e);
        const distance = Math.hypot(p.x - down.x, p.y - down.y);
        if (this.paused || this.ended) return;
        if (distance > 8) {
            if (down.button === 0 && !this.cam.isDragging() && !this.buildMode && !this.abilityMode) {
                this._selectUnitsInScreenBox(down.x, down.y, p.x, p.y, down.shiftKey);
            }
            return;
        }
        if (this.cam.isDragging()) return;
        const hit = this.view.pointerToGround(p.x, p.y, 0, this.loc.terrain);
        if (!hit) return;
        const entity = this._pickEntity(p.x, p.y);

        if (e.button === 2) {
            if (this.abilityMode) this.cancelMode();
            else this._issueOrder(entity, hit.x, hit.y);
            return;
        }
        if (e.button !== 0) return;
        if (this.abilityMode) {
            if (entity && entity.kind === 'unit' && entity.team === 'alliance') this._castHolyLight(entity);
            else this.toast('Выберите союзного бойца целью Света небес.');
            return;
        }
        if (this.buildMode) {
            this._placeBuildingAt(this.buildMode, hit.x, hit.y);
            return;
        }
        if (entity && entity.team === 'alliance' && (entity.kind === 'unit' || entity.kind === 'building')) {
            this._select([entity]);
        } else if (distance <= 8) {
            this._select([]);
        }
    }

    _pickEntity(px, py) {
        const pick = this.scene.pick(px, py, (mesh) => !!(mesh && mesh.isPickable && mesh.metadata && mesh.metadata.w3Entity));
        return pick && pick.hit && pick.pickedMesh && pick.pickedMesh.metadata
            ? pick.pickedMesh.metadata.w3Entity || null : null;
    }

    _showSelectionBox(x0, y0, x1, y1) {
        if (!this.selectionBox) return;
        const s = this.ui.scale();
        const d = this.selectionBox.def;
        d.x = Math.min(x0, x1) / s; d.y = Math.min(y0, y1) / s;
        d.w = Math.max(1, Math.abs(x1 - x0) / s); d.h = Math.max(1, Math.abs(y1 - y0) / s);
        this.selectionBox.show(true);
        this.selectionBox.apply();
    }

    _hideSelectionBox() { if (this.selectionBox) this.selectionBox.show(false); }

    _selectUnitsInScreenBox(x0, y0, x1, y1, append) {
        const left = Math.min(x0, x1), right = Math.max(x0, x1);
        const top = Math.min(y0, y1), bottom = Math.max(y0, y1);
        const found = this.units.filter(unit => {
            if (unit.team !== 'alliance' || unit.hp <= 0) return false;
            const center = unit.type === 'paladin' ? 55 : unit.type === 'blademaster' ? 55 : unit.type === 'grunt' || unit.type === 'headhunter' ? 48 : 40;
            const p = this.view.projectToScreen(unit.x, unit.y, this._ground(unit.x, unit.y) + center);
            return p.visible && p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
        });
        this._select(found, append);
    }

    _select(entities, append) {
        const list = append ? this.selected.concat(entities) : entities;
        this.selected = [...new Set(list)].filter(e => e && e.hp > 0 && e.team === 'alliance');
        for (const unit of this.units) {
            if (unit.ring) unit.ring.setEnabled(this.selected.includes(unit));
            this._updateHealthBar(unit);
        }
        for (const b of this.structures) this._updateHealthBar(b);
        this._syncHUD(true);
    }

    _issueOrder(entity, x, y) {
        this.buildMode = '';
        this.abilityMode = '';
        this._setPlacementVisible(false);
        if (!this.selected.length) { this.toast('Сначала выделите бойцов или здание.'); return; }

        const selectedBuildings = this.selected.filter(e => e.kind === 'building');
        if (selectedBuildings.length && !this.selected.some(e => e.kind === 'unit')) {
            for (const b of selectedBuildings) b.rally = { x, y };
            this.toast('Точка сбора установлена. Новобранцы выдвинутся туда после обучения.');
            return;
        }
        const units = this.selected.filter(e => e.kind === 'unit');
        if (!units.length) return;
        if (entity && entity.kind === 'tree' && entity.lumber > 0) {
            const workers = units.filter(u => u.role === 'worker');
            if (!workers.length) { this.toast('Рубить лес могут только крестьяне.'); return; }
            workers.forEach(u => this._orderHarvest(u, entity, 'lumber'));
            if (workers.length < units.length) this.toast('Рабочие рубят лес; остальные бойцы остались на месте.');
            return;
        }
        if (entity && entity.kind === 'building' && entity.type === 'goldMine' && entity.goldRemaining > 0) {
            const workers = units.filter(u => u.role === 'worker');
            if (!workers.length) { this.toast('Золото добывают только крестьяне.'); return; }
            workers.forEach(u => this._orderHarvest(u, entity, 'gold'));
            return;
        }
        if (entity && entity.team === 'horde') {
            units.forEach(u => this._orderAttack(u, entity));
            return;
        }
        if (entity && entity.team === 'alliance' && entity.kind === 'unit') {
            this.toast('Союзный отряд выбран.');
            return;
        }
        units.forEach((u, i) => {
            const col = (i % 3) - 1, row = Math.floor(i / 3) - (Math.ceil(units.length / 3) - 1) / 2;
            this._orderMove(u, x + col * 92, y + row * 92);
        });
    }

    _orderMove(unit, x, y) {
        unit.task = null;
        unit.targetId = null;
        unit.engageId = null;
        unit.order = 'move';
        unit.targetX = Math.max(70, Math.min(this.loc.width - 70, x));
        unit.targetY = Math.max(70, Math.min(this.loc.height - 70, y));
        unit.repath = 0;
        this._setPathToPoint(unit, unit.targetX, unit.targetY, 0);
    }

    _orderAttack(unit, target) {
        unit.task = null;
        unit.order = 'attack';
        unit.targetId = target.id;
        unit.engageId = null;
        unit.repath = 0;
        this._pathTowardEntity(unit, target);
    }

    _orderHarvest(unit, target, kind) {
        unit.order = 'harvest';
        unit.targetId = null;
        unit.engageId = null;
        unit.carry = 0;
        unit.carryKind = kind;
        unit.task = { type: kind, targetId: target.id, stage: 'toNode', timer: 0 };
        unit.repath = 0;
        this._setPathToPoint(unit, target.x, target.y, target.kind === 'tree' ? 90 : 175);
        this.toast(kind === 'gold' ? 'Крестьянин направляется в шахту.' : 'Крестьянин отправился за древесиной.');
    }

    _findEntity(id) {
        return this.units.find(u => u.id === id) || this.structures.find(b => b.id === id) || this.trees.find(t => t.id === id) || null;
    }

    _blockedFor(unit) {
        const blocked = new Set(this.blocked);
        for (const other of this.units) {
            if (other === unit || other.hp <= 0) continue;
            const c = Warcraft3Data.worldToCell(other.x, other.y);
            blocked.add(this._cellIndex(c.x, c.y));
        }
        return blocked;
    }

    _nearestOpenCell(goalX, goalY, maxR, unit) {
        const gx = Math.max(0, Math.min(this.n - 1, Math.floor(goalX / this.cell)));
        const gy = Math.max(0, Math.min(this.n - 1, Math.floor(goalY / this.cell)));
        const blocked = unit ? this._blockedFor(unit) : this.blocked;
        for (let r = 0; r <= maxR; r++) {
            const candidates = [];
            for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
                if (r && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                const x = gx + dx, y = gy + dy;
                if (x < 0 || y < 0 || x >= this.n || y >= this.n) continue;
                if (blocked.has(this._cellIndex(x, y))) continue;
                candidates.push({ x, y, score: (dx * dx + dy * dy) + this.rng() * 0.02 });
            }
            candidates.sort((a, b) => a.score - b.score);
            if (candidates.length) return candidates[0];
        }
        return null;
    }

    _findApproachCell(unit, targetX, targetY, wantedRange) {
        const start = Warcraft3Data.worldToCell(unit.x, unit.y);
        let dx = unit.x - targetX, dy = unit.y - targetY;
        let dist = Math.hypot(dx, dy);
        if (dist < 1) { dx = 1; dy = 0; dist = 1; }
        const desired = Math.max(30, wantedRange - 72);
        const aimX = targetX + dx / dist * desired;
        const aimY = targetY + dy / dist * desired;
        const blocked = this._blockedFor(unit);
        const aimCell = this._nearestOpenCell(aimX, aimY, 7, unit);
        if (aimCell) {
            const path = Warcraft3Data.findPath(this.n, blocked, start.x, start.y, aimCell.x, aimCell.y);
            if (path) return { p: Warcraft3Data.cellToWorld(aimCell.x, aimCell.y), path };
        }

        // If the straight approach is sealed, probe a few nearby cells around the target.
        const c = Warcraft3Data.worldToCell(aimX, aimY);
        for (let r = 1; r <= 3; r++) {
            const options = [];
            for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
                if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
                const gx = c.x + ox, gy = c.y + oy;
                if (gx < 0 || gy < 0 || gx >= this.n || gy >= this.n || blocked.has(this._cellIndex(gx, gy))) continue;
                const p = Warcraft3Data.cellToWorld(gx, gy);
                options.push({ x: gx, y: gy, p, score: Math.hypot(p.x - aimX, p.y - aimY) });
            }
            options.sort((a, b) => a.score - b.score);
            for (const option of options.slice(0, 5)) {
                const path = Warcraft3Data.findPath(this.n, blocked, start.x, start.y, option.x, option.y);
                if (path) return { p: option.p, path };
            }
        }
        return null;
    }

    _setPathToPoint(unit, x, y, arriveRange) {
        const start = Warcraft3Data.worldToCell(unit.x, unit.y);
        const blocked = this._blockedFor(unit);
        let target = this._nearestOpenCell(x, y, 7, unit);
        if (!target) { unit.path = []; return false; }
        if (arriveRange > 0) {
            const approach = this._findApproachCell(unit, x, y, arriveRange);
            if (approach) {
                unit.path = approach.path.map(c => Warcraft3Data.cellToWorld(c.x, c.y));
                if (!unit.path.length && Math.hypot(unit.x - x, unit.y - y) > arriveRange) unit.path = [approach.p];
                return true;
            }
        }
        let path = Warcraft3Data.findPath(this.n, blocked, start.x, start.y, target.x, target.y);
        if (!path) {
            target = this._nearestOpenCell(x, y, 12, unit);
            path = target ? Warcraft3Data.findPath(this.n, blocked, start.x, start.y, target.x, target.y) : null;
        }
        unit.path = path ? path.map(c => Warcraft3Data.cellToWorld(c.x, c.y)) : [];
        return !!path;
    }

    _pathTowardEntity(unit, target) {
        const targetRadius = target.kind === 'building' ? Math.max(target.w, target.h) * this.cell * 0.5 : target.kind === 'unit' ? 22 : 0;
        const range = (unit.range || 80) + targetRadius;
        this._setPathToPoint(unit, target.x, target.y, range);
        unit.repath = 0.9;
    }

    _advanceAlongPath(unit, dt) {
        if (!unit.path || !unit.path.length) return false;
        let budget = unit.speed * dt;
        while (budget > 0 && unit.path.length) {
            const p = unit.path[0], dx = p.x - unit.x, dy = p.y - unit.y;
            const d = Math.hypot(dx, dy);
            if (d < 4) { unit.x = p.x; unit.y = p.y; unit.path.shift(); continue; }
            const step = Math.min(budget, d);
            unit.x += dx / d * step; unit.y += dy / d * step;
            unit.visual.rotation.y = Math.atan2(dx, dy);
            budget -= step;
            break;
        }
        const moving = unit.path.length > 0;
        unit.visual.position.x = unit.x;
        unit.visual.position.z = unit.y;
        unit.visual.position.y = this._ground(unit.x, unit.y) + (unit.type === 'paladin' || unit.type === 'blademaster' ? 55 : unit.type === 'grunt' || unit.type === 'headhunter' ? 48 : 40);
        unit.phase += dt * (moving ? 11 : 2.2);
        const stride = moving ? Math.sin(unit.phase) * 0.46 : Math.sin(unit.phase) * 0.035;
        if (unit.legs[0]) { unit.legs[0].rotation.x = stride; unit.legs[1].rotation.x = -stride; }
        if (unit.arms[0]) {
            unit.arms[0].rotation.x = moving ? -stride * 0.8 : Math.sin(unit.phase * 0.6) * 0.025;
            unit.arms[1].rotation.x = moving ? stride * 0.8 : Math.sin(unit.phase * 0.6 + 1) * 0.025;
        }
        if (unit.ring) {
            unit.ring.position.x = unit.x;
            unit.ring.position.z = unit.y;
            unit.ring.position.y = this._ground(unit.x, unit.y) + 2.4;
        }
        if (unit.healthBar) this._updateHealthBar(unit);
        return moving;
    }

    _updateUnit(unit, dt) {
        if (unit.hp <= 0) return;
        unit.cooldown = Math.max(0, unit.cooldown - dt);
        unit.repath -= dt;
        unit.healthTimer = Math.max(0, unit.healthTimer - dt);
        unit.holyCooldown = Math.max(0, unit.holyCooldown - dt);
        unit.shieldCooldown = Math.max(0, unit.shieldCooldown - dt);
        unit.invulnerable = Math.max(0, unit.invulnerable - dt);
        if (unit.type === 'paladin') unit.mana = Math.min(100, unit.mana + dt * 0.75);

        if (unit.task) {
            this._updateWorkerTask(unit, dt);
        } else if (unit.order === 'attack') {
            const target = this._findEntity(unit.targetId);
            if (!target || target.hp <= 0 || target.team === unit.team) {
                unit.targetId = null; unit.order = 'idle'; unit.path = [];
            } else this._attackTarget(unit, target, dt);
        } else {
            if (unit.order === 'move' && !unit.engageId) {
                const nearby = this._nearestEnemy(unit, 190);
                if (nearby) unit.engageId = nearby.id;
            }
            let target = unit.engageId ? this._findEntity(unit.engageId) : null;
            if (!target || target.hp <= 0) {
                unit.engageId = null;
                if (unit.order === 'idle') target = this._nearestEnemy(unit, unit.role === 'hero' ? 315 : 220);
                else target = null;
                if (target) unit.engageId = target.id;
            }
            if (target && target.team !== unit.team) {
                this._attackTarget(unit, target, dt);
            }
        }

        this._advanceAlongPath(unit, dt);
        if (unit.healthBar) this._updateHealthBar(unit);
    }

    _nearestEnemy(unit, radius) {
        let best = null, bestD = radius;
        for (const other of this.units) {
            if (other.team === unit.team || other.hp <= 0) continue;
            const d = Math.hypot(other.x - unit.x, other.y - unit.y);
            if (d < bestD) { best = other; bestD = d; }
        }
        for (const b of this.structures) {
            if (b.team === unit.team || b.team === 'neutral' || b.hp <= 0 || b.type === 'goldMine') continue;
            const d = Math.max(0, Math.hypot(b.x - unit.x, b.y - unit.y) - 100);
            if (d < bestD) { best = b; bestD = d; }
        }
        return best;
    }

    _attackTarget(unit, target, dt) {
        const dx = target.x - unit.x, dy = target.y - unit.y;
        const dist = Math.hypot(dx, dy);
        const targetRadius = target.kind === 'building' ? Math.max(target.w, target.h) * this.cell * 0.5 : target.kind === 'unit' ? 22 : 0;
        const attackRange = (unit.range || 80) + targetRadius;
        if (dist > attackRange) {
            if (unit.repath <= 0 || !unit.path.length) this._pathTowardEntity(unit, target);
            return;
        }
        unit.path = [];
        unit.visual.rotation.y = Math.atan2(dx, dy);
        if (unit.cooldown > 0) return;
        const damage = Math.max(1, Math.round(unit.damage * (0.86 + this.rng() * 0.28)));
        unit.cooldown = unit.cooldownBase;
        unit.attackTimer = 0.28;
        if (unit.role === 'ranged' || (unit.kind === 'building' && unit.attack > 0)) {
            this._createProjectile(unit, target, unit.team === 'alliance' ? '#f1d483' : '#ee7447');
        } else this._createHitEffect(target.x, target.y, target.team === 'alliance' ? '#efc86f' : '#f47a59');
        this._applyDamage(target, damage, unit);
        if (unit.arms[1]) unit.arms[1].rotation.x = -0.85;
    }

    _updateWorkerTask(unit, dt) {
        const task = unit.task;
        const target = this._findEntity(task.targetId);
        if (task.type === 'build') {
            const building = this.structures.find(b => b.id === task.targetId);
            if (!building || building.complete || building.hp <= 0) { unit.task = null; unit.order = 'idle'; return; }
            const workRange = Math.max(135, Math.max(building.w, building.h) * this.cell * 0.5 + 105);
            if (Math.hypot(building.x - unit.x, building.y - unit.y) > workRange) {
                if (unit.repath <= 0 || !unit.path.length) {
                    this._setPathToPoint(unit, building.x, building.y, workRange - 18);
                    unit.repath = 0.8;
                }
                return;
            }
            unit.path = [];
            unit.visual.rotation.y = Math.atan2(building.x - unit.x, building.y - unit.y);
            building.progress = Math.min(1, building.progress + dt / Math.max(8, building.buildTime));
            if (Math.sin(this.time * 9) > 0.2 && unit.arms[1]) unit.arms[1].rotation.x = -0.9;
            if (building.progress >= 1) this._finishConstruction(building, unit);
            else if (Math.floor(building.progress * 10) > Math.floor((building.progress - dt / building.buildTime) * 10)) {
                this._rebuildBuildingVisual(building);
            }
            return;
        }

        if (!target || target.hp <= 0 || (task.type === 'gold' && target.goldRemaining <= 0) || (task.type === 'lumber' && target.lumber <= 0)) {
            if (unit.carry > 0) this._returnCargo(unit);
            unit.task = null; unit.order = 'idle'; unit.path = [];
            if (task.type === 'lumber') this.toast('Эта роща вырублена. Выберите другой участок леса.');
            else if (task.type === 'gold') this.toast('В шахте больше нет золота.');
            return;
        }

        if (task.stage === 'return') {
            const hall = this._nearestFriendlyHall(unit);
            if (!hall) { unit.task = null; return; }
            if (Math.hypot(hall.x - unit.x, hall.y - unit.y) <= 150) {
                this._returnCargo(unit);
                if (target.hp > 0 && (task.type === 'gold' ? target.goldRemaining : target.lumber) > 0) {
                    task.stage = 'toNode'; task.timer = 0; unit.repath = 0;
                    this._setPathToPoint(unit, target.x, target.y, task.type === 'gold' ? 185 : 90);
                } else { unit.task = null; unit.order = 'idle'; }
            } else if (unit.repath <= 0 || !unit.path.length) {
                this._setPathToPoint(unit, hall.x, hall.y, 140);
                unit.repath = 0.8;
            }
            return;
        }

        const arrival = task.type === 'gold' ? 185 : 90;
        if (Math.hypot(target.x - unit.x, target.y - unit.y) > arrival + 18) {
            if (unit.repath <= 0 || !unit.path.length) {
                this._setPathToPoint(unit, target.x, target.y, arrival);
                unit.repath = 0.75;
            }
            return;
        }
        unit.path = [];
        task.timer += dt;
        const period = task.type === 'gold' ? 2.8 : 2.4;
        if (task.timer >= period) {
            task.timer -= period;
            const amount = task.type === 'gold' ? 50 : 25;
            const carried = task.type === 'gold' ? 100 : 80;
            if (task.type === 'gold') target.goldRemaining = Math.max(0, target.goldRemaining - amount);
            else {
                target.lumber = Math.max(0, target.lumber - amount);
                if (target.lumber <= 0) this._fellTree(target);
            }
            unit.carry += amount;
            unit.carryKind = task.type;
            if (unit.carry >= carried || (task.type === 'lumber' && target.lumber <= 0) || (task.type === 'gold' && target.goldRemaining <= 0)) {
                task.stage = 'return'; task.timer = 0; unit.repath = 0;
                const hall = this._nearestFriendlyHall(unit);
                if (hall) this._setPathToPoint(unit, hall.x, hall.y, 140);
            }
        }
    }

    _nearestFriendlyHall(unit) {
        let best = null, dist = Infinity;
        for (const b of this.structures) {
            if (b.team !== 'alliance' || !b.complete || !['townhall', 'greatHall'].includes(b.type)) continue;
            const d = Math.hypot(b.x - unit.x, b.y - unit.y);
            if (d < dist) { dist = d; best = b; }
        }
        return best;
    }

    _returnCargo(unit) {
        if (unit.carry <= 0) return;
        if (unit.carryKind === 'gold') this.resources.gold += unit.carry;
        else this.resources.lumber += unit.carry;
        unit.carry = 0;
        this.sound('assets/sounds/gold.wav', unit.x, unit.y, 0.2);
        this._syncHUD(true);
    }

    _fellTree(tree) {
        if (!tree || tree.lumber > 0) return;
        this._markCell(tree.cell.x, tree.cell.y, false);
        this._removeEntityVisual(tree);
        this.trees = this.trees.filter(t => t !== tree);
        this._minimapDots.delete(tree.id);
        this.toast('Крестьянин свалил дерево. Участок освобождён для строительства.');
    }

    _finishConstruction(building, worker) {
        building.progress = 1;
        building.complete = true;
        building.builderId = null;
        if (worker && worker.task && worker.task.type === 'build' && worker.task.targetId === building.id) {
            worker.task = null; worker.order = 'idle'; worker.path = [];
        }
        const def = Warcraft3Data.BUILDINGS[building.type];
        if (def && def.supply && building.team === 'alliance') this.resources.foodCap += def.supply;
        this._rebuildBuildingVisual(building);
        this.sound('assets/sounds/gold.wav', building.x, building.y, 0.35);
        this.toast(`${building.name} завершено!`);
        this._syncHUD(true);
    }

    _rebuildBuildingVisual(building) {
        if (building.visual && !building.visual.isDisposed()) World3D.removeObject(this.view, building.visual);
        building.visual = this._createBuildingVisual(building);
    }

    _createProjectile(from, target, color) {
        const mesh = BABYLON.MeshBuilder.CreateSphere(this._id('bolt'), { diameter: from.role === 'ranged' ? 9 : 13, segments: 4 }, this.scene);
        mesh.material = this._material(color, true, 1);
        mesh.isPickable = false;
        mesh.position.set(from.x, this._ground(from.x, from.y) + (from.role === 'ranged' ? 72 : 135), from.y);
        this.projectiles.push({ mesh, targetId: target.id, fromX: from.x, fromY: from.y, t: 0, duration: 0.28 });
    }

    _createHitEffect(x, y, color) {
        const mesh = BABYLON.MeshBuilder.CreateSphere(this._id('hit'), { diameter: 20, segments: 4 }, this.scene);
        mesh.material = this._material(color, true, 0.7);
        mesh.isPickable = false;
        mesh.position.set(x, this._ground(x, y) + 42, y);
        this.effects.push({ mesh, t: 0, duration: 0.22, baseScale: 1 });
    }

    _updateVfx(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.t += dt;
            const target = this._findEntity(p.targetId);
            const t = Math.min(1, p.t / p.duration);
            const tx = target ? target.x : p.fromX, ty = target ? target.y : p.fromY;
            p.mesh.position.x = p.fromX + (tx - p.fromX) * t;
            p.mesh.position.z = p.fromY + (ty - p.fromY) * t;
            p.mesh.position.y = this._ground(p.mesh.position.x, p.mesh.position.z) + 70 + Math.sin(t * Math.PI) * 25;
            if (t >= 1) { p.mesh.dispose(); this.projectiles.splice(i, 1); }
        }
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const fx = this.effects[i]; fx.t += dt;
            const s = 1 + fx.t / fx.duration * 1.8;
            fx.mesh.scaling.set(s, s, s);
            fx.mesh.visibility = Math.max(0, 1 - fx.t / fx.duration);
            if (fx.t >= fx.duration) { fx.mesh.dispose(); this.effects.splice(i, 1); }
        }
    }

    _updateBuildings(dt) {
        for (const b of [...this.structures]) {
            if (b.hp <= 0) continue;
            b.healthTimer = Math.max(0, b.healthTimer - dt);
            if (!b.complete) {
                this._updateHealthBar(b);
                continue;
            }
            if (b.queue && b.queue.length && b.team === 'alliance') {
                const job = b.queue[0];
                const def = Warcraft3Data.UNITS[job.type];
                job.progress += dt / Math.max(5, def.trainTime);
                if (job.progress >= 1) {
                    b.queue.shift();
                    const point = this._spawnPoint(b);
                    const unit = this._createUnit(job.type, 'alliance', point.x, point.y);
                    if (b.rally) this._orderMove(unit, b.rally.x, b.rally.y);
                    this.toast(`${def.name} готов к службе.`);
                    this._syncHUD(true);
                }
            }
            if (b.attack > 0 && b.team !== 'neutral') this._updateTower(b, dt);
            this._updateHealthBar(b);
        }
    }

    _spawnPoint(b) {
        for (let r = 2; r < 7; r++) {
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
                const gx = Math.floor(b.x / this.cell) + dx * r, gy = Math.floor(b.y / this.cell) + dy * r;
                if (gx < 1 || gy < 1 || gx >= this.n - 1 || gy >= this.n - 1 || this.blocked.has(this._cellIndex(gx, gy))) continue;
                const p = Warcraft3Data.cellToWorld(gx, gy);
                if (!this._overlapsUnit(p.x, p.y, 32)) return p;
            }
        }
        return { x: b.x + b.w * this.cell * 0.7, y: b.y + b.h * this.cell * 0.7 };
    }

    _overlapsUnit(x, y, r) {
        return this.units.some(u => u.hp > 0 && Math.hypot(u.x - x, u.y - y) < r);
    }

    _updateTower(tower, dt) {
        tower.attackCooldown = Math.max(0, (tower.attackCooldown || 0) - dt);
        let target = null, dBest = tower.range;
        for (const u of this.units) {
            if (u.team === tower.team || u.hp <= 0) continue;
            const d = Math.hypot(u.x - tower.x, u.y - tower.y);
            if (d < dBest) { dBest = d; target = u; }
        }
        if (target && tower.attackCooldown <= 0) {
            tower.attackCooldown = tower.cooldown || 1.8;
            this._createProjectile(tower, target, tower.team === 'alliance' ? '#b9e0fb' : '#f2844f');
            this._applyDamage(target, tower.attack, tower);
        }
    }

    _updateEnemyAI(dt) {
        this.aiTimer -= dt;
        if (this.aiTimer > 0 || this.ended) return;
        this.aiWave++;
        this.aiTimer = Math.max(33, 58 - this.aiWave * 3);
        const barracks = this.structures.find(b => b.team === 'horde' && b.type === 'orcBarracks' && b.complete);
        if (!barracks) return;
        const target = this._nearestPlayerTarget(barracks.x, barracks.y);
        const wave = this.aiWave % 3 === 0
            ? [{ type: 'grunt', dx: 0, dy: 0 }, { type: 'grunt', dx: 78, dy: -50 }, { type: 'headhunter', dx: -72, dy: 55 }]
            : [{ type: 'grunt', dx: 0, dy: 0 }, { type: 'grunt', dx: 74, dy: 48 }];
        for (const item of wave) {
            const spawn = this._spawnPoint(barracks);
            const u = this._createUnit(item.type, 'horde', spawn.x + item.dx, spawn.y + item.dy);
            if (target) this._orderAttack(u, target);
        }
        this.sound('assets/sounds/horn.wav', barracks.x, barracks.y, 0.45);
        this.toast(`Орочья волна №${this.aiWave} выступила из лагеря!`);
    }

    _nearestPlayerTarget(x, y) {
        const options = this.units.filter(u => u.team === 'alliance' && u.hp > 0);
        options.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
        return options[0] || this.playerHall;
    }

    _applyDamage(target, amount, attacker) {
        if (!target || target.hp <= 0 || target.invulnerable > 0) return;
        target.hp = Math.max(0, target.hp - amount);
        target.healthTimer = 3.2;
        this._updateHealthBar(target);
        if (target.hp <= 0) this._killEntity(target, attacker);
    }

    _killEntity(target, attacker) {
        if (target.kind === 'unit') {
            if (target.team === 'alliance') this.resources.food = Math.max(0, this.resources.food - target.food);
            if (target === this.paladin) {
                this.paladin = null;
                this.heroRespawn = 35;
                this.toast('Паладин пал в бою! Он воскреснет у Алтаря через 35 секунд.');
            } else if (target === this.blademaster) this.blademaster = null;
            this._removeEntityVisual(target);
            this.units = this.units.filter(u => u !== target);
            this.selected = this.selected.filter(u => u !== target);
            if (attacker && attacker.team === 'alliance' && this.paladin && attacker.team === 'horde') this.paladin.xp += 50;
        } else if (target.kind === 'building') {
            if (target.isMain) {
                this._finishGame(target.team === 'horde' ? 'victory' : 'defeat');
                return;
            }
            for (const c of target.cells) this._markCell(c.x, c.y, false);
            if (target.team === 'alliance' && Warcraft3Data.BUILDINGS[target.type].supply) {
                this.resources.foodCap = Math.max(10, this.resources.foodCap - Warcraft3Data.BUILDINGS[target.type].supply);
            }
            this._removeStructure(target);
            this.toast(`${target.name} разрушено!`);
        }
        if (attacker && attacker.type === 'paladin') {
            attacker.xp += 30;
            const level = Math.min(5, 1 + Math.floor(attacker.xp / 260));
            if (level > attacker.level) {
                attacker.level = level;
                attacker.maxHp += 95;
                attacker.hp = Math.min(attacker.maxHp, attacker.hp + 145);
                attacker.damage += 5;
                this.toast(`Паладин достиг ${level}-го уровня! Его сила возросла.`);
            }
        }
        this._syncHUD(true);
    }

    _removeEntityVisual(e) {
        if (e.visual && !e.visual.isDisposed()) World3D.removeObject(this.view, e.visual);
        if (e.ring && !e.ring.isDisposed()) e.ring.dispose();
        if (e.healthBar && e.healthBar.root && !e.healthBar.root.isDisposed()) e.healthBar.root.dispose(false, false);
        const dot = this._minimapDots.get(e.id);
        if (dot) { this.ui.remove(dot.def.id); this._minimapDots.delete(e.id); }
    }

    _removeStructure(b) {
        this._removeEntityVisual(b);
        this.structures = this.structures.filter(x => x !== b);
    }

    _finishGame(result) {
        if (this.ended) return;
        this.ended = true;
        this.result = result;
        this.paused = true;
        const title = this.ui.get('wc3ResultTitle');
        const body = this.ui.get('wc3ResultBody');
        const dim = this.ui.get('wc3ResultDim');
        if (title) title.setText(result === 'victory' ? 'ПОБЕДА АЛЬЯНСА' : 'ПАЛ ЭЛВИННСКИЙ КРАЙ');
        if (body) body.setText(result === 'victory'
            ? 'Большой зал Орды разрушен. Азерот снова свободен!\nВаши крестьяне, лучники и пехота заслужили легенду.'
            : 'Ратуша уничтожена, но Альянс ещё может вернуться.\nНачните новую битву и измените ход войны.');
        if (dim) dim.show(true);
        this.sound('assets/sounds/horn.wav', this.playerHall ? this.playerHall.x : 1500, this.playerHall ? this.playerHall.y : 1500, 0.8);
    }

    selectBuild(type) {
        if (this.paused || this.ended) return;
        if (!['barracks', 'farm', 'tower', 'altar'].includes(type)) return;
        this.abilityMode = '';
        this.buildMode = type;
        this._setPlacementVisible(true);
        this.toast(`Выбрано строительство: ${Warcraft3Data.BUILDINGS[type].name}. Наведите мышь на свободное место и щёлкните ЛКМ.`);
        this._syncHUD(true);
    }

    _canPlace(type, x, y) {
        const def = Warcraft3Data.BUILDINGS[type];
        if (!def) return false;
        const fp = this._footprintCells(type, x, y);
        if (fp.left < 1 || fp.top < 1 || fp.left + fp.w >= this.n - 1 || fp.top + fp.h >= this.n - 1) return false;
        for (const c of fp.cells) if (this.blocked.has(this._cellIndex(c.x, c.y))) return false;
        // Keep a one-cell buffer around the new foundation so it cannot seal a narrow path.
        for (let gy = fp.top - 1; gy <= fp.top + fp.h; gy++) for (let gx = fp.left - 1; gx <= fp.left + fp.w; gx++) {
            if (gx < 0 || gy < 0 || gx >= this.n || gy >= this.n) continue;
            if (this.blocked.has(this._cellIndex(gx, gy))) return false;
        }
        return !!this.units.find(u => u.team === 'alliance' && u.role === 'worker' && u.hp > 0);
    }

    _updatePlacementPreview(x, y) {
        if (!this.buildMode || !this.placementMesh) return;
        const def = Warcraft3Data.BUILDINGS[this.buildMode];
        const valid = this._canPlace(this.buildMode, x, y) &&
            Warcraft3Data.canAfford(this.resources, def) && this.resources.foodCap >= this.resources.food;
        const fp = def.footprint;
        const c = Warcraft3Data.worldToCell(x, y);
        const left = c.x - Math.floor(fp[0] / 2), top = c.y - Math.floor(fp[1] / 2);
        const snappedX = (left + fp[0] / 2) * this.cell;
        const snappedY = (top + fp[1] / 2) * this.cell;
        this.placementMesh.scaling.set(fp[0] * this.cell, 1, fp[1] * this.cell);
        this.placementMesh.position.set(snappedX, this._ground(snappedX, snappedY) + 4, snappedY);
        const previewMaterial = /** @type {any} */ (this.placementMaterial);
        previewMaterial.diffuseColor = BABYLON.Color3.FromHexString(valid ? '#42d38a' : '#ed5353');
        previewMaterial.emissiveColor = BABYLON.Color3.FromHexString(valid ? '#42d38a' : '#ed5353').scale(0.45);
        this.placementMesh.setEnabled(true);
    }

    _setPlacementVisible(on) {
        if (this.placementMesh) this.placementMesh.setEnabled(!!on && !!this.buildMode);
    }

    _placeBuildingAt(type, x, y) {
        const def = Warcraft3Data.BUILDINGS[type];
        if (!Warcraft3Data.canAfford(this.resources, def)) { this.toast('Не хватает золота или древесины.'); return; }
        const worker = this._findBuilder(x, y);
        if (!worker) { this.toast('Для строительства нужен свободный крестьянин.'); return; }
        if (!this._canPlace(type, x, y)) { this.toast('Здесь нельзя строить: требуется свободная площадка и проход.'); return; }
        Warcraft3Data.pay(this.resources, def);
        const fp = this._footprintCells(type, x, y);
        const bx = (fp.left + fp.w / 2) * this.cell, by = (fp.top + fp.h / 2) * this.cell;
        const building = this._createStructure(type, 'alliance', bx, by, { complete: false });
        worker.order = 'move';
        worker.task = { type: 'build', targetId: building.id, stage: 'move' };
        worker.targetId = null;
        worker.repath = 0;
        building.builderId = worker.id;
        this.buildMode = '';
        this._setPlacementVisible(false);
        this.sound('assets/sounds/click.wav', bx, by, 0.35);
        this.toast(`Заложен фундамент: ${building.name}. Крестьянин уже строит.`);
        this._syncHUD(true);
    }

    _findBuilder(x, y) {
        const eligible = this.selected.filter(e => e.kind === 'unit' && e.role === 'worker');
        const workers = eligible.length ? eligible : this.units.filter(u => u.team === 'alliance' && u.role === 'worker' && u.hp > 0);
        let best = null, d0 = Infinity;
        for (const w of workers) {
            const d = Math.hypot(w.x - x, w.y - y);
            if (d < d0) { best = w; d0 = d; }
        }
        return best;
    }

    train(type) {
        if (this.paused || this.ended) return;
        const def = Warcraft3Data.UNITS[type];
        if (!def || !def.trainTime) return;
        const producerType = type === 'peasant' ? 'townhall' : 'barracks';
        const building = this.structures.find(b => b.team === 'alliance' && b.type === producerType && b.complete);
        if (!building) { this.toast(type === 'peasant' ? 'Нет действующей Ратуши.' : 'Сначала постройте и завершите Казармы.'); return; }
        if (this.resources.food + def.food > this.resources.foodCap) { this.toast('Не хватает продовольствия. Постройте Ферму.'); return; }
        if (!Warcraft3Data.pay(this.resources, def)) { this.toast('Недостаточно золота или древесины.'); return; }
        this.resources.food += def.food;
        building.queue.push({ type, progress: 0 });
        this.sound('assets/sounds/click.wav', building.x, building.y, 0.24);
        this.toast(`${def.name} добавлен в очередь ${building.name}.`);
        this._syncHUD(true);
    }

    activateHolyLight() {
        if (this.paused || this.ended) return;
        if (!this.paladin || this.paladin.hp <= 0) { this.toast('Паладин должен быть в бою, чтобы сотворить Свет небес.'); return; }
        if (this.paladin.holyCooldown > 0 || this.paladin.mana < 30) { this.toast('Свет небес ещё восстанавливается или не хватает маны.'); return; }
        this.buildMode = '';
        this._setPlacementVisible(false);
        this.abilityMode = 'holyLight';
        this.toast('Свет небес: щёлкните ЛКМ по союзному бойцу, чтобы восстановить здоровье.');
        this._syncHUD(true);
    }

    _castHolyLight(target) {
        const hero = this.paladin;
        if (!hero || !target || target.team !== 'alliance' || hero.mana < 30 || hero.holyCooldown > 0) return;
        if (Math.hypot(hero.x - target.x, hero.y - target.y) > 640) { this.toast('Цель слишком далеко от Паладина.'); return; }
        hero.mana -= 30;
        hero.holyCooldown = 19;
        target.hp = Math.min(target.maxHp, target.hp + 320);
        target.healthTimer = 3.5;
        this._updateHealthBar(target);
        this._createHolyEffect(target.x, target.y);
        this.sound('assets/sounds/magic.wav', target.x, target.y, 0.55);
        this.abilityMode = '';
        this.toast(`Свет небес исцелил ${target.name}.`);
        this._syncHUD(true);
    }

    activateDivineShield() {
        const hero = this.paladin;
        if (this.paused || this.ended) return;
        if (!hero || hero.hp <= 0) { this.toast('Паладин должен быть в бою, чтобы принять обет света.'); return; }
        if (hero.shieldCooldown > 0 || hero.mana < 45) { this.toast('Божественный щит ещё восстанавливается или не хватает маны.'); return; }
        hero.mana -= 45;
        hero.shieldCooldown = 38;
        hero.invulnerable = 5.5;
        this._createHolyEffect(hero.x, hero.y);
        this.sound('assets/sounds/magic.wav', hero.x, hero.y, 0.6);
        this.toast('Божественный щит: Паладин неуязвим 5,5 секунды!');
        this._syncHUD(true);
    }

    _createHolyEffect(x, y) {
        const ring = BABYLON.MeshBuilder.CreateTorus(this._id('holy_ring'), { diameter: 74, thickness: 8, tessellation: 20 }, this.scene);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, this._ground(x, y) + 34, y);
        ring.material = this._material('#ffdf78', true, 0.9);
        ring.isPickable = false;
        this.effects.push({ mesh: ring, t: 0, duration: 0.8, baseScale: 1 });
        for (let i = 0; i < 7; i++) {
            const a = i / 7 * Math.PI * 2;
            const mote = BABYLON.MeshBuilder.CreateSphere(this._id('holy_mote'), { diameter: 8, segments: 4 }, this.scene);
            mote.material = this._material(i % 2 ? '#fff2ad' : '#8be4ff', true, 0.95);
            mote.isPickable = false;
            mote.position.set(x + Math.cos(a) * 32, this._ground(x, y) + 12 + i * 3, y + Math.sin(a) * 32);
            this.effects.push({ mesh: mote, t: 0, duration: 1.0, baseScale: 1, startX: mote.position.x, startZ: mote.position.z, baseY: mote.position.y });
        }
    }

    cancelMode() {
        if (this.buildMode || this.abilityMode) {
            this.buildMode = '';
            this.abilityMode = '';
            this._setPlacementVisible(false);
            this.toast('Приказ отменён.');
            this._syncHUD(true);
        } else if (this.paused && !this.ended) this.togglePause();
    }

    togglePause() {
        if (this.ended) return;
        this.paused = !this.paused;
        const dim = this.ui.get('wc3PauseDim');
        if (dim) dim.show(this.paused);
        const label = this.ui.get('wc3Pause');
        if (label) label.setText(this.paused ? 'ПРОДОЛЖИТЬ' : 'ПАУЗА [Space]');
        this._syncHUD(true);
    }

    focusSelection() {
        const target = this.selected[0] || this.playerHall;
        if (!target) return;
        this.cam.zoomToCenter = false;
        this.cam.zoomTarget = 0.82;
        this.cam.lookAt(target.x, target.y);
    }

    restart() {
        this._clearWorld();
        this._resetSimulation();
        this.rng = this._makeRng(0x5eed31);
        this._createMap();
        this._createStartingBases();
        this._createNeutralSites();
        this._createForests();
        this._createRoads();
        this._createStartingArmies();
        this._setPlacementVisible(false);
        const dim = this.ui.get('wc3ResultDim'); if (dim) dim.show(false);
        const pause = this.ui.get('wc3PauseDim'); if (pause) pause.show(false);
        this._prepareCamera();
        this._syncHUD(true);
        this._syncMinimap(true);
        this.toast('Новая битва началась. Альянс готов к бою!');
    }

    _clearWorld() {
        this._hideSelectionBox();
        for (const u of this.units) this._removeEntityVisual(u);
        for (const b of this.structures) this._removeEntityVisual(b);
        for (const t of this.trees) this._removeEntityVisual(t);
        for (const root of this.environment) if (root && !root.isDisposed()) World3D.removeObject(this.view, root);
        for (const p of this.projectiles) if (p.mesh && !p.mesh.isDisposed()) p.mesh.dispose();
        for (const fx of this.effects) if (fx.mesh && !fx.mesh.isDisposed()) fx.mesh.dispose();
        this.units = []; this.structures = []; this.trees = []; this.environment = []; this.projectiles = []; this.effects = [];
        this._minimapDots.clear();
        if (this.placementMesh && !this.placementMesh.isDisposed()) this.placementMesh.setEnabled(false);
    }

    _returnToMenu() {
        const showMenu = /** @type {any} */ (this.app).showModeMenu;
        if (typeof showMenu === 'function') showMenu();
    }

    returnToMenu() { this._returnToMenu(); }

    _showToastPanel(text) {
        const panel = this.ui.get('wc3ToastPanel'), label = this.ui.get('wc3ToastTxt');
        if (!panel || !label) return;
        label.setText(text);
        panel.show(true);
        this.toastTimer = 4.5;
    }

    toast(text) { this._showToastPanel(text); }

    sound(src, x, y, volume) {
        if (!this.loc || !this.app || !this.app.camera) return;
        const handle = Sound3D.play(src, { at: { x, y }, volume: volume == null ? 0.65 : volume });
        return handle;
    }

    _syncHUD(force) {
        if (!force && this.hudTimer > 0) return;
        this.hudTimer = 0.18;
        const res = this.ui.get('wc3ResourceTxt');
        if (res) res.setText(`🪙 ${Math.floor(this.resources.gold)}   🪵 ${Math.floor(this.resources.lumber)}   🍖 ${this.resources.food} / ${this.resources.foodCap}   ⏱ ${this._clockText()}`);
        const title = this.ui.get('wc3ObjectiveTitle');
        if (title) title.setText('ЗАДАЧА · ВОЙНА ЗА АЗЕРОТ');
        const objective = this.ui.get('wc3ObjectiveTxt');
        if (objective) objective.setText('Разрушьте Большой зал Орды.\nКрестьяне добывают ресурсы и строят базу.');
        const selectedTitle = this.ui.get('wc3SelectedTitle');
        const selectedText = this.ui.get('wc3SelectedTxt');
        if (this.selected.length === 0) {
            if (selectedTitle) selectedTitle.setText('ШТАБ АЛЬЯНСА');
            if (selectedText) selectedText.setText('Выделите отряд или здание.\nПКМ по шахте / лесу — добыча.');
        } else if (this.selected.length > 1) {
            const workers = this.selected.filter(e => e.role === 'worker').length;
            if (selectedTitle) selectedTitle.setText(`ВЫБРАНО: ${this.selected.length} отрядов`);
            if (selectedText) selectedText.setText(`${workers ? `${workers} крестьянин(а) · ` : ''}ПКМ — приказ · Ctrl+A — армия`);
        } else {
            const e = this.selected[0];
            if (selectedTitle) selectedTitle.setText(e.name || 'Отряд');
            let extra = `${Math.ceil(e.hp)} / ${e.maxHp} ОЗ`;
            if (e.kind === 'unit' && e.type === 'paladin') extra += ` · Ур. ${e.level} · мана ${Math.floor(e.mana)}`;
            if (e.kind === 'unit' && e.role === 'worker' && e.carry > 0) extra += ` · несёт ${e.carry} ${e.carryKind === 'gold' ? 'золота' : 'леса'}`;
            if (e.kind === 'building' && e.queue && e.queue.length) {
                const job = e.queue[0], def = Warcraft3Data.UNITS[job.type];
                extra += `\nОбучение: ${def.name} ${Math.floor(job.progress * 100)}% · очередь ${e.queue.length}`;
            } else if (e.kind === 'building' && !e.complete) extra += `\nСтроительство ${Math.floor(e.progress * 100)}%`;
            if (selectedText) selectedText.setText(extra);
        }
        const pause = this.ui.get('wc3Pause');
        if (pause) pause.setText(this.paused ? 'ПРОДОЛЖИТЬ' : 'ПАУЗА [Space]');
        const cancel = this.ui.get('wc3Cancel');
        if (cancel) cancel.show(!!(this.buildMode || this.abilityMode));
        const tip = this.ui.get('wc3HoverTxt');
        if (tip && this.buildMode) tip.setText(`Строительство: ${Warcraft3Data.BUILDINGS[this.buildMode].name} · ЛКМ — поставить · Esc — отмена`);
        this._syncMinimap(false);
    }

    _clockText() {
        const mins = Math.floor(this.time / 60).toString().padStart(2, '0');
        const secs = Math.floor(this.time % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

    _syncMinimap(force) {
        if (!force && this.realTime - this._lastMiniSync < 0.22) return;
        this._lastMiniSync = this.realTime;
        const field = this.ui.get('wc3MiniField');
        if (!field) return;
        const w = Number(field.def.w) || 142, h = Number(field.def.h) || 122;
        for (const e of this.units.concat(this.structures)) {
            let dot = this._minimapDots.get(e.id);
            if (!dot && e.kind === 'building') dot = this._createMinimapDot(e);
            if (!dot) continue;
            dot.def.x = Math.max(1, Math.min(w - (dot.def.w || 5), e.x / this.loc.width * w));
            dot.def.y = Math.max(1, Math.min(h - (dot.def.h || 5), e.y / this.loc.height * h));
            dot.apply();
        }
    }

    _createMinimapDot(entity) {
        if (!this.ui.get('wc3MiniField')) return null;
        const color = entity.team === 'alliance' ? '#62cfff' : entity.team === 'horde' ? '#ff5c4c' : '#f7ca62';
        const large = entity.kind === 'building';
        const size = large ? 8 : 5;
        const dot = this.ui.add({ id: 'wc3dot_' + entity.id, kind: 'panel', parent: 'wc3MiniField', anchor: 'top-left',
            x: 0, y: 0, w: size, h: size, fill: color, border: '', radius: size, alpha: 1, visible: 1 });
        this._minimapDots.set(entity.id, dot);
        return dot;
    }

    _updateHUD(dt) {
        this.hudTimer -= dt;
        if (this.hudTimer <= 0) this._syncHUD(true);
        if (this.toastTimer > 0) {
            this.toastTimer -= dt;
            if (this.toastTimer <= 0) {
                const p = this.ui.get('wc3ToastPanel'); if (p) p.show(false);
            }
        }
    }

    update(dt) {
        dt = Math.max(0, Math.min(0.1, dt || 0));
        this.realTime += dt;
        if (!this.paused && !this.ended) {
            const step = dt * this.speed;
            this.time += step;
            this._updateEnemyAI(step);
            this._updateBuildings(step);
            for (const unit of [...this.units]) this._updateUnit(unit, step);
            if (this.paladin === null && this.heroRespawn > 0) {
                this.heroRespawn -= step;
                if (this.heroRespawn <= 0 && this.structures.some(b => b.team === 'alliance' && b.type === 'altar' && b.hp > 0)) {
                    const altar = this.structures.find(b => b.team === 'alliance' && b.type === 'altar' && b.hp > 0);
                    this.paladin = this._createUnit('paladin', 'alliance', altar.x + 95, altar.y, { level: 1 });
                    this.toast('Паладин вернулся из Света и готов к битве!');
                }
            }
            this._updateVfx(step);
        }
        this._updateHUD(dt);
    }

    _createMiniSync(force) { this._syncMinimap(force); }

    dispose() {
        if (this._bound && this.canvas) {
            this.canvas.removeEventListener('pointerdown', this._bound.down);
            this.canvas.removeEventListener('pointermove', this._bound.move);
            this.canvas.removeEventListener('pointerup', this._bound.up);
            this.canvas.removeEventListener('pointercancel', this._bound.up);
            window.removeEventListener('keydown', this._bound.key);
        }
        this._bound = null;
        this._clearWorld();
        if (this.selectionBox) this.selectionBox.show(false);
        if (this.placementMesh && !this.placementMesh.isDisposed()) this.placementMesh.dispose();
        for (const [id, dot] of this._minimapDots) this.ui.remove(dot.def.id);
        this._minimapDots.clear();
        for (const mat of this._materials.values()) if (mat && !mat.isDisposed()) mat.dispose();
        this._materials.clear();
        for (const id of ['wc3BuildBarracks', 'wc3BuildFarm', 'wc3BuildTower', 'wc3BuildAltar', 'wc3TrainPeasant',
            'wc3TrainFootman', 'wc3TrainArcher', 'wc3HeroLight', 'wc3HeroShield', 'wc3Pause', 'wc3Resume', 'wc3Reset',
            'wc3ResultReset', 'wc3Menu', 'wc3ResultMenu', 'wc3Cancel']) {
            const e = this.ui.get(id); if (e) e.onClick(null);
        }
        this.cam.onHome = null;
        this.cam.ignorePointer = null;
        this.cam.setCustomBounds(null);
        this.cam.setStrategyMode(false);
    }
}
