export interface Point {
  x: number;
  y: number;
}

export interface Contour {
  points: Point[];
  area: number;
}

export interface ContourCandidate {
  points: Point[];
  area: number;
  isPaper: boolean;
  detectionMethod: 'canny' | 'adaptive' | 'binary';
}

export interface JigConfig {
  extrudeHeightMm: number;
  jigSizeMm: number; // square jig side length
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

// State for draggable paper corners
export interface DraggablePaperCorners {
  corners: Point[];
  activeCornerIndex: number | null;
  isDragging: boolean;
}

// State for interactive contour editing
export interface EditableContour {
  points: Point[];
  activePointIndex: number | null;
  isDragging: boolean;
  isAddingPoint: boolean;
}

// Detection method type
export type DetectionMethod = 'auto' | 'manual' | 'skip';
