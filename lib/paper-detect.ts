import type { Point, A4Paper } from './types';
import { loadOpenCV, safeDelete, type OpenCVMat, type OpenCVMatVector } from './opencv';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const A4_ASPECT_RATIO = A4_WIDTH_MM / A4_HEIGHT_MM; // ~0.707

export async function detectA4Paper(
  imageElement: HTMLImageElement | HTMLCanvasElement
): Promise<A4Paper | null> {
  const cv = await loadOpenCV();
  
  let src: OpenCVMat | null = null;
  let gray: OpenCVMat | null = null;
  let edges: OpenCVMat | null = null;
  let contours: OpenCVMatVector | null = null;
  let hierarchy: OpenCVMat | null = null;

  try {
    src = cv.imread(imageElement);
    
    // Convert to grayscale
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    // Edge detection
    edges = new cv.Mat();
    cv.Canny(gray, edges, 50, 150);
    
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
    
    // Find quadrilateral contours that could be A4 paper
    let bestQuad: { corners: Point[]; area: number } | null = null;
    let bestScore = 0;
    
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      
      // Skip small contours
      if (area < src.cols * src.rows * 0.05) continue;
      
      // Approximate polygon
      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * peri, true);
      
      // Check if it's a quadrilateral
      if (approx.rows === 4) {
        const corners: Point[] = [];
        for (let j = 0; j < 4; j++) {
          corners.push({
            x: approx.data32S[j * 2],
            y: approx.data32S[j * 2 + 1]
          });
        }
        
        // Calculate aspect ratio
        const width = Math.sqrt(
          Math.pow(corners[1].x - corners[0].x, 2) + 
          Math.pow(corners[1].y - corners[0].y, 2)
        );
        const height = Math.sqrt(
          Math.pow(corners[2].x - corners[1].x, 2) + 
          Math.pow(corners[2].y - corners[1].y, 2)
        );
        const ratio = Math.min(width, height) / Math.max(width, height);
        
        // Check if aspect ratio matches A4 (with tolerance)
        const ratioDiff = Math.abs(ratio - A4_ASPECT_RATIO);
        if (ratioDiff < 0.15) {
          const score = area * (1 - ratioDiff);
          if (score > bestScore) {
            bestScore = score;
            bestQuad = { corners, area };
          }
        }
      }
      
      approx.delete();
    }
    
    if (!bestQuad) return null;
    
    // Order corners: top-left, top-right, bottom-right, bottom-left
    const ordered = orderCorners(bestQuad.corners);
    
    // Calculate dimensions
    const width = Math.sqrt(
      Math.pow(ordered[1].x - ordered[0].x, 2) + 
      Math.pow(ordered[1].y - ordered[0].y, 2)
    );
    const height = Math.sqrt(
      Math.pow(ordered[2].x - ordered[1].x, 2) + 
      Math.pow(ordered[2].y - ordered[1].y, 2)
    );
    
    return {
      corners: ordered,
      width: Math.max(width, height),
      height: Math.min(width, height)
    };
  } finally {
    safeDelete(src, gray, edges, hierarchy);
    if (contours) contours.delete();
  }
}

function orderCorners(corners: Point[]): Point[] {
  // Find center
  const centerX = corners.reduce((sum, p) => sum + p.x, 0) / 4;
  const centerY = corners.reduce((sum, p) => sum + p.y, 0) / 4;
  
  // Sort by angle from center
  return corners
    .map(p => ({
      ...p,
      angle: Math.atan2(p.y - centerY, p.x - centerX)
    }))
    .sort((a, b) => a.angle - b.angle)
    .map(({ x, y }) => ({ x, y }));
}

export async function applyPerspectiveCorrection(
  imageElement: HTMLImageElement | HTMLCanvasElement,
  paper: A4Paper,
  outputWidth: number = 1240, // ~A4 at 150 DPI
  outputHeight: number = 1754
): Promise<HTMLCanvasElement> {
  const cv = await loadOpenCV();
  
  let src: OpenCVMat | null = null;
  let dst: OpenCVMat | null = null;
  let M: OpenCVMat | null = null;

  try {
    src = cv.imread(imageElement);
    dst = new cv.Mat();
    
    // Define source and destination points
    const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      paper.corners[0].x, paper.corners[0].y,
      paper.corners[1].x, paper.corners[1].y,
      paper.corners[2].x, paper.corners[2].y,
      paper.corners[3].x, paper.corners[3].y
    ]);
    
    const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0,
      outputWidth, 0,
      outputWidth, outputHeight,
      0, outputHeight
    ]);
    
    // Get perspective transform
    M = cv.getPerspectiveTransform(srcPoints, dstPoints);
    
    // Apply warp
    cv.warpPerspective(src, dst, M, new cv.Size(outputWidth, outputHeight));
    
    // Convert to canvas
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    cv.imshow(canvas, dst);
    
    srcPoints.delete();
    dstPoints.delete();
    
    return canvas;
  } finally {
    safeDelete(src, dst, M);
  }
}

export function calculatePixelsPerMm(paper: A4Paper): number {
  // Average the width and height ratios
  const widthPxPerMm = paper.width / A4_HEIGHT_MM;
  const heightPxPerMm = paper.height / A4_WIDTH_MM;
  return (widthPxPerMm + heightPxPerMm) / 2;
}
