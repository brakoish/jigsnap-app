import type { Point, Contour, ProcessingParams } from './types';
import { detectContourFromCanvas } from './contour-detect';

export async function detectContour(
  imageElement: HTMLImageElement | HTMLCanvasElement,
  params: ProcessingParams
): Promise<Contour | null> {
  // Convert image to canvas if needed
  const canvas = imageElement instanceof HTMLCanvasElement 
    ? imageElement 
    : imageToCanvas(imageElement);
  
  // Use lightweight pure-JS contour detection
  return detectContourFromCanvas(canvas, params);
}

// Convert image to canvas for processing
function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return canvas;
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
