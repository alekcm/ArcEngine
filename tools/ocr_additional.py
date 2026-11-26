#!/usr/bin/env python3
"""Produce unverified OCR of explicit images or PDF pages.

Examples:
  python3 tools/ocr_additional.py out.md image.jpg document.pdf
  python3 tools/ocr_additional.py out.md --rec-model /path/rec.onnx --rec-keys /path/keys.txt image.jpg
Requires rapidocr-onnxruntime, opencv-python-headless, Pillow, PyYAML, PyMuPDF.
"""
import argparse
import tempfile
from pathlib import Path

import pymupdf
import rapidocr_onnxruntime
import yaml
from rapidocr_onnxruntime import RapidOCR
from ocr_texts import process


def create_ocr(model, keys):
    if not model:
        return RapidOCR()
    path = Path(rapidocr_onnxruntime.__file__).parent / 'config.yaml'
    conf = yaml.safe_load(path.read_text(encoding='utf-8'))
    conf['Rec']['model_path'] = str(Path(model).resolve())
    conf['Rec']['rec_keys_path'] = str(Path(keys).resolve())
    conf['Global']['use_cls'] = False
    with tempfile.NamedTemporaryFile(mode='w', suffix='.yaml', encoding='utf-8') as f:
        yaml.safe_dump(conf, f, allow_unicode=True)
        f.flush()
        return RapidOCR(config_path=f.name)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('output', type=Path)
    p.add_argument('--rec-model')
    p.add_argument('--rec-keys')
    p.add_argument('inputs', nargs='+', type=Path)
    a = p.parse_args()
    if bool(a.rec_model) != bool(a.rec_keys):
        p.error('--rec-model and --rec-keys must be supplied together')
    ocr = create_ocr(a.rec_model, a.rec_keys)
    sections = []
    errors = []
    def add(label, path):
        try:
            text = process(ocr, path)
            if not text:
                text = '_(Текст не распознан. Это не означает, что на изображении нет текста.)_'
        except Exception as exc:
            text = f'_(Ошибка OCR: {exc})_'
            errors.append(label)
        sections.append(f'## `{label}`\n\n{text}\n')
        print(f'{label}: {len(text)} chars', flush=True)
    for path in a.inputs:
        if path.suffix.lower() == '.pdf':
            with pymupdf.open(path) as doc:
                for idx, page in enumerate(doc):
                    with tempfile.NamedTemporaryFile(suffix='.png') as tmp:
                        page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False).save(tmp.name)
                        add(f'{path.as_posix()} — страница {idx + 1}', Path(tmp.name))
        else:
            add(path.as_posix(), path)
    a.output.parent.mkdir(parents=True, exist_ok=True)
    a.output.write_text('# Машинное распознавание: непроверенный черновик\n\n'
                        'OCR может пропустить или исказить слова, символы, цифры и порядок колонок; '
                        'не используйте как достоверный источник без сверки с указанным оригиналом.\n\n'
                        + '\n'.join(sections), encoding='utf-8')
    if errors:
        raise SystemExit(f'OCR errors: {errors}')


if __name__ == '__main__':
    main()
