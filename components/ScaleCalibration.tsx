'use client';

import React, { useState, useEffect } from 'react';
import { Ruler, Check, AlertCircle } from 'lucide-react';
import type { A4Paper, ScaleCalibration, JigConfig } from '@/lib/types';
import { calculatePixelsPerMm } from '@/lib/paper-detect';
import { computeSquareJigSizeMm } from '@/lib/jig-utils';

interface ScaleCalibrationProps {
  a4Paper: A4Paper | null;
  contourBounds: { width: number; height: number } | null;
  onCalibrationChange: (calibration: ScaleCalibration) => void;
  onConfigChange: (config: JigConfig) => void;
}

export default function ScaleCalibration({
  a4Paper,
  contourBounds,
  onCalibrationChange,
  onConfigChange
}: ScaleCalibrationProps) {
  const [useManual, setUseManual] = useState(!a4Paper);
  const [manualPixelsPerMm, setManualPixelsPerMm] = useState(10);
  const [manualReference, setManualReference] = useState({ lengthPx: 100, lengthMm: 10 });
  const [extrudeHeightMm, setExtrudeHeightMm] = useState(6);

  const autoPxPerMm = a4Paper ? calculatePixelsPerMm(a4Paper) : null;
  const activePxPerMm = useManual ? manualPixelsPerMm : (autoPxPerMm ?? manualPixelsPerMm);

  // Calculate auto calibration from A4
  useEffect(() => {
    if (a4Paper && !useManual) {
      const pxPerMm = calculatePixelsPerMm(a4Paper);
      onCalibrationChange({
        pixelsPerMm: pxPerMm,
        method: 'auto'
      });
    }
  }, [a4Paper, useManual, onCalibrationChange]);

  // Calculate manual calibration
  useEffect(() => {
    if (useManual) {
      const pxPerMm = manualReference.lengthPx / manualReference.lengthMm;
      setManualPixelsPerMm(pxPerMm);
      onCalibrationChange({
        pixelsPerMm: pxPerMm,
        method: 'manual',
        referenceLengthMm: manualReference.lengthMm
      });
    }
  }, [useManual, manualReference, onCalibrationChange]);

  // Compute square jig size and notify config changes
  useEffect(() => {
    if (contourBounds && activePxPerMm > 0) {
      const jigSizeMm = computeSquareJigSizeMm(contourBounds, activePxPerMm);
      onConfigChange({ extrudeHeightMm, jigSizeMm });
    }
  }, [contourBounds, activePxPerMm, extrudeHeightMm, onConfigChange]);

  // Calculate object dimensions
  const objectDimensions = contourBounds && activePxPerMm > 0 ? {
    width: (contourBounds.width / activePxPerMm).toFixed(1),
    height: (contourBounds.height / activePxPerMm).toFixed(1)
  } : null;

  const jigSizeMm = contourBounds && activePxPerMm > 0
    ? computeSquareJigSizeMm(contourBounds, activePxPerMm)
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Auto Calibration (Paper) */}
      {a4Paper && (
        <div 
          className={`
            p-4 rounded-lg border cursor-pointer transition-all
            ${!useManual 
              ? 'bg-green-900/20 border-green-700' 
              : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
            }
          `}
          onClick={() => setUseManual(false)}
        >
          <div className="flex items-start gap-3">
            <div className={`
              w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5
              ${!useManual ? 'border-green-500 bg-green-500' : 'border-zinc-500'}
            `}>
              {!useManual && <Check className="w-3 h-3 text-white" />}
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-zinc-200">Auto (Paper)</h4>
              <p className="text-sm text-zinc-400 mt-1">
                Using detected paper for scale calibration
              </p>
              <div className="mt-2 text-sm">
                <span className="text-cyan-400">
                  {(autoPxPerMm! / 10).toFixed(2)} px/mm
                </span>
                <span className="text-zinc-500 ml-2">
                  ({Math.round(a4Paper.width)}×{Math.round(a4Paper.height)} px)
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Calibration */}
      <div 
        className={`
          p-4 rounded-lg border cursor-pointer transition-all
          ${useManual 
            ? 'bg-cyan-900/20 border-cyan-700' 
            : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
          }
        `}
        onClick={() => setUseManual(true)}
      >
        <div className="flex items-start gap-3">
          <div className={`
            w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5
            ${useManual ? 'border-cyan-500 bg-cyan-500' : 'border-zinc-500'}
          `}>
            {useManual && <Check className="w-3 h-3 text-white" />}
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-zinc-200">Manual Calibration</h4>
            <p className="text-sm text-zinc-400 mt-1">
              Enter a known measurement from your image
            </p>
            
            {useManual && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">Length in pixels</label>
                    <input
                      type="number"
                      value={manualReference.lengthPx}
                      onChange={(e) => setManualReference(prev => ({ ...prev, lengthPx: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">Length in mm</label>
                    <input
                      type="number"
                      value={manualReference.lengthMm}
                      onChange={(e) => setManualReference(prev => ({ ...prev, lengthMm: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 text-sm focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
                <div className="text-sm">
                  <span className="text-zinc-500">Scale: </span>
                  <span className="text-cyan-400">{(manualPixelsPerMm / 10).toFixed(2)} px/mm</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Object Dimensions */}
      {objectDimensions && (
        <div className="p-4 bg-zinc-800/30 border border-zinc-700 rounded-lg">
          <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Ruler className="w-4 h-4" />
            Detected Object Dimensions
          </h4>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <div>
              <span className="text-zinc-500 text-xs">Width</span>
              <p className="text-lg text-zinc-200">{objectDimensions.width} mm</p>
            </div>
            <div>
              <span className="text-zinc-500 text-xs">Height</span>
              <p className="text-lg text-zinc-200">{objectDimensions.height} mm</p>
            </div>
          </div>
        </div>
      )}

      {/* Jig Configuration */}
      <div className="space-y-4 p-4 bg-zinc-800/30 border border-zinc-700 rounded-lg">
        <h4 className="text-sm font-medium text-zinc-300">Jig Settings</h4>
        
        {/* Computed square jig size */}
        {jigSizeMm && (
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Square jig size</span>
            <span className="text-cyan-400 font-medium">{jigSizeMm} × {jigSizeMm} mm</span>
          </div>
        )}

        {/* Extrude Height */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-400">Extrude Height</span>
            <span className="text-zinc-500">{extrudeHeightMm} mm</span>
          </div>
          <input
            type="range"
            min="2"
            max="20"
            value={extrudeHeightMm}
            onChange={(e) => setExtrudeHeightMm(parseInt(e.target.value))}
            className="w-full accent-cyan-500"
          />
        </div>

        <p className="text-xs text-zinc-500">
          Cutout goes all the way through (through-cut)
        </p>
      </div>

      {!a4Paper && !useManual && (
        <div className="flex items-center gap-2 p-3 bg-amber-900/20 border border-amber-800 rounded-lg text-amber-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          No paper detected. Please switch to manual calibration.
        </div>
      )}
    </div>
  );
}
