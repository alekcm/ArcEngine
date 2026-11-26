#!/usr/bin/env python3
"""OCR text-bearing images into markdown files under docs/texts/.

Usage:
    python3 tools/ocr_texts.py <output.md> <dir> [<dir> ...]

The script runs RapidOCR over every image in the given directories, detects the
card-grid layout (columns/rows) so that text is emitted card-by-card instead of
line-by-line across the whole sheet, and writes one markdown file per run.

Notes:
- OCR is unverified and may omit or misread text, numbers and icons, and
  merge or reorder cards; always check the source images.
- In-game (engine) card texts live in docs/NEMESIS_CARD_TEXTS.md and
  docs/NEMESIS_DLC_REFERENCE.md; OCR is derived from printed sheets.
"""
import sys
from pathlib import Path

from rapidocr_onnxruntime import RapidOCR

IMG_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def collect_images(dirs):
    out = []
    for d in dirs:
        p = Path(d)
        if not p.exists():
            print(f"skip missing: {d}", flush=True)
            continue
        for f in sorted(p.rglob("*")):
            if f.suffix.lower() in IMG_EXT and f.is_file():
                out.append(f)
    return out


def read_boxes(ocr, path):
    result, _ = ocr(str(path))
    boxes = []
    for poly, text, score in result or []:
        xs = [pt[0] for pt in poly]
        ys = [pt[1] for pt in poly]
        boxes.append(
            dict(x0=min(xs), x1=max(xs), y0=min(ys), y1=max(ys),
                 t=" ".join(text.split()), s=float(score))
        )
    return boxes


def best_split(intervals, length, max_k=12, min_cell=80):
    """Pick the number of grid cells along one axis.

    Score each k by how much box area falls into the edge zones of the cells:
    text sits inside cells (padding), so the correct k minimises that.
    """
    total = sum(max(1.0, b[1] - b[0]) for b in intervals)
    best_k, best_score = 1, None
    for k in range(1, max_k + 1):
        cell = length / k
        if cell < min_cell:
            break
        zone = max(12.0, 0.03 * cell)
        pen = 0.0
        for a0, a1 in intervals:
            for i in range(k):
                left = i * cell
                right = left + cell
                pen += max(0.0, min(a1, left + zone) - max(a0, left))
                pen += max(0.0, min(a1, right) - max(a0, right - zone))
        score = pen / total
        if best_score is None or score < best_score - 1e-9:
            best_k, best_score = k, score
    if best_score is not None and best_score > 0.12:
        return 1
    return best_k


def split_lines(boxes):
    """Group boxes of one cell into visual lines, then order lines top-down."""
    boxes = sorted(boxes, key=lambda b: (b["y0"], b["x0"]))
    lines = []
    for b in boxes:
        if lines and b["y0"] < max(x["y1"] for x in lines[-1]) - 0.2 * (b["y1"] - b["y0"]):
            lines[-1].append(b)
        else:
            lines.append([b])
    out = []
    for line in lines:
        line.sort(key=lambda b: b["x0"])
        text = " ".join(b["t"] for b in line)
        score = min(b["s"] for b in line)
        out.append((text, score))
    return out


def render_cell(boxes):
    lines = split_lines(boxes)
    return "\n".join(t for t, _ in lines)


def process(ocr, path):
    boxes = read_boxes(ocr, path)
    if not boxes:
        return None
    # Image size from the boxes' extent is not the real size; use PIL.
    from PIL import Image
    with Image.open(path) as im:
        W, H = im.size

    kx = best_split([(b["x0"], b["x1"]) for b in boxes], W)
    ky = best_split([(b["y0"], b["y1"]) for b in boxes], H)

    cells = {}
    for b in boxes:
        cx = min(kx - 1, int(b["x0"] + (b["x1"] - b["x0"]) / 2) * kx // max(1, W))
        cy = min(ky - 1, int(b["y0"] + (b["y1"] - b["y0"]) / 2) * ky // max(1, H))
        cells.setdefault((cy, cx), []).append(b)

    parts = []
    for key in sorted(cells):
        text = render_cell(cells[key])
        if text.strip():
            parts.append(text)
    return "\n\n".join(parts)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    out_path = Path(sys.argv[1])
    dirs = sys.argv[2:]
    images = collect_images(dirs)
    print(f"{len(images)} images from {dirs}", flush=True)

    ocr = RapidOCR()
    sections = []
    errors = []
    for i, img in enumerate(images, 1):
        try:
            text = process(ocr, img)
        except Exception as e:  # Record the failure separately from a genuinely empty result.
            errors.append(str(img))
            text = f"_(ошибка OCR: {e})_"
            print(f"[{i}/{len(images)}] ERROR {img}: {e}", flush=True)
        rel = img.as_posix()
        if text:
            sections.append(f"### `{rel}`\n\n{text}\n")
            print(f"[{i}/{len(images)}] ok  {rel} ({len(text)} chars)", flush=True)
        else:
            sections.append(f"### `{rel}`\n\n_(нет распознанного текста)_\n")
            print(f"[{i}/{len(images)}] empty {rel}", flush=True)

    header = (
        f"# OCR: {', '.join(dirs)}\n\n"
        "Сгенерировано `tools/ocr_texts.py` (RapidOCR). Непроверенный черновик: "
        "текст может быть пропущен или искажён, порядок карточек или колонок "
        "перепутан; значки и кириллица часто распознаются неверно. "
        "Важные формулировки сверяйте с изображением. "
        "Тексты карт движка — в `NEMESIS_CARD_TEXTS.md` и "
        "`NEMESIS_DLC_REFERENCE.md`.\n\n"
        + "\n".join(f"- {s.splitlines()[0][4:]}" for s in sections if s.startswith("### "))
        + "\n\n---\n"
    )
    out_path.write_text(header + "\n".join(sections), encoding="utf-8")
    print(f"wrote {out_path} ({out_path.stat().st_size} bytes)", flush=True)
    if errors:
        raise SystemExit(f"OCR errors: {', '.join(errors)}")


if __name__ == "__main__":
    main()
