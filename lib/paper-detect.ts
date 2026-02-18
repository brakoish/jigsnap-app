import type { A4Paper } from './types';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * A4 paper detection - stubbed out for now
 * Can be re-implemented with pure JS later if needed
 */
export async function detectA4Paper(): Promise<A4Paper | null> {
  // A4 detection disabled - returning null
  // Can be re-implemented with pure JS contour detection later
  return null;
}

export async function applyPerspectiveCorrection(): Promise<HTMLCanvasElement> {
  throw new Error('Perspective correction not implemented');
}

export function calculatePixelsPerMm(paper: A4Paper): number {
  // Average the width and height ratios
  const widthPxPerMm = paper.width / A4_HEIGHT_MM;
  const heightPxPerMm = paper.height / A4_WIDTH_MM;
  return (widthPxPerMm + heightPxPerMm) / 2;
}
