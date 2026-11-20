// Sandbox saves («песочница»): ready-made positions loadable from the lobby — a fight test,
// a poker test, exploration (events, a quest, gear) and a mid-game table played by bots. node witcher/tools/scenarios.mjs
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { ensureExplore } from '../shared/engine/explore.mjs';
import { createGame, apply, options, actingSeat } from '../shared/engine/core.mjs';
import { viewFor } from '../shared/view.mjs';
import { botCommand } from '../shared/bots.mjs';
import { COMMON } from '../shared/data/gen-data.mjs';
import { LOC, ADJ, CARDS, MONSTER } from '../shared/engine/util.mjs';
import { canEnter } from '../shared/engine/turn.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const SAVES = path.join(HERE, '..', 'saves');

export function fightScenario(seed = 7) {
    const st = createGame({ seed, players: [{ name: 'Игрок', school: 'wolf' }, { name: 'Ламберт', school: 'cat', bot: 1 }] });
    if (st.prompt) apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id });
    const p = st.players[0];
    const slot = st.slots.find(s => s.mon);
    p.loc = slot.token;
    st.turn.moved = true;
    // A stronger hand so every fight mechanic shows up: links of several colours.
    // Build a linked chain: each next card has the colour of one of the previous card's links.
    // Slice of fight cards: «Мощный Аард» (У1, связь З → Щ1) → «Блок» (Щ2, связи Ж/К → вернуть эту)
    // → a red card (Блок's red link returns it to the hand) + two more damage cards.
    const free = Object.values(CARDS).filter(x => !x.id.startsWith('W-START') && !st.row.includes(x.id));
    const byId = (id) => CARDS[id];
    const pick = [byId('W-B-11'), byId('W-B-01'), free.find(x => x.color === 'red' && x.fx.dmg)];
    while (pick.length < 5) {
        const prev = pick[pick.length - 1];
        const next = free.find(x => !pick.includes(x) && prev.links.some(l => l.color === x.color));
        if (!next) break;
        pick.push(next);
    }
    while (pick.length < 5) pick.push(free.find(x => !pick.includes(x) && x.fx.dmg));
    for (const c of pick) { const i = st.actionDeck.indexOf(c.id); if (i >= 0) st.actionDeck.splice(i, 1); }
    pick.splice(0, pick.length, ...pick.map(c => c.id));
    p.discard.push(...p.hand.splice(0));
    p.hand.push(...pick);
    p.skills.alchemy = 2; p.skills.defense = 2; p.shield = 2;
    p.elixirs.push('POTION-01#9', 'POTION-02#9');
    // A track token of this monster: the witcher strikes first, so the combo slice is playable at once.
    if (state_locPop(st, slot.terrain) != null) p.trackTokens[slot.terrain] = state_locPop(st, slot.terrain, true);
    p.gear.push('CONT79-15'); // «Кастет» (событие 15) — a fight action from exploration
    return st;
}
/** Exploration: gold for every option, an open quest one step away (a water location). */
export function exploreScenario(seed = 9) {
    const st = createGame({ seed, players: [{ name: 'Игрок', school: 'viper' }, { name: 'Цири', school: 'griffin', bot: 1 }] });
    if (st.prompt) apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id });
    const p = st.players[0];
    p.gold = 4;
    const loc = Object.keys(LOC).map(Number).find(n => LOC[n].terrain === 'water' && st.locPiles.water.includes(n) && ADJ[n].some(m => m !== n && canEnter(st, m)));
    st.locPiles.water.splice(st.locPiles.water.indexOf(loc), 1);
    p.quests.push({ id: 'CONT81-15', terrain: 'water', loc, event: 'CONT79-41' });
    // The quest card is with the player — not in the deck (every card exists once).
    const decks = ensureExplore(st);
    decks.wild = decks.wild.filter(id => id !== 'CONT81-15');
    p.loc = ADJ[loc].find(m => canEnter(st, m));
    return st;
}
/**
 * Equipment and companions: Лошадь, Мартин, Кая, Доспех, Наручи, Арбалет, Адья, Эдгар; three
 * cards kept in front (меч Журавля, сумка для зелий, услуга гильдии купцов); an open quest to
 * event 12 (draw 2 and play a combo at once) one step away; a monster nearby.
 */
export function gearScenario(seed = 10) {
    const st = createGame({ seed, players: [{ name: 'Игрок', school: 'wolf' }, { name: 'Эскель', school: 'bear', bot: 1 }] });
    if (st.prompt) apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id });
    const p = st.players[0];
    p.gold = 5;
    p.gear.push('CONT79-16', 'CONT79-11', 'CONT79-23', 'CONT79-13', 'CONT79-28', 'CONT79-14', 'CONT79-20', 'CONT79-50');
    p.keeps.push(
        { id: 'CONT79-26B', card: 'CONT79-26', kind: 'blueDmg', name: 'Меч школы Журавля', text: 'В течение всей битвы: каждая карта быстрой атаки (синяя) в вашей комбинации дополнительно наносит 1 урон.' },
        { id: 'CONT79-25B', card: 'CONT79-25', kind: 'elixirLimit', n: 5, name: 'Сумка для зелий', text: 'Ваш лимит эликсиров увеличен до 5.' },
        { id: 'CONT79-32B', card: 'CONT79-32', kind: 'waterMove', name: 'Услуга гильдии купцов', text: 'Один раз за ход: сбросьте из руки 1 любую карту, чтобы переместиться в соседнюю водную локацию.' });
    const decks = ensureExplore(st);
    for (const d of Object.keys(decks)) decks[d] = decks[d].filter(id => !['CITY1-31', 'CITY1-22', 'CITY1-23', 'CITY1-26', 'CITY1-12', 'CONT81-16', 'CITY1-21', 'CONT81-34', 'CITY1-30', 'CONT81-27', 'CITY1-20'].includes(id));
    // Start next to a forest and a mountain; the quest token lies on that mountain.
    const start = Object.keys(LOC).map(Number).find(n => canEnter(st, n) && ADJ[n].some(m => LOC[m].terrain === 'forest') && ADJ[n].some(m => LOC[m].terrain === 'mountain' && st.locPiles.mountain.includes(m)));
    const mtn = ADJ[start].find(m => LOC[m].terrain === 'mountain' && st.locPiles.mountain.includes(m));
    st.locPiles.mountain.splice(st.locPiles.mountain.indexOf(mtn), 1);
    p.quests.push({ id: 'CITY1-31', terrain: 'mountain', loc: mtn, event: 'CONT79-12', gold: 0 });
    p.loc = start;
    st.eventsUsed = ['CONT79-16', 'CONT79-11', 'CONT79-23', 'CONT79-13', 'CONT79-28', 'CONT79-14', 'CONT79-20', 'CONT79-50', 'CONT79-26', 'CONT79-25', 'CONT79-32'];
    return st;
}
/**
 * «Цири и доп. события»: the expansion on; Йеннифэр (bot) left a quest token next to you and
 * holds a secret card read to whoever moves; the explore decks start with the poker dice
 * (город) and the barghests (окрестности, a quest token here + an elixir as an option cost);
 * Гроббо and Гертруда travel with you.
 */
export function ciriScenario(seed = 12) {
    const st = createGame({ seed, exp: ['ciri'], players: [{ name: 'Игрок', school: 'wolf' }, { name: 'Йеннифэр', school: 'cat', bot: 1 }] });
    if (st.prompt) apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id });
    const p = st.players[0];
    p.gold = 5;
    p.gear.push('CONT80-37', 'CONT80-39');
    const start = Object.keys(LOC).map(Number).find(n => canEnter(st, n) && LOC[n].terrain === 'forest' && ADJ[n].filter(m => canEnter(st, m)).length >= 2);
    p.loc = start;
    const trapLoc = ADJ[start].find(m => canEnter(st, m));
    st.traps = [{ id: 1, owner: 1, loc: trapLoc, event: 'CONT80-01', on: 'move', terrain: null }];
    st.trapSeq = 1;
    st.players[1].secrets = ['CONT80-26'];
    const decks = ensureExplore(st);
    decks.city = ['CITY2-57', ...decks.city.filter(id => id !== 'CITY2-57')];
    decks.wild = ['CONT82-39', ...decks.wild.filter(id => id !== 'CONT82-39')];
    st.eventsUsed.push('CONT80-37', 'CONT80-39', 'CONT80-01', 'CONT80-26');
    return st;
}
/**
 * Цири (playable hero): standing on a monster with «Старшая Кровь» at level 3 and a track token
 * (she strikes first). Her starter cards have no links at all — the blood link is what lets her
 * build a combo: e.g. «Аард» (У1 Д+1) → blood link (У1 Д+1) → «Рубящий удар» (У2 Д−2).
 */
export function ciriHeroScenario(seed = 13) {
    const st = createGame({ seed, exp: ['ciri'], players: [{ name: 'Игрок', school: 'ciri' }, { name: 'Эскель', school: 'wolf', bot: 1 }] });
    if (st.prompt) apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id });
    const p = st.players[0];
    const slot = st.slots.find(s => s.mon);
    p.loc = slot.token;
    st.turn.moved = true;
    const all = [...p.hand, ...p.deck];
    const want = ['W-START-67', 'W-START-64', 'W-START-63', 'W-START-70', 'W-START-65'];
    p.hand = want.slice();
    p.deck = all.filter(id => !want.includes(id));
    p.skills.spec = 3; p.skills.defense = 2; p.shield = 1; p.gold = 3;
    if (state_locPop(st, slot.terrain) != null) p.trackTokens[slot.terrain] = state_locPop(st, slot.terrain, true);
    return st;
}
/**
 * Bombs («По следу монстра»): standing on a monster with one bomb of each type in play and
 * alchemy 4 (four elixirs/bombs per fight). «Чёртов гриб» is offered when the fight starts;
 * two elixirs and gold to try «эликсир или бомба» at the elixir location afterwards.
 */
export function bombScenario(seed = 14) {
    const st = createGame({ seed, exp: ['trail'], players: [{ name: 'Игрок', school: 'bear' }, { name: 'Ламберт', school: 'cat', bot: 1 }] });
    if (st.prompt) apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id });
    const p = st.players[0];
    const slot = st.slots.find(s => s.mon);
    p.loc = slot.token;
    st.turn.moved = true;
    for (const id of ['BOMB-02', 'BOMB-04', 'BOMB-05', 'BOMB-06']) {
        const inst = st.bombDeck.find(x => x.startsWith(id + '#'));
        st.bombDeck.splice(st.bombDeck.indexOf(inst), 1);
        p.bombs.push(inst);
    }
    p.skills.alchemy = 4; p.skills.defense = 2; p.shield = 2; p.gold = 5; p.level = 4;
    p.elixirs.push(st.elixirDeck.shift(), st.elixirDeck.shift());
    if (state_locPop(st, slot.terrain) != null) p.trackTokens[slot.terrain] = state_locPop(st, slot.terrain, true);
    return st;
}
/**
 * «По следу монстра» without the bombs: Алувар (Школа Мантикоры) on a monster with every other
 * mini-expansion on — his unique «Цикл дыхания», master actions in the hand (Боевой транс,
 * Засада, Пируэт, Обман, Выносливость for a double move), Уворот/Контратака on top of the deck
 * (discard effects), three mutagens, two elixirs for «Быстрый метаболизм», a «Решающий удар» in
 * the row (cost: remove a card from the hand).
 */
export const TRAIL_ALL = ['trail', 'trail:bombs', 'trail:manticore', 'trail:troll', 'trail:mutagens', 'trail:unique', 'trail:masters', 'trail:vuln'];
export function trailScenario(seed = 15) {
    const st = createGame({ seed, exp: TRAIL_ALL, players: [{ name: 'Игрок', school: 'manticore' }, { name: 'Весемир', school: 'wolf', bot: 1 }] });
    if (st.prompt) apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id });
    const p = st.players[0];
    const slot = st.slots.find(s => s.mon);
    p.loc = slot.token;
    st.turn.moved = true;
    const take = (id) => { st.actionDeck.splice(st.actionDeck.indexOf(id), 1); return id; };
    const own = [...p.hand, ...p.deck];
    p.hand = ['WITCHER-UNIQUE-06', take('MASTER-29'), take('MASTER-33'), take('MASTER-01'), take('MASTER-17'), take('MASTER-25')];
    p.deck = [take('MASTER-09'), take('MASTER-21'), ...own.filter(id => !p.hand.includes(id))];
    st.actionDeck.push(st.row[2]); st.row[2] = take('MASTER-05');
    for (const m of ['MUT-02', 'MUT-08', 'MUT-15']) { st.mutagenDeck.splice(st.mutagenDeck.indexOf(m), 1); p.mutagens.push(m); }
    p.skills.spec = 3; p.skills.alchemy = 3; p.skills.defense = 2; p.shield = 1; p.gold = 4; p.level = 3; p.skills.combat = 3;
    p.elixirs.push(st.elixirDeck.shift(), st.elixirDeck.shift());
    if (state_locPop(st, slot.terrain) != null) p.trackTokens[slot.terrain] = state_locPop(st, slot.terrain, true);
    return st;
}
/** «Уязвимости и особые атаки»: Волколак next to the player; the combat deck is 12 base + 4 special
 *  cards, a Двимеритовая бомба in hand; the large card (and its back) opens from the monster list. */
export function vulnScenario(seed = 21) {
    const st = createGame({ seed, exp: TRAIL_ALL, players: [{ name: 'Игрок', school: 'wolf' }, { name: 'Ламберт', school: 'viper', bot: 1 }] });
    if (st.prompt) apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id });
    const p = st.players[0];
    const slot = st.slots.find(s => s.mon);
    const was = slot.mon;
    const take = (id) => { const i = st.monsterStacks[MONSTER_LEVEL(id)].indexOf(id); if (i >= 0) st.monsterStacks[MONSTER_LEVEL(id)].splice(i, 1); return id; };
    slot.mon = take('MON-12');
    st.monsterStacks[MONSTER_LEVEL(was)].push(was);
    p.loc = slot.token;
    st.turn.moved = true;
    p.skills.combat = 3; p.skills.defense = 3; p.skills.alchemy = 3; p.skills.spec = 2; p.shield = 3; p.level = 3; p.gold = 5;
    const bomb = st.bombDeck.find(b => b.startsWith('BOMB-07#'));
    st.bombDeck.splice(st.bombDeck.indexOf(bomb), 1);
    p.bombs.push(bomb);
    p.elixirs.push(st.elixirDeck.shift(), st.elixirDeck.shift());
    return st;
}
const MONSTER_LEVEL = (id) => MONSTER[id].level;
export function pokerScenario(seed = 8) {
    const st = createGame({ seed, players: [{ name: 'Игрок', school: 'griffin' }, { name: 'Эскель', school: 'bear', bot: 1 }] });
    if (st.prompt) apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id });
    const p = st.players[0];
    p.loc = 6; p.gold = 6; st.turn.moved = true;
    return st;
}
export function midGameScenario(seed = 11, steps = 260) {
    const st = createGame({ seed, players: [{ name: 'Игрок', school: 'viper' }, { name: 'Весемир', school: 'wolf', bot: 1 }, { name: 'Койон', school: 'cat', bot: 1 }] });
    let n = 0;
    while (n < steps * 3 && st.stage !== 'over') {
        const seat = actingSeat(st);
        if (seat === 0 && n >= steps && !st.prompt && !st.fight && st.turn.phase === 1 && !st.turn.moved) break;
        const c = botCommand(viewFor(st, seat), { options: options(st, seat) });
        if (!c || !apply(st, seat, c).ok) break;
        n++;
    }
    st.players[0].bot = 0;
    return st;
}

function state_locPop(st, terrain, take = false) {
    const pile = st.locPiles[terrain];
    if (!pile.length) return null;
    return take ? pile.pop() : pile[pile.length - 1];
}
function save(name, st) {
    fs.mkdirSync(SAVES, { recursive: true });
    st.events = [];
    const seats = st.players.map(p => ({ name: p.name, school: p.school, bot: p.bot }));
    fs.writeFileSync(path.join(SAVES, name + '.json'), JSON.stringify({ v: 1, seats, state: st }));
    return name;
}
export const SCENARIO_NAMES = ['Песочница — битва', 'Песочница — покер', 'Песочница — исследование', 'Песочница — снаряжение', 'Песочница — Цири и доп. события', 'Песочница — Цири', 'Песочница — бомбы', 'Песочница — По следу монстра', 'Песочница — уязвимости и особые атаки', 'Песочница — середина партии'];
export function writeScenarios() {
    return [save('Песочница — битва', fightScenario()), save('Песочница — покер', pokerScenario()), save('Песочница — исследование', exploreScenario()), save('Песочница — снаряжение', gearScenario()), save('Песочница — Цири и доп. события', ciriScenario()), save('Песочница — Цири', ciriHeroScenario()), save('Песочница — бомбы', bombScenario()), save('Песочница — По следу монстра', trailScenario()), save('Песочница — уязвимости и особые атаки', vulnScenario()), save('Песочница — середина партии', midGameScenario())];
}
if (process.argv[1] && process.argv[1].endsWith('scenarios.mjs')) console.log(writeScenarios().join('\n'));
