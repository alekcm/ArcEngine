// Game.js — Heroes of Might and Magic V (3D Low-Poly Isometric Edition) main game controller.
// Orchestrates Adventure Map exploration, Haven Town management, Spellbook, Hero progression,
// Tactical ATB Combat transitions, declarative UI bindings, spatial audio, and Store saves.

const SAVE_KEY = 'heroes5.save.v1';

class Game {
    /** @param {{ location: Location3D, camera: CameraController, game: Game | Warcraft3RTS | null }} app */
    constructor(app) {
        this.app = app;
        this.loc = app.location;
        this.cam = app.camera;
        this.view = this.loc.view;
        this.ui = UI;
        this.sound = Sound3D;

        this.map = HeroesMap.createMap(this.loc.width, this.loc.height);
        /** @type {any} */
        this.decor = null;
        /** @type {any} */
        this.combat = null;

        this.mode = 'adventure'; // 'adventure' | 'combat'
        this.modal = '';         // '' | 'town' | 'spells' | 'levelup' | 'result' | 'help'
        this.timeSec = 0;
        this._toastTimer = 0;
        this._stepSndTimer = 0;

        // Current movement path on the adventure map.
        /** @type {{ gx: number, gy: number, cost: number, totalCost: number }[]} */
        this.moveQueue = [];
        /** @type {{ gx: number, gy: number, cost: number } | null} */
        this.activeStep = null;
        /** @type {{ gx: number, gy: number }[]} */
        this.plannedPath = [];

        // Enemy AI smooth gallop queue.
        /** @type {{ gx: number, gy: number }[]} */
        this.aiMoveQueue = [];
        /** @type {{ gx: number, gy: number } | null} */
        this.aiActiveStep = null;

        // Level-up choices & result callback.
        /** @type {any[]} */
        this.pendingPerks = [];
        /** @type {(() => void) | null} */
        this.onResultClose = null;

        // Map object lookup by tag.
        /** @type {Map<string, LocationObject>} */
        this.byTag = new Map();
        for (const o of this.loc.objects) {
            if (o.def.tag) this.byTag.set(o.def.tag, o);
        }
        this.playerObj = this.byTag.get('player') || null;
        this.enemyHeroObj = this.byTag.get('enemy_hero') || null;

        // Pre-decode sound effects once per session.
        for (const src of [
            'assets/sounds/step.wav',
            'assets/sounds/gallop.wav',
            'assets/sounds/sword.wav',
            'assets/sounds/arrow.wav',
            'assets/sounds/magic.wav',
            'assets/sounds/gold.wav',
            'assets/sounds/horn.wav',
            'assets/sounds/click.wav',
        ]) {
            this.sound.load(src);
        }

        // Load saved campaign or create a fresh one.
        this.state = this._loadOrCreateState();

        // Sync 3D map objects (including async-loading models via def.x/def.y and setHidden).
        this._syncMapObjectsFromState();
        this._placeActorAtGrid(this.playerObj, this.state.hero.gx, this.state.hero.gy);
        if (this.enemyHeroObj && this.state.enemyHero.alive) {
            this._placeActorAtGrid(this.enemyHeroObj, this.state.enemyHero.gx, this.state.enemyHero.gy);
        }

        // Frame Lord Godric and Haven Castle in panoramic isometric view on start.
        this.cam.c.limits = 1;
        this.cam.setStrategyMode(true);
        this.cam.onHome = () => this._focusHeroOrArena();
        this._restoreAdventureCamera();
        const heroWorld = this.map.cellToWorld(this.state.hero.gx, this.state.hero.gy);
        this.cam.lookAt(heroWorld.x + 60, heroWorld.y - 60);

        this._bindUI();
        this._bindCanvasInput();
        this._bindHotkeys();
        this._populateHelpText();
        this.syncHUD();

        // Build instanced low-poly pine forests, mountain crags, roads & flags asynchronously.
        HeroesMap.createSceneDecor(this.view, this.loc, this.map).then((decor) => {
            this.decor = decor;
            this.decor.updateFlags(this.state.sites, 0);
            if (this.mode === 'combat') this.decor.setVisible(false);
        }).catch((e) => console.error('HeroesMap decor:', e));

        this.toast('Добро пожаловать в Долину Асхана! Захватите Ургаш-Твердыню на северо-востоке.');
    }

    // --- State Creation & Save/Load (via Store only) ---

    _freshState() {
        const startMove = typeof HEROES_HERO_MOVE_PTS !== 'undefined' ? HEROES_HERO_MOVE_PTS : 22;
        /** @type {Record<string, any>} */
        const sites = {};
        for (const s of HeroesMap.SITES) {
            sites[s.id] = {
                owner: s.owner || 'none',
                visited: false,
                collected: false,
                visitedWeek: 0,
            };
        }
        /** @type {Record<string, any>} */
        const guards = {};
        for (const g of HeroesMap.GUARDS) {
            guards[g.id] = { defeated: false };
        }

        return {
            day: 1,
            week: 1,
            victory: false,
            resources: {
                gold: typeof HEROES_START_GOLD !== 'undefined' ? HEROES_START_GOLD : 4500,
                wood: typeof HEROES_START_WOOD !== 'undefined' ? HEROES_START_WOOD : 12,
                ore: typeof HEROES_START_ORE !== 'undefined' ? HEROES_START_ORE : 12,
                crystal: typeof HEROES_START_CRYSTAL !== 'undefined' ? HEROES_START_CRYSTAL : 5,
            },
            hero: {
                name: 'Лорд Годрик',
                gx: 7,
                gy: 24,
                level: 1,
                xp: 0,
                atk: 2,
                def: 2,
                sp: 2,
                know: 2,
                morale: 1,
                luck: 1,
                mana: 20,
                moveBonus: 0,
                movePts: startMove,
                spells: ['smite', 'bless'],
                army: [
                    { id: 'peasant', count: 28 },
                    { id: 'archer', count: 12 },
                    { id: 'footman', count: 5 },
                ],
            },
            town: {
                builtToday: false,
                built: {
                    hall: false,
                    capitol: false,
                    citadel: false,
                    mage_guild: false,
                    barracks: true,
                    armory: false,
                    griffin_tower: false,
                    altar_light: false,
                },
                pool: {
                    peasant: 18,
                    archer: 10,
                    footman: 0,
                    griffin: 0,
                    angel: 0,
                },
            },
            enemyHero: {
                name: 'Лорд Аграил',
                alive: true,
                gx: 24,
                gy: 7,
                level: 4,
                atk: 4,
                def: 3,
                sp: 3,
                know: 3,
                luck: 1,
                army: [
                    { id: 'demon', count: 2 },
                    { id: 'hellhound', count: 10 },
                    { id: 'skeleton', count: 20 },
                    { id: 'imp', count: 26 },
                ],
            },
            sites,
            guards,
        };
    }

    _loadOrCreateState() {
        const saved = Store.getJSON(SAVE_KEY, null);
        if (saved && saved.hero && saved.resources && saved.town && saved.sites && saved.guards) {
            return saved;
        }
        return this._freshState();
    }

    _saveState() {
        Store.set(SAVE_KEY, JSON.stringify(this.state));
    }

    resetNewGame() {
        if (this.combat) {
            this.combat.dispose();
            this.combat = null;
        }
        this.mode = 'adventure';
        this.closeModals();
        this.moveQueue = [];
        this.activeStep = null;
        this.plannedPath = [];
        this.aiMoveQueue = [];
        this.aiActiveStep = null;

        Store.remove(SAVE_KEY);
        this.state = this._freshState();
        this._syncMapObjectsFromState();
        this._placeActorAtGrid(this.playerObj, this.state.hero.gx, this.state.hero.gy);
        this._setActorClip(this.playerObj, 'idle');
        if (this.enemyHeroObj) {
            this._placeActorAtGrid(this.enemyHeroObj, this.state.enemyHero.gx, this.state.enemyHero.gy);
            this._setActorClip(this.enemyHeroObj, 'idle');
        }
        if (this.decor) {
            this.decor.setVisible(true);
            this.decor.updateFlags(this.state.sites, this.timeSec);
            this.decor.showPath([], 0, false);
        }
        this._restoreAdventureCamera();
        this.sound.play('assets/sounds/horn.wav', { volume: 0.55 });
        this.toast('Новая кампания началась! Ведите Когорту Света к победе!');
        this.syncHUD();
    }

    // --- 3D Map Placement & Visibility Sync ---

    /** @param {LocationObject | null} obj @param {string} clipName */
    _setActorClip(obj, clipName) {
        if (!obj) return;
        obj.def.clip = clipName;
    }

    /** @param {LocationObject | null} obj @param {number} gx @param {number} gy */
    _placeActorAtGrid(obj, gx, gy) {
        if (!obj) return;
        const p = this.map.cellToWorld(gx, gy);
        obj.def.x = p.x;
        obj.def.y = p.y;
        this.loc.placeObject(obj);
    }

    _syncMapObjectsFromState() {
        const advVisible = this.mode === 'adventure';
        for (const o of this.loc.objects) {
            const tag = o.def.tag || '';
            let alive = true;
            if (tag === 'enemy_hero') {
                alive = !!this.state.enemyHero.alive;
            } else if (tag.startsWith('guard_')) {
                const gst = this.state.guards[tag];
                alive = !(gst && gst.defeated);
            } else if (tag.startsWith('chest_') || tag.startsWith('pickup_')) {
                const sst = this.state.sites[tag];
                alive = !(sst && sst.collected);
            }
            this.loc.setHidden(o, !(advVisible && alive));
        }
    }

    _restoreAdventureCamera() {
        const advZoom = typeof HEROES_CAM_ADV_ZOOM !== 'undefined' ? HEROES_CAM_ADV_ZOOM : 0.74;
        const defZoom = IS_MOBILE
            ? (typeof CAMERA_ZOOM_MOBILE !== 'undefined' ? CAMERA_ZOOM_MOBILE : 0.55)
            : advZoom;
        const defPitch = (typeof CAMERA_PITCH_DEG !== 'undefined' ? CAMERA_PITCH_DEG : 42) * Math.PI / 180;
        const defAz = (typeof CAMERA_AZIMUTH_DEG !== 'undefined' ? CAMERA_AZIMUTH_DEG : -54) * Math.PI / 180;
        this.cam.zoomToCenter = false;
        this.cam.setCustomBounds({
            minX: 140,
            maxX: this.loc.width - 140,
            minY: 140,
            maxY: this.loc.height - 140,
        }, null);
        this.cam.azimuth = defAz;
        this.cam.pitch = defPitch;
        this.cam.zoomTarget = defZoom;
        this.cam.zoom = defZoom;
        const hw = this.map.cellToWorld(this.state.hero.gx, this.state.hero.gy);
        this.cam.lookAt(hw.x, hw.y);
    }

    _focusHeroOrArena() {
        if (this.mode === 'adventure') {
            const advZoom = typeof HEROES_CAM_ADV_ZOOM !== 'undefined' ? HEROES_CAM_ADV_ZOOM : 0.74;
            this.cam.pitch = (typeof CAMERA_PITCH_DEG !== 'undefined' ? CAMERA_PITCH_DEG : 42) * Math.PI / 180;
            this.cam.zoomTarget = IS_MOBILE
                ? (typeof CAMERA_ZOOM_MOBILE !== 'undefined' ? CAMERA_ZOOM_MOBILE : 0.55)
                : advZoom;
            const hw = this.map.cellToWorld(this.state.hero.gx, this.state.hero.gy);
            this.cam.lookAt(hw.x, hw.y);
        } else if (this.combat) {
            const cZoom = typeof HEROES_CAM_COMBAT_ZOOM !== 'undefined' ? HEROES_CAM_COMBAT_ZOOM : 0.72;
            const cPitch = (typeof HEROES_CAM_COMBAT_PITCH !== 'undefined' ? HEROES_CAM_COMBAT_PITCH : 46) * Math.PI / 180;
            this.cam.azimuth = -Math.PI * 0.5;
            this.cam.pitch = cPitch;
            this.cam.zoomTarget = cZoom;
            this.cam.lookAt(this.combat.centerX, this.combat.centerY + 12);
        }
    }

    // --- Declarative UI Wiring (UILayout.js -> UI.get) ---

    _bindUI() {
        const ui = this.ui;
        /** @param {string} id @param {() => void} fn */
        const click = (id, fn) => {
            const el = ui.get(id);
            if (el) el.onClick(() => fn());
        };

        click('btnTown', () => this.openTownModal());
        click('btnSpells', () => this.openSpellModal());
        click('btnCenter', () => {
            this.sound.play('assets/sounds/click.wav', { volume: 0.4 });
            this._focusHeroOrArena();
        });
        click('btnHelp', () => this.openHelpModal());
        click('btnNewGame', () => this.resetNewGame());
        click('btnEndTurn', () => this.endTurn());

        // Army slot inspection on adventure dock.
        for (let i = 0; i < 5; i++) {
            click('army' + i, () => {
                const slot = this.state.hero.army[i];
                if (!slot || slot.count <= 0) {
                    this.toast('Свободный слот армии. Нанимайте войска в Замке [T]!');
                    return;
                }
                const u = HeroesData.UNITS[slot.id];
                this.sound.play('assets/sounds/click.wav', { volume: 0.35 });
                this.toast(`${u.name} (×${slot.count}): ОЗ ${u.hp}, Урон ${u.minDmg}-${u.maxDmg}, АТК ${u.atk}, ЗАЩ ${u.def} · ${u.traitLabel}`);
            });
        }

        // Town Screen buildings & creature recruitment.
        for (let i = 0; i < HeroesData.BUILDINGS.length; i++) {
            const b = HeroesData.BUILDINGS[i];
            click('townBld' + i, () => this.tryBuildInTown(b.id));
        }
        for (let i = 0; i < HeroesData.HAVEN_RECRUITS.length; i++) {
            const unitId = HeroesData.HAVEN_RECRUITS[i];
            click('townRec' + i, () => this.tryRecruitUnit(unitId, 1));
            click('townRecMax' + i, () => this.tryRecruitUnit(unitId, 9999));
        }
        click('btnTownClose', () => this.closeModals());

        // Spellbook buttons.
        for (let i = 0; i < HeroesData.SPELLS.length; i++) {
            const sp = HeroesData.SPELLS[i];
            click('spell' + i, () => this.onPickSpell(sp));
        }
        click('btnHeroStrike', () => this.onPickHeroStrike());
        click('btnSpellClose', () => this.closeModals());

        // Level-up modal buttons.
        click('lvlOpt0', () => this.chooseLevelPerk(0));
        click('lvlOpt1', () => this.chooseLevelPerk(1));

        // Result & Help modals.
        click('btnResOk', () => {
            this.sound.play('assets/sounds/click.wav', { volume: 0.45 });
            const cb = this.onResultClose;
            this.onResultClose = null;
            this.closeModals();
            if (cb) cb();
        });
        click('btnHelpClose', () => this.closeModals());

        // Tactical Combat action bar buttons.
        click('btnStrikeOrSpell', () => {
            if (this.combat && this.combat.getPendingSpell()) {
                this.combat.cancelSpellMode();
                this.toast('Выбор цели отменён.');
                return;
            }
            this.openSpellModal();
        });
        click('btnWait', () => { if (this.combat) this.combat.cmdWait(); });
        click('btnDefend', () => { if (this.combat) this.combat.cmdDefend(); });
        click('btnAuto', () => { if (this.combat) this.combat.toggleAuto(); });
        click('btnRetreat', () => { if (this.combat) this.combat.cmdRetreat(); });
    }

    _populateHelpText() {
        const helpEl = this.ui.get('helpBody');
        if (!helpEl) return;
        helpEl.setText(
            'ЦЕЛЬ КАМПАНИИ:\n' +
            'Соберите непобедимую армию Ордена Порядка, овладейте шахтами и святилищами\n' +
            'Долины Асхана, сокрушите Лорда Аграила и возьмите штурмом Цитадель Инферно\n' +
            '«Ургаш-Твердыню» на северо-востоке карты!\n\n' +
            'УПРАВЛЕНИЕ НА ГЛОБАЛЬНОЙ КАРТЕ И В БОЮ:\n' +
            '• Клик ЛКМ — проложить путь герою или отдать приказ отряду на арене\n' +
            '• Зажатая ЛКМ / СКМ — плавное перетаскивание карты · Колесо — зум\n' +
            '• Зажатая ПКМ или клавиши [Q] / [E] — вращение изометрической 3D-камеры вокруг цели\n' +
            '• WASD / Стрелки — горизонтальный обзор долины · [R] — вернуть камеру на Героя / Арену\n' +
            '• [T] — Замок «Когорта Света» · [C] — Книга заклинаний · [Пробел] — конец дня\n\n' +
            'ТАКТИЧЕСКИЙ БОЙ (ШКАЛА ATB):\n' +
            '• Изумрудные клетки — ход отряда · Алые — удар или выстрел арбалетчиков\n' +
            '• В ход своего отряда Герой может сотворить заклинание [C] или нанести прямой удар!\n' +
            '• «Ждать» [Z] (0.5 шкалы ATB), «Защита» [X] (+30% к Защите) и «Автобой»'
        );
    }

    _bindHotkeys() {
        window.addEventListener('keydown', (e) => {
            if (e.target && /** @type {HTMLElement} */ (e.target).tagName === 'INPUT') return;
            const code = e.code;
            if (code === 'Escape') {
                if (this.modal && this.modal !== 'levelup' && this.modal !== 'result') {
                    this.closeModals();
                } else if (this.combat && this.combat.getPendingSpell()) {
                    this.combat.cancelSpellMode();
                }
                return;
            }
            if (this.modal) return;

            if (code === 'KeyT' && this.mode === 'adventure') {
                this.openTownModal();
            } else if (code === 'KeyC') {
                this.openSpellModal();
            } else if (code === 'KeyH') {
                this.openHelpModal();
            } else if (code === 'KeyF') {
                this._focusHeroOrArena();
            } else if (code === 'Space' && this.mode === 'adventure') {
                e.preventDefault();
                this.endTurn();
            } else if (code === 'KeyZ' && this.mode === 'combat' && this.combat) {
                this.combat.cmdWait();
            } else if (code === 'KeyX' && this.mode === 'combat' && this.combat) {
                this.combat.cmdDefend();
            }
        });
    }

    _bindCanvasInput() {
        const canvas = World3D.canvas;
        if (!canvas) return;
        let downX = 0, downY = 0, downBtn = -1;

        canvas.addEventListener('pointerdown', (e) => {
            downX = e.clientX;
            downY = e.clientY;
            downBtn = e.button;
        });

        canvas.addEventListener('pointermove', (e) => {
            if (this.modal || this.cam.isDragging()) return;
            const rect = canvas.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;

            if (this.mode === 'combat' && this.combat) {
                const hit = this.view.pointerToGround(px, py, this.combat.arenaY, null);
                if (hit) {
                    const txt = this.combat.onPointerMove(hit.x, hit.y);
                    const hv = this.ui.get('hoverTxt');
                    if (hv) hv.setText(txt);
                }
                return;
            }

            if (this.mode === 'adventure') {
                const hit = this.view.pointerToGround(px, py, 0, this.loc.terrain);
                if (!hit) return;
                this._onAdventureHover(hit.x, hit.y);
            }
        });

        canvas.addEventListener('pointerup', (e) => {
            if (this.modal) return;
            const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
            if (dist > 7) return;

            const rect = canvas.getBoundingClientRect();
            const px = e.clientX - rect.left;
            const py = e.clientY - rect.top;

            if (downBtn === 2) {
                if (this.mode === 'combat' && this.combat && this.combat.getPendingSpell()) {
                    this.combat.cancelSpellMode();
                    this.toast('Выбор цели заклинания отменён.');
                }
                return;
            }
            if (downBtn !== 0) return;

            if (this.mode === 'combat' && this.combat) {
                const hit = this.view.pointerToGround(px, py, this.combat.arenaY, null);
                if (hit) this.combat.onPointerClick(hit.x, hit.y);
                return;
            }

            if (this.mode === 'adventure') {
                const hit = this.view.pointerToGround(px, py, 0, this.loc.terrain);
                if (hit) this._onAdventureClick(hit.x, hit.y);
            }
        });
    }

    // --- Adventure Map Hover & Movement ---

    _describeCell(gx, gy) {
        const h = this.state.hero;
        const playerPow = HeroesData.armyPower(h.army, h);

        const eh = this.state.enemyHero;
        if (eh.alive && eh.gx === gx && eh.gy === gy) {
            const ep = HeroesData.armyPower(eh.army, eh);
            return {
                mode: 'fight',
                text: `⚔ ${eh.name} (Ур. ${eh.level}) · Угроза: ${HeroesData.threatLabel(playerPow, ep)} · ЛКМ — атаковать!`,
            };
        }

        const g = HeroesMap.findTriggerGuard(this.state.guards, gx, gy);
        if (g && g.gx === gx && g.gy === gy) {
            const u = HeroesData.UNITS[g.army[0].id];
            const total = g.army.reduce((s, a) => s + a.count, 0);
            const ep = HeroesData.armyPower(g.army, null);
            return {
                mode: 'fight',
                text: `⚔ ${g.name}: ${HeroesData.stackSizeWord(total)} (${u.name}) · Угроза: ${HeroesData.threatLabel(playerPow, ep)}`,
            };
        }

        const resolved = HeroesMap.resolveTargetCell(this.map, this.state.sites, gx, gy);
        if (resolved.site) {
            const s = resolved.site;
            const st = this.state.sites[s.id];
            if (s.kind === 'town_haven') {
                return { mode: 'now', text: `🏰 ${s.name} · ЛКМ — прийти к вратам (или [T] для управления)` };
            }
            if (s.kind === 'town_inferno') {
                const ep = HeroesData.armyPower(s.garrison, s.siegeHero);
                return { mode: 'fight', text: `🔥 ${s.name} · Финальный штурм! Угроза: ${HeroesData.threatLabel(playerPow, ep)}` };
            }
            if (s.kind === 'mine') {
                const ownLbl = st.owner === 'player' ? 'Под вашим знаменем' : (st.owner === 'enemy' ? 'Захвачена Инферно' : 'Ничейная');
                return { mode: 'now', text: `⛏ ${s.name} · Статус: ${ownLbl}` };
            }
            if (s.kind === 'shrine' || s.kind === 'obelisk') {
                return { mode: 'now', text: `✨ ${s.name}${st.visited ? ' (Уже посещено)' : ''}` };
            }
            if (s.kind === 'windmill') {
                const ready = st.visitedWeek !== this.state.week;
                return { mode: 'now', text: `🌾 ${s.name} · ${ready ? 'Припасы готовы!' : 'Уже собрано на этой неделе'}` };
            }
            return { mode: 'now', text: `💰 ${s.name}` };
        }

        if (this.map.isSolid(gx, gy)) {
            return { mode: 'Blocked', text: 'Непроходимые скалы и чаща Долины Асхана' };
        }
        const isRoad = this.map.terrain[gy * this.map.n + gx] === HeroesMap.TERRAIN_ROAD;
        return {
            mode: 'now',
            text: `${isRoad ? 'Каменный тракт (бонус хода +25%)' : 'Равнина Асхана'} (${gx + 1}, ${gy + 1}) · ЛКМ — поход`,
        };
    }

    _onAdventureHover(wx, wy) {
        if (this.activeStep || this.moveQueue.length > 0) return;
        const { gx, gy } = this.map.worldToCell(wx, wy);
        const info = this._describeCell(gx, gy);
        const hv = this.ui.get('hoverTxt');

        const path = HeroesMap.findPath(this.map, this.state.hero.gx, this.state.hero.gy, gx, gy, {
            guardsState: this.state.guards,
            sitesState: this.state.sites,
            enemyHero: this.state.enemyHero,
        });

        if (this.decor) {
            if (!path) {
                this.decor.showHover(gx, gy, 'Blocked');
                this.decor.showPath([], 0, false);
            } else {
                const last = path[path.length - 1];
                const isFight = info.mode === 'fight' || !!(last && HeroesMap.findTriggerGuard(this.state.guards, last.gx, last.gy));
                const withinDay = !last || last.totalCost <= this.state.hero.movePts + 0.01;
                this.decor.showHover(gx, gy, isFight ? 'fight' : (withinDay ? 'now' : 'later'));
                this.decor.showPath(path, this.state.hero.movePts, isFight);
                if (last && hv) {
                    const costStr = withinDay
                        ? `Ход: ${Math.ceil(last.totalCost)} очк.`
                        : `В пути >1 дня (${Math.ceil(last.totalCost)} очк.)`;
                    hv.setText(`${info.text}  [${costStr}]`);
                    return;
                }
            }
        }
        if (hv) hv.setText(info.text);
    }

    _onAdventureClick(wx, wy) {
        if (this.aiActiveStep || this.aiMoveQueue.length > 0) return;
        const { gx, gy } = this.map.worldToCell(wx, wy);

        const resolved = HeroesMap.resolveTargetCell(this.map, this.state.sites, gx, gy);
        if (resolved.site && resolved.site.kind === 'town_haven' &&
            this.state.hero.gx === resolved.gx && this.state.hero.gy === resolved.gy) {
            this.openTownModal();
            return;
        }

        const path = HeroesMap.findPath(this.map, this.state.hero.gx, this.state.hero.gy, gx, gy, {
            guardsState: this.state.guards,
            sitesState: this.state.sites,
            enemyHero: this.state.enemyHero,
        });

        if (!path || path.length === 0) {
            this.sound.play('assets/sounds/click.wav', { volume: 0.35 });
            this.toast('Туда нельзя пройти!');
            return;
        }

        if (this.state.hero.movePts < 0.74) {
            this.sound.play('assets/sounds/click.wav', { volume: 0.4 });
            this.toast('Очки хода на сегодня исчерпаны! Нажмите «КОНЕЦ ХОДА» [Пробел].');
            return;
        }

        this.sound.play('assets/sounds/click.wav', { volume: 0.45 });
        this._startHeroMovementAlong(path);
    }

    /** @param {{ gx: number, gy: number, cost: number, totalCost: number }[]} path */
    _startHeroMovementAlong(path) {
        this.moveQueue = [];
        this.plannedPath = [];
        for (const step of path) {
            if (step.totalCost <= this.state.hero.movePts + 0.26) {
                this.moveQueue.push(step);
            } else {
                this.plannedPath.push({ gx: step.gx, gy: step.gy });
            }
        }
        if (this.moveQueue.length === 0 && this.state.hero.movePts >= 0.75) {
            this.moveQueue.push(path[0]);
        }
        if (this.moveQueue.length > 0) {
            this._setActorClip(this.playerObj, 'run');
        }
    }

    _onHeroArriveAtCell(gx, gy) {
        const h = this.state.hero;
        h.gx = gx;
        h.gy = gy;

        // 1. Rival Enemy Hero encounter!
        const eh = this.state.enemyHero;
        if (eh.alive && Math.max(Math.abs(eh.gx - gx), Math.abs(eh.gy - gy)) <= 1) {
            this._haltHeroGallop();
            this._beginCombat({
                title: eh.name,
                enemyHero: eh,
                enemyArmy: eh.army,
                isSiege: false,
                onWin: () => {
                    this.state.enemyHero.alive = false;
                    this._syncMapObjectsFromState();
                    const xpGain = 2200;
                    const goldGain = 1800;
                    this.state.resources.gold += goldGain;
                    this._grantHeroXP(xpGain, () => {
                        this.showResultModal(
                            'ПОВЕЛИТЕЛЬ ДЕМОНОВ ПОВЕРЖЕН!',
                            `Лорд Аграил разбит наголову и бежал в недра Шио!\n\nТрофеи битвы:\n• +${goldGain} Золота в казну\n• +${xpGain} Опыта Лорду Годрику\n\nПуть к Цитадели «Ургаш-Твердыня» открыт!`
                        );
                    });
                },
            });
            return true;
        }

        // 2. Neutral Monster Stack (on tile or ZoC)!
        const guard = HeroesMap.findTriggerGuard(this.state.guards, gx, gy);
        if (guard) {
            this._haltHeroGallop();
            if (guard.joinUnit && HeroesData.armyPower(h.army, h) >= HeroesData.armyPower(guard.army, null) * 1.45) {
                const joined = HeroesData.addUnitsToArmy(h.army, guard.joinUnit, guard.joinCount || 3);
                if (joined) {
                    this.state.guards[guard.id].defeated = true;
                    this._syncMapObjectsFromState();
                    this.sound.play('assets/sounds/horn.wav', { volume: 0.65 });
                    const uName = HeroesData.UNITS[guard.joinUnit].name;
                    this._grantHeroXP(guard.xpReward, () => {
                        this.showResultModal(
                            'КРЫЛАТЫЕ СОЮЗНИКИ!',
                            `Узрев знамя Когорты Света, ${uName} (×${guard.joinCount}) добровольно\nприсоединяются к войску Лорда Годрика!\n\n• Получено +${guard.xpReward} Опыта`
                        );
                    });
                    this._saveState();
                    this.syncHUD();
                    return true;
                }
            }

            this._beginCombat({
                title: guard.name,
                enemyHero: null,
                enemyArmy: guard.army,
                isSiege: false,
                onWin: () => {
                    this.state.guards[guard.id].defeated = true;
                    this._syncMapObjectsFromState();
                    this.state.resources.gold += guard.goldReward;
                    this._grantHeroXP(guard.xpReward, () => {
                        this.showResultModal(
                            'ПОБЕДА НАД СТРАЖЕЙ!',
                            `Отряд «${guard.name}» разгромлен!\n\nДобыча:\n• +${guard.goldReward} Золота\n• +${guard.xpReward} Опыта герою`
                        );
                    });
                },
            });
            return true;
        }

        // 3. Map Sites (Castles, Mines, Shrines, Obelisks, Chests, Pickups, Windmill).
        for (const s of HeroesMap.SITES) {
            const onSite = (s.entryGx === gx && s.entryGy === gy) || (s.gx === gx && s.gy === gy);
            if (!onSite) continue;
            const st = this.state.sites[s.id];

            if (s.kind === 'town_haven') {
                h.mana = HeroesData.maxMana(h);
                this._haltHeroGallop();
                this.openTownModal();
                return true;
            }

            if (s.kind === 'town_inferno') {
                this._haltHeroGallop();
                this._beginCombat({
                    title: s.name,
                    enemyHero: s.siegeHero,
                    enemyArmy: s.garrison,
                    isSiege: true,
                    onWin: () => {
                        this.state.sites[s.id].owner = 'player';
                        this.state.victory = true;
                        if (this.decor) this.decor.updateFlags(this.state.sites, this.timeSec);
                        this.sound.play('assets/sounds/horn.wav', { volume: 0.85 });
                        this._saveState();
                        this.showResultModal(
                            'ВЕЛИКАЯ ПОБЕДА В ДОЛИНЕ АСХАНА!',
                            `Цитадель Инферно «Ургаш-Твердыня» пала на ${this.state.day}-й день похода!\n` +
                            `Лорд Годрик (Уровень ${h.level}) водрузил знамя Ордена Порядка над башнями Хаоса.\n\n` +
                            `Вы можете продолжить свободное исследование долины или начать Новую игру!`
                        );
                    },
                });
                return true;
            }

            if (s.kind === 'mine') {
                if (st.owner !== 'player') {
                    st.owner = 'player';
                    if (this.decor) this.decor.updateFlags(this.state.sites, this.timeSec);
                    this.sound.play('assets/sounds/gold.wav', { volume: 0.7 });
                    this.toast(`Знамя поднято! Захвачена «${s.name}»!`);
                    this._saveState();
                    this.syncHUD();
                }
            } else if (s.kind === 'windmill') {
                if (st.visitedWeek !== this.state.week) {
                    st.visitedWeek = this.state.week;
                    this.state.resources.gold += 500;
                    this.state.resources.wood += 3;
                    this.sound.play('assets/sounds/gold.wav', { volume: 0.65 });
                    this.toast('Мельник передал недельные запасы: +500 Золота и +3 Дерева!');
                    this._saveState();
                    this.syncHUD();
                }
            } else if (s.kind === 'shrine') {
                if (!st.visited) {
                    st.visited = true;
                    const spId = s.spell || 'stoneskin';
                    if (!h.spells.includes(spId)) h.spells.push(spId);
                    h.sp += s.bonusSp || 1;
                    h.mana = HeroesData.maxMana(h);
                    const spDef = HeroesData.getSpell(spId);
                    this.sound.play('assets/sounds/magic.wav', { volume: 0.72 });
                    this.toast(`Изучено заклинание «${spDef ? spDef.name : spId}»! +${s.bonusSp} Колдовство, мана полна!`);
                    this._saveState();
                    this.syncHUD();
                }
            } else if (s.kind === 'obelisk') {
                if (!st.visited) {
                    st.visited = true;
                    h.atk += s.bonusAtk || 0;
                    h.def += s.bonusDef || 0;
                    h.know += s.bonusKnow || 0;
                    h.mana = HeroesData.maxMana(h);
                    this.sound.play('assets/sounds/magic.wav', { volume: 0.7 });
                    this._haltHeroGallop();
                    const xpAmt = s.xp || 1000;
                    this._grantHeroXP(xpAmt, () => {
                        this.toast(`Мудрость Обелиска: +${xpAmt} Опыта!`);
                    });
                    this._saveState();
                    this.syncHUD();
                    return true;
                }
            } else if (s.kind === 'chest' && !st.collected) {
                st.collected = true;
                this._syncMapObjectsFromState();
                const gAmt = s.gold || 1000;
                const xAmt = s.xp || 500;
                this.state.resources.gold += gAmt;
                this.sound.play('assets/sounds/gold.wav', { volume: 0.75 });
                this._haltHeroGallop();
                this._grantHeroXP(xAmt, () => {
                    this.toast(`Сундук открыт: +${gAmt} Золота и +${xAmt} Опыта!`);
                });
                this._saveState();
                this.syncHUD();
                return true;
            } else if (s.kind === 'pickup' && !st.collected) {
                st.collected = true;
                this._syncMapObjectsFromState();
                this.state.resources.gold += s.gold || 0;
                this.state.resources.wood += s.wood || 0;
                this.state.resources.ore += s.ore || 0;
                this.state.resources.crystal += s.crystal || 0;
                this.sound.play('assets/sounds/gold.wav', { volume: 0.7 });
                this.toast(`Собрано: ${s.name}`);
                this._saveState();
                this.syncHUD();
            }
        }
        return false;
    }

    _haltHeroGallop() {
        this.moveQueue = [];
        this.activeStep = null;
        this.plannedPath = [];
        this._setActorClip(this.playerObj, 'idle');
        if (this.decor) this.decor.showPath([], 0, false);
    }

    // --- Hero Experience & Leveling ---

    /** @param {number} amount @param {(() => void)=} afterFn */
    _grantHeroXP(amount, afterFn) {
        const h = this.state.hero;
        h.xp += amount;
        const needed = HeroesData.xpForNextLevel(h.level);
        if (h.xp >= needed) {
            h.xp -= needed;
            h.level += 1;
            if (h.level % 2 === 0) h.atk += 1; else h.def += 1;
            h.mana = HeroesData.maxMana(h);
            this.onResultClose = afterFn || null;
            this.openLevelUpModal();
            this._saveState();
            this.syncHUD();
            return;
        }
        this._saveState();
        this.syncHUD();
        if (afterFn) afterFn();
    }

    openLevelUpModal() {
        const pool = HeroesData.PERKS.slice();
        const i0 = Math.floor(Math.random() * pool.length);
        const p0 = pool.splice(i0, 1)[0];
        const p1 = pool[Math.floor(Math.random() * pool.length)];
        this.pendingPerks = [p0, p1];

        this.closeModals();
        this.modal = 'levelup';
        this.sound.play('assets/sounds/horn.wav', { volume: 0.65 });
        this.ui.get('lvlSub').setText(`${this.state.hero.name} достиг ${this.state.hero.level}-го уровня! Выберите талант:`);
        this.ui.get('lvlOpt0').setText(p0.title);
        this.ui.get('lvlOpt1').setText(p1.title);
        this.ui.get('lvlDim').show(true);
    }

    chooseLevelPerk(idx) {
        const perk = this.pendingPerks[idx];
        if (!perk) return;
        this.sound.play('assets/sounds/magic.wav', { volume: 0.65 });
        perk.apply(this.state.hero);
        this.state.hero.mana = Math.min(HeroesData.maxMana(this.state.hero), this.state.hero.mana);
        const nextCb = this.onResultClose;
        this.onResultClose = null;
        this.closeModals();
        this._saveState();
        this.syncHUD();
        if (nextCb) nextCb();
    }

    // --- Haven Town Management ---

    openTownModal() {
        if (this.mode !== 'adventure') {
            this.toast('Замок недоступен во время тактического боя!');
            return;
        }
        this.closeModals();
        this.modal = 'town';
        this.sound.play('assets/sounds/click.wav', { volume: 0.45 });
        if (this.state.town.built.mage_guild) {
            this.state.hero.mana = HeroesData.maxMana(this.state.hero);
        }
        this._refreshTownModal();
        this.ui.get('townDim').show(true);
        this.syncHUD();
    }

    _refreshTownModal() {
        const t = this.state.town;
        const res = this.state.resources;
        const income = HeroesData.townDailyGold(t.built);
        this.ui.get('townSub').setText(
            `Золото: ${res.gold} · Дерево: ${res.wood} · Руда: ${res.ore} · Крист: ${res.crystal}   |   ` +
            `Доход замка: +${income}/день   |   Стройка сегодня: ${t.builtToday ? 'Завершена' : 'Доступна'}`
        );

        for (let i = 0; i < HeroesData.BUILDINGS.length; i++) {
            const b = HeroesData.BUILDINGS[i];
            const el = this.ui.get('townBld' + i);
            if (!el) continue;
            if (t.built[b.id]) {
                el.setText(`✓ ${b.name} — ПОСТРОЕНО\n${b.desc}`);
                continue;
            }
            const reqB = b.req ? HeroesData.getBuilding(b.req) : null;
            const reqMissing = (b.req && !t.built[b.req] && reqB) ? ` [Нужно: ${reqB.name}]` : '';
            const c = b.cost;
            const costParts = [`${c.gold} зол.`];
            if (c.wood) costParts.push(`${c.wood} дер.`);
            if (c.ore) costParts.push(`${c.ore} руды`);
            if (c.crystal) costParts.push(`${c.crystal} крист.`);
            el.setText(`${b.name} (${costParts.join(', ')})${reqMissing}\n${b.desc}`);
        }

        /** @type {Record<string, boolean>} */
        const unlockByUnit = {
            peasant: true,
            archer: !!t.built.barracks,
            footman: !!t.built.armory,
            griffin: !!t.built.griffin_tower,
            angel: !!t.built.altar_light,
        };

        for (let i = 0; i < HeroesData.HAVEN_RECRUITS.length; i++) {
            const uid = HeroesData.HAVEN_RECRUITS[i];
            const u = HeroesData.UNITS[uid];
            const btn1 = this.ui.get('townRec' + i);
            const btnAll = this.ui.get('townRecMax' + i);
            if (!unlockByUnit[uid]) {
                btn1.setText(`🔒 ${u.name} (Ур. ${u.tier})\nПостройте жилище в замке`);
                btnAll.setText('Закрыто');
                continue;
            }
            const avail = t.pool[uid] || 0;
            const crTxt = u.cost.crystal ? ` + ${u.cost.crystal} крист.` : '';
            btn1.setText(
                `${u.name} · В резерве: ${avail}  (+1)\n` +
                `ОЗ ${u.hp} · Ур ${u.minDmg}-${u.maxDmg} · Цена: ${u.cost.gold} зол.${crTxt}`
            );
            btnAll.setText(avail > 0 ? `Нанять\nВСЕХ (${avail})` : 'Нет\nрезерва');
        }
    }

    tryBuildInTown(bldId) {
        const t = this.state.town;
        const b = HeroesData.getBuilding(bldId);
        if (!b) return;
        if (t.built[bldId]) {
            this.toast(`«${b.name}» уже возведено!`);
            return;
        }
        if (t.builtToday) {
            this.toast('В замке можно возводить не более 1 постройки в день!');
            return;
        }
        if (b.req && !t.built[b.req]) {
            const reqB = HeroesData.getBuilding(b.req);
            this.toast(`Сначала требуется построить «${reqB ? reqB.name : b.req}»!`);
            return;
        }
        if (!HeroesData.canAfford(this.state.resources, b.cost)) {
            this.toast('Недостаточно ресурсов в казне королевства!');
            return;
        }

        HeroesData.spend(this.state.resources, b.cost);
        t.built[bldId] = true;
        t.builtToday = true;

        if (b.unlockUnit) {
            const u = HeroesData.UNITS[b.unlockUnit];
            const mult = t.built.citadel ? 1.5 : 1;
            t.pool[b.unlockUnit] = (t.pool[b.unlockUnit] || 0) + Math.ceil(u.growth * mult);
        }
        if (bldId === 'mage_guild') {
            for (const sp of HeroesData.SPELLS) {
                if (!this.state.hero.spells.includes(sp.id)) this.state.hero.spells.push(sp.id);
            }
            this.state.hero.mana = HeroesData.maxMana(this.state.hero);
        }

        this.sound.play('assets/sounds/gold.wav', { volume: 0.72 });
        this.toast(`Построено: «${b.name}»!`);
        this._saveState();
        this._refreshTownModal();
        this.syncHUD();
    }

    tryRecruitUnit(unitId, maxWant) {
        const t = this.state.town;
        const unlockByUnit = {
            peasant: true,
            archer: !!t.built.barracks,
            footman: !!t.built.armory,
            griffin: !!t.built.griffin_tower,
            angel: !!t.built.altar_light,
        };
        if (!unlockByUnit[unitId]) {
            this.toast('Сначала постройте соответствующее жилище войск в Замке!');
            return;
        }
        const u = HeroesData.UNITS[unitId];
        const avail = t.pool[unitId] || 0;
        if (avail <= 0) {
            this.toast('Резерв этих войск исчерпан до начала новой недели!');
            return;
        }

        const res = this.state.resources;
        const maxByGold = Math.floor(res.gold / Math.max(1, u.cost.gold));
        const maxByCrystal = u.cost.crystal > 0 ? Math.floor(res.crystal / u.cost.crystal) : 999999;
        const count = Math.min(avail, maxWant, maxByGold, maxByCrystal);
        if (count <= 0) {
            this.toast('Недостаточно золота или кристаллов для найма!');
            return;
        }

        const hasSame = this.state.hero.army.some(s => s && s.id === unitId && s.count > 0);
        const hasEmpty = this.state.hero.army.length < HeroesData.MAX_SLOTS ||
            this.state.hero.army.some(s => !s || s.count <= 0);
        if (!hasSame && !hasEmpty) {
            this.toast('Все 5 слотов армии Лорда Годрика уже заняты!');
            return;
        }

        res.gold -= count * u.cost.gold;
        res.crystal -= count * (u.cost.crystal || 0);
        t.pool[unitId] -= count;
        HeroesData.addUnitsToArmy(this.state.hero.army, unitId, count);

        this.sound.play('assets/sounds/sword.wav', { volume: 0.55 });
        this.toast(`В строй вступили: ${u.name} (×${count})!`);
        this._saveState();
        this._refreshTownModal();
        this.syncHUD();
    }

    // --- Spellbook & Hero Combat Actions ---

    openSpellModal() {
        this.closeModals();
        this.modal = 'spells';
        this.sound.play('assets/sounds/click.wav', { volume: 0.45 });

        const h = this.state.hero;
        this.ui.get('spellSub').setText(
            `Колдовство: ${h.sp} · Знание: ${h.know} · Мана: ${h.mana} / ${HeroesData.maxMana(h)}` +
            (this.mode === 'adventure' ? '  (Применяются в тактическом бою)' : '  (Выберите заклинание)')
        );

        for (let i = 0; i < HeroesData.SPELLS.length; i++) {
            const sp = HeroesData.SPELLS[i];
            const el = this.ui.get('spell' + i);
            const known = h.spells.includes(sp.id);
            if (!known) {
                el.setText(`🔒 ${sp.name} (${sp.mana} маны) — Не изучено\nПосетите Святилище на карте или постройте Гильдию Магов`);
            } else {
                const pwr = sp.calcPower(h.sp);
                const pwrLbl = (sp.id === 'bless' || sp.id === 'stoneskin') ? `Длит. ${pwr} х.` : `Сила: ${pwr}`;
                el.setText(`✨ ${sp.name} — ${sp.mana} маны  [${pwrLbl}]\n${sp.desc}`);
            }
        }

        const hDmg = HeroesData.calcHeroStrikeDamage(h);
        const strikeBtn = this.ui.get('btnHeroStrike');
        strikeBtn.setText(`⚔ Удар Героя (${hDmg} ур., 0 маны)`);
        strikeBtn.show(this.mode === 'combat');

        this.ui.get('spellDim').show(true);
    }

    /** @param {any} sp */
    onPickSpell(sp) {
        const h = this.state.hero;
        if (!h.spells.includes(sp.id)) {
            this.toast('Это заклинание ещё не изучено Лордом Годриком!');
            return;
        }
        if (this.mode !== 'combat' || !this.combat) {
            this.toast(`«${sp.name}» готово к применению в тактическом бою!`);
            return;
        }
        if (h.mana < sp.mana) {
            this.toast('Недостаточно маны для этого заклинания!');
            return;
        }
        this.closeModals();
        if (this.combat.selectSpellMode(sp)) {
            this.sound.play('assets/sounds/click.wav', { volume: 0.45 });
            this.toast(`Выберите цель на арене для «${sp.name}»!`);
        }
    }

    onPickHeroStrike() {
        if (this.mode !== 'combat' || !this.combat) return;
        this.closeModals();
        const ok = this.combat.selectSpellMode({
            id: 'hero_strike',
            name: 'Удар Лорда Годрика',
            mana: 0,
            target: 'enemy',
        });
        if (ok) {
            this.sound.play('assets/sounds/click.wav', { volume: 0.45 });
            this.toast('Выберите вражеский отряд для прямого удара Героя!');
        }
    }

    openHelpModal() {
        this.closeModals();
        this.modal = 'help';
        this.sound.play('assets/sounds/click.wav', { volume: 0.4 });
        this.ui.get('helpDim').show(true);
    }

    /** @param {string} title @param {string} body @param {(() => void)=} cb */
    showResultModal(title, body, cb) {
        this.closeModals();
        this.modal = 'result';
        this.onResultClose = cb || null;
        this.ui.get('resModalTitle').setText(title);
        this.ui.get('resModalBody').setText(body);
        this.ui.get('resDim').show(true);
    }

    closeModals() {
        this.modal = '';
        for (const id of ['townDim', 'spellDim', 'lvlDim', 'resDim', 'helpDim']) {
            const el = this.ui.get(id);
            if (el) el.show(false);
        }
    }

    // --- End Turn, Daily Economy & Rival AI Hero ---

    endTurn() {
        if (this.mode !== 'adventure' || this.modal) return;
        this._haltHeroGallop();

        this.state.day += 1;
        const newWeek = Math.floor((this.state.day - 1) / 7) + 1;
        const isWeekStart = newWeek > this.state.week;
        this.state.week = newWeek;
        this.state.town.builtToday = false;

        let goldDelta = HeroesData.townDailyGold(this.state.town.built);
        let woodDelta = 0, oreDelta = 0, crystalDelta = 0;

        for (const s of HeroesMap.SITES) {
            if (s.kind !== 'mine') continue;
            const st = this.state.sites[s.id];
            if (st && st.owner === 'player') {
                if (s.resource === 'gold') goldDelta += s.amount || 0;
                else if (s.resource === 'wood') woodDelta += s.amount || 0;
                else if (s.resource === 'ore') oreDelta += s.amount || 0;
                else if (s.resource === 'crystal') crystalDelta += s.amount || 0;
            }
        }
        for (const slot of this.state.hero.army) {
            if (slot && slot.count > 0 && HeroesData.hasTrait(slot.id, 'taxpayer')) {
                goldDelta += slot.count;
            }
        }

        this.state.resources.gold += goldDelta;
        this.state.resources.wood += woodDelta;
        this.state.resources.ore += oreDelta;
        this.state.resources.crystal += crystalDelta;

        const h = this.state.hero;
        h.movePts = HeroesData.maxMovePoints(h);
        const manaRegen = this.state.town.built.mage_guild ? HeroesData.maxMana(h) : Math.max(6, h.know * 3);
        h.mana = Math.min(HeroesData.maxMana(h), h.mana + manaRegen);

        if (isWeekStart) {
            const mult = this.state.town.built.citadel ? 1.5 : 1;
            const t = this.state.town;
            t.pool.peasant += Math.ceil(HeroesData.UNITS.peasant.growth * mult);
            if (t.built.barracks) t.pool.archer += Math.ceil(HeroesData.UNITS.archer.growth * mult);
            if (t.built.armory) t.pool.footman += Math.ceil(HeroesData.UNITS.footman.growth * mult);
            if (t.built.griffin_tower) t.pool.griffin += Math.ceil(HeroesData.UNITS.griffin.growth * mult);
            if (t.built.altar_light) t.pool.angel += Math.ceil(HeroesData.UNITS.angel.growth * mult);

            if (this.state.enemyHero.alive) {
                HeroesData.addUnitsToArmy(this.state.enemyHero.army, 'imp', 10);
                HeroesData.addUnitsToArmy(this.state.enemyHero.army, 'hellhound', 3);
            }
            this.sound.play('assets/sounds/horn.wav', { volume: 0.65 });
            this.toast(`Неделя ${this.state.week} наступила! В замке вырос резерв всех войск (+${goldDelta} зол.)!`);
        } else {
            this.sound.play('assets/sounds/gold.wav', { volume: 0.5 });
            this.toast(`День ${this.state.day}: казна пополнилась (+${goldDelta} зол.)!`);
        }

        if (this.state.enemyHero.alive) {
            const aiSteps = HeroesMap.planEnemyTurn(this.map, this.state);
            this.aiMoveQueue = aiSteps.map(p => ({ gx: p.gx, gy: p.gy }));
            if (this.aiMoveQueue.length > 0) {
                this._setActorClip(this.enemyHeroObj, 'run');
            }
        }

        this._saveState();
        this.syncHUD();
    }

    // --- Tactical Combat Transition ---

    /** @param {{ title: string, enemyHero: any, enemyArmy: any[], isSiege: boolean, onWin?: () => void }} cfg */
    async _beginCombat(cfg) {
        if (this.mode === 'combat') return;
        this.mode = 'combat';
        this.closeModals();
        this.sound.play('assets/sounds/horn.wav', { volume: 0.72 });

        this._syncMapObjectsFromState();
        if (this.decor) this.decor.setVisible(false);

        const cZoom = typeof HEROES_CAM_COMBAT_ZOOM !== 'undefined' ? HEROES_CAM_COMBAT_ZOOM : 0.72;
        const cPitch = (typeof HEROES_CAM_COMBAT_PITCH !== 'undefined' ? HEROES_CAM_COMBAT_PITCH : 46) * Math.PI / 180;
        this.cam.zoomToCenter = true;
        this.cam.pitch = cPitch;
        this.cam.azimuth = -Math.PI * 0.5;
        this.cam.zoomTarget = cZoom;
        this.cam.zoom = cZoom;
        this.cam.lookAt(this.loc.width * 0.5, this.loc.height * 0.5 + 12);

        this.syncHUD();
        this.toast(`⚔ Бой начался: ${cfg.title}!`);

        this.combat = await HeroesCombat.startSession({
            view: this.view,
            loc: this.loc,
            sound: this.sound,
            playerHero: this.state.hero,
            playerArmy: this.state.hero.army,
            enemyHero: cfg.enemyHero,
            enemyArmy: cfg.enemyArmy,
            isSiege: !!cfg.isSiege,
            onHudSync: () => this.syncHUD(),
            onToast: (msg) => this.toast(msg),
            onFinish: (result) => this._endCombat(result, cfg),
        });
        if (this.combat && this.mode === 'combat') {
            this.cam.setCustomBounds({
                minX: this.combat.centerX - 240,
                maxX: this.combat.centerX + 240,
                minY: this.combat.centerY - 180,
                maxY: this.combat.centerY + 180,
            }, this.combat.arenaY);
            this.cam.lookAt(this.combat.centerX, this.combat.centerY + 12);
        }
        this.syncHUD();
    }

    /** @param {{ outcome: string, survivors: any[], casualties: any[] }} result @param {any} cfg */
    _endCombat(result, cfg) {
        if (this.combat) {
            this.combat.dispose();
            this.combat = null;
        }
        this.mode = 'adventure';

        this._syncMapObjectsFromState();
        if (this.decor) {
            this.decor.setVisible(true);
            this.decor.updateFlags(this.state.sites, this.timeSec);
        }

        if (result.outcome === 'victory') {
            this.state.hero.army = result.survivors;
            this._restoreAdventureCamera();
            this.sound.play('assets/sounds/horn.wav', { volume: 0.72 });
            this._saveState();
            this.syncHUD();
            if (cfg.onWin) cfg.onWin();
            return;
        }

        const gate = HeroesMap.SITES[0];
        this.state.hero.gx = gate.entryGx;
        this.state.hero.gy = gate.entryGy;
        this.state.hero.movePts = 0;
        if (result.outcome === 'retreat' && result.survivors.length > 0) {
            this.state.hero.army = result.survivors;
        } else {
            this.state.hero.army = [{ id: 'peasant', count: 16 }, { id: 'archer', count: 6 }];
        }
        this._placeActorAtGrid(this.playerObj, this.state.hero.gx, this.state.hero.gy);
        this._restoreAdventureCamera();
        this._saveState();
        this.syncHUD();

        this.showResultModal(
            result.outcome === 'retreat' ? 'ОТСТУПЛЕНИЕ К ЗАМКУ' : 'ВОЙСКО РАЗБИТО',
            result.outcome === 'retreat'
                ? 'Лорд Годрик отвёл уцелевшие полки под защиту стен «Когорты Света».'
                : 'Полки потерпели поражение, но Лорд Годрик вернулся в «Когорту Света»\nи собрал новое ополчение для реванша!'
        );
    }

    // --- HUD Synchronization ---

    /** @param {string} text */
    toast(text) {
        const p = this.ui.get('toastPanel');
        const t = this.ui.get('toastTxt');
        if (p && t) {
            t.setText(text);
            p.show(true);
            this._toastTimer = 4.2;
        }
    }

    syncHUD() {
        const ui = this.ui;
        const h = this.state.hero;
        const res = this.state.resources;
        const maxMana = HeroesData.maxMana(h);
        const maxMove = HeroesData.maxMovePoints(h);
        const nextXp = HeroesData.xpForNextLevel(h.level);

        ui.get('heroName').setText(`${h.name} · Ур. ${h.level}`);
        ui.get('heroStats').setText(`АТК ${h.atk} · ЗАЩ ${h.def} · КОЛД ${h.sp} · ЗНАН ${h.know}`);
        ui.get('xpBar').setValue(h.xp / Math.max(1, nextXp));
        ui.get('manaBar').setValue(h.mana / Math.max(1, maxMana));
        ui.get('manaTxt').setText(`Мана: ${h.mana} / ${maxMana}`);
        ui.get('moveBar').setValue(h.movePts / Math.max(1, maxMove));
        ui.get('moveTxt').setText(`Ход: ${Math.max(0, Math.floor(h.movePts))} / ${maxMove}`);
        ui.get('heroSub').setText(`Дух +${h.morale} · Удача +${h.luck} · Опыт ${h.xp}/${nextXp}`);

        let dailyGold = HeroesData.townDailyGold(this.state.town.built);
        for (const s of HeroesMap.SITES) {
            if (s.kind === 'mine' && s.resource === 'gold' && this.state.sites[s.id].owner === 'player') {
                dailyGold += s.amount || 0;
            }
        }
        const dayInWeek = ((this.state.day - 1) % 7) + 1;
        ui.get('resTxt').setText(`Золото: ${res.gold}   Дерево: ${res.wood}   Руда: ${res.ore}   Крист: ${res.crystal}`);
        ui.get('dayTxt').setText(`Неделя ${this.state.week} · День ${dayInWeek} (Всего дн. ${this.state.day})  ·  Доход: +${dailyGold} зол./день`);

        const inAdv = this.mode === 'adventure';
        ui.get('advBar').show(inAdv);
        ui.get('btnTown').setText(inAdv ? 'Замок [T]' : 'Замок —');
        ui.get('btnCenter').setText(inAdv ? 'Герой [R]' : 'Арена [R]');
        ui.get('atbPanel').show(!inAdv);
        ui.get('combatLogBox').show(!inAdv);
        ui.get('combatBar').show(!inAdv);

        if (inAdv) {
            for (let i = 0; i < 5; i++) {
                const slot = h.army[i];
                const btn = ui.get('army' + i);
                if (!slot || slot.count <= 0) {
                    btn.setText('Свободно\n—');
                } else {
                    const u = HeroesData.UNITS[slot.id];
                    btn.setText(`${u.short}\n× ${slot.count}\nУр.${u.tier}`);
                }
            }
            return;
        }

        if (!this.combat) return;
        const stacks = this.combat.getStacks();
        const queue = HeroesCombat.predictATBQueue(stacks, 6);
        for (let i = 0; i < 6; i++) {
            const q = queue[i];
            const el = ui.get('atb' + i);
            if (!q) {
                el.setText('—');
            } else {
                const sideMark = q.side === 'player' ? '★' : '☠';
                el.setText(`${sideMark} ${q.short}\n×${q.count}`);
            }
        }

        ui.get('combatLogTxt').setText(this.combat.getLogText());
        ui.get('btnAuto').setText(this.combat.isAutoCombat() ? 'Автобой\nВКЛ' : 'Автобой\nВЫКЛ');

        const act = this.combat.getActiveUnit();
        if (act) {
            const u = HeroesData.UNITS[act.id];
            const shotStr = HeroesData.hasTrait(act.id, 'ranged') ? ` · Выстр: ${act.shots}` : '';
            ui.get('combatTurnTxt').setText(
                `${act.side === 'player' ? 'Ваш ход' : 'Ход врага'}: ${act.name} (×${act.count})`
            );
            ui.get('combatUnitStats').setText(
                `ОЗ верхнего: ${act.topHp}/${act.maxHp} · Урон ${u.minDmg}-${u.maxDmg} · Скор ${act.speed}${shotStr}`
            );
            ui.get('combatHpBar').setValue(act.topHp / Math.max(1, act.maxHp));
        }

        const spPend = this.combat.getPendingSpell();
        ui.get('btnStrikeOrSpell').setText(spPend ? 'Отмена\n[ПКМ]' : (this.combat.canHeroAct() ? 'Магия /\nУдар [C]' : 'Герой\nходил'));
    }

    // --- Main Per-Frame Update Loop ---

    /** @param {number} dt */
    update(dt) {
        this.timeSec += dt;

        const fpsEl = this.ui.get('fps');
        if (fpsEl && World3D.engine) fpsEl.setText(Math.round(World3D.engine.getFps()) + ' fps');

        if (this._toastTimer > 0) {
            this._toastTimer -= dt;
            if (this._toastTimer <= 0) {
                const tp = this.ui.get('toastPanel');
                if (tp) tp.show(false);
            }
        }

        if (this.mode === 'combat') {
            if (this.combat) this.combat.update(dt);
            return;
        }

        if (this.decor) {
            this.decor.updateFlags(this.state.sites, this.timeSec);
        }

        this._updateHeroGallop(dt);
        this._updateEnemyGallop(dt);
    }

    /** @param {number} dt */
    _updateHeroGallop(dt) {
        if (!this.playerObj || !this.playerObj.mesh) return;
        if (!this.activeStep) {
            if (this.moveQueue.length === 0) return;
            const next = this.moveQueue.shift();
            if (!next) return;
            if (this.state.hero.movePts + 0.25 < next.cost && this.state.hero.movePts < 0.75) {
                this._haltHeroGallop();
                return;
            }
            this.state.hero.movePts = Math.max(0, +(this.state.hero.movePts - next.cost).toFixed(2));
            this.activeStep = next;
            this.syncHUD();
        }

        const target = this.map.cellToWorld(this.activeStep.gx, this.activeStep.gy);
        const pos = this.playerObj.mesh.position;
        const dx = target.x - pos.x;
        const dy = target.y - pos.z;
        const dist = Math.hypot(dx, dy);
        const speed = typeof HEROES_HERO_SPEED !== 'undefined' ? HEROES_HERO_SPEED : 440;

        this._stepSndTimer -= dt;
        if (this._stepSndTimer <= 0) {
            this.sound.play('assets/sounds/gallop.wav', { x: pos.x, y: pos.z, volume: 0.48 });
            this._stepSndTimer = typeof GAME_STEP_SEC !== 'undefined' ? GAME_STEP_SEC : 0.32;
        }

        if (dist <= speed * dt + 2) {
            const gx = this.activeStep.gx, gy = this.activeStep.gy;
            this.activeStep = null;
            this._placeActorAtGrid(this.playerObj, gx, gy);

            const stopped = this._onHeroArriveAtCell(gx, gy);
            if (stopped || this.mode !== 'adventure') return;

            if (this.moveQueue.length === 0) {
                this._setActorClip(this.playerObj, 'idle');
                if (this.decor) {
                    this.decor.showPath(
                        this.plannedPath.map((p, i) => ({ gx: p.gx, gy: p.gy, cost: 1, totalCost: 99 + i })),
                        0,
                        false
                    );
                }
                this._saveState();
            }
            return;
        }

        const nx = pos.x + (dx / dist) * speed * dt;
        const ny = pos.z + (dy / dist) * speed * dt;
        const nh = this.loc.terrain ? this.loc.terrain.heightAt(nx, ny) : 0;
        pos.set(nx, nh, ny);
        this.playerObj.def.x = nx;
        this.playerObj.def.y = ny;
        this.playerObj.mesh.rotation.y = Math.atan2(-dy, dx);

        // Smooth camera tracking while hero gallops!
        const ntx = this.cam.target.x + (nx - this.cam.target.x) * Math.min(1, dt * 5);
        const nty = this.cam.target.y + (ny - this.cam.target.y) * Math.min(1, dt * 5);
        this.cam.lookAt(ntx, nty);
    }

    /** @param {number} dt */
    _updateEnemyGallop(dt) {
        if (!this.enemyHeroObj || !this.enemyHeroObj.mesh || !this.state.enemyHero.alive) return;
        if (!this.aiActiveStep) {
            if (this.aiMoveQueue.length === 0) return;
            this.aiActiveStep = this.aiMoveQueue.shift() || null;
            if (!this.aiActiveStep) return;
        }

        const target = this.map.cellToWorld(this.aiActiveStep.gx, this.aiActiveStep.gy);
        const pos = this.enemyHeroObj.mesh.position;
        const dx = target.x - pos.x;
        const dy = target.y - pos.z;
        const dist = Math.hypot(dx, dy);
        const speed = 460;

        if (dist <= speed * dt + 2) {
            const gx = this.aiActiveStep.gx, gy = this.aiActiveStep.gy;
            this.aiActiveStep = null;
            this.state.enemyHero.gx = gx;
            this.state.enemyHero.gy = gy;
            this._placeActorAtGrid(this.enemyHeroObj, gx, gy);

            for (const s of HeroesMap.SITES) {
                if (s.kind === 'mine' && s.entryGx === gx && s.entryGy === gy) {
                    const st = this.state.sites[s.id];
                    if (st && st.owner !== 'enemy') {
                        st.owner = 'enemy';
                        if (this.decor) this.decor.updateFlags(this.state.sites, this.timeSec);
                        this.toast(`Лорд Аграил захватил «${s.name}»!`);
                    }
                }
            }

            if (Math.max(Math.abs(gx - this.state.hero.gx), Math.abs(gy - this.state.hero.gy)) <= 1) {
                this.aiMoveQueue = [];
                this._setActorClip(this.enemyHeroObj, 'idle');
                this._onHeroArriveAtCell(this.state.hero.gx, this.state.hero.gy);
                return;
            }

            if (this.aiMoveQueue.length === 0) {
                this._setActorClip(this.enemyHeroObj, 'idle');
                this._saveState();
            }
            return;
        }

        const nx = pos.x + (dx / dist) * speed * dt;
        const ny = pos.z + (dy / dist) * speed * dt;
        const nh = this.loc.terrain ? this.loc.terrain.heightAt(nx, ny) : 0;
        pos.set(nx, nh, ny);
        this.enemyHeroObj.def.x = nx;
        this.enemyHeroObj.def.y = ny;
        this.enemyHeroObj.mesh.rotation.y = Math.atan2(-dy, dx);
    }
}
