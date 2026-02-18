import type { Point, A4Paper } from './types';
import { loadOpenCV, getCv, safeDelete, imageToCanvas, getImageScale } from './opencv-loader';

// Paper sizes in mm
export const PAPER_SIZES = {
  letter: { width: 215.9, height: 279.4, label: 'US Letter (8.5" × 11")' },
  a4: { width: 210, height: 297, label: 'A4 (210 × 297mm)' },
} as const;

export type PaperSize = keyof typeof PAPER_SIZES;

/**
 * Detect paper in image using OpenCV.
 * Looks for rectangular contours with matching aspect ratio.
 */
export async function detectPaper(
  imageElement: HTMLImageElement,
  paperSize: PaperSize = 'letter'
): Promise<A4Paper | null> {
  console.log('[paper] detectPaper starting...');
  await loadOpenCV();
  const cv = getCv();
  console.log('[paper] OpenCV ready');

  // Convert image to canvas (resized for performance)
  const canvas = imageToCanvas(imageElement);
  const scale = 1 / getImageScale(imageElement);
  const w = canvas.width;
  const h = canvas.height;

  console.log('[paper] Processing at', w, 'x', h, '(scale:', scale, ')');
  if (w === 0 || h === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let src: any, gray: any, blurred: any, edges: any, contours: any, hierarchy: any;

  try {
    console.log('[paper] cv.imread...');
    src = cv.imread(canvas);
    console.log('[paper] imread done:', src.rows, 'x', src.cols);

    // Convert to grayscale
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Gaussian blur to reduce noise
    blurred = new cv.Mat();
    const ksize = new cv.Size(5, 5);
    cv.GaussianBlur(gray, blurred, ksize, 0);

    // Canny edge detection
    edges = new cv.Mat();
    cv.Canny(blurred, edges, 50, 150);

    // Find contours
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    console.log('[paper] findContours found:', contours.size());

    if (contours.size() === 0) {
      return null;
    }

    const paper = PAPER_SIZES[paperSize];
    const targetAspect = Math.min(paper.width, paper.height) / Math.max(paper.width, paper.height);
    const totalPixels = w * h;

    let bestContour: Point[] | null = null;
    let bestScore = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      // Skip tiny contours (< 5% of image)
      if (area < totalPixels * 0.05) continue;
      // Skip huge contours (> 95% of image)
      if (area > totalPixels * 0.95) continue;

      // Simplify contour using approxPolyDP
      const perimeter = cv.arcLength(contour, true);
      const epsilon = 0.02 * perimeter;
      const approxCurve = new cv.Mat();
      cv.approxPolyDP(contour, approxCurve, epsilon, true);

      // Check if it's a quadrilateral (4 points)
      if (approxCurve.rows !== 4) {
        safeDelete(approxCurve);
        continue;
      }

      // Get the 4 corners
      const corners: Point[] = [];
      for (let j = 0; j < 4; j++) {
        corners.push({
          x: approxCurve.data32S[j * 2],
          y: approxCurve.data32S[j * 2 + 1]
        });
      }
      safeDelete(approxCurve);

      // Get bounding rect for aspect ratio check
      const rect = cv.boundingRect(contour);
      const aspect = Math.min(rect.width, rect.height) / Math.max(rect.width, rect.height);

      // Check aspect ratio similarity to paper
      const aspectDiff = Math.abs(aspect - targetAspect);
      if (aspectDiff > 0.15) continue; // aspect ratio too different

      // Check rectangularity: contour area vs bounding rect area
      const rectArea = rect.width * rect.height;
      const rectangularity = area / rectArea;
      if (rectangularity < 0.7) continue; // not rectangular enough

      // Score: bigger area + better rectangularity + better aspect match
      const score = (area / totalPixels) * rectangularity * (1 - aspectDiff);

      if (score > bestScore) {
        bestScore = score;
        bestContour = corners;
      }
    }

    if (!bestContour) {
      console.log('[paper] No paper found');
      return null;
    }

    // Scale corners back to original image coordinates
    const scaledCorners = bestContour.map(p => ({
      x: Math.round(p.x * scale),
      y: Math.round(p.y * scale),
    }));

    const xs = scaledCorners.map(p => p.x);
    const ys = scaledCorners.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    console.log('[paper] Paper found:', (maxX - minX), 'x', (maxY - minY), 'px');
    return {
      corners: scaledCorners,
      width: maxX - minX,
      height: maxY - minY,
    };
  } finally {
    safeDelete(src, gray, blurred, edges, contours, hierarchy);
  }
}

// Keep old name for backward compat
export async function detectA4Paper(
  imageElement?: HTMLImageElement,
  paperSize?: PaperSize
): Promise<A4Paper | null> {
  if (!imageElement) return null;
  return detectPaper(imageElement, paperSize || 'letter');
}

export function calculatePixelsPerMm(paper: A4Paper, paperSize: PaperSize = 'letter'): number {
  const size = PAPER_SIZES[paperSize];
  // Determine orientation: match paper width/height to detected width/height
  const paperLong = Math.max(size.width, size.height);
  const paperShort = Math.min(size.width, size.height);
  const detectedLong = Math.max(paper.width, paper.height);
  const detectedShort = Math.min(paper.width, paper.height);

  const pxPerMmLong = detectedLong / paperLong;
  const pxPerMmShort = detectedShort / paperShort;
  return (pxPerMmLong + pxPerMmShort) / 2;
}
