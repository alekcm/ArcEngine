# Эталонное распознавание боевых значков

Это не OCR и не автоматический поиск значков на листе. Положения значков размечаются вручную
(`x, y, w, h`), а код распознаёт только вырезанный значок: тип носителя и глиф внутри.

## Эталоны

`references.json` и PNG-кропы рядом с ним — 36 эталонов только из пяти доверенных фракций:
Имперская гвардия, Некроны, Тираниды, Эльдары, Космодесант Хаоса. Для каждого эталона указаны
исходный лист, координаты кропа, SHA-256 листа, метка и место (`column` или `text`).
Карты проверяемых фракций (Орки, Тау, Космодесант, Адептус Механикус, Инквизиция, Тёмные эльдары, Сестры битвы) в эталоны не входят.

Различаются девять записей: `att. icon`, `def. icon`, `morale icon`, `att. token`, `def. token`,
`att. cube`, `def. cube`, `morale cube`, `any cube`. Жетонов морали в этой схеме нет.

## Команды

```bash
# Перекрёстная проверка: целая фракция исключается из эталонов.
node tools/combat-icons.mjs validate

# Один значок.
node tools/combat-icons.mjs classify --image scan.png --box x,y,w,h --location text

# Сверка размеченной колоды с ожидаемой транскрипцией.
node tools/combat-icons.mjs audit --manifest docs/forbidden-stars/combat-icons/orks.json --out build/combat-review/orks-audit
node tools/combat-icons.mjs audit --manifest docs/forbidden-stars/combat-icons/tau.json --out build/combat-review/tau-audit
node tools/combat-icons.mjs audit --manifest docs/forbidden-stars/combat-icons/tau-orders.json --out build/combat-review/tau-orders-audit
node tools/combat-icons.mjs audit --manifest docs/forbidden-stars/combat-icons/space-marines.json --out build/combat-review/space-marines-audit
node tools/combat-icons.mjs audit --manifest docs/forbidden-stars/combat-icons/mechanicus.json --out build/combat-review/mechanicus-audit
node tools/combat-icons.mjs audit --manifest docs/forbidden-stars/combat-icons/inquisition.json --out build/combat-review/inquisition-audit
node tools/combat-icons.mjs audit --manifest docs/forbidden-stars/combat-icons/dark-eldar.json --out build/combat-review/dark-eldar-audit
node tools/combat-icons.mjs audit --manifest docs/forbidden-stars/combat-icons/sisters-of-battle.json --out build/combat-review/sisters-audit
```

`audit` пишет `report.json` и кропы значков. Ожидаемая метка (`expected`) используется только для
сравнения с результатом и не подаётся классификатору. Неизвестный или неоднозначный значок
возвращает `?` и код выхода 2; несовпадение в `audit` — код выхода 1.

Настоящие PNG читаются самим Node без внешних пакетов. JPEG (включая JPEG-данные с расширением
`.png`) требует ImageMagick (`magick`/`convert` + `identify`).

## Проверенный объём

- Эталоны: 36/36 при исключении целой фракции.
- Орки: 14 карт (12 на двух листах + 2 отдельных фото владельца), 58 вручную размеченных значков;
  58/58 совпали с ожидаемой транскрипцией.
- Тау, улучшения приказов: 5 карт, 3 значка на листе `Тау/Карти наказів (3).jpg`; 3/3 совпали.
  Манифест `tau-orders.json` отделён от боевых карт.
- Тау: 27 отпечатанных карт (14 разных названий), 119 вручную размеченных значков; 119/119 совпали.
  Повторные копии проверены отдельно, чтобы не потерять текстовые редакции.
- Космодесант: 14 карт (9 на отдельном листе + 5 на `0003.png`), 68 вручную размеченных значков;
  68/68 совпали. Листы не дублируют друг друга.
- Адептус Механикус: 28 отпечатанных карт (14 на отдельном листе + 14 на сводном листе в другом
  переводе), 156 вручную размеченных значков; 156/156 совпали. Версии сохранены раздельно.
- Инквизиция: 14 карт на составном листе `E5DE7E8B…_2.png` (ряды 2–3), 73 вручную размеченных
  значка; 73/73 совпали. Копия листа в папке Сестёр битвы не считается отдельным источником.
- Тёмные эльдары: 14 карт на составном листе `5DD5794E…_1.png` (ряды 3–5), 76 вручную размеченных
  значков; 76/76 совпали.
- Сестры битвы: 15 карт (4 актуальных улучшения на фото `Боевые карты/Сестры-Инквизиция-актуальные.png`,
  10 на составном листе `5DD5794E…_1.png` и «Лицеприятная кара» на листе приказов `DDDD2EC8…`),
  80 вручную размеченных значков; 80/80 совпали.
- Это проверка на данном наборе кропов, а не измеренная точность на произвольных сканах.

Носитель различается не только заполненностью углов: у пустого кубика считаются замкнутые
области бумаги (три грани), что отделяет толстый контур `any cube` от бледного жетона.
