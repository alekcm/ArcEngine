// ============================================================================
//  fs-mutate-rules.mjs — мутационная таблица проверок правил
// ----------------------------------------------------------------------------
//  node tools/fs-mutate-rules.mjs              все мутации
//  node tools/fs-mutate-rules.mjs mat-         только проверки, в имени которых есть слово
//  node tools/fs-mutate-rules.mjs --list       напечатать таблицу, ничего не менять
//
//  tools/fs-mutate.mjs ломает строки движка и смотрит на карты
//  (tools/fs-card-check.mjs). Здесь то же самое для сверки с правилами
//  (tools/fs-audit.mjs): каждая строка таблицы выключает ОДНО правило, после
//  чего прогоняется одна проверка аудита — и она обязана покраснеть.
//
//  Зачем это отдельным файлом: «проверка проходит» само по себе ничего не
//  доказывает — правило может быть выключено, а проверка остаться зелёной
//  (она тогда держится посторонним отказом или совпадением). Мутация,
//  которая выжила, — это проверка без доказательства, и она попадает в отчёт.
//
//  Правило таблицы: ломать смысл, а не форматирование. `MATERIEL_MAX: 99` —
//  мутация, `MATERIEL_MAX: 14 ` (пробел) — нет: вторую не заметит ни одно
//  правило, и она только увеличит счёт.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

/**
 * `old` обязан встречаться в `file` ровно один раз: иначе мутация меняет не ту
 * строку, и «поймано» ничего не значит. `check` — фильтр аудита (подстрока
 * имени или текста проверки).
 */
const TABLE = [
    // --- материя: предел, накопление, старт, цена, тайник -------------------
    {
        check: 'mat-1',
        file: 'js/fs/core/FSRulesConfig.js',
        old: 'MATERIEL_MAX: 14,',
        new: 'MATERIEL_MAX: 99,',
        why: '«The maximum amount of materiel that a player can have at any time is 14»',
    },
    {
        check: 'mat-2',
        file: 'js/fs/core/FSPlayers.js',
        old: 'this.data.materiel = Math.min(FS_RULES_CONFIG.MATERIEL_MAX, this.materiel + Math.max(0, Number(n) || 0));',
        new: 'this.data.materiel = Math.max(0, Number(n) || 0);',
        why: '«Unspent materiel persists from round to round» — доход не заменяет диск',
    },
    {
        check: 'mat-3',
        file: 'js/fs/rules/SetupRules.js',
        old: '                materiel: 6,',
        new: '                materiel: 2,',
        why: '«Each player begins the game with the amount of materiel in the Initial Forces box»',
    },
    {
        check: 'mat-4',
        file: 'js/fs/rules/DeployRules.js',
        old: '        this.engine.player(state, seat).payMateriel(total);',
        new: '        /*мутация: покупки приказа не оплачены*/',
        why: '«he decreases his materiel dial by an amount equal to the materiel cost»',
    },
    {
        check: 'mat-5',
        file: 'js/fs/rules/DeployRules.js',
        old: 'if (o.cache) cost = Math.max(0, cost - FS_RULES_CONFIG.CACHE_VALUE);',
        new: 'if (o.cache) cost = Math.max(0, cost);',
        why: '«A player can spend one cache token … to reduce its materiel cost by 2»',
    },
    // --- сброс карты, конвертация, потеря кубика ---------------------------
    {
        check: 'discard-1',
        file: 'js/fs/FSCards.js',
        old: '    discard(name) {\n        if (this.take(name) === null) return false;\n        this.deck.add(name);',
        new: '    discard(name) {\n        if (this.take(name) === null) return false;',
        why: '«…immediately shuffled back into the player’s deck» — сброс возвращает карту в колоду',
    },
    {
        check: 'convert-1',
        file: 'js/fs/effects/FSDiceSteps.js',
        old: '            if (liveIndex(s2, i)) turn.put(s2, i, step.to);',
        new: "            if (liveIndex(s2, i)) turn.put(s2, i, step.to === 'morale' ? 'att' : step.to);",
        why: 'Convert: кубик встаёт новой гранью, а не прежней',
    },
    {
        check: 'gainlose-1',
        file: 'js/fs/effects/ask/FSDiceAsks.js',
        old: '            const gone = options.slice(0, n);',
        new: '            const gone = options.slice(0, 1);',
        why: '«he loses as many … as he is able to» — теряется столько, сколько просили',
    },
    {
        check: 'gainlose-1',
        file: 'js/fs/core/FSPlayers.js',
        old: 'const take = Math.max(0, Math.min(n, have));',
        new: 'const take = Math.max(0, n);',
        why: '«If he does not have any of the required … tokens, he loses nothing» — не в минус',
    },
    // --- очередь боя -------------------------------------------------------
    {
        check: 'simul-1',
        file: 'js/fs/rules/CombatRules.js',
        old: "        if (side === 'attacker') turn.setStep('reinforce-defender');\n        else { turn.setStep('choose-attacker'); this.advanceCombatSteps(state); }",
        new: "        if (side === 'attacker') turn.setStep('choose-attacker');\n        else { turn.setStep('reinforce-defender'); this.advanceCombatSteps(state); }",
        why: '«the attacker resolves his abilities first followed by the defender»',
    },
    // --- области, уничтожение, выбывание -----------------------------------
    {
        check: 'areas-1',
        file: 'js/fs/rules/SetupRules.js',
        old: '            areas: tile.areas.map(a => ({',
        new: '            areas: tile.areas.slice(0, 3).map(a => ({',
        why: '«Each system is divided into four areas» — тайл даёт четыре области, не три',
    },
    {
        check: 'areas-2',
        file: 'js/fs/core/FSBoard.js',
        old: "        if (this.warSeatsAt(systemId, pos).size > 1) return 'contested';",
        new: '        if (false) return \'contested\';',
        why: '«Contested: … units or structures belonging to two factions»',
    },
    {
        check: 'areas-2',
        file: 'js/fs/core/FSBoard.js',
        old: "        return theirs ? 'enemy' : 'uncontrolled';",
        new: "        return 'uncontrolled';",
        why: '«Enemy: … at least one of an opponent’s units or structures»',
    },
    {
        check: 'destroy-1',
        file: 'js/fs/rules/SetupRules.js',
        old: '        p.supply.units[unit.unit] = (p.supply.units[unit.unit] || 0) + 1;',
        new: '        /*мутация: уничтоженный отряд не вернулся в запас*/',
        why: '«…placed back in its owner’s play area»',
    },
    {
        check: 'destroy-2',
        file: 'js/fs/rules/SetupRules.js',
        old: '    destroyStructure(state, s) {\n        const i = state.structures.indexOf(s);\n        if (i >= 0) state.structures.splice(i, 1);',
        new: '    destroyStructure(state, s) {\n        const i = state.structures.indexOf(s);\n        if (i >= 0) { /*мутация: постройка осталась на доске*/ }',
        why: '«Destroyed structures are returned to the supply of unused components»',
    },
    {
        check: 'elim-1',
        file: 'js/fs/rules/RefreshRules.js',
        old: 'const has = this.engine.friendlyWorlds(state, p.seat) > 0;',
        new: "const has = state.systems.some(sys => sys.areas.some(a => this.engine.control(state, p.seat, sys.id, a.pos) === 'friendly'));",
        why: '«A player is eliminated … if he does not have any friendly worlds» — мир, не область',
    },
    {
        check: 'active-2',
        file: 'js/fs/rules/AdvanceRules.js',
        old: "        if (march.hasMoved(unit.id)) return { ok: false, error: 'Этот отряд уже сдвинулся в этом приказе.' };",
        new: "        if (march.hasMoved(unit.id)) return { ok: false, error: 'Этот отряд уже сдвинулся в этом приказе.' };\n        if (target.system !== OrderContext.of(order).system && def0 && def0.type === 'ground') return { ok: true };",
        why: '«The destination must be in the active system» — марш мимо активной системы',
    },
    {
        check: 'dom-4',
        file: 'js/fs/rules/DominateRules.js',
        old: '        if (OrderContext.of(state.order).nested) {',
        new: '        if (false) {',
        why: '«Доминирование (сбор активов из 1 мира …)» — ограниченный приказ собирает один мир',
    },
    {
        check: 'event-4',
        file: 'js/fs/rules/RefreshRules.js',
        old: "        const inPlay = card && card.type === 'scheme' ? card.name : null;",
        new: '        const inPlay = null;',
        why: '«Scheme event cards remain in play.» — план не уходит в колоду',
    },
    {
        check: 'event-4',
        file: 'js/fs/rules/RefreshRules.js',
        old: '        for (const name of phase.drawn) if (name !== inPlay) p.decks.event.push(name);',
        new: '        for (const name of phase.drawn) if (false) p.decks.event.push(name);',
        why: '«Tactic event cards … are then shuffled back into the player’s event deck»',
    },
    {
        check: 'sheet-2',
        file: 'js/fs/FSData.js',
        old: '    "factory": 1,\n    "city": 0,\n    "bastion": 1,\n    "forge": 0,\n    "cache": 0,\n    "reinforcement": 1,\n    "prosperity": 0,\n    "choice": 0\n   },\n   "ability": {\n    "name": "Тёмный Портал",',
        new: '    "factory": 1,\n    "city": 0,\n    "bastion": 0,\n    "forge": 0,\n    "cache": 0,\n    "reinforcement": 1,\n    "prosperity": 0,\n    "choice": 0\n   },\n   "ability": {\n    "name": "Тёмный Портал",',
        why: '«Всего на старте: … 1 фабрика, 1 бастион» у некронов',
    },
    {
        check: 'sheet-2',
        file: 'js/fs/FSData.js',
        old: '    "reinforcement": 0,\n    "prosperity": 0,\n    "choice": 0\n   },\n   "ability": {\n    "name": "Массовое Производство",',
        new: '    "reinforcement": 1,\n    "prosperity": 0,\n    "choice": 0\n   },\n   "ability": {\n    "name": "Массовое Производство",',
        why: '«Прочее на старте: 1 фабрика» у гвардии — жетона подкрепления нет',
    },
    {
        check: 'abil-3',
        file: 'js/fs/FSEffects.js',
        old: "                    case 'friendlyWorldWithStructureActive':\n                        ok = world && sys.id === active && mine\n                            && R.hasStructure(state, sys.id, area.pos);",
        new: "                    case 'friendlyWorldWithStructureActive':\n                        ok = world && sys.id === active;",
        why: '«в любом дружественном мире активной системы, который содержит постройку»',
    },
    {
        check: 'sheet-1',
        file: 'js/fs/FSData.js',
        old: '     "name": "Гвардейцы",\n     "kl": 0,\n     "cost": 2,\n     "forge": false,\n     "combat": 1,\n     "health": 1,\n     "morale": 2,',
        new: '     "name": "Гвардейцы",\n     "kl": 0,\n     "cost": 2,\n     "forge": false,\n     "combat": 2,\n     "health": 1,\n     "morale": 2,',
        why: 'планшет Имперской гвардии: у Гвардейцев бой 1',
    },
    {
        check: 'sheet-1',
        file: 'js/fs/FSData.js',
        old: '     "id": "корабли-гробницы",\n     "name": "Корабли-гробницы",\n     "kl": 2,\n     "cost": 5,\n     "forge": true,\n     "combat": 3,\n     "health": 6,\n     "morale": 4,\n     "type": "ship",\n     "start": 0,\n     "max": 2',
        new: '     "id": "корабли-гробницы",\n     "name": "Корабли-гробницы",\n     "kl": 2,\n     "cost": 5,\n     "forge": true,\n     "combat": 3,\n     "health": 6,\n     "morale": 4,\n     "type": "ship",\n     "start": 0,\n     "max": 3',
        why: 'планшет некронов: кораблей-гробниц не больше двух',
    },
    {
        check: 'upg-1',
        file: 'js/fs/rules/StrategizeRules.js',
        old: "        if (!order) return { ok: false, error: 'Сейчас нельзя покупать улучшения.' };",
        new: "        if (false) return { ok: false, error: 'Сейчас нельзя покупать улучшения.' };",
        why: '«A player can purchase upgrade cards when he resolves a Strategize Order.»',
    },
    {
        check: 'city-1',
        file: 'js/fs/core/FSPlayers.js',
        old: '        return this.cities() + bonus;',
        new: '        return bonus;',
        why: '«Each city that a player has on the game board increases his command level by one»',
    },
    {
        check: 'city-1',
        file: 'js/fs/core/FSPlayers.js',
        old: '        const used = (this.state.structures || []).filter(s => s.seat === this.seat).length;',
        new: '        const used = 0;',
        why: '«structure control markers» — жетон контроля тратится на постройку',
    },
    {
        check: 'ord-upg-1',
        file: 'js/fs/rules/StrategizeRules.js',
        old: "            const card = FS_CATALOG.card('orders', p.faction, cmd.card);\n            if (!card) return { ok: false, error: 'Нет такой карты.' };\n            if (card.kl > this.engine.commandLevel(state, seat)) return { ok: false, error: 'Не хватает уровня командования.' };",
        new: "            const card = FS_CATALOG.card('orders', p.faction, cmd.card);\n            if (!card) return { ok: false, error: 'Нет такой карты.' };\n            if (false) return { ok: false, error: 'Не хватает уровня командования.' };",
        why: '«for which he meets the command level requirement»',
    },
    {
        check: 'ord-upg-1',
        file: 'js/fs/rules/RefreshRules.js',
        old: '            for (const u of p.upgrades) u.used = false;',
        new: '            for (const u of p.upgrades) u.used = true;',
        why: '«Order upgrade cards are permanent» — карта не гаснет навсегда',
    },
    {
        check: 'ord-upg-2',
        file: 'js/fs/rules/OperationsRules.js',
        old: '            } else if (!OrderContext.of(state.order).isKind(kind)) {',
        new: '            } else if (false) {',
        why: '«an upgrade card that matches the order he is resolving»',
    },
    {
        check: 'ord-upg-2',
        file: 'js/fs/rules/OperationsRules.js',
        old: '        const up = p.upgrades.find(u => u.name === cmd.card && !u.used);',
        new: '        const up = p.upgrades.find(u => u.name === cmd.card);',
        why: 'улучшение разыгрывается один раз в раунд',
    },
    {
        check: 'first-1',
        file: 'js/fs/core/FSGamePhase.js',
        old: '        this.state.firstPlayer = GamePhase.next(this.firstPlayer, this.count);',
        new: '        this.state.firstPlayer = this.firstPlayer;',
        why: '«the first player passes the first player token to the player to his left»',
    },
    {
        check: 'first-1',
        file: 'js/fs/core/FSGamePhase.js',
        old: '        if (!player || !player.eliminated) return first;',
        new: '        if (true) return first;',
        why: 'первый выбыл — открывает следующий живой',
    },
    {
        check: 'morale-1',
        file: 'js/fs/rules/CombatRules.js',
        old: '            attackerWins = attMorale > defMorale;',
        new: '            attackerWins = attMorale >= defMorale;',
        why: '«If players are tied for morale during a combat, the defender wins the tie.»',
    },
    {
        check: 'morale-1',
        file: 'js/fs/rules/CombatRules.js',
        old: "    moraleFromPieces(state, systemId, pos, seat) {\n        let units = 0;\n        for (const u of this.engine.unitsAt(state, systemId, pos)) {\n            if (u.seat !== seat || u.routed) continue;",
        new: "    moraleFromPieces(state, systemId, pos, seat) {\n        let units = 0;\n        for (const u of this.engine.unitsAt(state, systemId, pos)) {\n            if (u.seat !== seat) continue;",
        why: '«Routed units do not contribute their morale to a player’s total morale.»',
    },
    {
        check: 'contested-1',
        file: 'js/fs/core/FSBoard.js',
        old: '                if (this.warSeatsAt(sys.id, area.pos).size > 1) out.push({ system: sys.id, pos: area.pos });',
        new: '                if (this.warSeatsAt(sys.id, area.pos).size > 0) out.push({ system: sys.id, pos: area.pos });',
        why: '«an area that contains units or structures belonging to two different factions»',
    },
    {
        check: 'orden-1',
        file: 'js/fs/core/FSBoard.js',
        old: '        return tokens.length ? tokens[tokens.length - 1] : null;',
        new: '        return tokens.length ? tokens[0] : null;',
        why: '«their own order tokens that are on the top of a stack» — верх стопки',
    },
    {
        check: 'storm-adj-1',
        file: 'js/fs/rules/AdvanceRules.js',
        old: "        if (from !== target.system && this.engine.stormOn(state, from, target.system)\n            && !OrderMove.of(order).crossesStorm(def)) {\n            return { ok: false, error: 'Варп-шторм преграждает путь.' };\n        }",
        new: "        if (false) {\n            return { ok: false, error: 'Варп-шторм преграждает путь.' };\n        }",
        why: '«Units cannot move through Warp Storms»',
    },
    {
        check: 'adjacency-2',
        file: 'js/fs/core/FSGeometry.js',
        old: "    static SAME_TILE = [['TL', 'TR'], ['BL', 'BR'], ['TL', 'BL'], ['TR', 'BR']];",
        new: "    static SAME_TILE = [['TL', 'TR'], ['BL', 'BR'], ['TL', 'BL'], ['TR', 'BR'], ['TL', 'BR']];",
        why: '«Areas … connected by … the corner of a border are not adjacent»',
    },
    {
        check: 'objs-1',
        file: 'js/fs/rules/RefreshRules.js',
        old: '            const mine = p && this.engine.control(state, p.seat, obj.system, obj.area) === \'friendly\';',
        new: '            const mine = this.engine.control(state, 0, obj.system, obj.area) === \'friendly\';',
        why: '«A player can only collect objective tokens belonging to his faction»',
    },
    {
        check: 'cost-1',
        file: 'js/fs/core/FSCatalog.js',
        old: "    city: { cost: 3, combat: 0, health: 0, morale: 0, kl: 0, name: 'Город' },",
        new: "    city: { cost: 2, combat: 0, health: 0, morale: 0, kl: 0, name: 'Город' },",
        why: '«Город — 3 материи» (02-factions.md, Cost)',
    },
    {
        check: 'icons-1',
        file: 'js/fs/core/FSChance.js',
        old: "    static FACES = ['att', 'def', 'morale'];",
        new: "    static FACES = ['att', 'def', 'morale', 'wild'];",
        why: '«There are three combat icons: offence, defence, and morale»',
    },
    {
        check: 'spend-2',
        file: 'js/fs/effects/FSDiceSteps.js',
        old: '            if (liveIndex(s2, i)) { turn.take(s2, i); spent++; }',
        new: '            if (liveIndex(s2, i)) { spent++; }',
        why: '«…spend materiel, tokens, or dice» — потраченный кубик уходит со стола',
    },
    {
        check: 'voids-1',
        file: 'js/fs/core/FSBoard.js',
        old: "                if (!area.world) continue;\n                if (this.control(seat, sys.id, area.pos) !== 'friendly') continue;\n                sum += area.world.materiel || 0;",
        new: "                if (this.control(seat, sys.id, area.pos) !== 'friendly') continue;\n                sum += (area.world ? area.world.materiel || 0 : 1);",
        why: '«A void … without a world» — пустота в доход материи не входит',
    },
    {
        check: 'orderend-2',
        file: 'js/fs/rules/OperationsRules.js',
        old: '        if (cmd.toEventDeck) {',
        new: '        if (false) {',
        why: '«…may place the order token on top of his event deck instead of resolving its effect»',
    },
    {
        check: 'elim-2',
        file: 'js/fs/rules/RefreshRules.js',
        old: 'const outcome = GameOutcome.of(state).byElimination(alive.length ? alive[0].seat : null);',
        new: 'const outcome = GameOutcome.of(state).byElimination(null);',
        why: '«If only one player remains in the game, that player immediately wins»',
    },
    // --- разделы-отсылки и короткие разделы справочника ----------------------
    {
        check: 'active-1',
        file: 'js/fs/core/FSGamePhase.js',
        old: '        return this.state.turn === undefined ? null : this.state.turn;\n    }\n\n    /** Does this seat hold the turn of the phase? */',
        new: '        return this.state.turn === undefined ? null : 0;\n    }\n\n    /** Does this seat hold the turn of the phase? */',
        why: '«The active player is the player currently … resolving an order token» — ход читается как место 0',
    },
    {
        check: 'borders-1',
        file: 'js/fs/core/FSGeometry.js',
        old: '        return Math.abs(Number(a.row) - Number(b.row)) + Math.abs(Number(a.col) - Number(b.col)) === 1;',
        new: '        return Math.abs(Number(a.row) - Number(b.row)) <= 1 && Math.abs(Number(a.col) - Number(b.col)) <= 1;',
        why: '«Systems that only share the corner of a border are not adjacent» — угол стал границей',
    },
    {
        check: 'attacker-1',
        file: 'js/fs/core/FSCombatSides.js',
        old: "        return side === CombatSides.ATTACKER ? CombatSides.DEFENDER : CombatSides.ATTACKER;\n    },\n\n    /** The seat that plays a side. */",
        new: "        return CombatSides.DEFENDER;\n    },\n\n    /** The seat that plays a side. */",
        why: '«… у атакующего противник — защитник» — вторая сторона боя потеряна',
    },
    {
        check: 'defender-1',
        file: 'js/fs/core/FSCombatSides.js',
        old: '        return seat === combat.attacker ? combat.defender : combat.attacker;',
        new: '        return combat.attacker;',
        why: '«See “Combat”» — противник места назван атакующим',
    },
    {
        check: 'dice-limit-1',
        file: 'js/fs/core/FSCombatTurn.js',
        old: '        return Math.max(0, FS_RULES_CONFIG.DICE_MAX - this.live(side).length);',
        new: '        return Math.max(0, 99 - this.live(side).length);',
        why: '«…he rolls eight dice instead» — предела восьми кубиков нет',
    },
    {
        check: 'health-1',
        file: 'js/fs/core/FSCatalog.js',
        old: '        return f.units.find(u => u.id === unit.unit) || null;',
        new: '        return f.units[0] || null;',
        why: '«See “Damage and Health”» — профиль отряда подменён первым из планшета',
    },
    {
        check: 'suffering-1',
        file: 'js/fs/rules/CombatRules.js',
        old: '        const owner = CombatSides.seatOf(c, side);\n        const rules = CombatDamage.of(c);',
        new: '        const owner = CombatSides.seatOf(c, CombatSides.foe(side));\n        const rules = CombatDamage.of(c);',
        why: '«See “Damage and Health”» — урон назначают отрядам противной стороны',
    },
    {
        check: 'path-1',
        file: 'js/fs/core/FSBoard.js',
        old: '        if (fromSystem === toSystem && fromPos === toPos) return true;',
        new: '        if (true) return true;',
        why: '«…There must be a legal path between the starting world and the destination world» — путь больше не нужен',
    },
    {
        check: 'purchasing-1',
        file: 'js/fs/rules/DeployRules.js',
        old: "        if (!order || (!OrderContext.of(order).isKind('deploy') && !isGuard) || !OrderContext.of(order).isSeat(seat)) {",
        new: '        if (!order || !OrderContext.of(order).isSeat(seat)) {',
        why: '«See “Deploy Order”» — отряды покупаются в любом приказе',
    },
    {
        check: 'scheme-1',
        file: 'js/fs/rules/RefreshRules.js',
        old: "        if (card && card.type === 'scheme') {\n            // «… чтобы осталось не больше 2»",
        new: "        if (card && false) {\n            // «… чтобы осталось не больше 2»",
        why: '«Scheme event cards remain in play» — план не кладётся в игровую зону',
    },
    {
        check: 'tactic-1',
        file: 'js/fs/rules/RefreshRules.js',
        old: "        if (card && card.type === 'scheme') {\n            // «… чтобы осталось не больше 2»",
        new: "        if (card) {\n            // «… чтобы осталось не больше 2»",
        why: '«Tactic event cards are resolved immediately» — тактика остаётся в игровой зоне',
    },
    {
        check: 'worlds-1',
        file: 'js/fs/rules/SetupRules.js',
        old: '                    capacity: a.world.capacity,',
        new: '                    capacity: 9,',
        why: '«The unit capacity of each world is equal to the number of skull icons printed on that world’s banner»',
    },
    {
        check: 'convert-1b',
        file: 'js/fs/effects/FSDiceSteps.js',
        old: '        let done = 0;\n        for (let i = 0; i < dice.length && done < n; i++) {\n            if (dice[i] !== face) continue;\n            dice[i] = to;\n            done++;\n        }',
        new: '        let done = 0;\n        for (let i = 0; i < dice.length && done < n; i++) {\n            if (dice[i] !== face) continue;\n            dice.push(to);\n            done++;\n        }',
        why: '«…places it with the new icon faceup» — кубик добавлен, а не заменён',
    },
];

const args = process.argv.slice(2);
const filter = args.find(a => !a.startsWith('--')) || '';
const LIST = args.includes('--list');
const paint = (code, text) => code + text + '\x1b[0m';

const rows = filter ? TABLE.filter(m => (m.check + ' ' + m.why).toLowerCase().includes(filter.toLowerCase())) : TABLE;
if (LIST) {
    for (const m of rows) console.log([m.check, m.file, m.why].join(' | '));
    process.exit(0);
}

/** Прогон одной проверки аудита: сколько строк с FAIL и что именно упало. */
function run(check) {
    let out = '';
    try {
        out = execFileSync('node', ['tools/fs-audit.mjs', check], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
    } catch (e) {
        out = (e.stdout || '') + (e.stderr || '');
    }
    const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
    if (/Провалено: 0 из/.test(plain) && /0 провалов/.test(plain)) return { failed: [] };
    const failed = plain.split('\n').filter(l => /^\s+FAIL/.test(l)).map(l => l.trim().replace(/^FAIL\s*/, ''));
    // Проверка, которая не нашлась по фильтру, ничего не доказывает.
    if (!failed.length && !/проверок, 0 провалов|проверок, 0 провалов/.test(plain)) {
        if (/0 проверок/.test(plain)) return { failed: ['ни одна проверка не выбрана фильтром'] };
    }
    return { failed };
}

console.log('\x1b[1m  Мутации проверок правил: сломанное правило обязано покраснеть\x1b[0m');

const survivors = [];
let killed = 0;
for (const m of rows) {
    const file = path.join(ROOT, m.file);
    const original = fs.readFileSync(file, 'utf8');
    const at = original.split(m.old).length - 1;
    if (at !== 1) {
        console.log('  ' + paint('\x1b[31m', 'якорь') + '  ' + m.check + ' — строка встречается ' + at + ' раз(а), нужна ровно одна');
        survivors.push({ ...m, why2: 'якорь' });
        continue;
    }
    fs.writeFileSync(file, original.replace(m.old, m.new));
    let res;
    try {
        res = run(m.check);
    } finally {
        fs.writeFileSync(file, original);
    }
    if (res.failed.length) {
        killed++;
        console.log('  ' + paint('\x1b[32m', 'ловит') + '  ' + m.check
            + ' — ' + res.failed[0].slice(0, 100));
    } else {
        console.log('  ' + paint('\x1b[31m', 'выжила') + ' ' + m.check + ' — ' + m.why);
        survivors.push(m);
    }
}

// Чистый прогон обязан быть зелёным, иначе «поймано» ничего не значит.
const clean = run('');
console.log('  ' + (clean.failed.length ? paint('\x1b[31m', 'красно') : paint('\x1b[32m', 'зелено'))
    + ' аудит без мутаций');
if (clean.failed.length) survivors.push({ check: '—', why: 'чистый прогон красный' });

console.log('\n  Мутаций: ' + rows.length + ', поймано: ' + killed + ', выжило: ' + survivors.length);
if (survivors.length) {
    for (const s of survivors) console.log('    — ' + s.check + ': ' + s.why);
    process.exit(1);
}
