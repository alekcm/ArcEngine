// FSBotPersona.js — the characters of the bots: the third layer.
//
// A character is a set of weights for the measure of a position (FSBotBrain),
// the tastes in units and cards, the tempo of the party (when the aggression
// peaks), the sensitivity to the triggers (revenge, the leader, an exposed
// neighbour, the last third of the party) and the lines it says in the log.
//
// Two kinds of characters live here:
//   * the five generic archetypes — any faction may play them;
//   * the doctrines of a faction — several ways to play THE SAME faction,
//     derived from its units and cards (the orks may flood the board with
//     boyz from the first round, or build towards the gargants, or play the
//     dirty cards; the necrons may wake up slowly, or exterminate from the
//     start with their tough warriors, or roll one phalanx, or phase in and
//     out through the portals). A faction without its own doctrines plays
//     the archetypes.
//
// Nothing here is tied to a round number: the tempo and the triggers read the
// progress of the party (GamePhase.progress / roundsLeft), whatever its length.
//
// Every character, however defensive, keeps the objective weight above the
// floor: the game is won only by the objective tokens, and those always lie
// on the worlds of the others.

/* global FS_CATALOG */

/**
 * @typedef {{ id: string, name: string, text: string, faction?: string, line?: string,
 *   weights: Record<string, number>, tempo: string, triggers: Record<string, number>,
 *   likes: { units: Record<string, number>, combat: string[], orders: string[] },
 *   build: { cities?: number, bastions?: number, forge?: boolean }, horde?: boolean, stack?: boolean, cover?: boolean, strikes?: boolean }} BotPersona
 */

/** @satisfies {Record<string, any>} */
const FS_BOT_PERSONAS = {
    /** The floor of the objective weight: no character ignores the tokens. */
    OBJECTIVE_FLOOR: 0.8,

    /** The generic archetypes (any faction). @type {BotPersona[]} */
    ARCHETYPES: [
        {
            id: 'aggressor', name: 'Агрессор', text: 'лезет в бой с первого же плана, копит армию, а не экономику',
            weights: { objective: 1.1, aggression: 1.6, greed: 0.6, tech: 0.6, turtle: 0.5, risk: 1.3 },
            tempo: 'early', triggers: { grudge: 1.5, leader: 1.0, exposed: 1.4, endgame: 1.0 },
            likes: { units: {}, combat: [], orders: [] }, build: { cities: 1 },
        },
        {
            id: 'builder', name: 'Строитель', text: 'города, фабрики, освоение; армия поздно, но большая',
            weights: { objective: 1.0, aggression: 0.6, greed: 1.6, tech: 1.2, turtle: 0.9, risk: 0.7 },
            tempo: 'late', triggers: { grudge: 0.8, leader: 1.0, exposed: 1.0, endgame: 1.4 },
            likes: { units: {}, combat: [], orders: [] }, build: { cities: 3 },
        },
        {
            id: 'technologist', name: 'Технолог', text: 'улучшения раньше отрядов; бои выигрывает картами',
            weights: { objective: 1.0, aggression: 0.9, greed: 0.9, tech: 1.8, turtle: 0.7, risk: 1.0 },
            tempo: 'mid', triggers: { grudge: 1.0, leader: 1.2, exposed: 1.0, endgame: 1.2 },
            likes: { units: {}, combat: [], orders: [] }, build: { cities: 2 },
        },
        {
            id: 'turtle', name: 'Черепаха', text: 'бастионы, доминирование, оборона своих целей; выходит под конец партии',
            weights: { objective: 1.0, aggression: 0.5, greed: 1.1, tech: 0.8, turtle: 1.8, risk: 0.5 },
            tempo: 'late', triggers: { grudge: 1.2, leader: 1.3, exposed: 0.8, endgame: 1.6 },
            likes: { units: {}, combat: [], orders: [] }, build: { cities: 2, bastions: 2 },
        },
        {
            id: 'vulture', name: 'Стервятник', text: 'бьёт того, кто слабее всех или только что потерял армию',
            weights: { objective: 1.2, aggression: 1.2, greed: 0.8, tech: 0.8, turtle: 0.6, risk: 1.4 },
            tempo: 'mid', triggers: { grudge: 0.7, leader: 1.4, exposed: 2.0, endgame: 1.2 },
            likes: { units: {}, combat: [], orders: [] }, build: { cities: 1 },
        },
    ],

    /**
     * The doctrines of the factions: several characters for one faction, each
     * built on its own cards. `faction` binds the doctrine to the faction; the
     * lobby offers only the doctrines of the bot's faction (and the archetypes).
     */
    /** @type {BotPersona[]} */
    DOCTRINES: [
        // --- Орки — Клан Злых Солнц -------------------------------------------------
        // Бойзы: 2 материи за 2 кубика — самые дешёвые кубики в игре; «Споры
        // орков» покупают отряд на каждом доминировании без приказа развёртывания;
        // «ВАААГХ!» и «Море зелёных» награждают за толпу.
        {
            id: 'orks-waaagh', faction: 'орки', name: 'Зелёный прилив', text: 'толпа бойзов с первого плана: споры, подкрепления, «ВАААГХ!»',
            line: 'WAAAGH! с первого плана',
            weights: { objective: 1.2, aggression: 1.8, greed: 0.5, tech: 0.5, turtle: 0.4, risk: 1.4 },
            tempo: 'early', triggers: { grudge: 1.6, leader: 0.9, exposed: 1.6, endgame: 1.0 },
            likes: {
                units: { 'бойзы': 1.6, 'нобзы': 1.0, 'атакующие-корабли-класса-натиск': 0.7, 'батлвагоны': 0.7, 'килл-круизеры': 0.4, 'гарганты': 0.5 },
                combat: ['ВАААГХ!', 'Море зелёных', 'Рокобойз'], orders: ['Орочьи корабли', 'Зеленая волна'],
            },
            build: { cities: 1 }, horde: true,
        },
        // Гарганты и батлвагоны — три города и кузница; «Строй быстрее!» ставит
        // город до покупки отрядов, так что КЛ растёт в том же приказе; карты
        // «Роккит вагон», «Сокрушающий гаргант», «Дночерпатель» решают бои.
        {
            id: 'orks-mek', faction: 'орки', name: 'Большие игрушки', text: 'города и кузница ради батлвагонов и гаргантов; удар со второй трети партии',
            line: 'копит на гаргантов',
            weights: { objective: 1.0, aggression: 1.0, greed: 1.2, tech: 1.3, turtle: 0.7, risk: 1.0 },
            tempo: 'mid', triggers: { grudge: 1.0, leader: 1.0, exposed: 1.1, endgame: 1.4 },
            likes: {
                units: { 'бойзы': 0.7, 'нобзы': 0.8, 'атакующие-корабли-класса-натиск': 0.6, 'батлвагоны': 1.6, 'килл-круизеры': 1.2, 'гарганты': 2.0 },
                combat: ['«Роккит вагон»', '«Пати вагон»', 'Сокрушающий гаргант', 'Дночерпатель'], orders: ['Строй быстрее!', 'Грабь!'],
            },
            build: { cities: 3, forge: true },
        },
        // «Мек бойз», «Гретчины», «Дночерпатель» — карты, которые портят бой
        // противнику; «Грабь!» и «Воруй!» — орбитальные удары за чужие ресурсы;
        // «Зелёная волна» превращает стратегию в любой приказ.
        {
            id: 'orks-kunnin', faction: 'орки', name: 'Кунин\' план', text: 'грабёж с орбиты, порча чужих карт, приказы поверх чужих; бьёт лидера',
            line: 'хитрый — грабит и пакостит',
            weights: { objective: 1.1, aggression: 1.1, greed: 0.9, tech: 1.5, turtle: 0.6, risk: 1.6 },
            tempo: 'mid', triggers: { grudge: 1.0, leader: 1.7, exposed: 1.3, endgame: 1.2 },
            likes: {
                units: { 'бойзы': 0.9, 'нобзы': 1.1, 'атакующие-корабли-класса-натиск': 1.3, 'батлвагоны': 0.9, 'килл-круизеры': 1.3, 'гарганты': 0.8 },
                combat: ['Мега нобз', 'Байкер нобзы', 'Дночерпатель', 'Рокобойз'], orders: ['Грабь!', 'Воруй!', 'Зеленая волна'],
            },
            build: { cities: 2 }, cover: true, strikes: true,
        },
        // --- Некроны — Династия Саутех ------------------------------------------------
        // Воины 2/3/0 — живучие, но без боевого духа: некроны берут бои
        // истреблением или кубами духа с карт. «Тёмный портал» переносит отряды
        // в активной системе; «Протоколы реанимации» поднимают всех.
        {
            id: 'necrons-awakening', faction: 'некроны', name: 'Пробуждение', text: 'города, бастионы и крипты; монолиты и К\'тан — удар в последней трети',
            line: 'просыпается к концу партии',
            weights: { objective: 1.0, aggression: 0.6, greed: 1.5, tech: 1.4, turtle: 1.3, risk: 0.6 },
            tempo: 'late', triggers: { grudge: 0.8, leader: 1.1, exposed: 0.9, endgame: 1.8 },
            likes: {
                units: { 'воины': 0.9, 'крейсеры-жнец': 0.6, 'бессмертные': 1.0, 'монолиты': 1.7, 'корабли-гробницы': 1.3, 'ктан': 2.0 },
                combat: ['Фаланга монолита', 'Фаланга судного дня', 'Осколок несущего ночь', 'Осколок обманщика'],
                orders: ['Миры-гробницы', 'Транслокационные крипты', 'Врата вечности'],
            },
            build: { cities: 3, bastions: 2, forge: true },
        },
        // Три воина с самого начала сильнее любой стартовой пехоты: удар по
        // ближайшему соседу, пока тот не отстроился; «Разрушители», «Лич
        // гвардия», «Воля повелителя» закрывают дух, «Протоколы реанимации»
        // позволяют драться снова.
        {
            id: 'necrons-harvest', faction: 'некроны', name: 'Жатва', text: 'истребление с первого плана: воины и бессмертные бьют ближайшего, пока он слаб',
            line: 'истребляет всё живое с первого хода',
            weights: { objective: 1.2, aggression: 1.7, greed: 0.6, tech: 0.7, turtle: 0.5, risk: 1.2 },
            tempo: 'early', triggers: { grudge: 1.5, leader: 1.0, exposed: 1.7, endgame: 1.0 },
            likes: {
                units: { 'воины': 1.4, 'крейсеры-жнец': 0.7, 'бессмертные': 1.5, 'монолиты': 0.8, 'корабли-гробницы': 0.6, 'ктан': 0.6 },
                combat: ['Разрушители', 'Лич гвардия', 'Воля повелителя', 'Рой каноптепов'], orders: ['Протоколы реанимации', 'Набег жнецов'],
            },
            build: { cities: 1 },
        },
        // Одна фаланга: армия не делится, идёт одним стеком; «Триархи
        // преторианцы» переворачивают кубик за каждого воина — чем больше
        // воинов, тем страшнее; портал собирает отряды в одно место.
        {
            id: 'necrons-phalanx', faction: 'некроны', name: 'Фаланга', text: 'снежный ком: одна большая армия, которая не делится и растёт с каждым раундом',
            line: 'катит одну фалангу',
            weights: { objective: 1.0, aggression: 1.1, greed: 1.0, tech: 0.9, turtle: 0.9, risk: 0.7 },
            tempo: 'mid', triggers: { grudge: 1.2, leader: 1.2, exposed: 1.0, endgame: 1.3 },
            likes: {
                units: { 'воины': 1.5, 'крейсеры-жнец': 0.5, 'бессмертные': 1.3, 'монолиты': 1.2, 'корабли-гробницы': 0.7, 'ктан': 1.0 },
                combat: ['Триархи преторианцы', 'Фаланга судного дня', 'Воля повелителя', 'Фаланга монолита'], orders: ['Протоколы реанимации', 'Миры-гробницы'],
            },
            build: { cities: 2 }, stack: true,
        },
        // Портал, «Врата вечности», «Осколок обманщика»: отряды появляются там,
        // где их не ждали; бьёт по оголённым целям и уходит.
        {
            id: 'necrons-phase', faction: 'некроны', name: 'Фазовый сдвиг', text: 'порталы и врата: сильные отряды появляются у оголённых целей и исчезают',
            line: 'неуловимый — бьёт там, где не ждут',
            weights: { objective: 1.3, aggression: 1.2, greed: 0.8, tech: 1.3, turtle: 0.6, risk: 1.5 },
            tempo: 'mid', triggers: { grudge: 0.8, leader: 1.4, exposed: 2.0, endgame: 1.3 },
            likes: {
                units: { 'воины': 0.8, 'крейсеры-жнец': 0.9, 'бессмертные': 1.3, 'монолиты': 1.3, 'корабли-гробницы': 1.0, 'ктан': 1.6 },
                combat: ['Осколок обманщика', 'Разрушители', 'Рой каноптепов', 'Воля повелителя'], orders: ['Врата вечности', 'Протоколы реанимации', 'Транслокационные крипты'],
            },
            build: { cities: 2 }, strikes: true,
        },
    ],

    /** The lines of the characters: what the bot writes in the log. */
    // The lines of the chronicle. A line that starts with a small letter is a
    // predicate — the name of the seat is written before it («Варбосс идёт за
    // блестяшкой.»); a line in «…» is direct speech and stands as it is.
    LINES: {
        generic: {
            plan: ['меняет план.', 'смотрит на карту иначе.'],
            attack: ['идёт в наступление.', 'выдвигает армию.'],
            grab: ['идёт за своей целью.', 'нацелился на жетон цели.'],
            defend: ['укрепляет оборону.', 'стягивает силы к своим мирам.'],
            build: ['отстраивается.', 'вкладывается в экономику.'],
            grudge: ['этого не забудет.', 'запомнил обидчика.'],
            leader: ['видит, кто вырвался вперёд.', 'не даст лидеру уйти.'],
            exposed: ['заметил оголённый сектор.', 'видит брешь у соседа.'],
            endgame: ['понимает: времени мало.', 'бросает всё на цели.'],
            battle: ['принимает бой.', 'вступает в битву.'],
            capture: ['забрал своё.', '«Ещё одна цель собрана.»'],
        },
        'орки': {
            plan: ['меняет план — старый был скучный.', 'придумал новый план. Опять.'],
            attack: ['«WAAAGH!»', '«Бойзы, вперёд!»', '«Больше драки!»'],
            grab: ['идёт за блестяшкой.', 'забирает своё, остальное — добыча.'],
            defend: ['окапывается. Ненадолго.', 'ставит пару бастионов — для драки нужна база.'],
            build: ['строит. Мекбойз рады.', 'копит на большие игрушки.'],
            grudge: ['этого не прощает. Никому.', 'запомнил, кто первый начал.'],
            leader: ['видит, у кого больше всех блестяшек.', '«Лидер — самая жирная цель.»'],
            exposed: ['видит, что у соседа пусто дома.', '«Сосед ушёл воевать — самое время зайти в гости.»'],
            endgame: ['больше не копит — пора драться.', '«Последний WAAAGH!»'],
            battle: ['начинает драку!', '«Дакка-дакка-дакка!»'],
            capture: ['забрал блестяшку!', '«Ещё одна блестяшка в коллекции.»'],
        },
        'некроны': {
            plan: ['пересчитывает протоколы.', 'меняет план пробуждения.'],
            attack: ['начинает жатву.', 'выдвигает фалангу.'],
            grab: ['возвращает то, что принадлежало династии.', 'идёт к своему жетону.'],
            defend: ['уходит в гробницы и укрепляется.', 'поднимает бастионы вокруг своих миров.'],
            build: ['расширяет сеть гробниц.', 'пробуждает новые крипты.'],
            grudge: ['«Династия не забывает.»', 'записал обидчика в список на истребление.'],
            leader: ['видит, кто торопится жить.', '«Лидер будет остановлен.»'],
            exposed: ['видит незащищённый мир соседа.', '«Портал ведёт туда, где никого нет.»'],
            endgame: ['«Пробуждение завершено.»', '«Время истекает — фаланга выступает.»'],
            battle: ['вступает в бой. Без эмоций.', '«Протоколы атаки активированы.»'],
            capture: ['забрал свой жетон.', '«Ещё один артефакт возвращён династии.»'],
        },
    },

    /** The characters a faction may play: its doctrines first, then the archetypes. */
    for(factionId) {
        const own = this.DOCTRINES.filter(d => d.faction === factionId);
        return own.concat(this.ARCHETYPES);
    },

    /** The whole list for the lobby: every character with its faction (if any). */
    all() {
        return this.DOCTRINES.concat(this.ARCHETYPES);
    },

    get(id) {
        return this.DOCTRINES.find(d => d.id === id) || this.ARCHETYPES.find(a => a.id === id) || null;
    },

    /** Does this character fit the faction? An archetype fits everybody. */
    fits(id, factionId) {
        const p = this.get(id);
        return !!p && (!p.faction || p.faction === factionId);
    },

    /** The character a faction plays by default: its first doctrine, else the archetype of its temper. */
    defaultFor(factionId) {
        const own = this.DOCTRINES.find(d => d.faction === factionId);
        if (own) return own.id;
        const temper = {
            'орки': 'aggressor', 'космодесант-хаоса': 'aggressor', 'тираниды': 'aggressor',
            'темные-эльдары': 'vulture', 'эльдары': 'vulture', 'инквизиция': 'vulture',
            'империя-тау': 'technologist', 'адептус-механикус': 'technologist',
            'некроны': 'builder',
            'имперская-гвардия': 'turtle', 'космодесант': 'turtle', 'сестры-битвы': 'turtle',
        };
        return temper[factionId] || 'aggressor';
    },

    /** The weights with the floor of the objectives applied. */
    weightsOf(persona) {
        const w = Object.assign({ objective: 1, aggression: 1, greed: 1, tech: 1, turtle: 1, risk: 1 }, persona && persona.weights || {});
        w.objective = Math.max(this.OBJECTIVE_FLOOR, w.objective);
        w.likesCombat = persona && persona.likes ? persona.likes.combat || [] : [];
        return w;
    },

    /**
     * The aggression of the moment: the tempo of the character against the
     * progress of the party (0 — the start, 1 — the end), never a round number.
     */
    tempoFactor(persona, progress) {
        const p = Math.max(0, Math.min(1, progress || 0));
        switch (persona && persona.tempo) {
            case 'early': return 1.4 - 0.5 * p;            // hot from the start, cooling a little
            case 'late': return p < 0.5 ? 0.55 + 0.3 * p : 0.7 + 1.2 * (p - 0.5); // sleeps, then wakes
            default: return 0.8 + 0.9 * Math.sin(Math.PI * p); // the middle of the party
        }
    },

    /** A line of the character for a moment; the faction's own words first. */
    line(factionId, personaId, kind, rnd) {
        const own = this.LINES[factionId] && this.LINES[factionId][kind];
        const list = own && own.length ? own : (this.LINES.generic[kind] || []);
        if (!list.length) return '';
        const i = Math.floor((rnd ? rnd() : 0) * list.length);
        return list[Math.min(i, list.length - 1)];
    },

    /** The hint of the lobby: the name of the bot and the hint line. */
    hint(factionId, personaId) {
        const p = this.get(personaId);
        if (p && p.faction === factionId && p.line) return p.line;
        return p ? p.text : '';
    },
};
