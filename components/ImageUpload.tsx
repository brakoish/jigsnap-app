'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Upload, Camera, X } from 'lucide-react';

interface ImageUploadProps {
  onImageUpload: (imageUrl: string, file?: File) => void;
  currentImage?: string | null;
  onRetake?: () => void;
}

export default function ImageUpload({ onImageUpload, currentImage, onRetake }: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      onImageUpload(url, file);
    }
  }, [onImageUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset the input so the same file can be re-selected
    e.target.value = '';
  }, [handleFile]);

  if (currentImage) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="relative rounded-lg overflow-hidden border border-zinc-700 max-w-full">
          <img 
            src={currentImage} 
            alt="Uploaded" 
            className="max-w-full max-h-[400px] object-contain"
          />
          <button
            onClick={onRetake}
            className="absolute top-2 right-2 p-2 bg-zinc-900/80 hover:bg-zinc-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-zinc-300" />
          </button>
        </div>
        <button
          onClick={onRetake}
          className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Camera className="w-4 h-4" />
          Retake / Upload New
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Upload from library */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-xl p-12
          transition-all duration-200 ease-in-out
          flex flex-col items-center justify-center gap-4
          min-h-[240px]
          ${isDragging 
            ? 'border-cyan-500 bg-cyan-500/10' 
            : 'border-zinc-600 hover:border-zinc-500 hover:bg-zinc-800/50'
          }
        `}
      >
        <div className={`
          p-4 rounded-full transition-colors
          ${isDragging ? 'bg-cyan-500/20' : 'bg-zinc-800'}
        `}>
          <Upload className={`w-8 h-8 ${isDragging ? 'text-cyan-400' : 'text-zinc-400'}`} />
        </div>
        
        <div className="text-center">
          <p className="text-zinc-300 font-medium">
            Upload a photo
          </p>
          <p className="text-zinc-500 text-sm mt-1">
            JPG, PNG — or drag &amp; drop on desktop
          </p>
        </div>

        <label className="mt-2 px-6 py-3 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors cursor-pointer font-medium text-sm">
          Choose File
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInput}
            className="hidden"
          />
        </label>

        {isDragging && (
          <div className="absolute inset-0 rounded-xl border-2 border-cyan-400 animate-pulse pointer-events-none" />
        )}
      </div>

      {/* Take Photo button */}
      <label className="flex items-center justify-center gap-2 px-6 py-3 
                   bg-cyan-700 hover:bg-cyan-600 text-white 
                   rounded-lg transition-colors border border-cyan-600 cursor-pointer">
        <Camera className="w-5 h-5" />
        <span>Take Photo</span>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileInput}
          className="hidden"
        />
      </label>
    </div>
  );
}
