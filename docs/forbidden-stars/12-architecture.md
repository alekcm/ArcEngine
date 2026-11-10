# Устройство кода Forbidden Stars

Этот файл — карта кода игры: из чего он состоит, что является единственным источником
истины для каждого правила и куда идти, чтобы исправить ошибку **один раз**. Правила игры
описаны в `01`–`11` этой папки; здесь — только архитектура.

## Слои

```
            ┌───────────────────────────────────────────────┐
браузер      │ FSUI — панели  ·  FSGame — клики и связка     │
             │ FSView — доска в 3D (Babylon)                 │
             └───────────────┬───────────────────────────────┘
                             │ команды (JSON) — состояние (JSON)
            ┌────────────────┴───────────────────────────────┐
сеть        │ FSNet (клиент)  ·  tools/fs-server.mjs (сервер)│
             └────────────────┬───────────────────────────────┘
                             │ FS_RULES.apply(state, seat, cmd)
            ┌────────────────┴───────────────────────────────┐
правила     │ FSRules.js — фасад (сборка, ничего своего)     │
             │ rules/*Rules.js — службы по фазам и приказам   │
             │ FSEffects.js — текст карты → шаги игры         │
             │ effects/ — каждая группа шагов: вопрос и дело  │
             │ FSCards.js, FSWarpStorms.js — карты и границы  │
             └────────────────┬───────────────────────────────┘
                             │ читают, не хранят
            ┌────────────────┴───────────────────────────────┐
предметный  │ core/FSBoard.js      доска: контроль, вместимость,
слой         │                      соседи, путь, штормы      │
             │ core/FSPlayers.js    ресурсы и пределы, материя,
             │                      командный уровень, запас   │
             │ core/FSCatalog.js    печатные данные, цвета, палитры,
             │                      предел ресурсов, sameName    │
             │ core/FSGeometry.js   поворот тайла, стороны, области │
             │ core/FSCombatSides.js стороны боя: место ↔ сторона   │
             │ core/FSRulesConfig.js числа игры                │
             │ FSData.js            данные из docs (генерируются) │
             └─────────────────────────────────────────────────┘
```

Зависимости идут только вниз. Ни `core/`, ни `rules/` не знают про DOM, Babylon, сеть и
интерфейс; всё это знает только верхний слой. Поэтому одну и ту же норму видят и сервер,
и клиент, и панель.

## Состояние и команды

* Состояние — **обычный JSON** (`state`): игроки, системы, отряды, постройки, цели, штормы,
  бой, приказ, журнал. Сервер — единственный, кто его меняет; клиент шлёт команды
  `FS_RULES.apply(state, seat, cmd)` и рисует присланное.
* Служба правил (`rules/*.js`) **не держит своего состояния**: первым аргументом она получает
  `state`, поэтому партия остаётся сериализуемой, а команда — воспроизводимой.
* Службы не знают друг о друге напрямую: соседа они зовут через `this.engine` (фасад
  `FS_RULES`). Поэтому «наступление» может начать бой, не импортируя боевую службу.
* `Board.of(state)` и `PlayerEntity.of(state, seat)` — **объекты-представления** того же
  состояния (кэш по `WeakMap`). Они ничего не копируют: команда меняет `state`, и тот же
  объект доски сразу читает новую картину.

## Где что менять (единственный источник истины)

| Норма | Файл | Что не надо делать |
|---|---|---|
| Числа игры: раскладка, предел области, жетоны приказов, коробка построек | `core/FSRulesConfig.js` | не дублировать числа в правилах и панели |
| Фракция, отряд, постройка, тайл, карта, цвет, палитра | `core/FSCatalog.js` | не искать по `FS_DATA` в правилах, виде и панели — это ловит `fs-smoke` |
| Исключение фракции (например, 4 жетона подкрепления у тиранидов, поднятый картой предел ресурсов) | `core/FSCatalog.js` (`FS_FACTION_TRAITS`) + `core/FSPlayers.js` | не писать `faction === 'тираниды'` в пяти местах |
| Поворот тайла, стороны, какие области сходятся | `core/FSGeometry.js` | не считать поворот отдельно в текстуре, клике и правилах |
| Кто в бою атакующий, кто защитник; сторона места и место стороны | `core/FSCombatSides.js` | не писать `seat === c.attacker ? 'attacker' : 'defender'` заново |
| Соседи, контроль области, вместимость, путь по своим мирам, верх стопки приказов, шторм на границе | `core/FSBoard.js` | не реализовывать путь/контроль в эффектах карт или в панели |
| Ресурсы и их предел, материя и её предел, командный уровень, доход, запас моделей | `core/FSPlayers.js` | не писать `p.materiel -= …` и `assets.x = …` — это ловит `fs-smoke` |
| Можно ли поставить постройку на мир (и разрешение карты на вторую) | `rules/DeployRules.js` (`canPlaceStructure`) + `Board.hasStructure` | не считать `structuresAt(...).length` в правиле или карте |
| Боевая колода и рука боя: добор, сброс, замена пары, возврат руки, скрытая рука противника | `js/fs/FSCards.js` (`FSCombatDeck`, `FSCombatHand`, `player.combatDeck`, `player.combatHand`) | не трогать `decks.combat` и `cards[side].hand` напрямую — это ловит `fs-smoke` |
| Сколько карт берётся в бой и сколько отрядов стоит в области | `core/FSRulesConfig.js` (`COMBAT_HAND`, `AREA_MAX_UNITS`) + `Board.unitLimit/hasRoom` | не считать «пять» в правиле или в карте |
| Предел развёртывания: какие миры считаются фабриками и сколько отрядов покупается | `rules/DeployRules.js` (`deployLimit`, `deployWorlds`, `hasFactory`) | не пересчитывать фабрики приказа в панели и карте — спрашивать `deployLimit` |
| Настройка карты: тайлы, стартовые силы, цели, шторма | `rules/SetupRules.js` | — |
| Планирование, четыре жетона по кругу | `rules/PlanningRules.js` | — |
| Операции, очередь хода, конец приказа | `rules/OperationsRules.js` | — |
| Приказ «наступление»: два шага, замороженные маршруты, один бой, орбитальный удар | `rules/AdvanceRules.js` | не добавлять маршрут в обход `advanceRoutes` |
| Приказ «развёртывание»: отряды, постройка, отложенная оплата, убыль | `rules/DeployRules.js` | — |
| Приказ «стратегия»: улучшения, уровни, скидки | `rules/StrategizeRules.js` | — |
| Приказ «доминирование»: ресурсы миров, процветание, способность фракции | `rules/DominateRules.js` | — |
| Обновление: цели, материя, ралли, события, конец раунда | `rules/RefreshRules.js` | — |
| Варп-штормы: ход по иконке карты, границы сетки | `rules/StormsRules.js` + `FSWarpStorms.js` | не двигать шторм «на систему» в обход границы |
| Бой: раунды, карты, кубики, урон, подкрепления, отступление, трофеи | `rules/CombatRules.js` | не считать значения боя в панели — спрашивать `combatValues` |
| Деморализация отряда и её круг | `rules/CombatRules.js` (`routeUnit`/`restoreUnit`) | не писать `u.routed = true` и `routedRound` рядом — это ловит `fs-smoke` |
| Конец приказа и его вопрос | `rules/OperationsRules.js` (`closeOrder`) | не ставить `state.order = null` — вопрос приказа останется висеть |
| Перенос отряда или постройки, след хода | `core/FSBoard.js` (`moveUnit`/`placeUnit`) | не писать `u.system = …; u.area = …` — это ловит `fs-smoke` |
| Что приказ уже купил: предел развёртывания, одна постройка, пары сделки | `rules/DeployRules.js` (`unitsBought`/`structureBought`/`dealBought` по `order.purchases`) | не заводить второй счётчик `order.bought` — это ловит `fs-smoke` |
| Области, где игрок ещё не выбрал лишние отряды | `core/FSTrim.js` (`TrimQueue`) + `FS_RULES.trimQueue(state)` | не читать и не писать `state.trim` мимо очереди — это ловит `fs-smoke` |
| Где стоит варп-шторм | `FSWarpStorms.js` (`WarpStormField.create/write`) | не писать `storm.edge`/`a`/`b` в правиле или карте — это ловит `fs-smoke` |
| Удар с орбиты: бонус, оплата карт, цена построек, первый отряд | `core/FSStrike.js` (`StrikePlan.of(order)`) | не писать `order.strike*` в правиле, шаге карты или панели — это ловит `fs-smoke` |
| Шаг марша, его дороги, отменённые ходы, спорная область | `core/FSMarch.js` (`MarchPlan.of(order)`) | не писать `order.moved`/`route`/`steps` в правиле, бое или панели — это ловит `fs-smoke` |
| Шаг приказа (`move`, `combat`, `strike`, …) | `core/FSPhase.js` (`PhasePlan.of(order)`) | не сравнивать `order.phase` со строкой в правиле или панели — это ловит `fs-smoke` |
| Фаза раунда, чей ход, круг игроков и номер раунда | `core/FSGamePhase.js` (`GamePhase.of(state)`) | не читать `state.phase`/`state.turn`/`state.firstPlayer`/`state.round` в правиле, доске или панели — это ловит `fs-smoke` |
| Вопрос шага: кто отвечает, где прерван эффект, чем ответить | `core/FSQuestion.js` (`Question.of(state)`) | не писать и не читать `state.pending` в правиле, эффекте или панели — это ловит `fs-smoke` |
| Сборка карты: этап, чья рука играет, тайлы и штормы | `core/FSBoardSetup.js` (`BoardSetup.of(state)`) | не читать `state.setup` в правиле, доске или панели — это ловит `fs-smoke` |
| Журнал игры: запись шага, хвост для панели, предел в двести строк | `core/FSGameLog.js` (`GameLog.of(state)`) | не читать и не резать `state.log` в правиле, доске или панели — это ловит `fs-smoke` |
| Конец партии: победитель, дележ победы, объявление | `core/FSGameOutcome.js` (`GameOutcome.of(state)`) | не читать `state.over`/`state.winner`/`state.shared` в правиле или панели — это ловит `fs-smoke` |
| Откуда пришли отряды приказа: след ходов для отступления | `core/FSMarchTrail.js` (`MarchTrail.of(state)`) | не писать и не читать `state.moves` в правиле — это ловит `fs-smoke` |
| События раунда: сколько карт ещё не разыграно | `core/FSEventRound.js` (`EventRound.of(state)`) | не считать `state.eventsLeft` в правиле или снимке — это ловит `fs-smoke` |
| Урон орбитального удара: кто принимает удары и сколько | `core/FSStrikeDamage.js` (`StrikeDamage.of(state)`) | не читать `state.strike` в правиле или панели — это ловит `fs-smoke` |
| Тестовый бой и готовая карта: стороны, ростер, колоды | `core/FSBattleTest.js` (`BattleTest.of(state)`) | не читать `state.testMode`/`state.testBattle` в правиле, бое или панели — это ловит `fs-smoke` |
| Броски кубиков и идентификаторы партии | `core/FSChance.js` (`Chance.of(state)`) | не трогать `state.rng`/`state.uid` в правиле или доске — это ловит `fs-smoke` |
| Дополнительное продвижение «Мобилизированных охотников» | `core/FSPreAdvance.js` (`PreAdvance.of(state)`) | не читать `state.preAdvanceMain` в правиле — это ловит `fs-smoke` |
| Система, выбранная шагом «Выберите систему» | `core/FSChoice.js` (`Choice.of(state)`) | не писать и не читать `state.chosenSystem` в шаге эффекта — это ловит `fs-smoke` |
| Чьё это место: чей вид прислан игроку | `core/FSSeat.js` (`Seat.of(state)`) | не сравнивать `state.seat` с номером места в панели, доске или правиле вида — это ловит `fs-smoke` |
| «Вместо раскрытия приказа»: предложение плана и занятый им ход | `core/FSOrderScheme.js` (`OrderScheme.of(state)`) | не читать `state.operationSchemeOffered`/`operationSchemeAccepted` в правиле или эффекте — это ловит `fs-smoke` |
| Шторм события: ответ «Молящегося», подавление иконок, система последней потери | `core/FSStormPhase.js` (`StormPhase.of(state)`) | не читать `state.stormReaction`/`chaosNoStormMove`/`chaosLastSystem` в правиле или карте — это ловит `fs-smoke` |
| «Быстрый ответ»: приостановленная фаза событий и её снимок | `core/FSQuickResponse.js` (`QuickResponse.of(state)`) | не читать `state.quickResponsePending`/`quickResponseSnapshot` в правиле или эффекте — это ловит `fs-smoke` |
| Событие фазы обновления: рука, выбранная карта, открытая карта, сдвинутый шторм | `core/FSEventPhase.js` (`EventPhase.of(state)`) | не читать `state.event.seat`/`drawn`/`chosen`/`top`/`card`/`stormMoved` в правиле или эффекте — это ловит `fs-smoke` |
| Купленные улучшения «Стратегии» и их отмена | `core/FSUpgrades.js` (`UpgradeOrder.of(order)`) | не читать `order.upgrade*` в правиле или панели — это ловит `fs-smoke` |
| Скидки и сделки приказа, цена покупки | `core/FSDeal.js` (`OrderDeal.of(order)`) | не читать `order.discount`/`cheapUnit` в правиле или панели — это ловит `fs-smoke` |
| Где приказ может развернуть отряды | `core/FSDeployScope.js` (`DeployScope.of(order)`) | не читать `order.guardFactory`/`unitsLocked` в правиле или панели — это ловит `fs-smoke` |
| Предел развёртывания и вместимость мира под картой | `core/FSDeployLimits.js` (`DeployLimits.of(order)`) | не читать `order.capacityBonus`/`deployLimitBonus` в правиле или панели — это ловит `fs-smoke` |
| Что приказ уже купил | `core/FSPurchases.js` (`Purchases.of(order)`) | не читать и не дописывать `order.purchases` в правиле или панели — это ловит `fs-smoke` |
| Что карта приказа разрешает пройти | `core/FSOrderMove.js` (`OrderMove.of(order)`) | не читать `order.passVoid`/`ways`/`preAdvance` в правиле или на доске — это ловит `fs-smoke` |
| Что приказ добыл, кому должен и что обещал бою | `core/FSOrderTally.js` (`OrderTally.of(order)`) | не читать `order.prosperity`/`gained`/`combatReinforce` в правиле или панели — это ловит `fs-smoke` |
| Чей приказ, какой и в какой системе | `core/FSOrderContext.js` (`OrderContext.of(order)`) | не сравнивать `order.seat`/`order.order` и не читать `order.system` руками — это ловит `fs-smoke` |
| Паузы боя: схемы, в которые он ждёт, и шаг, который вернётся | `core/FSCombatHooks.js` (`CombatHooks.of(combat)`) | не читать `combat.damageHook`/`criticalHook`/`damageResume`/`prepQueued`/`lastSpend` в правиле или эффекте — это ловит `fs-smoke` |
| Стороны боя: сторона seat и seat стороны, противник и шаг урона | `core/FSCombatSides.js` (`CombatSides`) | не читать `combat.attacker`/`combat.defender` в правиле, карте или панели — это ловит `fs-smoke` |
| Приход в бой: откуда пришли отряды и был ли приказ «Наступление» | `core/FSCombatApproach.js` (`CombatApproach.of(combat)`) | не читать `combat.attackerFrom`/`viaAdvance` в правиле — это ловит `fs-smoke` |
| Итог боя: победившая сторона, проигравший seat и мораль решения | `core/FSCombatOutcome.js` (`CombatOutcome.of(combat)`) | не читать `combat.winner`/`loser`/`morale` в правиле или панели — это ловит `fs-smoke` |
| Где идёт бой: система, область и «кто здесь стоит» | `core/FSBattleField.js` (`BattleField.of(combat)`) | не сравнивать `combat.system`/`combat.pos` с отрядом руками — это ловит `fs-smoke` |
| Запреты боя: подкрепление, кубики атаки и деморализованные | `core/FSCombatBans.js` (`CombatBans.of(combat)`) | не читать `combat.noReinforce`/`ignoreFoeAtt`/`destroyRouted` в правиле или эффекте — это ловит `fs-smoke` |
| Жетоны карт в бою: `att.`/`def.` каждой стороны и их сброс в конце раунда | `core/FSCombatCubes.js` (`CombatCubes.of(combat)`) | не читать `combat.tokens` в правиле, карте или панели — это ловит `fs-smoke` |
| Обещания карт бою: конец шага, конец раунда, жетоны вперёд и павшие | `core/FSCombatPlans.js` (`CombatPlans.of(combat)`) | не читать `combat.endRoundPlans`/`laterTokens`/`deferDamage`/`fallenThisStep`/`roundUnits` в правиле или эффекте — это ловит `fs-smoke` |
| Здоровье от карт, добавки к урону, запреты и планы раунда | `core/FSCombatDamage.js` (`CombatDamage.of(combat)`) | не читать `combat.healthBonus`/`enemyHealth`/`noRoute`/`damageFirst`/`retreatInstead` в правиле или панели — это ловит `fs-smoke` |
| Боевые карты: рука, открытые карты, закрытая карта, урон шага | `core/FSCombatCards.js` (`CombatCards.of(combat)`) | не читать `combat.cards`/`staged`/`applied`/`peek` в правиле или панели — это ловит `fs-smoke` |
| Раунд боя, его шаг и кубики на столе | `core/FSCombatTurn.js` (`CombatTurn.of(combat)`) | не читать `combat.step`/`nextStep`/`round`/`dice` в правиле, эффекте или панели — это ловит `fs-smoke` |
| Жетоны боя: сколько выставлено, обращённые, уничтоженные | `core/FSCombatTokens.js` (`CombatTokens.of(combat)`) | не читать `combat.reinforce*` в правиле, карте или панели — это ловит `fs-smoke` |
| Что приказ даёт своему бою | `core/FSOrderFight.js` (`OrderFight.of(order)`) | не читать `order.klBonus`/`prepReroll`/`tempMateriel` в правиле или карте — это ловит `fs-smoke` |
| Текст карты → шаги игры | `FSEffects.js` (таблица `RULES`) | текст карты — это правило карты, отдельного кода «на карту» нет |
| Что шаг спросит у игрока | `js/fs/effects/ask/FS*Asks.js` (реестр `ASK_EXECUTORS`) | не добавлять ветку в `switch` — его больше нет |
| Что шаг сделает с ответом | `js/fs/effects/FS*Steps.js` (реестр `STEP_EXECUTORS`) | не писать действие шага в панели |

## Клиент

* `FSView` рисует доску и решает только задачи представления. Геометрию областей он берёт из
  `TileGeometry`, цвета и карты — из `FS_CATALOG`, числа правил — через `FS_RULES`/`Board`.
* `FSUI` наполняет записи `js/UILayout.js` (см. инвариант 11 в `CLAUDE.md`) и не решает правил.
* `FSGame` превращает клики в команды. Если ему нужно знать «можно ли» — он спрашивает движок
  (`canPlaceOrder`, `setupStormSides`, `advanceRoutes`, `damageCandidates`), а не повторяет
  проверку у себя.

## Списки файлов не ведутся руками

`index.html` — единственное место, где записан порядок скриптов. Из него читают список:

* `tools/asset-scan.mjs` — что попадёт в архив (раньше рукой поддерживаемый `CODE_FILES`
  потерял `FSCards.js`, `FSWarpStorms.js`, `FSEffects.js` и `FSUI.css`);
* `tools/fs-engine.mjs` — что загружают сервер и проверки (раньше сервер не грузил карты и
  штормы: покупка улучшения и ход шторма работали в браузере и падали на сервере).

Новый скрипт = файл + один `<script src>` в `index.html`.

## Как проверять

```
node tools/check.mjs          # типы (tsc по JSDoc) + сверка правил + дым-тест
node tools/fs-audit.mjs       # 207 проверок: каждая цитирует Rules Reference
node tools/fs-card-check.mjs  # 82 проверки: карты одной фракции против их текстов
node tools/fs-coverage.mjs    # сколько предложений карт движок превращает в шаги
node tools/fs-smoke.mjs       # все скрипты грузятся, раунд играется на 2 и 4 игроках
```

`fs-audit` — не набор тестов на код, а построчная сверка с правилами: она ловит регрессию
поведения при перестройке. Отдельные правила закрывают класс «текст карты обещает, движок
молчит»: `trophy-0a` («Жуткие трофеи» платит за уничтоженный отряд), `radical-0a` (обе опции
«Радикалов и пуритан» — шаги), `raid-0a` («Воруй!»: жетон уходит противнику и приходит вам),
`scheme-0a` (у каждой карты-плана есть действие, а не только заглушка — список известных
TODO назван в правиле и может только сокращаться), `scheme-0b` («Вперёд!» начинает настоящий
приказ продвижения).

`fs-coverage` считает по ЦЕЛОМУ тексту карты, как его читает игра (`parse`), и заглядывает в
ветки выбора и триггеров: заглушка внутри `choice` («Радикалы и пуритане») или в теле плана
раньше считалась действием, и отчёт завышал: честное число — 733 из 808 предложений (91 %),
75 из них — явные пояснения. Список непрочитанных пуст: пустая ячейка таблицы карт
(«— (только способность отряда)») — не предложение правил, а место, где текста нет.

`fs-smoke` ловит регрессию загрузки и связей между слоями: он проигрывает полный раунд
на двух и на четырёх игроках (6 и 12 систем) и проверяет, что все имена, которые клиент зовёт
у правил и каталога (сейчас 241 обращение), существуют; отдельный раздел сверяет реестры
шагов карт (73 «дела» и 155 «вопроса» — каждый объявлен и каждый — функция), а ещё один —
сам предметный слой: стороны боя и верх стопки приказов.

Шестьдесят один раздел дыма стоят на страже «одно понятие — одно место»; каждый проверен подделкой
(вставленные `assets.forge++`, `cards[side].hand.splice`, `p.materiel -= 1`, ручной счёт
пяти отрядов, `structuresAt(...).length`, `state.order = null`, `u.routed = true`,
`order.bought++`, чтение `state.trim` мимо очереди, `storm.edge = …` мимо поля штормов и
`order.strikeBonus = …` мимо `StrikePlan` `order.moved = []` мимо `MarchPlan` и `order.phase === 'move'` мимо `PhasePlan` `order.upgradesBought++` мимо `UpgradeOrder` и `order.discount` мимо `OrderDeal` и `order.unitsLocked` мимо `DeployScope` и `order.capacityBonus` мимо `DeployLimits` `order.klBonus` мимо `OrderFight` `order.purchases` мимо `Purchases` `order.moveAreaLimit` мимо `OrderMove` `order.prosperity` мимо `OrderTally`, `order.seat`/`order.system` мимо `OrderContext` `combat.reinforcePending` мимо `CombatTokens` и `combat.step`/`combat.dice` мимо `CombatTurn` `combat.staged` мимо `CombatCards` `combat.healthBonus`/`combat.noRoute` мимо `CombatDamage` и `combat.damageResume` мимо `CombatHooks` и `combat.endRoundPlans`/`laterTokens` мимо `CombatPlans` `combat.tokens` мимо `CombatCubes` и `combat.noReinforce`/`ignoreFoeAtt` мимо `CombatBans` `combat.system`/`combat.pos` мимо `BattleField` `combat.winner`/`loser` мимо `CombatOutcome` `combat.attackerFrom`/`viaAdvance` мимо `CombatApproach` `combat.attacker`/`combat.defender` мимо `CombatSides` `state.event.seat`/`drawn`/`chosen` мимо `EventPhase` `state.quickResponsePending`/`Snapshot` мимо `QuickResponse` `state.stormReaction`/`chaosNoStormMove` мимо `StormPhase` `state.operationScheme*` мимо `OrderScheme` `state.pending` мимо `Question` и `state.phase` мимо `GamePhase` и `state.setup` мимо `BoardSetup` и `state.log` мимо `GameLog` и `state.over` мимо `GameOutcome` и `state.moves` мимо `MarchTrail` и `state.eventsLeft` мимо `EventRound` и `state.strike` мимо `StrikeDamage` и `state.testBattle` мимо `BattleTest` и `state.rng` мимо `Chance` и `state.preAdvanceMain` мимо `PreAdvance` и `state.chosenSystem` мимо `Choice` и `state.seat` мимо `Seat`
дают провал с именем файла и строкой):

* жетоны: только `PlayerEntity` пишет в `assets`;
* материя: только `PlayerEntity` начисляет и списывает её (`payMateriel`/`gainMateriel`,
  предел 14 живёт там же);
* боевая колода и рука боя: только `FSCards.js` правит `decks.combat`, `decks.upgradeCombat`
  и `cards[side].hand`;
* предел области (пять отрядов одного игрока): считает только доска (`unitLimit`/`hasRoom`);
* постройка на мире: можно ли её ставить, решает `canPlaceStructure`, а разрешение карты
  («…где уже есть 1 ваша постройка другого типа») — его аргумент, а не второе правило;
* перенос фигуры: `system`/`area` отряда и след в `state.moves` пишет только `Board.moveUnit`
  (`placeUnit` — то же без следа), правило и карта просят доску;
* конец приказа: `state.order = null` ставит только `OperationsRules.closeOrder` — оно же
  снимает вопрос, который принадлежал приказу (вопрос эффекта карты переживает конец приказа);
* деморализация: пометку `routed` и круг, в котором отряд её получил, пишет одна пара
  `CombatRules.routeUnit`/`restoreUnit` — её зовут бой, ралли и карты;
* покупки приказа: сколько куплено, была ли постройка и сколько пар по сделке фракции —
  всё считается из `order.purchases` (`DeployRules.unitsBought/structureBought/dealBought`),
  поэтому отмена покупки уменьшает счёт сама;
* сверх вместимости: области, где игрок ещё не выбрал, кого отправить в запас, — очередь
  `TrimQueue` (`core/FSTrim.js`); поле `state.trim` пишет только она, правило и панель
  спрашивают `FS_RULES.trimQueue(state)`;
* варп-шторм: запись границы (`edge`, `a`, `b`, `tiles`) пишет только `FS_WARP_STORMS.write`,
  правило и карта просят поле штормов;
* орбитальный удар: его шестнадцать полей (`strikeBonus`, `strikePlanned`, `strikePays`,
  `strikeWorld`, …) — один объект `StrikePlan` (`core/FSStrike.js`); правило продвижения,
  шаги карт и панель спрашивают его.
* марш наступления: шаг движения, дороги шага, шедшие отряды, стопка отменённых ходов,
  спорная область и предел числа ходов — один объект `MarchPlan` (`core/FSMarch.js`);
  правило продвижения, бой и панель спрашивают его.
* фаза игры — один объект `GamePhase` (`core/FSGamePhase.js`): четыре фазы
  раунда константами (`SETUP`/`PLANNING`/`OPERATIONS`/`REFRESH`), их подписи для
  панели (`label`), вопрос `is(...)`, начало фазы (`start`), действующий игрок
  (`active`, `isActive` — в сборке карты это её собственный ход, иначе ход фазы),
  номер раунда (`round`, `startRound`), ход фазы (`turn`, `isTurn`,
  `nextTurn` — поле фазы, а не действующий игрок: в сборке карты они разны) и
  круг игроков: первый игрок
  (`firstPlayer`, `isFirst`, `passFirst`), порядок от него (`circle`) и тот, кто
  открывает планирование, если первый выбыл (`opener`).
* сборка карты — один объект `BoardSetup` (`core/FSBoardSetup.js`): этапы
  (`stage`, `setStage`, `is` — `TILES`/`FORCES`/`OBJECTIVES`/`STORMS`), чья рука
  играет (`turn`, `isTurn`), система под расстановку сил (`currentSystem`) и
  ход сборки: тайл из руки на карту (`placeTile`), очередь игроков с
  непустыми руками (`nextPlayer`) и варп-штормы «в обратном порядке хода»
  (`nextStorm`); запись остаётся в `state.setup` той же формы.
* место игрока — один объект `Seat` (`core/FSSeat.js`): чей это вид (`me`,
  `any`), вопрос «это я?» (`isMe`, `isOther`), запись места в вид
  (`stateOf`) и игрок этого места (`player`). Состояние сервера места не имеет
  — вид для игрока получает его в `FS_RULES.view`.
* выбор системы — один объект `Choice` (`core/FSChoice.js`): выбранная
  система (`choose`, `system`, `has`) и её расход, когда эффект закончился
  (`clear`). Шаги, читающие «этой системы», спрашивают её здесь: без этого
  «Пожиратель миров» платил один жетон вместо суммы материи миров.
* дополнительное продвижение — один объект `PreAdvance` (`core/FSPreAdvance.js`):
  основной приказ, отложенный на время дополнительного (`suspend`, `held`,
  `suspended`), его возврат (`resume`) и отметка, что дополнительное
  продвижение уже было (`done`, `wasDone`).
* броски и идентификаторы — один объект `Chance` (`core/FSChance.js`):
  дробь генератора (`float`), число ниже предела (`below`), перемешивание
  (`shuffle`) и выбор из списка (`pick`), грани боя (`roll`, `FACES`) и
  идентификаторы объектов (`id`); числа остаются в `state.rng`/`state.uid`,
  так что партия с зерном повторяется.
* тестовый бой — один объект `BattleTest` (`core/FSBattleTest.js`): вид стола
  (`mode`, `MAP`/`BATTLE`, `active`), стороны (`side`, `participant`), поле и
  ростер (`system`, `pos`, `roster`), колоды и подкрепление (`decks`,
  `reinforcement`) и повтор боя (`replayable`, `begin`).
* урон орбитального удара — один объект `StrikeDamage` (`core/FSStrikeDamage.js`):
  начало удара (`begin`), кому принимать (`waiting`), куда падают удары
  (`aimedAt`), первый отряд «Набега жнецов» (`first`, `untouched`), принятый
  урон (`take`, `damaged`, `left`) и конец записи (`spent`, `end`); запись
  остаётся в `state.strike` той же формы.
* события раунда — один объект `EventRound` (`core/FSEventRound.js`): начало
  шага событий (`begin` — по карте на игрока), остаток (`left`, `pending`),
  разыгранная карта (`played`) и возврат счёта из снимка «Быстрого ответа»
  (`restore`); число остаётся в `state.eventsLeft`.
* след ходов приказа — один объект `MarchTrail` (`core/FSMarchTrail.js`):
  запись перехода (`record`), чистый лист на новый приказ (`reset`) и два
  чтения для отступления — кто вошёл в область (`walkedInto`) и откуда он
  пришёл (`cameFrom`); список остаётся в `state.moves` той же формы.
* итог партии — один объект `GameOutcome` (`core/FSGameOutcome.js`): конец
  партии (`over`, `end`), победитель (`winner`, `isWinner`), дележ победы
  (`shared`, `tied`, `shares`, `victors`) и два пути к концу — по целям
  (`declare`) и по последнему выжившему (`byElimination`); объявление для
  панели (`headline`) и строка журнала (`note`) читают те же поля.
* журнал игры — один объект `GameLog` (`core/FSGameLog.js`): запись шага
  (`add`), слово самой игры (`note`, место `GAME`), хвост для панели и статуса
  (`last`, `text`, `lines` с именем говорившего) и предел в двести записей
  (`LIMIT`); запись остаётся в `state.log` той же формы `{ seat, text }`.
* вопрос шага — один объект `Question` (`core/FSQuestion.js`): остановленный
  эффект (`ask` — кто спрашивает, какой список шагов прерван и на каком шаге,
  каким вопросом и в каком контексте), кому отвечать (`seat`, `answerSeat`,
  `answers`), сам вопрос (`question`), прерванный список (`steps`, `index`,
  `ctx`) и продолжение (`close`); запись остаётся в `state.pending` той же формы,
  чтобы сейв, тест и сеть читали её как раньше.
* «вместо раскрытия приказа» — один объект `OrderScheme` (`core/FSOrderScheme.js`):
  ключ попытки раскрытия (`key`), предложение плана ровно один раз на неё
  (`offer`/`asked`) и согласие, которым план занял ход вместо приказа
  (`accept`/`accepted`/`clearAccepted`); новый раунд предлагает планы снова
  (`reset`).
* шторм события — один объект `StormPhase` (`core/FSStormPhase.js`): движение,
  которое может отменить другой игрок (`offer`, `reaction`, `reacting`,
  `clearReaction`), подавление иконок трёх раскрытых карт (`iconsMove`,
  `suppressIcons`, `allowIcons`) и система последнего уничтоженного отряда, по
  которой карта считает предел командования (`lastSystem`, `markLastSystem`).
* «Быстрый ответ» — один объект `QuickResponse` (`core/FSQuickResponse.js`): фаза
  событий приостановлена (`suspend`, `wait`, `pending`), её снимок
  (`phase`/`turn`/`event`/`eventsLeft`) возвращается один раз (`resume`) или
  забывается при отказе (`forget`); второй снимок не пишется — иначе фаза
  вытянула бы лишнюю карту события.
* событие фазы обновления — один объект `EventPhase` (`core/FSEventPhase.js`): кто
  играет событие (`seat`, `isSeat`), его рука (`drawn`), выбранная карта
  (`chosen`, `choose`) и открытая ради шторма (`top`, `revealTop`), карта в игре
  (`card`, `cardName`, `setCard`) и сдвиг шторма по её иконке (`stormMoved`,
  `markStormMoved`); снимок «Быстрого ответа» держит то же поле, поэтому состояние
  по-прежнему сериализуется.
* шаг приказа (`units`, `structures`, `move`, `combat`, `strike`, `strike-first`,
  `strike-damage`, `guardDeploy`, `done`) — один объект `PhasePlan` (`core/FSPhase.js`);
  названия шагов стоят там же константами, правила и панель сравнивают через `is()`.
* покупки приказа «Стратегия» — один объект `UpgradeOrder` (`core/FSUpgrades.js`):
  предел покупок, счётчик, купленное боевое и приказное улучшение и их чеки для
  отмены (`combatBuy`, `orderBuy`); правило стратегии и панель спрашивают его.
* скидки и сделки приказа — один объект `OrderDeal` (`core/FSDeal.js`): цена отряда
  и цена любой покупки, бесплатная постройка названного вида, «постройка первой» и
  единственный дешёвый отряд КЛ0; цену считают `unitPrice`/`structurePrice`.
* пределы развёртывания — один объект `DeployScope` (`core/FSDeployScope.js`):
  фабрика-производитель «Массового Производства», замок «одного типа» и одна
  область ограниченного развёртывания; правило развёртывания и панель спрашивают его.
* что карта делает с пределом развёртывания — один объект `DeployLimits`
  (`core/FSDeployLimits.js`): надбавка к пределу, лишние фабрики, «города и бастионы
  считаются фабриками», единственный отряд городов, «отряды идут в мир фабрики» и
  надбавка к вместимости мира с городом.
* чей это приказ, какой и где — один объект `OrderContext` (`core/FSOrderContext.js`):
  игрок, вид приказа, активная система и вопрос `mine(seat, kind)`, с которого
  начинается каждая команда приказа; там же вложенный приказ «Департаменто
  муниторум» (`nestedKind`/`turnInto`).
* что приказ добыл и что обещал — один объект `OrderTally` (`core/FSOrderTally.js`):
  добыча доминирования, жетоны процветания, текст способности фракции, «приказ
  кончается со способностью», карты хаоса (колода и кубики морали) и обещанный
  бесплатный жетон подкрепления, который бой забирает один раз.
* стороны боя — один объект `CombatSides` (`core/FSCombatSides.js`): `sideOf`,
  `seatOf`, `foe`, `foeSeat`, `isSide`, `sideFromStep` и `damageStep`; ни одно
  правило, ни одна карта и ни одна панель не читают `combat.attacker`/
  `combat.defender` руками — иначе сторона боя и место стороны разошлись бы,
  как только бой сядут за другой стол.
* приход в бой — один объект `CombatApproach` (`core/FSCombatApproach.js`): откуда
  пришли отряды атакующего (`from`, `set`, `fromSystem`, `fromArea`) и был ли это
  приказ «Наступление» (`viaAdvance`, `freeToReturn`); отступление атакующего
  спрашивает его одним словом вместо двух полей с `|| []`.
* итог боя — один объект `CombatOutcome` (`core/FSCombatOutcome.js`): решение
  боя (`decide(winner, morale)`), его сторона и seat (`winner`, `winnerSeat`),
  проигравший, который отступает (`loserSeat`, `lostBy`), и мораль, которой решено
  (`morale`); отменённый бой (`clear`) не оставляет ни победителя, ни проигравшего.
* место боя — один объект `BattleField` (`core/FSBattleField.js`): система и
  область боя (`system`, `pos`, `area`, `set`, `is`) и один вопрос «кто здесь
  стоит» — `holds` для отряда, постройки и бастиона, `units`/`unitsHere`/`routed`
  для отрядов обеих сторон, `bastions` для бастионов; двадцать мест, где адрес
  боя сравнивался с отрядом, спрашивают его одним словом.
* запреты боя — один объект `CombatBans` (`core/FSCombatBans.js`): «противник не
  разыгрывает жетоны подкрепления» (`forbidReinforce`/`forbidsReinforce`,
  безымянный запрет — на защитника), «кубики атаки противника не считаются»
  (`ignoreFoeAttack`/`ignoresFoeAttack`/`dice`) и «деморализованные отряды
  уничтожаются в конце раунда» (`markDestroyRouted`/`destroysRouted`); ни один из
  них не снимается с концом раунда — они живут, пока жив бой.
* жетоны карт в бою — один объект `CombatCubes` (`core/FSCombatCubes.js`):
  `att.`/`def.` каждой стороны (`get`, `add`, `take`, `values`, `both`), счёт
  никогда не уходит ниже нуля, а `reset(keep)` возвращает жетоны в запас, оставляя
  тот вид, который карта удержала за собой; панель, доска и правила силы спрашивают
  оба числа одним вопросом, и обе стороны с обеими видами есть с первого вопроса.
* обещания карт бою — один объект `CombatPlans` (`core/FSCombatPlans.js`):
  планы «в конце этого раунда», «если ваши отряды не получат урона» и «если ни
  один не отступил», жетоны, обещанные следующему раунду, эффект, отложенный до
  конца шага повреждений, «деморализованные уничтожаются», жетоны, которые карта
  оставляет за собой, павшие этого шага и кандидаты на воскрешение — всё это
  судится по раунду одним `inRound`/`ofRound`, а `expire(round)` снимает
  обещания прошедшего раунда вместе с фактами раунда (`roundUnits`, `retreated`,
  `destroyedNow`).
* паузы боя — один объект `CombatHooks` (`core/FSCombatHooks.js`): каждая схема
  спрашивается один раз на сторону и шаг (`asked`/`ask`/`forget`), за ней
  возвращается прерванный шаг (`damageResume`, `endResume`, `endNext`/`endStep`)
  и отложенные с начала боя вопросы (`prepQueued`, `roundQueued`), а карта может
  передать распределение урона другому игроку (`assigner`, `assignSeat`); там же
  платёж, которым карта только что заплатила (`recordSpend`, `spentOf`,
  `spentPairs`), и отряд, который отступил по её слову (`recordRetreat`,
  `lastRetreat`).
* урон боя — один объект `CombatDamage` (`core/FSCombatDamage.js`): здоровье
  отряда под картами раунда (`health`), добавки к урону стороны (`addExtra`,
  `extra`), урон по единице и повтор шага, запрет деморализации по уровню
  командования, «свои деморализованные — тоже цель», названная первая цель и
  теряемый излишек, отступление вместо уничтожения и жетоны, которые шаг
  повреждений забирает один раз; `clear()` снимает всё, что жило «в этом раунде».
* боевые карты — один объект `CombatCards` (`core/FSCombatCards.js`): рука и
  открытые карты стороны (с их иконками), карта, положенная закрытой (`staged`,
  `unstage`, `nextStaged`), отметка карты в руке, подсмотренная карта, к чему
  привёл урон шага (`applied`), и то, что видит один игрок (`hideFrom`).
* ход боя — один объект `CombatTurn` (`core/FSCombatTurn.js`): раунд и его
  предел, шаг боя (`is`, `side`, `setStep`, `nextStep`/`release`, `holdEffect`)
  и кубики на столе (`dice`/`live`/`has`/`take`/`put`/`room`/`slots`/`faces`) —
  потраченный кубик оставляет пустой слот и не считается ни в силе, ни в
  пределе восьми.
* жетоны боя — один объект `CombatTokens` (`core/FSCombatTokens.js`): сколько
  выставлено, какие обращены в бегство и какие уничтожены (два списка вместо
  счётчика), сколько шаг уже потратил и вернул, спрошена ли схема конца шага и
  ждёт ли шаг её ответа; бесплатные жетоны карт не возвращаются в запас.
* что карта разрешает пройти — один объект `OrderMove` (`core/FSOrderMove.js`): одна
  область начала марша, пустоты и варп-штормы, соседняя система, из которой пришли
  наземные отряды и корабли, дополнительный приказ и «Быстрый ответ».
* что приказ уже купил — один объект `Purchases` (`core/FSPurchases.js`): список
  покупок, их цена, счёт отрядов и построек, пара сделки; отмена покупки убирает
  запись, и предел развёртывания сам считает по списку.
* что приказ даёт своему бою — один объект `OrderFight` (`core/FSOrderFight.js`):
  надбавка командного уровня, переброс и лишние карты этапа подготовки (забираются
  боем один раз), «только один раунд», названный отряд сверх вместимости и временная
  материя разрушенного мира.

## Шаги карт: две ступени и рамка

Разбор текста даёт список шагов (`{ op: 'gainToken', n: 1, … }`). Каждый шаг проходит две
ступени, и у каждой свой файл-класс:

```
FS_EFFECTS.step   → StepContext + ASK_EXECUTORS  → js/fs/effects/ask/FS*Asks.js
   «что шаг спросит у игрока» (155)
FS_EFFECTS.apply  → StepContext + STEP_EXECUTORS → js/fs/effects/FS*Steps.js
   «что шаг сделает с ответом» (73)
```

* `StepContext` (`FSStepContext.js`) — рамка шага: игрок, бой, сторона, ответ, помощники для
  кубиков. Раньше это были локальные переменные одного `switch`; теперь они создаются один
  раз и передаются исполнителю. Поля не копируют состояние: `p`, `combat`, `side` указывают
  на те же объекты, поэтому запись через рамку по-прежнему меняет `state`.
* `effects` — сам `FS_EFFECTS`, его помощники (`count`, `kindName`, `sameName`, …) вызываются
  как `effects.count(...)`. Другие `this.` в шаге нет.
* Сторона шага: `apply` говорит от лица владельца карты, `step` — от лица отвечающего; это
  параметр `sideSeat` рамки, а не догадка внутри шага.
* Шаг без исполнителя ничего не делает — поэтому реестр проверяется: `fs-smoke` требует, чтобы
  каждый зарегистрированный шаг был функцией, а `fs-audit` (`cards-3`) — чтобы у каждого шага,
  который разбор извлёк из карты, был исполнитель или вопрос.

## Что ещё предстоит (честно)

Перестройка сделана не до конца — ниже места, которые пока остаются крупными:

1. **`FSEffects.js` (4,5 тыс. строк)** — разбор текстов карт. Разбор табличный (`RULES`),
   а шаги больше не `switch`: «что шаг спросит» (`step`, 155 веток) и «что шаг сделает»
   (`apply`, 73 ветки) разложены по классам в `js/fs/effects/` и `js/fs/effects/ask/`, выбор
   идёт по реестру (`STEP_EXECUTORS`, `ASK_EXECUTORS`). Остались два ручных разбора одного
   фракционного текста — `chaosCard` (295 строк) и `tauCard` (226): их стоит перевести в
   те же таблицы `RULES`, чтобы весь разбор шёл одним путём.
2. **`FSGame.js`** — один класс на панели и клики. Его `panel*`-методы стоит разнести по
   классам панелей (SetupPanel, OperationsPanel, CombatPanel).
3. **`FSView.js`** — доска и стол боя в одном объекте; стол боя просится в отдельный класс.
4. **Состояние боя** (`state.combat`) — по-прежнему набор полей; следующий шаг — класс
   `Combat` с шагами (`reinforce → choose → reveal → damage → round-end`) и методами вместо
   `c.step === '…'` по всему файлу. Стороны боя уже сведены в `CombatSides`, так что этот
   класс будет менять только шаги и поля, а не перевод «место ↔ сторона».
5. **`state.order`** — около полусотни флагов (`phase`, `system`, `route`, `purchases`,
   `tempMateriel`, …). Первый шаг уже сделан: «есть ли приказ этого игрока и этого вида»
   спрашивает `orderOf(state, seat, kind)`, а не каждая команда по-своему. Следующий —
   `OrderContext` с методами вместо флагов. Пока это терпимо: флаги читает и пишет только
   слой правил, панель берёт готовые ответы (`deployStep`, `unitPrice`, `spentOf`).

Эти пять пунктов не мешают новым правилам жить в одном месте: правила, данные, геометрия,
ресурсы, стороны боя, боевая колода и рука, предел области, цены, шаги карт и загрузка уже
сведены.

Отдельно про лимит руки боя: печатные правила не знают предела карт в руке — рука боя это
пять карт, которые раздали, плюс те, что добавила карта (так и написано у «Хрономантии» и
«Священных масел»). Поэтому «лимит руки» в движке — это `FS_RULES_CONFIG.COMBAT_HAND` для
раздачи и `FSCombatHand` для всего, что карта добавляет после неё; придуманного предела,
которого нет в правилах, здесь нет.
