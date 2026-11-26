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

    def test_local_markdown_links(self):
        for file in (ROOT / 'docs/texts').glob('*.md'):
            for target in re.findall(r'\]\(([^)]+)\)', file.read_text(encoding='utf-8')):
                if target.startswith(('https:', 'http:', '#')):
                    continue
                self.assertTrue((file.parent / target.split('#', 1)[0]).exists(), f'{file}: {target}')

if __name__ == '__main__':
    unittest.main()
