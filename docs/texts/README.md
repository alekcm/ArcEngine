# Тексты Nemesis: как искать

Этот каталог помогает найти правила и карточки, содержащиеся в изображениях или PDF. **Оригинальная игра, фанатский Redux, дополнения и правила движка — не одно и то же.** Сначала определите нужную редакцию, потом ищите текст; не переносите правила из одной редакции в другую без проверки.

| Вопрос / источник | Где искать | Состояние |
|---|---|---|
| Правила Nemesis: Redux, 25 страниц | [RULEBOOK_REDUX_EN.md](RULEBOOK_REDUX_EN.md) | Расшифровка английского текста; полная независимая сверка ещё нужна. |
| Оригинальные русские правила, Consequences и правила в сканах | [RULES_ORIGINAL_RU.md](RULES_ORIGINAL_RU.md), [SHEETS_RU.md](SHEETS_RU.md), [SHEETS_ORIGINAL_BOARDS.md](SHEETS_ORIGINAL_BOARDS.md) | Полной достоверной расшифровки нет. OCR русских разворотов сильно повреждён и часто нечитаем. Сверяйтесь с изображениями. |
| Карноморфы — русские правила | [RULES_CARNOMORPHS_RU.md](RULES_CARNOMORPHS_RU.md) | Извлечена текстовая подложка PDF; расположение колонок и отдельные символы могут быть неверны. |
| Кошмары / Сеятели Пустоты — русские правила | [RULES_VOIDSEEDERS_RU.md](RULES_VOIDSEEDERS_RU.md) | Извлечена текстовая подложка PDF; стр. 7 — иллюстрация. |
| Карноморфы в Redux | [RULEBOOK_CARNOMORPHS_REDUX_EN.md](RULEBOOK_CARNOMORPHS_REDUX_EN.md) | Текст страниц PDF перенесён с изображения; полной независимой проверки нет. Черновой OCR: [PDF_OCR.md](PDF_OCR.md). |
| Хитриды / Lockdown, русские карты и страницы правил | [SHEETS_RU.md](SHEETS_RU.md), [SHEETS_DLC.md](SHEETS_DLC.md) | Непроверенный OCR; правила колонок могут перемешаться, многие буквы и символы ошибочны. |
| Печатные листы колод | [SHEETS_KOLODY.md](SHEETS_KOLODY.md) | Непроверенный OCR 77 изображений из `Nemesis/Колоды/`. |
| Печатные листы дополнений | [SHEETS_DLC.md](SHEETS_DLC.md), [SHEETS_RU.md](SHEETS_RU.md) | Непроверенный OCR 36 изображений из `Nemesis/dlc/`; `SHEETS_RU.md` дополнительно использует кириллическую модель для выбранных листов. |
| Оригинальная игра, комнаты и тайлы | [SHEETS_ORIGINAL_BOARDS.md](SHEETS_ORIGINAL_BOARDS.md) | Непроверенный OCR 87 изображений из соответствующих каталогов. |
| Модели | [SHEETS_MODELS.md](SHEETS_MODELS.md) | Непроверенный OCR 8 изображений; изображения могут содержать только графику. |
| Что делают карты в приложении | [NEMESIS_CARD_TEXTS.md](../NEMESIS_CARD_TEXTS.md), [NEMESIS_DLC_REFERENCE.md](../NEMESIS_DLC_REFERENCE.md) | Справочники из данных движка, а не гарантированно дословный текст оригинальных карт. |
| Сверка карт движка с печатными | [NEMESIS_CARD_AUDIT.md](../NEMESIS_CARD_AUDIT.md) | Существующий аудит различий. |

## Как пользоваться и что не получилось

- Ищите по названию карты, термину или имени исходного файла. В OCR-документах разделы подписаны путём исходного изображения: это позволяет открыть именно нужный лист.
- OCR — **черновик, не точная транскрипция**. Буквы, цифры, пробелы, названия и значки могут быть неверными, часть текста может отсутствовать, а строки разных колонок/карт могут смешиваться. Пустой результат не доказывает отсутствия текста. Кириллическая модель путает кириллицу и латиницу; поиск по точным словам может не найти нужный текст.
- Все 200 изображений из трёх больших наборов обработаны автоматически, но не все карточки или страницы надёжно прочитаны и вручную проверены. В частности, русские правила и часть карт ещё требуют качественной расшифровки. Для ответа по важному правилу сверяйте непосредственно с источником; если прочесть не удалось, сообщайте об этом вместо догадок.
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
