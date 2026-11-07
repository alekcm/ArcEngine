// Game.js — fantasy «Dispatch» на первом этаже гостевого двора (через ArcEngine).
// Игрок управляет персонажами и отправляет их на задания, которые появляются на
// карте иконкой восклицательного знака. Успех определяется совпадением
// суммарных характеристик команды с требуемыми (процент в六угольнике + бросок d100).
// Комментарии на английском по конвенции набора; строки интерфейса — по-русски.

/** @typedef {{ id: string, name: string, color: number, stats: Record<string, number> }} StaffMember */
/** @typedef {{ key: string, name: string, color: number, x: number, y: number, w: number, d: number }} Room */
/** @typedef {{ id: string, roomKey: string, name: string, desc: string, reqs: Record<string, number>, slots: number, duration: number, gold: number, xp: number, hintWords: string[], revealStats: string[] }} MissionDef */
/** @typedef {{ def: MissionDef, status: 'open' | 'sent' | 'done', workerIds: string[], end: number, appear: number, expire: number, result: boolean | null, overlap: number, showUntil: number }} MissionState */

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

const STAFF = [
    { id: 'centaur', name: 'Кентавр', color: 0x8dd3a0, stats: { strength: 2, endurance: 4, wisdom: 4 } },
    { id: 'minotaur', name: 'Девушка бык', color: 0xe07050, stats: { strength: 4, endurance: 4, agility: 2 } },
    { id: 'butler', name: 'Дворецкий', color: 0x70a0e0, stats: { strength: 2, endurance: 1, agility: 2, literacy: 3, charisma: 4 } },
    { id: 'slime', name: 'Девушка слизь', color: 0xa0e0a0, stats: { strength: 2, endurance: 2, agility: 3, literacy: 2, wisdom: 2, charisma: 3 } },
    { id: 'arachne', name: 'Арахна', color: 0xd080e0, stats: { strength: 1, endurance: 1, agility: 4, literacy: 5 } },
];

const ROOMS = [
    { key: 'reception', name: 'Парадная со стойкой регистрации', color: 0xefe6cc, x: 700, y: 560, w: 300, d: 220 },
    { key: 'kitchen', name: 'Кухня', color: 0xf2c98a, x: 460, y: 880, w: 220, d: 180 },
    { key: 'hall', name: 'Большой обеденный зал', color: 0xc9d8c2, x: 1440, y: 880, w: 320, d: 260 },
    { key: 'bar', name: 'Бар', color: 0xd9b973, x: 1500, y: 1240, w: 200, d: 150 },
    { key: 'cellar', name: 'Винный погреб', color: 0x5c3c2f, x: 1590, y: 1310, w: 100, d: 90 },
    { key: 'baths', name: 'Купальни', color: 0xa9c9ea, x: 590, y: 1320, w: 190, d: 150 },
    { key: 'toilets', name: 'Туалеты', color: 0xeaa0a0, x: 800, y: 1480, w: 120, d: 100 },
    { key: 'staff', name: 'Комната прислуги', color: 0xd8c8e8, x: 430, y: 1040, w: 160, d: 130 },
    { key: 'stairs', name: 'Холл у лестницы', color: 0xe8e8d4, x: 1000, y: 620, w: 180, d: 160 },
    { key: 'pantry', name: 'Кладовая продуктов', color: 0xc9b894, x: 820, y: 720, w: 140, d: 120 },
    { key: 'guest1', name: 'Гостевая комната №1', color: 0xf0e0d0, x: 1240, y: 660, w: 150, d: 130 },
    { key: 'guest2', name: 'Гостевая комната №2', color: 0xf0e0d0, x: 620, y: 990, w: 150, d: 130 },
    { key: 'fireplace', name: 'Комната с камином', color: 0xe0c0a0, x: 1180, y: 960, w: 160, d: 140 },
    { key: 'crockery', name: 'Комната для посуды', color: 0xc8c0b8, x: 1340, y: 1120, w: 140, d: 120 },
    { key: 'guard', name: 'Комната охраны', color: 0xb8a8a8, x: 680, y: 1120, w: 140, d: 120 },
    { key: 'maid', name: 'Комната горничных', color: 0xd4c4e4, x: 1090, y: 1220, w: 150, d: 130 },
    { key: 'inventory', name: 'Кладовая инвентаря', color: 0xb7a896, x: 900, y: 1180, w: 130, d: 110 },
];

/** Задания (шаблоны). appearSec — через сколько секунд после старта появится на карте. */
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
        hintWords: 'нарежьте'.split(' ').concat(['варите']), revealStats: ['agility', 'endurance'],
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

        this.realSec = 0;
        this.uiTick = 0;
        this.coins = 0;

        // Staff with run-time state.
        this.staff = STAFF.map(s => Object.assign({}, s, {
            status: 'free',      // free | busy | returning | injured | out
            injuries: 0,         // 0, 1, 2 (2 — выбыл навсегда)
            xp: 0,
            missionId: null,
            target: null,
            _from: null,
            t: 1,
            mesh: null,
        }));

        // Missions with run-time state.
        this.missionState = MISSIONS.map(def => ({
            def, status: 'hidden', workerIds: [], end: 0, appear: 0, expire: 0,
            result: null, overlap: 0, showUntil: 0,
        }));

        // Next mission to spawn (in template order).
        this.nextMissionIndex = 0;

        // 3D sketch of the first floor.
        this.roomMesh = new Map();
        for (const room of ROOMS) this.addRoom(room);

        // Exclamation-mark icons over rooms (shown when a mission is open there).
        this.missionIcons = new Map();   // room key -> mesh
        for (const room of ROOMS) {
            const mesh = BABYLON.MeshBuilder.CreateBox('icon-' + room.key, { width: 24, height: 24, depth: 4 }, this.scene);
            const h = this.terrain ? this.terrain.heightAt(room.x, room.y) : 0;
            mesh.position.set(room.x, h + 30, room.y);
            mesh.setEnabled(false);
            const mat = new BABYLON.StandardMaterial('mat-icon-' + room.key, this.scene);
            mat.diffuseColor = new BABYLON.Color3(1, 0.9, 0.2);
            mat.specularColor = new BABYLON.Color3(0, 0, 0);
            mesh.material = mat;
            World3D.addObject(this.app.location.view, mesh, 'prop');
            this.missionIcons.set(room.key, mesh);
        }

        // Workers start in the staff room.
        const staffRoom = ROOMS.find(r => r.key === 'staff');
        for (const w of this.staff) {
            w.target = { x: staffRoom.x, y: staffRoom.y };
            this.addWorker(w);
        }

        // UI handlers.
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

        this.selected = new Set();   // staff ids selected for the open mission
        this.openMissionId = null;   // mission def id currently being configured

        // Click on the map: open the mission whose exclamation icon is under the pointer.
        const canvas = document.getElementById('world3d');
        if (canvas) {
            canvas.addEventListener('click', (e) => {
                if (this.openMissionId) return;
                const rect = canvas.getBoundingClientRect();
                const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
                for (const ms of this.missionState) {
                    if (ms.status !== 'open') continue;
                    const mesh = this.missionIcons.get(ms.def.roomKey);
                    if (!mesh) continue;
                    const scr = this.app.location.view.projectToScreen(mesh.position.x, mesh.position.z, mesh.position.y);
                    if (scr && scr.visible && !scr.behind) {
                        const dx = scr.x - cx, dy = scr.y - cy;
                        if (dx * dx + dy * dy <= 900) {   // 30 px radius
                            this.openMission(ms.def.id);
                            return;
                        }
                    }
                }
            });
        }

        this.pushLog('Постоялый двор открыт. Следите за восклицательными знаками на карте.');
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

    // ----- 3D sketch -----

    addRoom(room) {
        const mesh = BABYLON.MeshBuilder.CreateBox('room-' + room.key,
            { width: room.w, height: 14, depth: room.d }, this.scene);
        const h = this.terrain ? this.terrain.heightAt(room.x, room.y) : 0;
        mesh.position.set(room.x, h + 7, room.y);
        const mat = new BABYLON.StandardMaterial('mat-' + room.key, this.scene);
        const c = room.color;
        mat.diffuseColor = new BABYLON.Color3(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        mesh.material = mat;
        World3D.addObject(this.app.location.view, mesh, 'prop');
        this.roomMesh.set(room.key, mesh);
    }

    addWorker(w) {
        const mesh = BABYLON.MeshBuilder.CreateBox('worker-' + w.id,
            { width: 20, height: 36, depth: 20 }, this.scene);
        const h = this.terrain ? this.terrain.heightAt(w.target.x, w.target.y) : 0;
        mesh.position.set(w.target.x, h + 18, w.target.y);
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

    // ----- missions -----

    spawnNextMission() {
        if (this.nextMissionIndex >= MISSIONS.length) return;
        const def = MISSIONS[this.nextMissionIndex];
        const ms = this.missionState.find(m => m.def.id === def.id);
        if (!ms) return;
        const urgency = Math.max(10, Math.min(20, Math.round(def.duration / 3)));
        const first = this.nextMissionIndex === 0;
        ms.appear = this.realSec + (first ? 20 : 0);   // first mission after 20 s, rest immediately
        ms.expire = ms.appear + urgency;
        ms.status = 'hidden';
        this.nextMissionIndex++;
        this.pushLog('Скоро на карте появится задание: ' + def.name + '.');
    }

    /** Show an exclamation icon over the mission's room. */
    showIcon(ms) {
        const mesh = this.missionIcons.get(ms.def.roomKey);
        if (mesh) mesh.setEnabled(true);
    }

    hideIcon(ms) {
        const mesh = this.missionIcons.get(ms.def.roomKey);
        if (mesh) mesh.setEnabled(false);
    }

    pushLog(text) {
        const log = UI.get('log');
        // keep simple: store in array, render in tick
        if (!this._log) this._log = [];
        this._log.push(text);
        if (this._log.length > 14) this._log = this._log.slice(this._log.length - 14);
    }

    /** Called when the exclamation icon is clicked (from the 3D picker — here simulated by a hotkey per room). */
    openMission(missionId) {
        const ms = this.missionState.find(m => m.def.id === missionId);
        if (!ms || ms.status !== 'open') return;
        this.openMissionId = missionId;
        this.selected.clear();
        const def = ms.def;
        UI.get('sendTitle').setText(def.name);
        UI.get('sendDesc').setText(def.desc);
        // Hints: highlight key words in orange.
        const hintText = 'Подсказки: ' + def.hintWords.map(w => '*' + w + '*').join(' · ');
        UI.get('sendHints').setText(hintText);
        // Required stats (revealed as hexagon corners).
        let reqLine = 'Требуется: ';
        const reqParts = [];
        for (const key of Object.keys(def.reqs)) reqParts.push(STAT_LABEL_RU[key] + ' ' + def.reqs[key]);
        UI.get('sendOverlap').setText(reqLine + reqParts.join(', '));
        // Slots.
        for (let i = 0; i < 4; i++) {
            const btn = UI.get('slot' + (i + 1));
            btn.setText((i < def.slots ? 'Слот ' + (i + 1) + ' — пусто' : '—'));
            btn.def.fill = (i < def.slots ? '#2a4a60' : '#1a1a1a');
            btn.apply();
        }
        UI.get('sendDim').show(true);
        UI.get('sendWindow').show(true);
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
        // Assign a free worker to this slot if empty, or remove if already selected.
        const already = [...this.selected].find(sid => {
            const w = this.staff.find(st => st.id === sid);
            return w && w._slot === slotIdx;
        });
        if (already) {
            const w = this.staff.find(st => st.id === already);
            if (w) { w._slot = null; }
            this.selected.delete(already);
        } else {
            // Pick first free worker not already selected.
            const free = this.staff.find(w => w.status === 'free' && !this.selected.has(w.id));
            if (free) { free._slot = slotIdx; this.selected.add(free.id); }
        }
        this.refreshSlots();
    }

    refreshSlots() {
        const ms = this.missionState.find(m => m.def.id === this.openMissionId);
        if (!ms) return;
        const def = ms.def;
        // Show selected workers in slots by their slot index.
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
                btn.setText(w.name + ' · готов');
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
        this.pushLog('Отправлена команда на: ' + ms.def.name + '.');
        this.closeSend();
    }

    /** Resolve a finished mission: overlap % -> d100 roll. */
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
            ok = true;   // 100% — auto success
        } else {
            ok = Math.random() * 100 <= pct;   // d100 <= percent
        }

        ms.result = ok;
        ms.status = 'done';
        ms.showUntil = this.now() + c.resultShow;

        // Workers return home.
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
            this.pushLog('Задание «' + ms.def.name + '» выполнено успешно. +' + ms.def.gold + ' монет, +' + ms.def.xp + ' опыта.');
        } else {
            for (const sid of ms.workerIds) {
                const w = this.staff.find(st => st.id === sid);
                if (w) this.injure(w);
            }
            this.pushLog('Задание «' + ms.def.name + '» провалено. Персонажи получили травму.');
        }


    }

    injure(w) {
        w.injuries++;
        for (const key of STAT_KEYS) {
            if (w.stats[key] > 1) w.stats[key]--;
        }
        if (w.injuries >= 2) {
            w.status = 'out';
            this.pushLog(w.name + ' получил вторую травму и выбывает из службы.');
        } else {
            w.status = 'injured';
            this.pushLog(w.name + ' травмирован: характеристики понижены на 1.');
        }
    }

    /** Worker arrives back at staff room: clear busy state. */
    completeReturn(w) {
        w.status = 'free';
        w.missionId = null;
        w.target = this.roomPos('staff');
        w.t = 1;
    }

    /** Result window. */
    showResult(ms) {
        UI.get('resultTitle').setText(ms.result ? 'Задание выполнено' : 'Задание провалено');
        UI.get('resultText').setText(ms.result
            ? 'Задание «' + ms.def.name + '» выполнено успешно.'
            : 'Задание «' + ms.def.name + '» провалено.');
        let detail = 'Требуемые характеристики: ';
        const reqParts = [];
        for (const key of Object.keys(ms.def.reqs)) reqParts.push(STAT_LABEL_RU[key] + ' ' + ms.def.reqs[key]);
        detail += reqParts.join(', ') + '. ';
        detail += 'Отправленные характеристики покрывают на ' + Math.round(ms.overlap * 100) + '%.';
        UI.get('resultDetail').setText(detail);
        if (ms.result) {
            UI.get('resultReward').setText('Награда: +' + ms.def.gold + ' монет, +' + ms.def.xp + ' опыта.');
        } else {
            UI.get('resultReward').setText('Все отправленные персонажи получили травму.');
        }
        UI.get('resultDim').show(true);
        UI.get('resultWindow').show(true);
    }

    closeResult() {
        UI.get('resultDim').show(false);
        UI.get('resultWindow').show(false);
        const ms = this.missionState.find(m => m.def.id === (this.openMissionId || ''));
        // Clear result state so the mission icon can be reused / removed.
        if (ms) {
            ms.result = null;
        }
        // Spawn the next mission in sequence shortly after.
        this._nextSpawn = this.realSec + 3;
    }

    // ----- main loop -----

    moveWorkers(dt) {
        const moveSec = Game.cfg().moveSec;
        for (const w of this.staff) {
            if (!w.target || w.t >= 1 || !w.mesh) continue;
            w.t = Math.min(1, w.t + dt / moveSec);
            const m = w.mesh;
            m.position.x = w._from.x + (w.target.x - w._from.x) * w.t;
            m.position.z = w._from.z + (w.target.y - w._from.z) * w.t;
            const h = this.terrain ? this.terrain.heightAt(m.position.x, m.position.z) : 0;
            m.position.y = h + 18;
            if (w.t >= 1) {
                if (w.status === 'busy') {
                    // Arrived at mission room: nothing more to do until timer ends.
                } else if (w.status === 'returning') {
                    this.completeReturn(w);
                }
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
                this.pushLog('Задание «' + ms.def.name + '» истекло и снято с карты.');
                this.spawnNextMission();
            } else if (ms.status === 'sent' && now + EPS >= ms.end) {
                this.finish(ms);
            } else if (ms.status === 'done' && now + EPS >= ms.showUntil) {
                this.showResult(ms);
            }
        }
        // Returning workers arrive.
        for (const w of this.staff) {
            if (w.status === 'returning' && w.t >= 1) {
                this.completeReturn(w);
            }
        }
        // Delayed next-mission spawn (after result window closed).
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
        if (coins) coins.setText('Монеты: ' + this.coins);

        // Staff cards.
        for (const w of this.staff) {
            const statsText = STAT_KEYS.map(k => STAT_LABEL_RU[k][0] + this.stat(w, k)).join(' ');
            const statsEl = UI.get('card-' + w.id + '-stats');
            if (statsEl) statsEl.setText(statsText);
            const statusEl = UI.get('card-' + w.id + '-status');
            const hurtEl = UI.get('card-' + w.id + '-hurt');
            const xpEl = UI.get('card-' + w.id + '-xp');
            let statusText = '', statusColor = '', hurtText = '';
            if (w.status === 'out') { statusText = 'ВЫБЫВШИЙ'; statusColor = '#a0a0a0'; hurtText = 'Травма ×2 — выбыл'; }
            else if (w.status === 'injured') { statusText = 'ТРАВМИРОВАН'; statusColor = '#f0a0a0'; hurtText = 'Травма ×1: −1 ко всем характеристикам'; }
            else if (w.status === 'busy') {
                const ms = this.missionState.find(m => m.def.id === w.missionId) || null;
                statusText = 'В РЕЙСЕ: ' + (ms ? ms.def.name : '?');
                statusColor = '#f0e080';
            } else if (w.status === 'returning') { statusText = 'ВОЗВРАЩАЕТСЯ'; statusColor = '#c0c0f0'; }
            else { statusText = 'СВОБОДЕН'; statusColor = '#7fd07f'; }
            if (statusEl) { statusEl.setText(statusText); statusEl.def.color = statusColor; statusEl.apply(); }
            if (hurtEl) { hurtEl.setText(hurtText); hurtEl.apply(); }
            if (xpEl) xpEl.setText('ОП ' + w.xp);
        }

        // Mission icons pulse while open.
        for (const ms of this.missionState) {
            if (ms.status === 'open') {
                const mesh = this.missionIcons.get(ms.def.roomKey);
                if (mesh) {
                    const s = 1 + 0.15 * Math.sin(this.realSec * 4);
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
