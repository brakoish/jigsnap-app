import type { Point, Contour } from './types';
import { loadOpenCV, getCv, safeDelete, imageToCanvas, getImageScale } from './opencv-loader';

// Outline-app inspired detection
// Pipeline: Bilateral Filter → Grayscale → Binary Threshold → Find Contours

export async function detectContours(
  imageElement: HTMLImageElement
): Promise<Contour[]> {
  await loadOpenCV();
  const cv = getCv();

  const canvas = imageToCanvas(imageElement);
  const scale = 1 / getImageScale(imageElement);
  const imageArea = canvas.width * canvas.height;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let src: any, gray: any;

  try {
    // Step 1: Load image
    src = cv.imread(canvas);
    
    // Step 2: Bilateral filter (edge-preserving smooth) - KEY for removing texture noise
    const filtered = new cv.Mat();
    cv.cvtColor(src, filtered, cv.COLOR_RGBA2RGB);
    const bilateral = new cv.Mat();
    cv.bilateralFilter(filtered, bilateral, 9, 75, 75);
    filtered.delete();

    // Step 3: Grayscale
    gray = new cv.Mat();
    cv.cvtColor(bilateral, gray, cv.COLOR_RGB2GRAY);
    bilateral.delete();

    // Step 4: Binary threshold (outline-app style - handles both dark/light objects)
    const thresh = new cv.Mat();
    const inverseThresh = new cv.Mat();
    
    // Regular threshold (dark objects on light bg)
    cv.threshold(gray, thresh, 130, 255, cv.THRESH_BINARY);
    // Inverse threshold (light objects on dark bg)
    cv.threshold(gray, inverseThresh, 130, 255, cv.THRESH_BINARY_INV);
    
    // Combine both
    const combined = new cv.Mat();
    cv.bitwise_or(thresh, inverseThresh, combined);
    thresh.delete();
    inverseThresh.delete();

    // Step 5: Close contours (dilate then erode)
    const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
    const closed = new cv.Mat();
    cv.morphologyEx(combined, closed, cv.MORPH_CLOSE, kernel);
    combined.delete();
    kernel.delete();

    // Step 6: Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(closed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    closed.delete();

    // Step 7: Filter and convert
    const results: Contour[] = [];
    
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      const areaRatio = area / imageArea;

      // Skip if too small or too large
      if (areaRatio < 0.005 || areaRatio > 0.95) continue;

      // Smooth with 0.2% of perimeter (outline-app style)
      const perimeter = cv.arcLength(c, true);
      const epsilon = 0.002 * perimeter;
      const smoothed = new cv.Mat();
      cv.approxPolyDP(c, smoothed, epsilon, true);

      // Convert to points
      const points: Point[] = [];
      for (let j = 0; j < smoothed.rows; j++) {
        points.push({
          x: Math.round(smoothed.data32S[j * 2] * scale),
          y: Math.round(smoothed.data32S[j * 2 + 1] * scale)
        });
      }
      smoothed.delete();

      if (points.length >= 6) {
        results.push({
          points,
          area: area * scale * scale
        });
      }
    }

    contours.delete();
    hierarchy.delete();

    // Sort by area (largest first)
    results.sort((a, b) => b.area - a.area);

    return results;

  } catch (err) {
    console.error('Detection error:', err);
    return [];
  } finally {
    safeDelete(src, gray);
  }
}

// Click-to-detect at specific point
export async function detectAtPoint(
  imageElement: HTMLImageElement,
  clickPoint: Point
): Promise<Contour | null> {
  await loadOpenCV();
  const cv = getCv();

  const canvas = imageToCanvas(imageElement);
  const scale = 1 / getImageScale(imageElement);

  // Region of interest around click
  const roiSize = 400;
  const cx = Math.round(clickPoint.x / scale);
  const cy = Math.round(clickPoint.y / scale);
  const x = Math.max(0, cx - roiSize / 2);
  const y = Math.max(0, cy - roiSize / 2);
  const w = Math.min(roiSize, canvas.width - x);
  const h = Math.min(roiSize, canvas.height - y);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let src: any, gray: any;

  try {
    src = cv.imread(canvas);
    
    // Extract ROI
    const roi = src.roi(new cv.Rect(x, y, w, h));
    
    // Bilateral filter
    const rgb = new cv.Mat();
    cv.cvtColor(roi, rgb, cv.COLOR_RGBA2RGB);
    const filtered = new cv.Mat();
    cv.bilateralFilter(rgb, filtered, 15, 150, 150);
    rgb.delete();
    roi.delete();

    // Grayscale
    gray = new cv.Mat();
    cv.cvtColor(filtered, gray, cv.COLOR_RGB2GRAY);
    filtered.delete();

    // Adaptive threshold for better local contrast
    const thresh = new cv.Mat();
    cv.adaptiveThreshold(gray, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

    // Find contours
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    thresh.delete();

    // Find contour closest to center
    const centerX = w / 2;
    const centerY = h / 2;
    let bestContour: any = null;
    let bestDist = Infinity;

    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area < 500) continue;

      const moments = cv.moments(c);
      if (moments.m00 === 0) continue;

      const cx = moments.m10 / moments.m00;
      const cy = moments.m01 / moments.m00;
      const dist = Math.sqrt(Math.pow(cx - centerX, 2) + Math.pow(cy - centerY, 2));

      if (dist < bestDist) {
        bestDist = dist;
        bestContour = c;
      }
    }

    if (!bestContour) {
      contours.delete();
      hierarchy.delete();
      return null;
    }

    // Smooth
    const perimeter = cv.arcLength(bestContour, true);
    const epsilon = 0.005 * perimeter;
    const smoothed = new cv.Mat();
    cv.approxPolyDP(bestContour, smoothed, epsilon, true);

    // Convert points
    const points: Point[] = [];
    for (let j = 0; j < smoothed.rows; j++) {
      points.push({
        x: Math.round((smoothed.data32S[j * 2] + x) * scale),
        y: Math.round((smoothed.data32S[j * 2 + 1] + y) * scale)
      });
    }

    smoothed.delete();
    contours.delete();
    hierarchy.delete();

    if (points.length < 6) return null;

    // Calculate area
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    area = Math.abs(area) / 2;

    return { points, area };

  } catch (err) {
    console.error('Click detection error:', err);
    return null;
  } finally {
    safeDelete(src, gray);
  }
}

// Simplify contour
export function simplifyContour(points: Point[], tolerance: number): Point[] {
  if (points.length <= 3) return points;

  const simplified: Point[] = [points[0]];
  
  for (let i = 1; i < points.length; i++) {
    const last = simplified[simplified.length - 1];
    const curr = points[i];
    const dist = Math.sqrt(Math.pow(curr.x - last.x, 2) + Math.pow(curr.y - last.y, 2));
    
    if (dist > tolerance) {
      simplified.push(curr);
    }
  }

  return simplified.length >= 3 ? simplified : points;
}
