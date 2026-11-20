// Bombs — mini-expansion of «По следу монстра» (Книги правил/По следу монстра.md p. 4;
// cards: Witcher/Доп колоды/Бомбы.md, atlas Бомбы.jpg 4×2). 4 copies of each of 7 bombs; the
// «Двимеритовая бомба» needs the «Уязвимости и особые атаки» mini-expansion and stays in the box
// until it is in the game.
export const BOMBS = [
    { id: 'BOMB-01', name: 'Самум', cell: 'r1c1', text: 'Возьмите 1 из 2 верхних карт своего сброса.' },
    { id: 'BOMB-02', name: 'Сон дракона', cell: 'r1c2', text: 'Нанесите 1 урон. Комбинация в этом ходу битвы дополнительно наносит 1 урон, если в ней есть хотя бы 1 карта атакующего Знака (фиолетовая).' },
    { id: 'BOMB-03', name: 'Танцующая звезда', cell: 'r1c3', text: 'Нанесите 1 урон и возьмите 1 карту. Если вы сражаетесь с монстром, в названии которого есть «Гнездо», вместо этого нанесите 2 урона и возьмите 2 карты.' },
    { id: 'BOMB-04', name: 'Северный ветер', cell: 'r1c4', text: 'Посмотрите 3 верхние карты запаса жизни монстра. Отправьте в его сброс 1 из них, а остальные верните назад.' },
    { id: 'BOMB-05', name: 'Лунная пыль', cell: 'r2c1', text: 'В следующий ход монстра, после открытия карты из его запаса жизни, вы можете изменить тип атаки (удар или укус).' },
    { id: 'BOMB-06', name: 'Чёртов гриб', cell: 'r2c2', text: 'Только перед тем, как будут сформированы запасы жизней: возьмите 2 карты из своей колоды. Игнорируйте особую способность монстра до конца битвы.' },
    { id: 'BOMB-07', name: 'Двимеритовая бомба', cell: 'r2c3', text: 'Только когда срабатывает способность сброса монстра: её эффект игнорируется.', needs: 'vuln' },
];
export const BOMB = Object.fromEntries(BOMBS.map(b => [b.id, b]));
/** Bombs of the deck: the Двимеритовая one only with «Уязвимости и особые атаки» ('trail:vuln').
 *  `vuln` — is that part on (a boolean, so this data file needs no rules import). */
export const bombsInPlay = (vuln) => BOMBS.filter(b => !b.needs || (b.needs === 'vuln' && vuln));
export const BOMBS_IN_PLAY = bombsInPlay(false);
/** A fresh shuffled-ready bomb deck (4 copies of each bomb in play). */
export const bombDeckIds = (vuln) => bombsInPlay(vuln).flatMap(b => Array.from({ length: BOMB_COPIES_N }, (_, k) => b.id + '#' + (k + 1)));
export const BOMB_COPIES = 4;
const BOMB_COPIES_N = 4;
export const BOMB_LIMIT = 4;
export const bombOf = (inst) => BOMB[String(inst).split('#')[0]];
