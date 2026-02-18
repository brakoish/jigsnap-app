'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Upload, Camera, X, ImageIcon } from 'lucide-react';

interface ImageUploadProps {
  onImageUpload: (imageUrl: string, file: File) => void;
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
      {/* Drag & Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-12 cursor-pointer
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
            Drop an image here, or click to browse
          </p>
          <p className="text-zinc-500 text-sm mt-1">
            Supports JPG, PNG
          </p>
        </div>
        
        {/* Animated border effect when dragging */}
        {isDragging && (
          <div className="absolute inset-0 rounded-xl border-2 border-cyan-400 animate-pulse" />
        )}
      </div>

      {/* Camera Button (Mobile) */}
      <button
        onClick={() => cameraInputRef.current?.click()}
        className="flex items-center justify-center gap-2 px-6 py-3 
                   bg-zinc-800 hover:bg-zinc-700 text-zinc-200 
                   rounded-lg transition-colors border border-zinc-700"
      >
        <Camera className="w-5 h-5" />
        <span>Take Photo</span>
        <span className="text-xs text-zinc-500 ml-1">(Mobile)</span>
      </button>

      {/* Hidden Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/jpg"
        onChange={handleFileInput}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileInput}
        className="hidden"
      />
    </div>
  );
}
