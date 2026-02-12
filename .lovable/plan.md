

# Visual Upgrade: Logos, Images, and Interactive Product Cards

## What's Changing

### 1. Logo Strip - Fix Broken Images
Replace external Wikipedia SVG links (which often get blocked by CORS/hotlinking) with inline SVG logos rendered directly in the component. This guarantees they always display correctly.

**Logos to render inline:** Microsoft, Apple, Autodesk, Adobe, SketchUp, V-Ray

### 2. Creative Studio Card - Artistic Image
Replace the current Unsplash photo with an AI-generated artistic image that feels relevant to creative software (think: colorful digital art workspace, paint splashes merging with digital tools). This will be generated using the Nano banana image generation model and uploaded to the project.

### 3. Product Cards - Interactive 3D Hover Effect
Replace the current simple letter icons with actual product box visuals using CSS 3D transforms. On hover, the product image will perform a smooth **3D tilt/rotation effect** (perspective-based rotation that follows the mouse or does a gentle spin animation), giving a holographic feel.

**Effect details:**
- Cards get `perspective` and `transform-style: preserve-3d`
- On hover: smooth Y-axis rotation (partial 360 spin) with a glossy shine overlay that sweeps across
- A subtle shadow shift to enhance the 3D depth illusion
- Product visuals will use recognizable software box art style images

### 4. Product Images
Replace gradient letter placeholders with proper product visuals:
- **Office 2021 Pro Plus** - Blue Office logo/box visual
- **Acrobat Pro DC** - Red Adobe Acrobat icon
- **AutoCAD 2024** - Autodesk AutoCAD icon
- **Kaspersky Total** - Green Kaspersky shield icon

These will be rendered as styled SVG/CSS compositions (not external URLs that can break).

---

## Technical Details

### Files Modified
1. **`src/components/LogoStrip.tsx`** - Replace img tags with inline SVGs for all 6 partner logos
2. **`src/components/RoleGrid.tsx`** - Update Creative Studio card image source
3. **`src/components/ProductGrid.tsx`** - Major update:
   - Add product image URLs to data
   - Add CSS 3D perspective container
   - Add hover rotation keyframe animation
   - Add glossy shine sweep overlay on hover
4. **`src/index.css`** - Add 3D card animation keyframes and holographic shine effect
5. **AI image generation** - Generate 1 artistic creative studio image

### 3D Hover Effect Implementation
```text
+---------------------------+
|  Card Container           |
|  perspective: 1000px      |
|                           |
|  +---------------------+  |
|  | Product Image       |  |
|  | transform-style:    |  |
|  |   preserve-3d       |  |
|  |                     |  |
|  | HOVER triggers:     |  |
|  | - rotateY(15deg)    |  |
|  | - shine sweep       |  |
|  | - shadow shift      |  |
|  +---------------------+  |
+---------------------------+
```

The effect uses pure CSS (no heavy 3D libraries) for performance - a smooth `rotateY` animation with a diagonal shine gradient that sweeps across on hover.

