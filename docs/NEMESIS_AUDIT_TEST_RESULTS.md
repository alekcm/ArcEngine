# Nemesis: Redux — протокол проверок аудита

Дата: 27.10.2026. База gameplay: `f3571bd140f4d006651c390d8bb59827d487f263`. Ветка: `arena/d2b2103a-arcengine`. Node.js: **v22.22.3**.

Связанные документы: [постраничный отчёт](NEMESIS_AUDIT.md), [поимённые карточные матрицы](NEMESIS_CARD_AUDIT.md). Исходник сценариев: [`nemesis/tools/audit.test.mjs`](../nemesis/tools/audit.test.mjs).

## 1. Итоги последнего прогона

| Проверка | Команда | Результат |
|---|---|---|
| Отдельный Nemesis rule-conformance suite (после исправлений) | `node --test --test-reporter=tap nemesis/tools/audit.test.mjs` | **95 tests: 95 PASS, 0 FAIL**, exit **0** |
| Тот же suite на исходной базе (до исправлений) | тот же файл, база `f3571bd` | **14 PASS, 75 FAIL**, exit **1** — исторический замер |
| Поднабор положительных контролей | Фильтр `OK-*`, `ITEM-09`, `FD-01` — команда в §3 | **14/14 PASS**, exit **0** |
| Существующий check ArcEngine | `node tools/check.mjs` | **Успешно**, exit **0**; типы игры, типы редактора, **89/89** прежних тестов |
| Nemesis smoke/fuzz | `node nemesis/tools/fuzz.mjs 300` | **300 партий, 0 зарегистрированных сбоев**, exit **0** |
| Проверка синтаксиса | `node --check` для всех `.mjs` в `nemesis/` | **22 модуля, ошибок нет**, включая новый audit suite |
| Browser/WebSocket/undo E2E | Не запускался | **Не проверено**, не приравнивается к PASS |

**Два набора по 89 тестов — не один и тот же набор.** Обычный check проекта не проверяет соответствие Nemesis настольным правилам. Новый conformance suite расположен отдельно от `tests/*.test.mjs` и вызывается явно.

**Исторический прогон до исправлений** (сохранён для воспроизводимости): 75 FAIL, все — `AssertionError` / `ERR_ASSERTION`, без `TypeError`, `ReferenceError`, `SyntaxError`, отсутствующих импортов и неизвестных операций. **Текущий прогон — 95 PASS, 0 FAIL.** Таблица §4 показывает оба состояния: ожидание, прежний факт и текущий результат.

## 2. Почему suite был красным и что изменилось

Ожидания записаны **по правилам/картам**, а не по прежнему поведению. После исправления gameplay все 89 сценариев проходят **без изменения ожиданий**. Изменены только два fixture, которые не представляли напечатанную ситуацию:

- `COST-01 · mechanic.technicalCorridors`: комната `011` (Гибернаторий) не имеет входа в тех. коридоры, поэтому карта не могла дать эффект. Fixture переведён в `002` — реальную комнату с техвходом.
- `QUEST-01`: у Солдата в fixture не было своего квестового предмета, поэтому альтернатива Tools была неприменима. Fixture дополнен напечатанной «Тяжёлой бронёй» (`heavyArmor`).

Само ожидание в обоих случаях не менялось. После исправлений в набор добавлены 6 новых сценариев (`ITEM-12`, `ITEM-13`, `CEO-01`, `CEO-02`, `START-06`, `END-04`) — всего 95 прогонов. Полный перечень изменений — в [NEMESIS_FIX_REPORT.md](NEMESIS_FIX_REPORT.md).

75 падений **не означают 75 независимых багов** и **не дают процент соответствия игре**. Например, пять `COST-01` проверяют одну семью повторной оплаты; несколько `INV-*` — разные каналы утечки; очередь продолжений влияет на много карт. Выборка специально направлена на найденные риски и дополнена passing controls.

Тесты детерминированы: фиксированные seeds, явно заданные карты/случайные результаты, без сети/таймеров/`Math.random`. Часть проходит через `turn.do`, часть изолирует зарегистрированную `OPS`-операцию, функцию или данные. Fixtures нормализуют комнату, руку, колоду, очередь и фазу для конкретного случая; это **не 89 записей полных законно разыгранных партий**. Вспомогательные колоды могут быть синтетическими. В сценарии финальной Eclosion использованы десять разных обычных карт Soldier и отдельно проверен безопасный эталонный draw.

При FAIL выполнение теста останавливается на первом упавшем assertion: нельзя автоматически считать пройденными последующие assertions того же теста. Для составов Queen, начальных markers, Smart Gun, Sentry Gun и двух базовых Combat-запретов сравнивается совокупный snapshot, чтобы увидеть все сравниваемые поля. `FD-01` содержит **обе** половины: достаточно оплачиваемых карт, запрет в одиночку и разрешение после появления второго персонажа.

Спорный `EVENT-06` следует именно напечатанному значку Action card на Event, согласно приоритету конкретной карты. Противоречие общему тексту раздела 8 описано как C в основном отчёте; не выдаётся за незамеченное противоречие.

## 3. Как воспроизвести

```sh
# Весь отдельный аудит; после исправлений возвращает exit 0.
node --test nemesis/tools/audit.test.mjs

# Только конкретные проблемные семейства.
node --test --test-name-pattern='QUEUE-|END-03|DECK-01|MAP-03' nemesis/tools/audit.test.mjs

# Только положительные контроли; этот поднабор должен пройти.
node --test --test-name-pattern='OK-|ITEM-09|FD-01' nemesis/tools/audit.test.mjs

# Существующие проверки проекта и smoke/fuzz — отдельно.
node tools/check.mjs
node nemesis/tools/fuzz.mjs 300
```

Fuzz выбирает действия/ответы через `Math.random`, поэтому повторный прогон не обязан дать те же партии. Его результат — только отсутствие зафиксированного runtime-сбоя при выбранных ходах; проигрыш агента не считается сбоем, правильность правил и вероятность победы так не измеряются.

## 4. Все сценарии в порядке TAP

Статус взят из последнего прогона, а не вычислен из предполагаемого исправления. Ссылки ведут к исходным сценариям. Формулировки «должно» — нормативное ожидание; соседний столбец показывает наблюдение текущей реализации.

| № | Сценарий | Статус | Нормативная проверка | Что наблюдается |
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
| 10 | [DECK-01](../nemesis/tools/audit.test.mjs#L134) | **PASS** | Queen Health: 14 физических карт с правильными копиями | Проходит после исправления. **Было:** 9 карт; q1repel/q2malf/q2act по 1 вместо 2/3/3. |
| 11 | [ACT-01](../nemesis/tools/audit.test.mjs#L141) | **PASS** | Room Action стоит 2 Action cards по Dashboard | Проходит после исправления. **Было:** Возвращается стоимость 1. |
| 12 | [ACT-02](../nemesis/tools/audit.test.mjs#L145) | **PASS** | Computer и Pick Up недоступны в Combat | Проходит после исправления. **Было:** Оба действия разрешены; сравнивается snapshot двух flags. |
| 13 | [HP-01](../nemesis/tools/audit.test.mjs#L153) | **PASS** | 10 потерь HP из первой клетки достигают черепа | Проходит после исправления. **Было:** Персонаж остаётся active при HP0. |
| 14 | [QUEUE-01](../nemesis/tools/audit.test.mjs#L157) | **PASS** | Archives: Knowledge reward разрешается раньше следующего действия | Проходит после исправления. **Было:** Knowledge стало 3, но prompt — уже меню хода, не выбор Field Data. |
| 15 | [QUEUE-02](../nemesis/tools/audit.test.mjs#L163) | **PASS** | Queen Health после Crit до следующего действия | Проходит после исправления. **Было:** Queen deck ещё не уменьшилась; обязательный шаг позади меню. |
| 16 | [QUEUE-03](../nemesis/tools/audit.test.mjs#L170) | **PASS** | Третий Heavy Item немедленно вызывает освобождение руки | Проходит после исправления. **Было:** Три предмета и уже turn prompt. |
| 17 | [COMBAT-01](../nemesis/tools/audit.test.mjs#L175) | **PASS** | Larva Attack допускает Nerves of Steel | Проходит после исправления. **Было:** Larva уже заражает до нужного reaction prompt. |
| 18 | [COMBAT-02](../nemesis/tools/audit.test.mjs#L182) | **PASS** | Blood Sense: Drone следует за выходящим Character | Проходит после исправления. **Было:** Character переместился, Drone остался в исходной комнате. |
| 19 | [CARD-01](../nemesis/tools/audit.test.mjs#L190) | **PASS** | My Little Friend: burst доходит до Shoot | Проходит после исправления. **Было:** После burst нет dice prompt; нормальная стрельба не начинается. |
| 20 | [COST-01 · mechanic.duckAndCover](../nemesis/tools/audit.test.mjs#L202) | **PASS** | Напечатанная дополнительная карта платится ровно один раз | Проходит после исправления. **Было:** После первой доплаты снова предлагается cards prompt вместо продолжения эффекта. |
| 21 | [COST-01 · mechanic.technicalCorridors](../nemesis/tools/audit.test.mjs#L202) | **PASS** | Напечатанная дополнительная карта платится ровно один раз | Проходит после исправления. **Было:** После первой доплаты снова предлагается cards prompt вместо продолжения эффекта. |
| 22 | [COST-01 · labrat.feelOfDark](../nemesis/tools/audit.test.mjs#L202) | **PASS** | Напечатанная дополнительная карта платится ровно один раз | Проходит после исправления. **Было:** После первой доплаты снова предлагается cards prompt вместо продолжения эффекта. |
| 23 | [COST-01 · sentry.facilityTour](../nemesis/tools/audit.test.mjs#L202) | **PASS** | Напечатанная дополнительная карта платится ровно один раз | Проходит после исправления. **Было:** После первой доплаты снова предлагается cards prompt вместо продолжения эффекта. |
| 24 | [COST-01 · scout.scavenging](../nemesis/tools/audit.test.mjs#L202) | **PASS** | Напечатанная дополнительная карта платится ровно один раз | Проходит после исправления. **Было:** После первой доплаты снова предлагается cards prompt вместо продолжения эффекта. |
| 25 | [COST-02](../nemesis/tools/audit.test.mjs#L214) | **PASS** | Repairs: убрать Malfunction требует дополнительный discard | Проходит после исправления. **Было:** Поломка удаляется, дополнительная карта остаётся в руке. |
| 26 | [CARD-02](../nemesis/tools/audit.test.mjs#L221) | **PASS** | Computer Skills исполняет Room Action | Проходит после исправления. **Было:** В Comms не отправляется Signal; вызывается Computer Action. |
| 27 | [CARD-03](../nemesis/tools/audit.test.mjs#L226) | **PASS** | У CEO 12 исходных Action cards | Проходит после исправления. **Было:** Определено только 10; нет Just One More Thing и Stop It!. |
| 28 | [CARD-04](../nemesis/tools/audit.test.mjs#L229) | **PASS** | Convict Duck and Cover имеет redirect-реакцию | Проходит после исправления. **Было:** Окно duck не предлагается. |
| 29 | [CARD-05](../nemesis/tools/audit.test.mjs#L235) | **PASS** | Deactivation решается после раскрытия Attack card | Проходит после исправления. **Было:** Attack deck ещё не потеряла верхнюю карту на момент решения. |
| 30 | [ROOM-01](../nemesis/tools/audit.test.mjs#L241) | **PASS** | Surgery сбрасывает также clean Action deck | Проходит после исправления. **Было:** Чистая карта остаётся в deck. |
| 31 | [ROOM-02](../nemesis/tools/audit.test.mjs#L248) | **PASS** | Laboratory принимает Character Corpse как Human Corpse | Проходит после исправления. **Было:** roomActionAvailable запрещает анализ. |
| 32 | [ROOM-03](../nemesis/tools/audit.test.mjs#L253) | **PASS** | Airlock убивает только в конце Player Phase | Проходит после исправления. **Было:** Другой Character погибает сразу. |
| 33 | [ROOM-04](../nemesis/tools/audit.test.mjs#L259) | **PASS** | Server допускает Room Action удалённой комнаты с Malfunction | Проходит после исправления. **Было:** Signal в Comms с Malfunction не отправляется. |
| 34 | [ROOM-05](../nemesis/tools/audit.test.mjs#L265) | **PASS** | На Laboratory 3 Green icons | Проходит после исправления. **Было:** В данных только 2. |
| 35 | [ROOM-06](../nemesis/tools/audit.test.mjs#L268) | **PASS** | На Archives 3 Red icons | Проходит после исправления. **Было:** В данных 1 Yellow. |
| 36 | [COMPUTER-01](../nemesis/tools/audit.test.mjs#L271) | **PASS** | Lock-down срабатывает немедленно при раскрытии после Computer Action | Проходит после исправления. **Было:** В комнате нет требуемой Malfunction, карта остаётся отложенной. |
| 37 | [COMPUTER-02](../nemesis/tools/audit.test.mjs#L278) | **PASS** | Доплату Computer B можно оплатить лишь Action card | Проходит после исправления. **Было:** В cards prompt включена Contamination. |
| 38 | [ITEM-01](../nemesis/tools/audit.test.mjs#L283) | **PASS** | Medkit может одновременно убрать Wound и дать 3 HP | Проходит после исправления. **Было:** После выбора лечения Wound нет дополнительного восстановления HP. |
| 39 | [ITEM-02](../nemesis/tools/audit.test.mjs#L291) | **PASS** | Grenade Launcher заменяет normal Shoot специальным эффектом | Проходит после исправления. **Было:** Предлагается режим normal. |
| 40 | [ITEM-03](../nemesis/tools/audit.test.mjs#L296) | **PASS** | Armory не может заряжать Grenade Launcher без Grenade | Проходит после исправления. **Было:** Пустой Launcher получает ammo. |
| 41 | [ITEM-04](../nemesis/tools/audit.test.mjs#L301) | **PASS** | Sniper Rifle позволяет basic Shoot при цели только nearby | Проходит после исправления. **Было:** Пункт Shoot выключен. |
| 42 | [ITEM-05](../nemesis/tools/audit.test.mjs#L306) | **PASS** | Assault Rifle: natural 2 остаётся Crit после Agile | Проходит после исправления. **Было:** Adult остаётся на поле. |
| 43 | [ITEM-06](../nemesis/tools/audit.test.mjs#L312) | **PASS** | Assault Rifle: natural 2 работает против Queen | Проходит после исправления. **Было:** queen.card не поставлен. |
| 44 | [ITEM-07](../nemesis/tools/audit.test.mjs#L318) | **PASS** | Xeno Field Experience: normal Hit требует Combat kill-check | Проходит после исправления. **Было:** Нет dice prompt, происходит возврат в меню. |
| 45 | [ITEM-08](../nemesis/tools/audit.test.mjs#L323) | **PASS** | Hardened Armor: замена Wound на −2 HP добровольна | Проходит после исправления. **Было:** Нет окна выбора, замена выполнена автоматически. |
| 46 | [ITEM-09](../nemesis/tools/audit.test.mjs#L328) | **PASS** | Heavily Injured Character не может получить Armor | giveItem не надевает запрещённую Armor. |
| 47 | [FEAT-01](../nemesis/tools/audit.test.mjs#L333) | **PASS** | Overpower игнорирует Fearless | Проходит после исправления. **Было:** Intruder остаётся в своей комнате. |
| 48 | [FEAT-02](../nemesis/tools/audit.test.mjs#L339) | **PASS** | Breach игнорирует дополнительный Action-card cost | Проходит после исправления. **Было:** По-прежнему появляется cards prompt. |
| 49 | [EVENT-01](../nemesis/tools/audit.test.mjs#L345) | **PASS** | The Queen Awakens не превышает доступный Queen token pool | Проходит после исправления. **Было:** Из 2 Queen tokens в мешке становится 5 при общем доступном количестве 3. |
| 50 | [INV-01](../nemesis/tools/audit.test.mjs#L350) | **PASS** | Чужие обычные Light Items не раскрываются в view | Проходит после исправления. **Было:** В JSON другого игрока видно stimulants. |
| 51 | [INV-02](../nemesis/tools/audit.test.mjs#L355) | **PASS** | Два выбираемых Objectives не раскрываются другому игроку | Проходит после исправления. **Было:** В чужом view есть options с обоими вариантами. |
| 52 | [INV-03](../nemesis/tools/audit.test.mjs#L361) | **PASS** | Secret Engine Status отсутствует в чужом prompt title | Проходит после исправления. **Было:** Заголовок содержит ИСПРАВЕН/ПОВРЕЖДЁН. |
| 53 | [INV-04](../nemesis/tools/audit.test.mjs#L366) | **PASS** | Получатель Heavy Object соблюдает Hand limit | Проходит после исправления. **Было:** У получателя 3 занятых слота без его capacity prompt. |
| 54 | [INV-05](../nemesis/tools/audit.test.mjs#L372) | **PASS** | Cannot be discarded защищает Laika от Drop | Проходит после исправления. **Было:** Laika есть среди вариантов свободного Drop. |
| 55 | [ANDROID-01](../nemesis/tools/audit.test.mjs#L377) | **PASS** | Synthetic: Scan, infected −1 HP, убрать Contamination и Draw replacement | Проходит после исправления. **Было:** HP остаётся 10, в руке Contamination вместо заменяющей Action card. |
| 56 | [ANDROID-02](../nemesis/tools/audit.test.mjs#L383) | **PASS** | Synthetic: Android не заражается Larva | Проходит после исправления. **Было:** p.larva становится true. |
| 57 | [ANDROID-03](../nemesis/tools/audit.test.mjs#L388) | **PASS** | UPS: попытка reshuffle при 0 markers смертельна | Проходит после исправления. **Было:** Android остаётся active. |
| 58 | [START-01](../nemesis/tools/audit.test.mjs#L393) | **PASS** | Начальные markers Cuffs/Robot/UPS: 6/5/3 | Проходит после исправления. **Было:** Snapshot: 3/3/2. |
| 59 | [START-02](../nemesis/tools/audit.test.mjs#L397) | **PASS** | Android Gun requires no ammo | Проходит после исправления. **Было:** noAmmo flag отсутствует, оружие обычное зарядное. |
| 60 | [START-03](../nemesis/tools/audit.test.mjs#L400) | **PASS** | Smart Gun — reroll, не постоянный +1 | Проходит после исправления. **Было:** Snapshot: reroll=false, plusOne=true. |
| 61 | [START-04](../nemesis/tools/audit.test.mjs#L404) | **PASS** | Sentry начинает со своего SMG: max5, optional +ammo → Hit | Проходит после исправления. **Было:** Snapshot: max3, нет SMG boost. |
| 62 | [START-05](../nemesis/tools/audit.test.mjs#L410) | **PASS** | Robot даёт CEO стартовый Body Wound | Проходит после исправления. **Было:** Body Wound отсутствует. |
| 63 | [QUEST-01](../nemesis/tools/audit.test.mjs#L414) | **PASS** | Tools предлагает активацию исходного Quest Item | Проходит после исправления. **Было:** В стартовом flow Soldier нет такой опции; оригинальная Quest-модель отсутствует. |
| 64 | [END-01](../nemesis/tools/audit.test.mjs#L420) | **PASS** | Последний Hibernation немедленно завершает игру | Проходит после исправления. **Было:** После него в журнале появляется Event Phase; используется существующий Event ID. |
| 65 | [END-02](../nemesis/tools/audit.test.mjs#L426) | **PASS** | Ship destruction помечает Nest destroyed для Objectives | Проходит после исправления. **Было:** nestDestroyed не выставлен. |
| 66 | [END-03](../nemesis/tools/audit.test.mjs#L430) | **PASS** | Финальная Larva разрешается через нормальную Eclosion | Проходит после исправления. **Было:** В проверенном безопасном reference draw персонаж должен выжить, но game.end делает dead. |
| 67 | [OBJ-01](../nemesis/tools/audit.test.mjs#L443) | **PASS** | Pursuit of Science требует max Knowledge 8 | Проходит после исправления. **Было:** Knowledge 7 при максимуме среди игроков 7 ошибочно засчитывается. |
| 68 | [OBJ-02](../nemesis/tools/audit.test.mjs#L447) | **PASS** | Ab Ovo: достаточно глобально проанализированного Egg | Проходит после исправления. **Было:** При анализе другим Character цель владельца false. |
| 69 | [OBJ-03](../nemesis/tools/audit.test.mjs#L451) | **PASS** | BFF наследует явно напечатанную non-Earth safety друга | Проходит после исправления. **Было:** BFF погибает на Venus, хотя Highest Bidder-друг в Hibernation защищён. |
| 70 | [MAP-01](../nemesis/tools/audit.test.mjs#L461) | **PASS** | Original board содержит 8 напечатанных Tech Entrances | Проходит после исправления. **Было:** Кодовый набор из 7 других позиций не совпадает. |
| 71 | [MAP-02](../nemesis/tools/audit.test.mjs#L466) | **PASS** | Original corridor Cockpit 001 →002 имеет номер 3 | Проходит после исправления. **Было:** Код назначает 1. |
| 72 | [PHASE-01](../nemesis/tools/audit.test.mjs#L469) | **PASS** | Intruder Attacks идут сверху вниз по полю | Проходит после исправления. **Было:** При 005 выше 001 первой поставлена атака комнаты 001 из-за сортировки ID. |
| 73 | [EVENT-02](../nemesis/tools/audit.test.mjs#L475) | **PASS** | Breaking In сначала ставит только свежий Tech Noise | Проходит после исправления. **Было:** В тот же раз добавлен nearby Corridor Noise. |
| 74 | [EVENT-03](../nemesis/tools/audit.test.mjs#L482) | **PASS** | Bulkheads Open без Action cards вызывает Encounter | Проходит после исправления. **Было:** Поставлен noise.roll вместо encounter. |
| 75 | [EVENT-04](../nemesis/tools/audit.test.mjs#L487) | **PASS** | Только Contamination означает отсутствие Action cards | Проходит после исправления. **Было:** Нужный Encounter не поставлен. |
| 76 | [EVENT-05](../nemesis/tools/audit.test.mjs#L492) | **PASS** | Egg Protection: Drone один на комнату с Eggs | Проходит после исправления. **Было:** В комнате двух Egg-carrying Characters появляются два Drone. |
| 77 | [EVENT-06](../nemesis/tools/audit.test.mjs#L498) | **PASS** | Конкретный Event tie-break считает только Action cards | Проходит после исправления. **Было:** Персонаж с 2 Contamination проигрывает выбор цели персонажу с 1 Action card. |
| 78 | [FEAT-03](../nemesis/tools/audit.test.mjs#L507) | **PASS** | Conviction: Queen Crit разрешает Queen Health | Проходит после исправления. **Было:** Queen удаляется, Queen deck не используется. |
| 79 | [ITEM-10](../nemesis/tools/audit.test.mjs#L512) | **PASS** | Grenade Launcher наносит Crit каждому Intruder | Проходит после исправления. **Было:** Adult остаётся на поле после 1 Hit. |
| 80 | [ITEM-11](../nemesis/tools/audit.test.mjs#L517) | **PASS** | Perimeter prevention стоит 1 Action card | Проходит после исправления. **Было:** Рука не уменьшилась и оплаты нет; тратится придуманный заряд. |
| 81 | [INV-06](../nemesis/tools/audit.test.mjs#L523) | **PASS** | Передача требует согласия получателя | Проходит после исправления. **Было:** Object уже передан, prompt получателю не показан. |
| 82 | [OK-10](../nemesis/tools/audit.test.mjs#L528) | **PASS** | Energy Charge заряжает именно 3 ammo | Пустое оружие получает 3, как на оригинале. |
| 83 | [INV-07](../nemesis/tools/audit.test.mjs#L534) | **PASS** | Публичные setup-параметры не должны раскрывать secret | Проходит после исправления. **Было:** Повторный createGame с public seed воспроизводит secret полностью. |
| 84 | [OK-11](../nemesis/tools/audit.test.mjs#L543) | **PASS** | Careful Move исключает полностью Noisy destination | При Noise во всех Corridors/Tech room prompt выбора назначения не предлагается. |
| 85 | [NOISE-01](../nemesis/tools/audit.test.mjs#L549) | **PASS** | Danger: eligible Intruder ломает Door без лишнего Noise | Проходит после исправления. **Было:** Door destroyed, но дополнительно появляется Noise вокруг; eligibility не равна успешному входу. |
| 86 | [OK-12](../nemesis/tools/audit.test.mjs#L558) | **PASS** | Четыре Field Data уже имеют централизованную доплату | У Evasive/Hunker/Quick Hands/Reposition первоначальный cards prompt имеет min=max=1. |
| 87 | [FD-01](../nemesis/tools/audit.test.mjs#L568) | **PASS** | Safety in Numbers требует другого Character, а не нехватки оплаты | С четырьмя оплачиваемыми картами запрещено одному и разрешено вдвоём в комнате. |
| 88 | [FD-02](../nemesis/tools/audit.test.mjs#L575) | **PASS** | Rapid Response включает Computer как basic one-card Action | Проходит после исправления. **Было:** В списке нет computer. |
| 89 | [MAP-03](../nemesis/tools/audit.test.mjs#L582) | **PASS** | Coordinates: все 8 печатных схем назначения | Проходит после исправления. **Было:** Есть 4 схемы; только coordA совпадает с одной из 8 напечатанных. |
| 90 | [ITEM-12](../nemesis/tools/audit.test.mjs#L625) | **PASS** | Sonic Gun: особый результат ставит поломку, а не шум | Проверено по скану `ItemDeck_Support.png`. |
| 91 | [ITEM-13](../nemesis/tools/audit.test.mjs#L632) | **PASS** | Tactical Hatchet: 2 ранения вместо броска и оранжевый жетон | Скан подтверждает «Deal 2 Hits instead of rolling the Combat die». |
| 92 | [CEO-01](../nemesis/tools/audit.test.mjs#L598) | **PASS** | Just One More Thing: после паса добор 1 и дополнительный ход | Карта сбрасывается из игры, затем обязательный пас. |
| 93 | [CEO-02](../nemesis/tools/audit.test.mjs#L612) | **PASS** | Stop It!: отмена эффектов раскрытой карты атаки | Карта убирается из игры. |
| 94 | [START-06](../nemesis/tools/audit.test.mjs#L639) | **PASS** | Smart Gun: переброс — решение игрока, второй результат окончателен | Проверено по скану `ItemDeck_Support.png`. |
| 95 | [END-04](../nemesis/tools/audit.test.mjs#L443) | **PASS** | Конец игры не зацикливается, пока ждёт выбора цели | Регрессия на зависание в fuzz: автоматический `game.end` больше не сбрасывает ожидающий prompt. |

## 5. Границы

- PASS подтверждает ровно перечисленное условие. Например, `OK-08` сравнивает Adult-ветки двух Tail-вариантов, а не все реакции/Drone/Queen-сочетания Attack deck.
- `OK-12` подтверждает наличие первоначальной оплаты; не подменяет тесты полного эффекта этих четырёх Field Data.
- `FD-01` проверяет availability через обычное меню, а не умышленный прямой вызов внутреннего handler с нарушенными preconditions.
- Fixture `END-03` проверяет отсутствие Contamination в эталонных четырёх картах **до** сравнения с текущим game.end.
- Зелёный suite не означает полного соответствия: покрыты 95 прогонов (90 объявленных сценариев, часть в цикле). Активированные стороны части Quest Items, редкие сочетания реакций, весь браузерный и сетевой путь по-прежнему вне этой выборки — см. [NEMESIS_FIX_REPORT.md](NEMESIS_FIX_REPORT.md), раздел «Что осталось».
- Новые `MAP-03` и агрегированные snapshots добавлены после первоначального набора 88 проверок. Исторический результат — **89/14/75**, текущий — **89/89 PASS**.
- Временные OCR, зависимости распознавания и журналы прогонов находятся в локальном `.cache/audit/`, не добавлены в Git и не требуются для запуска test suite. Полный список результатов сохранён здесь; кэш не является единственной копией отчёта.
- Все прежние FAIL переведены в PASS без изменения нормативного ожидания. Для веток R/U из карточной матрицы нужны новые сценарии, а для C — сначала решение о приоритете источников (см. [NEMESIS_FIX_REPORT.md](NEMESIS_FIX_REPORT.md), §4).
