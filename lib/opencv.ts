// OpenCV.js loader with promise-based initialization

// OpenCV type interfaces
interface OpenCVMat {
  delete: () => void;
  rows: number;
  cols: number;
  data32S: Int32Array;
}

interface OpenCVMatVector {
  delete: () => void;
  size: () => number;
  get: (index: number) => OpenCVMat;
}

interface OpenCVSize {
  new (width: number, height: number): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface OpenCV extends Record<string, any> {
  Mat: new () => OpenCVMat;
  MatVector: new () => OpenCVMatVector;
  Size: OpenCVSize;
  imread: (element: HTMLImageElement | HTMLCanvasElement) => OpenCVMat;
  cvtColor: (src: OpenCVMat, dst: OpenCVMat, code: number) => void;
  GaussianBlur: (src: OpenCVMat, dst: OpenCVMat, size: unknown, sigmaX: number) => void;
  Canny: (src: OpenCVMat, dst: OpenCVMat, threshold1: number, threshold2: number) => void;
  findContours: (src: OpenCVMat, contours: OpenCVMatVector, hierarchy: OpenCVMat, mode: number, method: number) => void;
  contourArea: (contour: OpenCVMat) => number;
  arcLength: (curve: OpenCVMat, closed: boolean) => number;
  approxPolyDP: (curve: OpenCVMat, approxCurve: OpenCVMat, epsilon: number, closed: boolean) => void;
  getPerspectiveTransform: (src: OpenCVMat, dst: OpenCVMat) => OpenCVMat;
  warpPerspective: (src: OpenCVMat, dst: OpenCVMat, M: OpenCVMat, size: unknown) => void;
  imshow: (canvas: HTMLCanvasElement, mat: OpenCVMat) => void;
  matFromArray: (rows: number, cols: number, type: number, array: number[]) => OpenCVMat;
  COLOR_RGBA2GRAY: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  CV_32FC2: number;
}

let opencvPromise: Promise<OpenCV> | null = null;

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cv: OpenCV;
  }
}

export async function loadOpenCV(): Promise<OpenCV> {
  if (opencvPromise) {
    return opencvPromise;
  }

  opencvPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if (typeof window !== 'undefined' && window.cv) {
      resolve(window.cv);
      return;
    }

    // Create script element — use jsDelivr CDN (faster & more reliable than docs.opencv.org)
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/opencv.js@1.2.1/opencv.js';
    script.async = true;
    
    // Timeout after 30 seconds
    const timeout = setTimeout(() => {
      opencvPromise = null;
      reject(new Error('OpenCV.js load timed out — try refreshing'));
    }, 30000);

    script.onload = () => {
      // OpenCV.js sets window.cv as a function that resolves when ready,
      // or sets it directly. Handle both cases.
      const checkReady = (attempts: number) => {
        if (attempts > 100) {
          clearTimeout(timeout);
          opencvPromise = null;
          reject(new Error('OpenCV.js failed to initialize'));
          return;
        }
        if (window.cv && window.cv.Mat) {
          clearTimeout(timeout);
          resolve(window.cv);
        } else if (window.cv && typeof window.cv === 'function') {
          // OpenCV module factory — call it
          (window.cv as unknown as (cv: OpenCV) => void)(window.cv);
          setTimeout(() => checkReady(attempts + 1), 100);
        } else {
          setTimeout(() => checkReady(attempts + 1), 100);
        }
      };
      checkReady(0);
    };

    script.onerror = () => {
      clearTimeout(timeout);
      opencvPromise = null;
      reject(new Error('Failed to load OpenCV.js'));
    };

    document.head.appendChild(script);
  });

  return opencvPromise;
}

export function isOpenCVReady(): boolean {
  return typeof window !== 'undefined' && 
         window.cv !== undefined && 
         window.cv.Mat !== undefined;
}

// Helper to safely delete OpenCV Mats to prevent memory leaks
export function safeDelete(...mats: (OpenCVMat | null | undefined)[]): void {
  mats.forEach(mat => {
    if (mat && typeof mat.delete === 'function') {
      mat.delete();
    }
  });
}

export type { OpenCVMat, OpenCVMatVector, OpenCV };
