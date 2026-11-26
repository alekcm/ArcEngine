"""Structural checks for the generated OCR documents and their region maps.

These do not verify transcription accuracy; that requires source comparison.
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

class TextExtractionTests(unittest.TestCase):
    def test_regions_and_outputs(self):
        cases = [
            ('ocr_original_regions.json', 'RULES_ORIGINAL_RU_OCR.md', 16, 84),
            ('ocr_chytrids_regions.json', 'RULES_CHYTRIDS_RU_OCR.md', 8, 16),
            ('ocr_russian_cards_regions.json', 'CARDS_RU_OCR.md', 14, 222),
        ]
        for config_name, output_name, source_count, region_count in cases:
            with self.subTest(config=config_name):
                config = json.loads((ROOT / 'tools' / config_name).read_text(encoding='utf-8'))
                out = (ROOT / 'docs' / 'texts' / output_name).read_text(encoding='utf-8')
                self.assertEqual(len(config['sources']), source_count)
                self.assertEqual(sum(len(source['regions']) for source in config['sources']), region_count)
                for source in config['sources']:
                    self.assertTrue((ROOT / source['path']).is_file(), source['path'])
                    self.assertIn('## ' + source['label'] + '\n', out)
                    self.assertIn('Источник: `' + source['path'] + '`', out)
                    for region in source['regions']:
                        x0, y0, x1, y1 = region['rect']
                        self.assertTrue(0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1)
                self.assertEqual(len(re.findall(r'^### ', out, re.M)), region_count)

    def test_manual_correction_does_not_repeat_ocr_number_error(self):
        text = (ROOT / 'docs/texts/CARDS_EXPANSIONS_RU_CHECKED.md').read_text(encoding='utf-8')
        mutation = text.split('### Адаптация', 1)[1].split('### ', 1)[0]
        self.assertIn('взять 3 карты из колоды мутаций', mutation)
        self.assertNotIn('взять 5 карты', mutation)

    def test_original_intruder_cards_important_fields(self):
        events = (ROOT / 'docs/texts/CARDS_ORIGINAL_EVENTS_RU.md').read_text(encoding='utf-8')
        attacks = (ROOT / 'docs/texts/CARDS_ORIGINAL_ATTACKS_RU.md').read_text(encoding='utf-8')
        weaknesses = (ROOT / 'docs/texts/CARDS_ORIGINAL_WEAKNESSES_RU.md').read_text(encoding='utf-8')
        # Structural regression checks; these cannot replace reading the source sheets.
        self.assertEqual(len(re.findall(r'^## ', events, re.M)), 19)  # 11–12 share an effect
        self.assertEqual(len(re.findall(r'^\*\*Движение:', events, re.M)), 18)
        self.assertIn('Карта 11: **Охотник, Королева**; коридор 3', events)
        self.assertIn('Карта 12: **Ползун, Охотник, Королева**; коридор 2', events)
        self.assertIn('Удалите с поля всех Чужих, которые не находятся в Бою', events)
        self.assertIn('Откройте все Двери на поле (кроме Разрушенных)', events)
        self.assertEqual(len(re.findall(r'^\*\*Типы:', attacks, re.M)), 8)
        self.assertEqual(len(re.findall(r'^## ', weaknesses, re.M)), 8)

    def test_original_base_setup_and_extra_cards(self):
        setup = (ROOT / 'docs/texts/RULES_ORIGINAL_SETUP_RU.md').read_text(encoding='utf-8')
        actions = (ROOT / 'docs/texts/CARDS_ORIGINAL_INTRUDER_ACTIONS_RU.md').read_text(encoding='utf-8')
        wounds = (ROOT / 'docs/texts/CARDS_ORIGINAL_WOUNDS_RU.md').read_text(encoding='utf-8')
        self.assertEqual([int(n) for n in re.findall(r'^\*\*(\d+)\)\*\*', setup, re.M)], list(range(1, 21)))
        self.assertIn('3 Взрослых Особей', setup)
        self.assertIn('по 1 жетону Взрослой Особи за каждого игрока', setup)
        self.assertEqual(len(re.findall(r'^## ', actions, re.M)), 5)
        self.assertIn('**любое**, **1**, **2**, **3**', actions)
        self.assertEqual(len(re.findall(r'^## ', wounds, re.M)), 5)

    def test_original_endgame_and_objective_rules_present(self):
        text = (ROOT / 'docs/texts/RULES_ORIGINAL_OBJECTIVES_END_RU.md').read_text(encoding='utf-8')
        for phrase in (
            '9-й маркер Пожара или 9-й маркер Неисправности',
            'Если 2 из 3 Двигателей Неисправны',
            'Персонаж с этой Целью (и только он) не погибает',
            'а затем берет 4 верхние карты',
            'картой Заражения (с ИНФЕКЦИЕЙ или без)',
            'игрок пропускает шаг А и сразу переходит к шагу Б',
            'Каждый игрок немедленно выбирает 1 из 2 карт Целей',
            'Персонажи НЕ МОГУТ войти в них до этого момента',
        ):
            with self.subTest(phrase=phrase):
                self.assertIn(phrase, text)

    def test_local_markdown_links(self):
        for file in (ROOT / 'docs/texts').glob('*.md'):
            for target in re.findall(r'\]\(([^)]+)\)', file.read_text(encoding='utf-8')):
                if target.startswith(('https:', 'http:', '#')):
                    continue
                self.assertTrue((file.parent / target.split('#', 1)[0]).exists(), f'{file}: {target}')

if __name__ == '__main__':
    unittest.main()
