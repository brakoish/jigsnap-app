export interface Point {
  x: number;
  y: number;
}

export interface Contour {
  points: Point[];
  area: number;
}

export interface JigConfig {
  paddingMm: number;
  thicknessMm: number;
  pocketDepthMm: number | null; // null = through-cut
}

export interface ScaleCalibration {
  pixelsPerMm: number;
  method: 'auto' | 'manual';
  referenceLengthMm?: number;
}

export interface DetectedObject {
  contour: Contour;
  bounds: {
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
  dimensionsMm: {
    width: number;
    height: number;
  };
}

export interface A4Paper {
  corners: Point[];
  width: number;
  height: number;
}

export interface ProcessingParams {
  blurKernel: number;
  cannyLow: number;
  cannyHigh: number;
  epsilon: number;
}
