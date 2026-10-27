# Nemesis: Redux — протокол проверок аудита

Дата: 27.10.2026. База gameplay: `f3571bd140f4d006651c390d8bb59827d487f263` (аудит) + исправления в ветке `arena/d2b2103a-arcengine`. Node.js: **v22.22.3**.

Связанные документы: [постраничный отчёт](NEMESIS_AUDIT.md), [поимённые карточные матрицы](NEMESIS_CARD_AUDIT.md). Исходник сценариев: [`nemesis/tools/audit.test.mjs`](../nemesis/tools/audit.test.mjs).

## 1. Итоги последнего прогона

| Проверка | Команда | Результат |
|---|---|---|
| Отдельный Nemesis rule-conformance suite | `node --test --test-reporter=tap nemesis/tools/audit.test.mjs` | **94 tests: 94 PASS, 0 FAIL**, exit **0**; около 0,2 секунды |
| Поднабор положительных контролей | Фильтр `OK-*`, `ITEM-09`, `FD-01`, `CEO-0` — команда в §3 | **16/16 PASS**, exit **0** |
| Существующий check ArcEngine | `node tools/check.mjs` | **Успешно**, exit **0**; типы игры, типы редактора, **89/89** прежних тестов |
| Nemesis smoke/fuzz | `node nemesis/tools/fuzz.mjs 300` | **300 партий, 0 сбоев**, exit **0** |
| Проверка синтаксиса | `node --check` для всех `.mjs` в `nemesis/` | **Ошибок нет** |
| Стол-флоу: скрытые комнаты, мешок, «Готово» у события | `node --test nemesis/tools/table-flow.test.mjs` | **12 tests: 12 PASS, 0 FAIL**, exit **0** |
| WebSocket/undo E2E (реальный сервер, два клиента) | `node nemesis/tools/smoke.mjs` | **11 проверок, все PASS**, exit **0**; в браузере (WebGL) — **U** |

**Два набора по 89 и 94 теста — не один и тот же набор.** Обычный check проекта проверяет типы и инфраструктуру ArcEngine, но не соответствие Nemesis настольным правилам. Conformance suite расположен отдельно от `tests/*.test.mjs` и вызывается явно.

Дополнительно к правилам проверен «софт вокруг стола» — то, что физическая игра делает руками, а приложение должно объяснять: закрытая комната до вскрытия называется `???`, жетон из мешка тянет сам игрок (и видит, зачем тянул и что вытянул), карта события не исчезает, пока все не нажмут «Готово», а Esc возвращает собственный шаг. Эти 12 сценариев лежат отдельно (`tools/table-flow.test.mjs`), потому что проверяют не печатные правила, а поведение интерфейса; их ожидания тоже записаны по правилам (стр. 9 «Bag Development», стр. 8 «Event») и по постановке задачи.

Историческая точка отсчёта: исходный набор из **89** сценариев на неизменённой базе давал **14 PASS / 75 FAIL** (exit 1, все падения — `AssertionError`). Пять сценариев (`CEO-01`, `CEO-02`, `ITEM-12`, `ITEM-13`, `START-06`) добавлены позже вместе с исправлениями, поэтому текущий набор — 94 теста. Ожидания в тестах **не ослаблялись**: ни один тест не был удалён, переписан в «как сейчас работает» или помечен `skip`. Все 94 сценария теперь проходят потому, что исправлен gameplay-код.

## 2. Что именно проверяет suite

Ожидания записаны по правилам и картам: постранично по 25 страницам, по `Nemesis/Колоды/Атака.txt` для тиражей, по лицевым сторонам и оборотам карт, по 21 оригинальному PNG комнат и по полю. Покрыты: очередь обязательных эффектов, конец игры и финальная Eclosion, секретность view, шкала здоровья, стоимость действий, колоды (Queen, CEO, координаты), комнаты и иконки, компьютеры и Lockdown, предметы Support/Green, стартовые наборы, Android/Synthetic/UPS, Events, Feats, цели, поле и координаты.

Тесты детерминированы: фиксированные seeds, явно заданные карты и результаты бросков, без сети, таймеров и `Math.random`. Fixtures нормализуют комнату, руку, колоду, очередь и фазу для конкретного случая; это **не 94 записи полных законно разыгранных партий**. При падении тест останавливается на первом неудачном assertion, поэтому зелёный прогон подтверждает именно сформулированные утверждения, а не всю подсистему целиком.

Спорный `EVENT-06` следует напечатанному значку Action card на самой карте события; противоречие общему тексту раздела 8 описано в основном отчёте как конфликт источников (**C**), а не как скрытый баг.

## 3. Как воспроизвести

```sh
# Весь отдельный аудит; на исправленном коде возвращает exit 0.
node --test nemesis/tools/audit.test.mjs

# Только проблемные семейства (пример по идентификаторам).
node --test --test-name-pattern='OK-|ITEM-09|FD-01|CEO-0' nemesis/tools/audit.test.mjs

# Обычные проверки проекта и smoke-прогон партий.
node tools/check.mjs
node nemesis/tools/fuzz.mjs 300
```

## 4. Все сценарии в порядке TAP

| # | Тест | Статус | Проверяемое утверждение | Фактический результат |
|---:|---|---|---|---|
| 1 | [OK-01](../nemesis/tools/audit.test.mjs#L70) | **PASS** | Attack deck: 20 карт, Bite ×6 | Состав совпал. |
| 2 | [OK-02](../nemesis/tools/audit.test.mjs#L75) | **PASS** | Green/Red: по 30, точные тиражи из Атака.txt | Все заданные тиражи совпали. |
| 3 | [OK-03](../nemesis/tools/audit.test.mjs#L86) | **PASS** | 8 Serious Wounds, каждый ×3 | 24 карты, правильные копии. |
| 4 | [OK-04](../nemesis/tools/audit.test.mjs#L91) | **PASS** | Стартовый мешок/16 exploration tokens/6 Feats/3 Adaptations | Проверенные количества совпали, включая 1–5 игроков. |
| 5 | [OK-05](../nemesis/tools/audit.test.mjs#L104) | **PASS** | Contamination не оплачивает базовое действие | Move с единственной Contamination недоступен. |
| 6 | [OK-06](../nemesis/tools/audit.test.mjs#L109) | **PASS** | Обычная Infection: Scan, discard, не более одной Larva | Рука сброшена, Larva размещена, результат совпал. |
| 7 | [OK-07](../nemesis/tools/audit.test.mjs#L116) | **PASS** | Обычная Eclosion убивает по любой Contamination | Даже clean Contamination в draw вызывает смерть. |
| 8 | [OK-08](../nemesis/tools/audit.test.mjs#L123) | **PASS** | У Tail 1/2 разные, правильные Adult-эффекты | Tail 1: −1 HP + Contamination; Tail 2: Contamination. |
| 9 | [OK-09](../nemesis/tools/audit.test.mjs#L127) | **PASS** | Queen: числовой результат ≤ Hits запускает Queen Health | Поставлен шаг queen.card. |
| 10 | [DECK-01](../nemesis/tools/audit.test.mjs#L134) | **PASS** | Queen Health: 14 физических карт с правильными копиями | 14 физических карт: q1repel ×2, q2malf ×3, q2act ×3, остальные ×1. |
| 11 | [ACT-01](../nemesis/tools/audit.test.mjs#L141) | **PASS** | Room Action стоит 2 Action cards по Dashboard | roomActionCost() возвращает 2. |
| 12 | [ACT-02](../nemesis/tools/audit.test.mjs#L145) | **PASS** | Computer и Pick Up недоступны в Combat | Оба действия выключены при чужом в комнате (snapshot двух flags). |
| 13 | [HP-01](../nemesis/tools/audit.test.mjs#L153) | **PASS** | 10 потерь HP из первой клетки достигают черепа | 10 потерь из 10 HP доводят маркер до черепа: персонаж dead. |
| 14 | [QUEUE-01](../nemesis/tools/audit.test.mjs#L157) | **PASS** | Archives: Knowledge reward разрешается раньше следующего действия | Сначала разрешается порог знаний, prompt — выбор Field Data. |
| 15 | [QUEUE-02](../nemesis/tools/audit.test.mjs#L163) | **PASS** | Queen Health после Crit до следующего действия | Карта здоровья Королевы вытянута до появления меню хода. |
| 16 | [QUEUE-03](../nemesis/tools/audit.test.mjs#L170) | **PASS** | Третий Heavy Item немедленно вызывает освобождение руки | Меню не появляется, пока не разрешена вместимость рук. |
| 17 | [COMBAT-01](../nemesis/tools/audit.test.mjs#L175) | **PASS** | Larva Attack допускает Nerves of Steel | Сначала окно реакции, личинка применяется после отказа. |
| 18 | [COMBAT-02](../nemesis/tools/audit.test.mjs#L182) | **PASS** | Blood Sense: Drone следует за выходящим Character | Drone перемещается в комнату назначения вместе с персонажем. |
| 19 | [CARD-01](../nemesis/tools/audit.test.mjs#L190) | **PASS** | My Little Friend: burst доходит до Shoot | После burst выставляется dice prompt обычного выстрела. |
| 20 | [COST-01 · mechanic.duckAndCover](../nemesis/tools/audit.test.mjs#L202) | **PASS** | Напечатанная дополнительная карта платится ровно один раз | Доплата взимается один раз, затем идёт эффект карты. |
| 21 | [COST-01 · mechanic.technicalCorridors](../nemesis/tools/audit.test.mjs#L202) | **PASS** | Напечатанная дополнительная карта платится ровно один раз | Доплата взимается один раз, затем идёт эффект карты. |
| 22 | [COST-01 · labrat.feelOfDark](../nemesis/tools/audit.test.mjs#L202) | **PASS** | Напечатанная дополнительная карта платится ровно один раз | Доплата взимается один раз, затем идёт эффект карты. |
| 23 | [COST-01 · sentry.facilityTour](../nemesis/tools/audit.test.mjs#L202) | **PASS** | Напечатанная дополнительная карта платится ровно один раз | Доплата взимается один раз, затем идёт эффект карты. |
| 24 | [COST-01 · scout.scavenging](../nemesis/tools/audit.test.mjs#L202) | **PASS** | Напечатанная дополнительная карта платится ровно один раз | Доплата взимается один раз, затем идёт эффект карты. |
| 25 | [COST-02](../nemesis/tools/audit.test.mjs#L214) | **PASS** | Repairs: убрать Malfunction требует дополнительный discard | Repairs требует дополнительную карту за Malfunction. |
| 26 | [CARD-02](../nemesis/tools/audit.test.mjs#L221) | **PASS** | Computer Skills исполняет Room Action | Computer Skills выполняет Room Action: Signal отправлен. |
| 27 | [CARD-03](../nemesis/tools/audit.test.mjs#L226) | **PASS** | У CEO 12 исходных Action cards | У CEO 12 карт, включая Just One More Thing и Stop It!. |
| 28 | [CARD-04](../nemesis/tools/audit.test.mjs#L229) | **PASS** | Convict Duck and Cover имеет redirect-реакцию | Convict получает окно redirect-реакции duck. |
| 29 | [CARD-05](../nemesis/tools/audit.test.mjs#L235) | **PASS** | Deactivation решается после раскрытия Attack card | Attack card вскрыта до решения о Deactivation. |
| 30 | [ROOM-01](../nemesis/tools/audit.test.mjs#L241) | **PASS** | Surgery сбрасывает также clean Action deck | Колода действий полностью уходит в сброс. |
| 31 | [ROOM-02](../nemesis/tools/audit.test.mjs#L248) | **PASS** | Laboratory принимает Character Corpse как Human Corpse | Character Corpse доступен как анализируемый объект. |
| 32 | [ROOM-03](../nemesis/tools/audit.test.mjs#L253) | **PASS** | Airlock убивает только в конце Player Phase | Обитатели живы до конца Player Phase, шлюз отмечен. |
| 33 | [ROOM-04](../nemesis/tools/audit.test.mjs#L259) | **PASS** | Server допускает Room Action удалённой комнаты с Malfunction | Server выполняет действие комнаты с поломкой. |
| 34 | [ROOM-05](../nemesis/tools/audit.test.mjs#L265) | **PASS** | На Laboratory 3 Green icons | ROOM_TILES.laboratory.items — три green. |
| 35 | [ROOM-06](../nemesis/tools/audit.test.mjs#L268) | **PASS** | На Archives 3 Red icons | ROOM_TILES.archives.items — три red. |
| 36 | [COMPUTER-01](../nemesis/tools/audit.test.mjs#L271) | **PASS** | Lock-down срабатывает немедленно при раскрытии после Computer Action | Lockdown разыгрывается сразу: поломка, новая карта. |
| 37 | [COMPUTER-02](../nemesis/tools/audit.test.mjs#L278) | **PASS** | Доплату Computer B можно оплатить лишь Action card | Contamination отсутствует в списке оплаты Computer B. |
| 38 | [ITEM-01](../nemesis/tools/audit.test.mjs#L283) | **PASS** | Medkit может одновременно убрать Wound и дать 3 HP | Травма снята и 3 HP восстановлены за одно использование. |
| 39 | [ITEM-02](../nemesis/tools/audit.test.mjs#L291) | **PASS** | Grenade Launcher заменяет normal Shoot специальным эффектом | У гранатомёта единственный режим — гранатный. |
| 40 | [ITEM-03](../nemesis/tools/audit.test.mjs#L296) | **PASS** | Armory не может заряжать Grenade Launcher без Grenade | Оружейная не заряжает гранатомёт без гранаты. |
| 41 | [ITEM-04](../nemesis/tools/audit.test.mjs#L301) | **PASS** | Sniper Rifle позволяет basic Shoot при цели только nearby | Shoot доступен, когда цель только в соседней комнате. |
| 42 | [ITEM-05](../nemesis/tools/audit.test.mjs#L306) | **PASS** | Assault Rifle: natural 2 остаётся Crit после Agile | Natural 2 даёт Crit до применения Agile. |
| 43 | [ITEM-06](../nemesis/tools/audit.test.mjs#L312) | **PASS** | Assault Rifle: natural 2 работает против Queen | Против Королевы natural 2 также даёт Crit-процедуру. |
| 44 | [ITEM-07](../nemesis/tools/audit.test.mjs#L318) | **PASS** | Xeno Field Experience: normal Hit требует Combat kill-check | Урон Field Experience проходит обычный бросок боя. |
| 45 | [ITEM-08](../nemesis/tools/audit.test.mjs#L323) | **PASS** | Hardened Armor: замена Wound на −2 HP добровольна | Усиленная броня спрашивает игрока, а не заменяет травму молча. |
| 46 | [ITEM-09](../nemesis/tools/audit.test.mjs#L328) | **PASS** | Heavily Injured Character не может получить Armor | giveItem не надевает запрещённую Armor. |
| 47 | [FEAT-01](../nemesis/tools/audit.test.mjs#L333) | **PASS** | Overpower игнорирует Fearless | Overpower игнорирует Бесстрашие: чужой отогнан. |
| 48 | [FEAT-02](../nemesis/tools/audit.test.mjs#L339) | **PASS** | Breach игнорирует дополнительный Action-card cost | Breach не требует дополнительной карты Computer B. |
| 49 | [EVENT-01](../nemesis/tools/audit.test.mjs#L345) | **PASS** | The Queen Awakens не превышает доступный Queen token pool | Жетоны Королевы ограничены доступным пулом (3). |
| 50 | [INV-01](../nemesis/tools/audit.test.mjs#L350) | **PASS** | Чужие обычные Light Items не раскрываются в view | Чужие light items не попадают в публичный view. |
| 51 | [INV-02](../nemesis/tools/audit.test.mjs#L355) | **PASS** | Два выбираемых Objectives не раскрываются другому игроку | Другой игрок не видит варианты целей. |
| 52 | [INV-03](../nemesis/tools/audit.test.mjs#L361) | **PASS** | Secret Engine Status отсутствует в чужом prompt title | Заголовок скрытого prompt не содержит состояния двигателя. |
| 53 | [INV-04](../nemesis/tools/audit.test.mjs#L366) | **PASS** | Получатель Heavy Object соблюдает Hand limit | Получатель не может держать три слота без окна вместимости. |
| 54 | [INV-05](../nemesis/tools/audit.test.mjs#L372) | **PASS** | Cannot be discarded защищает Laika от Drop | Laika отсутствует в списке Drop. |
| 55 | [ANDROID-01](../nemesis/tools/audit.test.mjs#L377) | **PASS** | Synthetic: Scan, infected −1 HP, убрать Contamination и Draw replacement | Заражённая Contamination сканируется, −1 HP, добор замены. |
| 56 | [ANDROID-02](../nemesis/tools/audit.test.mjs#L383) | **PASS** | Synthetic: Android не заражается Larva | Личинка не заражает Андроида. |
| 57 | [ANDROID-03](../nemesis/tools/audit.test.mjs#L388) | **PASS** | UPS: попытка reshuffle при 0 markers смертельна | Перемешивание без жетонов ИБП убивает Андроида. |
| 58 | [START-01](../nemesis/tools/audit.test.mjs#L393) | **PASS** | Начальные markers Cuffs/Robot/UPS: 6/5/3 | 6/5/3 жетона у Cuffs, Robot, UPS. |
| 59 | [START-02](../nemesis/tools/audit.test.mjs#L397) | **PASS** | Android Gun requires no ammo | energyPistol.noAmmo = true. |
| 60 | [START-03](../nemesis/tools/audit.test.mjs#L400) | **PASS** | Smart Gun — reroll, не постоянный +1 | Smart Gun: reroll, без постоянного +1. |
| 61 | [START-04](../nemesis/tools/audit.test.mjs#L404) | **PASS** | Sentry начинает со своего SMG: max5, optional +ammo → Hit | Sentry начинает с SMG: 5 патронов, +1 патрон → +1 ранение. |
| 62 | [START-05](../nemesis/tools/audit.test.mjs#L410) | **PASS** | Robot даёт CEO стартовый Body Wound | CEO начинает с Body Wound. |
| 63 | [QUEST-01](../nemesis/tools/audit.test.mjs#L414) | **PASS** | Tools предлагает активацию исходного Quest Item | Tools предлагает активацию квестового предмета. |
| 64 | [END-01](../nemesis/tools/audit.test.mjs#L420) | **PASS** | Последний Hibernation немедленно завершает игру | После последнего hibernation игра заканчивается сразу. |
| 65 | [END-02](../nemesis/tools/audit.test.mjs#L426) | **PASS** | Ship destruction помечает Nest destroyed для Objectives | Совпало. |
| 66 | [END-03](../nemesis/tools/audit.test.mjs#L430) | **PASS** | Финальная Larva разрешается через нормальную Eclosion | Личинка проходит финальную Eclosion, персонаж остаётся в игре. |
| 67 | [OBJ-01](../nemesis/tools/audit.test.mjs#L443) | **PASS** | Pursuit of Science требует max Knowledge 8 | Pursuit требует 8 знаний, а не лидерства. |
| 68 | [OBJ-02](../nemesis/tools/audit.test.mjs#L447) | **PASS** | Ab Ovo: достаточно глобально проанализированного Egg | Ab Ovo учитывает яйцо, проанализированное другим персонажем. |
| 69 | [OBJ-03](../nemesis/tools/audit.test.mjs#L451) | **PASS** | BFF наследует явно напечатанную non-Earth safety друга | BFF наследует исключение безопасности друга при Венере. |
| 70 | [MAP-01](../nemesis/tools/audit.test.mjs#L461) | **PASS** | Original board содержит 8 напечатанных Tech Entrances | Тех. входы: 002, 004, 005, 009, 014, 015, 019, 021. |
| 71 | [MAP-02](../nemesis/tools/audit.test.mjs#L466) | **PASS** | Original corridor Cockpit 001 →002 имеет номер 3 | Коридор Рубка → 002 напечатан как 3. |
| 72 | [PHASE-01](../nemesis/tools/audit.test.mjs#L469) | **PASS** | Intruder Attacks идут сверху вниз по полю | Атаки идут сверху вниз по полю, а не по ID комнаты. |
| 73 | [EVENT-02](../nemesis/tools/audit.test.mjs#L475) | **PASS** | Breaking In сначала ставит только свежий Tech Noise | Свежий тех. шум не добавляет шум в соседние коридоры. |
| 74 | [EVENT-03](../nemesis/tools/audit.test.mjs#L482) | **PASS** | Bulkheads Open без Action cards вызывает Encounter | Нет карт действий → Encounter, не Noise roll. |
| 75 | [EVENT-04](../nemesis/tools/audit.test.mjs#L487) | **PASS** | Только Contamination означает отсутствие Action cards | Рука из одних Contamination = нет карт действий. |
| 76 | [EVENT-05](../nemesis/tools/audit.test.mjs#L492) | **PASS** | Egg Protection: Drone один на комнату с Eggs | Один Drone на комнату с яйцом. |
| 77 | [EVENT-06](../nemesis/tools/audit.test.mjs#L498) | **PASS** | Конкретный Event tie-break считает только Action cards | Tie-break считает карты действий, а не Contamination. |
| 78 | [FEAT-03](../nemesis/tools/audit.test.mjs#L507) | **PASS** | Conviction: Queen Crit разрешает Queen Health | Conviction применяет критический результат к Королеве. |
| 79 | [ITEM-10](../nemesis/tools/audit.test.mjs#L512) | **PASS** | Grenade Launcher наносит Crit каждому Intruder | Граната/гранатомёт уничтожает всех чужих в комнате. |
| 80 | [ITEM-11](../nemesis/tools/audit.test.mjs#L517) | **PASS** | Perimeter prevention стоит 1 Action card | Периметр стоит 1 карту действия, заряды не расходуются. |
| 81 | [INV-06](../nemesis/tools/audit.test.mjs#L523) | **PASS** | Передача требует согласия получателя | Передача требует согласия получателя. |
| 82 | [OK-10](../nemesis/tools/audit.test.mjs#L528) | **PASS** | Energy Charge заряжает именно 3 ammo | Пустое оружие получает 3, как на оригинале. |
| 83 | [INV-07](../nemesis/tools/audit.test.mjs#L534) | **PASS** | Публичные setup-параметры не должны раскрывать secret | Совпало. |
| 84 | [OK-11](../nemesis/tools/audit.test.mjs#L543) | **PASS** | Careful Move исключает полностью Noisy destination | При Noise во всех Corridors/Tech room prompt выбора назначения не предлагается. |
| 85 | [NOISE-01](../nemesis/tools/audit.test.mjs#L549) | **PASS** | Danger: eligible Intruder ломает Door без лишнего Noise | Сломанная дверь считается входом; лишний шум не кладётся. |
| 86 | [OK-12](../nemesis/tools/audit.test.mjs#L558) | **PASS** | Четыре Field Data уже имеют централизованную доплату | У Evasive/Hunker/Quick Hands/Reposition первоначальный cards prompt имеет min=max=1. |
| 87 | [FD-01](../nemesis/tools/audit.test.mjs#L568) | **PASS** | Safety in Numbers требует другого Character, а не нехватки оплаты | С четырьмя оплачиваемыми картами запрещено одному и разрешено вдвоём в комнате. |
| 88 | [FD-02](../nemesis/tools/audit.test.mjs#L575) | **PASS** | Rapid Response включает Computer как basic one-card Action | Computer доступен как базовое действие в Rapid Response. |
| 89 | [MAP-03](../nemesis/tools/audit.test.mjs#L582) | **PASS** | Coordinates: все 8 печатных схем назначения | Восемь напечатанных схем координат присутствуют. |
| 90 | [CEO-01](../nemesis/tools/audit.test.mjs#L598) | **PASS** | «Ещё одну вещь»: после паса — добор 1 карты и дополнительный ход | Карта уходит из игры, добор 1, ход переходит тому же персонажу. |
| 91 | [CEO-02](../nemesis/tools/audit.test.mjs#L612) | **PASS** | «Stop It!»: реакция после вскрытия карты атаки | Атака отменена, карта убрана из игры. |
| 92 | [ITEM-12](../nemesis/tools/audit.test.mjs#L625) | **PASS** | Звуковая пушка: спецрезультат кладёт поломку в вашей комнате | На «2»/«6» — поломка в вашей комнате, шум не кладётся. |
| 93 | [ITEM-13](../nemesis/tools/audit.test.mjs#L632) | **PASS** | Тактический топорик: 2 ранения без броска и оранжевая поломка | Кубик боя не бросается, ровно 2 ранения, жетон на оружии. |
| 94 | [START-06](../nemesis/tools/audit.test.mjs#L639) | **PASS** | Smart Gun: переброс — решение игрока, второй результат окончателен | Появляется выбор «Перебросить/Оставить», при «Оставить» используется первый бросок. |

## 5. Границы проверки

- **E2E — только транспорт, не картинка.** `tools/smoke.mjs` поднимает настоящий `server.mjs`, подключает два WebSocket-клиента и проходит лобби → старт → меню хода → выбор комнаты → Esc (откат своего шага) → передача хода; он же проверяет, что чужой prompt не принимается, а в view нет `secret`/`seedStr`. Отрисовка Babylon/WebGL, вёрстка панелей и звук в браузере по-прежнему **U**: автотестами не покрыты.
- **Клиентская логика проверена в DOM-песочнице, но это не часть набора.** Панель персонажа, просмотр колод, подсказки, Alt-слой, prompt мешка/события и Esc прогонялись через jsdom с заглушками `scene3d`/`dice` (внешний пакет, в репозиторий не добавлялся — инвариант «ноль зависимостей»). Результат — «зелёные» проверки DOM, а не подтверждение внешнего вида; файл в набор не входит.
- **Fixtures частично синтетические.** Они задают руки, колоды и комнаты напрямую, чтобы изолировать утверждение; 94 сценария не заменяют исчерпывающий перебор комбинаций.
- **Непроверенные ветки.** Полная матрица всех комбинаций восьми Adaptation, все взаимодействия квестовых предметов после активации, физический подсчёт четырёх туш для `Bug Hunt`, а также все тайминги реакций вне протестированных окон остаются **U** (не проверено) — это не PASS.
- **Противоречия источников** (порядок Bulkheads, заголовок Additional Room Sheet, Computer/Knowledge, «onboard» у BFF, третья клетка шкалы травм) не «исправлялись» произвольно: выбранный вариант зафиксирован в основном отчёте с пометкой **C**.
- **Клиент менялся в этой ветке** (QoL-слой: `nemesis/client/app.js`, `style.css`, `index.html`, `scene3d.js`, `fx.js`, `sound.js`, `dice.js`) — синтаксис проверен `node --check`, поведение — jsdom-песочницей, но глазами в браузере не смотрели.

## 6. Что изменено в коде

| Файл | Изменения |
|---|---|
| `nemesis/shared/engine/core.mjs` | Смерть при 0 HP; пороги знаний по возрастанию; `destroyShip` помечает уничтожение Гнезда; `infectLarva` (Андроид не заражается); сканирование Contamination при доборе Synthetic; расход/смерть UPS при перемешивании; опциональная замена травмы усиленной бронёй. |
| `nemesis/shared/engine/turn.mjs` | Меню больше не обгоняет очередь обязательных шагов; Computer/Pick Up недоступны в бою; Shoot доступен для снайперской винтовки с целью рядом; Laika нельзя выбросить; скрытый prompt выбора цели; реакция CEO «Ещё одну вещь» (после паса: добор 1 и дополнительный ход), `CEO-01`. |
| `nemesis/shared/engine/combat.mjs` | Attack card вскрывается до реакций (Nerves/Deactivation/duck/Stop It!, `CEO-02`); тактический топорик наносит 2 ранения без броска (`ITEM-13`); переброс Smart Gun — выбор игрока (`START-06`); звуковая пушка ставит поломку (`ITEM-12`); natural 2 до Agile и работает против Королевы; Blood Sense следует за перемещением; передача требует согласия и проверяет вместимость получателя; гранатомёт без обычного режима и с критическим эффектом; `fieldExpHit`. |
| `nemesis/shared/engine/rooms.mjs` | Room Action стоит 2; Surgery/ Laboratory/ Airlock/ Server/ Armory по напечатанному тексту; Lockdown сразу после Computer Action; доплаты только картами действий; Server допускает комнату с поломкой; лечение может применить второй эффект (Medkit). |
| `nemesis/shared/engine/actions*.mjs`, `fielddata.mjs` | Убрана двойная доплата у пяти карт; Computer Skills выполняет комнату; Repairs платит за Malfunction; Fast Experience и Conviction проходят бросок боя; Rapid Response включает Computer. |
| `nemesis/shared/engine/events.mjs`, `intruders.mjs`, `movement.mjs`, `feats.mjs` | Breaking In по напечатанному условию; Bulkheads Open → Encounter; Egg Protection по комнатам; пороги 3 иконок; пул жетонов Королевы; порядок атак по полю; tie-break по картам действий; сломанная дверь на Danger; Overpower/Breach/Conviction. |
| `nemesis/shared/engine/endgame.mjs` | Финальная процедура Infection → Contamination → shuffle → Eclosion; исключение BFF; Pursuit = 8 знаний; Ab Ovo глобально. |
| `nemesis/shared/engine/setup.mjs` | Стартовая травма Body у CEO. |
| `nemesis/shared/data/cards.mjs` | 14 карт Королевы по тиражам; 8 координат; стартовые 6/5/3; энергопистолет без патронов; Smart Gun с reroll; Sentry с SMG; CEO + Just One More Thing/Stop It!; тексты Medkit/Hardened Armor. |
| `nemesis/shared/ship.mjs` | Иконки и Computer 21 комнаты по оригинальным PNG; напечатанные тех. входы и коридор Рубка → 002; тексты Room Actions. |
| `nemesis/shared/view.mjs` | Чужие light items скрыты; заголовки скрытых prompts маскируются; `seedStr` не публикуется; открытые сбросы (`piles`), последний жетон (`bagLast`), список «Готово» (`ack`). |
| `nemesis/shared/engine/core.mjs` | `???` для неразведанной комнаты; `bag.ask`/`bag.drawn` (жетон тянет игрок), печатные значения жетонов (стр. 9), `askAck` (общий prompt «Готово»). |
| `nemesis/shared/engine/intruders.mjs`, `movement.mjs`, `events.mjs` | Развитие мешка и Встреча проходят через `bag.ask` с причиной; `event.reveal` отделён от эффектов и ждёт «Готово»; `bagLast.effect` описывает итог. |
| `nemesis/server.mjs` | `canUndo` для Esc-отката своего шага, `noSelf` для бросков/секретов/жетона/«Готово», ответ ведущего за отсутствующего игрока, `ui:{bagClick,eventAck}` в партии. |
| `nemesis/client/*` | QoL: подсказки клавиш, Alt-слой (номера коридоров и цвета поиска), панель персонажа, просмотр колод, полоса вытянутого жетона, «Готово» у события, Esc-откат, спокойный звук кубика. |
