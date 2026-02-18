import type { Point, Contour, ProcessingParams } from './types';
import { loadOpenCV, safeDelete, imageToCanvas } from './opencv-loader';

export async function detectContour(
  imageElement: HTMLImageElement | HTMLCanvasElement,
  params: ProcessingParams
): Promise<Contour | null> {
  const cv = await loadOpenCV();

  // Convert image to canvas if needed (cv.imread requires canvas)
  const canvas = imageElement instanceof HTMLCanvasElement
    ? imageElement
    : imageToCanvas(imageElement);

  let src: any, gray: any, blurred: any, edges: any, contours: any, hierarchy: any;

  try {
    // Read image into OpenCV Mat
    src = cv.imread(canvas);

    // Convert to grayscale
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Gaussian blur to reduce noise
    blurred = new cv.Mat();
    const ksize = new cv.Size(params.blurKernel, params.blurKernel);
    cv.GaussianBlur(gray, blurred, ksize, 0);

    // Canny edge detection
    edges = new cv.Mat();
    cv.Canny(blurred, edges, params.cannyLow, params.cannyHigh);

    // Find contours
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    if (contours.size() === 0) {
      return null;
    }

    // Find the largest contour by area
    let largestContour: any = null;
    let largestArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area > largestArea) {
        largestArea = area;
        largestContour = contour;
      }
    }

    if (!largestContour || largestArea < 1000) {
      return null;
    }

    // Simplify contour using approxPolyDP
    const perimeter = cv.arcLength(largestContour, true);
    const epsilon = params.epsilon * perimeter;
    const approxCurve = new cv.Mat();
    cv.approxPolyDP(largestContour, approxCurve, epsilon, true);

    // Convert to points array
    const points: Point[] = [];
    for (let i = 0; i < approxCurve.rows; i++) {
      const x = approxCurve.data32S[i * 2];
      const y = approxCurve.data32S[i * 2 + 1];
      points.push({ x, y });
    }

    safeDelete(approxCurve);

    return {
      points,
      area: largestArea
    };
  } finally {
    // Clean up all Mats
    safeDelete(src, gray, blurred, edges, contours, hierarchy);
  }
}

export function drawContourOnCanvas(
  canvas: HTMLCanvasElement,
  contour: Contour,
  imageElement: HTMLImageElement | HTMLCanvasElement,
  color: string = '#06b6d4', // cyan-500
  lineWidth: number = 3
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Set canvas size to match image (use naturalWidth for img elements)
  const w = (imageElement as HTMLImageElement).naturalWidth || imageElement.width;
  const h = (imageElement as HTMLImageElement).naturalHeight || imageElement.height;
  canvas.width = w;
  canvas.height = h;

  // Draw image at full resolution
  ctx.drawImage(imageElement, 0, 0, w, h);

  // Draw contour
  if (contour.points.length > 0) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(contour.points[0].x, contour.points[0].y);
    for (let i = 1; i < contour.points.length; i++) {
      ctx.lineTo(contour.points[i].x, contour.points[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // Draw bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    contour.points.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });

    ctx.strokeStyle = '#22c55e'; // green-500
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
    ctx.setLineDash([]);
  }
}

export function getDefaultProcessingParams(): ProcessingParams {
  return {
    blurKernel: 5,
    cannyLow: 50,
    cannyHigh: 150,
    epsilon: 0.01
  };
}
