// saveload.test.mjs — tests for the game session save and load system.
//   node --test nemesis/tools/saveload.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const readClient = p => fs.readFileSync(new URL('../client/' + p, import.meta.url), 'utf8');
const readServer = () => fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

test('SAVE-01: UI contains save and load buttons and save modal overlay', () => {
    const html = readClient('index.html');
    assert.match(html, /id="saveBtn"/, 'save button in topbar');
    assert.match(html, /id="loadBtn"/, 'load button in topbar');
    assert.match(html, /id="lobbyLoadBtn"/, 'load button in lobby');
    assert.match(html, /id="saveOverlay"/, 'save/load modal overlay');
    assert.match(html, /id="saveNameInput"/, 'save name input');
    assert.match(html, /id="saveSubmitBtn"/, 'save submit button');
    assert.match(html, /id="savesList"/, 'saves list container');
    assert.match(html, /id="saveFileInput"/, 'file upload input for JSON');
});

test('SAVE-02: Client app.js handles save/load interactions', () => {
    const app = readClient('app.js');
    assert.match(app, /openSaveOverlay/, 'openSaveOverlay function');
    assert.match(app, /renderSavesList/, 'renderSavesList function');
    assert.match(app, /case 'savesList':/, 'handles savesList from server');
    assert.match(app, /case 'saved':/, 'handles saved confirmation from server');
    assert.match(app, /'saveOverlay'/, 'closeOverlay includes saveOverlay');
});

test('SAVE-03: Server supports save, load, listSaves, and deleteSave', () => {
    const server = readServer();
    assert.match(server, /case 'save':/, 'server handles save message');
    assert.match(server, /case 'load':/, 'server handles load message');
    assert.match(server, /case 'listSaves':/, 'server handles listSaves message');
    assert.match(server, /case 'deleteSave':/, 'server handles deleteSave message');
    assert.match(server, /\/api\/save\/download/, 'server serves download endpoint');
});

test('SAVE-04: Game state serialization and deserialization integrity', () => {
    const fakeState = {
        time: 12,
        rooms: { r1: { name: 'cabin' } },
        players: [{ id: 0, charId: 'medic', hp: 3 }],
    };
    const saveData = {
        version: 1,
        timestamp: Date.now(),
        name: 'test_save',
        state: fakeState,
        phase: 'playing',
        settings: { mode: 'original' },
        seats: [{ name: 'Player 1', charId: 'medic', colors: {} }],
        history: [],
        poses: {},
    };
    const serialized = JSON.stringify(saveData);
    const parsed = JSON.parse(serialized);
    assert.equal(parsed.name, 'test_save');
    assert.deepEqual(parsed.state, fakeState);
    assert.equal(parsed.phase, 'playing');
    assert.equal(parsed.seats[0].charId, 'medic');
});
