import type { Point, Contour, JigConfig } from './types';

/**
 * Generate DXF file content for laser cutting
 * DXF is an industry standard CAD format supported by most laser cutting software
 */
export function generateDXF(
  contour: Contour,
  contourBounds: { width: number; height: number },
  config: JigConfig,
  pixelsPerMm: number
): string {
  const jigSize = config.jigSizeMm;
  
  // Center the jig
  const jigWidth = jigSize;
  const jigHeight = jigSize;
  const viewBoxX = -jigWidth / 2;
  const viewBoxY = -jigHeight / 2;
  
  // Convert contour points to mm and center
  const centerX = contour.points.reduce((sum, p) => sum + p.x, 0) / contour.points.length;
  const centerY = contour.points.reduce((sum, p) => sum + p.y, 0) / contour.points.length;
  
  // Helper to convert pixels to mm
  const toMm = (p: Point): { x: number; y: number } => ({
    x: (p.x - centerX) / pixelsPerMm,
    y: -(p.y - centerY) / pixelsPerMm // Flip Y for DXF coordinate system
  });
  
  // Convert contour points
  const contourMm = contour.points.map(toMm);
  
  // Convert hole points
  const holesMm = contour.holes?.map(hole => hole.map(toMm)) || [];
  
  // Generate DXF content
  let dxf = generateDXFHeader();
  
  // Start entities section
  dxf += '  0\nSECTION\n  2\nENTITIES\n';
  
  // Draw jig border (square)
  dxf += generatePolyline([
    { x: viewBoxX, y: viewBoxY },
    { x: viewBoxX + jigWidth, y: viewBoxY },
    { x: viewBoxX + jigWidth, y: viewBoxY + jigHeight },
    { x: viewBoxX, y: viewBoxY + jigHeight }
  ], true, 1);
  
  // Draw object cutout
  dxf += generatePolyline(contourMm, true, 2);
  
  // Draw holes
  holesMm.forEach((hole, i) => {
    dxf += generatePolyline(hole, true, 3 + i);
  });
  
  // Draw crosshairs at corners
  const crosshairSize = 5;
  const crosshairOffset = 2;
  
  // Top-left crosshair
  dxf += generateLine(
    { x: viewBoxX + crosshairOffset, y: viewBoxY + crosshairOffset },
    { x: viewBoxX + crosshairOffset, y: viewBoxY + crosshairOffset + crosshairSize },
    100
  );
  dxf += generateLine(
    { x: viewBoxX + crosshairOffset, y: viewBoxY + crosshairOffset },
    { x: viewBoxX + crosshairOffset + crosshairSize, y: viewBoxY + crosshairOffset },
    101
  );
  
  // Top-right crosshair
  dxf += generateLine(
    { x: viewBoxX + jigWidth - crosshairOffset - crosshairSize, y: viewBoxY + crosshairOffset },
    { x: viewBoxX + jigWidth - crosshairOffset, y: viewBoxY + crosshairOffset },
    102
  );
  dxf += generateLine(
    { x: viewBoxX + jigWidth - crosshairOffset, y: viewBoxY + crosshairOffset },
    { x: viewBoxX + jigWidth - crosshairOffset, y: viewBoxY + crosshairOffset + crosshairSize },
    103
  );
  
  // Bottom-right crosshair
  dxf += generateLine(
    { x: viewBoxX + jigWidth - crosshairOffset, y: viewBoxY + jigHeight - crosshairOffset - crosshairSize },
    { x: viewBoxX + jigWidth - crosshairOffset, y: viewBoxY + jigHeight - crosshairOffset },
    104
  );
  dxf += generateLine(
    { x: viewBoxX + jigWidth - crosshairOffset - crosshairSize, y: viewBoxY + jigHeight - crosshairOffset },
    { x: viewBoxX + jigWidth - crosshairOffset, y: viewBoxY + jigHeight - crosshairOffset },
    105
  );
  
  // Bottom-left crosshair
  dxf += generateLine(
    { x: viewBoxX + crosshairOffset, y: viewBoxY + jigHeight - crosshairOffset },
    { x: viewBoxX + crosshairOffset + crosshairSize, y: viewBoxY + jigHeight - crosshairOffset },
    106
  );
  dxf += generateLine(
    { x: viewBoxX + crosshairOffset, y: viewBoxY + jigHeight - crosshairOffset - crosshairSize },
    { x: viewBoxX + crosshairOffset, y: viewBoxY + jigHeight - crosshairOffset },
    107
  );
  
  // Scale bar (10mm)
  const scaleBarY = viewBoxY + jigHeight - 5;
  dxf += generateLine(
    { x: viewBoxX + 5, y: scaleBarY },
    { x: viewBoxX + 15, y: scaleBarY },
    108
  );
  
  // End entities section
  dxf += '  0\nENDSEC\n';
  
  // End of file
  dxf += '  0\nEOF\n';
  
  return dxf;
}

function generateDXFHeader(): string {
  return `  0
SECTION
  2
HEADER
  9
$ACADVER
  1
AC1009
  9
$INSUNITS
  70
4
  0
ENDSEC
  0
SECTION
  2
TABLES
  0
TABLE
  2
LTYPE
  70
1
  0
LTYPE
  2
CONTINUOUS
  70
0
  3
Solid line
  72
65
  73
0
  40
0.0
  0
ENDTAB
  0
TABLE
  2
LAYER
  70
1
  0
LAYER
  2
0
  70
0
  62
7
  6
CONTINUOUS
  0
ENDTAB
  0
ENDSEC
`;
}

function generatePolyline(points: { x: number; y: number }[], closed: boolean, handle: number): string {
  let dxf = `  0
LWPOLYLINE
  5
${handle.toString(16).toUpperCase().padStart(4, '0')}
  8
0
  90
${points.length}
  70
${closed ? 1 : 0}
`;
  
  points.forEach(p => {
    dxf += `  10
${p.x.toFixed(3)}
  20
${p.y.toFixed(3)}
`;
  });
  
  return dxf;
}

function generateLine(start: { x: number; y: number }, end: { x: number; y: number }, handle: number): string {
  return `  0
LINE
  5
${handle.toString(16).toUpperCase().padStart(4, '0')}
  8
0
  10
${start.x.toFixed(3)}
  20
${start.y.toFixed(3)}
  11
${end.x.toFixed(3)}
  21
${end.y.toFixed(3)}
`;
}

export function downloadDXF(dxfContent: string, filename: string): void {
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
