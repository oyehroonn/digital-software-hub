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


# ── Box geometry (real software-box proportions, NOT a flat slab) ─────────
# Front face is portrait (W x H); D is a healthy depth so the box never reads
# as a paper-thin slab after the viewer normalises its size.
BOX_W = 1.5   # x  (cover width)
BOX_H = 2.1   # y  (cover height)
BOX_D = 0.5   # z  (spine depth)

# trimesh's glTF exporter flips V on write, and three.js' GLTFLoader samples
# with v=0 at the image BOTTOM. Verified with a marker render: the cover must
# be authored with bottom vertices at v=0 so it appears upright (not flipped).
FLIP_V = True


def _prep_cover(texture_img: Image.Image) -> Image.Image:
    """EXIF-correct, de-alpha and return an RGB cover image."""
    texture_img.load()

    # Palette / grey-with-alpha images: promote to RGBA first so the alpha
    # fill below runs (a plain .convert('RGB') would bake transparent pixels to
    # a stray palette colour — often black — around the product).
    if texture_img.mode in ('P', 'LA', 'PA') or (
        texture_img.mode == 'L' and 'transparency' in texture_img.info
    ):
        texture_img = texture_img.convert('RGBA')

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
    return texture_img


def _edge_color(img: Image.Image):
    """Median colour of the cover's border → used for the spine/sides and the
    letterbox so the whole box reads as one cohesive object."""
    a = np.asarray(img)
    if a.ndim != 3:
        return (238, 240, 244)
    b = max(2, min(a.shape[0], a.shape[1]) // 40)
    strip = np.concatenate([
        a[:b].reshape(-1, 3), a[-b:].reshape(-1, 3),
        a[:, :b].reshape(-1, 3), a[:, -b:].reshape(-1, 3),
    ])
    return tuple(int(x) for x in np.median(strip, axis=0))


def _build_atlas(cover: Image.Image, side_color, size: int = 2048):
    """Composite a single texture atlas:
        left column  (u 0..cover_u) = the product cover, aspect-fit + letterboxed
        right column (u cover_u..1) = a flat panel of `side_color`
    Returns (atlas_image, cover_u)."""
    atlas = Image.new('RGB', (size, size), side_color)
    cover_w = int(round(size * (BOX_W / BOX_H)))   # front-face aspect region
    region = Image.new('RGB', (cover_w, size), side_color)
    cw, ch = cover.size
    scale = min(cover_w / cw, size / ch)
    nw, nh = max(1, int(round(cw * scale))), max(1, int(round(ch * scale)))
    resized = cover.resize((nw, nh), Image.Resampling.LANCZOS)
    region.paste(resized, ((cover_w - nw) // 2, (size - nh) // 2))
    atlas.paste(region, (0, 0))
    return atlas, cover_w / size


def apply_texture(glb_path, texture_img: Image.Image, output_path):
    """Build a fresh, correctly-UV'd software box and texture it with the
    product cover.

    The base `box.glb` ships a *packed* UV unwrap: every one of the 6 faces is
    mapped to a different (and differently-rotated) sub-rectangle of the 0..1
    texture. Painting the whole cover across that atlas — as the old code did —
    made each face sample a different rotated/mirrored slice, so back/side
    faces showed reversed gibberish. We therefore ignore box.glb's UVs and
    author our own geometry: the cover goes on the FRONT and BACK faces
    upright and un-mirrored; the spine/top/bottom get a flat brand colour
    sampled from the cover's edge. `glb_path` is kept for signature compat.
    """
    cover = _prep_cover(texture_img)
    side = _edge_color(cover)
    atlas, cu = _build_atlas(cover, side)
    atlas.save(os.path.join(os.path.dirname(output_path), 'texture.png'))

    hx, hy, hz = BOX_W / 2.0, BOX_H / 2.0, BOX_D / 2.0

    V, F, UV = [], [], []

    def add_face(quad, uvs):
        # quad given CCW as seen from OUTSIDE → outward normals, front-facing.
        i = len(V)
        V.extend(quad)
        UV.extend(uvs)
        F.append([i, i + 1, i + 2])
        F.append([i, i + 2, i + 3])

    # Cover UVs for [BL, BR, TR, TL] with glTF top-left origin.
    v_bottom, v_top = (0.0, 1.0) if FLIP_V else (1.0, 0.0)
    cover_uv = [(0.0, v_bottom), (cu, v_bottom), (cu, v_top), (0.0, v_top)]
    # A single point inside the flat side panel → uniform colour, no distortion.
    sp = (cu + (1.0 - cu) / 2.0, 0.5)
    side_uv = [sp, sp, sp, sp]

    # FRONT (+Z): cover, upright.  Quad order BL, BR, TR, TL.
    add_face([(-hx, -hy,  hz), ( hx, -hy,  hz), ( hx,  hy,  hz), (-hx,  hy,  hz)], cover_uv)
    # BACK (-Z): cover, upright & un-mirrored when viewed from behind.
    add_face([( hx, -hy, -hz), (-hx, -hy, -hz), (-hx,  hy, -hz), ( hx,  hy, -hz)], cover_uv)
    # RIGHT (+X): flat side panel.
    add_face([( hx, -hy,  hz), ( hx, -hy, -hz), ( hx,  hy, -hz), ( hx,  hy,  hz)], side_uv)
    # LEFT (-X): flat side panel.
    add_face([(-hx, -hy, -hz), (-hx, -hy,  hz), (-hx,  hy,  hz), (-hx,  hy, -hz)], side_uv)
    # TOP (+Y): flat side panel.
    add_face([(-hx,  hy,  hz), ( hx,  hy,  hz), ( hx,  hy, -hz), (-hx,  hy, -hz)], side_uv)
    # BOTTOM (-Y): flat side panel.
    add_face([(-hx, -hy, -hz), ( hx, -hy, -hz), ( hx, -hy,  hz), (-hx, -hy,  hz)], side_uv)

    mesh = trimesh.Trimesh(
        vertices=np.array(V, dtype=np.float64),
        faces=np.array(F, dtype=np.int64),
        process=False,
    )
    material = trimesh.visual.material.PBRMaterial(
        baseColorTexture=atlas, metallicFactor=0.0, roughnessFactor=0.85,
    )
    mesh.visual = trimesh.visual.TextureVisuals(
        uv=np.array(UV, dtype=np.float64), material=material,
    )
    mesh.export(str(output_path))


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
