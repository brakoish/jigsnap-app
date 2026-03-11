'use client';

import React, { useState, useCallback } from 'react';
import { Download, FileImage, Box, Loader2, FileText } from 'lucide-react';
import type { Contour, JigConfig } from '@/lib/types';
import { generateSVG, downloadSVG } from '@/lib/svg-export';
import { generateSTL, downloadSTL } from '@/lib/stl-export';
import { generateDXF, downloadDXF } from '@/lib/dxf-export';

interface ExportPanelProps {
  contour: Contour;
  pixelsPerMm: number;
  config: JigConfig;
  contourBounds: { width: number; height: number };
}

export default function ExportPanel({ 
  contour, 
  pixelsPerMm, 
  config,
  contourBounds 
}: ExportPanelProps) {
  const [activeTab, setActiveTab] = useState<'svg' | 'dxf' | 'stl'>('svg');
  const [isExporting, setIsExporting] = useState(false);

  const handleDownloadSVG = useCallback(() => {
    setIsExporting(true);
    const svg = generateSVG(contour, contourBounds, config, pixelsPerMm);
    const date = new Date().toISOString().split('T')[0];
    const size = config.jigSizeMm;
    downloadSVG(svg, `jigsnap-${size}mm-${date}.svg`);
    setIsExporting(false);
  }, [contour, contourBounds, config, pixelsPerMm]);

  const handleDownloadSTL = useCallback(() => {
    setIsExporting(true);
    const stl = generateSTL(contour, contourBounds, config, pixelsPerMm);
    const date = new Date().toISOString().split('T')[0];
    const size = config.jigSizeMm;
    downloadSTL(stl, `jigsnap-${size}mm-${date}.stl`);
    setIsExporting(false);
  }, [contour, contourBounds, config, pixelsPerMm]);

  const handleDownloadDXF = useCallback(() => {
    setIsExporting(true);
    const dxf = generateDXF(contour, contourBounds, config, pixelsPerMm);
    const date = new Date().toISOString().split('T')[0];
    const size = config.jigSizeMm;
    downloadDXF(dxf, `jigsnap-${size}mm-${date}.dxf`);
    setIsExporting(false);
  }, [contour, contourBounds, config, pixelsPerMm]);

  const jigSize = config.jigSizeMm;
  const svgSize = Math.round((contour.points.length * 20 + 1000) / 1024 * 10) / 10;
  const dxfSize = Math.round((contour.points.length * 15 + 500) / 1024 * 10) / 10;
  const stlTriangleCount = Math.round(contour.points.length * 4 + 20);
  const stlSize = Math.round((stlTriangleCount * 50 + 84) / 1024 * 10) / 10;

  return (
    <div className="flex flex-col gap-6">
      {/* Tab Switcher */}
      <div className="flex gap-2 p-1 bg-zinc-800 rounded-lg">
        <button
          onClick={() => setActiveTab('svg')}
          className={`
            flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
            ${activeTab === 'svg'
              ? 'bg-cyan-600 text-white'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
            }
          `}
        >
          <FileImage className="w-4 h-4" />
          SVG
        </button>
        <button
          onClick={() => setActiveTab('dxf')}
          className={`
            flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
            ${activeTab === 'dxf'
              ? 'bg-cyan-600 text-white'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
            }
          `}
        >
          <FileText className="w-4 h-4" />
          DXF
        </button>
        <button
          onClick={() => setActiveTab('stl')}
          className={`
            flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
            ${activeTab === 'stl'
              ? 'bg-cyan-600 text-white'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700'
            }
          `}
        >
          <Box className="w-4 h-4" />
          STL
        </button>
      </div>

      {/* Export Options */}
      <div className="p-4 bg-zinc-800/30 border border-zinc-700 rounded-lg space-y-4">
        {activeTab === 'svg' ? (
          <>
            <div>
              <h4 className="text-sm font-medium text-zinc-300">SVG Export</h4>
              <p className="text-sm text-zinc-500 mt-1">
                For laser cutting in LightBurn or similar software
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 bg-zinc-900 rounded">
                <span className="text-zinc-500">Dimensions</span>
                <p className="text-zinc-300">{jigSize} × {jigSize} mm</p>
              </div>
              <div className="p-2 bg-zinc-900 rounded">
                <span className="text-zinc-500">Est. Size</span>
                <p className="text-zinc-300">~{svgSize} KB</p>
              </div>
            </div>

            <button
              onClick={handleDownloadSVG}
              disabled={isExporting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3
                       bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800
                       text-white font-medium rounded-lg transition-colors"
            >
              {isExporting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
              Download SVG
            </button>

            <ul className="text-xs text-zinc-500 space-y-1">
              <li>• Units in millimeters</li>
              <li>• Includes alignment crosshairs</li>
              <li>• Compatible with LightBurn</li>
            </ul>
          </>
        ) : activeTab === 'dxf' ? (
          <>
            <div>
              <h4 className="text-sm font-medium text-zinc-300">DXF Export</h4>
              <p className="text-sm text-zinc-500 mt-1">
                Industry standard CAD format for laser cutting
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 bg-zinc-900 rounded">
                <span className="text-zinc-500">Dimensions</span>
                <p className="text-zinc-300">{jigSize} × {jigSize} mm</p>
              </div>
              <div className="p-2 bg-zinc-900 rounded">
                <span className="text-zinc-500">Est. Size</span>
                <p className="text-zinc-300">~{dxfSize} KB</p>
              </div>
            </div>

            <button
              onClick={handleDownloadDXF}
              disabled={isExporting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3
                       bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800
                       text-white font-medium rounded-lg transition-colors"
            >
              {isExporting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
              Download DXF
            </button>

            <ul className="text-xs text-zinc-500 space-y-1">
              <li>• Industry standard CAD format</li>
              <li>• Compatible with AutoCAD, Fusion 360</li>
              <li>• Works with most laser cutting software</li>
            </ul>
          </>
        ) : (
          <>
            <div>
              <h4 className="text-sm font-medium text-zinc-300">STL Export</h4>
              <p className="text-sm text-zinc-500 mt-1">
                For 3D printing the alignment jig
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 bg-zinc-900 rounded">
                <span className="text-zinc-500">Extrude Height</span>
                <p className="text-zinc-300">{config.extrudeHeightMm} mm</p>
              </div>
              <div className="p-2 bg-zinc-900 rounded">
                <span className="text-zinc-500">Est. Size</span>
                <p className="text-zinc-300">~{stlSize} KB</p>
              </div>
            </div>

            <div className="text-sm">
              <span className="text-zinc-500">Cutout: </span>
              <span className="text-zinc-300">Through-cut</span>
            </div>

            <button
              onClick={handleDownloadSTL}
              disabled={isExporting}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 
                       bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800
                       text-white font-medium rounded-lg transition-colors"
            >
              {isExporting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
              Download STL
            </button>

            <ul className="text-xs text-zinc-500 space-y-1">
              <li>• Binary STL format</li>
              <li>• {stlTriangleCount.toLocaleString()} triangles</li>
              <li>• Import into Cura, PrusaSlicer, etc.</li>
            </ul>
          </>
        )}
      </div>

      {/* Summary */}
      <div className="p-4 bg-zinc-800/30 border border-zinc-700 rounded-lg">
        <h4 className="text-sm font-medium text-zinc-300 mb-3">Export Summary</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-500">Jig size (square)</span>
            <span className="text-zinc-300">{jigSize} × {jigSize} mm</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Object cutout</span>
            <span className="text-zinc-300">{contour.points.length} points</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Scale</span>
            <span className="text-zinc-300">{pixelsPerMm.toFixed(2)} px/mm</span>
          </div>
        </div>
      </div>
    </div>
  );
}
