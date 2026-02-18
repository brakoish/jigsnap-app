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

    // Create script element
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.x/opencv.js';
    script.async = true;
    
    // Timeout after 60 seconds (opencv.js is ~8MB)
    const timeout = setTimeout(() => {
      opencvPromise = null;
      reject(new Error('OpenCV.js load timed out after 60s — try refreshing'));
    }, 60000);

    // Dispatch progress events so the UI can show status
    const dispatchProgress = (step: string) => {
      window.dispatchEvent(new CustomEvent('opencv-progress', { detail: step }));
    };

    dispatchProgress('downloading');

    script.onload = () => {
      dispatchProgress('initializing');
      
      // OpenCV 4.x onload: window.cv may be a Module factory or already ready
      const checkReady = (attempts: number) => {
        if (attempts > 200) { // 20 seconds of polling
          clearTimeout(timeout);
          opencvPromise = null;
          reject(new Error('OpenCV.js failed to initialize'));
          return;
        }
        if (window.cv && window.cv.Mat) {
          clearTimeout(timeout);
          dispatchProgress('ready');
          resolve(window.cv);
        } else {
          setTimeout(() => checkReady(attempts + 1), 100);
        }
      };
      
      // If cv['onRuntimeInitialized'] callback pattern is used
      if (window.cv && typeof window.cv === 'object' && !window.cv.Mat) {
        const origOnInit = window.cv['onRuntimeInitialized'];
        window.cv['onRuntimeInitialized'] = () => {
          if (origOnInit) origOnInit();
          clearTimeout(timeout);
          dispatchProgress('ready');
          resolve(window.cv);
        };
        // Also poll as fallback
        setTimeout(() => checkReady(0), 100);
      } else {
        checkReady(0);
      }
    };

    script.onerror = () => {
      clearTimeout(timeout);
      opencvPromise = null;
      reject(new Error('Failed to load OpenCV.js — check your connection'));
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
