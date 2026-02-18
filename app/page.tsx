'use client';

import React, { useState, useCallback } from 'react';
import { Camera, Scan, Settings, Download, Sparkles } from 'lucide-react';
import ImageUpload from '@/components/ImageUpload';
import ContourDetector from '@/components/ContourDetector';
import ScaleCalibration from '@/components/ScaleCalibration';
import JigPreview from '@/components/JigPreview';
import ThreeDPreview from '@/components/ThreeDPreview';
import ExportPanel from '@/components/ExportPanel';
import type { Contour, A4Paper, ScaleCalibration as ScaleCalibrationType, JigConfig } from '@/lib/types';

type Step = 1 | 2 | 3 | 4;

export default function Home() {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [contour, setContour] = useState<Contour | null>(null);
  const [a4Paper, setA4Paper] = useState<A4Paper | null>(null);
  const [scaleCalibration, setScaleCalibration] = useState<ScaleCalibrationType | null>(null);
  const [jigConfig, setJigConfig] = useState<JigConfig | null>(null);
  const [contourBounds, setContourBounds] = useState<{ width: number; height: number } | null>(null);
  const [previewTab, setPreviewTab] = useState<'2d' | '3d'>('2d');

  const handleImageUpload = useCallback((url: string) => {
    setImageUrl(url);
    setCurrentStep(2);
  }, []);

  const handleRetake = useCallback(() => {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
    setImageUrl(null);
    setContour(null);
    setA4Paper(null);
    setCurrentStep(1);
  }, [imageUrl]);

  const handleContourDetected = useCallback((detectedContour: Contour, imgElement: HTMLImageElement) => {
    setContour(detectedContour);
    
    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    detectedContour.points.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
    
    setContourBounds({
      width: maxX - minX,
      height: maxY - minY
    });
  }, []);

  const handleA4Detected = useCallback((paper: A4Paper | null) => {
    setA4Paper(paper);
  }, []);

  const canProceedToStep3 = contour !== null && contourBounds !== null;
  const canProceedToStep4 = scaleCalibration !== null && jigConfig !== null;

  const steps = [
    { num: 1, icon: Camera, label: 'Upload' },
    { num: 2, icon: Scan, label: 'Detect' },
    { num: 3, icon: Settings, label: 'Configure' },
    { num: 4, icon: Download, label: 'Export' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-600 rounded-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">JigSnap</h1>
              <p className="text-xs text-zinc-400">Laser Engraving Jig Generator</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const isActive = currentStep >= step.num;
              const isCurrent = currentStep === step.num;
              
              return (
                <div key={step.num} className="flex items-center flex-1 last:flex-initial">
                  <button
                    onClick={() => {
                      if (step.num === 1) setCurrentStep(1);
                      if (step.num === 2 && imageUrl) setCurrentStep(2);
                      if (step.num === 3 && canProceedToStep3) setCurrentStep(3);
                      if (step.num === 4 && canProceedToStep4) setCurrentStep(4);
                    }}
                    disabled={
                      (step.num === 2 && !imageUrl) ||
                      (step.num === 3 && !canProceedToStep3) ||
                      (step.num === 4 && !canProceedToStep4)
                    }
                    className={`
                      relative flex items-center gap-2 px-3 py-2 rounded-lg transition-all
                      ${isCurrent 
                        ? 'bg-cyan-600 text-white' 
                        : isActive 
                          ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700' 
                          : 'bg-zinc-900 text-zinc-600 cursor-not-allowed'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline text-sm font-medium">{step.label}</span>
                    {index < steps.length - 1 && (
                      <div className={`
                        absolute left-full top-1/2 w-full h-0.5 -translate-y-1/2 ml-2
                        ${currentStep > step.num ? 'bg-cyan-600' : 'bg-zinc-800'}
                      `} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="animate-fade-in">
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-white mb-2">Upload Photo</h2>
                <p className="text-zinc-400">
                  Take a photo of your object on white paper (US Letter or A4) for automatic scale detection
                </p>
              </div>
              <div className="max-w-md mx-auto">
                <ImageUpload 
                  onImageUpload={handleImageUpload}
                  currentImage={imageUrl}
                  onRetake={handleRetake}
                />
              </div>
              <div className="text-center text-sm text-zinc-500">
                <p>Tips for best results:</p>
                <ul className="mt-2 space-y-1">
                  <li>• Use good lighting with minimal shadows</li>
                  <li>• Place object on white paper for scale</li>
                  <li>• Take photo from directly above</li>
                </ul>
              </div>
            </div>
          )}

          {currentStep === 2 && imageUrl && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-white mb-2">Detect Object</h2>
                <p className="text-zinc-400">
                  Adjust the parameters to accurately detect your object&apos;s outline
                </p>
              </div>
              <ContourDetector
                imageUrl={imageUrl}
                onContourDetected={handleContourDetected}
                onA4Detected={handleA4Detected}
              />
              {canProceedToStep3 && (
                <button
                  onClick={() => setCurrentStep(3)}
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg transition-colors"
                >
                  Continue to Configuration →
                </button>
              )}
            </div>
          )}

          {currentStep === 3 && contour && contourBounds && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-white mb-2">Scale & Configure</h2>
                <p className="text-zinc-400">
                  Verify scale and configure your jig settings
                </p>
              </div>
              <ScaleCalibration
                a4Paper={a4Paper}
                contourBounds={contourBounds}
                onCalibrationChange={setScaleCalibration}
                onConfigChange={setJigConfig}
              />
              {canProceedToStep4 && (
                <button
                  onClick={() => setCurrentStep(4)}
                  className="w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg transition-colors"
                >
                  Preview & Export →
                </button>
              )}
            </div>
          )}

          {currentStep === 4 && contour && contourBounds && scaleCalibration && jigConfig && (
            <div className="space-y-6">
              <div className="text-center mb-8">
                <h2 className="text-2xl font-semibold text-white mb-2">Preview & Export</h2>
                <p className="text-zinc-400">
                  Preview your jig and export for laser cutting or 3D printing
                </p>
              </div>

              {/* Preview Tabs */}
              <div className="flex gap-2 p-1 bg-zinc-800 rounded-lg mb-6">
                <button
                  onClick={() => setPreviewTab('2d')}
                  className={`
                    flex-1 py-2 text-sm font-medium rounded-md transition-all
                    ${previewTab === '2d' 
                      ? 'bg-zinc-700 text-white' 
                      : 'text-zinc-400 hover:text-zinc-200'
                    }
                  `}
                >
                  2D Preview (SVG)
                </button>
                <button
                  onClick={() => setPreviewTab('3d')}
                  className={`
                    flex-1 py-2 text-sm font-medium rounded-md transition-all
                    ${previewTab === '3d' 
                      ? 'bg-zinc-700 text-white' 
                      : 'text-zinc-400 hover:text-zinc-200'
                    }
                  `}
                >
                  3D Preview (STL)
                </button>
              </div>

              {/* Preview Content */}
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  {previewTab === '2d' ? (
                    <JigPreview
                      contour={contour}
                      pixelsPerMm={scaleCalibration.pixelsPerMm}
                      config={jigConfig}
                      contourBounds={contourBounds}
                    />
                  ) : (
                    <ThreeDPreview
                      contour={contour}
                      pixelsPerMm={scaleCalibration.pixelsPerMm}
                      config={jigConfig}
                      contourBounds={contourBounds}
                    />
                  )}
                </div>
                <div>
                  <ExportPanel
                    contour={contour}
                    pixelsPerMm={scaleCalibration.pixelsPerMm}
                    config={jigConfig}
                    contourBounds={contourBounds}
                  />
                </div>
              </div>

              {/* Start Over */}
              <button
                onClick={handleRetake}
                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg transition-colors"
              >
                ← Start Over with New Photo
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 mt-16">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-zinc-500">
          JigSnap - Laser engraving jig generator with OpenCV.js and Three.js
        </div>
      </footer>
    </div>
  );
}
