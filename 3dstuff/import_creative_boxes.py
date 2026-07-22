#!/usr/bin/env python3
"""Import approved designer box fronts as thin DSM GLBs.

The source artwork is extracted from the supplied creative archives into
`creative-boxes/`.  Every discovered *front* asset receives a dedicated model
in the 99001+ range.  The curated eight remain first and are used by the
catalogue, DSM Choice, and Autodesk feature.
"""
import json
import re
import shutil
from pathlib import Path

from PIL import Image
from batch_process import BASE_GLB, MODELS_DIR, PUBLIC_MODELS, apply_texture

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "creative-boxes"
MANIFEST = MODELS_DIR / "manifest.json"

CURATED = [
    ("Microsoft Office 2024 Professional Plus MAK", "microsoft/01 Microsoft Office 2024 Professional Plus MAK front.png"),
    ("Microsoft Office 2024 Standard LTSC MAK", "microsoft/02 Microsoft Office 2024 Standard LTSC MAK front.png"),
    ("Microsoft Windows 11 Professional MAK", "microsoft/windows-11/01 Windows 11 Pro Front.png"),
    ("Microsoft Windows 10 Professional MAK", "microsoft/04 Microsoft Windows 10 Professional MAK front.png"),
    ("Dynamics 365 Finance", "microsoft/05 Dynamics 365 Finance front.png"),
    ("Dynamics 365 Project Operations", "microsoft/06 Dynamics 365 Project Operations front.png"),
    ("Microsoft 365 E5", "microsoft/09 Microsoft 365 E5 1 Year Subscription front.png"),
    ("Autodesk AEC Collection 2027", "autodesk/New folder/04 Autodesk Architecture, Engineering & Construction (AEC) Collection 2027 (Front).png"),
]

def slug(value: str) -> str:
    return re.sub(r"_+", "_", re.sub(r"[^A-Za-z0-9]+", "_", value)).strip("_")[:58]

def title_from_path(path: Path) -> str:
    name = re.sub(r"\s*\((front)\)\s*", "", path.stem, flags=re.I)
    name = re.sub(r"^\d+\s+", "", name)
    return re.sub(r"\s+", " ", name).strip()

def discovered():
    known = {Path(p).as_posix() for _, p in CURATED}
    remainder = []
    for path in sorted(SOURCE.rglob("*.png")):
        if "front" not in path.name.lower():
            continue
        rel = path.relative_to(SOURCE).as_posix()
        if rel not in known:
            remainder.append((title_from_path(path), rel))
    return CURATED + remainder

def main():
    if not SOURCE.exists():
        raise SystemExit(f"Missing creative source folder: {SOURCE}")
    entries = discovered()
    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else []
    manifest = [m for m in manifest if not (99001 <= int(m.get("id", 0)) < 99200)]
    PUBLIC_MODELS.mkdir(parents=True, exist_ok=True)
    result = []
    for offset, (name, rel) in enumerate(entries):
        pid = 99001 + offset
        folder = f"{pid}_{slug(name)}"
        destination = MODELS_DIR / folder
        destination.mkdir(parents=True, exist_ok=True)
        source = SOURCE / rel
        cover = Image.open(source).convert("RGB")
        shutil.copy2(source, destination / "creative-front.png")
        apply_texture(BASE_GLB, cover, destination / "model.glb")
        shutil.copy2(destination / "model.glb", PUBLIC_MODELS / f"{pid}.glb")
        entry = {"id": pid, "name": name, "folder": folder, "glb": "model.glb", "status": "ok", "creative_design": True, "source": rel}
        manifest.append(entry)
        result.append(entry)
        print(f"[{pid}] {name}")
    MANIFEST.write_text(json.dumps(manifest, indent=2))
    (MODELS_DIR / "creative-manifest.json").write_text(json.dumps(result, indent=2))
    print(f"Imported {len(result)} creative boxes")

if __name__ == "__main__":
    main()
