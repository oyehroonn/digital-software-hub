#!/usr/bin/env python
"""
Batch processor: loops through ALL products in products.xlsx,
creates folders in models/, extracts the EMBEDDED image that is
anchored to each product's row, applies it as a texture on box.glb.

Emits BOTH:
  1. models/{id}_{short_name}/model.glb   (folder layout, consumed by api.py)
  2. public/models/{id}.glb               (FLAT layout, what the website loads)
  3. models/manifest.json                 (id → name → sku → file, + api fields)

IMPORTANT (image mapping fix):
  Images are matched to products by their DRAWING ANCHOR (the row the picture
  actually sits on) — NOT by the alphabetical order of the hash-named files in
  xl/media/. The media files are named by content hash, so their sorted order
  does NOT follow row order; the old index-based mapping mis-assigned textures.

This script is idempotent: products that already have a flat {id}.glb are
skipped, so it can be re-run cheaply. A full 478-model regen is a Wave-3 task —
running this now only fills gaps.
"""

import os
import sys
import io
import json
import re
import shutil
import traceback
from pathlib import Path

# ── Imports ──────────────────────────────────────────────────────────────
try:
    import openpyxl
except ImportError:
    sys.exit("ERROR: pip install --user openpyxl")

try:
    import trimesh
except ImportError:
    sys.exit("ERROR: pip install --user trimesh")

try:
    from PIL import Image
except ImportError:
    sys.exit("ERROR: pip install --user pillow")

# AVIF support — some images in the xlsx are AVIF with a .jpg extension
try:
    import pillow_avif  # noqa: F401 — registers AVIF opener with Pillow
except ImportError:
    print("WARNING: pillow-avif-plugin not installed. AVIF images may fail.")
    print("  Install with: pip install --user pillow-avif-plugin")

try:
    import numpy as np
except ImportError:
    sys.exit("ERROR: pip install --user numpy")

try:
    from scipy import ndimage
except ImportError:
    sys.exit("ERROR: pip install --user scipy")


# ── Config (all paths anchored to this file's directory) ─────────────────
HERE          = Path(__file__).resolve().parent
EXCEL_PATH    = HERE / "products.xlsx"
BASE_GLB      = HERE / "box.glb"
MODELS_DIR    = HERE / "models"                       # folder layout for api.py
PUBLIC_MODELS = HERE.parent / "public" / "models"     # FLAT layout for the site
MANIFEST_PATH = MODELS_DIR / "manifest.json"
MAX_FOLDER    = 60           # max chars for folder name
GLB_FILENAME  = "model.glb"  # short, predictable per-folder output name


# ── Helpers ──────────────────────────────────────────────────────────────

def sanitize(name: str, max_len: int = MAX_FOLDER) -> str:
    """Turn a product name into a safe folder/file name."""
    name = re.sub(r'[&;]+amp;?', 'and', name)            # &amp; → and
    name = re.sub(r'[–—]', '-', name)                     # em/en dash
    name = re.sub(r'[^A-Za-z0-9 _\-]', '', name).strip()
    name = re.sub(r'\s+', '_', name)
    if len(name) > max_len:
        name = name[:max_len].rstrip('_')
    return name


def read_products_with_rows(xlsx_path):
    """Read every product row, returning dicts that carry their 1-indexed
    worksheet row so images can be matched by drawing anchor."""
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb.active
    headers = [c.value or f"Col{c.column}" for c in ws[1]]
    products = []
    for r in range(2, ws.max_row + 1):
        values = [ws.cell(r, c).value for c in range(1, len(headers) + 1)]
        p = dict(zip(headers, values))
        if p.get('ID') is not None:
            p['_row'] = r          # 1-indexed worksheet row
            products.append(p)
    return products


def build_row_image_map(xlsx_path):
    """Map 1-indexed worksheet row → (PIL image bytes, ext) using the drawing
    anchors. This is the authoritative image↔product mapping."""
    wb = openpyxl.load_workbook(xlsx_path)  # keep drawings (no data_only)
    ws = wb.active
    row_to_image = {}
    for img in getattr(ws, "_images", []):
        try:
            ws_row = img.anchor._from.row + 1   # anchor row is 0-indexed
        except Exception:
            continue
        try:
            data = img._data()
        except Exception:
            continue
        ext = (getattr(img, "format", None) or "png").lower()
        # first anchor for a row wins (rows have at most one image here)
        row_to_image.setdefault(ws_row, (data, ext))
    return row_to_image


def apply_texture(glb_path, texture_img: Image.Image, output_path):
    """Apply a (already-opened) texture image to a GLB, preserving original
    UVs. Same known-good logic as process_product.py."""
    scene = trimesh.load(str(glb_path))

    texture_img.load()

    # EXIF orientation
    try:
        from PIL.ExifTags import ORIENTATION
        exif = texture_img._getexif()
        if exif:
            o = exif.get(ORIENTATION)
            if o == 3:   texture_img = texture_img.rotate(180, expand=True)
            elif o == 6: texture_img = texture_img.rotate(270, expand=True)
            elif o == 8: texture_img = texture_img.rotate(90, expand=True)
    except Exception:
        pass

    # Handle alpha → fill transparent with nearest opaque colour (no black edges)
    if texture_img.mode == 'RGBA':
        arr = np.array(texture_img)
        rgb = arr[:, :, :3].copy()
        alpha = arr[:, :, 3]
        opaque = alpha > 128
        transparent = ~opaque
        if transparent.any() and opaque.any():
            idx = ndimage.distance_transform_edt(
                transparent, return_distances=False, return_indices=True
            )
            for c in range(3):
                ch = rgb[:, :, c]
                ch[transparent] = ch[idx[0][transparent], idx[1][transparent]]
                rgb[:, :, c] = ch
        texture_img = Image.fromarray(rgb, 'RGB')
    elif texture_img.mode != 'RGB':
        texture_img = texture_img.convert('RGB')

    # Resize to power-of-2, clamped to [512, 2048]
    mx = max(texture_img.width, texture_img.height)
    p2 = 2 ** ((mx - 1).bit_length())
    p2 = max(512, min(2048, p2))
    final = texture_img.resize((p2, p2), Image.Resampling.LANCZOS)

    # Save texture next to the model for debugging
    final.save(os.path.join(os.path.dirname(output_path), 'texture.png'))

    # Apply to mesh, keep original UVs
    if hasattr(scene, 'geometry'):
        for _name, mesh in scene.geometry.items():
            if not hasattr(mesh, 'visual'):
                continue
            try:
                mesh.visual.material = trimesh.visual.material.PBRMaterial(
                    baseColorTexture=final, metallicFactor=0.0, roughnessFactor=1.0,
                )
            except Exception:
                try:
                    mesh.visual.material = trimesh.visual.material.SimpleMaterial(image=final)
                except Exception:
                    pass

    scene.export(str(output_path))


# ── Main ─────────────────────────────────────────────────────────────────

def main():
    if not EXCEL_PATH.exists():
        sys.exit(f"ERROR: {EXCEL_PATH} not found")
    if not BASE_GLB.exists():
        sys.exit(f"ERROR: {BASE_GLB} not found")

    print("=" * 70)
    print("  DSM-3D  ·  Batch Product Processor  (anchor-based mapping)")
    print("=" * 70)

    products = read_products_with_rows(EXCEL_PATH)
    print(f"\n📦 Found {len(products)} products in {EXCEL_PATH.name}")

    print("🖼  Mapping embedded images to rows via drawing anchors …")
    row_images = build_row_image_map(EXCEL_PATH)
    print(f"   {len(row_images)} anchored images mapped")

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_MODELS.mkdir(parents=True, exist_ok=True)

    manifest = []
    total = len(products)
    success = skipped = errors = no_image = 0

    for idx, product in enumerate(products):
        pid  = product.get('ID', 'unknown')
        name = str(product.get('Name') or f'product_{pid}')
        sku  = product.get('SKU')
        row  = product.get('_row')
        safe = sanitize(name)
        folder_name = f"{pid}_{safe}"
        folder_path = MODELS_DIR / folder_name
        output_glb  = folder_path / GLB_FILENAME
        flat_glb    = PUBLIC_MODELS / f"{pid}.glb"

        def record(status):
            manifest.append({
                "id":     pid,
                "name":   name,
                "sku":    sku,
                "file":   f"{pid}.glb" if status == "ok" else None,  # flat, site-loaded
                "folder": folder_name,
                "glb":    GLB_FILENAME if status == "ok" else None,  # api.py compat
                "status": status,
            })

        print(f"\n[{idx+1}/{total}] ID={pid}  row={row}  {name[:50]}")

        # Idempotent: if the flat file the site loads already exists, keep it.
        if flat_glb.exists():
            print("   ⏭  Flat GLB already exists, skipping")
            record("ok")
            skipped += 1
            continue

        img_entry = row_images.get(row)
        if img_entry is None:
            print("   ⚠  No embedded image anchored to this row")
            record("no_image")
            no_image += 1
            continue

        data, _ext = img_entry
        folder_path.mkdir(parents=True, exist_ok=True)
        try:
            texture_img = Image.open(io.BytesIO(data))
            apply_texture(BASE_GLB, texture_img, output_glb)
            shutil.copy2(output_glb, flat_glb)   # publish flat copy for the site
            print(f"   ✅ → {output_glb.name}  +  public/models/{pid}.glb")
            record("ok")
            success += 1
        except Exception as e:
            print(f"   ❌ Error: {e}")
            traceback.print_exc()
            record(f"error: {e}")
            errors += 1

    with open(MANIFEST_PATH, 'w') as f:
        json.dump(manifest, f, indent=2, default=str)
    print(f"\n📝 Manifest written to {MANIFEST_PATH}")

    print("\n" + "=" * 70)
    print(f"  DONE  ·  ✅ {success} built  ⏭ {skipped} skipped  "
          f"⚠ {no_image} no-image  ❌ {errors} errors")
    print(f"  Flat models: {PUBLIC_MODELS}/")
    print(f"  Folder models: {MODELS_DIR}/")
    print("=" * 70)


if __name__ == "__main__":
    main()
