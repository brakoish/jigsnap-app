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
      script.src = '/opencv.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to download OpenCV.js'));
      document.head.appendChild(script);
    });

    console.log('[OpenCV] Script loaded. window.cv type:', typeof window.cv);
    dispatchProgress('initializing');

    // OpenCV 4.x UMD: window.cv gets set to a factory function by the wrapper.
    // The factory expects a Module config object and returns a Promise that 
    // resolves to the initialized cv module.
    let cv = window.cv;
    console.log('[OpenCV] window.cv type after script load:', typeof cv);
    console.log('[OpenCV] window.cv has .Mat?', !!(cv && cv.Mat));
    console.log('[OpenCV] window.cv has .then?', !!(cv && cv.then));

    // Case 1: cv is a factory function — call it with empty config
    if (typeof cv === 'function' && !cv.Mat) {
      console.log('[OpenCV] Calling cv factory function...');
      try {
        const result = cv({});
        console.log('[OpenCV] Factory returned:', typeof result, 'has .then?', !!(result && result.then));
        if (result && typeof result.then === 'function') {
          cv = await result;
        } else {
          cv = result;
        }
      } catch (e) {
        console.error('[OpenCV] Factory call failed:', e);
        // Factory might have already been called by the IIFE. Poll instead.
        cv = null;
      }
    }

    // Case 2: cv is a Promise/thenable
    if (cv && typeof cv.then === 'function' && !cv.Mat) {
      console.log('[OpenCV] Awaiting cv promise...');
      // Race against a timeout so we know if it hangs
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('OpenCV WASM init timed out after 30s')), 30000)
      );
      try {
        cv = await Promise.race([cv, timeout]);
        console.log('[OpenCV] Promise resolved. cv type:', typeof cv, 'has Mat?', !!(cv && cv.Mat));
      } catch (e) {
        console.error('[OpenCV] Promise failed:', e);
        throw e;
      }
    }

    // Case 3: still not ready — poll for it
    if (!cv || !cv.Mat) {
      console.log('[OpenCV] Polling for cv.Mat...', 'current cv type:', typeof cv);
      cv = await new Promise<any>((resolve, reject) => {
        let attempts = 0;
        const poll = () => {
          // Check both the local cv and window.cv (IIFE may update window.cv)
          const current = window.cv;
          if (current && current.Mat) {
            console.log('[OpenCV] Poll found cv.Mat at attempt', attempts);
            resolve(current);
          } else if (attempts++ > 300) { // 30 seconds
            console.error('[OpenCV] Poll gave up. window.cv type:', typeof window.cv);
            if (window.cv) {
              console.error('[OpenCV] window.cv keys:', Object.keys(window.cv).slice(0, 10));
            }
            reject(new Error('OpenCV.js failed to initialize after 30s'));
          } else {
            if (attempts % 50 === 0) {
              console.log(`[OpenCV] Poll attempt ${attempts}...`);
            }
            setTimeout(poll, 100);
          }
        };
        poll();
      });
    }

    window.cv = cv;

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
