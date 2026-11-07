// Game.js — fantasy «Dispatch» в гостевом дворе (через ArcEngine).
// Игрок управляет сотрудниками и отправляет их на задания, которые появляются на
// карте иконкой восклицательного знака над комнатой. Успех определяется совпадением
// суммарных характеристик команды с требуемыми (процент в шестиугольнике + d100).
// Камера статична, всегда показывает весь этаж особняка.
// Комментарии на английском по конвенции набора; строки интерфейса — по-русски.

/** @typedef {{ id: string, name: string, color: number, stats: Record<string, number> }} StaffMember */
/** @typedef {{ key: string, name: string, color: number, x: number, y: number, w: number, d: number, connections: string[] }} Room */
/** @typedef {{ id: string, roomKey: string, name: string, desc: string, reqs: Record<string, number>, slots: number, duration: number, gold: number, xp: number, hintWords: string[], revealStats: string[] }} MissionDef */
/** @typedef {{ def: MissionDef, status: 'hidden' | 'open' | 'sent' | 'done', workerIds: string[], end: number, appear: number, expire: number, result: boolean | null, overlap: number, showUntil: number }} MissionState */

/** Шесть характеристик (углы шестиугольника), диапазон 1..10. */
const STAT_KEYS = ['strength', 'endurance', 'agility', 'wisdom', 'literacy', 'charisma'];
const STAT_LABEL_RU = {
    strength: 'Сила',
    endurance: 'Выносливость',
    agility: 'Ловкость',
    wisdom: 'Мудрость',
    literacy: 'Начитанность',
    charisma: 'Харизма'
};

const STAT_SHORT = { strength: 'С', endurance: 'В', agility: 'Л', wisdom: 'М', literacy: 'Н', charisma: 'Х' };

const STAFF = [
    { id: 'centaur', name: 'Кентавр', color: 0x8dd3a0, stats: { strength: 2, endurance: 4, wisdom: 4 } },
    { id: 'minotaur', name: 'Девушка бык', color: 0xe07050, stats: { strength: 4, endurance: 4, agility: 2 } },
    { id: 'butler', name: 'Дворецкий', color: 0x70a0e0, stats: { strength: 2, endurance: 1, agility: 2, literacy: 3, charisma: 4 } },
    { id: 'slime', name: 'Девушка слизь', color: 0xa0e0a0, stats: { strength: 2, endurance: 2, agility: 3, literacy: 2, wisdom: 2, charisma: 3 } },
    { id: 'arachne', name: 'Арахна', color: 0xd080e0, stats: { strength: 1, endurance: 1, agility: 4, literacy: 5 } },
];

/** Комнаты этажа особняка. connections — ключи комнат, между которыми есть проход (дверь). */
const ROOMS = [
    { key: 'reception', name: 'Парадная со стойкой регистрации', color: 0xe8dcc8, x: 640, y: 520, w: 340, d: 220, connections: ['hall', 'kitchen', 'toilets'] },
    { key: 'kitchen', name: 'Кухня', color: 0xf2c98a, x: 500, y: 860, w: 260, d: 200, connections: ['reception', 'hall', 'staff'] },
    { key: 'hall', name: 'Большой обеденный зал', color: 0xc9d8c2, x: 1100, y: 800, w: 380, d: 300, connections: ['reception', 'kitchen', 'bar', 'guest1', 'guest2', 'stairs'] },
    { key: 'bar', name: 'Бар', color: 0xd9b973, x: 1420, y: 1120, w: 240, d: 180, connections: ['hall', 'cellar'] },
    { key: 'cellar', name: 'Винный погреб', color: 0x5c3c2f, x: 1490, y: 1260, w: 120, d: 100, connections: ['bar'] },
    { key: 'baths', name: 'Купальни', color: 0xa9c9ea, x: 620, y: 1300, w: 220, d: 180, connections: ['guest2', 'maid'] },
    { key: 'toilets', name: 'Туалеты', color: 0xeaa0a0, x: 800, y: 420, w: 160, d: 120, connections: ['reception'] },
    { key: 'staff', name: 'Комната прислуги', color: 0xd8c8e8, x: 540, y: 1040, w: 200, d: 160, connections: ['kitchen'] },
    { key: 'stairs', name: 'Холл у лестницы', color: 0xe8e8d4, x: 1080, y: 520, w: 180, d: 160, connections: ['hall', 'guest1', 'guest2'] },
    { key: 'pantry', name: 'Кладовая продуктов', color: 0xc9b894, x: 820, y: 700, w: 140, d: 120, connections: ['kitchen', 'hall'] },
    { key: 'guest1', name: 'Гостевая комната №1', color: 0xf0e0d0, x: 1280, y: 600, w: 180, d: 160, connections: ['hall', 'stairs', 'baths'] },
    { key: 'guest2', name: 'Гостевая комната №2', color: 0xf0e0d0, x: 660, y: 960, w: 180, d: 160, connections: ['hall', 'stairs', 'baths'] },
    { key: 'fireplace', name: 'Комната с камином', color: 0xe0c0a0, x: 1160, y: 940, w: 180, d: 160, connections: ['hall'] },
    { key: 'crockery', name: 'Комната для посуды', color: 0xc8c0b8, x: 1320, y: 1080, w: 160, d: 140, connections: ['kitchen', 'bar'] },
    { key: 'guard', name: 'Комната охраны', color: 0xb8a8a8, x: 700, y: 1120, w: 160, d: 140, connections: ['staff'] },
    { key: 'maid', name: 'Комната горничных', color: 0xd4c4e4, x: 1120, y: 1200, w: 180, d: 160, connections: ['baths', 'hall'] },
    { key: 'inventory', name: 'Кладовая инвентаря', color: 0xb7a896, x: 940, y: 1160, w: 140, d: 120, connections: ['staff', 'hall'] },
];

const MISSIONS = [
    {
        id: 'wine', roomKey: 'cellar', name: 'Принести лучшее вино из погреба',
        desc: 'Спуститесь в винный погреб и принесите лучшую бутылку вина для бара.',
        reqs: { literacy: 4, strength: 3 }, slots: 2, duration: 45, gold: 60, xp: 12,
        hintWords: ['разберитесь', 'лучшее'], revealStats: ['literacy', 'strength'],
    },
    {
        id: 'baths', roomKey: 'baths', name: 'Купальни: залатать пол',
        desc: 'В купальнях течёт пол. Нужно залатать провал, пока не затопил соседние комнаты.',
        reqs: { strength: 4, endurance: 3 }, slots: 2, duration: 55, gold: 70, xp: 14,
        hintWords: ['залатайте', 'укрепите'], revealStats: ['strength', 'endurance'],
    },
    {
        id: 'brawl', roomKey: 'bar', name: 'Потасовка в баре',
        desc: 'В баре разгорелась потасовка. Разньте дебоширов, прежде чем разобьют всю посуду.',
        reqs: { strength: 4, endurance: 4 }, slots: 3, duration: 50, gold: 80, xp: 16,
        hintWords: ['разбейте', 'разнять'], revealStats: ['strength', 'endurance'],
    },
    {
        id: 'bard', roomKey: 'reception', name: 'Незнакомец на стойке',
        desc: 'На ресепшн зашёл незнакомец-бард. Он говорит, что когда-то был известен, но давно отошёл от дел. Поговорите с ним.',
        reqs: { charisma: 4, literacy: 4 }, slots: 1, duration: 35, gold: 50, xp: 10,
        hintWords: ['поговорите', 'расспросите'], revealStats: ['charisma', 'literacy'],
    },
    {
        id: 'kitchen', roomKey: 'kitchen', name: 'Помощь шеф-повару',
        desc: 'На кухне нужна помощь шеф-повару: кто-то, кто уверенно орудует ножом и следит за котлом.',
        reqs: { agility: 4, endurance: 4 }, slots: 2, duration: 50, gold: 65, xp: 13,
        hintWords: ['нарежьте', 'варите'], revealStats: ['agility', 'endurance'],
    },
    {
        id: 'bardShow', roomKey: 'hall', name: 'Выступление барда',
        desc: 'Бард просит помочь с выступлением в зале: кто-то, кто хорошо подпоёт и запомнит старые тексты.',
        reqs: { charisma: 4, literacy: 5 }, slots: 2, duration: 70, gold: 100, xp: 20,
        hintWords: ['подпойте', 'вспомните'], revealStats: ['charisma', 'literacy'],
    },
];

class Game {
    /** @param {{ location: Location3D, camera: CameraController }} app */
    constructor(app) {
        this.app = app;
        this.scene = app.location.view.scene;
        this.terrain = app.location.terrain;
        this.camera = app.camera;

        // --- Статичная камера: отключаем ввод и фиксируем вид на весь этаж ---
        this.camera.detach();
        this._setupStaticCamera();

        this.realSec = 0;
        this.uiTick = 0;
        this.coins = 0;
        this._log = [];

        // Сотрудники с run-time состоянием.
        this.staff = STAFF.map(s => Object.assign({}, s, {
            status: 'free', injuries: 0, xp: 0,
            missionId: null, target: null, _from: null, t: 1, mesh: null,
        }));

        // Миссии с run-time состоянием.
        this.missionState = MISSIONS.map(def => ({
            def, status: 'hidden', workerIds: [], end: 0, appear: 0, expire: 0,
            result: null, overlap: 0, showUntil: 0,
        }));

        this.nextMissionIndex = 0;

        // 3D интерьер этажа особняка: полы, стены, двери.
        this.roomMesh = new Map();
        this.wallMeshes = [];
        this.buildMansion();

        // Иконки восклицательного знака над комнатами с активными миссиями.
        this.missionIcons = new Map();
        for (const room of ROOMS) this.addQuestIcon(room);

        // Сотрудники начинают в комнате прислуги.
        const staffRoom = ROOMS.find(r => r.key === 'staff');
        for (const w of this.staff) {
            w.target = { x: staffRoom.x, y: staffRoom.y };
            this.addWorker(w);
        }

        // UI обработчики.
        for (let i = 0; i < 4; i++) {
            const btn = UI.get('slot' + (i + 1));
            if (btn) btn.onClick(() => this.toggleSlot(i));
        }
        const sendBtn = UI.get('sendBtn');
        if (sendBtn) sendBtn.onClick(() => this.sendSelected());
        const closeBtn = UI.get('sendClose');
        if (closeBtn) closeBtn.onClick(() => this.closeSend());
        const okBtn = UI.get('resultOk');
        if (okBtn) okBtn.onClick(() => this.closeResult());

        this.selected = new Set();
        this.openMissionId = null;

        this.pushLog('Постоялый двор открыт. Следите за восклицательными знаками на этаже.');
        this.tick();
        this.spawnNextMission();
    }

    static cfg() {
        const U = 'undefined';
        return {
            uiTick: typeof GAME_UI_TICK_SEC !== U ? GAME_UI_TICK_SEC : 0.25,
            resultShow: typeof GAME_RESULT_SHOW_SEC !== U ? GAME_RESULT_SHOW_SEC : 5,
            moveSec: typeof GAME_MOVE_SEC !== U ? GAME_MOVE_SEC : 1.5,
            timeScale: typeof GAME_TIME_SCALE !== U ? GAME_TIME_SCALE : 60,
        };
    }

    stat(worker, key) {
        let v = Number(worker.stats && worker.stats[key]);
        if (!isFinite(v) || v < 1) v = 1;
        if (v > 10) v = 10;
        return v;
    }

    now() { return performance.now() / 1000; }

    // --- Камера ---

    _setupStaticCamera() {
        // Центр особняка (по комнатам)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const r of ROOMS) {
            minX = Math.min(minX, r.x - r.w / 2);
            minY = Math.min(minY, r.y - r.d / 2);
            maxX = Math.max(maxX, r.x + r.w / 2);
            maxY = Math.max(maxY, r.y + r.d / 2);
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        const c = this.camera;
        c.target = { x: cx, y: cy, h: 0 };
        c.azimuth = -30 * Math.PI / 180;   // вид со стороны, чуть равномернее
        c.pitch = 75 * Math.PI / 180;      // выше — больше похоже на план этажа
        c.zoom = 0.42;                     // охватываем весь этаж поближе
        c.zoomTarget = c.zoom;
        c.lift = 0;
        c.followObj = null;
        c._apply();
    }

    // --- Постройка интерьера особняка ---

    buildMansion() {
        const wallH = 70;      // высота стены
        const wallTh = 6;      // толщина стены
        const floorH = 2;      // толщина пола

        // Внешний контур здания (около всех комнат с отступом)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const r of ROOMS) {
            minX = Math.min(minX, r.x - r.w / 2 - 10);
            minY = Math.min(minY, r.y - r.d / 2 - 10);
            maxX = Math.max(maxX, r.x + r.w / 2 + 10);
            maxY = Math.max(maxY, r.y + r.d / 2 + 10);
        }
        const buildingW = maxX - minX;
        const buildingD = maxY - minY;
        const buildingX = (minX + maxX) / 2;
        const buildingY = (minY + maxY) / 2;

        // Пол здания (одна большая плита)
        const floorMesh = BABYLON.MeshBuilder.CreateBox('mansion-floor',
            { width: buildingW, height: floorH, depth: buildingD }, this.scene);
        floorMesh.position.set(buildingX, floorH / 2, buildingY);
        const floorMat = new BABYLON.StandardMaterial('mat-mansion-floor', this.scene);
        floorMat.diffuseColor = new BABYLON.Color3(0.62, 0.58, 0.50);
        floorMat.specularColor = new BABYLON.Color3(0, 0, 0);
        floorMesh.material = floorMat;
        World3D.addObject(this.app.location.view, floorMesh, 'prop');

        // Внешние стены здания
        this.addWall('wall-north', buildingX, minY - wallTh / 2, buildingW, wallH, wallTh);
        this.addWall('wall-south', buildingX, maxY + wallTh / 2, buildingW, wallH, wallTh);
        this.addWall('wall-west', minX - wallTh / 2, buildingY, wallTh, wallH, buildingD);
        this.addWall('wall-east', maxX + wallTh / 2, buildingY, wallTh, wallH, buildingD);

        // Каждая комната: пол + стены с проёмами для дверей
        for (const room of ROOMS) this.addRoomWithWalls(room, wallH, wallTh, floorH);
    }

    addWall(name, x, y, w, h, d) {
        const mesh = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, this.scene);
        mesh.position.set(x, h / 2, y);
        const mat = new BABYLON.StandardMaterial('mat-' + name, this.scene);
        mat.diffuseColor = new BABYLON.Color3(0.45, 0.40, 0.36);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mesh.material = mat;
        World3D.addObject(this.app.location.view, mesh, 'prop');
        this.wallMeshes.push(mesh);
    }

    addRoomWithWalls(room, wallH, wallTh, floorH) {
        // Пол комнаты
        const floorMesh = BABYLON.MeshBuilder.CreateBox('floor-' + room.key,
            { width: room.w - 4, height: floorH, depth: room.d - 4 }, this.scene);
        const h = this.terrain ? this.terrain.heightAt(room.x, room.y) : 0;
        floorMesh.position.set(room.x, h + floorH / 2, room.y);
        const floorMat = new BABYLON.StandardMaterial('mat-floor-' + room.key, this.scene);
        const c = room.color;
        floorMat.diffuseColor = new BABYLON.Color3(((c >> 16) & 255) / 255 * 0.85, ((c >> 8) & 255) / 255 * 0.85, (c & 255) / 255 * 0.85);
        floorMat.specularColor = new BABYLON.Color3(0, 0, 0);
        floorMesh.material = floorMat;
        World3D.addObject(this.app.location.view, floorMesh, 'prop');
        this.roomMesh.set(room.key, floorMesh);

        // Стены комнаты со скруглёнными углами и проёмами для дверей
        const hw = room.w / 2, hd = room.d / 2;
        const doorW = 46;   // ширина дверного проёма

        // Северная стена
        if (!room.connections.includes('north') && this._hasConnectionToNorth(room)) {
            // стена целиком
            this.addWallSegment('wall-' + room.key + '-n', room.x, room.y - hd - wallTh / 2, room.w - wallTh, wallH, wallTh);
        } else {
            // две части стены с дверным проёмом посередине
            const partW = (room.w - wallTh - doorW) / 2;
            if (partW > 0) {
                this.addWallSegment('wall-' + room.key + '-n1', room.x - hw + partW / 2 + wallTh / 2, room.y - hd - wallTh / 2, partW, wallH, wallTh);
                this.addWallSegment('wall-' + room.key + '-n2', room.x + hw - partW / 2 - wallTh / 2, room.y - hd - wallTh / 2, partW, wallH, wallTh);
            }
        }
        // Южная стена
        if (!room.connections.includes('south') && this._hasConnectionToSouth(room)) {
            this.addWallSegment('wall-' + room.key + '-s', room.x, room.y + hd + wallTh / 2, room.w - wallTh, wallH, wallTh);
        } else {
            const partW = (room.w - wallTh - doorW) / 2;
            if (partW > 0) {
                this.addWallSegment('wall-' + room.key + '-s1', room.x - hw + partW / 2 + wallTh / 2, room.y + hd + wallTh / 2, partW, wallH, wallTh);
                this.addWallSegment('wall-' + room.key + '-s2', room.x + hw - partW / 2 - wallTh / 2, room.y + hd + wallTh / 2, partW, wallH, wallTh);
            }
        }
        // Западная стена
        if (!room.connections.includes('west') && this._hasConnectionToWest(room)) {
            this.addWallSegment('wall-' + room.key + '-w', room.x - hw - wallTh / 2, room.y, wallTh, wallH, room.d - wallTh);
        } else {
            const partD = (room.d - wallTh - doorW) / 2;
            if (partD > 0) {
                this.addWallSegment('wall-' + room.key + '-w1', room.x - hw - wallTh / 2, room.y - hd + partD / 2 + wallTh / 2, wallTh, wallH, partD);
                this.addWallSegment('wall-' + room.key + '-w2', room.x - hw - wallTh / 2, room.y + hd - partD / 2 - wallTh / 2, wallTh, wallH, partD);
            }
        }
        // Восточная стена
        if (!room.connections.includes('east') && this._hasConnectionToEast(room)) {
            this.addWallSegment('wall-' + room.key + '-e', room.x + hw + wallTh / 2, room.y, wallTh, wallH, room.d - wallTh);
        } else {
            const partD = (room.d - wallTh - doorW) / 2;
            if (partD > 0) {
                this.addWallSegment('wall-' + room.key + '-e1', room.x + hw + wallTh / 2, room.y - hd + partD / 2 + wallTh / 2, wallTh, wallH, partD);
                this.addWallSegment('wall-' + room.key + '-e2', room.x + hw + wallTh / 2, room.y + hd - partD / 2 - wallTh / 2, wallTh, wallH, partD);
            }
        }
    }

    _hasConnectionToNorth(room) {
        // проверяем, есть ли комната на севере с которой соединены
        for (const other of ROOMS) {
            if (other.key === room.key) continue;
            if (room.connections.includes(other.key)) {
                const dy = other.y - room.y;
                const dx = Math.abs(other.x - room.x);
                if (dy < -40 && dx < Math.max(room.w, other.w) * 0.7) return true;
            }
        }
        return false;
    }
    _hasConnectionToSouth(room) {
        for (const other of ROOMS) {
            if (other.key === room.key) continue;
            if (room.connections.includes(other.key)) {
                const dy = other.y - room.y;
                const dx = Math.abs(other.x - room.x);
                if (dy > 40 && dx < Math.max(room.w, other.w) * 0.7) return true;
            }
        }
        return false;
    }
    _hasConnectionToWest(room) {
        for (const other of ROOMS) {
            if (other.key === room.key) continue;
            if (room.connections.includes(other.key)) {
                const dx = other.x - room.x;
                const dy = Math.abs(other.y - room.y);
                if (dx < -40 && dy < Math.max(room.d, other.d) * 0.7) return true;
            }
        }
        return false;
    }
    _hasConnectionToEast(room) {
        for (const other of ROOMS) {
            if (other.key === room.key) continue;
            if (room.connections.includes(other.key)) {
                const dx = other.x - room.x;
                const dy = Math.abs(other.y - room.y);
                if (dx > 40 && dy < Math.max(room.d, other.d) * 0.7) return true;
            }
        }
        return false;
    }

    addWallSegment(name, x, y, w, h, d) {
        const mesh = BABYLON.MeshBuilder.CreateBox(name, { width: Math.max(4, w), height: h, depth: Math.max(4, d) }, this.scene);
        mesh.position.set(x, h / 2, y);
        const mat = new BABYLON.StandardMaterial('mat-' + name, this.scene);
        mat.diffuseColor = new BABYLON.Color3(0.45, 0.40, 0.36);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mesh.material = mat;
        World3D.addObject(this.app.location.view, mesh, 'prop');
        this.wallMeshes.push(mesh);
    }

    // Иконка восклицательного знака над комнатой
    addQuestIcon(room) {
        const group = new BABYLON.Mesh('icon-group-' + room.key, this.scene);
        group.position.set(room.x, 40, room.y);

        // Вертикальный Stroke "!"
        const stroke = BABYLON.MeshBuilder.CreateBox('icon-stroke-' + room.key,
            { width: 10, height: 46, depth: 10 }, this.scene);
        stroke.position.set(0, 0, 0);
        stroke.parent = group;

        // Точка под восклицательным знаком
        const dot = BABYLON.MeshBuilder.CreateBox('icon-dot-' + room.key,
            { width: 16, height: 16, depth: 16 }, this.scene);
        dot.position.set(0, -32, 0);
        dot.parent = group;

        const mat = new BABYLON.StandardMaterial('mat-icon-' + room.key, this.scene);
        mat.diffuseColor = new BABYLON.Color3(1, 0.85, 0.2);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        stroke.material = mat;
        dot.material = mat;

        World3D.addObject(this.app.location.view, group, 'prop');
        group.setEnabled(false);
        this.missionIcons.set(room.key, group);
    }

    addWorker(w) {
        const mesh = BABYLON.MeshBuilder.CreateBox('worker-' + w.id,
            { width: 20, height: 34, depth: 20 }, this.scene);
        const h = this.terrain ? this.terrain.heightAt(w.target.x, w.target.y) : 0;
        mesh.position.set(w.target.x, h + 17, w.target.y);
        const mat = new BABYLON.StandardMaterial('mat-worker-' + w.id, this.scene);
        const c = w.color;
        mat.diffuseColor = new BABYLON.Color3(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mesh.material = mat;
        World3D.addObject(this.app.location.view, mesh, 'actor');
        w.mesh = mesh;
    }

    roomPos(key) {
        const room = ROOMS.find(r => r.key === key);
        return room ? { x: room.x, y: room.y } : null;
    }

    pushLog(text) {
        this._log.push(text);
        if (this._log.length > 10) this._log = this._log.slice(this._log.length - 10);
    }

    // --- Миссии ---

    spawnNextMission() {
        if (this.nextMissionIndex >= MISSIONS.length) return;
        const def = MISSIONS[this.nextMissionIndex];
        const ms = this.missionState.find(m => m.def.id === def.id);
        if (!ms) return;
        const urgency = Math.max(10, Math.min(20, Math.round(def.duration / 3)));
        const first = this.nextMissionIndex === 0;
        const gap = first ? 20 : 55;   // пауза между квестами — человек должен успеть сориентироваться
        ms.appear = this.realSec + gap;
        ms.expire = ms.appear + urgency;
        ms.status = 'hidden';
        this.nextMissionIndex++;
        this.pushLog('Скоро на этаже появится задание: ' + def.name + '.');
    }

    showIcon(ms) {
        const mesh = this.missionIcons.get(ms.def.roomKey);
        if (mesh) mesh.setEnabled(true);
    }

    hideIcon(ms) {
        const mesh = this.missionIcons.get(ms.def.roomKey);
        if (mesh) mesh.setEnabled(false);
    }

    openMission(missionId) {
        const ms = this.missionState.find(m => m.def.id === missionId);
        if (!ms || ms.status !== 'open') return;
        this.openMissionId = missionId;
        this.selected.clear();
        const def = ms.def;
        UI.get('sendTitle').setText(def.name);
        UI.get('sendDesc').setText(def.desc);
        UI.get('sendHints').setText('Подсказки: ' + def.hintWords.map(w => '*' + w + '*').join(' · '));

        // Шестиугольник требований: 6 углов
        const corners = [
            { key: 'strength', el: 'sendHexTop' },
            { key: 'charisma', el: 'sendHexUpperRight' },
            { key: 'agility', el: 'sendHexLowerRight' },
            { key: 'endurance', el: 'sendHexBottom' },
            { key: 'wisdom', el: 'sendHexLowerLeft' },
            { key: 'literacy', el: 'sendHexUpperLeft' },
        ];
        for (const { key, el } of corners) {
            const req = def.reqs[key] || 1;
            UI.get(el).setText(STAT_SHORT[key] + req);
        }
        // Сумма requirement в центре
        const totalReq = Object.values(def.reqs).reduce((a, b) => a + b, 0);
        UI.get('sendHexCenter').setText(String(totalReq));

        // Слоты
        for (let i = 0; i < 4; i++) {
            const btn = UI.get('slot' + (i + 1));
            btn.setText((i < def.slots ? 'Слот ' + (i + 1) + ' — пусто' : '—'));
            btn.def.fill = (i < def.slots ? '#1c2a38' : '#0a1018');
            btn.apply();
        }
        UI.get('sendDim').show(true);
        UI.get('sendWindow').show(true);
        this.updateOverlap();
    }

    closeSend() {
        UI.get('sendDim').show(false);
        UI.get('sendWindow').show(false);
        this.openMissionId = null;
        this.selected.clear();
    }

    toggleSlot(slotIdx) {
        const ms = this.missionState.find(m => m.def.id === this.openMissionId);
        if (!ms) return;
        const def = ms.def;
        if (slotIdx >= def.slots) return;
        const already = [...this.selected].find(sid => {
            const w = this.staff.find(st => st.id === sid);
            return w && w._slot === slotIdx;
        });
        if (already) {
            const w = this.staff.find(st => st.id === already);
            if (w) w._slot = null;
            this.selected.delete(already);
        } else {
            const free = this.staff.find(w => w.status === 'free' && !this.selected.has(w.id));
            if (free) { free._slot = slotIdx; this.selected.add(free.id); }
        }
        this.refreshSlots();
    }

    refreshSlots() {
        const ms = this.missionState.find(m => m.def.id === this.openMissionId);
        if (!ms) return;
        const def = ms.def;
        for (let i = 0; i < 4; i++) {
            const btn = UI.get('slot' + (i + 1));
            const sid = [...this.selected].find(sid => {
                const w = this.staff.find(st => st.id === sid);
                return w && w._slot === i;
            });
            const w = sid ? this.staff.find(st => st.id === sid) : null;
            if (i >= def.slots) {
                btn.setText('—');
            } else if (w) {
                btn.setText(w.name + ' · готовится');
            } else {
                btn.setText('Слот ' + (i + 1) + ' — пусто');
            }
            btn.apply();
        }
        this.updateOverlap();
    }

    updateOverlap() {
        const ms = this.missionState.find(m => m.def.id === this.openMissionId);
        if (!ms) return;
        const sent = {};
        for (const key of STAT_KEYS) sent[key] = 0;
        for (const sid of this.selected) {
            const w = this.staff.find(st => st.id === sid);
            if (w) for (const key of STAT_KEYS) sent[key] += this.stat(w, key);
        }
        let covered = 0, total = 0;
        for (const key of Object.keys(ms.def.reqs)) {
            total += ms.def.reqs[key];
            covered += Math.min(sent[key] || 0, ms.def.reqs[key]);
        }
        const pct = total === 0 ? 0 : Math.round(covered / total * 100);
        UI.get('sendOverlap').setText('Совпадение требований: ' + pct + '%');
    }

    sendSelected() {
        const ms = this.missionState.find(m => m.def.id === this.openMissionId);
        if (!ms || this.selected.size === 0) return;
        ms.status = 'sent';
        ms.workerIds = [...this.selected];
        ms.end = this.now() + ms.def.duration;
        for (const sid of ms.workerIds) {
            const w = this.staff.find(st => st.id === sid);
            w.status = 'busy';
            w.missionId = ms.def.id;
            w.t = 0;
            w._from = { x: w.mesh.position.x, z: w.mesh.position.z };
            w.target = this.roomPos(ms.def.roomKey);
        }
        this.hideIcon(ms);
        this.pushLog('Команда отправлена на: ' + ms.def.name + '.');
        this.closeSend();
    }

    finish(ms) {
        const c = Game.cfg();
        const sent = {};
        for (const key of STAT_KEYS) sent[key] = 0;
        for (const sid of ms.workerIds) {
            const w = this.staff.find(st => st.id === sid);
            if (w) for (const key of STAT_KEYS) sent[key] += this.stat(w, key);
        }
        let covered = 0, total = 0;
        for (const key of Object.keys(ms.def.reqs)) {
            total += ms.def.reqs[key];
            covered += Math.min(sent[key] || 0, ms.def.reqs[key]);
        }
        ms.overlap = total === 0 ? 0 : covered / total;
        const pct = Math.round(ms.overlap * 100);

        let ok;
        if (ms.overlap >= 1.0) {
            ok = true;
        } else {
            ok = Math.random() * 100 <= pct;
        }

        ms.result = ok;
        ms.status = 'done';
        ms.showUntil = this.now() + c.resultShow;

        for (const sid of ms.workerIds) {
            const w = this.staff.find(st => st.id === sid);
            if (w) {
                w.status = 'returning';
                w.t = 0;
                w._from = { x: w.mesh.position.x, z: w.mesh.position.z };
                w.target = this.roomPos('staff');
            }
        }

        if (ok) {
            this.coins += ms.def.gold;
            for (const sid of ms.workerIds) {
                const w = this.staff.find(st => st.id === sid);
                if (w) w.xp += ms.def.xp;
            }
            this.pushLog('Задание «' + ms.def.name + '» выполнено. +' + ms.def.gold + '💰, +' + ms.def.xp + ' опыта.');
        } else {
            for (const sid of ms.workerIds) {
                const w = this.staff.find(st => st.id === sid);
                if (w) this.injure(w);
            }
            this.pushLog('Задание «' + ms.def.name + '» провалено. Травмы у команды.');
        }
    }

    injure(w) {
        w.injuries++;
        for (const key of STAT_KEYS) {
            if (w.stats[key] > 1) w.stats[key]--;
        }
        if (w.injuries >= 2) {
            w.status = 'out';
            this.pushLog(w.name + ' выбывает из службы (вторая травма).');
        } else {
            w.status = 'injured';
            this.pushLog(w.name + ' traumatized: −1 ко всем характеристикам.');
        }
    }

    completeReturn(w) {
        w.status = 'free';
        w.missionId = null;
        w.target = this.roomPos('staff');
        w.t = 1;
    }

    showResult(ms) {
        UI.get('resultTitle').setText(ms.result ? 'Задание выполнено' : 'Задание провалено');
        UI.get('resultText').setText(ms.result
            ? 'Задание «' + ms.def.name + '» выполнено успешно.'
            : 'Задание «' + ms.def.name + '» провалено.');
        let detail = 'Требуемые характеристики: ';
        const reqParts = [];
        for (const key of Object.keys(ms.def.reqs)) reqParts.push(STAT_LABEL_RU[key] + ' ' + ms.def.reqs[key]);
        detail += reqParts.join(', ') + '. ';
        detail += 'Покрытие требований: ' + Math.round(ms.overlap * 100) + '%.';
        UI.get('resultDetail').setText(detail);

        // Шестиугольник требуемых характеристик
        const corners = [
            { key: 'strength', el: 'resultHexTop' },
            { key: 'charisma', el: 'resultHexUpperRight' },
            { key: 'agility', el: 'resultHexLowerRight' },
            { key: 'endurance', el: 'resultHexBottom' },
            { key: 'wisdom', el: 'resultHexLowerLeft' },
            { key: 'literacy', el: 'resultHexUpperLeft' },
        ];
        for (const { key, el } of corners) {
            const req = ms.def.reqs[key] || 1;
            UI.get(el).setText(STAT_SHORT[key] + req);
        }

        // Скрытые характеристики (подсказки, что на самом деле требовалось)
        const revealParts = [];
        for (const key of ms.def.revealStats) {
            revealParts.push(STAT_LABEL_RU[key] + ' ' + ms.def.reqs[key]);
        }
        UI.get('resultReveal').setText(revealParts.join(' · ') || '—');

        if (ms.result) {
            UI.get('resultReward').setText('Награда: +' + ms.def.gold + '💰, +' + ms.def.xp + ' опыта.');
        } else {
            UI.get('resultReward').setText('Все сотрудники получили травму.');
        }
        UI.get('resultDim').show(true);
        UI.get('resultWindow').show(true);
    }

    closeResult() {
        UI.get('resultDim').show(false);
        UI.get('resultWindow').show(false);
        const ms = this.missionState.find(m => m.def.id === (this.openMissionId || ''));
        if (ms) ms.result = null;
        this._nextSpawn = this.realSec + 40;   // пауза после результата перед следующим квестом
    }

    // --- Основной цикл ---

    moveWorkers(dt) {
        const moveSec = Game.cfg().moveSec;
        for (const w of this.staff) {
            if (!w.target || w.t >= 1 || !w.mesh) continue;
            w.t = Math.min(1, w.t + dt / moveSec);
            const m = w.mesh;
            m.position.x = w._from.x + (w.target.x - w._from.x) * w.t;
            m.position.z = w._from.z + (w.target.y - w._from.z) * w.t;
            const h = this.terrain ? this.terrain.heightAt(m.position.x, m.position.z) : 0;
            m.position.y = h + 17;
            if (w.t >= 1) {
                if (w.status === 'returning') this.completeReturn(w);
            }
        }
    }

    updateMissions() {
        const now = this.now();
        const c = Game.cfg();
        const EPS = 0.001;
        for (const ms of this.missionState) {
            if (ms.status === 'hidden' && this.realSec + EPS >= ms.appear) {
                ms.status = 'open';
                this.showIcon(ms);
            } else if (ms.status === 'open' && this.realSec + EPS >= ms.expire) {
                ms.status = 'hidden';
                this.hideIcon(ms);
                this.pushLog('Задание «' + ms.def.name + '» снято с этажа (время вышло).');
                this.spawnNextMission();
            } else if (ms.status === 'sent' && now + EPS >= ms.end) {
                this.finish(ms);
            } else if (ms.status === 'done' && now + EPS >= ms.showUntil) {
                this.showResult(ms);
            }
        }
        for (const w of this.staff) {
            if (w.status === 'returning' && w.t >= 1) this.completeReturn(w);
        }
        if (this._nextSpawn && this.realSec + EPS >= this._nextSpawn) {
            this.spawnNextMission();
            this._nextSpawn = 0;
        }
    }

    tick() {
        const c = Game.cfg();
        const gameSec = Math.floor(8 * 60 + this.realSec * c.timeScale);
        const hh = String(Math.floor(gameSec / 60) % 24).padStart(2, '0');
        const mm = String(gameSec % 60).padStart(2, '0');
        const clock = UI.get('clock');
        if (clock) clock.setText(hh + ':' + mm);
        const coins = UI.get('coins');
        if (coins) coins.setText('💰 ' + this.coins);

        // Карточки сотрудников
        for (const w of this.staff) {
            const statsText = STAT_KEYS.map(k => STAT_SHORT[k] + this.stat(w, k)).join(' ');
            const statsEl = UI.get('card-' + w.id + '-stats');
            if (statsEl) statsEl.setText(statsText);
            const statusEl = UI.get('card-' + w.id + '-status');
            const badgeEl = UI.get('card-' + w.id + '-badge-text');
            const xpEl = UI.get('card-' + w.id + '-xp');
            let statusText = '', statusColor = '';
            if (w.status === 'out') { statusText = 'ВЫБЫВШИЙ'; statusColor = '#a0a0a0'; }
            else if (w.status === 'injured') { statusText = 'ТРАВМА'; statusColor = '#f0a0a0'; }
            else if (w.status === 'busy') {
                const ms = this.missionState.find(m => m.def.id === w.missionId) || null;
                statusText = 'В РЕЙСЕ: ' + (ms ? ms.def.name : '?');
                statusColor = '#f0e080';
            } else if (w.status === 'returning') { statusText = 'ВОЗВРАЩАЕТСЯ'; statusColor = '#c0c0f0'; }
            else { statusText = 'СВОБОДЕН'; statusColor = '#7fd07f'; }
            if (statusEl) { statusEl.setText(statusText); statusEl.def.color = statusColor; statusEl.apply(); }
            if (badgeEl) {
                if (w.status === 'busy') badgeEl.setText('!');
                else if (w.status === 'returning') badgeEl.setText('↺');
                else if (w.status === 'injured') badgeEl.setText('⚑');
                else if (w.status === 'out') badgeEl.setText('✖');
                else badgeEl.setText('—');
                badgeEl.apply();
            }
            if (xpEl) xpEl.setText('ОП ' + w.xp);
        }

        // Иконки квестов пульсируют
        for (const ms of this.missionState) {
            if (ms.status === 'open') {
                const mesh = this.missionIcons.get(ms.def.roomKey);
                if (mesh) {
                    const s = 1 + 0.2 * Math.sin(this.realSec * 6);
                    mesh.scaling.set(s, s, 1);
                }
            }
        }

        const log = UI.get('log');
        if (log && this._log) log.setText(this._log.join('\n'));
    }

    update(dt) {
        const c = Game.cfg();
        this.realSec += dt;
        this.uiTick -= dt;
        if (this.uiTick <= 0) {
            this.uiTick = c.uiTick;
            this.tick();
        }
        this.moveWorkers(dt);
        this.updateMissions();
    }
}
