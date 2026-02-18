'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, ChevronDown, ChevronUp, Plus, Eye, EyeOff, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { detectAllContours, simplifyContour, offsetContour, warpPerspective, getDefaultProcessingParams } from '@/lib/contour';
import { detectPaper } from '@/lib/paper-detect';
import type { Contour, ContourCandidate, A4Paper, ProcessingParams, Point } from '@/lib/types';

interface ContourDetectorProps {
  imageUrl: string;
  onContourDetected: (contour: Contour, imageElement: HTMLImageElement) => void;
  onA4Detected: (paper: A4Paper | null) => void;
}

const HANDLE_RADIUS = 8;
const HIT_RADIUS = 22;
const PAPER_HANDLE_RADIUS = 10;
const PAPER_HIT_RADIUS = 24;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;

type Mode = 'select' | 'edit-contour';

export default function ContourDetector({ imageUrl, onContourDetected, onA4Detected }: ContourDetectorProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState('Loading image...');
  const [isProcessing, setIsProcessing] = useState(false);
  const [contours, setContours] = useState<ContourCandidate[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [editablePoints, setEditablePoints] = useState<Point[]>([]);
  const [paperCorners, setPaperCorners] = useState<Point[]>([]);
  const [showPaper, setShowPaper] = useState(true);
  const [noPaper, setNoPaper] = useState(false);
  const [mode, setMode] = useState<Mode>('select');
  const [simplifyLevel, setSimplifyLevel] = useState(2);
  const [offsetMm, setOffsetMm] = useState(0.5); // mm to expand contour
  const [showParams, setShowParams] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params] = useState<ProcessingParams>(getDefaultProcessingParams());
  const [isWarped, setIsWarped] = useState(false);
  const [warpedImageUrl, setWarpedImageUrl] = useState<string | null>(null);
  const pixelsPerMmRef = useRef<number>(10); // will be set from calibration

  // Zoom/pan state
  const [zoom, setZoom] = useState(1);

  // Expose pixelsPerMm setter for parent
  useEffect(() => {
    // Store reference for offset calculation
    const handler = (e: CustomEvent) => {
      if (e.detail?.pixelsPerMm) pixelsPerMmRef.current = e.detail.pixelsPerMm;
    };
    window.addEventListener('calibration-updated', handler as EventListener);
    return () => window.removeEventListener('calibration-updated', handler as EventListener);
  }, []);
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<Point>({ x: 0, y: 0 });
  const panOffsetStartRef = useRef<Point>({ x: 0, y: 0 });
  const lastPinchDistRef = useRef<number>(0);

  // Drag state
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [dragTarget, setDragTarget] = useState<'contour' | 'paper' | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const animFrameRef = useRef(0);

  // Base scale: fit image into container with padding
  const getBaseScale = useCallback(() => {
    const img = imageRef.current;
    const container = containerRef.current;
    if (!img || !container) return 1;
    const containerW = container.clientWidth;
    const containerH = container.clientHeight || 500;
    const w = img.naturalWidth, h = img.naturalHeight;
    // Fit with 5% padding
    const scale = Math.min(
      (containerW * 0.9) / w,
      (containerH * 0.9) / h,
      1
    );
    return scale;
  }, []);

  // Convert screen coords to image coords (accounting for zoom+pan+centering)
  const screenToImage = useCallback((screenX: number, screenY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;
    const baseScale = getBaseScale();
    const imgW = (imageRef.current?.naturalWidth || 0) * baseScale;
    const imgH = (imageRef.current?.naturalHeight || 0) * baseScale;
    const centerX = (canvas.width - imgW * zoom) / 2 + panOffset.x;
    const centerY = (canvas.height - imgH * zoom) / 2 + panOffset.y;
    const imgX = (canvasX - centerX) / (baseScale * zoom);
    const imgY = (canvasY - centerY) / (baseScale * zoom);
    return { x: Math.round(imgX), y: Math.round(imgY) };
  }, [zoom, panOffset, getBaseScale]);

  // Convert image coords to canvas coords
  const imageToCanvas = useCallback((imgX: number, imgY: number): Point => {
    const baseScale = getBaseScale();
    return {
      x: imgX * baseScale * zoom + panOffset.x,
      y: imgY * baseScale * zoom + panOffset.y,
    };
  }, [zoom, panOffset, getBaseScale]);

  // OpenCV progress
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail === 'downloading') setLoadingStep('Downloading OpenCV (~11MB)...');
      else if (e.detail === 'initializing') setLoadingStep('Initializing OpenCV engine...');
      else if (e.detail === 'ready') setLoadingStep('Detecting contours...');
    };
    window.addEventListener('opencv-progress', handler as EventListener);
    return () => window.removeEventListener('opencv-progress', handler as EventListener);
  }, []);

  // Initial load
  useEffect(() => {
    const loadAndDetect = async () => {
      setIsLoading(true);
      setError(null);
      setLoadingStep('Loading image...');
      setContours([]);
      setSelectedIndex(-1);
      setEditablePoints([]);

      try {
        const img = new Image();
        if (imageUrl.startsWith('http')) img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = imageUrl;
        });
        imageRef.current = img;

        setLoadingStep('Detecting paper...');
        let paper: A4Paper | null = null;
        try { paper = await detectPaper(img, 'letter'); } catch {}

        if (paper && paper.corners.length === 4) {
          setPaperCorners(paper.corners.map(c => ({ ...c })));
          
          // Auto-warp when paper is detected
          setLoadingStep('Warping perspective...');
          try {
            const xs = paper.corners.map(p => p.x);
            const ys = paper.corners.map(p => p.y);
            const width = Math.max(...xs) - Math.min(...xs);
            const height = Math.max(...ys) - Math.min(...ys);
            
            // Calculate pixels per mm (US Letter: 215.9mm x 279.4mm)
            const paperWidthMm = 215.9;
            const paperHeightMm = 279.4;
            const scale = Math.min(2048 / Math.max(width, height), 1);
            const destW = Math.round(width * scale);
            const destH = Math.round(height * scale);
            const pixelsPerMm = ((destW / paperWidthMm) + (destH / paperHeightMm)) / 2;
            pixelsPerMmRef.current = pixelsPerMm;
            
            const warpedCanvas = await warpPerspective(img, paper.corners, destW, destH);
            const blob = await new Promise<Blob | null>((resolve) => warpedCanvas.toBlob(resolve, 'image/jpeg', 0.95));
            if (blob) {
              const url = URL.createObjectURL(blob);
              if (warpedImageUrl) URL.revokeObjectURL(warpedImageUrl);
              setWarpedImageUrl(url);
              setIsWarped(true);

              const warpedImg = new Image();
              await new Promise<void>((resolve, reject) => {
                warpedImg.onload = () => resolve();
                warpedImg.onerror = () => reject(new Error('Failed to load warped image'));
                warpedImg.src = url;
              });
              imageRef.current = warpedImg;
              setPaperCorners([
                { x: 0, y: 0 },
                { x: destW, y: 0 },
                { x: destW, y: destH },
                { x: 0, y: destH },
              ]);
            }
          } catch (e) {
            console.warn('Auto-warp failed:', e);
          }

        } else {
          const w = img.naturalWidth, h = img.naturalHeight;
          const inX = Math.round(w * 0.1), inY = Math.round(h * 0.1);
          setPaperCorners([
            { x: inX, y: inY }, { x: w - inX, y: inY },
            { x: w - inX, y: h - inY }, { x: inX, y: h - inY },
          ]);
        }
        onA4Detected(paper);

        setLoadingStep('Detecting contours...');
        await doDetectContours(imageRef.current || img);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsLoading(false);
      }
    };
    loadAndDetect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  const doDetectContours = async (img: HTMLImageElement) => {
    setIsProcessing(true);
    setError(null);
    try {
      const detected = await detectAllContours(img);
      setContours(detected);
      const firstObj = detected.findIndex(c => !c.isPaper);
      if (firstObj !== -1) {
        setSelectedIndex(firstObj);
        const simplified = simplifyContour(detected[firstObj].points, simplifyLevel * 1.5);
        setEditablePoints(simplified.map(p => ({ ...p })));
        onContourDetected({ points: simplified, area: detected[firstObj].area }, img);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Detection failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Re-simplify when slider changes
  useEffect(() => {
    if (selectedIndex >= 0 && contours[selectedIndex]) {
      const raw = contours[selectedIndex].points;
      const simplified = simplifyContour(raw, simplifyLevel * 1.5);
      setEditablePoints(simplified.map(p => ({ ...p })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simplifyLevel]);

  // Apply offset and notify parent
  useEffect(() => {
    if (editablePoints.length >= 3 && imageRef.current) {
      // Convert mm offset to pixels
      const offsetPx = offsetMm * pixelsPerMmRef.current;
      const offsetPoints = offsetPx !== 0 ? offsetContour(editablePoints, offsetPx) : editablePoints;

      let area = 0;
      for (let i = 0; i < offsetPoints.length; i++) {
        const j = (i + 1) % offsetPoints.length;
        area += offsetPoints[i].x * offsetPoints[j].y;
        area -= offsetPoints[j].x * offsetPoints[i].y;
      }
      area = Math.abs(area) / 2;
      onContourDetected({ points: offsetPoints, area }, imageRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editablePoints, offsetMm, onContourDetected]);

  // Notify parent when paper corners change
  useEffect(() => {
    if (noPaper) { onA4Detected(null); return; }
    if (paperCorners.length === 4) {
      const xs = paperCorners.map(p => p.x), ys = paperCorners.map(p => p.y);
      onA4Detected({
        corners: paperCorners,
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      });
    }
  }, [paperCorners, noPaper, onA4Detected]);

  // ---- Drawing ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    const container = containerRef.current;
    if (!canvas || !img || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Size canvas to fill container
    const rect = container.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    const baseScale = getBaseScale();
    const imgW = img.naturalWidth * baseScale;
    const imgH = img.naturalHeight * baseScale;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    
    // Center the image in the canvas initially
    const centerX = (canvas.width - imgW * zoom) / 2 + panOffset.x;
    const centerY = (canvas.height - imgH * zoom) / 2 + panOffset.y;
    ctx.translate(centerX, centerY);
    ctx.scale(zoom, zoom);

    ctx.drawImage(img, 0, 0, imgW, imgH);

    // Helper: image coords to scaled-canvas coords
    const s = (p: Point) => ({ x: p.x * baseScale, y: p.y * baseScale });

    // Draw non-selected contours faintly
    contours.forEach((c, idx) => {
      if (idx === selectedIndex || c.isPaper) return;
      const pts = c.points.map(s);
      if (pts.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.4)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.stroke();
    });

    // Paper corners
    if (showPaper && !noPaper && paperCorners.length === 4) {
      const ppts = paperCorners.map(s);
      ctx.beginPath();
      ctx.moveTo(ppts[0].x, ppts[0].y);
      for (let i = 1; i < 4; i++) ctx.lineTo(ppts[i].x, ppts[i].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(34, 197, 94, 0.08)';
      ctx.fill();
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2 / zoom;
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.stroke();
      ctx.setLineDash([]);
      ppts.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, PAPER_HANDLE_RADIUS / zoom, 0, Math.PI * 2);
        ctx.fillStyle = draggingIdx === i && dragTarget === 'paper' ? '#22c55e' : 'rgba(34, 197, 94, 0.8)';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
      });
    }

    // Editable contour
    if (editablePoints.length >= 3) {
      const pts = editablePoints.map(s);
      
      // Draw offset preview if offset is set
      const offsetPx = offsetMm * pixelsPerMmRef.current * baseScale;
      if (Math.abs(offsetPx) > 0.5) {
        const offsetPts = offsetContour(pts.map(p => ({x: p.x / baseScale, y: p.y / baseScale})), offsetPx / baseScale).map(s);
        ctx.beginPath();
        ctx.moveTo(offsetPts[0].x, offsetPts[0].y);
        for (let i = 1; i < offsetPts.length; i++) ctx.lineTo(offsetPts[i].x, offsetPts[i].y);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)'; // amber color for offset
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([5 / zoom, 5 / zoom]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      // Draw main contour
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(6, 182, 212, 0.15)';
      ctx.fill();
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3 / zoom;
      ctx.stroke();

      if (mode === 'edit-contour') {
        pts.forEach((p, i) => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, HANDLE_RADIUS / zoom, 0, Math.PI * 2);
          ctx.fillStyle = draggingIdx === i && dragTarget === 'contour' ? '#06b6d4' : 'rgba(6, 182, 212, 0.9)';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5 / zoom;
          ctx.stroke();
        });
      }
    }

    ctx.restore();
  }, [contours, selectedIndex, editablePoints, paperCorners, showPaper, noPaper, mode, draggingIdx, dragTarget, getBaseScale, zoom, panOffset, offsetMm]);

  useEffect(() => { draw(); }, [draw]);

  // ---- Zoom helpers ----
  const zoomAt = useCallback((newZoom: number, centerX?: number, centerY?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) { setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))); return; }
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    if (centerX !== undefined && centerY !== undefined) {
      // Zoom toward the point
      const rect = canvas.getBoundingClientRect();
      const cx = (centerX - rect.left) * (canvas.width / rect.width);
      const cy = (centerY - rect.top) * (canvas.height / rect.height);
      const ratio = clampedZoom / zoom;
      setPanOffset(prev => ({
        x: cx - ratio * (cx - prev.x),
        y: cy - ratio * (cy - prev.y),
      }));
    }
    setZoom(clampedZoom);
  }, [zoom]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  // ---- Wheel zoom ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      zoomAt(zoom * delta, e.clientX, e.clientY);
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [zoom, zoomAt]);

  // ---- Pointer events ----
  const getClientPos = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) {
      const t = e.touches[0] || (e as React.TouchEvent).changedTouches[0];
      return { clientX: t.clientX, clientY: t.clientY };
    }
    return { clientX: e.clientX, clientY: e.clientY };
  };

  const findHandle = useCallback((imgPt: Point): { target: 'contour' | 'paper'; index: number } | null => {
    const baseScale = getBaseScale();
    const hitR = HIT_RADIUS / (baseScale * zoom);

    if (showPaper && !noPaper) {
      for (let i = 0; i < paperCorners.length; i++) {
        const dx = imgPt.x - paperCorners[i].x, dy = imgPt.y - paperCorners[i].y;
        if (dx * dx + dy * dy <= (PAPER_HIT_RADIUS / (baseScale * zoom)) ** 2)
          return { target: 'paper', index: i };
      }
    }
    if (mode === 'edit-contour') {
      for (let i = 0; i < editablePoints.length; i++) {
        const dx = imgPt.x - editablePoints[i].x, dy = imgPt.y - editablePoints[i].y;
        if (dx * dx + dy * dy <= hitR * hitR)
          return { target: 'contour', index: i };
      }
    }
    return null;
  }, [editablePoints, paperCorners, showPaper, noPaper, mode, getBaseScale, zoom]);

  const findContourAtPoint = useCallback((imgPt: Point): number => {
    for (let i = contours.length - 1; i >= 0; i--) {
      if (contours[i].isPaper) continue;
      const pts = contours[i].points;
      let inside = false;
      for (let j = 0, k = pts.length - 1; j < pts.length; k = j++) {
        if (((pts[j].y > imgPt.y) !== (pts[k].y > imgPt.y)) &&
            (imgPt.x < (pts[k].x - pts[j].x) * (imgPt.y - pts[j].y) / (pts[k].y - pts[j].y) + pts[j].x))
          inside = !inside;
      }
      if (inside) return i;
    }
    return -1;
  }, [contours]);

  const findClosestEdge = useCallback((imgPt: Point): { index: number; point: Point } | null => {
    if (editablePoints.length < 3) return null;
    const baseScale = getBaseScale();
    const maxDist = 20 / (baseScale * zoom); // 20px screen distance
    let bestDist = maxDist, bestIdx = -1, bestPoint: Point = { x: 0, y: 0 };
    for (let i = 0; i < editablePoints.length; i++) {
      const j = (i + 1) % editablePoints.length;
      const ax = editablePoints[i].x, ay = editablePoints[i].y;
      const bx = editablePoints[j].x, by = editablePoints[j].y;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      let t = ((imgPt.x - ax) * dx + (imgPt.y - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = ax + t * dx, py = ay + t * dy;
      const dist = Math.sqrt((imgPt.x - px) ** 2 + (imgPt.y - py) ** 2);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = j;
        bestPoint = { x: Math.round(px), y: Math.round(py) };
      }
    }
    return bestIdx === -1 ? null : { index: bestIdx, point: bestPoint };
  }, [editablePoints, getBaseScale, zoom]);

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // Pinch zoom (2 fingers)
    if ('touches' in e && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
      return;
    }

    e.preventDefault();
    const { clientX, clientY } = getClientPos(e);
    const imgPt = screenToImage(clientX, clientY);
    const handle = findHandle(imgPt);

    if (handle) {
      setDraggingIdx(handle.index);
      setDragTarget(handle.target);
      return;
    }

    if (mode === 'edit-contour') {
      const edge = findClosestEdge(imgPt);
      if (edge) {
        const newPts = [...editablePoints];
        newPts.splice(edge.index, 0, edge.point);
        setEditablePoints(newPts);
        return;
      }
    }

    // Check contour selection
    const idx = findContourAtPoint(imgPt);
    if (idx !== -1 && idx !== selectedIndex) {
      setSelectedIndex(idx);
      const simplified = simplifyContour(contours[idx].points, simplifyLevel * 1.5);
      setEditablePoints(simplified.map(p => ({ ...p })));
      if (imageRef.current)
        onContourDetected({ points: simplified, area: contours[idx].area }, imageRef.current);
      return;
    }

    // Otherwise: start panning
    setIsPanning(true);
    panStartRef.current = { x: clientX, y: clientY };
    panOffsetStartRef.current = { ...panOffset };
  }, [screenToImage, findHandle, findClosestEdge, findContourAtPoint, mode, selectedIndex, contours, editablePoints, simplifyLevel, panOffset, onContourDetected]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // Pinch zoom
    if ('touches' in e && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastPinchDistRef.current > 0) {
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const scale = dist / lastPinchDistRef.current;
        zoomAt(zoom * scale, midX, midY);
      }
      lastPinchDistRef.current = dist;
      return;
    }

    const { clientX, clientY } = getClientPos(e);

    // Handle dragging
    if (draggingIdx !== null && dragTarget) {
      e.preventDefault();
      const imgPt = screenToImage(clientX, clientY);
      if (dragTarget === 'contour') {
        setEditablePoints(prev => {
          const next = [...prev];
          next[draggingIdx] = { x: imgPt.x, y: imgPt.y };
          return next;
        });
      } else {
        setPaperCorners(prev => {
          const next = [...prev];
          next[draggingIdx] = { x: imgPt.x, y: imgPt.y };
          return next;
        });
      }
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(draw);
      return;
    }

    // Handle panning
    if (isPanning) {
      e.preventDefault();
      setPanOffset({
        x: panOffsetStartRef.current.x + (clientX - panStartRef.current.x),
        y: panOffsetStartRef.current.y + (clientY - panStartRef.current.y),
      });
    }
  }, [draggingIdx, dragTarget, isPanning, screenToImage, draw, zoom, zoomAt]);

  const handlePointerUp = useCallback(() => {
    setDraggingIdx(null);
    setDragTarget(null);
    setIsPanning(false);
    lastPinchDistRef.current = 0;
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (mode !== 'edit-contour') return;
    const imgPt = screenToImage(e.clientX, e.clientY);
    const handle = findHandle(imgPt);
    if (handle && handle.target === 'contour' && editablePoints.length > 3) {
      setEditablePoints(prev => prev.filter((_, i) => i !== handle.index));
    }
  }, [mode, screenToImage, findHandle, editablePoints]);

  const handleRedetect = useCallback(async () => {
    if (imageRef.current) {
      setSelectedIndex(-1);
      setEditablePoints([]);
      setMode('select');
      await doDetectContours(imageRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWarp = useCallback(async () => {
    if (!imageRef.current || paperCorners.length !== 4) return;
    setIsProcessing(true);
    try {
      // Calculate output size based on paper dimensions
      const xs = paperCorners.map(p => p.x);
      const ys = paperCorners.map(p => p.y);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);

      // Warp to a reasonable resolution (max 2048 on longest side)
      const maxDim = 2048;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      const destW = Math.round(width * scale);
      const destH = Math.round(height * scale);

      const warpedCanvas = await warpPerspective(imageRef.current, paperCorners, destW, destH);

      // Convert to blob URL
      const blob = await new Promise<Blob | null>((resolve) => warpedCanvas.toBlob(resolve, 'image/jpeg', 0.95));
      if (blob) {
        const url = URL.createObjectURL(blob);
        if (warpedImageUrl) URL.revokeObjectURL(warpedImageUrl);
        setWarpedImageUrl(url);
        setIsWarped(true);

        // Load warped image and detect
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load warped image'));
          img.src = url;
        });
        imageRef.current = img;

        // Reset paper corners to full image
        setPaperCorners([
          { x: 0, y: 0 },
          { x: destW, y: 0 },
          { x: destW, y: destH },
          { x: 0, y: destH },
        ]);

        // Detect on warped image
        setSelectedIndex(-1);
        setEditablePoints([]);
        await doDetectContours(img);
      }
    } catch (err) {
      console.error('Warp failed:', err);
      setError(err instanceof Error ? err.message : 'Warp failed');
    } finally {
      setIsProcessing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperCorners, warpedImageUrl]);

  const objectCount = contours.filter(c => !c.isPaper).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Paper status */}
      {!noPaper && paperCorners.length === 4 ? (
        <div className="flex items-center justify-between p-3 bg-green-900/20 border border-green-800 rounded-lg">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-green-400 text-sm">{isWarped ? 'Paper detected & auto-warped' : 'Paper detected — drag green corners to adjust'}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowPaper(p => !p)} className="text-zinc-400 hover:text-white p-1">
              {showPaper ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button onClick={() => setNoPaper(true)} className="text-xs text-zinc-400 hover:text-amber-400 px-2 py-1 bg-zinc-800 rounded">
              No paper
            </button>
          </div>
        </div>
      ) : noPaper ? (
        <div className="flex items-center justify-between p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
          <span className="text-zinc-400 text-sm">Paper skipped — manual scale entry required</span>
          <button onClick={() => setNoPaper(false)} className="text-xs text-cyan-400 hover:text-cyan-300 px-2 py-1 bg-zinc-800 rounded">
            Show paper
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
          <div className="w-2 h-2 bg-zinc-500 rounded-full" />
          <span className="text-zinc-400 text-sm">No paper detected — drag corners or enter scale manually</span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
              <span className="text-zinc-400 text-sm">Detecting...</span>
            </>
          ) : (
            <span className="text-zinc-300 text-sm">
              Found <strong className="text-white">{objectCount}</strong> object{objectCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 mr-2">
            <button onClick={() => zoomAt(zoom * 1.5)} className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300" title="Zoom in">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => zoomAt(zoom / 1.5)} className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300" title="Zoom out">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button onClick={resetView} className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300" title="Reset view">
              <Maximize className="w-3.5 h-3.5" />
            </button>
            {zoom !== 1 && <span className="text-xs text-zinc-500">{Math.round(zoom * 100)}%</span>}
          </div>
          {!isWarped && paperCorners.length === 4 && (
            <button
              onClick={handleWarp}
              disabled={isProcessing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded-lg transition-colors text-white"
              title="Flatten image using paper corners"
            >
              <Maximize className="w-3.5 h-3.5" />
              Warp
            </button>
          )}
          {isWarped && (
            <span className="text-xs text-amber-400 bg-amber-900/30 px-2 py-1 rounded">Warped</span>
          )}
          <button
            onClick={() => setMode(m => m === 'edit-contour' ? 'select' : 'edit-contour')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors ${
              mode === 'edit-contour' ? 'bg-cyan-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onClick={handleRedetect}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
            Re-detect
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900 touch-none select-none" style={{ height: '500px', minHeight: '400px' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          onTouchCancel={handlePointerUp}
          onDoubleClick={handleDoubleClick}
          className="max-w-full h-auto block cursor-crosshair"
          style={{ maxHeight: '600px' }}
        />
        {(isLoading || isProcessing) && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/70">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
              <span className="text-zinc-400 text-sm">{loadingStep}</span>
            </div>
          </div>
        )}
      </div>

      {/* Edit mode instructions */}
      {mode === 'edit-contour' && (
        <div className="p-3 bg-cyan-900/20 border border-cyan-800 rounded-lg text-sm text-cyan-300 space-y-1">
          <p><strong>Edit Mode:</strong> Drag handles to refine the trace</p>
          <p>• Click on an edge to <strong>add a point</strong> · Double-click a handle to <strong>delete it</strong></p>
          <p>• Scroll wheel or pinch to <strong>zoom</strong> · Drag empty space to <strong>pan</strong></p>
        </div>
      )}

      {/* Simplify & Offset sliders */}
      {selectedIndex !== -1 && editablePoints.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-300">Simplify</span>
              <span className="text-xs text-zinc-500">{editablePoints.length} pts</span>
            </div>
            <input
              type="range" min="0" max="20" value={simplifyLevel}
              onChange={(e) => setSimplifyLevel(parseInt(e.target.value))}
              className="w-full accent-cyan-500"
            />
            <div className="flex justify-between text-xs text-zinc-600 mt-1">
              <span>Detailed</span>
              <span>Simple</span>
            </div>
          </div>
          <div className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-300">Offset</span>
              <span className="text-xs text-zinc-500">{offsetMm > 0 ? '+' : ''}{offsetMm}mm</span>
            </div>
            <input
              type="range" min="-2" max="5" step="0.1" value={offsetMm}
              onChange={(e) => setOffsetMm(parseFloat(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-xs text-zinc-600 mt-1">
              <span>Tighter</span>
              <span>Looser</span>
            </div>
          </div>
        </div>
      )}

      {/* Selected info */}
      {selectedIndex !== -1 && editablePoints.length > 0 && (
        <div className="p-3 bg-zinc-800/50 border border-zinc-700 rounded-lg">
          <div className="flex items-center justify-between text-sm">
            <span className="text-cyan-400 font-medium">Object Selected — {editablePoints.length} points</span>
            {contours[selectedIndex] && (
              <span className="text-zinc-500">{contours[selectedIndex].detectionMethod}</span>
            )}
          </div>
        </div>
      )}

      {/* Contour list */}
      {contours.filter(c => !c.isPaper).length > 1 && (
        <div className="p-3 bg-zinc-800/30 border border-zinc-700 rounded-lg">
          <p className="text-xs text-zinc-500 mb-2">Multiple objects — click to select:</p>
          <div className="flex flex-wrap gap-2">
            {contours.map((c, i) => {
              if (c.isPaper) return null;
              return (
                <button key={i}
                  onClick={() => {
                    setSelectedIndex(i);
                    const simplified = simplifyContour(c.points, simplifyLevel * 1.5);
                    setEditablePoints(simplified.map(p => ({ ...p })));
                    setMode('select');
                  }}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    i === selectedIndex ? 'bg-cyan-600 text-white' : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                  }`}
                >
                  Object {contours.filter((cc, ii) => !cc.isPaper && ii <= i).length} ({c.points.length} pts)
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Detection Parameters */}
      <div className="bg-zinc-800/50 rounded-lg border border-zinc-700 overflow-hidden">
        <button onClick={() => setShowParams(!showParams)}
          className="w-full flex items-center justify-between p-3 hover:bg-zinc-800 transition-colors">
          <h4 className="text-sm font-medium text-zinc-400">Detection Parameters</h4>
          {showParams ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
        </button>
        {showParams && (
          <div className="p-3 pt-0 text-xs text-zinc-500">
            <p>Blur: {params.blurKernel}px | Canny: {params.cannyLow}/{params.cannyHigh} | ε: {params.epsilon}</p>
            <p className="mt-1">Tip: Use Edit Trace + zoom to manually fix the contour.</p>
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
