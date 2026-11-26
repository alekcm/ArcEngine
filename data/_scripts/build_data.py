#!/usr/bin/env python3
"""Build test-format outputs from OCR results → data/.

Modes:
  (default)      final build: books, letters, cards, obj-index, manifest
  --prep-retry   write retry jobs (first-pass empty cards, 1.5x upscale)
  --prep-num     write number jobs for cards still empty after retry
                 (num_/num2_/num3_ recipe variants — all kept, merged later)

Reads:  /tmp/ocrprep/{jobs.json,texts.json,results.jsonl}
Writes: data/rules/rulebook.md, data/books/*.md, data/letters/*.md,
        data/cards/index.json, data/3d/obj-index.json, data/manifest.json

ID contract: cards c_{stem[-40:]}, retry retry_c_{stem[-40:]},
letters letter{n}_{tag}, numbers {num|num2|num3_}{stem[-40:]},
books {key}_p{nnn}[_L|_R|_ALT].
"""
import argparse
import hashlib
import json
import re
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps

ROOT = Path('/home/user/ArcEngine')
PREP = Path('/tmp/ocrprep')
RESULTS = PREP / 'results.jsonl'
OUT = ROOT / 'data'

# ---------------------------------------------------------------- helpers


def sha1_file(p: Path) -> str:
    h = hashlib.sha1()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def jpeg_size(p: Path) -> tuple[int, int]:
    with p.open('rb') as f:
        data = f.read()
    i = 2
    while i < len(data) - 9:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xC0, 0xC1, 0xC2, 0xC3):
            h, w = struct.unpack('>HH', data[i + 5:i + 9])
            return w, h
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        seglen = struct.unpack('>H', data[i + 2:i + 4])[0]
        i += 2 + seglen
    raise ValueError(f'no SOF in {p}')


def load_results() -> dict[str, dict]:
    out: dict[str, dict] = {}
    if not RESULTS.exists():
        sys.exit(f'missing {RESULTS} — run run_ocr.mjs first')
    for line in RESULTS.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        out[rec['id']] = rec  # later lines (retry/num) override
    return out


def cyr_count(s: str) -> int:
    return sum(1 for c in s if 'А' <= c <= 'Я' or 'а' <= c <= 'я' or c in 'Ёё')


def _is_heading(line: str) -> bool:
    s = line.strip()
    letters = sum(c.isalpha() for c in s)
    return 0 < len(s) <= 80 and letters >= 3 and s.isupper()


def clean(text: str) -> str:
    """OCR/text-layer normalisation → paragraphs (see data/README.md)."""
    text = text.replace('\r\n', '\n').replace('\r', '\n').replace('\xa0', ' ')
    lines = [re.sub(r'[ \t]+', ' ', ln).rstrip() for ln in text.split('\n')]
    blocks: list[str] = []
    cur: list[str] = []

    def flush() -> None:
        if not cur:
            return
        out = ''
        for ln in cur:
            if not out:
                out = ln
            elif out.endswith(('-', '\xad', '\u2011')):
                out = out[:-1] + ln
            else:
                out += ' ' + ln
        blocks.append(out)
        cur.clear()

    prev = ''
    for ln in lines:
        if not ln.strip():
            flush()
            prev = ''
            continue
        if cur:
            new_block = (
                bool(re.match(r'^[оo•●]\s+[А-ЯЁA-Z]', ln))
                or bool(re.fullmatch(r'\d{1,4}', ln.strip()))
                or _is_heading(ln)
                or (prev and prev[-1] in '.!?»' and ln[0] in 'А-ЯЁA-Z«')
            )
            if new_block:
                flush()
        cur.append(ln)
        prev = ln
    flush()
    body = '\n\n'.join(blocks).replace('\xad', '')
    return body.strip()


# ---------------------------------------------------------------- books

# ручная транскрипция обложки «Правила игры» (p1 без текстового слоя)
RB_COVER = '''Осквернённый Грааль
Падение Авалона
Правила игры'''

BOOKS = [
    ('rulebook', 'Правила игры — Осквернённый Грааль: Падение Авалона',
     OUT / 'rules' / 'rulebook.md'),
    ('journal', 'Журнал исследований — Осквернённый Грааль: Падение Авалона',
     OUT / 'books' / 'research-journal.md'),
    ('secrets', 'Книга секретов — Осквернённый Грааль: Падение Авалона',
     OUT / 'books' / 'book-of-secrets.md'),
]


def page_content(key: str, pno: int, results: dict, texts: dict) -> tuple[str, str]:
    pid = f'{key}_p{pno:03d}'
    if key == 'rulebook' and pno == 1:
        return RB_COVER, 'transcribed'
    if pid in texts:
        return clean(texts[pid]), 'text-layer'
    left = (results.get(f'{pid}_L') or {}).get('text', '') or ''
    right = (results.get(f'{pid}_R') or {}).get('text', '') or ''
    return clean(left + '\n\n' + right), 'ocr-spread'


def build_books(results: dict, texts: dict) -> dict:
    # page counts from jobs/texts: rulebook 24, secrets 22, journal 76
    pages_of = {'rulebook': 24, 'secrets': 22, 'journal': 76}
    summary = {}
    for key, title, path in BOOKS:
        npages = pages_of[key]
        path.parent.mkdir(parents=True, exist_ok=True)
        methods: Counter = Counter()
        parts = [f'# {title}\n']
        src = 'Mods/PDF' if key != 'journal' else '/tmp/rarout'
        parts.append(f'Источник: `{src}/…` ({npages} стр., текстовый слой + OCR разворотов).\n')
        for pno in range(1, npages + 1):
            body, method = page_content(key, pno, results, texts)
            methods[method] += 1
            parts.append(f'## Страница {pno}\n\n{body}\n')
        text = '\n'.join(parts)
        path.write_text(text, encoding='utf-8')
        summary[key] = {'file': str(path.relative_to(ROOT)), 'pages': npages,
                        'bytes': path.stat().st_size, 'methods': dict(methods)}
        print(f'{key}: {dict(methods)} {path.stat().st_size} B')
    return summary


# ---------------------------------------------------------------- letters

# (n, slug, name, signer, start_anchor, end_anchor) — anchors in rulebook text-layer;
# None anchors => OCR-only letter
LETTERS = [
    (1, 'ailey', 'Айлей', 'Неанте, жрица Куанахта',
     'Дорогая моя ученица', 'Неанте, жрица Куанахта'),
    (2, 'arev', 'Арев', 'Фаэль, мастер-охотник из Куанахта',
     'Мой друг, я знаю', 'Фаэль, мастер-охотник из Куанахта'),
    (3, 'beor', 'Беор', 'Эрфир, кузнечных дел мастер из Куанахта',
     'Беор, ты всегда был', 'Эрфир, кузнечных дел мастер из Куанахта'),
    (4, 'maggot', 'Червяк', 'Лорд Ивейн', None, None),
    (5, 'niamh', 'Ниав', None, None, None),
]


def best_letter(results: dict, n: int) -> tuple[str, dict] | None:
    cands = [r for k, r in results.items() if k.startswith(f'letter{n}_')]
    if not cands:
        return None
    best = max(cands, key=lambda r: r['conf'])
    tag = best['id'].split('_', 1)[1]
    return tag, best


def build_letters(results: dict, texts: dict) -> dict:
    # raw rulebook text-layer (anchors may contain \xa0)
    rb_raw = '\n'.join(texts[f'rulebook_p{p:03d}']
                       for p in range(2, 25) if f'rulebook_p{p:03d}' in texts)
    rb_norm = rb_raw.replace('\xa0', ' ')
    (OUT / 'letters').mkdir(parents=True, exist_ok=True)
    summary = {}
    for n, slug, name, signer, start, end in LETTERS:
        tag, best = best_letter(results, n)
        method = 'ocr'
        text = clean(best['text'])
        if start and end:
            i = rb_norm.find(start)
            j = rb_norm.find(end, i) if i >= 0 else -1
            if i >= 0 and j >= 0:
                text = clean(rb_norm[i:j + len(end)])
                method = 'text-layer'
        head = [f'# Письмо — {name}\n']
        head.append(f'Источник: `Mods/PDF/…` (pdf_idx {n}, вариант `{tag}`).')
        head.append(f'Метод: {method}{" (якоря в «Правила игры»)" if method == "text-layer" else ""}.')
        head.append(f'OCR conf: {best["conf"]}.' if method == 'ocr' else
                    f'OCR conf (вариант `{tag}`): {best["conf"]}.')
        if signer:
            head.append(f'Подпись: {signer}.')
        path = OUT / f'{slug}.md'
        path.write_text('\n'.join(head) + '\n\n' + text + '\n', encoding='utf-8')
        summary[slug] = {'file': f'data/letters/{slug}.md', 'method': method,
                         'conf': best['conf'], 'bytes': path.stat().st_size}
        print(f'letter {slug}: {method} conf {best["conf"]} {path.stat().st_size} B')
    return summary


# ---------------------------------------------------------------- cards

KIND_BY_SIZE = {
    (737, 1037): 'card', (736, 1037): 'card', (737, 1039): 'card',
    (515, 790): 'item-card',
    (961, 1375): 'location',
    (1586, 1240): 'character-sheet', (1578, 1232): 'character-sheet',
    (1580, 1241): 'character-sheet',
    (1839, 2817): 'print-sheet',
    (2076, 2961): 'map',
    (2150, 3024): 'checklist',
}

# dhash clusters >=10 members, ordered by size desc (verified contact sheet)
BACK_LABELS = ['БОЙ', 'ДИПЛОМАТИЯ', 'ПРЕДМЕТ',
               'ВСТРЕЧА', 'ВСТРЕЧА', 'ВСТРЕЧА', 'ВСТРЕЧА', 'ВСТРЕЧА', 'ВСТРЕЧА']


def dhash(path: Path, size: int = 8) -> int:
    im = Image.open(path).convert('L').resize((size + 1, size), Image.LANCZOS)
    px = list(im.getdata())
    bits = 0
    for row in range(size):
        for col in range(size):
            bits = (bits << 1) | (px[row * (size + 1) + col] > px[row * (size + 1) + col + 1])
    return bits


def cluster_backs(card_ids: list[str], img_of: dict[str, Path]) -> dict[str, str]:
    """Connected components over dhash (hamming <= 6), clusters >=10 -> backs."""
    hashes = {cid: dhash(img_of[cid]) for cid in card_ids}
    parent = {cid: cid for cid in card_ids}

    def find(x: str) -> str:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i, a in enumerate(card_ids):
        ha = hashes[a]
        for b in card_ids[i + 1:]:
            if (ha ^ hashes[b]).bit_count() <= 6:
                union(a, b)
    groups: dict[str, list[str]] = defaultdict(list)
    for cid in card_ids:
        groups[find(cid)].append(cid)
    big = sorted((g for g in groups.values() if len(g) >= 10),
                 key=len, reverse=True)
    if len(big) != len(BACK_LABELS):
        print(f'WARN back clusters: {len(big)} != {len(BACK_LABELS)} '
              f'(sizes {[len(g) for g in big]})', file=sys.stderr)
    back_of: dict[str, str] = {}
    for label, group in zip(BACK_LABELS, big):
        for cid in group:
            back_of[cid] = label
    return back_of


def best_number(results: dict, cid: str) -> str | None:
    """Merge num3_ (psm3) preferred, then num_/num2_ by conf; digit-only conf>=60."""

    def pick(jid: str) -> tuple[int, str] | None:
        r = results.get(jid)
        if not r:
            return None
        t = (r['text'] or '').strip()
        if r['conf'] >= 60 and t.isdigit():
            return r['conf'], t
        return None

    for pre in ('num3_',):
        v = pick(pre + cid)
        if v:
            return v[1]
    best = None
    for pre in ('num_', 'num2_'):
        v = pick(pre + cid)
        if v and (best is None or v[0] > best[0]):
            best = v
    return best[1] if best else None


def build_cards(results: dict, jobs: list[dict]) -> dict:
    img_of: dict[str, Path] = {}
    for job in jobs:
        if job['group'] == 'card':
            img_of[job['id']] = Path(job['path'])
    card_ids = sorted(img_of)
    print(f'cards: {len(card_ids)}')

    back_of = cluster_backs(card_ids, img_of)
    print(f'backs: {len(back_of)} in {len(set(back_of.values()))} labels')

    cards: dict[str, dict] = {}
    sha_seen: dict[str, str] = {}
    dups = 0
    kind_counts: Counter = Counter()
    confs = []
    n_empty = n_retry = n_back = n_num = 0
    src_of = {p.stem[-40:]: p for p in (ROOT / 'Mods' / 'Images').glob('*.jpg')}

    for cid in card_ids:
        src = src_of[cid.split('c_', 1)[-1] if cid.startswith('c_') else cid]
        w, h = jpeg_size(src)
        kind = KIND_BY_SIZE.get((w, h), 'card')
        kind_counts[kind] += 1
        sha = sha1_file(src)
        if sha in sha_seen:
            dups += 1
        sha_seen[sha] = cid

        main = results.get(cid, {'conf': 0, 'text': ''})
        conf = main.get('conf', 0)
        text = main.get('text', '') or ''
        method = 'main'
        confs.append(conf)

        # retry fallback: first-pass empty, retry conf>=55, >=15 cyrillic
        if not text.strip():
            rr = results.get(f'retry_{cid}')
            if rr and rr['conf'] >= 55 and cyr_count(rr['text']) >= 15:
                text = rr['text']
                conf = rr['conf']
                method = 'retry'
                n_retry += 1

        number = best_number(results, cid)
        if number is not None:
            n_num += 1

        back = cid in back_of
        if back:
            # transcribed label wins over any OCR
            text = back_of[cid]
            conf = None
            method = 'transcribed'
            n_back += 1
        elif not text.strip():
            n_empty += 1

        cards[cid] = {
            'file': f'Mods/Images/{src.name}',
            'width': w, 'height': h, 'kind': kind, 'sha1': sha,
            'back': back, 'number': number,
            'ocr': {'conf': conf, 'text': text, 'method': method},
        }

    avg = round(sum(confs) / len(confs), 1)
    stats = {'avg_conf': avg, 'empty': n_empty, 'backs': n_back,
             'retry': n_retry, 'numbers': n_num, 'dups': dups,
             'kinds': dict(kind_counts)}
    out_path = OUT / 'cards' / 'index.json'
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({'count': len(cards), 'stats': stats,
                                    'cards': cards},
                                   ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'cards: {len(cards)} avg conf {avg} empty {n_empty} backs {n_back} '
          f'retry {n_retry} numbers {n_num}, {dups} dups '
          f'({out_path.stat().st_size} B)')
    return stats


# ---------------------------------------------------------------- obj index


def build_obj_index() -> dict:
    entries = []
    for p in sorted((ROOT / 'Mods' / 'Models').glob('*.obj')):
        head = p.read_text(encoding='utf-8', errors='replace')
        m = re.search(r'^mtllib\s+(\S+)', head, re.M)
        mtllib = m.group(1) if m else None
        entries.append({
            'file': f'Mods/Models/{p.name}',
            'bytes': p.stat().st_size,
            'sha1': sha1_file(p),
            'mtllib': mtllib,
            'mtllib_missing': bool(mtllib) and not (p.parent / mtllib).exists(),
            'vertices': sum(1 for ln in head.splitlines() if ln.startswith('v ')),
            'faces': sum(1 for ln in head.splitlines() if ln.startswith('f ')),
        })
    out_path = OUT / '3d' / 'obj-index.json'
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({'count': len(entries), 'models': entries},
                                   ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'obj-index: {len(entries)} models')
    return {'count': len(entries)}


# ---------------------------------------------------------------- manifest


def build_manifest(books: dict, letters: dict, card_stats: obj, obj_idx: dict) -> dict:
    pdfs = []
    for p in sorted((ROOT / 'Mods' / 'PDF').glob('*.pdf')):
        pdfs.append({'file': f'Mods/PDF/{p.name}', 'bytes': p.stat().st_size,
                     'sha1': sha1_file(p)})
    journal = sorted(Path('/tmp/rarout').glob('*.pdf'))
    if journal:
        pdfs.append({'file': f'/tmp/rarout/{journal[0].name}',
                     'bytes': journal[0].stat().st_size,
                     'sha1': sha1_file(journal[0])})
    images = list((ROOT / 'Mods' / 'Images').glob('*.jpg'))
    bundles = list((ROOT / 'Mods' / 'Assetbundles').glob('*.unity3d'))
    manifest = {
        'project': 'Fall of Avalon — test data (Markdown + JSON)',
        'sources': {
            'pdfs': pdfs,
            'images': {'count': len(images),
                       'bytes': sum(p.stat().st_size for p in images)},
            'assetbundles': {'count': len(bundles),
                             'bytes': sum(p.stat().st_size for p in bundles)},
        },
        'outputs': {'books': books, 'letters': letters,
                    'cards': card_stats, 'obj_index': obj_idx},
    }
    out_path = OUT / 'manifest.json'
    out_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1),
                        encoding='utf-8')
    print(f'manifest: {out_path.stat().st_size} B')
    return manifest


# ---------------------------------------------------------------- prep modes


def prep_retry(results: dict, jobs: list[dict]) -> None:
    """First-pass empty cards -> 1.5x upscale retry jobs."""
    from PIL import Image as I
    out_jobs = []
    for job in jobs:
        if job['group'] != 'card':
            continue
        main = results.get(job['id'])
        if not main or main.get('text', '').strip():
            continue
        cid = job['id'][2:]  # strip 'c_'
        dst = PREP / f'retry_c_{cid}.jpg'
        im = I.open(job['path'])
        im = im.resize((int(im.width * 1.5), int(im.height * 1.5)), I.LANCZOS)
        ImageOps.autocontrast(im.convert('L')).save(dst, 'JPEG', quality=92)
        out_jobs.append({'id': f'retry_c_{cid}', 'path': str(dst), 'group': 'retry'})
    (PREP / 'retry_jobs.json').write_text(
        json.dumps(out_jobs, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'retry jobs: {len(out_jobs)} -> {PREP / "retry_jobs.json"}')


def prep_num(results: dict, jobs: list[dict]) -> None:
    """Cards still empty after retry -> number jobs (3 recipe variants)."""
    cands = []
    for job in jobs:
        if job['group'] != 'card':
            continue
        cid = job['id'][2:]
        if f'retry_c_{cid}' in results:
            continue  # retry already accepted (not empty anymore)
        main = results.get(job['id'])
        if main and main.get('text', '').strip():
            continue
        cands.append((cid, job['path']))
    print(f'num candidates (still empty): {len(cands)}')

    jobs_out = {'num_': [], 'num2_': [], 'num3_': []}
    for cid, src in cands:
        base = Image.open(src).convert('L')
        # num_: invert + 3x NEAREST + MaxFilter(9), psm7
        inv = ImageOps.invert(base)
        big = inv.resize((inv.width * 3, inv.height * 3), Image.NEAREST)
        filt = big.filter(ImageFilter.MaxFilter(9))
        p = PREP / f'num_{cid}.jpg'
        filt.save(p, 'JPEG', quality=92)
        jobs_out['num_'].append({'id': f'num_{cid}', 'path': str(p), 'group': 'num'})
        # num2_: content wide-crop, psm3
        bw = base.point(lambda x: 255 if x > 200 else 0)
        bbox = bw.getbbox() or (0, 0, base.width, base.height)
        crop = base.crop(bbox)
        p2 = PREP / f'num2_{cid}.jpg'
        crop.save(p2, 'JPEG', quality=92)
        jobs_out['num2_'].append({'id': f'num2_{cid}', 'path': str(p2), 'group': 'num2'})
        # num3_: same prep as num_ but psm3
        p3 = PREP / f'num3_{cid}.jpg'
        filt.save(p3, 'JPEG', quality=92)
        jobs_out['num3_'].append({'id': f'num3_{cid}', 'path': str(p3), 'group': 'num3'})
    for pre, js in jobs_out.items():
        path = PREP / f'{pre}jobs.json'
        path.write_text(json.dumps(js, ensure_ascii=False, indent=1), encoding='utf-8')
        print(f'{pre} jobs: {len(js)} -> {path}')


# ---------------------------------------------------------------- main


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--prep-retry', action='store_true')
    ap.add_argument('--prep-num', action='store_true')
    args = ap.parse_args()

    results = load_results()
    jobs = json.loads((PREP / 'jobs.json').read_text(encoding='utf-8'))
    texts = json.loads((PREP / 'texts.json').read_text(encoding='utf-8'))
    print(f'loaded: {len(results)} results, {len(jobs)} jobs, {len(texts)} text pages')

    if args.prep_retry:
        prep_retry(results, jobs)
        return
    if args.prep_num:
        prep_num(results, jobs)
        return

    books = build_books(results, texts)
    letters = build_letters(results, texts)
    card_stats = build_cards(results, jobs)
    obj_idx = build_obj_index()
    build_manifest(books, letters, card_stats, obj_idx)
    print('BUILD OK')


if __name__ == '__main__':
    main()
