'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { detectAllContours, drawContoursOnCanvas, pointInPolygon, getDefaultProcessingParams } from '@/lib/contour';
import { detectPaper } from '@/lib/paper-detect';
import type { Contour, ContourCandidate, A4Paper, ProcessingParams } from '@/lib/types';

interface ContourDetectorProps {
  imageUrl: string;
  onContourDetected: (contour: Contour, imageElement: HTMLImageElement) => void;
  onA4Detected: (paper: A4Paper | null) => void;
}

export default function ContourDetector({
  imageUrl,
  onContourDetected,
  onA4Detected
}: ContourDetectorProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<string>('Loading image...');
  const [isProcessing, setIsProcessing] = useState(false);
  const [params, setParams] = useState<ProcessingParams>(getDefaultProcessingParams());
  const [contours, setContours] = useState<ContourCandidate[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [a4Paper, setA4Paper] = useState<A4Paper | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showParams, setShowParams] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const displayScaleRef = useRef<number>(1);

  // Calculate display scale when canvas resizes
  useEffect(() => {
    if (canvasRef.current && imageRef.current) {
      const img = imageRef.current;
      const maxDisplay = 1200;
      const origW = img.naturalWidth;
      const origH = img.naturalHeight;
      
      let scale = 1;
      if (origW > maxDisplay || origH > maxDisplay) {
        scale = maxDisplay / Math.max(origW, origH);
      }
      
      const canvasW = Math.round(origW * scale);
      displayScaleRef.current = canvasW / canvasRef.current.width;
    }
  }, [contours]);

  // Listen for OpenCV progress events
  useEffect(() => {
    const handleOpenCVProgress = (e: CustomEvent) => {
      const step = e.detail;
      if (step === 'downloading') {
        setLoadingStep('Downloading OpenCV (~11MB)...');
      } else if (step === 'initializing') {
        setLoadingStep('Initializing OpenCV engine...');
      } else if (step === 'ready') {
        setLoadingStep('Detecting contours...');
      }
    };

    window.addEventListener('opencv-progress', handleOpenCVProgress as EventListener);
    return () => {
      window.removeEventListener('opencv-progress', handleOpenCVProgress as EventListener);
    };
  }, []);

  // Initial load and paper detection
  useEffect(() => {
    const loadAndDetect = async () => {
      setIsLoading(true);
      setError(null);
      setLoadingStep('Loading image...');
      setContours([]);
      setSelectedIndex(-1);

      try {
        // Load image
        const img = new Image();
        if (imageUrl.startsWith('http')) {
          img.crossOrigin = 'anonymous';
        }

        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            console.log('[ContourDetector] Image loaded:', img.naturalWidth, 'x', img.naturalHeight);
            resolve();
          };
          img.onerror = (e) => {
            console.error('[ContourDetector] Image load failed:', e);
            reject(new Error('Failed to load image'));
          };
          img.src = imageUrl;
        });

        imageRef.current = img;
        setLoadingStep('Detecting paper...');

        // Detect paper
        let paper: A4Paper | null = null;
        try {
          paper = await detectPaper(img, 'letter');
        } catch (paperErr) {
          console.warn('[ContourDetector] Paper detection failed:', paperErr);
        }

        setA4Paper(paper);
        onA4Detected(paper);

        setLoadingStep('Detecting contours...');

        // Initial contour detection
        await detectContours(img);
      } catch (err) {
        console.error('[ContourDetector] Error:', err);
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    };

    loadAndDetect();
  }, [imageUrl, onA4Detected]);

  // Detect contours function
  const detectContours = async (img: HTMLImageElement) => {
    setIsProcessing(true);
    setError(null);
    try {
      console.log('[ContourDetector] Detecting all contours...');
      const detectedContours = await detectAllContours(img);
      console.log(`[ContourDetector] Found ${detectedContours.length} contours`);
      setContours(detectedContours);
      
      // Auto-select the first non-paper object if available
      const firstObjectIndex = detectedContours.findIndex(c => !c.isPaper);
      if (firstObjectIndex !== -1) {
        setSelectedIndex(firstObjectIndex);
        const selectedContour = detectedContours[firstObjectIndex];
        onContourDetected(
          { points: selectedContour.points, area: selectedContour.area },
          img
        );
      }
    } catch (err) {
      console.error('[ContourDetector] Contour detection failed:', err);
      setError(err instanceof Error ? err.message : 'Contour detection failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Re-detect when requested
  const handleRedetect = useCallback(async () => {
    if (imageRef.current) {
      setSelectedIndex(-1);
      await detectContours(imageRef.current);
    }
  }, []);

  // Handle canvas click for contour selection
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || contours.length === 0) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Calculate click position relative to canvas
    const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    const clickPoint = { x: clickX, y: clickY };

    // Find which contour contains this point
    // Check in reverse order (topmost first)
    for (let i = contours.length - 1; i >= 0; i--) {
      const contour = contours[i];
      const scaledPoints = contour.points.map(p => ({
        x: p.x * (canvas.width / (imageRef.current?.naturalWidth || 1)),
        y: p.y * (canvas.height / (imageRef.current?.naturalHeight || 1))
      }));
      
      if (pointInPolygon(clickPoint, scaledPoints)) {
        setSelectedIndex(i);
        
        // Notify parent of selection
        onContourDetected(
          { points: contour.points, area: contour.area },
          imageRef.current!
        );
        break;
      }
    }
  }, [contours, onContourDetected]);

  // Draw contours whenever they change or selection changes
  useEffect(() => {
    if (canvasRef.current && imageRef.current && contours.length > 0) {
      console.log('[ContourDetector] Drawing contours, selected:', selectedIndex);
      drawContoursOnCanvas(canvasRef.current, contours, imageRef.current, selectedIndex);
    }
  }, [contours, selectedIndex]);

  const updateParam = (key: keyof ProcessingParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const objectCount = contours.filter(c => !c.isPaper).length;
  const paperCount = contours.filter(c => c.isPaper).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Paper Detection Status */}
      {a4Paper ? (
        <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-800 rounded-lg">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-green-400 text-sm">
            Paper detected - scale calibration available
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
          <div className="w-2 h-2 bg-zinc-500 rounded-full" />
          <span className="text-zinc-400 text-sm">
            No paper detected - manual scale entry required
          </span>
        </div>
      )}

      {/* Status Bar */}
      <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
        <div className="flex items-center gap-4">
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
              <span className="text-zinc-400 text-sm">Detecting contours...</span>
            </>
          ) : contours.length > 0 ? (
            <>
              <span className="text-zinc-300 text-sm">
                Found <strong className="text-white">{objectCount}</strong> object{objectCount !== 1 ? 's' : ''} and <strong className="text-green-400">{paperCount}</strong> paper
              </span>
            </>
          ) : (
            <span className="text-amber-400 text-sm">No contours found</span>
          )}
        </div>
        <button
          onClick={handleRedetect}
          disabled={isProcessing || !imageRef.current}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
          Re-detect
        </button>
      </div>

      {/* Canvas Display */}
      <div className="relative rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className={`max-w-full h-auto block ${contours.length > 0 ? 'cursor-pointer' : ''}`}
          style={{ maxHeight: '500px' }}
        />
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/70">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
              <span className="text-zinc-400 text-sm">{loadingStep}</span>
            </div>
          </div>
        )}

        {/* Click Instruction Overlay */}
        {!isProcessing && contours.length > 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 px-4 py-2 bg-zinc-900/90 rounded-full border border-zinc-700">
            <span className="text-zinc-300 text-sm font-medium">
              Click on the object you want to trace
            </span>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-2 left-2 flex flex-col gap-2 text-xs bg-zinc-900/90 px-3 py-2 rounded-lg border border-zinc-700">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-green-500/30 border border-green-500 border-dashed" />
            <span className="text-zinc-400">Paper (reference)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-blue-400" />
            <span className="text-zinc-400">Detected object</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-cyan-500/20 border-2 border-cyan-500" />
            <span className="text-cyan-400 font-medium">Selected</span>
          </div>
        </div>
      </div>

      {/* Selected Contour Info */}
      {selectedIndex !== -1 && contours[selectedIndex] && (
        <div className="p-4 bg-cyan-900/20 border border-cyan-800 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-cyan-400 font-medium">
                {contours[selectedIndex].isPaper ? 'Paper Selected' : 'Object Selected'}
              </h4>
              <p className="text-zinc-400 text-sm mt-1">
                {contours[selectedIndex].points.length} points, area: {Math.round(contours[selectedIndex].area).toLocaleString()} px²
                {' '}({contours[selectedIndex].detectionMethod} detection)
              </p>
            </div>
            {contours[selectedIndex].isPaper && (
              <div className="text-amber-400 text-xs bg-amber-900/30 px-3 py-1.5 rounded">
                Objects work better than paper
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collapsible Detection Parameters */}
      <div className="bg-zinc-800/50 rounded-lg border border-zinc-700 overflow-hidden">
        <button
          onClick={() => setShowParams(!showParams)}
          className="w-full flex items-center justify-between p-4 hover:bg-zinc-800 transition-colors"
        >
          <h4 className="text-sm font-medium text-zinc-300">Detection Parameters</h4>
          {showParams ? (
            <ChevronUp className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          )}
        </button>
        
        {showParams && (
          <div className="p-4 pt-0 space-y-4">
            {/* Blur Kernel */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Blur</span>
                <span className="text-zinc-500">{params.blurKernel}px</span>
              </div>
              <input
                type="range"
                min="3"
                max="15"
                step="2"
                value={params.blurKernel}
                onChange={(e) => updateParam('blurKernel', parseInt(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>

            {/* Canny Low Threshold */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Edge Sensitivity (Low)</span>
                <span className="text-zinc-500">{params.cannyLow}</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                value={params.cannyLow}
                onChange={(e) => updateParam('cannyLow', parseInt(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>

            {/* Canny High Threshold */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Edge Threshold (High)</span>
                <span className="text-zinc-500">{params.cannyHigh}</span>
              </div>
              <input
                type="range"
                min="50"
                max="250"
                value={params.cannyHigh}
                onChange={(e) => updateParam('cannyHigh', parseInt(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>

            {/* Epsilon (Simplification) */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-400">Contour Simplification</span>
                <span className="text-zinc-500">{params.epsilon.toFixed(3)}</span>
              </div>
              <input
                type="range"
                min="0.001"
                max="0.05"
                step="0.001"
                value={params.epsilon}
                onChange={(e) => updateParam('epsilon', parseFloat(e.target.value))}
                className="w-full accent-cyan-500"
              />
            </div>

            {/* Reset Button */}
            <button
              onClick={() => setParams(getDefaultProcessingParams())}
              className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Reset to defaults
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
