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
    cv: any;
  }
}

function dispatchProgress(step: string) {
  console.log(`[OpenCV] ${step}`);
  window.dispatchEvent(new CustomEvent('opencv-progress', { detail: step }));
}

export async function loadOpenCV(): Promise<OpenCV> {
  if (opencvPromise) {
    return opencvPromise;
  }

  opencvPromise = (async () => {
    // Already loaded and ready
    if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
      console.log('[OpenCV] Already loaded');
      return window.cv as OpenCV;
    }

    dispatchProgress('downloading');

    // Load the script
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.x/opencv.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to download OpenCV.js'));
      document.head.appendChild(script);
    });

    console.log('[OpenCV] Script loaded. window.cv type:', typeof window.cv);
    dispatchProgress('initializing');

    // OpenCV 4.x: window.cv is a factory function that returns a Promise
    // The script's IIFE calls `cv(Module)` at the end, which sets window.cv 
    // to the result. But depending on timing, window.cv might still be the 
    // factory function or already the resolved module.
    let cv = window.cv;

    // If cv is a function (factory), call it to get the module promise
    if (typeof cv === 'function') {
      console.log('[OpenCV] cv is a factory function, calling it...');
      cv = await cv();
      window.cv = cv;
    }
    
    // If cv is a Promise/thenable, await it
    if (cv && typeof cv.then === 'function') {
      console.log('[OpenCV] cv is a Promise, awaiting...');
      cv = await cv;
      window.cv = cv;
    }

    // Poll as last resort (shouldn't be needed but just in case)
    if (!cv || !cv.Mat) {
      console.log('[OpenCV] cv.Mat not ready, polling...');
      cv = await new Promise<OpenCV>((resolve, reject) => {
        let attempts = 0;
        const poll = () => {
          if (window.cv && window.cv.Mat) {
            resolve(window.cv as OpenCV);
          } else if (attempts++ > 200) {
            reject(new Error('OpenCV.js initialized but cv.Mat never appeared'));
          } else {
            setTimeout(poll, 100);
          }
        };
        poll();
      });
    }

    console.log('[OpenCV] Ready! cv.Mat:', !!cv.Mat, 'cv.imread:', !!cv.imread);
    dispatchProgress('ready');
    return cv as OpenCV;
  })();

  return opencvPromise;
}

export function isOpenCVReady(): boolean {
  return typeof window !== 'undefined' && 
         window.cv !== undefined && 
         window.cv.Mat !== undefined;
}

export function safeDelete(...mats: (OpenCVMat | null | undefined)[]): void {
  mats.forEach(mat => {
    if (mat && typeof mat.delete === 'function') {
      mat.delete();
    }
  });
}

export type { OpenCVMat, OpenCVMatVector, OpenCV };
