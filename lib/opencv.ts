// OpenCV.js 3.4 loader — pure JS (no WASM), mobile-compatible

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
  if (opencvPromise) return opencvPromise;

  opencvPromise = (async () => {
    // Already loaded
    if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
      return window.cv as OpenCV;
    }

    dispatchProgress('downloading');

    // Load the script — OpenCV 3.4 UMD sets window.cv synchronously
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/opencv.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to download OpenCV.js'));
      document.head.appendChild(script);
    });

    dispatchProgress('initializing');
    console.log('[OpenCV] Script loaded. window.cv type:', typeof window.cv);

    // OpenCV 3.4 UMD: factory runs synchronously, window.cv should already have Mat
    if (window.cv && window.cv.Mat) {
      console.log('[OpenCV] Ready immediately after script load');
      dispatchProgress('ready');
      return window.cv as OpenCV;
    }

    // If not ready yet, poll briefly (asm.js compilation can take a moment)
    const cv = await new Promise<OpenCV>((resolve, reject) => {
      let attempts = 0;
      const poll = () => {
        if (window.cv && window.cv.Mat) {
          console.log(`[OpenCV] Ready after ${attempts * 100}ms`);
          resolve(window.cv as OpenCV);
        } else if (attempts++ > 600) { // 60 seconds for slow phones
          console.error('[OpenCV] Failed. window.cv:', typeof window.cv);
          reject(new Error('OpenCV.js failed to initialize after 60s'));
        } else {
          if (attempts % 50 === 0) {
            console.log(`[OpenCV] Waiting... ${attempts * 100 / 1000}s`);
          }
          setTimeout(poll, 100);
        }
      };
      poll();
    });

    dispatchProgress('ready');
    return cv;
  })();

  return opencvPromise;
}

// Safely delete OpenCV mats
export function safeDelete(...mats: (OpenCVMat | OpenCVMatVector | null | undefined)[]) {
  for (const m of mats) {
    try { m?.delete(); } catch { /* already deleted */ }
  }
}

export type { OpenCV, OpenCVMat, OpenCVMatVector };
