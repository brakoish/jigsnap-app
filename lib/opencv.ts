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
    Module: any;
  }
}

// Dispatch progress events so the UI can show status
function dispatchProgress(step: string) {
  console.log(`[OpenCV] ${step}`);
  window.dispatchEvent(new CustomEvent('opencv-progress', { detail: step }));
}

export async function loadOpenCV(): Promise<OpenCV> {
  if (opencvPromise) {
    return opencvPromise;
  }

  opencvPromise = new Promise((resolve, reject) => {
    // Check if already loaded and ready
    if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
      console.log('[OpenCV] Already loaded and ready');
      resolve(window.cv as OpenCV);
      return;
    }

    // Timeout after 90 seconds (opencv.js is ~8MB, mobile can be slow)
    const timeout = setTimeout(() => {
      console.error('[OpenCV] Timed out after 90s');
      console.log('[OpenCV] window.cv type:', typeof window.cv);
      console.log('[OpenCV] window.cv keys:', window.cv ? Object.keys(window.cv).slice(0, 20) : 'null');
      opencvPromise = null;
      reject(new Error('OpenCV.js load timed out after 90s — try refreshing'));
    }, 90000);

    let resolved = false;
    const doResolve = (cv: OpenCV) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      dispatchProgress('ready');
      console.log('[OpenCV] Ready! cv.Mat exists:', !!cv.Mat);
      resolve(cv);
    };

    // Set up the onRuntimeInitialized callback BEFORE loading the script.
    // OpenCV.js 4.x checks for window.Module.onRuntimeInitialized during init.
    window.Module = window.Module || {};
    window.Module.onRuntimeInitialized = () => {
      console.log('[OpenCV] onRuntimeInitialized fired');
      dispatchProgress('initializing');
      // Give it a tick to finish setting up cv properties
      setTimeout(() => {
        if (window.cv && window.cv.Mat) {
          doResolve(window.cv as OpenCV);
        } else {
          console.log('[OpenCV] onRuntimeInitialized fired but cv.Mat not ready, polling...');
          poll(0);
        }
      }, 100);
    };

    // Polling fallback
    const poll = (attempts: number) => {
      if (resolved) return;
      if (attempts > 300) { // 30 seconds
        console.error('[OpenCV] Polling gave up after 300 attempts');
        clearTimeout(timeout);
        opencvPromise = null;
        reject(new Error('OpenCV.js failed to initialize — try refreshing'));
        return;
      }
      if (window.cv && window.cv.Mat) {
        doResolve(window.cv as OpenCV);
      } else {
        if (attempts % 50 === 0) {
          console.log(`[OpenCV] Polling attempt ${attempts}, cv type:`, typeof window.cv, 
            'cv.Mat:', window.cv?.Mat ? 'yes' : 'no');
        }
        setTimeout(() => poll(attempts + 1), 100);
      }
    };

    dispatchProgress('downloading');

    // Create and load script
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.x/opencv.js';
    script.async = true;

    script.onload = () => {
      console.log('[OpenCV] Script loaded. cv type:', typeof window.cv);
      dispatchProgress('initializing');
      
      // Start polling as the primary mechanism
      // onRuntimeInitialized may or may not fire depending on the build
      poll(0);
    };

    script.onerror = (e) => {
      console.error('[OpenCV] Script load error:', e);
      clearTimeout(timeout);
      opencvPromise = null;
      reject(new Error('Failed to download OpenCV.js — check your connection'));
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
