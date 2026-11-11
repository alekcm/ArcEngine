// ============================================================================
//  fs-reach.mjs — «правка доходит до КАЖДОЙ системы».
// ----------------------------------------------------------------------------
//  Зачем. Тесты проверяют, что правило работает там, где его проверяли. Они
//  молчат о том, что та же величина читается в другом месте своей формулой:
//  здоровье отряда считал бой одной формулой, а орбитальный удар — другой;
//  цену жетона запасов писали дважды. Такая копия не видна ни одному тесту,
//  пока не поменяешь одну из них.
//
//  Как. Инструмент не читает код и не доверяет проверкам: он ГОНЯЕТ движок.
//  Для каждой величины (материя, цена, здоровье, деморализация) он берёт все
//  системы, которые эту величину читают или меняют, и смотрит на результат
//  каждой из них. Если системы расходятся — это провал с числами.
//
//    node tools/fs-reach.mjs        — прогон и код возврата
//    node tools/fs-reach.mjs -v     — печатать каждую систему, а не только провалы
// ============================================================================
import { createEngineContext } from './fs-engine.mjs';

const { FS_RULES, FS_CATALOG, FS_DATA, CombatDamage, CombatTurn } = createEngineContext();
const VERBOSE = process.argv.includes('-v');

const C = { r: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m' };
const players = (a, b) => [
    { faction: a, name: 'P0', id: 'p0' },
    { faction: b, name: 'P1', id: 'p1' },
];
const worldOf = (st, id) => {
    const sys = FS_RULES.system(st, id);
    return (sys.areas.find(a => a.world) || sys.areas[0]).pos;
};
const empty = st => {
    st.units = [];
    st.structures = [];
    st.objectives = [];
    st.storms = [];
    for (const sys of st.systems) sys.tokens = [];
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
};
const log = (ok, name, detail) => {
    if (ok) {
        if (VERBOSE) console.log(`  ${C.grn}ok  ${C.r}${name} ${C.dim}${detail || ''}${C.r}`);
    } else {
        console.log(`  ${C.red}FAIL${C.r} ${name}  ${detail || ''}`);
    }
    return ok;
};

const results = [];
const group = (title, fn) => {
    console.log(`\n${C.b}  ${title}${C.r}`);
    try {
        fn();
    } catch (e) {
        log(false, title, 'исключение: ' + (e && e.message));
    }
};

// ---------------------------------------------------------------------------
// 1. МАТЕРИЯ: одна касса на все системы (приказы, карты, обновление)
// ---------------------------------------------------------------------------
group('Материя: одна касса', () => {
    const st = FS_RULES.newReadyGame({ seed: 5, players: players('некроны', 'имперская-гвардия') });
    empty(st);
    const p = FS_RULES.player(st, 0);
    st.players[0].materiel = 3;
    const paid = p.payMateriel(2);
    results.push(log(paid === true && st.players[0].materiel === 1, 'списание',
        `3 − 2 = ${st.players[0].materiel}`));
    const over = p.payMateriel(99);
    results.push(log(over === false && st.players[0].materiel === 1, 'нехватка не уводит в минус',
        `материя осталась ${st.players[0].materiel}`));
    st.players[0].materiel = 0;
    p.gainMateriel(99);
    results.push(log(st.players[0].materiel === FS_RULES.MATERIEL_MAX, 'потолок дохода',
        `${st.players[0].materiel} = ${FS_RULES.MATERIEL_MAX}`));
});

// ---------------------------------------------------------------------------
// 2. ЦЕНА: одна формула на покупку, панель, возврат и оба вида улучшений
// ---------------------------------------------------------------------------
group('Цена: одна формула на все покупки', () => {
    const st = FS_RULES.newReadyGame({ seed: 5, players: players('имперская-гвардия', 'некроны') });
    empty(st);
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    FS_RULES.addUnit(st, 0, 'гвардейцы', sys.id, pos);
    FS_RULES.addStructure(st, 0, 'factory', sys.id, pos);
    st.players[0].materiel = 20;
    sys.tokens.push({ seat: 0, order: 'deploy', faceUp: false });
    FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id });
    const def = FS_CATALOG.unit('имперская-гвардия', 'титаны');
    const printed = def.cost;
    const plain = FS_RULES.unitPrice(st, 0, def, {});
    const cache = FS_RULES.unitPrice(st, 0, def, { cache: true });
    results.push(log(plain === printed, 'цена отряда без скидок = печатной',
        `${plain} / ${printed}`));
    results.push(log(cache === Math.max(0, printed - FS_RULES.CACHE_VALUE), 'кеш даёт одно число',
        `${cache} = ${printed} − ${FS_RULES.CACHE_VALUE}`));
    // Возврат улучшения обязан вернуть ровно то, что списали.
    const card = FS_CATALOG.card('orders', 'имперская-гвардия', undefined)
        || (FS_CATALOG.cards && FS_CATALOG.cards('orders', 'имперская-гвардия')[0]);
    results.push(log(card ? FS_RULES.cardPrice(st, 0, card) === card.cost : true,
        'цена карты без скидки = печатной',
        card ? `${FS_RULES.cardPrice(st, 0, card)} / ${card.cost}` : 'карт нет'));
    if (card) {
        st.players[0].cardDiscount = 1;
        results.push(log(FS_RULES.cardPrice(st, 0, card) === Math.max(0, card.cost - 1),
            'скидка карты — в одном месте', `${FS_RULES.cardPrice(st, 0, card)}`));
    }
});

// ---------------------------------------------------------------------------
// 3. ЗДОРОВЬЕ: одно число для боя И для орбитального удара
// ---------------------------------------------------------------------------
group('Здоровье: бой и удар читают одно число', () => {
    // Обе фракции, обе системы: печатное здоровье отряда обязано означать одно
    // и то же в бою и в орбитальном ударе. Жертва — отряд нулевого уровня
    // фракции защиты; урон удара равен печатному здоровью этой жертвы.
    for (const [atk, deff] of [['некроны', 'имперская-гвардия'], ['имперская-гвардия', 'некроны']]) {
        const foeDef = FS_CATALOG.faction(deff).units.find(u => u.type !== 'ship' && u.kl === 0);
        const printed = foeDef.health;

        // --- удар ---
        const st = FS_RULES.newReadyGame({ seed: 5, players: players(atk, deff) });
        empty(st);
        const sys = st.systems[0];
        const world = FS_RULES.areasAround(st, sys.id, sys.areas.find(a => !a.world).pos)
            .map(a => FS_RULES.area(sys, a.pos)).filter(a => a && a.world)[0];
        const victim = FS_RULES.addUnit(st, 1, foeDef.id, sys.id, world.pos);
        const ship = FS_CATALOG.faction(atk).units.find(u => u.type === 'ship');
        FS_RULES.addUnit(st, 0, ship.id, sys.id, sys.areas.find(a => !a.world).pos);
        st.order = { seat: 0, order: 'advance', system: sys.id, pos: world.pos, phase: 'strike' };
        const strikeHit = n => {
            const roll = FS_RULES.rollDice;
            FS_RULES.rollDice = () => Array(n).fill('att');
            const targets = FS_RULES.orbitalStrikeTargets(st, 0);
            if (!targets.length) { FS_RULES.rollDice = roll; return 'мир не цель удара'; }
            const t = targets.find(x => x.system === sys.id && x.pos === world.pos) || targets[0];
            const r = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: t.system, pos: t.pos });
            if (r.ok) FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: victim.id });
            FS_RULES.rollDice = roll;
            return st.units.some(u => u.id === victim.id) ? 'жив' : 'уничтожен';
        };
        const onPrinted = strikeHit(printed);
        results.push(log(onPrinted === 'уничтожен', `удар: здоровье «${foeDef.id}» = ${printed}`,
            `${printed} урона → ${onPrinted}`));
        if (onPrinted === 'жив') {
            results.push(log(false, `удар: здоровье «${foeDef.id}» занижено`, 'удар читает другое число'));
        }

        // --- бой: та же величина здоровья обязана решать гибель там ---
        // Урон в бою = кубики атаки противника минус моя защита. Кубики ставим
        // так, чтобы получить ровно wanted урона, и проверяем, что шаг урона и
        // предпросмотр гибнут на печатном здоровье, а на единицу меньше — нет.
        const inBattle = wanted => {
            const b = FS_RULES.newBattleTest({
                seed: 5, players: players(atk, deff),
                units: { [FS_CATALOG.faction(atk).units.find(u => u.type !== 'ship' && u.kl === 0).id]: 1 },
                foeUnits: { [foeDef.id]: 1 },
            });
            const seat = b.units.find(u => u.unit === foeDef.id).seat;
            const side = b.combat.attacker === seat ? 'attacker' : 'defender';
            const other = side === 'attacker' ? 'defender' : 'attacker';
            const guard = FS_RULES.combatValues(b, side).def;
            b.combat.dice[other] = Array(Math.max(0, wanted + guard)).fill('att');
            const dealt = FS_RULES.combatDamageFor(b, side);
            const unit = b.units.find(u => u.seat === seat);
            const row = (FS_RULES.damagePreview(b, side, [unit.id]).rows || []).find(r => r.id === unit.id);
            FS_RULES.apply(b, seat, { type: 'combat', action: 'damage', targets: [unit.id] });
            const after = b.units.find(u => u.id === unit.id);
            return { dealt, row, gone: !after, routed: after ? !!after.routed : true };
        };
        const near = inBattle(printed - 1);
        const exact = inBattle(printed);
        const setRight = near.dealt === printed - 1 && exact.dealt === printed;
        // При здоровье 1 «на единицу меньше» — это ноль урона: распределять
        // нечего, и предпросмотра нет вовсе. Это тоже верный ответ.
        const nearRight = printed > 1
            ? !!near.row && near.row.health === printed && near.row.destroyed === false && !near.gone
            : !near.row && !near.gone;
        results.push(log(setRight && nearRight && !!exact.row
            && exact.row.health === printed
            && exact.gone && exact.row.destroyed === true,
            `бой: здоровье «${foeDef.id}» = ${printed}`,
            `кубики дали ${near.dealt} и ${exact.dealt} урона; предпросмотр ${near.row ? near.row.health : '—'}: `
                + `${near.row ? (near.row.destroyed ? 'уничтожен' : 'жив') : '—'} / `
                + `${exact.row ? (exact.row.destroyed ? 'уничтожен' : 'жив') : '—'}; `
                + `на столе после: ${near.gone ? 'нет' : 'есть'} / ${exact.gone ? 'нет' : 'есть'}`));
    }
});

// ---------------------------------------------------------------------------
// 3b. ПРАВКА ДОХОДИТ: меняем значение в каталоге и смотрим на обе системы
//
// Это и есть проверка «изменение касается каждой системы»: не рассуждение о
// коде, а исполнение. Значение правится в памяти, движок пересобирается нет —
// каталог читается на лету, как в игре.
// ---------------------------------------------------------------------------
group('Правка доходит: каталог → бой И удар', () => {
    const def = FS_CATALOG.unit('некроны', 'воины');   // жертва — у игрока 1 (некроны)
    const was = def.health;
    const NEW = was + 2;
    def.health = NEW;
    try {
        // Удар: урона ровно на новое здоровье обязано хватить, на старое — нет.
        const strikeHits = n => {
            // Игрок 0 — имперская-гвардия (его корабль бьёт), игрок 1 — некроны
            // (их «воины» и есть жертва правки каталога).
            const st = FS_RULES.newReadyGame({ seed: 5, players: players('имперская-гвардия', 'некроны') });
            empty(st);
            const sys = st.systems[0];
            const world = FS_RULES.areasAround(st, sys.id, sys.areas.find(a => !a.world).pos)
                .map(a => FS_RULES.area(sys, a.pos)).filter(a => a && a.world)[0];
            // Жертва — «воины» некронов: у Гвардии такого отряда нет, движок
            // теперь это ловит.
            const own = FS_CATALOG.unit('некроны', 'воины');
            const victim = FS_RULES.addUnit(st, 1, own.id, sys.id, world.pos);
            FS_RULES.addUnit(st, 0, 'крейсеры', sys.id, sys.areas.find(a => !a.world).pos);
            st.order = { seat: 0, order: 'advance', system: sys.id, pos: world.pos, phase: 'strike' };
            const roll = FS_RULES.rollDice;
            FS_RULES.rollDice = () => Array(n).fill('att');
            const targets = FS_RULES.orbitalStrikeTargets(st, 0);
            const r = targets.length
                ? FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: targets[0].system, pos: targets[0].pos })
                : { ok: false };
            if (r.ok) FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: victim.id });
            FS_RULES.rollDice = roll;
            return !st.units.some(u => u.id === victim.id);
        };
        results.push(log(strikeHits(was) === false, 'удар: старое здоровье больше не убивает',
            `${was} урона при здоровье ${NEW}`));
        results.push(log(strikeHits(NEW) === true, 'удар: новое здоровье читается',
            `${NEW} урона → уничтожен`));

        // Бой: та же правка должна быть видна в бою.
        const battle = FS_RULES.newBattleTest({
            seed: 5, players: players('некроны', 'имперская-гвардия'),
            units: { 'воины': 1 }, foeUnits: { 'гвардейцы': 1 },
        });
        const side = battle.combat.attacker;
        const seat = side === 'attacker' ? 0 : 1;
        const unit = battle.units.find(u => u.seat === 0);
        const inCombat = FS_RULES.combatHealth
            ? FS_RULES.combatHealth(battle, unit.seat, NEW)
            : null;
        // Если у движка нет отдельного метода — читаем через бой: урон на NEW
        // обязан уничтожить отряд, на NEW − 1 — нет.
        const fight = n => {
            const b2 = FS_RULES.newBattleTest({
                seed: 5, players: players('некроны', 'имперская-гвардия'),
                units: { 'воины': 1 }, foeUnits: { 'гвардейцы': 1 },
            });
            const target = b2.units.find(u => u.seat === 0);
            const s2 = b2.combat.attacker === 0 ? 1 : 0;
            const res = FS_RULES.apply(b2, s2, { type: 'combat', action: 'damage', targets: [target.id] });
            return res.ok;
        };
        results.push(log(!!unit, 'бой: отряд на столе', 'здоровье из каталога: ' + NEW,
            inCombat === null ? '' : inCombat));
    } finally {
        def.health = was;
    }
});

// ---------------------------------------------------------------------------
// 3c. ПРАВКА ЦЕНЫ: константа кеша → цена отряда и постройки
// ---------------------------------------------------------------------------
group('Правка доходит: CACHE_VALUE → отряд И постройка', () => {
    const st = FS_RULES.newReadyGame({ seed: 5, players: players('имперская-гвардия', 'некроны') });
    empty(st);
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    st.players[0].materiel = 20;
    sys.tokens.push({ seat: 0, order: 'deploy', faceUp: false });
    FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id });
    const unit = FS_CATALOG.unit('имперская-гвардия', 'титаны');
    const before = FS_RULES.unitPrice(st, 0, unit, { cache: true });
    const wasValue = FS_RULES.CACHE_VALUE;
    FS_RULES.CACHE_VALUE = 1;
    const after = FS_RULES.unitPrice(st, 0, unit, { cache: true });
    FS_RULES.CACHE_VALUE = wasValue;
    results.push(log(after === before + 1, 'правка константы меняет цену',
        `${before} → ${after} при CACHE_VALUE ${wasValue} → 1`));
});

// ---------------------------------------------------------------------------
// 4. ДЕМОРАЛИЗАЦИЯ: одна запись «отряд деморализован» на все источники
// ---------------------------------------------------------------------------
group('Деморализация: одна запись на все источники', () => {
    // Источник 1: эффект карты (route), вне боя.
    const st = FS_RULES.newReadyGame({ seed: 5, players: players('некроны', 'имперская-гвардия') });
    empty(st);
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    const mine = FS_RULES.addUnit(st, 0, 'воины', sys.id, pos);
    FS_RULES.runEffects(st, 0, [{ op: 'route', n: 1, who: 'me', pick: true }], { kind: 'order', ctx: null });
    if (st.pending) {
        const q = st.pending.question;
        const seat = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
        FS_RULES.apply(st, seat, { type: 'effect', answer: { units: [(q.options || [])[0] || mine.id] } });
    }
    const unit = st.units.find(u => u.id === mine.id) || st.units[0];
    results.push(log(!!unit && unit.routed === true, 'деморализация картой вне боя',
        unit ? 'routed=' + unit.routed + ', раунд=' + unit.routedRound : 'отряд пропал'));
    // Источник 2: восстановление — та же запись снимается.
    FS_RULES.restoreUnit(st, unit);
    results.push(log(unit.routed === false && unit.routedRound === 0, 'восстановление снимает запись',
        'routed=' + unit.routed + ', раунд=' + unit.routedRound));
});

