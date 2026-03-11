'use client';

import React from 'react';

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-zinc-800 rounded ${className}`} />
  );
}

export function ImageSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-zinc-800 rounded-lg flex items-center justify-center ${className}`}>
      <div className="w-12 h-12 rounded-full bg-zinc-700" />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-lg space-y-3">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}

export function StepSkeleton() {
  return (
    <div className="text-center space-y-4">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-zinc-800 animate-pulse" />
      <Skeleton className="h-4 w-24 mx-auto" />
      <Skeleton className="h-3 w-48 mx-auto" />
      <Skeleton className="h-3 w-40 mx-auto" />
    </div>
  );
}

export function FeatureSkeleton() {
  return (
    <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function ExportPanelSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2 p-1 bg-zinc-800 rounded-lg">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 flex-1" />
      </div>
      
      <div className="p-4 bg-zinc-800/30 border border-zinc-700 rounded-lg space-y-4">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
        
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2 bg-zinc-900 rounded space-y-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-5 w-3/4" />
          </div>
          <div className="p-2 bg-zinc-900 rounded space-y-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-5 w-3/4" />
          </div>
        </div>
        
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

export function CanvasSkeleton() {
  return (
    <div className="relative rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900" style={{ height: '500px' }}>
      <div className="absolute inset-0 animate-pulse bg-zinc-800" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 mx-auto rounded-full bg-zinc-700 animate-pulse" />
          <div className="h-4 w-32 bg-zinc-700 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function PreviewSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="relative rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900 p-4" style={{ minHeight: '300px' }}>
        <div className="absolute inset-0 animate-pulse bg-zinc-800" />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700 space-y-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-6 w-3/4" />
        </div>
        <div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700 space-y-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-6 w-3/4" />
        </div>
      </div>
    </div>
  );
}
