/**
 * Lightweight pure-JS contour detection
 * No OpenCV dependencies - works on mobile browsers
 */

import type { Point, Contour } from './types';

interface ProcessingParams {
  blurKernel: number;
  cannyLow: number;
  cannyHigh: number;
  epsilon: number;
}

/**
 * Detect contour from canvas element using pure JS
 * Uses grayscale -> blur -> edge detection -> marching squares -> RDP simplification
 */
export function detectContourFromCanvas(
  canvas: HTMLCanvasElement,
  params: ProcessingParams
): Contour | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const width = canvas.width;
  const height = canvas.height;
  
  // Get image data
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Convert to grayscale
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Standard grayscale formula
    gray[i >> 2] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  
  // Apply box blur
  const blurred = applyBoxBlur(gray, width, height, params.blurKernel);
  
  // Edge detection using Sobel operator
  const edges = applySobel(blurred, width, height, params.cannyLow);
  
  // Extract contours using marching squares
  const contours = extractContours(edges, width, height);
  
  if (contours.length === 0) {
    return null;
  }
  
  // Find largest contour by area
  let largestContour: Point[] = [];
  let largestArea = 0;
  
  for (const contour of contours) {
    const area = calculatePolygonArea(contour);
    if (area > largestArea) {
      largestArea = area;
      largestContour = contour;
    }
  }
  
  // Filter out small contours (noise)
  if (largestArea < 1000) {
    return null;
  }
  
  // Simplify contour using Ramer-Douglas-Peucker
  const simplified = ramerDouglasPeucker(largestContour, params.epsilon * Math.sqrt(largestArea));
  
  return {
    points: simplified,
    area: largestArea
  };
}

/**
 * Apply box blur to grayscale image
 */
function applyBoxBlur(
  src: Uint8Array,
  width: number,
  height: number,
  kernelSize: number
): Uint8Array {
  // Ensure odd kernel size
  const k = Math.max(3, kernelSize | 1);
  const halfK = Math.floor(k / 2);
  
  const dst = new Uint8Array(width * height);
  const temp = new Float32Array(width * height);
  
  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      
      for (let dx = -halfK; dx <= halfK; dx++) {
        const sx = Math.max(0, Math.min(width - 1, x + dx));
        sum += src[y * width + sx];
        count++;
      }
      
      temp[y * width + x] = sum / count;
    }
  }
  
  // Vertical pass
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let sum = 0;
      let count = 0;
      
      for (let dy = -halfK; dy <= halfK; dy++) {
        const sy = Math.max(0, Math.min(height - 1, y + dy));
        sum += temp[sy * width + x];
        count++;
      }
      
      dst[y * width + x] = Math.round(sum / count);
    }
  }
  
  return dst;
}

/**
 * Apply Sobel edge detection
 */
function applySobel(
  src: Uint8Array,
  width: number,
  height: number,
  threshold: number
): Uint8Array {
  const dst = new Uint8Array(width * height);
  
  // Sobel kernels
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sumX = 0;
      let sumY = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          const kidx = (ky + 1) * 3 + (kx + 1);
          sumX += src[idx] * gx[kidx];
          sumY += src[idx] * gy[kidx];
        }
      }
      
      const magnitude = Math.sqrt(sumX * sumX + sumY * sumY);
      dst[y * width + x] = magnitude > threshold ? 255 : 0;
    }
  }
  
  return dst;
}

/**
 * Extract contours using marching squares algorithm
 */
function extractContours(
  edges: Uint8Array,
  width: number,
  height: number,
  minContourLength: number = 20
): Point[][] {
  const contours: Point[][] = [];
  const visited = new Uint8Array(width * height);
  
  // Find all edge pixels and trace contours
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      
      // Start a new contour at unvisited edge pixels
      if (edges[idx] === 255 && !visited[idx]) {
        const contour = traceContour(edges, visited, width, height, x, y);
        if (contour.length >= minContourLength) {
          contours.push(contour);
        }
      }
    }
  }
  
  return contours;
}

/**
 * Trace a single contour starting from a point
 * Uses a simple border following algorithm
 */
function traceContour(
  edges: Uint8Array,
  visited: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number
): Point[] {
  const contour: Point[] = [];
  const stack: [number, number][] = [[startX, startY]];
  
  // 8-connected neighbors: right, right-down, down, left-down, left, left-up, up, right-up
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];
  
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const idx = y * width + x;
    
    if (visited[idx] || edges[idx] !== 255) continue;
    
    visited[idx] = 1;
    contour.push({ x, y });
    
    // Add unvisited neighbors
    for (let i = 0; i < 8; i++) {
      const nx = x + dx[i];
      const ny = y + dy[i];
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nidx = ny * width + nx;
        if (!visited[nidx] && edges[nidx] === 255) {
          stack.push([nx, ny]);
        }
      }
    }
  }
  
  return contour;
}

/**
 * Calculate polygon area using shoelace formula
 */
function calculatePolygonArea(points: Point[]): number {
  if (points.length < 3) return 0;
  
  let area = 0;
  const n = points.length;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  
  return Math.abs(area) / 2;
}

/**
 * Ramer-Douglas-Peucker algorithm for contour simplification
 */
function ramerDouglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;
  
  // Find the point with maximum distance from line between first and last points
  let maxDist = 0;
  let maxIdx = 0;
  
  const first = points[0];
  const last = points[points.length - 1];
  
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  
  // If max distance is greater than epsilon, recursively simplify
  if (maxDist > epsilon) {
    const left = ramerDouglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = ramerDouglasPeucker(points.slice(maxIdx), epsilon);
    
    // Concatenate, removing duplicate point
    return [...left.slice(0, -1), ...right];
  }
  
  // All points are close enough to the line, return endpoints only
  return [first, last];
}

/**
 * Calculate perpendicular distance from point to line segment
 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  
  // Handle degenerate line
  if (dx === 0 && dy === 0) {
    return Math.sqrt(
      Math.pow(point.x - lineStart.x, 2) + Math.pow(point.y - lineStart.y, 2)
    );
  }
  
  // Calculate area of parallelogram / base length
  const area = Math.abs(
    dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
  );
  const baseLength = Math.sqrt(dx * dx + dy * dy);
  
  return area / baseLength;
}
