import type { Point, Contour, ContourCandidate, ProcessingParams } from './types';
import { loadOpenCV, getCv, safeDelete, imageToCanvas, getImageScale } from './opencv-loader';

const MIN_CONTOUR_AREA = 500; // Minimum area in pixels
const MAX_CONTOUR_AREA_RATIO = 0.8; // Max 80% of image area
const PAPER_AREA_THRESHOLD = 0.3; // Contours > 30% of image are likely paper
const DEDUPLICATION_IOU_THRESHOLD = 0.7; // If overlap > 70%, dedupe

/**
 * Check if a point is inside a polygon using ray casting algorithm
 */
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

/**
 * Calculate IoU (Intersection over Union) of two contours
 * Uses bounding boxes for efficiency
 */
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

/**
 * Detect ALL candidate contours using multiple detection methods
 */
export async function detectAllContours(
  imageElement: HTMLImageElement
): Promise<ContourCandidate[]> {
  console.log('[contour] detectAllContours starting...');
  await loadOpenCV();
  const cv = getCv();
  console.log('[contour] OpenCV ready');

  // Convert image to canvas (resized to max 1024px for performance)
  const canvas = imageToCanvas(imageElement);
  const scale = 1 / getImageScale(imageElement);
  const imageArea = canvas.width * canvas.height;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let src: any, gray: any, blurred: any;

  try {
    src = cv.imread(canvas);
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    blurred = new cv.Mat();
    const ksize = new cv.Size(5, 5);
    cv.GaussianBlur(gray, blurred, ksize, 0);

    const allContours: { contour: Point[]; area: number; method: 'canny' | 'adaptive' | 'binary' }[] = [];

    // Method 1: Canny edge detection
    console.log('[contour] Running Canny edge detection...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cannyEdges: any, cannyContours: any, cannyHierarchy: any;
    try {
      cannyEdges = new cv.Mat();
      cv.Canny(blurred, cannyEdges, 30, 100);
      
      cannyContours = new cv.MatVector();
      cannyHierarchy = new cv.Mat();
      cv.findContours(cannyEdges, cannyContours, cannyHierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      
      console.log(`[contour] Canny found ${cannyContours.size()} contours`);
      
      for (let i = 0; i < cannyContours.size(); i++) {
        const contour = cannyContours.get(i);
        const area = cv.contourArea(contour);
        
        if (area >= MIN_CONTOUR_AREA && area <= imageArea * MAX_CONTOUR_AREA_RATIO) {
          const perimeter = cv.arcLength(contour, true);
          const epsilon = 0.005 * perimeter;
          const approxCurve = new cv.Mat();
          cv.approxPolyDP(contour, approxCurve, epsilon, true);
          
          const points: Point[] = [];
          for (let j = 0; j < approxCurve.rows; j++) {
            points.push({
              x: Math.round(approxCurve.data32S[j * 2] * scale),
              y: Math.round(approxCurve.data32S[j * 2 + 1] * scale)
            });
          }
          safeDelete(approxCurve);
          
          if (points.length >= 3) {
            allContours.push({ contour: points, area: area * scale * scale, method: 'canny' });
          }
        }
      }
    } finally {
      safeDelete(cannyEdges, cannyContours, cannyHierarchy);
    }

    // Method 2: Adaptive threshold (good for dark objects on light paper)
    console.log('[contour] Running adaptive threshold...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let adaptiveThresh: any, adaptiveContours: any, adaptiveHierarchy: any;
    try {
      adaptiveThresh = new cv.Mat();
      cv.adaptiveThreshold(
        blurred, 
        adaptiveThresh, 
        255, 
        cv.ADAPTIVE_THRESH_GAUSSIAN_C, 
        cv.THRESH_BINARY_INV, 
        11, 
        2
      );
      
      adaptiveContours = new cv.MatVector();
      adaptiveHierarchy = new cv.Mat();
      cv.findContours(adaptiveThresh, adaptiveContours, adaptiveHierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      
      console.log(`[contour] Adaptive threshold found ${adaptiveContours.size()} contours`);
      
      for (let i = 0; i < adaptiveContours.size(); i++) {
        const contour = adaptiveContours.get(i);
        const area = cv.contourArea(contour);
        
        if (area >= MIN_CONTOUR_AREA && area <= imageArea * MAX_CONTOUR_AREA_RATIO) {
          const perimeter = cv.arcLength(contour, true);
          const epsilon = 0.005 * perimeter;
          const approxCurve = new cv.Mat();
          cv.approxPolyDP(contour, approxCurve, epsilon, true);
          
          const points: Point[] = [];
          for (let j = 0; j < approxCurve.rows; j++) {
            points.push({
              x: Math.round(approxCurve.data32S[j * 2] * scale),
              y: Math.round(approxCurve.data32S[j * 2 + 1] * scale)
            });
          }
          safeDelete(approxCurve);
          
          if (points.length >= 3) {
            allContours.push({ contour: points, area: area * scale * scale, method: 'adaptive' });
          }
        }
      }
    } finally {
      safeDelete(adaptiveThresh, adaptiveContours, adaptiveHierarchy);
    }

    // Method 3: Simple binary threshold with OTSU
    console.log('[contour] Running binary threshold...');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let binaryThresh: any, binaryContours: any, binaryHierarchy: any;
    try {
      binaryThresh = new cv.Mat();
      cv.threshold(blurred, binaryThresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
      
      binaryContours = new cv.MatVector();
      binaryHierarchy = new cv.Mat();
      cv.findContours(binaryThresh, binaryContours, binaryHierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      
      console.log(`[contour] Binary threshold found ${binaryContours.size()} contours`);
      
      for (let i = 0; i < binaryContours.size(); i++) {
        const contour = binaryContours.get(i);
        const area = cv.contourArea(contour);
        
        if (area >= MIN_CONTOUR_AREA && area <= imageArea * MAX_CONTOUR_AREA_RATIO) {
          const perimeter = cv.arcLength(contour, true);
          const epsilon = 0.005 * perimeter;
          const approxCurve = new cv.Mat();
          cv.approxPolyDP(contour, approxCurve, epsilon, true);
          
          const points: Point[] = [];
          for (let j = 0; j < approxCurve.rows; j++) {
            points.push({
              x: Math.round(approxCurve.data32S[j * 2] * scale),
              y: Math.round(approxCurve.data32S[j * 2 + 1] * scale)
            });
          }
          safeDelete(approxCurve);
          
          if (points.length >= 3) {
            allContours.push({ contour: points, area: area * scale * scale, method: 'binary' });
          }
        }
      }
    } finally {
      safeDelete(binaryThresh, binaryContours, binaryHierarchy);
    }

    console.log(`[contour] Total contours before deduplication: ${allContours.length}`);

    // Deduplicate: if contours overlap > 70%, keep the one with more points
    const uniqueContours: typeof allContours = [];
    for (const candidate of allContours) {
      let isDuplicate = false;
      for (const existing of uniqueContours) {
        const iou = calculateBoundingBoxIoU(candidate.contour, existing.contour);
        if (iou > DEDUPLICATION_IOU_THRESHOLD) {
          isDuplicate = true;
          // Keep the one with more points (more detail)
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

    console.log(`[contour] Contours after deduplication: ${uniqueContours.length}`);

    // Classify as paper or object based on area and shape
    const candidates: ContourCandidate[] = uniqueContours.map(c => {
      const isPaper = c.area > imageArea * scale * scale * PAPER_AREA_THRESHOLD;
      return {
        points: c.contour,
        area: c.area,
        isPaper,
        detectionMethod: c.method
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
    safeDelete(src, gray, blurred);
  }
}

/**
 * Legacy detectContour function - kept for backward compatibility
 * Uses detectAllContours and returns the best non-paper contour
 */
export async function detectContour(
  imageElement: HTMLImageElement | HTMLCanvasElement,
  params?: ProcessingParams
): Promise<Contour | null> {
  // For HTMLCanvasElement, convert to image element first
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
  
  // Find the best non-paper contour
  const objectCandidates = candidates.filter(c => !c.isPaper);
  
  if (objectCandidates.length > 0) {
    const best = objectCandidates[0];
    return {
      points: best.points,
      area: best.area
    };
  }
  
  // If no object found, return the largest contour (might be the paper itself)
  if (candidates.length > 0) {
    const best = candidates[0];
    return {
      points: best.points,
      area: best.area
    };
  }
  
  return null;
}

/**
 * Draw all contours on canvas with click-to-select support
 */
export function drawContoursOnCanvas(
  canvas: HTMLCanvasElement,
  contours: ContourCandidate[],
  imageElement: HTMLImageElement | HTMLCanvasElement,
  selectedIndex: number = -1,
  displayScale: number = 1
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) { console.error('[contour] No canvas context'); return; }

  // Use display-friendly size (max 1200px) to avoid canvas size limits
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

  // Draw the image
  try {
    ctx.drawImage(imageElement, 0, 0, w, h);
  } catch (e) {
    console.error('[contour] drawImage failed:', e);
    return;
  }

  // Draw contours
  contours.forEach((contour, index) => {
    const pts = contour.points.map(p => ({ 
      x: p.x * calculatedScale, 
      y: p.y * calculatedScale 
    }));
    
    const isSelected = index === selectedIndex;
    const isPaper = contour.isPaper;
    
    if (isPaper) {
      // Paper gets semi-transparent green tint overlay
      ctx.fillStyle = isSelected ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.15)';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
      ctx.fill();
      
      // Outline
      ctx.strokeStyle = isSelected ? '#22c55e' : '#4ade80';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      // Object contours
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.closePath();
      
      if (isSelected) {
        // Selected object gets cyan highlight with thicker outline
        ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
        ctx.fill();
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 4;
      } else {
        // Non-selected objects get light blue outline
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2;
      }
      ctx.stroke();
    }
  });
}

export function getDefaultProcessingParams(): ProcessingParams {
  return {
    blurKernel: 5,
    cannyLow: 30,
    cannyHigh: 100,
    epsilon: 0.005
  };
}
