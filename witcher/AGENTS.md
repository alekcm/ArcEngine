# witcher/ — карта для агента

Порт «Ведьмак: Старый мир». Источник правды о правилах и компонентах — `Witcher/**/*.md`
(книги правил с якорями `#page-N`, карты, монстры, поле). Ничего не выдумывать: если правило
не покрыто книгой — решение пишется в `docs/witcher/02-decisions.md` и в комментарий у кода.

```
server.mjs              HTTP + WebSocket (свой RFC 6455), комната, лобби, боты, отмена (снимки),
                        сохранения (witcher/saves, не в git), переподключение по токену,
                        /models/<id>.json — OBJ из Witcher/ → прорежённый меш, /art-index.json
witcher.bat             запуск (Windows); корневой ../witcher.bat вызывает его
shared/data/gen-data.mjs   ГЕНЕРИРУЕТСЯ tools/import.mjs из md — руками не править
shared/data/rules-data.mjs таблицы правил (стартовые ресурсы, ряд, школы, локации), режимы и правила стола
shared/data/events-gen.mjs  ГЕНЕРИРУЕТСЯ tools/events-gen.mjs из Witcher/События/*.md — руками не править
shared/data/events-data.mjs карты исследования: язык эффектов (шапка файла), OVERRIDES поверх генерации
shared/engine/          правила (чистые функции над JSON-состоянием, ГСЧ в состоянии):
  core.mjs              apply(state, seat, cmd), options(state, seat) с причинами, actingSeat
  flow.mjs              очередь шагов state.queue {op,...}, ask() → state.prompt
  setup.mjs turn.mjs    подготовка; ход, навыки, перемещение, локации, медитация, фаза III, покер
  fight.mjs effects.mjs битва с монстром, эликсиры, специализации, трофеи, снаряжение/спутники
                        (hasGear, keepOf, GEAR_MOVES, ACTIVE_EFFECTS в effects.mjs)
  explore.mjs           исследование, задания, карты событий (срез: данные в data/events-data.mjs)
shared/view.mjs         вид для места: скрытая информация вырезается на сервере
shared/bots.mjs         боты видят только свой вид и действуют через тот же apply()
client/                 браузер: app.js (связь, события, клавиши), board.js (Babylon: поле,
                        миниатюры, камера), hud.js, prompt.js, fight.js, poker.js, lobby.js,
                        cards.js (лица карт; арт — client/art/<ID>.*, иначе заглушка), icons.js (SVG),
                        sound.js (процедурный звук), store.js (Store — не localStorage напрямую),
                        toon.js (плоский цвет + тушь по выпуклым рёбрам), fonts/ (OFL, LICENSE.md)
client/assets/cards/    рамки, медальоны, глифы, пергамент — вырезаны tools/frames.mjs из сканов
client/assets/continent.jpg  поле (вырезано из Witcher/Прочее/Игровой стол.jpg)
tools/check.mjs         ЕДИНЫЕ ВОРОТА — гонять перед коммитом
tools/rules.test.mjs    аудит правил со ссылками на страницы + партии ботов 1–5 игроков
tools/explore.test.mjs  исследование/задания/снаряжение, уникальность карт, карты битвы
tools/modes.test.mjs    режимы партии и правила стола
tools/gear.test.mjs     снаряжение, спутники, карты «перед собой», «навык × 2», комбинация из события
tools/events-gen.mjs    md → events-gen.mjs; -v — неподдержанные карты; --check — свежесть (в воротах)
tools/frames.mjs        разовая нарезка лиц карт из сканов (нужен sharp, не зависимость игры)
tools/sim.mjs           партии ботов: node witcher/tools/sim.mjs [игр] [игроков] (MODE=mmr — все правила стола)
tools/scenarios.mjs     песочницы (битва, покер, исследование, снаряжение, середина партии) — в лобби как сохранения
tools/import.mjs obj.mjs  импорт md → данные; OBJ → меш
```

Правила кода: комментарии по-английски, строки интерфейса по-русски; без эмодзи (в UI —
только SVG из icons.js); клиент не решает правила — только показывает `options` и шлёт команды;
каждая недоступная кнопка показывает причину (`btn({why})`).
