#!/usr/bin/env python3
"""Prepare OCR jobs for Fall of Avalon materials.

Reads the source PDFs (Mods/PDF), the extracted journal PDF (/tmp/rarout)
and the card images (Mods/Images); writes grayscale+autocontrast JPEGs and
job/text manifests into /tmp/ocrprep/:

  jobs.json   [{id, path, group}] — groups: book | alt | letter | card
  texts.json  {page_id: text-layer}  (flat; only pages with a text layer)

ID contract with build_data.py:
  book   {key}_p{nnn}_L / {key}_p{nnn}_R   image-only pages, centre split
  alt    {key}_p{nnn}_ALT                  text-layer pages (verification)
  letter letter{n}_{tag}                   n = 1..5 (pdf order), tag below
  card   c_{stem[-40:]}

Letters: landscape scans need rotation → try rot270 + rot90;
portrait → asis + rot180 (2 jobs per letter, 10 total).
Requires /tmp/rarout/*.pdf (extract the RAR first — see data/README.md).
"""
import json
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps
from pypdf import PdfReader
from pypdf._configuration import overwrite_configuration

overwrite_configuration(image_maximum_buffer_size=400_000_000)

ROOT = Path('/home/user/ArcEngine')
PDFDIR = ROOT / 'Mods' / 'PDF'
IMAGEDIR = ROOT / 'Mods' / 'Images'
OUT = Path('/tmp/ocrprep')
OUT.mkdir(parents=True, exist_ok=True)

MIN_TEXT = 400          # chars of text layer to treat a page as text-native
MIN_ALT_AREA = 500_000  # px; skip alt-OCR of tiny art images
SPLIT_ASPECT = 1.2      # wider than this → treat embedded image as spread

jobs: list[dict] = []
texts: dict[str, str] = {}


def add_job(jid: str, path: Path, group: str) -> None:
    jobs.append({'id': jid, 'path': str(path), 'group': group})


def prep_gray_ac(src, dst: Path, quality: int = 90) -> None:
    """grayscale + autocontrast → JPEG (best OCR results on card art)."""
    im = src if isinstance(src, Image.Image) else Image.open(src)
    ImageOps.autocontrast(im.convert('L')).save(dst, 'JPEG', quality=quality)


def extract_images(page) -> list[tuple[str, Image.Image]]:
    """[(name, PIL image)] for every embedded image of a page."""
    out: list[tuple[str, Image.Image]] = []
    for img in page.images:
        try:
            pil = Image.open(BytesIO(img.data))
            pil.load()
            out.append((img.name, pil))
        except Exception:
            continue
    return out


def largest_image(page) -> Image.Image | None:
    imgs = extract_images(page)
    if not imgs:
        return None
    return max(imgs, key=lambda t: t[1].width * t[1].height)[1]


def handle_book(key: str, pdf_path: Path) -> None:
    reader = PdfReader(str(pdf_path))
    for pno in range(1, len(reader.pages) + 1):
        page = reader.pages[pno - 1]
        pid = f'{key}_p{pno:03d}'
        text = (page.extract_text() or '').strip()
        if len(text) >= MIN_TEXT:
            texts[pid] = text
            im = largest_image(page)
            if im is not None and im.width * im.height >= MIN_ALT_AREA:
                dst = OUT / f'{pid}_ALT.jpg'
                prep_gray_ac(im, dst)
                add_job(f'{pid}_ALT', dst, 'alt')
            continue
        im = largest_image(page)
        if im is None:
            print(f'WARN {pid}: no embedded image, skipped', file=sys.stderr)
            continue
        w, h = im.size
        if w / h >= SPLIT_ASPECT:
            left = im.crop((0, 0, w // 2, h))
            right = im.crop((w // 2, 0, w, h))
            for tag, part in (('L', left), ('R', right)):
                dst = OUT / f'{pid}_{tag}.jpg'
                prep_gray_ac(part, dst)
                add_job(f'{pid}_{tag}', dst, 'book')
        else:
            dst = OUT / f'{pid}.jpg'
            prep_gray_ac(im, dst)
            add_job(pid, dst, 'book')
    print(f'{key}: {len(reader.pages)} pages processed')


def handle_letters(pdfs: list[Path]) -> None:
    """5 single-page letter PDFs; landscape sources need rotation — try both."""
    for n, pdf in enumerate(pdfs, 1):
        reader = PdfReader(str(pdf))
        im = largest_image(reader.pages[0])
        if im is None:
            sys.exit(f'letter {n}: no embedded image in {pdf.name}')
        w, h = im.size
        variants = [('rot270', 270), ('rot90', 90)] if w > h else [('asis', 0), ('rot180', 180)]
        for tag, deg in variants:
            rot = im.rotate(deg, expand=True) if deg else im
            dst = OUT / f'letter{n}_{tag}.jpg'
            prep_gray_ac(rot, dst)
            add_job(f'letter{n}_{tag}', dst, 'letter')
    print(f'letters: {len(pdfs)} pdfs x 2 variants')


def handle_cards() -> None:
    files = sorted(IMAGEDIR.glob('*.jpg'))
    for p in files:
        cid = p.stem[-40:]
        dst = OUT / f'card_{cid}.jpg'
        prep_gray_ac(p, dst)
        add_job(f'c_{cid}', dst, 'card')
    print(f'cards: {len(files)}')


def main() -> None:
    pdfs = sorted(PDFDIR.glob('*.pdf'))
    if len(pdfs) != 7:
        sys.exit(f'expected 7 PDFs in Mods/PDF, found {len(pdfs)}')
    # sorted(): [0] rulebook, [1..5] letters (Айлей, Арев, Беор, Червяк, Ниав), [6] «Книга секретов»
    handle_book('rulebook', pdfs[0])
    handle_letters(pdfs[1:6])
    handle_book('secrets', pdfs[6])
    journal = sorted(Path('/tmp/rarout').glob('*.pdf'))
    if not journal:
        sys.exit('missing extracted journal PDF in /tmp/rarout — rerun unrar first')
    handle_book('journal', journal[0])
    handle_cards()

    (OUT / 'jobs.json').write_text(json.dumps(jobs, ensure_ascii=False, indent=1), encoding='utf-8')
    (OUT / 'texts.json').write_text(json.dumps(texts, ensure_ascii=False, indent=1), encoding='utf-8')
    from collections import Counter
    counts = dict(Counter(j['group'] for j in jobs))
    print(f'jobs: {len(jobs)} {counts}; texts: {len(texts)}')


if __name__ == '__main__':
    main()
