// The effects of the cards: the engine reads the text and applies it itself.
// The player only answers the questions of the text.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const { get } = loadScripts(['js/fs/FSData.js', 'js/fs/FSEffects.js', 'js/fs/FSRules.js']);
const FS_DATA = get('FS_DATA');
const FS_EFFECTS = get('FS_EFFECTS');
const FS_RULES = get('FS_RULES');

// A game of two players with the given factions.
function game(factions = ['имперская-гвардия', 'некроны'], seed = 5) {
    return FS_RULES.newGame({
        seed,
        players: factions.map((id, i) => ({ name: 'Игрок ' + (i + 1), faction: id })),
    });
}

// The units of the player are put into one area of the board.
function putUnits(s, seat, system, area) {
    const p = s.players[seat];
    const def = FS_DATA.factions.find(f => f.id === p.faction).units[0];
    FS_RULES.addUnit(s, seat, def.id, system.id, area.pos);
    return s.units[s.units.length - 1];
}

// The answer of the player to the question of the effect.
function answer(s, seat, a) {
    return FS_RULES.apply(s, seat, { type: 'effect', answer: a });
}

// --- the reading of the text -------------------------------------------------

test('the text of the cards: the sentences are read one by one', () => {
    const sentences = FS_EFFECTS.sentences('В начале шага нанесения повреждений ваш противник теряет 2 `att. token`.');
    assert.equal(sentences.length, 1);
    assert.ok(sentences[0].includes('`att. token`'), 'the icon is not broken by the dot');
});

test('the text of the cards: the effects become the steps of the game', () => {
    const steps = FS_EFFECTS.parse('В начале шага нанесения повреждений ваш противник теряет 2 `att. token`.');
    assert.equal(steps.length, 1);
    assert.equal(steps[0].op, 'loseToken');
    assert.equal(steps[0].n, 2);
    assert.equal(steps[0].kind, 'att');
    assert.equal(steps[0].who, 'foe');
});

test('the text of the cards: "either ... or ..." is a choice of the player', () => {
    const steps = FS_EFFECTS.parse('Либо восстановите 1 своего юнита, либо разместите 1 бесплатный жетон подкрепления.');
    assert.equal(steps.length, 1);
    assert.equal(steps[0].op, 'choice');
    assert.equal(steps[0].options.length, 2);
    assert.equal(steps[0].options[0].op, 'restore');
    assert.equal(steps[0].options[1].op, 'placeReinforcement');
});

test('the text of the cards: the payment that avoids the effect belongs to the step', () => {
    const steps = FS_EFFECTS.parse('Ваш противник должен выбрать и деморализовать 1 свой отряд. Он может избежать этого, если потратит 1 `any cube`.');
    const route = steps.find(s => s.op === 'route');
    assert.ok(route, 'the routing of the unit is read');
    assert.equal(route.avoid.n, 1);
    assert.equal(route.avoid.kind, 'any');
});

test('the text of the cards: the unit of the ability is found by its name', () => {
    const steps = FS_EFFECTS.parse('При раскрытии этого приказа разместите 1 бесплатного штурмовика в дружественном мире с городом в активной системе.',
        { kind: 'order', faction: 'инквизиция' });
    assert.equal(steps.length, 1);
    assert.equal(steps[0].op, 'placeUnit');
    assert.equal(steps[0].what, 'Инквизиторские штурмовики');
});

// --- the effects of the combat cards -----------------------------------------

test('the combat card: the tokens of the opponent are taken by the engine', () => {
    const s = game();
    const sys = s.systems[0];
    const area = sys.areas.find(a => a.world);
    putUnits(s, 0, sys, area);
    putUnits(s, 1, sys, area);
    FS_RULES.startCombat(s, 0, 1, sys.id, area.pos);
    // "Ratshooters": the opponent loses 2 `att. token` at the damage step.
    const card = FS_DATA.combat.find(c => c.faction === 'имперская-гвардия' && c.name === 'Ратлинг стрелок');
    s.combat.tokens.defender.att = 3;
    const before = s.combat.tokens.defender.att;
    const steps = FS_RULES.cardSteps(s, 0, card);
    assert.ok(steps.length, 'the text of the card is read');
    FS_RULES.runEffects(s, 0, steps, { kind: 'combat', ctx: { side: 'attacker' } });
    assert.equal(s.combat.tokens.defender.att, before - 2, 'the engine took the tokens itself');
});

test('the combat card: the routing of the unit is a question of the opponent', () => {
    const s = game();
    const sys = s.systems[0];
    const area = sys.areas.find(a => a.world);
    putUnits(s, 0, sys, area);
    const theirs = putUnits(s, 1, sys, area);
    FS_RULES.startCombat(s, 0, 1, sys.id, area.pos);
    const card = FS_DATA.combat.find(c => c.faction === 'имперская-гвардия' && c.name === 'Ратлинг стрелок');
    const steps = FS_RULES.cardSteps(s, 0, card);
    FS_RULES.runEffects(s, 0, steps, { kind: 'combat', ctx: { side: 'attacker' } });
    assert.ok(s.pending, 'the effect waits for the answer');
    assert.equal(s.pending.answerSeat, 1, 'the opponent chooses');
    assert.equal(s.pending.question.op, 'avoid', 'the opponent may pay a die');
    // The opponent does not pay: the question of the units.
    answer(s, 1, { dice: [] });
    assert.equal(s.pending.question.op, 'route');
    const unit = s.pending.question.options[0];
    answer(s, 1, { units: [unit] });
    assert.ok(s.units.find(u => u.id === unit).routed, 'the unit is routed');
    assert.equal(s.pending, null, 'the effect is over');
});

test('the combat card: the payment avoids the effect', () => {
    const s = game();
    const sys = s.systems[0];
    const area = sys.areas.find(a => a.world);
    putUnits(s, 0, sys, area);
    const theirs = putUnits(s, 1, sys, area);
    FS_RULES.startCombat(s, 0, 1, sys.id, area.pos);
    const card = FS_DATA.combat.find(c => c.faction === 'имперская-гвардия' && c.name === 'Ратлинг стрелок');
    const steps = FS_RULES.cardSteps(s, 0, card);
    FS_RULES.runEffects(s, 0, steps, { kind: 'combat', ctx: { side: 'attacker' } });
    const dice = s.combat.dice.defender.length;
    answer(s, 1, { dice: [0] });
    assert.equal(s.combat.dice.defender.length, dice - 1, 'the die is spent');
    assert.equal(s.pending, null, 'the effect is skipped');
    assert.equal(s.units.find(u => u.id === theirs.id).routed, false, 'the unit is not routed');
});

test('the combat card: the dice are rerolled by the engine', () => {
    const s = game();
    const sys = s.systems[0];
    const area = sys.areas.find(a => a.world);
    putUnits(s, 0, sys, area);
    putUnits(s, 1, sys, area);
    FS_RULES.startCombat(s, 0, 1, sys.id, area.pos);
    const steps = FS_EFFECTS.parse('Вы обязаны перебросить все свои `def. cube`.', { kind: 'combat' });
    assert.equal(steps[0].op, 'rerollDie');
    assert.equal(steps[0].all, true);
    const before = s.combat.dice.attacker.filter(d => d === 'def').length;
    if (before) {
        FS_RULES.runEffects(s, 0, steps, { kind: 'combat', ctx: { side: 'attacker' } });
        assert.equal(s.combat.dice.attacker.length, s.combat.dice.attacker.length, 'the dice are still there');
        assert.equal(s.pending, null, 'all the dice are rerolled without a question');
    }
});

// --- the effects of the events -------------------------------------------------

test('the event card: the tactic is applied by the engine', () => {
    const s = game(['космодесант', 'некроны'], 11);
    const seat = 0;
    const p = s.players[seat];
    const sys = s.systems[0];
    const area = sys.areas.find(a => a.world);
    p.units = [];
    const card = FS_DATA.events.find(c => c.faction === 'космодесант' && c.type === 'tactic');
    const steps = FS_EFFECTS.parse(card.text, { kind: 'event', faction: p.faction });
    assert.ok(steps.length, 'the text of the event is read');
    assert.ok(steps.some(s => s.op === 'choice' || s.op === 'placeUnit' || s.op === 'placeStructure'));
});

test('the event card: the scheme waits for its moment', () => {
    const s = game(['космодесант', 'некроны'], 12);
    const seat = 0;
    const p = s.players[seat];
    const card = FS_DATA.events.find(c => c.faction === 'космодесант' && c.type === 'scheme');
    const steps = FS_EFFECTS.parse(card.text, { kind: 'event', faction: p.faction });
    const trigger = steps.find(x => x.op === 'trigger');
    assert.ok(trigger, 'the moment of the scheme is read');
    assert.ok(trigger.trigger, 'the moment is known: ' + trigger.trigger);
    // The scheme is in the play area of the player.
    s.phase = 'refresh';
    s.event = { seat, drawn: [card.name], top: null, card, options: [card.name] };
    const res = FS_RULES.apply(s, seat, { type: 'resolveEvent' });
    assert.equal(res.ok, true);
    assert.equal(p.schemes.length, 1, 'the scheme is in play');
    assert.equal(p.schemes[0].name, card.name);
    assert.ok(p.schemes[0].trigger, 'the scheme knows its moment');
});

// --- the effects of the order upgrades -----------------------------------------

test('the order upgrade: the text is applied when the upgrade is used', () => {
    const s = game(['имперская-гвардия', 'некроны'], 21);
    const seat = 0;
    const p = s.players[seat];
    const card = FS_DATA.orders.find(c => c.faction === 'имперская-гвардия');
    p.upgrades.push({ name: card.name, used: false, text: card.text });
    const res = FS_RULES.apply(s, seat, { type: 'useUpgrade', card: card.name });
    assert.equal(res.ok, true, res.error);
    assert.ok(p.upgrades[0].used, 'the upgrade is used');
});

// --- the ability of the faction ------------------------------------------------

test('the ability of the faction: the units are moved by the engine', () => {
    const s = game(['некроны', 'темные-эльдары'], 31);
    const seat = 0;
    const p = s.players[seat];
    const sys = s.systems[0];
    const area = sys.areas.find(a => a.world);
    const unit = putUnits(s, seat, sys, area);
    // The world is friendly: the player has a structure there.
    FS_RULES.addStructure(s, seat, 'city', sys.id, area.pos);
    s.order = { seat, order: 'dominate', system: sys.id, phase: 'dominate', ability: p.faction };
    const res = FS_RULES.apply(s, seat, { type: 'finishDominate' });
    assert.equal(res.ok, true, res.error);
    assert.ok(s.pending, 'the ability asks the player');
    assert.equal(s.pending.question.op, 'moveUnits');
    answer(s, seat, { units: [unit.id] });
    assert.equal(s.pending.question.kind, 'areas', 'the player chooses the world');
    const target = s.pending.question.options[0];
    answer(s, seat, { area: target });
    assert.equal(s.pending, null, 'the ability is over');
    assert.equal(s.order, null, 'the order is over');
});

// --- the coverage of the interpreter -------------------------------------------

test('the text of the cards: the scheme waits for its moment', () => {
    const steps = FS_EFFECTS.parse('В начале раунда боя вы можете сбросить эту карту, чтобы получить 1 `att. token`.');
    assert.equal(steps.length, 1);
    assert.equal(steps[0].op, 'trigger');
    assert.equal(steps[0].trigger, 'round');
    assert.equal(steps[0].steps.length, 1);
    assert.equal(steps[0].steps[0].op, 'gainToken');
});

test('the text of the cards: the order changes the rules of the game', () => {
    const steps = FS_EFFECTS.parse('Вместимость дружественных миров, содержащих город, увеличена на 2, максимум до 4.');
    assert.equal(steps.length, 1);
    assert.equal(steps[0].op, 'capacityBonus');
    assert.equal(steps[0].n, 2);
    assert.equal(steps[0].max, 4);

    const fight = FS_EFFECTS.parse('Если происходит бой, разыграйте только ОДИН раунд, на этом бой заканчивается.');
    assert.equal(fight.length, 1);
    assert.equal(fight[0].op, 'combatLength');
    assert.equal(fight[0].n, 1);

    const cheap = FS_EFFECTS.parse('При выполнении этого приказа вы можете приобрести только 1 улучшение.');
    assert.equal(cheap[0].op, 'upgradeLimit');
    assert.equal(cheap[0].n, 1);
});

test('the text of the cards: the discount of the card is counted', () => {
    const steps = FS_EFFECTS.parse('Его стоимость в материалах уменьшается на 1 за каждый дружественный мир, где есть бастион.');
    assert.equal(steps.length, 1);
    assert.equal(steps[0].op, 'costDiscount');
    assert.equal(steps[0].n, 1);
    assert.equal(steps[0].per, 'friendlyBastion');
});

test('the text of the cards: the materiel is exchanged for the tokens', () => {
    const steps = FS_EFFECTS.parse('Либо потратьте до 2 материалов, чтобы получить 1 ценный ресурс на ваш выбор за каждый потраченный материал, либо потратьте до 2 ценных ресурсов, чтобы получить по 2 материала за каждый потраченный ценный ресурс.');
    assert.equal(steps.length, 1);
    assert.equal(steps[0].op, 'choice');
    assert.equal(steps[0].options[0].op, 'exchangeMateriel');
    assert.equal(steps[0].options[1].op, 'exchangeAsset');
});

test('the text of the cards: the abilities of the factions are read', () => {
    const steps = FS_EFFECTS.parse('2 Гвардейца могут быть куплены за 1 жетон запасов.', { faction: 'тираниды' });
    assert.equal(steps.length, 1);
    assert.equal(steps[0].op, 'supplyDeal');
    assert.equal(steps[0].n, 2);

    const cards = FS_EFFECTS.parse('При выполнении приказа доминирования в системе, где есть ваши юниты или постройки, вы можете вытянуть 4 карты событий и разыграть эффект одной из них.', { faction: 'тираниды' });
    assert.equal(cards.length, 2);
    assert.equal(cards[0].op, 'drawEvents');
    assert.equal(cards[1].op, 'playEvent');
});

test('the interpreter: the texts of the cards are read', () => {
    let total = 0;
    let read = 0;
    for (const c of FS_DATA.combat) {
        for (const text of [c.general, c.unit]) {
            if (!text) continue;
            for (const sentence of FS_EFFECTS.sentences(text)) {
                total++;
                const steps = FS_EFFECTS.parseSentence(sentence, { kind: 'combat' });
                if (steps.length && steps[0].op !== 'icons') read++;
            }
        }
    }
    assert.ok(read / total > 0.85, 'the combat cards are read: ' + Math.round(read / total * 100) + ' %');
});

test('the interpreter: the events and the orders are read', () => {
    let total = 0;
    let read = 0;
    for (const c of FS_DATA.events) {
        for (const sentence of FS_EFFECTS.sentences(c.text)) {
            total++;
            const steps = FS_EFFECTS.parseSentence(sentence, { kind: 'event' });
            if (steps.length && steps[0].op !== 'icons') read++;
        }
    }
    assert.ok(read / total > 0.8, 'the events are read: ' + Math.round(read / total * 100) + ' %');
});
