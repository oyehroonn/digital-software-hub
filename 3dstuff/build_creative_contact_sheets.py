#!/usr/bin/env python3
"""Render contact sheets for every DSM creative-box collection."""
from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

LIBRARY = Path("/Users/hico/Desktop/DSM Creative Box Library")
DESIGNS = LIBRARY / "01_DESIGNS"
OUTPUT = LIBRARY / "04_CONTACT_SHEETS"
THUMB_W, THUMB_H = 190, 265
LABEL_H, GAP, PAD = 48, 18, 28
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def fit(image: Image.Image) -> Image.Image:
    return ImageOps.contain(image.convert("RGB"), (THUMB_W, THUMB_H), Image.Resampling.LANCZOS)


def label(draw: ImageDraw.ImageDraw, text: str, x: int, y: int, max_width: int, font: ImageFont.FreeTypeFont) -> None:
    words, lines, line = text.replace("-", " ").split(), [], ""
    for word in words:
        candidate = (line + " " + word).strip()
        if draw.textlength(candidate, font=font) <= max_width:
            line = candidate
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    for index, line in enumerate(lines[:3]):
        draw.text((x, y + index * 14), line, font=font, fill="#d7d7dc")


def sheet(title: str, items: list[tuple[str, Path]], output: Path, columns: int = 5) -> None:
    title_font = ImageFont.truetype(BOLD, 28)
    text_font = ImageFont.truetype(FONT, 13)
    rows = math.ceil(len(items) / columns)
    cell_w, cell_h = THUMB_W + GAP, THUMB_H + LABEL_H + GAP
    canvas = Image.new("RGB", (PAD * 2 + columns * cell_w - GAP, 84 + PAD + rows * cell_h - GAP), "#111217")
    draw = ImageDraw.Draw(canvas)
    draw.text((PAD, 24), title, font=title_font, fill="#ffffff")
    draw.text((PAD, 57), f"{len(items)} front designs · front / back / spine files are stored beside each design", font=text_font, fill="#a0a0aa")
    for index, (name, path) in enumerate(items):
        x = PAD + (index % columns) * cell_w
        y = 84 + (index // columns) * cell_h
        image = fit(Image.open(path))
        panel = Image.new("RGB", (THUMB_W, THUMB_H), "#f6f6f4")
        panel.paste(image, ((THUMB_W - image.width) // 2, (THUMB_H - image.height) // 2))
        canvas.paste(panel, (x, y))
        label(draw, name, x, y + THUMB_H + 8, THUMB_W, text_font)
    canvas.save(output, quality=92)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    all_items: list[tuple[str, Path]] = []
    for collection in sorted(path for path in DESIGNS.iterdir() if path.is_dir()):
        items = [(folder.name, folder / "front.png") for folder in sorted(collection.iterdir()) if (folder / "front.png").exists()]
        if items:
            sheet(collection.name, items, OUTPUT / f"{collection.name}.jpg")
            all_items.extend((f"{collection.name} · {name}", path) for name, path in items)
    sheet("DSM Creative Box Library — Master Contact Sheet", all_items, OUTPUT / "00-MASTER-ALL-DESIGNS.jpg", columns=7)
    (OUTPUT / "README.txt").write_text("Each JPG is a visual review sheet. Use these before selecting, importing, or replacing any creative box design.\n")
    print(f"Rendered {len(all_items)} designs into {len(list(OUTPUT.glob('*.jpg')))} contact sheets")


if __name__ == "__main__":
    main()
