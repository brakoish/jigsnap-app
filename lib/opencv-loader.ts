// Singleton loader for @techstark/opencv-js
// Emits progress events: 'downloading', 'initializing', 'ready'
// Returns the initialized cv object

import cv from '@techstark/opencv-js';

let cvReady: Promise<typeof cv> | null = null;

export async function loadOpenCV(): Promise<typeof cv> {
  if (cvReady) return cvReady;

  cvReady = (async () => {
    dispatchProgress('initializing');

    // The import is already loaded, just need to wait for WASM init
    // cv is a thenable - await it directly for WASM initialization
    const cvModule = cv as unknown as Promise<typeof cv> & typeof cv;

    if (typeof cvModule.then === 'function') {
      await cvModule;
    } else if (!cvModule.Mat) {
      await new Promise<void>((resolve) => {
        cvModule.onRuntimeInitialized = () => resolve();
      });
    }

    dispatchProgress('ready');
    return cvModule;
  })();

  return cvReady;
}

function dispatchProgress(step: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('opencv-progress', { detail: step }));
  }
}

// Helper: safely delete OpenCV objects
export function safeDelete(...mats: any[]) {
  for (const m of mats) {
    try {
      m?.delete?.();
    } catch {
      /* already deleted */
    }
  }
}

// Helper: convert HTMLImageElement to canvas for cv.imread
export function imageToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0);
  return canvas;
}
