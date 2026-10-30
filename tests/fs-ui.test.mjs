// The interface of the game: the layout records, the elements of the HUD and the
// dynamic lists of the panels. The DOM is a stub — the kit's UI.js builds the elements.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

// --- a DOM small enough for UI.js -------------------------------------------
function fakeElement(tag) {
    return {
        tagName: tag,
        style: {},
        dataset: {},
        children: [],
        textContent: '',
        className: '',
        appendChild(c) { this.children.push(c); return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); },
        remove() { },
        addEventListener() { },
        removeEventListener() { },
    };
}

const canvas = Object.assign(fakeElement('canvas'), {
    clientWidth: 1280, clientHeight: 720, offsetLeft: 0, offsetTop: 0,
    parentElement: fakeElement('div'),
});

const { get } = loadScripts(
    ['js/Constants.js', 'js/UILayout.js', 'js/UI.js', 'js/fs/FSData.js', 'js/fs/FSEffects.js', 'js/fs/FSRules.js', 'js/fs/FSUI.js'],
    { document: { createElement: fakeElement, body: fakeElement('body'), querySelector: () => null } }
);
const UI = get('UI');
const FS_DATA = get('FS_DATA');
const FS_RULES = get('FS_RULES');
const FSUI = get('FSUI');

// The runtime copies of a template (the template itself is not a copy).
function copies(parent, template) {
    return [...UI.elements.values()].filter(e => e.def.parent === parent && e.def.kind === 'button' && e.def.id !== template);
}

function newState() {
    return FS_RULES.view(FS_RULES.newGame({
        seed: 3,
        players: FS_DATA.factions.slice(0, 2).map((f, i) => ({ name: 'Игрок ' + (i + 1), faction: f })),
    }), 0);
}

test('the interface: the layout of the game is loaded', () => {
    UI.init(canvas);
    for (const id of ['fsHud', 'fsPhase', 'fsPlayers', 'fsStatus', 'fsSide', 'fsSideTitle',
        'fsSideText', 'fsActions', 'fsLogPanel', 'fsLog', 'fsLobby', 'fsLobbyTitle',
        'fsLobbyInfo', 'fsLobbyPlayers', 'fsBtn', 'fsLobbyBtn']) {
        assert.ok(UI.get(id), 'the element ' + id + ' is in the layout');
    }
    // The templates are hidden until the game copies them.
    assert.equal(UI.get('fsBtn').visible, false);
    assert.equal(UI.get('fsLobby').visible, false);
});

test('the interface: the panels of the game fill the elements', () => {
    UI.init(canvas);
    const state = newState();
    FSUI.update(state, {
        title: 'Планирование', text: 'Выложите приказы', status: 'Ваш ход',
        actions: [{ label: 'Наступление', onClick: () => { } }, { label: 'Развёртывание', onClick: () => { } }],
    });
    assert.equal(UI.get('fsPhase').inner.textContent.includes('Раунд'), true);
    assert.ok(UI.get('fsPlayers').inner.textContent.includes('Игрок 1'));
    assert.equal(UI.get('fsSideTitle').inner.textContent, 'Планирование');
    assert.equal(UI.get('fsStatus').inner.textContent, 'Ваш ход');
    // The two buttons of the actions are copies of the template.
    const buttons = copies('fsActions', 'fsBtn');
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0].inner.textContent, 'Наступление');
    // The log shows the last lines.
    assert.ok(UI.get('fsLog').inner.textContent.includes('Игра началась'));
});

test('the interface: the lobby shows the room, the players and the factions', () => {
    UI.init(canvas);
    let chosen = null;
    FSUI.lobby({
        code: 'ABCD', name: 'Аня', faction: '', players: [{ name: 'Аня', faction: '' }, { name: 'Борис', faction: 'некроны' }],
        factions: FS_DATA.factions.map(f => ({ id: f.id, name: f.name })),
    }, id => { chosen = id; });
    assert.equal(UI.get('fsLobby').visible, true);
    assert.ok(UI.get('fsLobbyInfo').inner.textContent.includes('ABCD'));
    assert.ok(UI.get('fsLobbyPlayers').inner.textContent.includes('Борис'));
    // The twelve factions are buttons.
    const buttons = copies('fsLobby', 'fsLobbyBtn');
    assert.equal(buttons.length, 12);
    assert.equal(buttons[0].inner.textContent, FS_DATA.factions[0].name);
    // The click of a button chooses the faction.
    buttons[3]._click(buttons[3]);
    assert.equal(chosen, FS_DATA.factions[3].id);
});

test('the interface: the buttons of the panel are replaced at every update', () => {
    UI.init(canvas);
    const state = newState();
    FSUI.update(state, { title: 'a', text: '', status: '', actions: [{ label: 'one', onClick: () => { } }] });
    assert.equal(copies('fsActions', 'fsBtn').length, 1);
    FSUI.update(state, { title: 'a', text: '', status: '', actions: [{ label: 'one', onClick: () => { } }, { label: 'two', onClick: () => { } }] });
    assert.equal(copies('fsActions', 'fsBtn').length, 2);
});
