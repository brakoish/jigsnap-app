'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export default function LoadingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-cyan-500" />
        <p className="text-zinc-400 text-sm">Loading JigSnap...</p>
      </div>
    </div>
  );
}
