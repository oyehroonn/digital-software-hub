#!/usr/bin/env python
"""
Generate DSM-style box-front textures for DSM's OWN products, then texture
them onto box.glb via the same UV-preserving pipeline used by batch_process.py.

Emits, for each product:
  models/{id}_{slug}/model.glb   (folder layout, consumed by api.py)
  models/{id}_{slug}/texture.png (the generated cover art)
  {id}.glb copied into --flat-out (public/models flat layout for the site)

And appends/updates entries in models/manifest.json.

Run with a python that has trimesh, PIL, numpy, scipy (the VPS venv).
"""
import os, io, re, json, sys, shutil, argparse
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import numpy as np

HERE = Path(__file__).resolve().parent
BASE_GLB = HERE / "box.glb"
MODELS_DIR = HERE / "models"
MANIFEST = MODELS_DIR / "manifest.json"
ASSETS = HERE  # dsm.png / dsm-white.png live next to the script

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# ── Product catalogue (DSM originals) ─────────────────────────────────────
# id, name, tagline, glyph, accent_top(hex), accent_bottom(hex)
PRODUCTS = [
    (90001, "DSM",              "Digital Software Market", "DSM", "1e3a8a", "2563eb"),
    (90002, "Virtual Sizing",   "AI Body Measurement",     "VS",  "0d9488", "14b8a6"),
    (90003, "Virtual Try-On",   "AR Fashion Fitting",      "VT",  "7c3aed", "db2777"),
    (90004, "Pointblank",       "Precision Analytics",     "PB",  "b91c1c", "ef4444"),
    (90005, "PreserveMy.World", "Digital Legacy Vault",    "PW",  "047857", "10b981"),
    (90006, "VPO",              "Virtual Print Office",    "VPO", "c2410c", "f97316"),
    (90007, "TechRealm",        "Cloud & AI Platform",     "TR",  "4338ca", "6366f1"),
    (90008, "LogicPacks",       "Automation Toolkit",      "LP",  "1d4ed8", "3b82f6"),
    (90009, "Lazyware",         "Effortless Workflows",    "LZ",  "0e7490", "06b6d4"),
    (90010, "Bringit",          "On-Demand Delivery",      "B",   "15803d", "22c55e"),
    (90011, "FlyAquab",         "Aquatic Drone Systems",   "FA",  "0369a1", "0ea5e9"),
    (90012, "Apex",             "Performance Suite",       "AX",  "334155", "d97706"),
    (90013, "Ummah Directory",  "Community Directory",     "UD",  "a16207", "eab308"),
]

W = H = 1024
SPINE_W = 190


def hx(h):
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def sanitize(name, max_len=60):
    name = re.sub(r'[&;]+amp;?', 'and', name)
    name = re.sub(r'[–—]', '-', name)
    name = re.sub(r'[^A-Za-z0-9 _\-]', '', name).strip()
    name = re.sub(r'\s+', '_', name)
    return name[:max_len].rstrip('_')


def vgrad(size, top, bottom):
    """Vertical gradient image."""
    w, h = size
    top = np.array(top, float); bottom = np.array(bottom, float)
    t = np.linspace(0, 1, h)[:, None]
    col = (top[None, :] * (1 - t) + bottom[None, :] * t)  # h x 3
    arr = np.repeat(col[:, None, :], w, axis=1).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size[0]-1, size[1]-1], radius=radius, fill=255)
    return m


def fit_font(path, text, max_w, start, min_size=28):
    s = start
    while s > min_size:
        f = ImageFont.truetype(path, s)
        if f.getbbox(text)[2] <= max_w:
            return f
        s -= 2
    return ImageFont.truetype(path, min_size)


def wrap(draw, text, font, max_w):
    words = text.split()
    lines, cur = [], ""
    for w_ in words:
        trial = (cur + " " + w_).strip()
        if draw.textlength(trial, font=font) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w_
    if cur:
        lines.append(cur)
    return lines


def make_cover(name, tagline, glyph, atop, abot):
    top, bot = hx(atop), hx(abot)
    img = Image.new("RGB", (W, H), (255, 255, 255))

    # subtle main-area vertical wash
    wash = vgrad((W, H), (255, 255, 255), (238, 242, 246))
    img.paste(wash, (0, 0))

    d = ImageDraw.Draw(img)

    # ── left spine (the visible side of the box) ──
    spine = vgrad((SPINE_W, H), top, bot)
    img.paste(spine, (0, 0))
    sd = ImageDraw.Draw(img)

    # DSM white logo on the spine (rotated, reading upward), near top
    try:
        dsm_w = Image.open(ASSETS / "dsm-white.png").convert("RGBA")
        ratio = 150 / dsm_w.width
        dsm_w = dsm_w.resize((150, int(dsm_w.height * ratio)), Image.LANCZOS)
        dsm_w = dsm_w.rotate(90, expand=True)
        img.paste(dsm_w, (int((SPINE_W - dsm_w.width) / 2), 70), dsm_w)
    except Exception as e:
        print("  spine logo skipped:", e)

    # spine tagline text (vertical, bottom)
    strip = Image.new("RGBA", (620, 46), (0, 0, 0, 0))
    ImageDraw.Draw(strip).text(
        (0, 0), "A  DSM  ORIGINAL", font=ImageFont.truetype(FONT_BOLD, 30),
        fill=(255, 255, 255, 235))
    strip = strip.rotate(90, expand=True)
    img.paste(strip, (int((SPINE_W - strip.width) / 2) + 4, H - strip.height - 60), strip)

    mx = SPINE_W + 46   # main-area left margin

    # ── DSM horizontal logo, top of face ──
    try:
        dsm = Image.open(ASSETS / "dsm.png").convert("RGBA")
        ratio = 230 / dsm.width
        dsm = dsm.resize((230, int(dsm.height * ratio)), Image.LANCZOS)
        img.paste(dsm, (mx, 62), dsm)
    except Exception as e:
        print("  face logo skipped:", e)

    # ── product name (big, wrapped) ──
    name_font = fit_font(FONT_BOLD, max(name.split(), key=len), W - mx - 60, 92, 52)
    lines = wrap(d, name, name_font, W - mx - 60)
    y = 300
    lh = name_font.getbbox("Ag")[3] + 12
    for ln in lines:
        d.text((mx, y), ln, font=name_font, fill=(24, 28, 34))
        y += lh

    # tagline
    tag_font = ImageFont.truetype(FONT_REG, 40)
    d.text((mx, y + 8), tagline, font=tag_font, fill=(107, 114, 128))

    # ── centre app-icon (rounded square, accent gradient, glyph) ──
    iw = 320
    ix, iy = W - iw - 90, 470
    # soft shadow
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(
        [ix + 12, iy + 20, ix + iw + 12, iy + iw + 20], radius=64,
        fill=(20, 30, 50, 70))
    sh = sh.filter(__import__("PIL.ImageFilter", fromlist=["GaussianBlur"]).GaussianBlur(22))
    img.paste(sh, (0, 0), sh)

    icon = vgrad((iw, iw), top, bot)
    icon.putalpha(rounded_mask((iw, iw), 64))
    # glyph
    gd = ImageDraw.Draw(icon)
    gfont = fit_font(FONT_BOLD, glyph, iw - 70, 190, 70)
    gb = gd.textbbox((0, 0), glyph, font=gfont)
    gd.text(((iw - (gb[2]-gb[0])) / 2 - gb[0], (iw - (gb[3]-gb[1])) / 2 - gb[1]),
            glyph, font=gfont, fill=(255, 255, 255, 245))
    img.paste(icon, (ix, iy), icon)

    # ── bottom brand mark (mimics the vendor-logo slot) ──
    by = H - 150
    d.rounded_rectangle([mx, by, mx + 40, by + 40], radius=6, fill=top)
    d.rounded_rectangle([mx + 48, by, mx + 88, by + 40], radius=6, fill=bot)
    d.text((mx + 104, by - 2), "DSM Original", font=ImageFont.truetype(FONT_BOLD, 40),
           fill=(24, 28, 34))
    d.text((mx + 104, by + 46), "Genuine · Supported · Licensed",
           font=ImageFont.truetype(FONT_REG, 22), fill=(120, 128, 138))

    return img


# ── texture application (UV-preserving, from batch_process.py) ────────────
def apply_texture(glb_path, texture_img, output_path):
    import trimesh
    from scipy import ndimage
    scene = trimesh.load(str(glb_path))
    texture_img.load()
    if texture_img.mode == 'RGBA':
        arr = np.array(texture_img)
        rgb = arr[:, :, :3].copy(); alpha = arr[:, :, 3]
        transparent = alpha <= 128
        if transparent.any() and (~transparent).any():
            idx = ndimage.distance_transform_edt(
                transparent, return_distances=False, return_indices=True)
            for c in range(3):
                ch = rgb[:, :, c]
                ch[transparent] = ch[idx[0][transparent], idx[1][transparent]]
                rgb[:, :, c] = ch
        texture_img = Image.fromarray(rgb, 'RGB')
    elif texture_img.mode != 'RGB':
        texture_img = texture_img.convert('RGB')
    mx = max(texture_img.width, texture_img.height)
    p2 = max(512, min(2048, 2 ** ((mx - 1).bit_length())))
    final = texture_img.resize((p2, p2), Image.Resampling.LANCZOS)
    final.save(os.path.join(os.path.dirname(output_path), 'texture.png'))
    if hasattr(scene, 'geometry'):
        for _n, mesh in scene.geometry.items():
            if not hasattr(mesh, 'visual'):
                continue
            try:
                mesh.visual.material = trimesh.visual.material.PBRMaterial(
                    baseColorTexture=final, metallicFactor=0.0, roughnessFactor=1.0)
            except Exception:
                try:
                    mesh.visual.material = trimesh.visual.material.SimpleMaterial(image=final)
                except Exception:
                    pass
    scene.export(str(output_path))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--flat-out", default=None, help="dir to also drop flat {id}.glb")
    args = ap.parse_args()

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    flat = Path(args.flat_out) if args.flat_out else None
    if flat:
        flat.mkdir(parents=True, exist_ok=True)

    manifest = []
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text())
    existing_ids = {str(m.get("id")) for m in manifest}

    created = []
    for pid, name, tagline, glyph, atop, abot in PRODUCTS:
        slug = sanitize(name)
        folder = MODELS_DIR / f"{pid}_{slug}"
        folder.mkdir(parents=True, exist_ok=True)
        out = folder / "model.glb"
        print(f"[{pid}] {name}")
        cover = make_cover(name, tagline, glyph, atop, abot)
        cover.save(folder / "cover.png")
        apply_texture(BASE_GLB, cover, out)
        if flat:
            shutil.copy2(out, flat / f"{pid}.glb")
        entry = {"id": pid, "name": name, "sku": None,
                 "file": f"{pid}.glb", "folder": f"{pid}_{slug}",
                 "glb": "model.glb", "status": "ok", "dsm_original": True,
                 "tagline": tagline}
        manifest = [m for m in manifest if str(m.get("id")) != str(pid)]
        manifest.append(entry)
        created.append({"id": pid, "name": name, "folder": entry["folder"],
                        "file": entry["file"]})
        print(f"   -> {out}  ({out.stat().st_size} bytes)")

    MANIFEST.write_text(json.dumps(manifest, indent=2, default=str))
    print(f"\nManifest: {len(manifest)} entries -> {MANIFEST}")
    print("CREATED_JSON_START")
    print(json.dumps(created))
    print("CREATED_JSON_END")


if __name__ == "__main__":
    main()
