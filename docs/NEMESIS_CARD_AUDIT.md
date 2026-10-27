# Nemesis: Redux — поимённая сверка карт и тайлов

Дата: 27.10.2026. Проверяемая база: `f3571bd140f4d006651c390d8bb59827d487f263`.

Это приложение к [постраничному аудиту правил](NEMESIS_AUDIT.md). Результаты воспроизводимых сценариев — в [протоколе тестов](NEMESIS_AUDIT_TEST_RESULTS.md), исходники — в `nemesis/tools/audit.test.mjs`.

> **Статус документа.** Таблицы ниже — снимок аудита **до** исправлений (база `f3571bd`). Колонки с меткой **T** описывают, что именно было не так и каким тестом это ловилось; после правок в ветке `arena/d2b2103a-arcengine` все эти тесты проходят (**94/94**). Актуальные значения данных и перечень изменений — [NEMESIS_AUDIT.md](NEMESIS_AUDIT.md) §3 и [протокол](NEMESIS_AUDIT_TEST_RESULTS.md) §6. Уже приведено к оригиналу: 14 карт Королевы, 8 схем координат, стартовые 6/5/3, энергопистолет без патронов, Smart Gun с перебросом, Sentry с SMG, 12 карт CEO, иконки и Computer 21 комнаты, тех. входы и коридор Рубка → 002, Medkit «и/или», опциональная усиленная броня.

## Как читать таблицы

- **T** — расхождение было воспроизведено тестом (ID в строке); после исправлений этот тест проходит.
- **S** — расхождение установлено сопоставлением оригинала и исходного кода; отдельного поведенческого теста нет.
- **OK** — совпал конкретный названный аспект, а не «карта полностью сертифицирована».
- **R** — оригинал прочитан, базовый handler найден/просмотрен; полного сценария всех ветвей, реакций и комбинаций нет. Это **не** положительный verdict.
- **C** — неоднозначность или противоречие источников.
- **U** — аспект не подтверждён; его нельзя считать проверенным по одному совпадению названия/ID.

Сокращённые имена `ActionDeck_*`, `ItemDeck_*`, `QuestItemDeck_*` обозначают PNG с соответствующим суффиксом в [`Nemesis/Колоды`](../Nemesis/Колоды/). Полные имена сохранены в каталоге, оригиналы не изменялись. Для многокарточных листов номер ячейки — слева направо, затем сверху вниз, а не номер физического экземпляра.

Сверяется **приложенный Redux-комплект**, а не произвольная редакция коммерческого Nemesis. В частности, у Queen собственная колода; количество карт берётся также из [`Атака.txt`](../Nemesis/Колоды/Атака.txt). OCR использовался для чтения; спорные символы сверялись с изображениями. Числа внутри рисунка значка нельзя путать с числом значков: например, три патрона в одном красном восьмиугольнике — один красный item icon.

Общие дефекты оплаты, очереди продолжений, секретности и вместимости действуют поверх таблиц. Отсутствие индивидуальной ошибки в строке **не** делает карту рабочей при этих общих дефектах.

## 1. Состав колод

| Колода / комплект | Оригинал / дополнительный источник | Реализация | Итог |
|---|---|---|---|
| Attack | 15 изображённых вариантов + ещё 5 Bite = **20** | 20, Bite ×6 | **OK**, `OK-01`; эффекты ниже |
| Queen Health | 9 вариантов, **14 физических карт** по `Атака.txt` | 9 карт, каждый вариант по одному | **T**, `DECK-01` |
| Serious Wounds | 8 вариантов ×3 = **24** | 24 | **OK**, `OK-03`; эффекты ниже |
| Green Items | 8 вариантов, **30** по `Атака.txt` | 30 с правильными тиражами | **OK** состава, `OK-02`; не всех эффектов |
| Red Items | 10 вариантов, **30** по `Атака.txt` | 30 с правильными тиражами | **OK** состава, `OK-02`; не всех эффектов |
| Yellow Items | 9 вариантов | 28 карт, все 9 названий | **R/U**: `Атака.txt` не задаёт тиражи жёлтых; физические тиражи не сертифицированы |
| Support Equipment | 25 вариантов | 25, по одному | **R** состава; есть существенные ошибки эффектов |
| Action, 18 персонажей | 17×10 + CEO×12 = **182** | 18×10 = **180** | **T**, `CARD-03`; у CEO отсутствуют две реакции |
| Field Data | 18 вариантов | 18 | **R** состава; эффекты неоднородны |
| Feats | 12 вариантов, при подготовке 6 | 12 / в игре 6 | **OK** количества, `OK-04`; 3 ошибки эффекта ниже |
| Adaptations | 8 вариантов, при подготовке 3 | 8 / в игре 3 | **OK** количества, `OK-04`; не всех комбинаций |
| Objectives | 14 Personal + 14 Corporate | 14 + 14, с фильтром числа игроков | **R** состава; ошибки predicates ниже; все ограничения по числу игроков не сертифицированы |
| Quest Items | 18 двусторонних карт | Не соответствующий им набор упрощённых предметов/флагов | **S/T**, нет общей модели активации; `QUEST-01` |
| Starter Items / пассивы | Листы `StarterItemDeck_Front_1/2`, связанные обороты | Часть заменена другими эффектами, часть отсутствует | **T/S**, `START-*`, `ANDROID-*` |
| Contamination | `493A1E5B624CCC2F7586A861DBDE87587A06E29A_Contamination.jpg`, разделы правил 20/23 | Scan/Infection/Eclosion существуют | **OK** отдельных процедур; **U** физического состава/всех вероятностей; **T** Synthetic и финальной проверки |
| Coordinates | 8 лицевых сторон `Nemesis3.0_Cards_Coordinates.jpg` | Только 4, из них 3 не напечатаны | **T**, `MAP-03`; также скрытая карта восстанавливается из seed (`INV-07`) |
| Карты/памятки персонажей | 18 `CharacterTile_*`, Dashboard | 18 персонажей | **R**: подтверждено наличие; числовые параметры/все пассивы не сертифицированы |

Данные: `nemesis/shared/data/cards.mjs:14–40, 94–112, 154–264, 279–651, 656–677, 681–813`; сборка колод: `nemesis/shared/engine/setup.mjs:10–64`.

## 2. Attack — все 15 вариантов

Источник: [`Колода атаки.png`](../Nemesis/Колоды/Колода%20атаки.png) + `Атака.txt`; код: `cards.mjs:14–40`, `engine/combat.mjs`.

| Вариант | Ожидаемый напечатанный эффект | Verdict |
|---|---|---|
| Bite (`bite`) ×6 | Heavily Injured → смерть, иначе 1 Serious Wound | **OK** тиража; **R** основного эффекта; все защиты/массовые атаки не сертифицированы |
| Blood Sense (`bloodSense`) | Adult −2 HP; Drone/Queen −2 HP и следует за перемещавшимся персонажем | **T**, `COMBAT-02`: follow теряет исходную комнату до окончания Move |
| Deadly Claws 1 (`claws1`) | Adult −1 HP; Drone: смерть/1/2 Wounds по состоянию; Queen −2 HP | **R**: соответствующие ветки в данных есть |
| Deadly Claws 2 (`claws2`) | Adult −2 HP; Drone как выше; Queen −3 HP | **R** |
| Deadly Claws 3 (`claws3`) | Adult −1 HP + Contamination; Drone как выше; Queen −2 HP + Contamination | **R** |
| Fury 1 (`fury1`) | Adult −2 HP + Contamination; Drone/Queen: Heavily Injured в комнате погибают, остальные получают Wound | **R**; дополнительные условия реакций и очереди требуют сценариев |
| Fury 2 (`fury2`) | Adult −1 HP + Contamination; Drone/Queen как выше | **R** |
| Infecting (`infecting`) | Adult/Drone −2 HP; Queen даёт Contamination и Larva при отсутствии Larva | **R** основного эффекта; **T** отсутствие иммунитета Android (`ANDROID-02`) |
| Miss (`miss`) | Нет эффекта; перемешать Attack deck | **R**; это не подтверждение всех модификаторов Adaptations |
| Scratch 1 (`scratch1`) | −1 HP | **R** |
| Scratch 2 (`scratch2`) | −1 HP + Contamination | **R** |
| Scratch 3 (`scratch3`) | −2 HP | **R** |
| Scratch 4 (`scratch4`) | Contamination | **R** |
| Tail Attack 1 (`tail1`) | Adult −1 HP + Contamination; Drone/Queen: Injured или хуже → смерть, иначе Wound | **OK** соответствия варианта, `OK-08` |
| Tail Attack 2 (`tail2`) | Adult: Contamination; Drone/Queen как Tail 1 | **OK** соответствия варианта, `OK-08` |

Не объявляю Tail 1/2 дублем или ошибкой: оригиналы действительно различаются. Независимо от Attack deck, **обычная Larva-атака обходит окно защитных реакций**, а escape-движение может портить продолжения (`COMBAT-01/02`).

## 3. Queen Health — все 9 вариантов и необходимые тиражи

Источник: `QueenDeck.png` + отдельное уточнение в `Атака.txt`. Данные: `cards.mjs:795–808`; обработка: `combat.mjs:176–229`.

| ID / напечатанный вариант | Нужно экземпляров | Есть | Verdict |
|---|---:|---:|---|
| `q0pool`: discard 0, Queen returns to pool при атаке персонажа | 1 | 1 | **R** эффекта |
| `q0draw`: discard 0, Characters в комнате draw 2 | 1 | 1 | **R** |
| `q0repel`: discard 0, Repel Queen | 1 | 1 | **R** |
| `q1repel`: discard 1, Repel Queen | **2** | **1** | **T**, `DECK-01` |
| `q1noise`: discard 1, Characters в комнате Noise roll | 1 | 1 | **R** |
| `q2malf`: discard 2, Malfunction в комнате Queen | **3** | **1** | **T**, `DECK-01` |
| `q2act`: discard 2, Activate Queen | **3** | **1** | **T**, `DECK-01` |
| `q3bag`: discard 3, до 3 Queen tokens в мешок при атаке персонажа | 1 | 1 | **R**; ограничение доступным запасом требует отдельного контроля |
| `q3act`: discard 3, Activate Queen | 1 | 1 | **R** |

**OK:** числовой Combat result ≤ накопленных Hits вызывает процедуру Queen (`OK-09`). **T:** Queen Health continuation может уступить место меню следующего действия (`QUEUE-02`). Комментарий «12» перед массивом не соответствует ни его фактической длине 9, ни требуемым 14 картам.

## 4. Green Items — все 8 вариантов

Источник: `ItemDeck_Green.png`; тиражи проверены по `Атака.txt`. Данные: `cards.mjs:111–125`; реализация: `engine/items.mjs`.

| Оригинал / ID | Тираж | Сверка эффекта |
|---|---:|---|
| Adrenaline Injection / `adrenaline` | 3 | **R**: оригинал действительно Draw 2, любое число Actions за этот Turn, Pass последним. Базовая ветка есть; комбинации с Interruption/последним персонажем не проверены |
| Antiseptic / `antiseptic` | 3 | **R**: убрать Contamination из руки без Scan; базовый handler есть |
| Autodoc / `autodoc` | 3 | **R**: сбросить руку **и Action deck**, убрать все Contamination из discard, Larva, затем Pass. Ветка существует; не следует переносить на неё вывод о Surgery автоматически |
| Caffeine Pills / `caffeine` | 3 | **R**: Draw 3; общий добор Android не соответствует Synthetic |
| Medical Stapler / `stapler` | 7 | **R**: Wound **OR** 2 HP; выбор OR предусмотрен |
| Medkit / `medkit` | 5 | **T**, `ITEM-01`: оригинальное **AND/OR** заменено выбором только одного эффекта |
| Stimulants / `stimulants` | 3 | **R**: Draw 2 **OR** 2 HP; базовый выбор есть |
| Synthetic Food / `synthFood` | 3 | **R**: Repel 1 Adult, затем Noise в комнате, куда он переместился; базовая ветка есть, взаимодействия с Fearless/выбором Adult требуют сценариев |

**OK по коду:** Medkit/Medical Stapler используют `healChoice` с выбором другого Character и его согласием (`rooms.mjs:195–222`). Нельзя объявлять эти окна отсутствующими. Другие лечебные ветки не унифицированы: например, Stimulants heal напрямую восстанавливает только владельца (`items.mjs:287–291`); полная применимость раздела 14.8 требует отдельных сценариев. Android не должен применять Green Items на себя и обычно лечится только Self-Repair; эти ограничения не реализованы (основной отчёт, A13). Явное исключение Respite сохранено отдельно.

## 5. Red Items — все 10 вариантов

Источник: `ItemDeck_Red.png`; `Атака.txt`. Данные: `cards.mjs:126–144`; handlers: `items.mjs`.

| Оригинал / ID | Тираж | Сверка эффекта |
|---|---:|---|
| Energy Charge / `energyCharge` | 10 | **OK**: именно **3** ammo, `OK-10`, а не ошибочно прочитанные 2. Альтернатива Open/Close Door есть. **S**: ограничения специальных оружий и Robot/UPS не реализованы полностью |
| Evacuation Key / `evacKey` | 1 | **R**: Lock/Unlock 1 Pod своей секции; не тождествен активированному Quest-предмету Convict |
| Flashbang / `flashbang` | 3 | **R**: Move без Intruder Attacks; сопутствующие Noise и продолжения не сертифицированы |
| Grenade / `grenade` | 5 | **R**: 2 Hits всем Intruders, до 2 не переносимых Eggs, Characters −3 HP. Не путать с **Crit** у Grenade Launcher. Все условия цели/Noise в Nest не покрыты тестом |
| Military Taser / `taser` | 3 | **R**: Repel 1 Intruder **OR** выбранный Character сбрасывает руку |
| Personal Log Codes / `logCodes` | 1 | **R**: тайно просмотреть Objectives выбранного Character; помещение с исправным Computer. В игре есть общий дефект секретных prompts, `INV-02/03` |
| Remote Detonator / `detonator` | 2 | **S**: оригинал — **любая комната с красным item icon**, Crit всем Intruders, Characters −3 HP. Код требует ≥2 красных icons и даёт **3 Hits**, а текст данных говорит о трёх icons. `items.mjs:168–174, 348–355` |
| Security Armor / `armor` | 3 | **R**: одноразовая отмена раскрытой Adult Attack есть. Доступность брони при Heavily Injured правильно ограничена (`ITEM-09`), но все окна этой реакции не сертифицированы |
| Self-Destruct Key / `selfDestructKey` | 1 | **R**: запуск/остановка Autodestruct в исправной Computer Room; зависит от правильной карты помещений и Computer icons |
| Support Crate / `supportCrate` | 1 | **R**: 3 Support → оставить 1, остальные вниз. **S**: немедленное бесплатное использование при получении не оформлено как полноценное отдельное окно; переполнение рук — `QUEUE-03` |

Remote Detonator имеет напечатанный значок **Not in Combat**. Карточные ограничения этого вида нужно унифицировать, а не полагаться только на общий `itemRequirement`.

## 6. Yellow Items — все 9 вариантов

Источник: `ItemDeck_Yellow.png`; данные: `cards.mjs:144–154`. Тиражей в `Атака.txt` нет.

| Оригинал / ID | Сверка |
|---|---|
| Cables / `cables` | **R/S**: полная зарядка и ремонт Computer + Computer Action предусмотрены; не соблюдены все исключения специальных starters/Robot |
| Duct Tape / `ductTape` | **S**: нет напечатанного варианта объединить два Heavy Items в одном Hand slot; оставлены ремонт Malfunction/Engine |
| Engine Key / `engineKey` | **R**: проверить Engine или Move в Engine Room и Pass; переход/атаки/сохранение приватности требуют комбинационных тестов |
| Fire Extinguisher / `extinguisher` | **R**: убрать Fire или Repel 1 Intruder; все ограничения Repel не сертифицированы |
| Glowstick / `glowstick` | **R**: Move в Unexplored Room без Noise либо melee без Contamination/ответа; базовые ветки есть |
| Nemesis Plans / `nemesisPlans` | **R**: просмотр неразведанных комнат есть; все печатные альтернативы/количество и приватность не сертифицированы |
| Reagent / `reagent` | **R**: Fire + Repel Adult. **S**: не реализована полноценная специальная зарядка Scientist Gun вместо обычного эффекта |
| Technical Corridors Plan / `techPlan` | **S**: сам переход есть, но пользуется неверным списком Tech Entrances (`MAP-01`) |
| Tools / `tools` | **T**, `QUEST-01`: отсутствует напечатанная альтернатива **Activate your Quest Item, ignore its requirements**. **S**: специальная зарядка Janitor Gun и ряд квестовых состояний не соответствуют оригиналу |

## 7. Support Equipment — все 25 вариантов

Источник: `ItemDeck_Support.png`, сетка 5×5. Данные: `cards.mjs:154–205`; combat: `combat.mjs:22–75, 116–150, 313–439, 462–486`; items: `items.mjs:50–69, 168–174, 241–285`.

| № | Оригинал / ID | Сверка |
|---:|---|---|
| 1 | Assault Rifle / `assaultRifle` | **T**, `ITEM-05/06`: natural 2 должен быть Crit, даже после изменения результата и против Queen; оба случая нарушены |
| 2 | Assault Shotgun / `assaultShotgun` | **R**: all ammo → 1 Hit + Prevent Attack предусмотрено; допустимость при 0 ammo и все тайминги не сертифицированы |
| 3 | Autoloader Belt / `autoloaderBelt` | **R**: 3 ammo, использовать как ammo своих оружий, заряжать Energy Charge; основные flags есть, все сочетания специальных оружий не проверены |
| 4 | Automatic Shotgun / `automaticShotgun` | **R**: +1 Hit указан; все броски/модификаторы не сертифицированы |
| 5 | Bayonet / `bayonet` | **S**: данные знают о совместном Hand slot, но `heavyCount` считает два предмета отдельно. Orange Malfunction/предотвращение атаки смоделированы упрощённо |
| 6 | BF Gun / `bfGun` | **R**: дополнительный Hit без ещё одного Combat roll заявлен в данных; взаимодействия натурального/модифицированного результата не сертифицированы |
| 7 | Biohazard Armor / `biohazardArmor` | **R**: Contamination → −1 HP есть; случаи HP0 требуют исправления `HP-01` |
| 8 | Drum Mag Rifle / `drumMagRifle` | **R**: 7 ammo, special effect нет; общий Shoot требует отдельной сертификации |
| 9 | Engineering Equipment / `engineeringEquipment` | **S**: Door action получает глобальный выбор двери вместо области, установленной общим правилом Door Actions (раздел 19.1) |
| 10 | Flamethrower / `flamethrower` | **R**: no ammo и Fire по специальным результатам представлены; все symbol/modified-result случаи не сертифицированы |
| 11 | Gatling Gun / `gatlingGun` | **R**: оба Hand slots, +2 ammo → +2 Hits есть; переполнение/передача — общие дефекты вместимости |
| 12 | Grenade Launcher / `grenadeLauncher` | **T**: нельзя обычный Shoot (`ITEM-02`), нельзя зарядка Armory (`ITEM-03`), эффект — **Crit всем Intruders**, не 1 Hit (`ITEM-10`). Печатная замена Grenade на reload также требует полного потока |
| 13 | Hand Cannon / `handCannon` | **R**: −1 к Shoot result представлен; Crit/miss/Queen-комбинации не сертифицированы |
| 14 | Hardened Armor / `hardenedArmor` | **T**, `ITEM-08`: lose 2 HP **may**, а код автоматически заменяет Wound без решения игрока |
| 15 | Perimeter Security Device / `perimeterDevice` | **T**, `ITEM-11`: предотвращение **Noise roll или Encounter в Event Phase** за **1 Action card**, а не за один из двух придуманных зарядов |
| 16 | Plasma Gun / `plasmaGun` | **R**: no ammo, −2 HP за marker при специальных результатах, затем +marker; все natural/modified symbol случаи не сертифицированы |
| 17 | Riotgun / `riotgun` | **R**: вместо обычного Shot можно 2 ammo → Repel Adult. Все режимы/оплата/выбор цели не сертифицированы |
| 18 | Security System Control / `securityControl` | **S**: оригинал выбирает комнату с **красным item icon**; код — Fire/Malfunction. Оригинал ставит Orange Malfunction на предмет по напечатанному символу Combat die, код проверяет число 6. Текст «1 Hit» не передаёт полноценный Shoot |
| 19 | Smart Rifle / `smartRifle` | **S**: оригинал **may reroll the first roll**, принять второй; код автоматически перебрасывает только неудачный результат (`combat.mjs:374–389`), без выбора игрока |
| 20 | Sniper Rifle / `sniperRifle` | **T**, `ITEM-04`: базовое меню Shoot недоступно, когда Intruder есть только в соседней комнате |
| 21 | Sonic Gun / `sonicGun` | **S**: оригинал при специальных результатах ставит **Malfunction в своей комнате**; данные/код подменяют это Noise. +1 к Shoot result отдельно представлен |
| 22 | Submachine Gun / `smg` | **R**: +1 ammo → +1 Hit представлен; не путать с ошибочным starter Sentry |
| 23 | Tactical Armor / `tacticalArmor` | **R**: оригинал уменьшает потерю **HP** от Intruder Attack на 1; основная ветка уменьшения damage есть. Русское «ранение» двусмысленно и не должно означать −1 Hit чужому или отмену Wound |
| 24 | Tactical Hatchet / `tacticalHatchet` | **S**: оригинал — **Crit вместо Combat roll**, затем Orange Malfunction. Код всё равно бросает die, назначает 2 Hits и запрещает retaliation; это не эквивалентно напечатанному эффекту |
| 25 | Utility Vest / `utilityVest` | **R/S**: Search с выбором 2 и выбор второго Item предусмотрены (`items.mjs:59–67`). Список второго Item не фильтруется через `itemRequirement`; полное соблюдение условий Items, Hand Wound и квестов не сертифицировано |

## 8. Starter Items и пассивы персонажей

Источник: `StarterItemDeck_Front_1/2.png`, соответствующие Back, `CharacterTile_*`. Код: `cards.mjs:206–264`, `setup.mjs:110–174`, `core.mjs:180–241, 284–299`, `combat.mjs`.

| Оригинал | Сверка |
|---|---|
| Android Gun | **T**, `START-02`: no ammo, спецрезультаты расходуют UPS marker. Не обычный трёхзарядный handgun с +1 |
| Synthetic | **T**, `ANDROID-01/02`: Scan при доборе, убрать Contamination/заменить картой, −1 HP за infected; иммунитет Larva. **S**: только Self-Repair восстанавливает HP/убирает Wounds, Green на себя запрещены; общего соблюдения нет |
| Bounty Hunter Gun | **S**: оригинал без special effect; `bountyRifle` получил не напечатанный +1 к Shoot result |
| Laika | **T**, `INV-05`: Cannot be discarded нарушается Drop. **R**: движение/возврат/Noise-место слева от владельца частично есть; все случаи полного поведения не сертифицированы |
| Captain's Old Six Shooter | **S**: заряжается только Reload/Cartridge, а обычные способы и Armory не ограничены для этого starter полностью. `firstShotBonus` в данных добавляет не напечатанный бонус первого Shot |
| Six Shooter Cartridge | **S**: отдельного определения Cartridge в `ITEMS` нет. Возможность Reload картой действия не заменяет отдельный одноразовый предмет с оригинального листа |
| Robot (CEO) | **T**, `START-01/05`: нужно 5 markers и начальный Body Wound; код даёт 3 markers и не даёт Body Wound. **S**: ignore Body Wounds while charged и полный refill Energy Charge/Cables не воспроизведены |
| Cuffs (Convict) | **T**, `START-01`: 6 markers, не 3. **S**: Heavy/Cannot discard, flip последнего marker и освобождение Hand slot не смоделированы как на оригинале |
| Smart Gun (Hacker) | **T**, `START-03`: свободный выбор reroll первого roll, не постоянный +1 |
| Janitor Gun | **S**: max 5, special reload It Should Work/Tools; заменён другим лимитом и общими reload |
| Medic Gun | **S**: special mode против Larva/Adult и reload Reagent/Stimulants не представлены полноценным starter; общий handgun не эквивалентен |
| Mechanic's Sawed-Off | **R**: max 2 и first Shot in Turn +1 Hit представлены |
| Scientist's Pistol | **S**: напечатанные 2/6 как Crit заменены обычным стартовым оружием |
| Lab Rat's Gun | **S**: оригинал max3, +1 к отдельным напечатанным результатам; отдельного соответствующего оружия в данных нет |
| Pilot's Shotgun | **S**: max2, после Shot ещё 1 Hit **каждому** Intruder в комнате без нового roll. Pilot получает Handgun вместо него; похожий `riotShotgun` (выдан Sentry) имеет max3 и spread лишь остальным целям |
| UPS (Android) | **T**, `START-01`, `ANDROID-03`: 3 markers/max3, −1 при reshuffle, при 0 смерть; активированная сторона max5/+2. Код не воспроизводит жизненный цикл |
| Handgun (`Front_2` ячейки 3 и 9) | **R**: оригинальное общее оружие max3, +1 к **Shoot result**, не дополнительный Hit; дополнительные выдаваемые оружия Pilot и Survivor надо отличать от этого starter |
| Scout's Rifle | **R**: max4, при kill Draw 1, только раз за Turn — эти параметры представлены; полный сценарий с выбранным способом damage/Queen не сертифицирован |
| Wheelchair (Scientist) | **S**: оригинальное взаимодействие с Leg/Knee Wounds не реализовано как самостоятельный passive |
| Sentry's SMG | **T**, `START-04`: оригинал max5, можно ещё 1 ammo → +1 Hit; вместо него выдан shotgun |
| Soldier's Gun | **R**: max6, first Shot in Turn +1 Hit представлены; My Little Friend не доходит до Shoot (`CARD-01`) |
| Xenobiologist's Gun | **R/S**: max3, +1 Shoot result и special-result discard представлены; `shoot.critDiscard` предлагает всю руку, включая Contamination, вместо только Action cards |
| Probe Arm | **S**: оригинал Orange Malfunction на Armor → 1 Hit +1 Tissue; код использует выдуманный запас зарядов/упрощённый предмет. Normal damage также должен проходить Combat check, если не действует исключение |
| Survivor, дополнительные предметы | **S**: выдача любимого оружия автоматически на round 8 не заменяет активацию Quest Item в blue Time Track |

Наличие ID `oculobe`, `navTablet`, `mechTools`, `sampleJar` и т.п. в `ITEMS` **не** подтверждает соответствие одноимённому или отсутствующему Quest Item.

## 9. Quest Items — все 18 карт, обе стороны

Источник: `QuestItemDeck_Front_1/2`, `QuestItemDeck_Back_1/2`. На всех оборотах активация — **Action с дополнительным discard 1 Action card** и своим требованием. `Tools` позволяет активировать Quest, игнорируя требование. Это не обычный Use Item с произвольным мгновенным эффектом.

**Общий verdict S/T:** нет единой модели `inactive → active`, всех способов активации/переворота и оригинальных активированных сторон. `QUEST-01` воспроизводит отсутствие нужной альтернативы Tools. В таблице **S** означает сравнение состояния/эффекта по исходникам, а не 18 независимо написанных поведенческих тестов.

| № / персонаж | Quest Item | Напечатанное условие активации | Ключевой активированный эффект / расхождение |
|---|---|---|---|
| 1 Android | UPS / Upgraded UPS | Generator, без Intruder | **S/T**: +2 markers, max5; текущие markers/reshuffle/death неправильны |
| 2 Bounty Hunter | Canine Upgrades | Surgery | **S**: расширение возможностей Laika, включая remote attacks/Search; полноценной активированной стороны нет |
| 3 Captain | Intercom | Comms Room | **S**: глобальная область Authority/Motivation; не воспроизведена оригинальная активация |
| 4 CEO | Ship Codes | Archives; вернуть removed Action cards, как предписывает оборот | **S**: начальный просмотр Corporate Objectives и активированная сторона не заменяются простым флагом Robot |
| 5 Convict | Pipe | Любая комната | **S**: двусторонний Quest и его melee-эффект заменены упрощённым оружием/состояниями |
| 6 Hacker | Cheat Codes | Evacuation Section A | **S**: нет соответствующего жизненного цикла Quest/активированной стороны |
| 7 Janitor | Karcher | Fire Control | **S**: отсутствует оригинальная активированная сторона; случайные «tools» её не заменяют |
| 8 Lab Rat | Bloody Camouflage | Nest | **S**: нет полноценной активации/пассивной маскировки |
| 9 Mechanic | Plasma Torch | Любой Engine Room | **S**: работа с уничтоженными Doors не равна базовому `mechTools` |
| 10 Medic | Surgery Kit | Иметь Green Item, выполнить требуемый расход | **S**: нет полного original Quest; доступность и эффекты лечения нельзя считать проверенными по First Aid |
| 11 Pilot | Evacuation Key | Cockpit | **S**: это Quest с активированной стороной, а не обычный красный одноразовый Evacuation Key |
| 12 Psychologist | Oculobe | Emergency Room | **S**: Connection tokens и глобальное взаимодействие картами отсутствуют; простое расширение до соседних комнат не эквивалентно |
| 13 Scientist | Portable Device | Laboratory | **S**: свой Computer/оригинальное ограничение использования не заменяются планшетом проверки Engine |
| 14 Scout | Motion Scanner | Иметь Energy Charge, выполнить требуемый расход | **S**: discard/reroll Noise по активированной стороне не представлены полным Quest |
| 15 Sentry | Battle Suit | Evacuation Section B | **S**: end-of-turn heal / специальный blue-die эффект отсутствуют как активированное состояние |
| 16 Soldier | Heavy Armor | Repository | **S**: особая замена Adult Attack на −1 HP не эквивалентна общему Tactical Armor |
| 17 Survivor | Favorite Weapon | Любая комната, Time marker в blue part | **S**: принудительный unlock на фиксированном round 8 не равен выбору Action в допустимом временном диапазоне |
| 18 Xenobiologist | Research Equipment | Computer Room без Malfunction | **S**: анализ объекта с пола, +2 Knowledge/выбор Adaptation и оригинальная активация отсутствуют в полном виде |

Для Ship Codes отдельно: **Just One More Thing** и **Stop It!** из ActionDeck CEO отсутствуют в коде; возврат removed cards не может восстановить несуществующие определения.

## 10. Field Data — все 18 вариантов

Источник: `FieldDataDeck.png`; данные: `cards.mjs:656–677`; основной код: `engine/fielddata.mjs:25–263`, availability `turn.mjs:118–125`.

| Оригинал / ID | Сверка |
|---|---|
| Advance Tactics / `advanceTactics` | **R**: Shoot/Melee/Move, затем optional второй; основные ветки есть, все последовательности оплаты/Attack/Noise не сертифицированы |
| Asymptomatic / `asymptomatic` | **R**: работа с Contamination предусмотрена; все разрешённые выборы/сброс не сертифицированы |
| Behavioral Insight / `behavioralInsight` | **S**: Repel Adult / взять Egg есть, но в Repel-ветку добавлен Noise как у Synthetic Food, чего на Field Data не напечатано |
| Circle Strafe / `circleStrafe` | **R/S**: реакция Prevent Attack + optional Shoot есть; Larva обходит общий reaction dispatcher (`COMBAT-01`) |
| Containment / `containment` | **R**: двери и Not in Combat exception заведены; все базовые/комнатные/карточные действия этим исключением не сертифицированы |
| Critical Analysis / `criticalAnalysis` | **R**: выбор Event/Attack и перекладка существуют; все последовательности top/bottom не покрыты тестом |
| Damage Expertise / `damageExpertise` | **R**: repair / Engine / Door, включая destroyed Door; полный scope/все исключения не сертифицированы |
| Evasive Maneuvering / `evasiveManeuvering` | **OK** дополнительного discard, `OK-12`; **R** всего перемещения/предотвращения атаки |
| Hunker Down / `hunkerDown` | **OK** дополнительного discard, `OK-12`; **R** всех вариантов закрытия Doors и Pass |
| Precision Shot / `precisionShot` | **S**: оригинал два roll и **выбрать один**; код выбирает «лучший» автоматически (`bestOfTwo`). Это не равно выбору при специальных последствиях оружия |
| Predictable Movements / `predictableMovements` | **R**: отдельная реакция есть; вход при всех Encounter/movement/размещении Intruder и бросок на normal 1 Hit не сертифицированы |
| Quick Hands / `quickHands` | **OK** дополнительного discard, `OK-12`; **S**: wrong Room item icons; немедленное использование/вместимость зависят от общей очереди |
| Rapid Response / `rapidResponse` | **T**, `FD-02`: список one-card basic Actions не включает Computer |
| Reposition / `reposition` | **OK** дополнительного discard, `OK-12`; **R** всех исключений движения/ответных эффектов |
| Resourceful / `resourceful` | **R**: Draw 2 + discard Action/Contamination; полный выбор/Android не сертифицированы |
| Restoration / `restoration` | **R**: heal или дополнительный discard → убрать Wound; целевые ограничения/получатель требуют сценариев |
| Risk Prevention / `riskPrevention` | **R/S**: Noise/Encounter prevention имеется в общей инфраструктуре, но Event Encounter сейчас подменён Noise (`EVENT-03/04`); это меняет окна реакции |
| Safety in Numbers / `safetyInNumbers` | **OK**, `FD-01`: без другого Character меню запрещает карту; при наличии и достаточных картах разрешает. **R** всех последовательных выстрелов/добора до 7 |

Не записываю Evasive/Hunker/Quick Hands/Reposition в «нет доплаты»: доплата уже централизована. Не записываю Safety in Numbers в «работает в одиночку»: проверка явно есть в `turn.mjs:124`, её подтверждает позитивная и негативная половина fixture.

## 11. Feats — все 12 вариантов

Источник: `FeatDeck.png`; код: `cards.mjs:713–738`, `engine/feats.mjs:20–248`.

| Оригинал / ID | Сверка |
|---|---|
| Appropriation / `appropriation` | **R**: по 1 G/R/Y → оставить 2; все порядки выбора/секретность/вместимость не сертифицированы |
| Breach / `breach` | **T**, `FEAT-02`: «ignore additional costs» не отменяет дополнительный discard выбранной Computer Action |
| Conviction / `conviction` | **T**, `FEAT-03`: Crit против Queen должен запустить Queen Health, а не молча удалить Queen с поля |
| Damage Control / `damageControl` | **R**: до 4 Fire/Malfunction, проверить Engine, поменять при Character в комнате; все выборы/секретность не сертифицированы |
| Immunization / `immunization` | **R**: удалить Contamination из всех трёх зон и shuffle; все эффекты reshuffle/UPS не сертифицированы |
| Overpower / `overpower` | **T**, `FEAT-01`: особое «даже если нельзя Repel» должно обходить Fearless, код не обходит |
| Perseverance / `perseverance` | **R**: Draw 3 с заменой Contamination; ограничения повторов и сочетание с Synthetic требуют отдельных тестов |
| Requisition / `requisition` | **R**: 3 Support → оставить 1, остальные вниз; hand overflow связан с `QUEUE-03` |
| Respite / `respite` | **OK по источнику**: оригинал **явно разрешает Android игнорировать Synthetic**. Лечение Android этой Feat не объявляю багом. **R** полной процедуры AND/OR и выбора Wound |
| Revelation / `revelation` | **S**: оригинал «up to 2 Knowledge», код всегда добавляет 2 без выбора меньшего количества; очередь активации также требует сценариев |
| Rush / `rush` | **R**: 1–2 Move только в Explored Rooms, без Noise/Attacks; все ограничения Door/персонажей не сертифицированы |
| Traverse / `traverse` | **S**: зависит от неверных Tech Entrances (`MAP-01`); остальной эффект требует полного сценария |

## 12. Adaptations — все 8 вариантов

Источник: `AdaptationDeck.png`; данные: `cards.mjs:702–712`, код combat/movement.

| Оригинал / ID | Сверка |
|---|---|
| Agile / `agile` | **R** базового преобразования результата; **T** совместимости с Assault Rifle: natural 2 не должен теряться (`ITEM-05`) |
| Fearless / `fearless` | **R** обычного запрета Repel; **T** специального исключения Overpower (`FEAT-01`) |
| Hardened Carapace / `hardenedCarapace` | **R**: +1 к natural numeric result представлен; все сочетания natural/special/оружия не сертифицированы |
| Hyper-Aggression / `hyperAggression` | **R**: атака при входе Intruder и выбор персонажа предусмотрены; все причины входа/телепортации/реакции не сертифицированы |
| Ravenous / `ravenous` | **R**: повторная атака Adult/Drone на нужном шаге есть; все prevention/HP/Wound/retaliation случаи не сертифицированы |
| Razor Appendages / `razorAppendages` | **R**: +1 HP loss, а не дополнительный Serious Wound; все ветки Attack effects не сертифицированы |
| Swift Strikes / `swiftStrikes` | **R**: Surprise threshold +1, кроме Larva, представлен |
| Venomous / `venomous` | **R**: Contamination к подходящим атакам есть; все Miss/prevented/AoE случаи не сертифицированы |

## 13. Serious Wounds — все 8 вариантов

Источник: `SeriousWoundDeck.png`, `Атака.txt`; данные: `cards.mjs:94–105`. Каждый ×3 подтверждён `OK-03`.

| Карта | Оригинальное ограничение | Сверка |
|---|---|---|
| Arm | 1 Hand slot; немедленно освободить лишний | **R/S**: hand limit учитывается, но немедленное выполнение ломается очередью/передачей (`QUEUE-03`, `INV-04`) |
| Bleeding | Pass → −1 HP | **R** обычного Pass; все способы принудительного Pass не покрыты |
| Body | На Drawing Action Cards step draw to 4 вместо 5 | **R** обычного round draw; **T/S** взаимодействия CEO/Robot (`START-05`) |
| Eyes | +1 ко всем Shoot results | **R** числового модификатора; все symbol/natural-result случаи требуют сценариев |
| Guts | Pass → 1 Contamination | **R** обычного Pass; все специальные Pass и Synthetic не сертифицированы |
| Hand | Use Item Action стоит ещё 1 Action card | **R** базовой стоимости; Utility Vest/немедленное использование/Feats не сертифицированы |
| Knee | Первое Action, используемое для Move в Round, дороже на 1 | **R** обычного Move; все карточные Move и free movement не сертифицированы |
| Leg | Любое Action, выводящее из комнаты с Intruder, дороже на 1 | **R** базового Move; все специальные способы выхода не сертифицированы |

## 14. Event deck — все 20 вариантов

Источник: `EventDeck.png`; `cards.mjs:44–88`, `engine/events.mjs:17–196`. Порядок таблицы — ячейки оригинального листа.

| № | Оригинал / ID | Сверка |
|---:|---|---|
| 1 | Breaking In / `breakingIn` | **T**, `EVENT-02`: после нового Noise в Tech нельзя в тот же раз дополнительно раскладывать Noise по всем nearby Corridors |
| 2 | Bulkheads Open / `bulkheadsOpen` | **T**, `EVENT-03/04`: отсутствие Action cards требует **Encounter**, не Noise roll; Contamination не Action card. **C**: порядок открытия Doors отличается в тексте раздела 4 и карты; фиксировать приоритет явно |
| 3 | Damage / `damage` | **S/R**: no movement и Malfunction под Intruders представлены; напечатанный Encounter в комнате с Fire/Malfunction подменён общим `event.noise`, как у Bulkheads Open |
| 4 | Damaging Fire / `damagingFire` | **S/R**: Fire/Malfunction/spread-ветка есть; финальный Encounter без Action cards подменён Noise. Все границы распространения и destruction не сертифицированы |
| 5 | Egg Protection / `eggProtection` | **T**, `EVENT-05`: Drone добавляется один **на комнату с Eggs**, не на каждого carrying Character в ней. **S/R**: все варианты приоритета немедленной атаки не сертифицированы |
| 6 | Evacuation Pod Ejection / `podEjection` | **R**: убрать Pod 1 либо Malfunction в Evac A/B; ветка есть, все состояния занятости/запуска Pod и последствия не сертифицированы |
| 7 | Fire Wave / `fireWave` | **R**: от горящей комнаты с наименьшим номером Fire в neighboring Rooms; базовая ветка есть, полный scope/закрытые Doors/конец игры не сертифицированы |
| 8 | Flammable Compounds / `flammable` | **R**: Fire в Hibernatorium либо соседних при уже имеющемся Fire; ветка есть, все граничные случаи не сертифицированы |
| 9 | Generator Overheats / `generatorOverheats` | **R**: Malfunction в Generator либо старт Autodestruct, reshuffle; базовые ветки есть, все ограничения/неразведанная комната не сертифицированы |
| 10 | Hatching / `hatching` | **S/R**: удалить Egg / Larva у Characters в Nest/рядом; условие отсутствия Action cards проверяется через всю руку и неверно учитывает Contamination. Android immunity — общий дефект A13 |
| 11 | Leaving the Shell / `leavingShell` | **R**: отдельные Infection/Eclosion steps и reshuffle есть. `OK-06/07` подтверждают только основные процедуры, не все случаи этого Event/Android/порядка |
| 12 | Life Support Failure / `lifeSupport` | **S**: room selector должен проверять 3 Green icons, код ≥2; сами Room icons тоже неверны |
| 13 | Lurking / `lurking` | **R**: снять Intruders без Character и вернуть tokens в bag; базовая ветка есть, распределение оборотов случайных tokens не сертифицировано |
| 14 | Malfunction / `malfunction` | **R**: Malfunction в допустимой комнате с наименьшим номером; ветка есть, все room/pool exceptions не сертифицированы |
| 15 | On the Hunt / `onTheHunt` | **S/R**: два последовательных движения есть; Encounter без Action cards заменён Noise, число Action cards неверно учитывает Contamination. Target tie-break — `EVENT-06` |
| 16 | Protect and Serve / `protectAndServe` | **R**: Drone у Queen без атаки либо tokens в мешок; базовая ветка есть, доступный запас и полный порядок не сертифицированы |
| 17 | Scent of Prey / `scentOfPrey` | **R**: Wound → Noise в nearby Corridors; базовая ветка есть, весь scope/повторные Noise и event exceptions не покрыты |
| 18 | Short Circuit / `shortCircuit` | **S**: нужно 3 Yellow icons, код ≥2; Encounter в Fire/Malfunction-комнате подменён Noise |
| 19 | System Failure / `systemFailure` | **S**: нужно 3 Red icons, код ≥2; финальный Encounter/no Action cards также подменены общим Noise/hand.length |
| 20 | The Queen Awakens / `queenAwakens` | **T**, `EVENT-01`: добавление Queen tokens не ограничено доступными 3 tokens; в fixture из 2 получается 5 |

`EVENT-06` изолирует общее движение к ближайшему Character при tie: значок Action card на этих Events не включает Contamination. Это не отдельный тест каждой карты с таким движением.

## 15. Computer cards — все 6 вариантов

Источник: `ComputerDeck.png`, раздел 16. Данные: `cards.mjs:681–701`; код: `rooms.mjs:367–517`.

| Карта | Сверка |
|---|---|
| Computer Action A | **R**: Draw / secret Room+Exploration / Noise in unoccupied Room представлены; приватность отдельных prompts не сертифицирована |
| Computer Action B | **T**, `COMPUTER-02`: discard Action card для Knowledge нельзя оплатить Contamination. Heal / repair Computer Room требуют отдельных сценариев |
| Computer Action C | **R/S**: purge/ammo/door есть; ammo не соблюдает все специальные reload ограничения; purge/Repel выбор и очередь не сертифицированы |
| Computer Action D | **R**: 2 Hits правильно вызывают `dealHits` (`rooms.mjs:497`), не `applyHitsNoRoll`; это не тот же дефект, что Field Experience. **S**: доплаты Knowledge/Item могут принимать Contamination, как в `COMPUTER-02` |
| Computer Action E | **R**: remove non-nearby Noise / place Malfunction in Computer Room / Event top-bottom представлены; все scope/приватность не сертифицированы |
| Lock-down | **T**, `COMPUTER-01`: раскрытый **после** Computer Action должен сработать сразу; текущая архитектура сохраняет до следующего Computer Action |

**C:** применимость общего Knowledge reward к Computer Action требует согласования источников, а не автоматического объявления double Knowledge багом. **C:** специальные Room Sheets разрешают использовать Computer при определённой Malfunction, основной текст 1/16 запрещает; см. основной отчёт. **T:** Computer Skills должен выполнять **Room Action**, а не одну из этих Computer Actions (`CARD-02`).

## 16. Objectives — все 28 вариантов

Источник: `ObjectiveDeck_Personal.png`, `ObjectiveDeck_Corporate.png`; данные `cards.mjs:745–778`; predicates `engine/endgame.mjs:84–135`.

Общая ошибка финальной инфекции (`END-03`) может изменить состав survivors и результат **любой** цели. Таблица сравнивает непосредственные условия, а не сертифицирует весь endgame.

### Personal

| Оригинал / ID | Сверка |
|---|---|
| Best Friends Forever / `bff` | **T**, `OBJ-03`: явное исключение выживания при non-Earth destination друга по Hibernation не передаётся. **C**: «on board» в Pod-ветке требует согласовать перевод/область, не объявляю это отдельным доказанным багом |
| Disclosure / `disclosure` | **R**: active Knowledge + Carcass в руках представлены |
| Disposing the Evidence / `disposing` | **R**: Signal + destroyed Ship представлены |
| Emergency Post-mortem / `postMortem` | **S**: напечатано «Blue Character Corpse **must be Analyzed**», без требования личного анализа; код проверяет личный `p.analyzed.corpse`. Тот же корень, что `OBJ-02`; отдельного теста этой карты нет |
| Heroic Escape / `heroicEscape` | **R/C**: last finisher / Pod + other survivor; история finishOrder есть, «on board» неоднозначно, не сертифицировано |
| The Highest Bidder / `highestBidder` | **S**: в Pod-ветке проверяются только `p.items`, но надетая Support Armor хранится отдельно в `p.armor` и тоже является Item. Venus exception самого владельца в данных есть |
| Hoarder / `hoarder` | **R**: 5 non-start Items, по одному G/R/Y, Escape Pod; armor включена, все дополнительные места/неактивные Quest Items не проверены |
| Insurance Fraud / `insuranceFraud` | **R**: Pod + Deep Space **OR** Signal + destroyed Ship представлены |
| The Oldest Friend / `oldestFriend` | **R**: Signal + Earth **OR** sole survivor представлены |
| Pristine Condition / `pristine` | **R**: Earth + ≤1 Fire **OR** Earth +3 working Engines представлены |
| Pursuit of Science / `pursuit` | **T**, `OBJ-01`: **max Knowledge = 8**, а не «больше или равно всем игрокам» |
| Quarantine / `quarantine` | **R**: Mars exception / Earth + destroyed Nest представлены; отдельно все final destination случаи не сертифицированы |
| Trophy Hunter / `trophyHunter` | **R**: Queen killed **OR** Red Character Corpse в руках; факт Queen kill может быть испорчен Conviction (`FEAT-03`) |
| Veni, Vidi, Vici / `veniVidiVici` | **T/S**: Signal + destroyed Nest; состояние Nest неправильно после уничтожения Ship (`END-02`) |

### Corporate

| Оригинал / ID | Сверка |
|---|---|
| Ab Ovo / `abOvo` | **T**, `OBJ-02`: Egg **must be Analyzed**, не обязательно владельцем этой цели; код требует личный `p.analyzed.egg` |
| Alien Cover-up / `alienCoverUp` | **R**: Signal и ни один другой survivor с ≥7 Knowledge; predicate отражает именно 7+, не active token |
| Bug Hunt / `bugHunt` | **U**: оригинал требует **все доступные** Carcasses на Ship/в руках/сброшены; код предположил 4 и использует `carcassCount`. Соответствие физическому запасу 4 и всем способам получения/удаления Carcass отдельно не доказано |
| Corporate Contract / `contract` | **R**: Player 5 не выживает либо sole survivor; если владелец Player 5 — только второй вариант. Все player-count/перенумерации не сертифицированы |
| Extreme Field Biology / `extremeBiology` | **R**: ≥2 discarded Adaptations; reward/очередь/выбор Adaptation требуют исправления A01 |
| Fortune Favors the Bold / `fortune` | **R**: Venus со своим safety exception **OR** Signal + destroyed Ship представлены |
| Greener Pastures / `greener` | **R**: аналог Corporate Contract для Player 2 |
| Harsh Termination / `harsh` | **R**: аналог для Player 3 |
| Hostile Takeover / `hostile` | **R**: аналог для Player 4 |
| Necroscopy / `necroscopy` | **S**: Signal + Carcass **must be Analyzed**, а код требует личный `p.analyzed.carcass`; отдельного теста этой карты нет |
| Priceless Knowledge / `priceless` | **R**: active Knowledge + Ship not destroyed представлены |
| Priority One / `priorityOne` | **R/S**: Earth + Queen not killed + Nest not destroyed **OR** sole survivor представлены; фиксация гибели Queen может быть испорчена Conviction (`FEAT-03`) |
| The Perfect Specimen / `perfectSpecimen` | **R**: Egg в руках + (Pod **OR** active Knowledge) представлены |
| The Right Moment to Strike / `rightMoment` | **R**: аналог Corporate Contract для Player 1 |

## 17. Coordinates — все 8 печатных лицевых сторон

Источник: [`746C7466B54B19034440C8691FF1F14B0D1685F2_Nemesis3.0_Cards_Coordinates.jpg`](../Nemesis/Колоды/746C7466B54B19034440C8691FF1F14B0D1685F2_Nemesis3.0_Cards_Coordinates.jpg), 4 столбца ×2 ряда. Положение ячейки — до поворота исходного JPEG. Данные: `cards.mjs:786–791`.

| Ячейка | A | B | C | D | Есть в коде |
|---|---|---|---|---|---|
| Верхняя 1 | Earth | Mars | Venus | Deep Space | Да, `coordA` |
| Верхняя 2 | Earth | Deep Space | Mars | Venus | **Нет** |
| Верхняя 3 | Deep Space | Earth | Venus | Mars | **Нет** |
| Верхняя 4 | Venus | Earth | Deep Space | Mars | **Нет** |
| Нижняя 1 | Mars | Venus | Earth | Deep Space | **Нет** |
| Нижняя 2 | Deep Space | Mars | Earth | Venus | **Нет** |
| Нижняя 3 | Mars | Venus | Deep Space | Earth | **Нет** |
| Нижняя 4 | Venus | Deep Space | Mars | Earth | **Нет** |

**T**, `MAP-03`: только одна печатная перестановка представлена. Кодовые `coordB`, `coordC`, `coordD` — не три оставшиеся карты с изображения, а другие перестановки. Требуются все 8 исходных faces, не просто увеличение длины массива. Отдельный `INV-07` подтверждает, что текущая скрытая карта вычисляется из публичного seed.

## 18. Room tiles — все 21 оригинальный PNG

Источник: [`Nemesis/Комнаты`](../Nemesis/Комнаты/) (`Room_*.png`), Room Sheets и основной текст 17/18. Код: `nemesis/shared/ship.mjs:8–33`, `engine/rooms.mjs`.

`G/R/Y` — отдельные item icons, не число патронов внутри рисунка. Порядок цветов несущественен. `C` — печатный Computer.

| Оригинал / код ID | Items оригинала | Items кода | Computer оригинал → код | Verdict |
|---|---|---|---|---|
| Airlock / `airlock` | GR | green, red | нет → нет | **OK** |
| Archives / `archives` | RRR | red ×3 | есть → есть | **OK** |
| Armory / `armory` | RRR | red ×3 | нет → нет | **OK** |
| Cafeteria / `cafeteria` | GGG | green ×3 | нет → нет | **OK** |
| Command Center / `commandCenter` | RY | red, yellow | есть → есть | **OK** |
| Comms / `comms` | RY | red, yellow | есть → есть | **OK** |
| Containment / `containment` | GY | green, yellow | есть → есть | **OK** |
| Contaminated / `contaminated` | GRY | green, red, yellow | нет → нет | **OK** |
| Decon / `decon` | GGG | green ×3 | нет → нет | **OK** |
| Engine Room / `engineRoom` | YYY | yellow ×3 | есть → есть | **OK** |
| Evacuation A / `evacA` | GR | green, red | нет → нет | **OK** |
| Evacuation B / `evacB` | GY | green, yellow | нет → нет | **OK** |
| Fire Control / `fireControl` | YYY | yellow ×3 | есть → есть | **OK** |
| Generator / `generator` | YYY | yellow ×3 | есть → есть | **OK** |
| Hatch Control / `hatchControl` | GRY | green, red, yellow | нет → нет | **OK** |
| Laboratory / `laboratory` | GGG | green ×3 | есть → есть | **OK** |
| Nest / `nest` | — | — | нет → нет | **OK** |
| Repository / `repository` | RRR | red ×3 | нет → нет | **OK** |
| Server / `server` | YYY | yellow ×3 | есть → есть | **OK** |
| Storage / `storage` | RRR | red ×3 | нет → нет | **OK** |
| Surgery / `surgery` | GGG | green ×3 | нет → нет | **OK** |

Итого после исправлений: **0/21** расхождений по Items, **0/21** по Computer. Ранее было 18/21 по Items и 4/21 по Computer — эти значения сохранены в истории аудита и закрыты тестами `ROOM-05/06` и сверкой PNG. Это по-прежнему не сертифицирует сами Room Actions: эффекты проверяются отдельно.

`emergency` есть в коде, но отдельного Emergency PNG среди этих 21 оригиналов нет: **U** icons/Computer; нельзя выдавать предполагаемый набор за сверенный. Фиксированные Cockpit/Hibernatorium/Engines не входят в счёт 21 случайного tile.

### Эффекты Room Actions

- **T:** Surgery не сбрасывает все clean cards из Action deck (`ROOM-01`).
- **T:** Laboratory не принимает Red Character Corpse как анализируемый Human Corpse (`ROOM-02`); выполнение целей с требованием именно Blue Corpse — другой, более узкий вопрос.
- **T:** Airlock убивает раньше установленного конца Player Phase (`ROOM-03`).
- **T:** Server ошибочно запрещает удалённую комнату с Malfunction вопреки явному исключению (`ROOM-04`).
- **T:** обычный Room Action стоит 1 вместо 2 по Dashboard (`ACT-01`).
- **S:** деградируют Search, Events, Synthesized Drugs, Engineering Equipment и все выборы по цвету/Computer.
- **R/U:** остальные Room Actions прочитаны, но не сертифицированы во всех ветках; особенно выбор Doors, безопасное завершение Hibernation/Pod, callbacks после Attack/Encounter.

## 19. Action decks — поимённый реестр всех 180 реализованных карт и двух пропущенных

В следующих таблицах каждая реализованная карта названа отдельно. Ключ соответствует `CHARACTERS[character].cards[key]` в `nemesis/shared/data/cards.mjs`. Ссылка в последнем столбце ведёт к найденному основному handler или к общей инфраструктуре реакций; наличие handler само по себе не является доказательством корректности.

Общие **S/T**, которые нельзя исправить одной сменой текста карточки:

- `Demolition` выбирает закрытые Doors глобально; обычные `Repairs` / `Fast Repairs`, напротив, используют локальный `repairOptions`. Ошибка этих Repairs не в глобальной дальности: у обычного Repairs не взимается дополнительный discard для Malfunction (`COST-02`).
- `Interruption`: механизм действительно есть (`turn.mjs:179–207, 284–301`); текст данных «пока не автоматизирована» устарел. Все окна, включая Pass/предметы/цепочки реакций, не сертифицированы.
- `Computer Skills`: исполняет **Room Action**, не текущую Computer Action; `CARD-02` распространяется на все одноимённые карты.
- `Duck and Cover`: у ряда персонажей дополнительная плата уже взята централизованно, но handler берёт её снова (`COST-01`); у Convict это вообще другая напечатанная реакция, отсутствующая в коде (`CARD-04`).
- `Search`: исходный эффект выбора предмета не спасает от wrong Room icons, раскрытия Light Items и неверной очереди hand overflow.
- `Rest`: обычная Infection/убирание clean Contamination поддержаны; исключение Synthetic и все специальные combinations должны проверяться отдельно.
- `Weak Spot`: бонус сам по себе представлен; это не подтверждает корректность оружия/Queen/реакций.

### 19.1. Солдат / Soldier

Оригинал: [ActionDeck_Soldier](../Nemesis/Колоды/2223870E61ACE2E7EF152E88F41DA8ABBFBF740B_ActionDeck_Soldier.png); определения: [cards.mjs:273](../nemesis/shared/data/cards.mjs#L273).

Базовые Soldier Gun/Handgun выдаются; My Little Friend сломан, Quest Heavy Armor не смоделирован оригинальной активированной стороной.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Прикрывающий огонь / `soldier.coveringFire` | **R**: расход 2 ammo, предотвращение escape-атак и возможность перемещения другого Character есть; согласие и все перемещения/двери не сертифицированы. | [actions.mjs:122](../nemesis/shared/engine/actions.mjs#L122) |
| Подрыв / `soldier.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Подавляющий огонь / `soldier.forcingFire` | **R**: напечатанный текст и базовая ветка рассмотрены; все решения, реакции, стоимость и продолжения не сертифицированы. | [actions.mjs:138](../nemesis/shared/engine/actions.mjs#L138) |
| Вмешательство / `soldier.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Моя крошка / `soldier.myLittleFriend` | **T**, `CARD-01`: load OR burst вместо load THEN Shoot; burst не передаёт ожидаемый `answer` и не доходит до выстрела. | [actions.mjs:152](../nemesis/shared/engine/actions.mjs#L152) |
| Стальные нервы / `soldier.nervesOfSteel` | **T**, `COMBAT-01`: Larva заражает до общего окна предотвращения Intruder Attack. | [actions.mjs:99](../nemesis/shared/engine/actions.mjs#L99) |
| Ремонт / `soldier.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `soldier.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Поиск / `soldier.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |
| Уязвимое место / `soldier.weakSpot` | **R**: +1 Hit к Shoot/Melee представлен; weapon-specific, Queen и reaction combinations не сертифицированы. | [actions.mjs:106](../nemesis/shared/engine/actions.mjs#L106) |

### 19.2. Разведчица / Scout

Оригинал: [ActionDeck_Scout](../Nemesis/Колоды/DCCB84E638013F4591960D1EAE05D07F410C64E8_ActionDeck_Scout.png); определения: [cards.mjs:293](../nemesis/shared/data/cards.mjs#L293).

Scavenging оплачивается дважды; Motion Scanner не является полноценным двусторонним Quest.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Адреналин / `scout.adrenaline` | **R**: базовый handler существует; все ограничения Combat/добора/выбора карт и special equipment не сертифицированы. | [actions.mjs:171](../nemesis/shared/engine/actions.mjs#L171) |
| Подрыв / `scout.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Отвлечение / `scout.distraction` | **R**: расход Item + Noise в соседней комнате есть; все допустимые предметы/ограничения/реакции не сертифицированы. | [actions.mjs:181](../nemesis/shared/engine/actions.mjs#L181) |
| Вмешательство / `scout.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Разведка / `scout.reconnaissance` | **R**: разведка есть; выбор Room/Exploration, приватность и отображение результата требуют полного сценария. | [actions.mjs:191](../nemesis/shared/engine/actions.mjs#L191) |
| Ремонт / `scout.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `scout.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Мародёрство / `scout.scavenging` | **T**, `COST-01`: дополнительная карта запрашивается второй раз после централизованной оплаты. | [actions.mjs:215](../nemesis/shared/engine/actions.mjs#L215) |
| Поиск / `scout.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |
| Уязвимое место / `scout.weakSpot` | **R**: +1 Hit к Shoot/Melee представлен; weapon-specific, Queen и reaction combinations не сертифицированы. | [actions.mjs:106](../nemesis/shared/engine/actions.mjs#L106) |

### 19.3. Механик / Mechanic

Оригинал: [ActionDeck_Mechanic](../Nemesis/Колоды/7FFA59CCCA02CD99A54AE38ED88C559D5AEB5A8A_ActionDeck_Mechanic.png); определения: [cards.mjs:314](../nemesis/shared/data/cards.mjs#L314).

Несколько общих ошибок стоимости; Computer Skills вызывает не то действие; Plasma Torch подменён набором механика.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Компьютерные навыки / `mechanic.computerSkills` | **T**, `CARD-02`: нужен Room Action, вызывается Computer Action. Это общий handler всех одноимённых карт. | [actions.mjs:224](../nemesis/shared/engine/actions.mjs#L224) |
| Подрыв / `mechanic.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Пригнуться / `mechanic.duckAndCover` | **T**, `COST-01`: двойная доплата. Redirect-реакция у Mechanic при этом определена. | [actions.mjs:236](../nemesis/shared/engine/actions.mjs#L236) |
| Быстрый ремонт / `mechanic.fastRepairs` | **R**: ремонт/Engine/Door-ветки есть; Door-выбор локальный. Все варианты ремонта equipment и персонажные исключения не сертифицированы. | [actions.mjs:239](../nemesis/shared/engine/actions.mjs#L239) |
| Клин клином / `mechanic.fightFire` | **R**: работа с Fire/Item есть; все обязательные/добровольные расходы и предметы не сертифицированы. | [actions.mjs:240](../nemesis/shared/engine/actions.mjs#L240) |
| Смекалка / `mechanic.ingenuity` | **R**: основные альтернативы есть; они используют упрощённые Starter/Quest Items, а не оригинальный Plasma Torch. | [actions.mjs:256](../nemesis/shared/engine/actions.mjs#L256) |
| Вмешательство / `mechanic.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Отдых / `mechanic.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Поиск / `mechanic.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |
| Технические коридоры / `mechanic.technicalCorridors` | **T**, `COST-01`: двойная доплата; **T/S**: неверные Tech Entrances (`MAP-01`). | [actions.mjs:268](../nemesis/shared/engine/actions.mjs#L268) |

### 19.4. Пилот / Pilot

Оригинал: [ActionDeck_Pilot](../Nemesis/Колоды/1BB87B1F6AB26C22B1557864D751BE84D0B67763_ActionDeck_Pilot.png); определения: [cards.mjs:336](../nemesis/shared/data/cards.mjs#L336).

Оригинальный Pilot Shotgun max2 не выдаётся: текущий loadout — Handgun + navTablet. Настоящий Quest Evacuation Key отсутствует.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Компьютерные навыки / `pilot.computerSkills` | **T**, `CARD-02`: нужен Room Action, вызывается Computer Action. Это общий handler всех одноимённых карт. | [actions.mjs:224](../nemesis/shared/engine/actions.mjs#L224) |
| Подрыв / `pilot.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Решимость / `pilot.determination` | **R**: добор/Knowledge-ветка найдена; все условия комнаты, лимиты и дополнительные эффекты не сертифицированы. | [actions2.mjs:46](../nemesis/shared/engine/actions2.mjs#L46) |
| Вмешательство / `pilot.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Знание корабля / `pilot.knowledgeOfShip` | **R**: просмотр/знания заведены; все цели, дополнительные требования и секретность не сертифицированы. | [actions2.mjs:53](../nemesis/shared/engine/actions2.mjs#L53) |
| Пилотирование / `pilot.piloting` | **R**: handler есть; все Escape Pod/разведка пути и endgame/реакции не сертифицированы. | [actions2.mjs:67](../nemesis/shared/engine/actions2.mjs#L67) |
| Ремонт / `pilot.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `pilot.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Поиск / `pilot.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |
| Уязвимое место / `pilot.weakSpot` | **R**: +1 Hit к Shoot/Melee представлен; weapon-specific, Queen и reaction combinations не сертифицированы. | [actions.mjs:106](../nemesis/shared/engine/actions.mjs#L106) |

### 19.5. Хакер / Hacker

Оригинал: [ActionDeck_Hacker](../Nemesis/Колоды/1E694056927631DC43D6E121343999ECB50D53C5_ActionDeck_Hacker.png); определения: [cards.mjs:356](../nemesis/shared/data/cards.mjs#L356).

Smart Gun имеет неверный эффект; у Neuralink пропущено optional-reveal правило; Cheat Codes не смоделирован полноценным Quest.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Компьютерные навыки / `hacker.computerSkills` | **T**, `CARD-02`: нужен Room Action, вызывается Computer Action. Это общий handler всех одноимённых карт. | [actions.mjs:224](../nemesis/shared/engine/actions.mjs#L224) |
| Подрыв / `hacker.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Вмешательство / `hacker.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Генеральный план / `hacker.masterPlan` | **R**: порядок Computer cards представлен; Lock-down по общему flow неверен (`COMPUTER-01`). | [actions2.mjs:86](../nemesis/shared/engine/actions2.mjs#L86) |
| Нейроинтерфейс / `hacker.neuralink` | **S**: нет напечатанного выбора не раскрывать новую Computer card (`actions2.mjs:101–112`). | [actions2.mjs:99](../nemesis/shared/engine/actions2.mjs#L99) |
| Переопределение / `hacker.override` | **R**: изменение Computer card предусмотрено; полная работа с Lock-down/колодой и дополнительными действиями не сертифицирована. | [actions2.mjs:104](../nemesis/shared/engine/actions2.mjs#L104) |
| Подзарядка / `hacker.recharge` | **R/S**: зарядка есть, но сам Smart Gun имеет неверный effect (`START-03`); все ограничения special reload не сертифицированы. | [actions2.mjs:121](../nemesis/shared/engine/actions2.mjs#L121) |
| Ремонт / `hacker.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `hacker.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Поиск / `hacker.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |

### 19.6. Учёный / Scientist

Оригинал: [ActionDeck_Scientist](../Nemesis/Колоды/2DBCBC00EC111DA60AFB5FEE7D33FD04CA8EB112_ActionDeck_Scientist.png); определения: [cards.mjs:376](../nemesis/shared/data/cards.mjs#L376).

Scientist Pistol/Wheelchair заменены обычным Handgun; Portable Device не реализован как оригинальный Quest.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Компьютерные навыки / `scientist.computerSkills` | **T**, `CARD-02`: нужен Room Action, вызывается Computer Action. Это общий handler всех одноимённых карт. | [actions.mjs:224](../nemesis/shared/engine/actions.mjs#L224) |
| Соединение / `scientist.connection` | **R**: основной handler есть; все Engine/Room exceptions и стоимость не сертифицированы. | [actions2.mjs:134](../nemesis/shared/engine/actions2.mjs#L134) |
| Подрыв / `scientist.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Пригнуться / `scientist.duckAndCover` | **S**: напечатанная redirect-реакция отсутствует в определении, в отличие от Mechanic. Доплата действия также использует общий проблемный handler. | [actions.mjs:236](../nemesis/shared/engine/actions.mjs#L236) |
| Вмешательство / `scientist.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Интранет / `scientist.intranet` | **R**: удалённая Room-ветка есть; Computer icons неверны, все room-action exceptions не сертифицированы. | [actions2.mjs:148](../nemesis/shared/engine/actions2.mjs#L148) |
| Ремонт / `scientist.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `scientist.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Оценка рисков / `scientist.riskAssessment` | **R**: handler есть; все варианты и приватные сведения не сертифицированы. | [actions2.mjs:156](../nemesis/shared/engine/actions2.mjs#L156) |
| Поиск / `scientist.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |

### 19.7. Медик / Medic

Оригинал: [ActionDeck_Medic](../Nemesis/Колоды/4C3B78EA1ED758144BC75AD631528EA2777A7ECB_ActionDeck_Medic.png); определения: [cards.mjs:398](../nemesis/shared/data/cards.mjs#L398).

Особый Medic Gun и Surgery Kit подменены Handgun/fieldKit; базовая инфраструктура лечения не обеспечивает все исключения.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Компьютерные навыки / `medic.computerSkills` | **T**, `CARD-02`: нужен Room Action, вызывается Computer Action. Это общий handler всех одноимённых карт. | [actions.mjs:224](../nemesis/shared/engine/actions.mjs#L224) |
| Подрыв / `medic.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Полевая хирургия / `medic.fieldSurgery` | **R**: Wound/healing-ветка есть; все условия оплаты, согласия там, где оно требуется, и выбор получателя не сертифицированы. | [actions2.mjs:174](../nemesis/shared/engine/actions2.mjs#L174) |
| Первая помощь / `medic.firstAid` | **R**: базовое лечение есть; Green item icons неверны, все room restrictions и Android exceptions не сертифицированы. | [actions2.mjs:192](../nemesis/shared/engine/actions2.mjs#L192) |
| Вмешательство / `medic.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Нейротоксин / `medic.neurotoxicGas` | **R**: расход Green Item и Move/Repel-ветки есть; все цели, порядок и отказ другого Character не сертифицированы. | [actions2.mjs:210](../nemesis/shared/engine/actions2.mjs#L210) |
| Ремонт / `medic.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `medic.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Поиск / `medic.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |
| Стимуляторы / `medic.synthesizedDrugs` | **R**: возвращение passed Character в фазу/добор есть; условия Room icons неверны, все лимиты и очередь не сертифицированы. | [actions2.mjs:229](../nemesis/shared/engine/actions2.mjs#L229) |

### 19.8. Уборщик / Janitor

Оригинал: [ActionDeck_Janitor](../Nemesis/Колоды/5A32844B8E7EC66689DC1CB3C578319809760314_ActionDeck_Janitor.png); определения: [cards.mjs:419](../nemesis/shared/data/cards.mjs#L419).

Janitor Gun max5 со специальным reload заменён Handgun; Karcher подменён wrench.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Уборка / `janitor.cleanUp` | **R**: удаление room markers есть; все напечатанные ограничения/стоимость не сертифицированы. | [actions2.mjs:246](../nemesis/shared/engine/actions2.mjs#L246) |
| Подрыв / `janitor.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Пригнуться / `janitor.duckAndCover` | **S**: нет напечатанной redirect-реакции; общий action-handler имеет проблему повторной доплаты. | [actions.mjs:236](../nemesis/shared/engine/actions.mjs#L236) |
| Аварийный ключ / `janitor.emergencyKey` | **R**: handler есть; все Door/Room scope и дополнительные последствия не сертифицированы. | [actions2.mjs:258](../nemesis/shared/engine/actions2.mjs#L258) |
| Вмешательство / `janitor.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Должно работать / `janitor.itShouldWork` | **S/R**: исходный Janitor Gun max5 и special reload отсутствуют; работа с обычным handgun не подтверждает оригинальный эффект. | [actions2.mjs:271](../nemesis/shared/engine/actions2.mjs#L271) |
| План обслуживания / `janitor.maintenancePlan` | **R**: удалённое обслуживание есть; все расходы/выбор комнаты/Computer exceptions не сертифицированы. | [actions2.mjs:288](../nemesis/shared/engine/actions2.mjs#L288) |
| Ремонт / `janitor.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `janitor.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Поиск / `janitor.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |

### 19.9. Директор / CEO

Оригинал: [ActionDeck_CEO](../Nemesis/Колоды/7541AB9F15C0551356BCC9B49C8E00A8D71C1A14_ActionDeck_CEO.png); определения: [cards.mjs:440](../nemesis/shared/data/cards.mjs#L440).

Две Action cards пропущены, Robot 3 вместо 5 и нет стартового Body Wound; Ship Codes не реализован оригинальным Quest.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Запасная батарея / `ceo.backupBattery` | **R/S**: refill есть, но Robot должен иметь max5, а не 3 (`START-01`); полный original refill не сертифицирован. | [actions2.mjs:305](../nemesis/shared/engine/actions2.mjs#L305) |
| Приказ / `ceo.command` | **R**: используется общий Command/Authority handler; напечатанная область, выбор действия управляющим игроком и все альтернативы не сертифицированы. | [actions2.mjs:327](../nemesis/shared/engine/actions2.mjs#L327) |
| Компьютерные навыки / `ceo.computerSkills` | **T**, `CARD-02`: нужен Room Action, вызывается Computer Action. Это общий handler всех одноимённых карт. | [actions.mjs:224](../nemesis/shared/engine/actions.mjs#L224) |
| Подрыв / `ceo.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Быстрый ремонт / `ceo.fastRepairs` | **R**: ремонт/Engine/Door-ветки есть; Door-выбор локальный. Все варианты ремонта equipment и персонажные исключения не сертифицированы. | [actions.mjs:239](../nemesis/shared/engine/actions.mjs#L239) |
| Вмешательство / `ceo.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Защита / `ceo.protect` | **R**: реакция существует; все перемещения, Robot markers/Body Wound и Larva не сертифицированы. | [actions2.mjs:310](../nemesis/shared/engine/actions2.mjs#L310) |
| Отдых / `ceo.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Удар робота / `ceo.roboticPunch` | **R**: marker/melee-ветка есть; начальный запас Robot неверен, Queen/kill-check и полный special effect не сертифицированы. | [actions2.mjs:311](../nemesis/shared/engine/actions2.mjs#L311) |
| Поиск / `ceo.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |
| **Just One More Thing** / отсутствует | **T**, `CARD-03`: после Pass Draw 1, дополнительный Turn, затем обязательный Pass; оригинальная ячейка 7 | Нет определения/handler |
| **Stop It!** / отсутствует | **T**, `CARD-03`: оригинальная реакция из ячейки 12 пропущена | Нет определения/handler |

### 19.10. Подопытная / LabRat

Оригинал: [ActionDeck_LabRat](../Nemesis/Колоды/86CD09B177CE9F11B250ADCEE5B9A95025382305_ActionDeck_LabRat.png); определения: [cards.mjs:463](../nemesis/shared/data/cards.mjs#L463).

Нет оригинального Lab Rat Gun; стартовый sampleJar не равен Bloody Camouflage.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Подрыв / `labrat.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Чувство темноты / `labrat.feelOfDark` | **T**, `COST-01`: дополнительный discard взимается дважды. | [actions2.mjs:391](../nemesis/shared/engine/actions2.mjs#L391) |
| Незаметность / `labrat.inconspicuous` | **R**: специальная реакция есть; все причины Encounter, число Intruders и movement не сертифицированы. | [combat.mjs:28](../nemesis/shared/engine/combat.mjs#L28) |
| Вмешательство / `labrat.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Ремонт / `labrat.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `labrat.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Поиск / `labrat.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |
| Острый слух / `labrat.sensitiveHearing` | **R**: handler есть; полный выбор/секретность/Technical Entrances требуют проверки. | [actions2.mjs:392](../nemesis/shared/engine/actions2.mjs#L392) |
| Визг / `labrat.shriek` | **R**: Repel/Noise-ветка есть; все ограничения/выбор Intruder и область Noise не сертифицированы. | [actions2.mjs:406](../nemesis/shared/engine/actions2.mjs#L406) |
| Странный метаболизм / `labrat.weirdMetabolism` | **R**: работа с Contamination/Heavy Objects и восстановлением есть; все типы объектов/лимиты/альтернативы не сертифицированы. | [actions2.mjs:414](../nemesis/shared/engine/actions2.mjs#L414) |

### 19.11. Охранник / Sentry

Оригинал: [ActionDeck_Sentry](../Nemesis/Колоды/947BCDCE10F15648984E0257D81D72ED02DD817D_ActionDeck_Sentry.png); определения: [cards.mjs:484](../nemesis/shared/data/cards.mjs#L484).

Вместо Sentry SMG выдан riotShotgun; Facility Tour с двойной доплатой, Battle Suit не смоделирован.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| План обороны / `sentry.defensePlan` | **R**: handler есть; полный выбор Event cards/порядок возврата/приватность не сертифицированы. | [actions2.mjs:435](../nemesis/shared/engine/actions2.mjs#L435) |
| Подрыв / `sentry.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Обход объекта / `sentry.facilityTour` | **T**, `COST-01`: дополнительный discard запрашивается повторно. | [actions2.mjs:451](../nemesis/shared/engine/actions2.mjs#L451) |
| Вмешательство / `sentry.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Ремонт / `sentry.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `sentry.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Поиск / `sentry.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |
| Пульт охраны / `sentry.securityControl` | **R**: действия с Door/markers есть; полный scope/доплаты/боевые исключения не сертифицированы. | [actions2.mjs:460](../nemesis/shared/engine/actions2.mjs#L460) |
| Оглушение / `sentry.stun` | **R**: handler есть; все special-effect symbols/цели/отключение оружия не сертифицированы. | [actions2.mjs:472](../nemesis/shared/engine/actions2.mjs#L472) |
| Уязвимое место / `sentry.weakSpot` | **R**: +1 Hit к Shoot/Melee представлен; weapon-specific, Queen и reaction combinations не сертифицированы. | [actions.mjs:106](../nemesis/shared/engine/actions.mjs#L106) |

### 19.12. Андроид / Android

Оригинал: [ActionDeck_Android](../Nemesis/Колоды/9DFD14339126502403B3E368361ADFF54D3003C0_ActionDeck_Android.png); определения: [cards.mjs:505](../nemesis/shared/data/cards.mjs#L505).

Большие нарушения Synthetic/UPS/оружия (`ANDROID-*`, `START-*`); Deactivation имеет неверный тайминг.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Всегда готов / `android.alwaysPrepared` | **R**: временное подавление Intruders ради базового действия реализовано; восстановление состояния после вложенных Attack/Encounter/конца игры не сертифицировано. | [actions2.mjs:498](../nemesis/shared/engine/actions2.mjs#L498) |
| Компьютерные навыки / `android.computerSkills` | **T**, `CARD-02`: нужен Room Action, вызывается Computer Action. Это общий handler всех одноимённых карт. | [actions.mjs:224](../nemesis/shared/engine/actions.mjs#L224) |
| Деактивация / `android.deactivation` | **T**, `CARD-05`: решение до раскрытия Attack card, хотя должно быть после. | [combat.mjs:28](../nemesis/shared/engine/combat.mjs#L28) |
| Подрыв / `android.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Быстрый ремонт / `android.fastRepairs` | **R**: ремонт/Engine/Door-ветки есть; Door-выбор локальный. Все варианты ремонта equipment и персонажные исключения не сертифицированы. | [actions.mjs:239](../nemesis/shared/engine/actions.mjs#L239) |
| Вмешательство / `android.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Подзарядка / `android.powerUp` | **R/S**: зарядка существует, но полного исходного UPS/max3→max5 и жизненного цикла нет (`START-01`, `ANDROID-03`). | [actions2.mjs:522](../nemesis/shared/engine/actions2.mjs#L522) |
| Обход протокола / `android.protocolOverride` | **R**: расход UPS/эффект заведены; все напечатанные целевые ограничения/активированная UPS side не сертифицированы. | [actions2.mjs:536](../nemesis/shared/engine/actions2.mjs#L536) |
| Поиск / `android.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |
| Самопочинка / `android.selfRepair` | **R**: отдельный ремонт существует; обычное лечение не ограничено Synthetic, весь правильный набор разрешённых предметов и AND/OR требует сценариев. | [actions2.mjs:554](../nemesis/shared/engine/actions2.mjs#L554) |

### 19.13. Заключённый / Convict

Оригинал: [ActionDeck_Convict](../Nemesis/Колоды/B2AC283975741A850DF481D6ADF3A9F20FF3E810_ActionDeck_Convict.png); определения: [cards.mjs:528](../nemesis/shared/data/cards.mjs#L528).

Cuffs имеют 3 вместо 6 markers и неверный lifecycle; Duck and Cover не имеет оригинальной реакции.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Удар! / `convict.bash` | **R/S**: melee и Cuffs-ветка есть, но старт Cuffs 3 вместо 6 и нет оригинального flip/Hand-slot lifecycle (`START-01`). | [actions2.mjs:580](../nemesis/shared/engine/actions2.mjs#L580) |
| Лови! / `convict.catchThis` | **R**: расход Heavy Item/атака есть; все разрешённые Items/цели/kill-check не сертифицированы. | [actions2.mjs:586](../nemesis/shared/engine/actions2.mjs#L586) |
| Подрыв / `convict.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Пригнуться / `convict.duckAndCover` | **T**, `CARD-04`: отсутствует напечатанная реакция перенаправления Intruder Attack. | [actions.mjs:236](../nemesis/shared/engine/actions.mjs#L236) |
| Вмешательство / `convict.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Запугивание / `convict.intimidate` | **R**: взаимодействие с Character есть; все разрешённые расходы/выборы/отказы не сертифицированы. | [actions2.mjs:596](../nemesis/shared/engine/actions2.mjs#L596) |
| Ремонт / `convict.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `convict.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Поиск / `convict.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |
| Вспыльчивость / `convict.shortTemper` | **R**: реакция существует; все источники повреждений/выбор ответного эффекта не сертифицированы. | [actions2.mjs:613](../nemesis/shared/engine/actions2.mjs#L613) |

### 19.14. Психолог / Psych

Оригинал: [ActionDeck_Psych](../Nemesis/Колоды/BA7E87F1D961D141890BF92902C1E72716413A5E_ActionDeck_Psych.png); определения: [cards.mjs:549](../nemesis/shared/data/cards.mjs#L549).

Oculobe Connections/global targeting отсутствуют; одноимённый предмет лишь расширяет часть эффектов до соседних комнат.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Компьютерные навыки / `psych.computerSkills` | **T**, `CARD-02`: нужен Room Action, вызывается Computer Action. Это общий handler всех одноимённых карт. | [actions.mjs:224](../nemesis/shared/engine/actions.mjs#L224) |
| Подрыв / `psych.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Без паники / `psych.dontPanic` | **R**: реакция существует; все допустимые источники/цели/окна не сертифицированы. | [combat.mjs:28](../nemesis/shared/engine/combat.mjs#L28) |
| Сканер эмоций / `psych.emotionScanner` | **S/R**: Oculobe Connections отсутствуют; локальная/соседняя область не равна активированной глобальной сети. | [actions2.mjs:631](../nemesis/shared/engine/actions2.mjs#L631) |
| Вмешательство / `psych.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Помощь / `psych.lendAHand` | **S/R**: Connection tokens и полный выбор связанных Characters отсутствуют; все добровольные расходы/получатели не сертифицированы. | [actions2.mjs:648](../nemesis/shared/engine/actions2.mjs#L648) |
| Ремонт / `psych.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `psych.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Поиск / `psych.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |
| Будьте любезны / `psych.wouldYouKindly` | **R/S**: общий Command-подобный handler есть; оригинальная Oculobe-сеть/контролирующий выбор не сертифицированы. | [actions2.mjs:348](../nemesis/shared/engine/actions2.mjs#L348) |

### 19.15. Охотник за головами / BountyH

Оригинал: [ActionDeck_BountyH](../Nemesis/Колоды/BBB4D9E6589EBAF573135459B8C091DD7B0B30E8_ActionDeck_BountyH.png); определения: [cards.mjs:570](../nemesis/shared/data/cards.mjs#L570).

Bounty Rifle имеет не напечатанный +1; Laika можно выбросить вопреки запрету, Canine Upgrade не реализован.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Подрыв / `bounty.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Решимость / `bounty.determination` | **R**: добор/Knowledge-ветка найдена; все условия комнаты, лимиты и дополнительные эффекты не сертифицированы. | [actions2.mjs:46](../nemesis/shared/engine/actions2.mjs#L46) |
| Вперёд, девочка! / `bounty.goGirl` | **R**: управление Laika есть; весь маршрут/число перемещений/возврат/Noise не сертифицированы. | [actions2.mjs:701](../nemesis/shared/engine/actions2.mjs#L701) |
| Вмешательство / `bounty.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Ремонт / `bounty.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `bounty.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Поиск / `bounty.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |
| Страж / `bounty.sentinel` | **R/S**: prevention-реакция есть, но общий Larva early-return обходит реакции (`COMBAT-01`); все Laika-условия не сертифицированы. | [combat.mjs:28](../nemesis/shared/engine/combat.mjs#L28) |
| Тактический манёвр / `bounty.tacticalMove` | **R**: Move/расход ammo/сопровождение Intruder представлены; все допустимые выборы и реакции не сертифицированы. | [actions2.mjs:717](../nemesis/shared/engine/actions2.mjs#L717) |
| Уязвимое место / `bounty.weakSpot` | **R**: +1 Hit к Shoot/Melee представлен; weapon-specific, Queen и reaction combinations не сертифицированы. | [actions.mjs:106](../nemesis/shared/engine/actions.mjs#L106) |

### 19.16. Капитан / Captain

Оригинал: [ActionDeck_Captain](../Nemesis/Колоды/F69F4A32D66D21E153355C9951B18A8A6BCA9DE4_ActionDeck_Captain.png); определения: [cards.mjs:591](../nemesis/shared/data/cards.mjs#L591).

Authority получает лишний Draw; Six Shooter reload restrictions и Intercom activation не восстановлены.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Полномочия / `captain.authority` | **S**: общая Command-ветка добавляет не напечатанный Draw; дальнейшие choices передаются исполнителю вместо Captain. Нет исходной активированной Intercom side. | [actions2.mjs:327](../nemesis/shared/engine/actions2.mjs#L327) |
| Прикрывающий огонь / `captain.coveringFire` | **R**: расход 2 ammo, предотвращение escape-атак и возможность перемещения другого Character есть; согласие и все перемещения/двери не сертифицированы. | [actions.mjs:122](../nemesis/shared/engine/actions.mjs#L122) |
| Подрыв / `captain.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Веер / `captain.fanning` | **R**: расход Six Shooter ammo/атака есть; распределение Hits, targets и kill-check/Queen требуют полного сценария. | [actions2.mjs:349](../nemesis/shared/engine/actions2.mjs#L349) |
| Вмешательство / `captain.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Мотивация / `captain.motivation` | **R/S**: добор/совместное действие есть; глобальная Intercom side отсутствует, весь выбор других Characters/отказ не сертифицирован. | [actions2.mjs:367](../nemesis/shared/engine/actions2.mjs#L367) |
| Перезарядка / `captain.reload` | **R**: особый refill Six Shooter есть; это не подтверждает соблюдение запрета других способов reload самого оружия. | [actions2.mjs:373](../nemesis/shared/engine/actions2.mjs#L373) |
| Ремонт / `captain.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `captain.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Поиск / `captain.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |

### 19.17. Выжившая / Survivor

Оригинал: [ActionDeck_Survivor](../Nemesis/Колоды/9FA9FC49B860DC6F61A753CAF7F9F5291A0E4036_ActionDeck_Survivor.png); определения: [cards.mjs:612](../nemesis/shared/data/cards.mjs#L612).

Favorite Weapon автоматически заменяет Handgun на round >=8, а не активируется Action в blue part Time Track.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Всегда готова / `survivor.alwaysPrepared` | **R**: временное подавление Intruders ради базового действия реализовано; восстановление состояния после вложенных Attack/Encounter/конца игры не сертифицировано. | [actions2.mjs:498](../nemesis/shared/engine/actions2.mjs#L498) |
| Подрыв / `survivor.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Отчаянная атака / `survivor.desperateAttack` | **R**: усиленный melee и discard Item против ответа есть; все последующие Attack/Queen/реакции не сертифицированы. | [actions3.mjs:54](../nemesis/shared/engine/actions3.mjs#L54) |
| Отвлечение / `survivor.distraction` | **R**: расход Item + Noise в соседней комнате есть; все допустимые предметы/ограничения/реакции не сертифицированы. | [actions.mjs:181](../nemesis/shared/engine/actions.mjs#L181) |
| Вмешательство / `survivor.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Упрямство / `survivor.obstinate` | **R**: draw по Wounds до 7 и обмен Item на лечение есть; все выбираемые Items/ограничения не сертифицированы. | [actions3.mjs:78](../nemesis/shared/engine/actions3.mjs#L78) |
| Ремонт / `survivor.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `survivor.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Поиск / `survivor.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |
| Вентиляция / `survivor.vents` | **R/S**: специальное движение есть; исходные Tech Entrances неверны (`MAP-01`), все Attack/Noise и Phantom-ветки не сертифицированы. | [actions3.mjs:96](../nemesis/shared/engine/actions3.mjs#L96) |

### 19.18. Ксенобиолог / Xeno

Оригинал: [ActionDeck_Xeno](../Nemesis/Колоды/5AAE828BF29DE3F3D002B8772E8B1EC190352777_ActionDeck_Xeno.png); определения: [cards.mjs:633](../nemesis/shared/data/cards.mjs#L633).

Probe Arm Orange Malfunction подменён 3 зарядами; нормальные Hits ряда карт обходят Combat check; Research Equipment отсутствует как настоящий Quest.

| Карта / ID | Поимённый verdict | Основной код |
|---|---|---|
| Подрыв / `xeno.demolition` | **S**: Door-ветка не ограничена adjacent Corridors, хотя обычное действие с Door локально (правило 19.1). | [actions.mjs:85](../nemesis/shared/engine/actions.mjs#L85) |
| Полевой опыт / `xeno.fieldExperience` | **T**, `ITEM-07`: normal 1 Hit не проходит обычный Combat kill-check. | [actions3.mjs:117](../nemesis/shared/engine/actions3.mjs#L117) |
| Вмешательство / `xeno.interruption` | **S/R**: реакция реализована, но текст «пока не автоматизирована» неверен; все окна и цепочки реакций не сертифицированы. | [turn.mjs:179](../nemesis/shared/engine/turn.mjs#L179) |
| Сверхразум / `xeno.overmind` | **R/S**: control/Probe Arm markers представлены, но сами Probe Arm states не оригинальные; все направления/входы/реакции не сертифицированы. | [actions3.mjs:127](../nemesis/shared/engine/actions3.mjs#L127) |
| Феромоны / `xeno.pheromones` | **R/S**: реакция есть; общий Larva early-return обходит применимые реакции, все Tissue/Encounter cases не сертифицированы. | [actions3.mjs:158](../nemesis/shared/engine/actions3.mjs#L158) |
| Ремонт / `xeno.repairs` | **T**, `COST-02`: снять Malfunction можно без напечатанного дополнительного discard. **OK по коду**: Door-ветка локальная (`actions.mjs:63–65`), не глобальная. | [actions.mjs:100](../nemesis/shared/engine/actions.mjs#L100) |
| Отдых / `xeno.rest` | **R**: базовые Rest/Infection есть, `OK-06` подтверждает только обычную Infection; весь Rest и исключения персонажей не сертифицированы. | [actions.mjs:104](../nemesis/shared/engine/actions.mjs#L104) |
| Поиск / `xeno.search` | **S/R**: обыск есть, но 18/21 Room item sets неверны; секретность Light Items — `INV-01`, overflow — `QUEUE-03`. | [actions.mjs:105](../nemesis/shared/engine/actions.mjs#L105) |
| Вивисекция / `xeno.vivisection` | **S/R**: использует normal damage без обычного Combat check; Probe Arm/Tissue заменены упрощённой моделью. Отдельного теста этой карты нет. | [actions3.mjs:165](../nemesis/shared/engine/actions3.mjs#L165) |
| План работ / `xeno.workspacePlan` | **R/S**: knowledge/Computer-ветка есть; неправильные Computer icons и очередь knowledge rewards, весь original Research Equipment lifecycle не сертифицированы. | [actions3.mjs:183](../nemesis/shared/engine/actions3.mjs#L183) |

## 20. Что эта матрица не утверждает

- 180 реализованных Action cards перечислены, но это **не 180 успешных сценариев**: метка R оставлена намеренно. Две отсутствующие CEO cards внесены отдельно, не подменены фиктивными ID.
- Карта с корректным русским текстом может исполняться неверно, а карта с устаревшим текстом Interruption — иметь реально работающий механизм. Поэтому текст и поведение разделены.
- Не сертифицированы все комбинации оружий/Adaptations, consent, open/closed/destroyed Doors, финальная выживаемость и multiplayer UI.
- Original adjacency graph, все физические тиражи неописанных в Атака.txt колод, обороты Encounter tokens и room icons Emergency требуют следующего слоя проверки. Доказанные MAP-01/02 не означают доказанную ошибку каждой связи графа.
- Исправления gameplay в рамках этого аудита не вносились.
