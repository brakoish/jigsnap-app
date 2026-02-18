import type { Point, Contour, ContourCandidate, ProcessingParams } from './types';
import { loadOpenCV, getCv, safeDelete, imageToCanvas, getImageScale } from './opencv-loader';

// outline-app style settings
const MIN_CONTOUR_AREA_RATIO = 0.001; // Min 0.1% of image area (catch smaller objects)
const MAX_CONTOUR_AREA_RATIO = 0.95; // Max 95% of image area
const PAPER_AREA_THRESHOLD = 0.25; // Contours > 25% of image are likely paper

// Calculate IoU of two contours using bounding boxes
function calculateBoundingBoxIoU(contourA: Point[], contourB: Point[]): number {
  const getBounds = (pts: Point[]) => ({
    minX: Math.min(...pts.map(p => p.x)),
    minY: Math.min(...pts.map(p => p.y)),
    maxX: Math.max(...pts.map(p => p.x)),
    maxY: Math.max(...pts.map(p => p.y))
  });
  
  const a = getBounds(contourA);
  const b = getBounds(contourB);
  
  const interMinX = Math.max(a.minX, b.minX);
  const interMinY = Math.max(a.minY, b.minY);
  const interMaxX = Math.min(a.maxX, b.maxX);
  const interMaxY = Math.min(a.maxY, b.maxY);
  
  if (interMinX >= interMaxX || interMinY >= interMaxY) return 0;
  
  const interArea = (interMaxX - interMinX) * (interMaxY - interMinY);
  const areaA = (a.maxX - a.minX) * (a.maxY - a.minY);
  const areaB = (b.maxX - b.minX) * (b.maxY - b.minY);
  const unionArea = areaA + areaB - interArea;
  
  return interArea / unionArea;
}

// Check if a point is inside a polygon
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Smooth contour using percentage of arc length (outline-app style)
// Lower percentage = more aggressive smoothing
function smoothContour(cv: any, contour: any, maxDeviationPercent = 0.001): any {
  const smooth = new cv.Mat();
  const accuracy = maxDeviationPercent * cv.arcLength(contour, true);
  cv.approxPolyDP(contour, smooth, accuracy, true);
  return smooth;
}

// Check if contour is top-level (no parent) - outline-app style
function isTopLevelContour(i: number, hierarchy: any): boolean {
  const hierarchyValue = hierarchy.intPtr(0, i);
  if (hierarchyValue.length >= 4) {
    return hierarchyValue[3] === -1; // parent index == -1
  }
  return true;
}

// Detect contours using outline-app's approach
export async function detectAllContours(
  imageElement: HTMLImageElement
): Promise<ContourCandidate[]> {
  console.log('[contour] detectAllContours starting...');
  await loadOpenCV();
  const cv = getCv();
  console.log('[contour] OpenCV ready');

  const canvas = imageToCanvas(imageElement);
  const scale = 1 / getImageScale(imageElement);
  const imageArea = canvas.width * canvas.height;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let src: any, gray: any;

  try {
    src = cv.imread(canvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const allContours: { contour: Point[]; area: number; method: string }[] = [];

    // Method 1: Canny edge (outline-app style: higher thresholds)
    console.log('[contour] Running Canny edge detection...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cannyEdges: any, cannyContours: any, cannyHierarchy: any;
    try {
      // Bigger blur for smoother edges (15px like outline-app)
      const blurred = new cv.Mat();
      cv.GaussianBlur(gray, blurred, new cv.Size(15, 15), 0);
      
      cannyEdges = new cv.Mat();
      cv.Canny(blurred, cannyEdges, 50, 150); // Medium thresholds (not too high, not too low)

      cannyContours = new cv.MatVector();
      cannyHierarchy = new cv.Mat();
      // Use RETR_TREE to get hierarchy, TC89_L1 for better edge following
      cv.findContours(cannyEdges, cannyContours, cannyHierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_TC89_L1);
      
      console.log(`[contour] Canny found ${cannyContours.size()} contours`);
      
      for (let i = 0; i < cannyContours.size(); i++) {
        // Only top-level contours (outline-app style)
        if (!isTopLevelContour(i, cannyHierarchy)) continue;
        
        const contour = cannyContours.get(i);
        const area = cv.contourArea(contour);
        
        if (area >= imageArea * MIN_CONTOUR_AREA_RATIO && 
            area <= imageArea * MAX_CONTOUR_AREA_RATIO) {
          // Smooth with 0.2% of perimeter (outline-app style)
          const smoothed = smoothContour(cv, contour, 0.001);
          
          const points: Point[] = [];
          for (let j = 0; j < smoothed.rows; j++) {
            points.push({
              x: Math.round(smoothed.data32S[j * 2] * scale),
              y: Math.round(smoothed.data32S[j * 2 + 1] * scale)
            });
          }
          safeDelete(smoothed);
          
          if (points.length >= 3) {
            allContours.push({ contour: points, area: area * scale * scale, method: 'canny' });
          }
        }
      }
      safeDelete(blurred);
    } finally {
      safeDelete(cannyEdges, cannyContours, cannyHierarchy);
    }

    // Method 2: Adaptive threshold (outline-app style: smaller block, lower C)
    console.log('[contour] Running adaptive threshold...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let adaptiveThresh: any, adaptiveContours: any, adaptiveHierarchy: any;
    try {
      // Bilateral filter first (edge-preserving smoothing)
      const bilateral = new cv.Mat();
      cv.bilateralFilter(gray, bilateral, 9, 75, 75);
      
      adaptiveThresh = new cv.Mat();
      cv.adaptiveThreshold(
        bilateral,
        adaptiveThresh,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        7,  // Smaller block size (was 21)
        2   // Lower C (was 5)
      );

      adaptiveContours = new cv.MatVector();
      adaptiveHierarchy = new cv.Mat();
      cv.findContours(adaptiveThresh, adaptiveContours, adaptiveHierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_TC89_L1);

      console.log(`[contour] Adaptive threshold found ${adaptiveContours.size()} contours`);

      for (let i = 0; i < adaptiveContours.size(); i++) {
        if (!isTopLevelContour(i, adaptiveHierarchy)) continue;
        
        const contour = adaptiveContours.get(i);
        const area = cv.contourArea(contour);

        if (area >= imageArea * MIN_CONTOUR_AREA_RATIO && 
            area <= imageArea * MAX_CONTOUR_AREA_RATIO) {
          const smoothed = smoothContour(cv, contour, 0.001);
          
          const points: Point[] = [];
          for (let j = 0; j < smoothed.rows; j++) {
            points.push({
              x: Math.round(smoothed.data32S[j * 2] * scale),
              y: Math.round(smoothed.data32S[j * 2 + 1] * scale)
            });
          }
          safeDelete(smoothed);

          if (points.length >= 3) {
            allContours.push({ contour: points, area: area * scale * scale, method: 'adaptive' });
          }
        }
      }
      safeDelete(bilateral);
    } finally {
      safeDelete(adaptiveThresh, adaptiveContours, adaptiveHierarchy);
    }

    // Method 3: Binary threshold with OTSU (fallback)
    console.log('[contour] Running binary threshold (OTSU)...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let binaryThresh: any, binaryContours: any, binaryHierarchy: any;
    try {
      const blurred = new cv.Mat();
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      
      binaryThresh = new cv.Mat();
      cv.threshold(blurred, binaryThresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

      binaryContours = new cv.MatVector();
      binaryHierarchy = new cv.Mat();
      cv.findContours(binaryThresh, binaryContours, binaryHierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

      console.log(`[contour] Binary threshold found ${binaryContours.size()} contours`);

      for (let i = 0; i < binaryContours.size(); i++) {
        if (!isTopLevelContour(i, binaryHierarchy)) continue;
        
        const contour = binaryContours.get(i);
        const area = cv.contourArea(contour);

        if (area >= imageArea * MIN_CONTOUR_AREA_RATIO && 
            area <= imageArea * MAX_CONTOUR_AREA_RATIO) {
          const smoothed = smoothContour(cv, contour, 0.001);
          
          const points: Point[] = [];
          for (let j = 0; j < smoothed.rows; j++) {
            points.push({
              x: Math.round(smoothed.data32S[j * 2] * scale),
              y: Math.round(smoothed.data32S[j * 2 + 1] * scale)
            });
          }
          safeDelete(smoothed);

          if (points.length >= 3) {
            allContours.push({ contour: points, area: area * scale * scale, method: 'binary' });
          }
        }
      }
      safeDelete(blurred);
    } finally {
      safeDelete(binaryThresh, binaryContours, binaryHierarchy);
    }

    console.log(`[contour] Total contours before dedupe: ${allContours.length}`);

    // Deduplicate: remove overlapping contours (IoU > 0.5)
    const uniqueContours: typeof allContours = [];
    for (const candidate of allContours) {
      let isDuplicate = false;
      for (const existing of uniqueContours) {
        const iou = calculateBoundingBoxIoU(candidate.contour, existing.contour);
        if (iou > 0.5) {
          isDuplicate = true;
          // Keep the one with more points
          if (candidate.contour.length > existing.contour.length) {
            existing.contour = candidate.contour;
            existing.area = candidate.area;
            existing.method = candidate.method;
          }
          break;
        }
      }
      if (!isDuplicate) {
        uniqueContours.push(candidate);
      }
    }

    console.log(`[contour] Total contours after dedupe: ${uniqueContours.length}`);

    // Classify as paper or object
    const candidates: ContourCandidate[] = uniqueContours.map(c => {
      const isPaper = c.area > imageArea * scale * scale * PAPER_AREA_THRESHOLD;
      return {
        points: c.contour,
        area: c.area,
        isPaper,
        detectionMethod: c.method as 'canny' | 'adaptive' | 'binary'
      };
    });

    // Sort by area descending
    candidates.sort((a, b) => b.area - a.area);

    console.log(`[contour] Final candidates: ${candidates.length} (papers: ${candidates.filter(c => c.isPaper).length})`);
    
    return candidates;
  } catch (err) {
    console.error('[contour] ERROR in detectAllContours:', err);
    throw err;
  } finally {
    safeDelete(src, gray);
  }
}

// Legacy detectContour function
export async function detectContour(
  imageElement: HTMLImageElement | HTMLCanvasElement,
  params?: ProcessingParams
): Promise<Contour | null> {
  if (imageElement instanceof HTMLCanvasElement) {
    const dataUrl = imageElement.toDataURL();
    const img = new Image();
    img.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load canvas as image'));
    });
    imageElement = img;
  }

  const candidates = await detectAllContours(imageElement);
  
  const objectCandidates = candidates.filter(c => !c.isPaper);
  
  if (objectCandidates.length > 0) {
    const best = objectCandidates[0];
    return { points: best.points, area: best.area };
  }
  
  if (candidates.length > 0) {
    const best = candidates[0];
    return { points: best.points, area: best.area };
  }
  
  return null;
}

// Draw all contours on canvas
export function drawContoursOnCanvas(
  canvas: HTMLCanvasElement,
  contours: ContourCandidate[],
  imageElement: HTMLImageElement | HTMLCanvasElement,
  selectedIndex: number = -1,
  displayScale: number = 1
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) { console.error('[contour] No canvas context'); return; }

  const origW = (imageElement as HTMLImageElement).naturalWidth || imageElement.width;
  const origH = (imageElement as HTMLImageElement).naturalHeight || imageElement.height;
  const maxDisplay = 1200;
  let calculatedScale = 1;
  if (origW > maxDisplay || origH > maxDisplay) {
    calculatedScale = maxDisplay / Math.max(origW, origH);
  }
  
  const w = Math.round(origW * calculatedScale);
  const h = Math.round(origH * calculatedScale);
  
  canvas.width = w;
  canvas.height = h;

  try {
    ctx.drawImage(imageElement, 0, 0, w, h);
  } catch (e) {
    console.error('[contour] drawImage failed:', e);
    return;
  }

  contours.forEach((contour, index) => {
    const pts = contour.points.map(p => ({ 
      x: p.x * calculatedScale, 
      y: p.y * calculatedScale 
    }));
    
    const isSelected = index === selectedIndex;
    const isPaper = contour.isPaper;
    
    if (isPaper) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      pts.forEach(p => {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      });
      
      ctx.fillStyle = isSelected ? 'rgba(34, 197, 94, 0.25)' : 'rgba(34, 197, 94, 0.1)';
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      
      ctx.strokeStyle = isSelected ? '#22c55e' : '#4ade80';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      ctx.setLineDash([]);
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
      
      if (isSelected) {
        ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
        ctx.fill();
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 4;
      } else {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2;
      }
      ctx.stroke();
    }
  });
}

// Offset a contour along normals
export function offsetContour(points: Point[], offsetPx: number): Point[] {
  if (points.length < 3 || offsetPx === 0) return points;

  const n = points.length;
  const result: Point[] = [];

  for (let i = 0; i < n; i++) {
    const prev = points[i === 0 ? n - 1 : i - 1];
    const curr = points[i];
    const next = points[i === n - 1 ? 0 : i + 1];

    const dx1 = curr.x - prev.x, dy1 = curr.y - prev.y;
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1;
    const nx1 = -dy1 / len1, ny1 = dx1 / len1;

    const dx2 = next.x - curr.x, dy2 = next.y - curr.y;
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1;
    const nx2 = -dy2 / len2, ny2 = dx2 / len2;

    let nx = (nx1 + nx2) / 2;
    let ny = (ny1 + ny2) / 2;
    const normalLen = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= normalLen;
    ny /= normalLen;

    result.push({
      x: Math.round(curr.x + nx * offsetPx),
      y: Math.round(curr.y + ny * offsetPx),
    });
  }

  return result;
}

// Perspective warp
export async function warpPerspective(
  imageElement: HTMLImageElement,
  srcCorners: Point[],
  destWidth: number,
  destHeight: number
): Promise<HTMLCanvasElement> {
  await loadOpenCV();
  const cv = getCv();

  const sorted = sortCorners(srcCorners);

  const srcMat = cv.matFromArray(4, 1, cv.CV_32FC2, [
    sorted[0].x, sorted[0].y,
    sorted[1].x, sorted[1].y,
    sorted[2].x, sorted[2].y,
    sorted[3].x, sorted[3].y,
  ]);

  const dstMat = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    destWidth, 0,
    destWidth, destHeight,
    0, destHeight,
  ]);

  const transformMatrix = cv.getPerspectiveTransform(srcMat, dstMat);
  const src = cv.imread(imageElement);
  const warped = new cv.Mat();

  cv.warpPerspective(src, warped, transformMatrix, { width: destWidth, height: destHeight });

  const canvas = document.createElement('canvas');
  canvas.width = destWidth;
  canvas.height = destHeight;
  cv.imshow(canvas, warped);

  safeDelete(src, warped, srcMat, dstMat, transformMatrix);

  return canvas;
}

// Sort corners: TL, TR, BR, BL
function sortCorners(corners: Point[]): Point[] {
  const sorted = [...corners].sort((a, b) => {
    if (Math.abs(a.y - b.y) > 10) return a.y - b.y;
    return a.x - b.x;
  });

  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = sorted.slice(2).sort((a, b) => a.x - b.x);

  return [top[0], top[1], bottom[1], bottom[0]];
}

// Simplify contour using RDP
export function simplifyContour(points: Point[], tolerance: number): Point[] {
  if (points.length <= 3) return points;

  function rdp(pts: Point[], eps: number): Point[] {
    if (pts.length <= 2) return pts;
    const first = pts[0], last = pts[pts.length - 1];
    let maxDist = 0, maxIdx = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = pointToLineDistance(pts[i], first, last);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > eps) {
      const left = rdp(pts.slice(0, maxIdx + 1), eps);
      const right = rdp(pts.slice(maxIdx), eps);
      return left.slice(0, -1).concat(right);
    }
    return [first, last];
  }

  function pointToLineDistance(p: Point, a: Point, b: Point): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const projX = a.x + t * dx, projY = a.y + t * dy;
    return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
  }

  const closed = [...points, points[0]];
  const simplified = rdp(closed, tolerance);
  if (simplified.length > 1 &&
      simplified[0].x === simplified[simplified.length - 1].x &&
      simplified[0].y === simplified[simplified.length - 1].y) {
    simplified.pop();
  }
  return simplified.length >= 3 ? simplified : points;
}

export function getDefaultProcessingParams(): ProcessingParams {
  return {
    blurKernel: 15,    // outline-app style
    cannyLow: 100,     // outline-app style
    cannyHigh: 200,    // outline-app style
    epsilon: 0.002     // 0.2% of perimeter
  };
}