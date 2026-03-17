'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, ZoomIn, ZoomOut, Maximize, Undo2, Redo2, Download, Settings2 } from 'lucide-react';
import { detectContours, detectAtPoint } from '@/lib/contour';
import type { Contour, Point } from '@/lib/types';

interface ContourDetectorProps {
  imageUrl: string;
  onContourDetected: (contour: Contour) => void;
  onA4Detected?: (paper: { corners: Point[]; width: number; height: number } | null) => void;
}

export default function ContourDetector({ imageUrl, onContourDetected, onA4Detected }: ContourDetectorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Core state
  const [isLoading, setIsLoading] = useState(true);
  const [isDetecting, setIsDetecting] = useState(false);
  const [contour, setContour] = useState<Contour | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // View state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  
  // History for undo/redo
  const [history, setHistory] = useState<Point[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  
  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [blurAmount, setBlurAmount] = useState(15);
  const [threshold, setThreshold] = useState(130);
  const [offsetMm, setOffsetMm] = useState(0.5);
  const [showOffset, setShowOffset] = useState(false);
  
  // Load image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setIsLoading(false);
      // Auto-detect on load
      handleAutoDetect();
    };
    img.onerror = () => setError('Failed to load image');
    img.src = imageUrl;
  }, [imageUrl]);
  
  // Draw canvas
  useEffect(() => {
    if (!canvasRef.current || !imageRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Set canvas size to match image
    canvas.width = imageRef.current.naturalWidth;
    canvas.height = imageRef.current.naturalHeight;
    
    // Clear and draw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    ctx.drawImage(imageRef.current, 0, 0);
    
    // Draw contour if exists
    if (points.length > 0) {
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3 / zoom;
      ctx.fillStyle = 'rgba(6, 182, 212, 0.1)';
      
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      // Draw handles
      ctx.fillStyle = '#06b6d4';
      points.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6 / zoom, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    
    ctx.restore();
  }, [points, zoom, pan]);
  
  // Auto-detect largest object
  const handleAutoDetect = async () => {
    if (!imageRef.current) return;
    setIsDetecting(true);

    try {
      const contours = await detectContours(imageRef.current);
      if (contours.length > 0) {
        // Find paper (largest contour > 30% of image)
        const canvas = canvasRef.current;
        const imageArea = canvas ? canvas.width * canvas.height : 1;
        const paper = contours.find(c => c.area > imageArea * 0.3);
        
        if (paper && onA4Detected) {
          const xs = paper.points.map(p => p.x);
          const ys = paper.points.map(p => p.y);
          onA4Detected({
            corners: [
              { x: Math.min(...xs), y: Math.min(...ys) },
              { x: Math.max(...xs), y: Math.min(...ys) },
              { x: Math.max(...xs), y: Math.max(...ys) },
              { x: Math.min(...xs), y: Math.max(...ys) }
            ],
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys)
          });
        }
        
        // Use largest non-paper contour for object
        const obj = contours.find(c => c !== paper) || contours[0];
        setContour(obj);
        setPoints(obj.points);
        setHistory([obj.points]);
        setHistoryIndex(0);
        onContourDetected(obj);
      }
    } catch (err) {
      console.error('Detection error:', err);
      setError('Detection failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsDetecting(false);
    }
  };

  // Click to detect at specific point
  const handleCanvasClick = async (e: React.MouseEvent) => {
    if (!canvasRef.current || !imageRef.current || isDragging) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - pan.x) / zoom;
    const y = (e.clientY - rect.top - pan.y) / zoom;
    
    setIsDetecting(true);
    try {
      const result = await detectAtPoint(imageRef.current, { x, y });
      if (result) {
        setContour(result);
        setPoints(result.points);
        pushHistory(result.points);
        onContourDetected(result);
      }
    } catch (err) {
      console.error('Click detection failed', err);
    } finally {
      setIsDetecting(false);
    }
  };
  
  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };
  
  const handleMouseUp = () => setIsDragging(false);
  
  // Zoom centered on canvas
  const zoomAt = (newZoom: number, centerX?: number, centerY?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Use center of canvas if not specified
    const cx = centerX ?? canvas.width / 2;
    const cy = centerY ?? canvas.height / 2;
    
    // Calculate new pan to keep center point stable
    const scale = newZoom / zoom;
    const newPanX = cx - (cx - pan.x) * scale;
    const newPanY = cy - (cy - pan.y) * scale;
    
    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };
  
  const handleZoomIn = () => zoomAt(Math.min(zoom * 1.5, 8));
  const handleZoomOut = () => zoomAt(Math.max(zoom / 1.5, 0.5));
  const handleResetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  
  // History
  const pushHistory = (newPoints: Point[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...newPoints]);
    if (newHistory.length > 20) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };
  
  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setPoints([...history[newIndex]]);
    }
  };
  
  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setPoints([...history[newIndex]]);
    }
  };
  
  // Smooth contour - use Douglas-Peucker-like algorithm
  const handleSmooth = () => {
    if (points.length < 8) return;

    // Calculate centroid
    const centroid = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    centroid.x /= points.length;
    centroid.y /= points.length;

    // Sort by angle from centroid to maintain shape
    const sorted = [...points].sort((a, b) => {
      const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
      const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
      return angleA - angleB;
    });

    // Remove points that are too close together (but keep shape)
    const minDist = 15;
    const cleaned: Point[] = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const last = cleaned[cleaned.length - 1];
      const curr = sorted[i];
      const dist = Math.sqrt(Math.pow(curr.x - last.x, 2) + Math.pow(curr.y - last.y, 2));

      if (dist >= minDist) {
        cleaned.push(curr);
      }
    }

    // Ensure we have enough points and close the loop
    if (cleaned.length >= 6) {
      setPoints(cleaned);
      pushHistory(cleaned);
      if (contour) {
        onContourDetected({ ...contour, points: cleaned });
      }
    }
  };

  // Apply offset to contour points
  const applyOffset = (pts: Point[], offset: number): Point[] => {
    // Calculate centroid
    const centroid = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    centroid.x /= pts.length;
    centroid.y /= pts.length;

    // Move each point outward from centroid
    return pts.map(p => {
      const dx = p.x - centroid.x;
      const dy = p.y - centroid.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return p;
      const scale = (dist + offset) / dist;
      return {
        x: Math.round(centroid.x + dx * scale),
        y: Math.round(centroid.y + dy * scale)
      };
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="flex items-center justify-center h-96 text-red-400">
        {error}
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
        <div className="flex items-center gap-2">
          <button onClick={undo} disabled={historyIndex <= 0} className="p-2 hover:bg-zinc-700 rounded disabled:opacity-30">
            <Undo2 className="w-4 h-4" />
          </button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-2 hover:bg-zinc-700 rounded disabled:opacity-30">
            <Redo2 className="w-4 h-4" />
          </button>
          <div className="w-px h-6 bg-zinc-700 mx-2" />
          <button onClick={handleZoomOut} className="p-2 hover:bg-zinc-700 rounded">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-zinc-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} className="p-2 hover:bg-zinc-700 rounded">
            <ZoomIn className="w-4 h-4" />
          </button>
          <button onClick={handleResetView} className="p-2 hover:bg-zinc-700 rounded">
            <Maximize className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={handleSmooth}
            disabled={points.length < 8}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded text-sm"
          >
            Smooth
          </button>
          <button 
            onClick={handleAutoDetect}
            disabled={isDetecting}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 rounded text-sm flex items-center gap-2"
          >
            {isDetecting && <Loader2 className="w-3 h-3 animate-spin" />}
            Auto-Detect
          </button>
          <button 
            onClick={() => setShowOffset(s => !s)}
            className={`p-2 rounded ${showOffset ? 'bg-amber-600' : 'hover:bg-zinc-700'}`}
            title="Offset"
          >
            <span className="text-xs font-bold">+</span>
          </button>
          <button 
            onClick={() => setShowSettings(s => !s)}
            className={`p-2 rounded ${showSettings ? 'bg-cyan-600' : 'hover:bg-zinc-700'}`}
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Offset Panel */}
      {showOffset && (
        <div className="p-4 bg-zinc-800/50 rounded-lg space-y-4">
          <div>
            <label className="text-sm text-zinc-400">Contour Offset (mm)</label>
            <input 
              type="range" min="0" max="5" step="0.1" 
              value={offsetMm}
              onChange={(e) => {
                const newOffset = parseFloat(e.target.value);
                setOffsetMm(newOffset);
                // Apply offset to current contour
                if (contour && points.length > 0) {
                  // Simple offset - expand outward
                  const offsetPoints = applyOffset(points, newOffset * 10); // Convert mm to pixels (approx)
                  setPoints(offsetPoints);
                  onContourDetected({ ...contour, points: offsetPoints });
                }
              }}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-xs text-zinc-500">
              <span>0mm</span>
              <span>{offsetMm.toFixed(1)}mm</span>
              <span>5mm</span>
            </div>
            <p className="text-xs text-zinc-500 mt-1">Add clearance around the object</p>
          </div>
        </div>
      )}
      
      {/* Settings Panel */}
      {showSettings && (
        <div className="p-4 bg-zinc-800/50 rounded-lg space-y-4">
          <div>
            <label className="text-sm text-zinc-400">Blur Amount</label>
            <input 
              type="range" min="5" max="35" step="2" 
              value={blurAmount}
              onChange={(e) => setBlurAmount(parseInt(e.target.value))}
              className="w-full accent-cyan-500"
            />
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Light</span>
              <span>{blurAmount}px</span>
              <span>Heavy</span>
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400">Threshold</label>
            <input 
              type="range" min="50" max="200" 
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value))}
              className="w-full accent-cyan-500"
            />
            <div className="flex justify-between text-xs text-zinc-500">
              <span>Dark</span>
              <span>{threshold}</span>
              <span>Light</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Canvas */}
      <div 
        ref={containerRef}
        className="relative rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900 cursor-crosshair"
        style={{ height: '500px' }}
      >
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className="absolute inset-0"
        />
        
        {isDetecting && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/50">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        )}
        
        {/* Instructions */}
        <div className="absolute bottom-4 left-4 right-4 p-3 bg-zinc-900/80 rounded-lg text-sm text-zinc-300">
          <p><strong>Click anywhere</strong> on the object to detect its outline</p>
          <p className="text-xs text-zinc-500 mt-1">Drag to pan • Scroll to zoom • Use Smooth to clean jagged edges</p>
        </div>
      </div>
      
      {/* Status */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-zinc-400">
          {points.length > 0 ? `${points.length} points` : 'No contour detected'}
        </span>
        {points.length > 0 && (
          <button 
            onClick={() => onContourDetected(contour!)}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Continue to Export
          </button>
        )}
      </div>
    </div>
  );
}
