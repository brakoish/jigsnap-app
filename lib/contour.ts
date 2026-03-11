import type { Point, Contour, ContourCandidate } from './types';
import { loadOpenCV, getCv, safeDelete, imageToCanvas, getImageScale } from './opencv-loader';

// Simple, robust contour detection
// Strategy: Preprocess → Edge detect → Find largest valid contour → Smooth

const MIN_AREA_RATIO = 0.01;  // At least 1% of image
const MAX_AREA_RATIO = 0.9;   // At most 90% of image

export async function detectContours(
  imageElement: HTMLImageElement
): Promise<ContourCandidate[]> {
  await loadOpenCV();
  const cv = getCv();

  const canvas = imageToCanvas(imageElement);
  const scale = 1 / getImageScale(imageElement);
  const imageArea = canvas.width * canvas.height;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let src: any, gray: any, edges: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contours: any[] = [];

  try {
    // Step 1: Load and convert to grayscale
    src = cv.imread(canvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Step 2: Strong blur to remove noise (bristles, texture)
    const blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(21, 21), 0);

    // Step 3: Canny edge detection (conservative thresholds)
    edges = new cv.Mat();
    cv.Canny(blurred, edges, 30, 100);

    // Step 4: Dilate to connect broken edges
    const dilated = new cv.Mat();
    const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
    cv.dilate(edges, dilated, kernel);

    // Step 5: Find contours
    const contourVec = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(dilated, contourVec, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Step 6: Filter and convert valid contours
    for (let i = 0; i < contourVec.size(); i++) {
      const c = contourVec.get(i);
      const area = cv.contourArea(c);
      const areaRatio = area / imageArea;

      // Skip if too small or too large
      if (areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO) continue;

      // Smooth the contour (0.5% of perimeter)
      const perimeter = cv.arcLength(c, true);
      const epsilon = 0.005 * perimeter;
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
      safeDelete(smoothed);

      // Skip if too few points
      if (points.length < 6) continue;

      contours.push({
        points,
        area: area * scale * scale,
        isPaper: areaRatio > 0.3, // Large contours are probably paper
        detectionMethod: 'simple'
      });
    }

    safeDelete(blurred, dilated, kernel, contourVec, hierarchy);

    // Sort by area (largest first)
    contours.sort((a, b) => b.area - a.area);

    return contours;

  } catch (err) {
    console.error('Detection error:', err);
    return [];
  } finally {
    safeDelete(src, gray, edges);
  }
}

// Click-to-detect: focused detection around a point
export async function detectAtPoint(
  imageElement: HTMLImageElement,
  clickPoint: Point
): Promise<Contour | null> {
  await loadOpenCV();
  const cv = getCv();

  const canvas = imageToCanvas(imageElement);
  const scale = 1 / getImageScale(imageElement);

  // Region of interest (300px around click)
  const roiSize = 300;
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
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Extract ROI
    const roi = gray.roi(new cv.Rect(x, y, w, h));

    // Bilateral filter (edge-preserving smooth)
    const filtered = new cv.Mat();
    cv.bilateralFilter(roi, filtered, 15, 150, 150);

    // Adaptive threshold
    const thresh = new cv.Mat();
    cv.adaptiveThreshold(filtered, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

    // Find contours
    const contourVec = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(thresh, contourVec, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    // Find contour closest to center
    const centerX = w / 2;
    const centerY = h / 2;
    let bestContour: any = null;
    let bestDist = Infinity;

    for (let i = 0; i < contourVec.size(); i++) {
      const c = contourVec.get(i);
      const area = cv.contourArea(c);
      if (area < 500) continue; // Skip tiny noise

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

    if (!bestContour) return null;

    // Smooth
    const perimeter = cv.arcLength(bestContour, true);
    const epsilon = 0.01 * perimeter;
    const smoothed = new cv.Mat();
    cv.approxPolyDP(bestContour, smoothed, epsilon, true);

    // Convert points (add ROI offset)
    const points: Point[] = [];
    for (let j = 0; j < smoothed.rows; j++) {
      points.push({
        x: Math.round((smoothed.data32S[j * 2] + x) * scale),
        y: Math.round((smoothed.data32S[j * 2 + 1] + y) * scale)
      });
    }

    safeDelete(roi, filtered, thresh, contourVec, hierarchy, smoothed);

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

// Simplify contour by removing redundant points
export function simplifyContour(points: Point[], tolerance: number): Point[] {
  if (points.length <= 3) return points;

  // Douglas-Peucker-like simplification
  const simplified: Point[] = [points[0]];
  
  for (let i = 1; i < points.length; i++) {
    const last = simplified[simplified.length - 1];
    const curr = points[i];
    const dist = Math.sqrt(Math.pow(curr.x - last.x, 2) + Math.pow(curr.y - last.y, 2));
    
    if (dist > tolerance) {
      simplified.push(curr);
    }
  }

  // Ensure closed loop
  if (simplified.length > 2 && 
      (simplified[0].x !== simplified[simplified.length - 1].x ||
       simplified[0].y !== simplified[simplified.length - 1].y)) {
    simplified.push(simplified[0]);
  }

  return simplified.length >= 3 ? simplified : points;
}

// Offset contour outward (positive) or inward (negative)
export function offsetContour(points: Point[], offset: number): Point[] {
  // Simple implementation: move each point along normal
  const result: Point[] = [];
  
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    
    // Calculate normal
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    
    if (len1 === 0 || len2 === 0) {
      result.push(curr);
      continue;
    }
    
    // Average normal
    const nx = -(dy1 / len1 + dy2 / len2) / 2;
    const ny = (dx1 / len1 + dx2 / len2) / 2;
    const nlen = Math.sqrt(nx * nx + ny * ny);
    
    if (nlen === 0) {
      result.push(curr);
      continue;
    }
    
    result.push({
      x: Math.round(curr.x + (nx / nlen) * offset),
      y: Math.round(curr.y + (ny / nlen) * offset)
    });
  }
  
  return result;
}

// Default processing params
export function getDefaultProcessingParams() {
  return {
    blurKernel: 21,
    cannyLow: 30,
    cannyHigh: 100,
    epsilon: 0.005
  };
}

// Paper detection (simplified)
export async function detectPaper(
  imageElement: HTMLImageElement
): Promise<{ corners: Point[]; width: number; height: number } | null> {
  const contours = await detectContours(imageElement);
  const paper = contours.find(c => c.isPaper);
  
  if (!paper) return null;
  
  // Find bounding box corners
  const xs = paper.points.map(p => p.x);
  const ys = paper.points.map(p => p.y);
  
  return {
    corners: [
      { x: Math.min(...xs), y: Math.min(...ys) },
      { x: Math.max(...xs), y: Math.min(...ys) },
      { x: Math.max(...xs), y: Math.max(...ys) },
      { x: Math.min(...xs), y: Math.max(...ys) }
    ],
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}

// Perspective warp
export async function warpPerspective(
  imageElement: HTMLImageElement,
  corners: Point[],
  destWidth: number,
  destHeight: number
): Promise<HTMLCanvasElement> {
  await loadOpenCV();
  const cv = getCv();

  const canvas = imageToCanvas(imageElement);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let src: any, dst: any, M: any;
  
  try {
    src = cv.imread(canvas);
    dst = new cv.Mat();
    
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      corners[0].x, corners[0].y,
      corners[1].x, corners[1].y,
      corners[2].x, corners[2].y,
      corners[3].x, corners[3].y
    ]);
    
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      destWidth, 0,
      destWidth, destHeight,
      0, destHeight
    ]);
    
    M = cv.getPerspectiveTransform(srcTri, dstTri);
    cv.warpPerspective(src, dst, M, new cv.Size(destWidth, destHeight));
    
    const result = document.createElement('canvas');
    result.width = destWidth;
    result.height = destHeight;
    cv.imshow(result, dst);
    
    safeDelete(srcTri, dstTri, M);
    
    return result;
  } finally {
    safeDelete(src, dst, M);
  }
}
