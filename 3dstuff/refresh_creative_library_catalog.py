#!/usr/bin/env python3
"""Add human-readable, exact product lists to the shared creative library."""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIBRARY = Path("/Users/hico/Desktop/DSM Creative Box Library")
DESIGNS = LIBRARY / "01_DESIGNS"
INVENTORY = HERE.parent / "src" / "data" / "creativeInventory.json"

# Directory labels must remain short enough for filesystem portability. The linked
# CONTENTS.txt files carry the complete product-by-product list.
VISIBLE_SUMMARIES = {
    "Autodesk 2025 Boxes": "AutoCAD LT, 3ds Max, Alias, Arnold +13",
    "Autodesk 2027 Boxes": "3ds Max, AutoCAD, AutoCAD LT, Alias +14",
    "Boxes 1-10": "Dynamics 365, Microsoft 365, Office, Windows",
    "Loose Office 2024": "Office 2024 Professional Plus MAK",
    "Microsoft 365": "Business, Copilot, E3-E5, Teams, Power Automate",
    "Microsoft Office 2021": "Home & Business, Home & Student, Professional",
    "Microsoft Office 2024": "Home, Professional Plus, Home & Business, LTSC",
    "Microsoft Windows 10": "Pro, Enterprise, LTSC-LTSB, Home, Workstation",
    "Microsoft Windows 11 Boxes": "Home, Pro, Enterprise, LTSC, IoT",
    "New Autodesk 2026 Boxes": "3ds Max, Alias, Arnold, AutoCAD +14",
    "Previously Extracted Autodesk 2027": "3ds Max, AutoCAD, Alias, AEC +14",
    "Previously Extracted Microsoft": "Dynamics, Microsoft 365, Office, Windows",
}


def clean_title(value: str) -> str:
    return re.sub(r"\s*\(\)\s*$", "", value).strip()


def source_for(folder: Path) -> str | None:
    source = folder / "SOURCE.txt"
    if not source.exists():
        return None
    for line in source.read_text().splitlines():
        if line.startswith("Original front: "):
            return line.removeprefix("Original front: ")
    return None


def main() -> None:
    inventory = json.loads(INVENTORY.read_text())
    by_source = {item["source"]["front"]: item for item in inventory["designs"]}
    zip_by_collection = {item["name"].casefold(): item["zip_name"] for item in inventory["collections"]}
    sections: list[str] = []
    exact_overview: list[str] = ["DSM CREATIVE DESIGNS — EXACT COLLECTION CONTENTS", ""]

    for collection in sorted(path for path in DESIGNS.iterdir() if path.is_dir()):
        collection_key = collection.name.split(" (", 1)[0]
        products: list[tuple[str, str]] = []
        for folder in sorted(path for path in collection.iterdir() if path.is_dir()):
            source = source_for(folder)
            item = by_source.get(source or "")
            title = clean_title(item["title"]) if item else folder.name.replace("-", " ")
            products.append((title, folder.name))

        zip_name = zip_by_collection.get(collection_key.casefold(), "Previously extracted source files")
        text = (
            f"{collection.name}\n"
            f"Source archive: {zip_name}\n"
            f"Contains {len(products)} exact designs:\n\n"
            + "\n".join(f"- {title}" for title, _ in products)
            + "\n\nEach product folder contains front.png, back.png, spine.png, and SOURCE.txt.\n"
        )
        (collection / "CONTENTS.txt").write_text(text)
        exact_overview.extend([text, ""])
        items = "".join(
            f"<li><a href='{html.escape(folder)}/'>{html.escape(title)}</a></li>" for title, folder in products
        )
        (collection / "index.html").write_text(
            "<!doctype html><meta charset='utf-8'>"
            f"<title>{html.escape(collection.name)} – DSM Creative Box Library</title>"
            "<style>body{font:16px system-ui;background:#101114;color:#eee;max-width:900px;margin:48px auto;padding:0 20px}a{color:#ff6257}li{margin:9px 0}</style>"
            f"<p><a href='../'>← All collections</a></p><h1>{html.escape(collection.name)}</h1>"
            f"<p><b>Source archive:</b> {html.escape(zip_name)} · <b>{len(products)} designs</b></p>"
            f"<p><a href='CONTENTS.txt'>Download/read the exact product list</a></p><ol>{items}</ol>"
        )
        section_items = "".join(f"<li>{html.escape(title)}</li>" for title, _ in products)
        visible_label = f"{collection_key} ({VISIBLE_SUMMARIES.get(collection_key, f'{len(products)} designs')})"
        sections.append(
            f"<section><h2><a href='{html.escape(collection.name)}/'>{html.escape(visible_label)}</a></h2>"
            f"<p>Source archive: {html.escape(zip_name)} · {len(products)} designs</p><ul>{section_items}</ul></section>"
        )

    (DESIGNS / "index.html").write_text(
        "<!doctype html><meta charset='utf-8'><title>DSM Creative Designs</title>"
        "<style>body{font:16px system-ui;background:#101114;color:#eee;max-width:1000px;margin:48px auto;padding:0 20px}a{color:#ff6257}section{border-top:1px solid #333;padding:18px 0}h2{margin-bottom:4px}p{color:#bbb}li{margin:5px 0}</style>"
        "<p><a href='../'>← DSM Creative Box Library</a></p><h1>All creative designs, by collection</h1>"
        "<p>Collection names preserve the supplied ZIP/source names. Each list below shows the exact box designs in that folder.</p>"
        + "".join(sections)
    )
    (DESIGNS / "00 - EXACT COLLECTION CONTENTS.txt").write_text("\n".join(exact_overview))
    print(f"Added exact product indexes to {len(sections)} collections")


if __name__ == "__main__":
    main()
