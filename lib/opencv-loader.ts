// OpenCV 3.4 loader via script tag
// 
// CRITICAL: OpenCV's module object has a .then() method, making it a "thenable".
// You CANNOT return it from an async function or Promise.resolve() — JavaScript
// will follow the .then() chain and hang forever.
// 
// Solution: loadOpenCV() returns Promise<void>, then use getCv() to get the instance.

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cv: any;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cvInstance: any = null;
let loadPromise: Promise<void> | null = null;

/**
 * Load and initialize OpenCV. Resolves when ready.
 * Use getCv() after this to get the cv object.
 */
export function loadOpenCV(): Promise<void> {
  if (cvInstance) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    // Already loaded from previous visit
    if (typeof window !== 'undefined' && window.cv && window.cv.Mat) {
      console.log('[OpenCV] Already loaded from cache');
      cvInstance = window.cv;
      dispatchProgress('ready');
      resolve();
      return;
    }

    dispatchProgress('downloading');
    console.log('[OpenCV] Loading script tag...');

    const script = document.createElement('script');
    script.src = '/opencv.js';
    script.async = true;

    script.onload = () => {
      console.log('[OpenCV] Script loaded');
      dispatchProgress('initializing');

      // Check if cv is ready immediately
      if (window.cv && window.cv.Mat) {
        console.log('[OpenCV] Ready immediately after script load');
        cvInstance = window.cv;
        dispatchProgress('ready');
        resolve();
        return;
      }

      // Poll for readiness
      console.log('[OpenCV] Polling for cv.Mat...');
      let attempts = 0;
      const poll = () => {
        if (window.cv && window.cv.Mat) {
          console.log(`[OpenCV] Ready after ${attempts * 100}ms of polling`);
          cvInstance = window.cv;
          dispatchProgress('ready');
          resolve();
        } else if (attempts++ > 600) {
          reject(new Error('OpenCV failed to initialize after 60s'));
        } else {
          setTimeout(poll, 100);
        }
      };
      poll();
    };

    script.onerror = () => reject(new Error('Failed to download OpenCV.js'));
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Get the initialized cv object. Must call loadOpenCV() first.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getCv(): any {
  if (!cvInstance) throw new Error('OpenCV not loaded — call loadOpenCV() first');
  return cvInstance;
}

function dispatchProgress(step: string) {
  if (typeof window !== 'undefined') {
    console.log(`[OpenCV] Progress: ${step}`);
    window.dispatchEvent(new CustomEvent('opencv-progress', { detail: step }));
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeDelete(...mats: any[]) {
  for (const m of mats) {
    try { m?.delete?.(); } catch { /* already deleted */ }
  }
}

export function imageToCanvas(img: HTMLImageElement, maxDim: number = 1024): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;

  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    console.log(`[OpenCV] Resizing from ${img.naturalWidth}x${img.naturalHeight} to ${w}x${h}`);
  }

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

export function getImageScale(img: HTMLImageElement, maxDim: number = 1024): number {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w > maxDim || h > maxDim) {
    return maxDim / Math.max(w, h);
  }
  return 1;
}
