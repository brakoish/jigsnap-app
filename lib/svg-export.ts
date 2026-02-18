import type { Point, Contour, JigConfig } from './types';

export function generateSVG(
  contour: Contour,
  jigSize: { width: number; height: number },
  config: JigConfig,
  pixelsPerMm: number
): string {
  const padding = config.paddingMm;
  
  // Calculate jig dimensions with padding
  const jigWidth = jigSize.width + padding * 2;
  const jigHeight = jigSize.height + padding * 2;
  
  // Center the jig
  const viewBoxX = -jigWidth / 2;
  const viewBoxY = -jigHeight / 2;
  
  // Convert contour points to mm and center
  const centerX = contour.points.reduce((sum, p) => sum + p.x, 0) / contour.points.length;
  const centerY = contour.points.reduce((sum, p) => sum + p.y, 0) / contour.points.length;
  
  const contourPathMm = contour.points
    .map((p, i) => {
      const mmX = (p.x - centerX) / pixelsPerMm;
      const mmY = (p.y - centerY) / pixelsPerMm;
      return `${i === 0 ? 'M' : 'L'} ${mmX.toFixed(3)} ${mmY.toFixed(3)}`;
    })
    .join(' ') + ' Z';
  
  // Crosshair size
  const crosshairSize = 5;
  const crosshairOffset = 2;
  
  // Generate crosshairs for corners
  const crosshairs = [
    // Top-left
    `<line x1="${viewBoxX + crosshairOffset}" y1="${viewBoxY + crosshairOffset + crosshairSize}" x2="${viewBoxX + crosshairOffset}" y2="${viewBoxY + crosshairOffset}" stroke="#666" stroke-width="0.5"/>
     <line x1="${viewBoxX + crosshairOffset}" y1="${viewBoxY + crosshairOffset}" x2="${viewBoxX + crosshairOffset + crosshairSize}" y2="${viewBoxY + crosshairOffset}" stroke="#666" stroke-width="0.5"/>`,
    // Top-right
    `<line x1="${viewBoxX + jigWidth - crosshairOffset - crosshairSize}" y1="${viewBoxY + crosshairOffset}" x2="${viewBoxX + jigWidth - crosshairOffset}" y2="${viewBoxY + crosshairOffset}" stroke="#666" stroke-width="0.5"/>
     <line x1="${viewBoxX + jigWidth - crosshairOffset}" y1="${viewBoxY + crosshairOffset}" x2="${viewBoxX + jigWidth - crosshairOffset}" y2="${viewBoxY + crosshairOffset + crosshairSize}" stroke="#666" stroke-width="0.5"/>`,
    // Bottom-right
    `<line x1="${viewBoxX + jigWidth - crosshairOffset}" y1="${viewBoxY + jigHeight - crosshairOffset - crosshairSize}" x2="${viewBoxX + jigWidth - crosshairOffset}" y2="${viewBoxY + jigHeight - crosshairOffset}" stroke="#666" stroke-width="0.5"/>
     <line x1="${viewBoxX + jigWidth - crosshairOffset - crosshairSize}" y1="${viewBoxY + jigHeight - crosshairOffset}" x2="${viewBoxX + jigWidth - crosshairOffset}" y2="${viewBoxY + jigHeight - crosshairOffset}" stroke="#666" stroke-width="0.5"/>`,
    // Bottom-left
    `<line x1="${viewBoxX + crosshairOffset}" y1="${viewBoxY + jigHeight - crosshairOffset}" x2="${viewBoxX + crosshairOffset + crosshairSize}" y2="${viewBoxY + jigHeight - crosshairOffset}" stroke="#666" stroke-width="0.5"/>
     <line x1="${viewBoxX + crosshairOffset}" y1="${viewBoxY + jigHeight - crosshairOffset - crosshairSize}" x2="${viewBoxX + crosshairOffset}" y2="${viewBoxY + jigHeight - crosshairOffset}" stroke="#666" stroke-width="0.5"/>`
  ].join('\n    ');
  
  // Scale bar (10mm)
  const scaleBarY = viewBoxY + jigHeight - 5;
  const scaleBar = `
    <line x1="${viewBoxX + 5}" y1="${scaleBarY}" x2="${viewBoxX + 15}" y2="${scaleBarY}" stroke="#666" stroke-width="0.5"/>
    <text x="${viewBoxX + 10}" y="${scaleBarY - 1}" font-size="2" text-anchor="middle" fill="#666">10mm</text>
  `;
  
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     width="${jigWidth.toFixed(1)}mm" 
     height="${jigHeight.toFixed(1)}mm" 
     viewBox="${viewBoxX.toFixed(1)} ${viewBoxY.toFixed(1)} ${jigWidth.toFixed(1)} ${jigHeight.toFixed(1)}">
  <defs>
    <style>
      .jig-border { fill: none; stroke: #333; stroke-width: 0.5; }
      .cut-line { fill: none; stroke: #06b6d4; stroke-width: 0.3; }
      .crosshair { stroke: #666; stroke-width: 0.3; }
    </style>
  </defs>
  
  <!-- Jig border -->
  <rect x="${viewBoxX}" y="${viewBoxY}" width="${jigWidth}" height="${jigHeight}" class="jig-border"/>
  
  <!-- Corner crosshairs -->
  ${crosshairs}
  
  <!-- Object cutout -->
  <path d="${contourPathMm}" class="cut-line"/>
  
  <!-- Scale bar -->
  ${scaleBar}
</svg>`;
  
  return svg;
}

export function downloadSVG(svgContent: string, filename: string): void {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
