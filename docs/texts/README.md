# Тексты Nemesis: как искать

Этот каталог помогает найти правила и карточки, содержащиеся в изображениях или PDF. **Оригинальная игра, фанатский Redux, дополнения и правила движка — не одно и то же.** Сначала определите нужную редакцию, потом ищите текст; не переносите правила из одной редакции в другую без проверки.

| Вопрос / источник | Где искать | Состояние |
|---|---|---|
| Правила Nemesis: Redux, 25 страниц | [RULEBOOK_REDUX_EN.md](RULEBOOK_REDUX_EN.md) | Расшифровка английского текста; полная независимая сверка ещё нужна. |
| Оригинальные русские правила и «Последствия» | [RULES_ORIGINAL_RU_OCR.md](RULES_ORIGINAL_RU_OCR.md), [пояснение об охвате](RULES_ORIGINAL_RU.md) | Новый OCR по колонкам заметно читабельнее старого, но не проверен и может пропустить текст и значки. Сверяйтесь со сканами. |
| Карноморфы — русские правила | [RULES_CARNOMORPHS_RU.md](RULES_CARNOMORPHS_RU.md) | Извлечена текстовая подложка PDF; расположение колонок и отдельные символы могут быть неверны. |
| Кошмары / Сеятели Пустоты — русские правила | [RULES_VOIDSEEDERS_RU.md](RULES_VOIDSEEDERS_RU.md) | Извлечена текстовая подложка PDF; стр. 7 — иллюстрация. |
| Карноморфы в Redux | [RULEBOOK_CARNOMORPHS_REDUX_EN.md](RULEBOOK_CARNOMORPHS_REDUX_EN.md) | Текст страниц PDF перенесён с изображения; полной независимой проверки нет. Черновой OCR: [PDF_OCR.md](PDF_OCR.md). |
| Хитриды / Lockdown — правила | [RULES_CHYTRIDS_RU_OCR.md](RULES_CHYTRIDS_RU_OCR.md), [состав дополнения](CHYTRIDS_COMPONENTS_RU.md) | Стр. 2–9: OCR по колонкам, не проверен; состав на стр. 3 перенесён вручную. Сканы стр. 10–16 в папке отсутствуют. |
| Хитриды / Lockdown — карты | [атаки и уязвимости](CHYTRIDS_ATTACK_WEAKNESS_RU.md), [события](CHYTRIDS_EVENTS_RU.md) | Тексты перенесены вручную, но значки и полосы движения не полностью расшифрованы; сверьте с изображением. |
| Русские карты оригинала и дополнений | [CARDS_RU_OCR.md](CARDS_RU_OCR.md), [мутации и уязвимости дополнений](CARDS_EXPANSIONS_RU_CHECKED.md), [атаки оригинала](CARDS_ORIGINAL_ATTACKS_RU.md), [слабости оригинала](CARDS_ORIGINAL_WEAKNESSES_RU.md) | OCR 222 отдельных карточек без проверки; часть листов дополнительно перенесена вручную. Цифры и значки требуют сверки. |
| Печатные листы колод | [SHEETS_KOLODY.md](SHEETS_KOLODY.md) | Непроверенный OCR 77 изображений из `Nemesis/Колоды/`. |
| Печатные листы дополнений | [SHEETS_DLC.md](SHEETS_DLC.md), [SHEETS_RU.md](SHEETS_RU.md) | Непроверенный OCR 36 изображений из `Nemesis/dlc/`; `SHEETS_RU.md` дополнительно использует кириллическую модель для выбранных листов. |
| Оригинальная игра, комнаты и тайлы | [SHEETS_ORIGINAL_BOARDS.md](SHEETS_ORIGINAL_BOARDS.md) | Непроверенный OCR 87 изображений из соответствующих каталогов. |
| Модели | [SHEETS_MODELS.md](SHEETS_MODELS.md) | Непроверенный OCR 8 изображений; изображения могут содержать только графику. |
| Что делают карты в приложении | [NEMESIS_CARD_TEXTS.md](../NEMESIS_CARD_TEXTS.md), [NEMESIS_DLC_REFERENCE.md](../NEMESIS_DLC_REFERENCE.md) | Справочники из данных движка, а не гарантированно дословный текст оригинальных карт. |
| Сверка карт движка с печатными | [NEMESIS_CARD_AUDIT.md](../NEMESIS_CARD_AUDIT.md) | Существующий аудит различий. |

## Как пользоваться и что не получилось

- Ищите по названию карты, термину или имени исходного файла. В OCR-документах разделы подписаны путём исходного изображения: это позволяет открыть именно нужный лист.
- OCR — **черновик, не точная транскрипция**. Буквы, цифры, пробелы, названия и значки могут быть неверными, часть текста может отсутствовать, а строки разных колонок/карт могут смешиваться. Пустой результат не доказывает отсутствия текста. Высокая средняя уверенность слов OCR не означает, что текст распознан полностью. Поиск по точным словам может не найти нужный текст.
- Все 200 изображений из трёх больших наборов обработаны автоматически, но не все карточки или страницы надёжно прочитаны и вручную проверены. Более поздний Tesseract OCR по колонкам и карточкам заметно читабельнее старого `SHEETS_RU.md`, но тоже содержит ошибки; например, в первой карте мутации «Адаптация» распознал цифру 3 как 5. Приоритетнее соответствующая ручная расшифровка в `CARDS_EXPANSIONS_RU_CHECKED.md`. Для ответа по важному правилу сверяйте непосредственно с источником; если прочесть не удалось, сообщайте об этом вместо догадок.
- Иллюстрации персонажей, скриншоты и текстуры проверялись автоматическим сканированием; оно не гарантирует отсутствие небольшого текста. Печатные символы на кубиках и пиктограммы могут не сохраниться.
- В справочниках движка описано то, что реализовано приложением; это не доказательство того, что такое же правило напечатано в исходной настольной версии.

## Воспроизведение OCR

Скрипты предназначены для Python 3. Нужны `rapidocr-onnxruntime`, `opencv-python-headless`, `Pillow`, `PyYAML`; для PDF дополнительно `PyMuPDF`. Системе также могут потребоваться стандартные библиотеки ONNX Runtime. Скрипт `ocr_texts.py` обходит директории; `ocr_additional.py` принимает конкретные изображения и PDF и умеет подставлять модель распознавания. Результаты перезаписываются и не становятся проверенными из-за повторного запуска.

```bash
python3 tools/ocr_texts.py docs/texts/SHEETS_KOLODY.md 'Nemesis/Колоды'
python3 tools/ocr_texts.py docs/texts/SHEETS_DLC.md 'Nemesis/dlc'
python3 tools/ocr_texts.py docs/texts/SHEETS_ORIGINAL_BOARDS.md 'Nemesis/Оригинальная игра' 'Nemesis/Комнаты' 'Nemesis/Тайлы'
python3 tools/ocr_texts.py docs/texts/SHEETS_MODELS.md 'Nemesis/Модельки'
python3 tools/ocr_additional.py docs/texts/PDF_OCR.md 'Nemesis/dlc/Redux Карноморфы/4D30D343419A4ECDE8826A47C7B04CB51D09548C_Nemesis_Redux_Carnomorph_Rulebook.pdf'
```

Для `SHEETS_RU.md` использовались модель `models/cyrilic_rec.onnx` из [RobustOCR](https://github.com/hadar-cmyk/RobustOCR) и [словарь cyrillic_dict.txt](https://github.com/PaddlePaddle/PaddleOCR/blob/main/ppocr/utils/dict/cyrillic_dict.txt). Веса модели не включены в репозиторий; их нужно получить отдельно и соблюдать лицензии источников. Список входов сохранён в [SHEETS_RU_SOURCES.txt](SHEETS_RU_SOURCES.txt):

```bash
mapfile -t images < docs/texts/SHEETS_RU_SOURCES.txt
python3 tools/ocr_additional.py docs/texts/SHEETS_RU.md --rec-model /путь/cyrilic_rec.onnx --rec-keys /путь/cyrillic_dict.txt "${images[@]}"
```

Для OCR по колонкам и отдельным карточкам используется отдельный скрипт и заданные вручную прямоугольники в JSON, а не эвристика разбиения сетки. Установите `tesserocr` и `Pillow`, получите `rus.traineddata` и `eng.traineddata` из [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) и поместите их в одну папку. Модели не включены в репозиторий. На некоторых платформах `tesserocr` требует установки системных библиотек Tesseract и Leptonica.

```bash
python3 tools/ocr_regions.py tools/ocr_original_regions.json docs/texts/RULES_ORIGINAL_RU_OCR.md --tessdata /путь/к/tessdata
python3 tools/ocr_regions.py tools/ocr_chytrids_regions.json docs/texts/RULES_CHYTRIDS_RU_OCR.md --tessdata /путь/к/tessdata
python3 tools/ocr_regions.py tools/ocr_russian_cards_regions.json docs/texts/CARDS_RU_OCR.md --tessdata /путь/к/tessdata
```

Вывод может отличаться в зависимости от версии Tesseract и обученных данных. Перезапуск не исправляет вручную транскрибированные файлы и не заменяет проверки исходников.
