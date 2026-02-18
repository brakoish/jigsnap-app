/**
 * Compute the square jig side length in mm.
 * Takes the larger of width/height, adds 20mm (10mm padding each side),
 * then rounds UP to the next 10mm increment.
 */
export function computeSquareJigSizeMm(
  contourBounds: { width: number; height: number },
  pixelsPerMm: number
): number {
  const widthMm = contourBounds.width / pixelsPerMm;
  const heightMm = contourBounds.height / pixelsPerMm;
  const maxDim = Math.max(widthMm, heightMm);
  const withPadding = maxDim + 20; // 10mm each side
  return Math.ceil(withPadding / 10) * 10;
}
