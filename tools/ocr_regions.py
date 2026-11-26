#!/usr/bin/env python3
"""OCR explicit document regions at original resolution with Tesseract.

Usage: python3 tools/ocr_regions.py CONFIG.json OUTPUT.md --tessdata /path/to/tessdata
Requires Pillow and tesserocr (which bundles Tesseract on some platforms), and
rus.traineddata and eng.traineddata from tesseract-ocr/tessdata_fast. Config
entries specify source, label, and normalized (x0,y0,x1,y1) region rectangles.
OCR does not reliably identify icons, card numbers or text on artwork; inspect
all images when using the results as rules. Rectangles are not auto-detected.
"""
import argparse
import json
import re
from pathlib import Path
from PIL import Image
from tesserocr import PyTessBaseAPI, PSM


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--tessdata', required=True)
    args = parser.parse_args()
    config = json.loads(args.config.read_text(encoding='utf-8'))
    output = ['# ' + config['title'], '', config['note'], '']
    with PyTessBaseAPI(path=args.tessdata, lang=config.get('lang', 'rus+eng'), psm=PSM.AUTO) as api:
        for entry in config['sources']:
            path = Path(entry['path'])
            if not path.is_file():
                raise FileNotFoundError(path)
            print(entry['label'], flush=True)
            output += ['## ' + entry['label'], '', f"Источник: `{path.as_posix()}`", '']
            with Image.open(path) as source:
                image = source.convert('L')
            w, h = image.size
            for region in entry['regions']:
                x0, y0, x1, y1 = region['rect']
                if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
                    raise ValueError(f"invalid region: {region}")
                crop = image.crop((round(x0*w), round(y0*h), round(x1*w), round(y1*h)))
                api.SetImage(crop)
                text = api.GetUTF8Text().strip()
                confidence = api.MeanTextConf() if text else 0
                text = re.sub(r'(?<=[А-Яа-яЁё])-\n(?=[а-яё])', '', text)
                output += ['### ' + region['label'], '',
                           f'*OCR, средняя уверенность {confidence}/100 (не оценка полноты); значки могут быть пропущены.*', '',
                           text if text else '_(Текст не распознан; сверьте исходник.)_', '']
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text('\n'.join(output), encoding='utf-8')


if __name__ == '__main__':
    main()
