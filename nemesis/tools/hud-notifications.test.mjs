import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame, revealComputerCard } from '../shared/engine/setup.mjs';
import { OPS, gainKnowledge } from '../shared/engine/core.mjs';
import { viewFor } from '../shared/view.mjs';
import { ITEMS } from '../shared/data/cards.mjs';
import { KNOWLEDGE_THRESHOLDS } from '../shared/knowledge.mjs';
import { itemDeckBadge, knowledgeTrack, larvaBadge } from '../client/status-display.mjs';

function fresh() {
    const s = createGame({ seed: 'hud-notifications', mode: 'original', draft: false,
        players: [{ name: 'Alpha', charId: 'soldier' }, { name: 'Beta', charId: 'scout' }] });
    s.queue = []; s.prompt = null; s.resume = null; s.result = null; s.fx = []; s.fxSeq = 0;
    return s;
}

test('item badges use the real deck and do not reveal a hidden light item', () => {
    for (const [item, color] of [['medkit', 'green'], ['grenade', 'red'], ['cables', 'yellow'], ['tacticalArmor', 'support'], ['soldierGun', 'start']]) {
        assert.equal(ITEMS[item].deck, color);
        assert.match(itemDeckBadge(ITEMS[item].deck), new RegExp('item-deck ' + color));
    }
    assert.equal(itemDeckBadge(undefined), '');
    assert.equal(itemDeckBadge('__proto__'), '');
    const s = fresh(); s.players[0].items.push({ uid: 'secret', item: 'grenade' });
    assert.ok(viewFor(s, 0).players[0].items.some(i => i.uid === 'secret'));
    assert.ok(!viewFor(s, 1).players[0].items.some(i => i.uid === 'secret'));
});

test('knowledge has eight cells and uses the same reward thresholds as the engine', () => {
    const s = fresh(), p = s.players[0];
    p.knowledge = 1; p.knowledgeActive = true;
    gainKnowledge(s, p, 20);
    assert.equal(p.knowledge, 8);
    assert.deepEqual(s.queue.map(x => x.t), KNOWLEDGE_THRESHOLDS);
    for (let level = 0; level <= 8; level++) {
        const html = knowledgeTrack({ knowledge: level, knowledgeActive: level > 0 });
        assert.equal((html.match(/class="knowledge-cell/g) || []).length, 8);
        assert.equal((html.match(/class="knowledge-cell[^\"]* reward/g) || []).length, 3);
        assert.equal((html.match(/class="knowledge-cell on/g) || []).length, level);
        assert.equal((html.match(/class="knowledge-cell[^\"]* here/g) || []).length, level ? 1 : 0);
        for (const n of KNOWLEDGE_THRESHOLDS) assert.match(html, new RegExp('Знания ' + n + ' — порог карты полевых данных'));
        assert.match(html, level ? /✓ активирован/ : /не активирован/);
    }
});

test('larva indicator works for every player in public views', () => {
    const s = fresh(); s.players[1].larva = true;
    for (const viewer of [0, 1, null]) {
        const players = viewFor(s, viewer).players;
        assert.equal(larvaBadge(players[0]), '');
        assert.match(larvaBadge(players[1]), /aria-label="У персонажа личинка"/);
    }
});

test('only an actually revealed Lockdown produces an event', () => {
    const s = fresh(); s.computerCard = null; s.computerDeck = ['lockdown', 'actionA'];
    revealComputerCard(s, true);
    assert.equal(s.computerCard, 'actionA'); assert.equal(s.fx.length, 0);
    const lone = fresh(); lone.computerCard = null; lone.computerDeck = ['lockdown'];
    revealComputerCard(lone, true);
    assert.equal(lone.computerCard, 'lockdown'); assert.equal(lone.fx[0].type, 'lockdown');
    s.computerCard = 'actionA'; s.computerDeck = ['actionB', 'lockdown'];
    revealComputerCard(s); assert.equal(s.computerCard, 'actionB');
    // The existing last-card rule puts Lockdown back and then draws it again if it is alone.
    revealComputerCard(s); assert.equal(s.computerCard, 'lockdown'); assert.equal(s.fx.length, 1);
    s.computerDeck = ['lockdown', 'actionA']; revealComputerCard(s);
    assert.equal(s.computerCard, 'lockdown'); assert.deepEqual(s.fx.map(f => f.type), ['lockdown', 'lockdown']);
});

test('Server Room reveals Lockdown once, without a second event when it is resolved', () => {
    const s = fresh(); s.computerCard = 'actionA'; s.computerDeck = ['lockdown', 'actionB']; s.computerDiscard = [];
    OPS['computer.afterServer'](s, { then: { op: 'noop' } });
    assert.equal(s.computerCard, 'lockdown');
    assert.equal(s.fx.filter(f => f.type === 'lockdown').length, 1);
    OPS['computer.start'](s, { player: 0, then: { op: 'noop' } });
    assert.notEqual(s.computerCard, 'lockdown');
    assert.equal(s.fx.filter(f => f.type === 'lockdown').length, 1);
});

test('automatic Lockdown resolution retains a public event for every viewer', () => {
    const s = fresh(); s.computerCard = 'actionB'; s.computerDeck = ['lockdown', 'actionA']; s.computerDiscard = [];
    OPS['computer.done'](s, { player: 0, then: { op: 'noop' } });
    assert.notEqual(s.computerCard, 'lockdown');
    assert.equal(s.fx.filter(f => f.type === 'lockdown').length, 1);
    for (const viewer of [0, 1, null]) assert.deepEqual(viewFor(s, viewer).fx.filter(f => f.type === 'lockdown'), [{ n: 1, type: 'lockdown', seq: 1 }]);
});

test('both clients show a new event once, and restored states establish a fresh baseline', () => {
    const alerts = [], timers = [];
    const document = { body: { appendChild: e => alerts.push(e) }, createElement: () => ({ setAttribute(k, v) { this[k] = v; }, remove() {} }) };
    const src = fs.readFileSync(new URL('../client/fx.js', import.meta.url), 'utf8')
        .replace(/^import .*;\s*$/gm, '').replace('export class TableFX', 'class TableFX');
    const TableFX = new Function('document', 'setTimeout', 'esc', src + '\nreturn TableFX;')(document, fn => timers.push(fn), x => x);
    const clients = [0, 1].map(() => new TableFX({ innerHTML: '' }, {}, () => null, {}));
    const s = fresh(), baseline = structuredClone([viewFor(s, 0), viewFor(s, 1)]);
    clients.forEach((c, i) => c.update(baseline[i], i));
    s.computerCard = 'actionB'; s.computerDeck = ['lockdown', 'actionA']; s.computerDiscard = [];
    OPS['computer.done'](s, { player: 0, then: { op: 'noop' } });
    const views = [viewFor(s, 0), viewFor(s, 1)];
    clients.forEach((c, i) => { c.update(views[i], i); c.update(views[i], i); });
    assert.equal(alerts.length, 2);
    for (const alert of alerts) { assert.equal(alert.role, 'alert'); assert.match(alert.textContent, /БЛОКИРОВКА/); }
    while (timers.length) timers.shift()();
    clients.forEach((c, i) => { c.reset(); c.update(baseline[i], i); c.update(views[i], i); });
    assert.equal(alerts.length, 4, 'the same sequence number can occur after an undo');
});
