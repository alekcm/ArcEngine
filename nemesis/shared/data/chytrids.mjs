// Chytrid physical components from the supplied Russian sheets; see the DLC status for adaptations.
export const CHYTRID_LIMITS = Object.freeze({ stinkhorn: 8, deathcap: 3, chyQueen: 1, germinator: 10, spore: 15, mycelium: 8 });
export const CHYTRID_GERMINATOR_ORDER = Object.freeze(Array.from({ length: 10 }, (_, i) => i % 2 ? 'purple' : 'green'));
export const CHYTRID_TOKEN_VALUES = Object.freeze({ stinkhorn: [1,1,2,2,2,3,3,3], deathcap: [2,3,3], chyQueen: [3,4,4] });
const all = ['stinkhorn', 'deathcap', 'chyQueen'], larger = ['deathcap', 'chyQueen'];
const designs = {
    infection: { name: 'Заражение', targets: larger, text: 'Поместите фишку спор на свой планшет. Все персонажи в отсеке получают по карте инфекции.' },
    blow: { name: 'Удар', targets: all, text: 'При двух тяжёлых травмах персонаж погибает; иначе получает тяжёлую травму.' },
    cut: { name: 'Порез', targets: all, text: 'Персонаж получает лёгкую рану и карту инфекции.' },
    charge: { name: 'Бросок', targets: all, text: 'Персонаж получает две лёгкие раны. Слизь в Redux не используется.' },
    smallGrowth: { name: 'Маленький росток', targets: ['stinkhorn'], text: 'Поместите нарост в отсек. Слизь в Redux не используется.' },
    entangle: { name: 'Опутывание', targets: ['chyQueen'], text: 'Поместите мицелий. При тяжёлой травме персонаж погибает; иначе получает лёгкую рану за каждого отростка на планшете королевы.' },
    pseudopod: { name: 'Ложноножка', targets: ['stinkhorn'], text: 'Поместите королеву в этот отсек; при атаке бегства — в отсек, который покидают. Она не атакует. Если нароста нет, поместите его.' },
    spikes: { name: 'Шипы', targets: larger, text: 'Персонажи в отсеке с двумя тяжёлыми травмами погибают; остальные получают тяжёлую травму.' },
};
const rows = [ ['infection',3],['infection',5],['blow',2],['cut',2],['cut',3],['cut',3],
    ['blow',3],['blow',4],['blow',5],['charge',4],['charge',5],['smallGrowth',2],
    ['blow',6],['entangle',3],['entangle',5],['smallGrowth',4],['pseudopod',4],['pseudopod',5],['spikes',5],['spikes',6] ];
// Preserve stable IDs while matching each image to the corresponding physical card.
const attackSheetOrder = [0,1,2,3,4,6,5,19,12,9,10,11,7,13,17,8,16,15,18,14];
export const CHYTRID_ATTACK_CARDS = rows.map(([effect, toughness], i) => Object.freeze({ id: 'chyAttack' + (i + 1), effect, toughness, ...designs[effect], sheetIndex: attackSheetOrder[i] }));
export const CHYTRID_ATTACK_BY_ID = Object.fromEntries(CHYTRID_ATTACK_CARDS.map(c => [c.id, c]));
export const CHYTRID_WEAKNESSES = Object.freeze({
    chitinDepletion: { name: 'Истощение хитина', text: 'При атаке отростка бросьте кубик боя дважды и используйте лучший результат.' },
    heightenedReadiness: { name: 'Повышенная готовность', text: 'Уменьшите значения жетонов при внезапной атаке на 1, не ниже 1.' },
    slowReaction: { name: 'Медленная реакция', text: 'Можно перебросить кубик шума в отсеке с мицелием.' },
    parasitism: { name: 'Паразитирование', text: 'При финальной проверке заражения берите три карты вместо четырёх.' },
    predictableMovements: { name: 'Предсказуемость движений', text: 'Натуральная 6 на кубике боя против отростка считается критическим результатом.' },
    fireVulnerability: { name: 'Уязвимость к огню', text: 'Когда хитрид получает урон от огнемёта или взрывчатки, он получает 1 дополнительное ранение. В Redux граната считается взрывчаткой.' },
});

// Physical sheet order; Power Surge (13) is excluded from the original-board adaptation.
const E = [
 ['coolant','Утечка охлаждающей жидкости','growth',[4],['green'],'Если Генератор неисправен — запустите самоуничтожение, иначе поместите туда неисправность. Удалите карту и замешайте сброс.', 'remove'],
 ['lifeSupport','Сбой системы жизнеобеспечения','growth',[3],['purple'],'Эффект, зависящий от цвета отсека, пропускается; удалите карту и замешайте сброс.', 'remove'],
 ['shortCircuit','Короткое замыкание','growth',[2],['green'],'На корабле нет энергии: эффект пропускается; удалите карту и замешайте сброс.', 'remove'],
 ['inside','Оно уже внутри нас','growth',[3],['green'],'Персонажи со спорами погибают, остальные проверяют четыре карты.'],
 ['inside','Оно уже внутри нас','growth',[2],['purple'],'Персонажи со спорами погибают, остальные проверяют четыре карты.'],
 ['ventilation','Споры в вентиляции','growth',[1],['green'],'Персонажи у техкоридоров получают заражение; споры в этих отсеках превращаются в наросты.'],
 ['server','Сбой работы сервера','growth',[1],['purple'],'На корабле нет энергии: эффект пропускается; удалите карту и замешайте сброс.', 'remove'],
 ['cargoSystem','Сбой СОГ','growth',[4],['purple'],'Поместите огонь в эвакуационные отсеки A и B; персонажи там без карт действий получают тяжёлую рану.'],
 ['fire','Уничтожающий пожар','growth',[3],['purple'],'Огонь распространяется в соседние отсеки через незакрытые двери.'],
 ['through','Пройти насквозь','stinkhorn',[1],[],'Если возможно, поместите королеву, поломку и нарост в отсек с персонажем и отростком.'],
 ['eruption','Выброс спор','stinkhorn',[2],['green'],'Гнездо даёт яйцо или сбрасывает яйцо и распространяет споры в отсеки с техкоридорами.'],
 ['darkGrowth','Растущий во тьме','stinkhorn',[3],['purple'],'Персонажи у наростов получают заражение. Наросты у персонажей становятся мицелием, остальные растут.'],
 ['powerSurge','Скачок напряжения','growth',[2],['green'],'Карта исключена из игры на корабле.'],
 ['airborne','Воздушно-капельная инфекция','growth',[1],['green'],'Эффект, зависящий от слизи, пропускается.'],
 ['airborne','Воздушно-капельная инфекция','growth',[4],['green'],'Эффект, зависящий от слизи, пропускается.'],
 ['creepingDeath','Ползучая смерть','stinkhorn',[4],['green'],'Поместите отросток и споры в каждый отсек с персонажами и входом в техкоридоры.'],
 ['infectedAir','Заражённый воздух','chyQueen',[1,2],['purple','purple'],'Персонажи у нароста или мицелия получают заражение; поместите споры в отсеки с персонажами.'],
 ['bloom','Цветение','deathcap',[1,2],['purple'],'Переместите королеву в исследованное гнездо, создайте соседние отростки; иначе разместите споры в неисследованных соседних отсеках.'],
 ['mycelium','Мицелий','chyQueen',[3,4],['green','green'],'Поломка в каждом отсеке с мицелием; споры во всех соседних отсеках.'],
 ['regrowth','Отрастание','deathcap',[3,4],['purple'],'Верните погибшего отростка на планшет и жетон в мешок; споры в соседних с отростками отсеках.'],
];
const eventSheetOrder = [0,19,3,9,16,2,12,5,14,6,1,11,17,4,15,18,10,7,8,13];
export const CHYTRID_EVENT_CARDS = E.map(([effect,name,mover,numbers,growth,text,finish], i) => Object.freeze({ id:'chyEvent'+(i+1), effect,name,mover,numbers,growth,text,finish:finish||'discard',sheetIndex:eventSheetOrder[i], move:{type:'none'}, noise:'none' }));
export const CHYTRID_EVENT_BY_ID = Object.fromEntries(CHYTRID_EVENT_CARDS.map(c => [c.id,c]));
export function chytridEventText(c) {
    const kind = { growth:'распространение спор', stinkhorn:'отростки', deathcap:'шляпки', chyQueen:'королева' }[c.mover];
    return 'Движение: ' + kind + ', коридоры ' + c.numbers.join(' и ') + '. Рост: ' + (c.growth.join(', ') || 'нет') + '. ' + c.text;
}
