import type { Point, Contour, ProcessingParams } from './types';
import { loadOpenCV, safeDelete, type OpenCVMat, type OpenCVMatVector } from './opencv';

export async function detectContour(
  imageElement: HTMLImageElement | HTMLCanvasElement,
  params: ProcessingParams
): Promise<Contour | null> {
  const cv = await loadOpenCV();
  
  let src: OpenCVMat | null = null;
  let gray: OpenCVMat | null = null;
  let blurred: OpenCVMat | null = null;
  let edges: OpenCVMat | null = null;
  let contours: OpenCVMatVector | null = null;
  let hierarchy: OpenCVMat | null = null;

  try {
    // Read image
    src = cv.imread(imageElement);
    
    // Convert to grayscale
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    // Gaussian blur
    blurred = new cv.Mat();
    const kernelSize = params.blurKernel;
    cv.GaussianBlur(gray, blurred, new cv.Size(kernelSize, kernelSize), 0);
    
    // Canny edge detection
    edges = new cv.Mat();
    cv.Canny(blurred, edges, params.cannyLow, params.cannyHigh);
    
    // Find contours
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );
    
    // Find largest contour
    let largestContour: OpenCVMat | null = null;
    let largestArea = 0;
    
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area > largestArea) {
        largestArea = area;
        if (largestContour) largestContour.delete();
        largestContour = contour;
      } else {
        contour.delete();
      }
    }
    
    if (!largestContour || largestArea < 1000) {
      return null;
    }
    
    // Simplify contour with approxPolyDP
    const epsilon = params.epsilon * cv.arcLength(largestContour, true);
    const approxCurve = new cv.Mat();
    cv.approxPolyDP(largestContour, approxCurve, epsilon, true);
    
    // Convert to points
    const points: Point[] = [];
    for (let i = 0; i < approxCurve.rows; i++) {
      const x = approxCurve.data32S[i * 2];
      const y = approxCurve.data32S[i * 2 + 1];
      points.push({ x, y });
    }
    
    approxCurve.delete();
    
    return {
      points,
      area: largestArea
    };
  } finally {
    safeDelete(src, gray, blurred, edges, hierarchy);
    if (contours) {
      // Contours are already deleted in the loop or stored in largestContour
      contours.delete();
    }
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
  
  // Set canvas size to match image
  canvas.width = imageElement.width || (imageElement as HTMLImageElement).naturalWidth;
  canvas.height = imageElement.height || (imageElement as HTMLImageElement).naturalHeight;
  
  // Draw image
  ctx.drawImage(imageElement, 0, 0);
  
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
