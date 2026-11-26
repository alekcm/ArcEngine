# data/ — тестовые материалы «Fall of Avalon» в Markdown + JSON

Полная конвертация содержимого `Mods/` (правила, книги, письма, карты, 3D)
в формат, удобный для работы и портирования на компьютер.

## Структура

```
data/
  rules/rulebook.md            Правила игры (24 стр., текстовый слой + OCR)
  books/research-journal.md    Журнал исследований (76 стр., OCR разворотов)
  books/book-of-secrets.md     Книга секретов (22 стр., текстовый слой + OCR)
  letters/{ailey,arev,beor,maggot,niamh}.md   5 писем персонажей
  cards/index.json             все 1528 карточек: OCR-текст, размеры, вид,
                               обороты, номера, sha1
  3d/models/*.obj              9 мешей из assetbundles
  3d/textures/*.png            9 текстур (2048×2048, counter 16×32)
  3d/assetbundles.json         инвентарь бандлов (beor…best2 → counter)
  3d/obj-index.json            2 OBJ из Mods/Models (mtllib_missing: true)
  manifest.json                источники (sha1 PDF/изображений) + статистика
  _scripts/                    пайплайн воспроизведения (см. ниже)
```

## Пайплайн (`_scripts/`)

Все прогоны идут во временный каталог `/tmp/ocrprep/` (не в git);
`results.jsonl` — общий журнал, дополняется, никогда не чистится.

1. **prep** — `python3 _scripts/prep_ocr.py`
   Индексирует PDF (sorted: [0] rulebook, [1..5] письма, [6] secrets),
   извлекает страницы/карты, пишет `jobs.json` (1745 заданий: book 170,
   alt 37, letter 10, card 1528) и `texts.json` (37 страниц с текстовым слоем).
   Требует `/tmp/rarout/*.pdf` — PDF «Журнала исследований», извлечённый
   из `Mods/PDF/*.part1.rar` (unrar).
2. **OCR** — `node _scripts/run_ocr.mjs [jobs.json]`
   tesseract.js (rus, 2 воркера), PSM по группам (book/alt/card 3, letter 4),
   цифровые группы — whitelist. Возобновляемый: уже выполненные id
   пропускаются, строки дописываются в `results.jsonl`.
3. **retry** — `python3 _scripts/build_data.py --prep-retry` →
   `node _scripts/run_ocr.mjs /tmp/ocrprep/retry_jobs.json`
   Пустые карты первого прохода: апскейл 1.5×, psm 3.
   Приём: conf ≥ 55 и ≥ 15 кириллицы символов.
4. **числа** — `python3 _scripts/build_data.py --prep-num` →
   прогон трёх вариантов `num_/num2_/num3_jobs.json`
   (инверсия+3× NEAREST+MaxFilter psm7 / content-crop psm3 / psm3).
   Все три варианта сохраняются; `best_number()` предпочитает num3_,
   иначе максимум conf; digit-only и conf ≥ 60.
5. **сборка** — `python3 _scripts/build_data.py`
   Пишет books/letters/cards/obj-index/manifest (см. структуру).
6. **3D** — `python3 _scripts/extract_3d.py`
   UnityPy: Mesh → OBJ, Texture2D → PNG; ключи инвентаря — m_Name
   AssetBundle; бандл `best2` (BestCoinEver2) сохраняётся как `counter`.

Проверка репозитория: `node tools/check.mjs` (tsc ×2 + `node --test`).

## Форматы

- **Книги** — `# Заголовок`, шапка с источником, `## Страница N`,
  абзацы через пустую строку. Обложка rulebook (p1) — ручная
  транскрипция (`transcribed`), остальные страницы `text-layer`
  или `ocr-spread` (левая+правая половины разворота).
- **Письма** — якоря в текстовом слое rulebook (`text-layer`) либо
  лучший OCR-вариант `letter{n}_{tag}` (`ocr`), conf в шапке.
- **cards/index.json** — `cards[c_id] = {file, width, height, kind,
  sha1, back, number, ocr:{conf, text, method}}`.
  `method`: `main` | `retry` | `transcribed` (обороты по dhash-кластерам
  ≥10: БОЙ/ДИПЛОМАТИЯ/ПРЕДМЕТ/ВСТРЕЧА).
  `kind` — по размеру изображения (card 1100, item-card 284,
  location 132, character-sheet 6, print-sheet 4, map 1, checklist 1).
- **manifest.json** — sha1 всех PDF и агрегаты по изображениям/бандлам.

## Идентификаторы (контракт prep ↔ build)

| сущность | id |
|---|---|
| карта | `c_{stem[-40:]}` |
| retry | `retry_c_{stem[-40:]}` |
| число | `num_`/`num2_`/`num3_` + `{stem[-40:]}` |
| страница книги | `{key}_p{nnn}[_L\|_R\|_ALT]`, key ∈ rulebook\|secrets\|journal |
| письмо | `letter{n}_{tag}`, n = 1..5 (pdf_idx) |
