# JigSnap — Product Requirements Document

## Overview
JigSnap is a client-side web app that generates laser engraving jigs from photos. User photographs an object on paper, the app detects the object contour, calibrates scale from the paper, and exports STL/SVG files for laser cutting or 3D printing.

**Stack:** Next.js 16 (static export), OpenCV.js (via `@techstark/opencv-js` npm package), Three.js, Tailwind CSS, deployed on Vercel.

## Core Flow
1. **Upload** — User takes photo or uploads image of object on white paper
2. **Detect** — OpenCV detects paper (for scale) and object contour
3. **Configure** — User sets paper size, verifies scale, adjusts jig height
4. **Export** — Download SVG (laser) or STL (3D print) of the jig

## Key Requirements

### Paper & Scale
- Support **US Letter** (8.5" × 11" / 215.9 × 279.4mm) as default
- Support **A4** (210 × 297mm) as alternative
- Auto-detect paper rectangle in photo for scale calibration
- Fallback to manual scale entry if paper not detected

### Jig Specifications
- **Square** jig, sized in **10mm increments**
- **≥10mm padding** on each side of the object
- Cutout goes **all the way through** (no pocket depth)
- Default **6mm extrude height**, selectable 2–20mm

### OpenCV.js Integration (CRITICAL)

**Use the npm package `@techstark/opencv-js`** (v4.12.0). This is a properly packaged build of OpenCV.js with WASM that works in browsers.

**Initialization pattern** (from official docs):
```typescript
import cv from '@techstark/opencv-js';

async function getOpenCv() {
  if (cv instanceof Promise) {
    return await cv;
  }
  if (cv.Mat) {
    return cv;
  }
  await new Promise<void>((resolve) => {
    cv.onRuntimeInitialized = () => resolve();
  });
  return cv;
}
```

**Key OpenCV operations needed:**
- `cv.imread(canvas)` — Read image from canvas element
- `cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY)` — Grayscale conversion
- `cv.GaussianBlur(src, dst, ksize, sigma)` — Noise reduction
- `cv.Canny(src, dst, threshold1, threshold2)` — Edge detection
- `cv.findContours(src, contours, hierarchy, mode, method)` — Contour extraction
- `cv.contourArea(contour)` — Area calculation
- `cv.arcLength(contour, closed)` — Perimeter calculation
- `cv.approxPolyDP(curve, approxCurve, epsilon, closed)` — Contour simplification
- `cv.boundingRect(contour)` — Bounding rectangle
- `cv.imshow(canvas, mat)` — Display result

**Critical: Always call `.delete()` on every Mat/MatVector when done to prevent memory leaks.**

**cv.imread requirements:** The image must be drawn onto a canvas element first. Do NOT pass an HTMLImageElement directly — always draw to canvas, then pass canvas to cv.imread.

**Webpack/Next.js config:** The package needs `fs: false, path: false, crypto: false` fallbacks for browser usage. In Next.js, configure in `next.config.ts`:
```typescript
webpack: (config, { isServer }) => {
  if (!isServer) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
  }
  return config;
}
```

**Note on static export:** If `output: 'export'` conflicts with webpack config, we can use Turbopack for dev and webpack for build, or dynamically import opencv.

### Object Detection Pipeline
1. Load image onto offscreen canvas
2. `cv.imread(canvas)` → Mat
3. Convert to grayscale (`cv.cvtColor`)
4. Gaussian blur (`cv.GaussianBlur`, kernel=5)
5. Canny edge detection (`cv.Canny`, thresholds adjustable)
6. Find contours (`cv.findContours`, RETR_EXTERNAL, CHAIN_APPROX_SIMPLE)
7. Find largest contour by area (skip if too small or too close to image border)
8. Simplify with `cv.approxPolyDP`
9. Return points + area

### Paper Detection Pipeline
1. Same preprocessing as above
2. Find all contours
3. For each contour, simplify with `cv.approxPolyDP`
4. Check if simplified contour has ~4 points (quadrilateral)
5. Check aspect ratio matches paper (Letter: 0.773, A4: 0.707)
6. Check area is reasonable (10-80% of image)
7. Pick best match → use bounding rect for pixels-per-mm calculation

### Mobile Compatibility
- Must work on iPhone Safari and Brave
- Image upload via file input with `accept="image/*"` 
- Camera capture via `capture="environment"`
- OpenCV WASM should work on modern mobile browsers (iOS 15+)

### Export
- **SVG**: Square jig outline with object cutout path
- **STL**: Extruded 3D model of jig (square block with object-shaped hole)

## File Structure
```
lib/
  opencv-loader.ts    — OpenCV init/loading with progress events
  contour.ts          — Object contour detection
  paper-detect.ts     — Paper detection for scale
  jig-utils.ts        — Jig size computation
  svg-export.ts       — SVG file generation
  stl-export.ts       — STL file generation
  types.ts            — TypeScript interfaces
components/
  ImageUpload.tsx     — Photo upload/camera UI
  ContourDetector.tsx — Detection UI with param sliders
  ScaleCalibration.tsx— Paper size, scale config
  JigPreview.tsx      — 2D SVG preview
  ThreeDPreview.tsx   — 3D Three.js preview
  ExportPanel.tsx     — Download buttons
app/
  page.tsx            — Main app with step wizard
  layout.tsx          — Root layout
```

## Non-Goals (for now)
- Multiple object detection
- Perspective correction
- Custom (non-square) jig shapes
- Server-side processing
