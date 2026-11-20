// Per-seat view: hidden information never leaves the server. Hands of other players, every
// deck, the monster's life pool, face-down track tokens, other seats' prompts and the RNG are
// replaced by counts or removed.
export function viewFor(state, seat) {
    const s = JSON.parse(JSON.stringify(state));
    delete s.rng; delete s.queue; delete s.seed; delete s.pendingMons; delete s.elixirLook;
    s.actionDeck = s.actionDeck.length;
    s.elixirDeck = s.elixirDeck.length;
    s.bombDeck = (s.bombDeck || []).length;
    s.mutagenDeck = (s.mutagenDeck || []).length;
    s.attackDeck = s.attackDeck.length;
    for (const k of Object.keys(s.locPiles)) s.locPiles[k] = s.locPiles[k].length;
    for (const k of Object.keys(s.monsterStacks)) s.monsterStacks[k] = s.monsterStacks[k].length;
    s.extraStack = s.extraStack.length;
    if (s.explore) for (const k of Object.keys(s.explore)) s.explore[k] = s.explore[k].length;
    for (const p of s.players) {
        p.deckCount = p.deck.length;
        p.handCount = p.hand.length;
        delete p.deck;
        if (p.seat !== seat) delete p.hand;
        // Track tokens lie face down: their location number is secret, only the terrain is known.
        for (const t of Object.keys(p.trackTokens)) p.trackTokens[t] = p.trackTokens[t] != null;
        // Secret event cards («не показывайте её другим игрокам»): only their count is public.
        p.secretCount = (p.secrets || []).length;
        if (p.seat !== seat) delete p.secrets;
    }
    // Quest tokens of «Цири и доп. события»: everyone sees where they lie, the event number only
    // their owner knows.
    if (s.traps) s.traps = s.traps.map(t => t.owner === seat ? t : { id: t.id, owner: t.owner, loc: t.loc, on: t.on });
    delete s.trapCtx;
    if (s.fight) {
        s.fight.lifeCount = s.fight.life.length;
        delete s.fight.life;
        if (s.fight.cur && s.fight.seat !== seat) delete s.fight.cur.forcedFirst;
    }
    if (s.prompt && s.prompt.seat !== seat) {
        s.prompt = { seat: s.prompt.seat, title: s.prompt.title, kind: s.prompt.kind, ui: s.prompt.ui, foreign: true };
    } else if (s.prompt) {
        delete s.prompt.op;
        delete s.prompt.args;
    }
    s.you = seat;
    return s;
}
