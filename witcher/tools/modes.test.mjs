// Lobby game modes and house rules: «Кастомная игра» / «Игра на MMR» (all rules forced on).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply } from '../shared/engine/core.mjs';
import { normalizeRules, HOUSE_RULES } from '../shared/data/rules-data.mjs';
import { viewFor } from '../shared/view.mjs';
import { fightScenario } from './scenarios.mjs';

test('режимы: в игре на MMR все правила стола включены, в кастомной — как выбрано', () => {
    const mmr = normalizeRules('mmr', { elixirReturn: false });
    assert.equal(mmr.mode, 'mmr');
    for (const r of HOUSE_RULES) assert.equal(mmr.rules[r.id], true, r.id);
    const c = normalizeRules('custom', { openEvents: true });
    assert.deepEqual(c.rules, { elixirReturn: false, bombs: false, openEvents: true });
    assert.equal(normalizeRules('нет такого').mode, 'custom');
    const st = createGame({ seed: 3, players: [{ name: 'A', school: 'wolf' }], mode: 'mmr' });
    assert.equal(viewFor(st, 0).mode, 'mmr');
    assert.equal(viewFor(st, 0).rules.openEvents, true);
});

test('правило «Возврат эликсиров»: после битвы выпитый эликсир возвращается за 1 золото', () => {
    const st = fightScenario();
    st.rules = { elixirReturn: true };
    const p = st.players[0];
    p.gold = 3;
    assert.ok(apply(st, 0, { t: 'fight' }).ok);
    const el = p.elixirs[0];
    assert.ok(apply(st, 0, { t: 'elixir', id: el }).ok);
    // Finish the fight quickly: the witcher passes until the fight ends.
    let guard = 0;
    while (st.fight && guard++ < 200) {
        if (st.prompt) { const pr = st.prompt; apply(st, pr.seat, pr.kind === 'choice' ? { t: 'answer', choice: pr.options.find(o => !o.disabled).id } : { t: 'answer', ids: pr.ids.slice(0, pr.min) }); continue; }
        if (st.fight.stage === 'witcher') apply(st, 0, { t: 'combo', ids: p.hand.slice(0, 1) });
    }
    while (st.prompt && st.prompt.ui !== 'elixirReturn' && guard++ < 260) { const pr = st.prompt; apply(st, pr.seat, pr.kind === 'choice' ? { t: 'answer', choice: pr.options.find(o => !o.disabled).id } : { t: 'answer', ids: pr.ids.slice(0, pr.min) }); }
    assert.equal(st.prompt && st.prompt.ui, 'elixirReturn', 'после битвы предложен возврат');
    assert.deepEqual(st.prompt.ids, [el]);
    const gold = p.gold;
    assert.ok(apply(st, 0, { t: 'answer', ids: [el] }).ok);
    assert.ok(p.elixirs.includes(el));
    assert.equal(p.gold, gold - 1);
});

test('без правила возврата после битвы ничего не предлагается', () => {
    const st = fightScenario();
    const p = st.players[0];
    assert.ok(apply(st, 0, { t: 'fight' }).ok);
    assert.ok(apply(st, 0, { t: 'elixir', id: p.elixirs[0] }).ok);
    let guard = 0, seen = false;
    while ((st.fight || st.prompt) && guard++ < 300) {
        if (st.prompt) { if (st.prompt.ui === 'elixirReturn') seen = true; const pr = st.prompt; apply(st, pr.seat, pr.kind === 'choice' ? { t: 'answer', choice: pr.options.find(o => !o.disabled).id } : { t: 'answer', ids: pr.ids.slice(0, pr.min) }); continue; }
        if (st.fight && st.fight.stage === 'witcher') apply(st, 0, { t: 'combo', ids: p.hand.slice(0, 1) }); else break;
    }
    assert.equal(seen, false);
});
