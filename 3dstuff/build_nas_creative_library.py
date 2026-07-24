#!/usr/bin/env python3
"""Create a browser-friendly DSM creative-box library for NAS sharing."""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE / "creative-boxes"
DOWNLOADS = Path("/Users/hico/Downloads/New Folder With Items 3")
LIBRARY = Path("/Users/hico/Desktop/DSM Creative Box Library")
INVENTORY = HERE.parent / "src" / "data" / "creativeInventory.json"
CHECKLIST = HERE / "CREATIVE_BOXES_CHECKLIST.md"


def slug(value: str) -> str:
    value = re.sub(r"\bfront\b", "", value, flags=re.I)
    value = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-")
    return value[:90] or "unnamed-design"


def collection_for(path: Path) -> str:
    relative = path.relative_to(ROOT)
    if relative.parts[0] == "new-collections":
        return relative.parts[1]
    if relative.parts[0] == "autodesk":
        return "Previously Extracted Autodesk 2027"
    if relative.parts[0] == "microsoft":
        return "Previously Extracted Microsoft"
    return "Previously Extracted"


def component_paths(front: Path) -> tuple[Path | None, Path | None]:
    match = re.match(r"(\d+)\b", front.name)
    siblings = list(front.parent.glob("*.png"))
    candidates = [p for p in siblings if match and p.name.startswith(match.group(1))]
    back = next((p for p in candidates if "back" in p.name.lower()), None)
    spine = next((p for p in candidates if "spine" in p.name.lower()), None)
    return back, spine


def main() -> None:
    if LIBRARY.exists():
        raise SystemExit(f"Refusing to overwrite existing library: {LIBRARY}")
    raw = LIBRARY / "00_RAW_ZIPS"
    designs = LIBRARY / "01_DESIGNS"
    upload = LIBRARY / "02_UPLOAD_YOUR_DESIGNS"
    inventory_dir = LIBRARY / "03_INVENTORY"
    for directory in (raw, designs, upload, inventory_dir):
        directory.mkdir(parents=True)

    for archive in sorted(DOWNLOADS.glob("*.zip")):
        shutil.copy2(archive, raw / archive.name)
    loose = raw / "Loose Office 2024 Assets"
    loose.mkdir()
    for asset in sorted(DOWNLOADS.glob("*.png")):
        shutil.copy2(asset, loose / asset.name)

    copied = 0
    for front in sorted(path for path in ROOT.rglob("*.png") if "front" in path.name.lower()):
        collection = collection_for(front)
        label = slug(re.sub(r"^\s*\d+\s*", "", front.stem))
        destination = designs / collection / label
        suffix = 2
        while destination.exists():
            destination = designs / collection / f"{label}-{suffix}"
            suffix += 1
        destination.mkdir(parents=True)
        shutil.copy2(front, destination / "front.png")
        back, spine = component_paths(front)
        if back:
            shutil.copy2(back, destination / "back.png")
        if spine:
            shutil.copy2(spine, destination / "spine.png")
        (destination / "SOURCE.txt").write_text(
            f"Collection: {collection}\nOriginal front: {front.relative_to(ROOT)}\n"
            "Usage: front.png maps to the box front; back.png maps to the physical rear; "
            "spine.png maps to the right side and mirrored left side.\n"
        )
        copied += 1

    shutil.copy2(CHECKLIST, inventory_dir / CHECKLIST.name)
    shutil.copy2(INVENTORY, inventory_dir / INVENTORY.name)
    (upload / "README.txt").write_text(
        "Drop new designs here. Use one folder per product and name assets exactly:\n"
        "  front.png — front face\n  back.png — physical rear face\n  spine.png — right side; system mirrors it for the left side\n"
        "After uploading, ask DSM to inventory and import the new design.\n"
    )
    (LIBRARY / "README.txt").write_text(
        "DSM CREATIVE BOX LIBRARY\n\n"
        "Browse 01_DESIGNS, open a collection, open a product folder, then click front.png, back.png, or spine.png to preview it.\n\n"
        "Image mapping contract:\n"
        "- front.png is printed on the front face.\n"
        "- back.png is printed on the physical rear face (including quote/text artwork).\n"
        "- spine.png is printed on the right side and mirrored for the left side.\n\n"
        "00_RAW_ZIPS preserves the supplied archives. 02_UPLOAD_YOUR_DESIGNS is the intake folder for new artwork.\n"
        "03_INVENTORY contains the complete WordPress comparison, source collection names, live-model status, and missing-design checklist.\n"
    )
    (LIBRARY / "index.html").write_text(
        "<!doctype html><meta charset='utf-8'><title>DSM Creative Box Library</title>"
        "<style>body{font:16px system-ui;background:#101114;color:#eee;max-width:900px;margin:48px auto;padding:0 20px}a{color:#ff6257}li{margin:10px 0}</style>"
        "<h1>DSM Creative Box Library</h1><p>Open a collection, then a design folder, then any image to preview it.</p>"
        "<ul><li><a href='01_DESIGNS/'>Browse designs</a></li><li><a href='00_RAW_ZIPS/'>Raw ZIPs</a></li>"
        "<li><a href='02_UPLOAD_YOUR_DESIGNS/'>Upload your own designs</a></li><li><a href='03_INVENTORY/'>Inventory and missing checklist</a></li></ul>"
        "<p><a href='README.txt'>How artwork is mapped</a></p>"
    )
    print(f"Created {LIBRARY} with {copied} design folders")


if __name__ == "__main__":
    main()
