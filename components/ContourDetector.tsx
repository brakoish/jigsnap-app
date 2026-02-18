'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { detectContour, drawContourOnCanvas, getDefaultProcessingParams } from '@/lib/contour';
import { detectA4Paper } from '@/lib/paper-detect';
import type { Contour, A4Paper, ProcessingParams } from '@/lib/types';

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
  const [isProcessing, setIsProcessing] = useState(false);
  const [params, setParams] = useState<ProcessingParams>(getDefaultProcessingParams());
  const [contour, setContour] = useState<Contour | null>(null);
  const [a4Paper, setA4Paper] = useState<A4Paper | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Initial load and A4 detection
  useEffect(() => {
    const loadAndDetect = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Load image
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = imageUrl;
        });
        
        imageRef.current = img;
        
        // Detect A4 paper
        const paper = await detectA4Paper(img);
        setA4Paper(paper);
        onA4Detected(paper);
        
        // Initial contour detection
        await processContour(img, params);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadAndDetect();
  }, [imageUrl, onA4Detected]);

  // Re-process when params change
  useEffect(() => {
    if (imageRef.current && !isLoading) {
      processContour(imageRef.current, params);
    }
  }, [params]);

  const processContour = async (img: HTMLImageElement, processingParams: ProcessingParams) => {
    setIsProcessing(true);
    try {
      const detectedContour = await detectContour(img, processingParams);
      setContour(detectedContour);
      
      if (detectedContour && canvasRef.current) {
        drawContourOnCanvas(canvasRef.current, detectedContour, img);
        onContourDetected(detectedContour, img);
      }
    } catch (err) {
      console.error('Contour detection failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateParam = (key: keyof ProcessingParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
        <div className="text-center">
          <p className="text-zinc-300">Loading OpenCV...</p>
          <p className="text-zinc-500 text-sm">This may take a few moments</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-900/20 border border-red-800 rounded-lg text-center">
        <p className="text-red-400">Error: {error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* A4 Detection Status */}
      {a4Paper ? (
        <div className="flex items-center gap-2 p-3 bg-green-900/20 border border-green-800 rounded-lg">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-green-400 text-sm">
            A4 paper detected - scale calibration available
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
          <div className="w-2 h-2 bg-zinc-500 rounded-full" />
          <span className="text-zinc-400 text-sm">
            No A4 paper detected - manual scale entry required
          </span>
        </div>
      )}

      {/* Canvas Display */}
      <div className="relative rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900">
        <canvas 
          ref={canvasRef}
          className="max-w-full h-auto block"
          style={{ maxHeight: '400px' }}
        />
        {isProcessing && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/50">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-500" />
          </div>
        )}
        
        {/* Legend */}
        <div className="absolute bottom-2 left-2 flex gap-4 text-xs bg-zinc-900/80 px-3 py-2 rounded-lg">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-cyan-500" />
            <span className="text-zinc-400">Object</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-green-500 border-dashed" style={{ borderTop: '1px dashed #22c55e' }} />
            <span className="text-zinc-400">Bounds</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-4 bg-zinc-800/50 p-4 rounded-lg border border-zinc-700">
        <h4 className="text-sm font-medium text-zinc-300">Detection Parameters</h4>
        
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

      {/* Detection Status */}
      {contour ? (
        <div className="text-sm text-zinc-400">
          Detected {contour.points.length} points, area: {Math.round(contour.area).toLocaleString()} px²
        </div>
      ) : (
        <div className="text-sm text-amber-400">
          No contour detected - try adjusting the parameters
        </div>
      )}
    </div>
  );
}
