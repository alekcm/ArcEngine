// Audit against the combat-restriction icons printed on each ActionDeck sheet in Nemesis/Колоды.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHARACTERS, FIELD_DATA } from '../shared/data/cards.mjs';
import { createGame } from '../shared/engine/setup.mjs';
import { OPS } from '../shared/engine/core.mjs';
import { buildMenu } from '../shared/engine/turn.mjs';

// Lists include every printed ⛔ icon; every other card on the sheet lacks it. Some identical card
// names differ across decks: Hacker/CEO Computer Skills do not have the icon, unlike the others.
const PRINTED = {
    soldier: 'repairs rest search',
    scout: 'reconnaissance repairs rest scavenging search',
    mechanic: 'computerSkills fastRepairs fightFire ingenuity rest search technicalCorridors',
    pilot: 'computerSkills determination knowledgeOfShip piloting repairs rest search',
    hacker: 'masterPlan override recharge repairs rest search',
    scientist: 'computerSkills connection intranet repairs rest riskAssessment search',
    medic: 'computerSkills fieldSurgery firstAid repairs rest search synthesizedDrugs',
    janitor: 'cleanUp emergencyKey itShouldWork maintenancePlan repairs rest search',
    ceo: 'fastRepairs rest search',
    labrat: 'inconspicuous repairs rest search sensitiveHearing weirdMetabolism',
    sentry: 'defensePlan repairs rest search securityControl',
    android: 'computerSkills fastRepairs powerUp protocolOverride search selfRepair',
    convict: 'repairs rest search shortTemper',
    psych: 'computerSkills lendAHand repairs rest search',
    bounty: 'determination repairs rest search',
    captain: 'repairs rest search',
    survivor: 'obstinate repairs rest search vents',
    xeno: 'overmind repairs rest search workspacePlan',
};
const FIELD_PRINTED = 'asymptomatic damageExpertise hunkerDown restoration';
const listed = s => new Set(s.split(' '));

function fresh(char = 'soldier') {
    const s = createGame({ seed: 'combat-tags', mode: 'original', draft: false,
        players: [{ name: 'Alpha', charId: char }] });
    s.phase = 'player'; s.current = 0; s.actionsLeft = 2; s.queue = []; s.prompt = null;
    const p = s.players[0]; p.status = 'active'; p.passed = false;
    s.intruders = { enemy: { uid: 'enemy', type: 'adult', room: p.room, hits: 0 } };
    return [s, p];
}

test('all 182 character card tags match their individual printed sheets', () => {
    assert.deepEqual(Object.keys(PRINTED).sort(), Object.keys(CHARACTERS).sort());
    let count = 0;
    for (const [char, ch] of Object.entries(CHARACTERS)) {
        const expected = listed(PRINTED[char]);
        for (const key of expected) assert.ok(ch.cards[key], char + '.' + key);
        for (const [key, card] of Object.entries(ch.cards)) {
            assert.equal(!!card.noCombat, expected.has(key), char + '.' + key);
            count++;
        }
    }
    assert.equal(count, 182);
});

test('all 18 Field Data cards match their printed restriction icons', () => {
    const expected = listed(FIELD_PRINTED);
    assert.equal(Object.keys(FIELD_DATA).length, 18);
    for (const [key, card] of Object.entries(FIELD_DATA)) assert.equal(!!card.noCombat, expected.has(key), 'field.' + key);
});

test('the server enforces each printed character card restriction in combat', () => {
    for (const [char, ch] of Object.entries(CHARACTERS)) {
        const [s, p] = fresh(char);
        for (const [key, card] of Object.entries(ch.cards)) {
            const id = char + '.' + key + '#audit';
            p.hand = [id, char + '.demolition#pay1', char + '.demolition#pay2', char + '.demolition#pay3'];
            let shown = buildMenu(s, p).cards.find(x => x.id === id);
            if (card.reaction) assert.match(shown.reason, /Реакция/, id);
            else if (card.noCombat) assert.equal(shown.reason, 'Нельзя в бою', id);
            else assert.notEqual(shown.reason, 'Нельзя в бою', id);
            const saved = s.intruders; s.intruders = {};
            shown = buildMenu(s, p).cards.find(x => x.id === id);
            assert.notEqual(shown.reason, 'Нельзя в бою', id + ' outside combat');
            s.intruders = saved;
        }
    }
});

test('server rejects a forged attempt to play a restricted card', () => {
    const [s, p] = fresh(); p.hand = ['soldier.repairs#0', 'soldier.demolition#0'];
    OPS['turn.do'](s, { player: p.id, answer: { action: 'card', cardId: p.hand[0] } });
    assert.deepEqual(p.hand, ['soldier.repairs#0', 'soldier.demolition#0']);
    assert.equal(s.actionsLeft, 2);
});

test('Containment can lift a card restriction but cannot simultaneously pay its extra cost', () => {
    const [s, p] = fresh('scout');
    const id = 'scout.scavenging#0';
    // The search requirement needs a room with item icons.
    p.room = Object.keys(s.ship.rooms).find(r => s.ship.rooms[r].kind === 'slot1');
    s.intruders.enemy.room = p.room;
    s.roomState[p.room].tile = 'laboratory'; s.roomState[p.room].explored = true;
    p.hand = [id, 'field.containment#0'];
    let card = buildMenu(s, p).cards.find(c => c.id === id);
    assert.equal(card.enabled, false); assert.equal(card.reason, 'Не хватает карт');
    p.hand.push('scout.demolition#0');
    card = buildMenu(s, p).cards.find(c => c.id === id);
    assert.equal(card.enabled, true);
    OPS['turn.do'](s, { player: p.id, answer: { action: 'card', cardId: id } });
    assert.ok(!p.hand.includes(id)); assert.ok(!p.hand.includes('field.containment#0'));
    assert.ok(p.discard.includes('field.containment#0'));
});

test('client shows the same combat restriction as the engine on the card', () => {
    const client = fs.readFileSync(new URL('../client/cards.js', import.meta.url), 'utf8');
    assert.match(client, /d\.noCombat \? '<span class="ccombat"/);
});

test('Critical Analysis can privately inspect and reorder both decks in every enemy set', async () => {
    const { answer, run } = await import('../shared/engine/core.mjs');
    const { viewFor } = await import('../shared/view.mjs');
    for (const pack of ['redux', 'carnomorphs', 'voidseeders', 'chytrids']) for (const deck of ['event', 'attack']) {
        const s = createGame({ enemySet: pack, seed: 'analysis-' + pack, mode: 'original', draft: false,
            players: [{ name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' }] });
        s.queue = []; s.prompt = null; s.resume = null; s.result = null;
        const cards = s[deck + 'Deck'].slice();
        OPS['card.fdAnalysis.deck'](s, { player: 0, answer: deck }); run(s);
        assert.equal(s.prompt.secret, true, pack + '/' + deck);
        const observer = viewFor(s, 1).prompt;
        assert.equal(observer.title, 'Персонаж изучает скрытую информацию');
        assert.equal(observer.options, undefined); assert.equal(observer.text, undefined);
        assert.ok(s.prompt.options.every(o => !/undefined/.test(o.label + o.desc)), pack + '/' + deck);
        while (s.prompt && s.prompt.secret) {
            const pr = s.prompt;
            assert.equal(answer(s, 0, pr.id, pr.options[0].id), true);
        }
        assert.deepEqual(s[deck + 'Deck'], cards, pack + '/' + deck + ' preserved card order');
    }
});
