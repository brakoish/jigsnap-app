'use client';

import React from 'react';
import type { Contour, JigConfig } from '@/lib/types';
import { generateSVG } from '@/lib/svg-export';

interface JigPreviewProps {
  contour: Contour;
  pixelsPerMm: number;
  config: JigConfig;
  contourBounds: { width: number; height: number };
}

export default function JigPreview({ 
  contour, 
  pixelsPerMm, 
  config,
  contourBounds 
}: JigPreviewProps) {
  // Generate SVG for preview
  const svgContent = generateSVG(contour, contourBounds, config, pixelsPerMm);
  
  // Calculate dimensions
  const jigWidth = contourBounds.width / pixelsPerMm + config.paddingMm * 2;
  const jigHeight = contourBounds.height / pixelsPerMm + config.paddingMm * 2;
  
  return (
    <div className="flex flex-col gap-4">
      {/* SVG Preview */}
      <div className="relative rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900 p-4">
        <div 
          className="w-full flex items-center justify-center"
          style={{ minHeight: '300px' }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>
      
      {/* Dimensions Info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
          <span className="text-xs text-zinc-500">Jig Width</span>
          <p className="text-lg text-zinc-200">{jigWidth.toFixed(1)} mm</p>
        </div>
        <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
          <span className="text-xs text-zinc-500">Jig Height</span>
          <p className="text-lg text-zinc-200">{jigHeight.toFixed(1)} mm</p>
        </div>
      </div>
      
      {/* Features List */}
      <div className="p-4 bg-zinc-800/30 rounded-lg border border-zinc-700">
        <h4 className="text-sm font-medium text-zinc-300 mb-3">SVG Features</h4>
        <ul className="space-y-2 text-sm text-zinc-400">
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
            Object cutout path (cyan line)
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
            Corner crosshairs for alignment
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
            Scale bar reference (10mm)
          </li>
          <li className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-zinc-500 rounded-full" />
            Proper mm units for LightBurn
          </li>
        </ul>
      </div>
    </div>
  );
}
