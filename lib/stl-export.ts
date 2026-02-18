import type { Point, Contour, JigConfig } from './types';
import earcut from 'earcut';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Triangle {
  v1: Vec3;
  v2: Vec3;
  v3: Vec3;
  normal: Vec3;
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (len === 0) return { x: 0, y: 0, z: 1 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function generateSTL(
  contour: Contour,
  jigSize: { width: number; height: number },
  config: JigConfig,
  pixelsPerMm: number
): ArrayBuffer {
  const padding = config.paddingMm;
  const thickness = config.thicknessMm;
  const pocketDepth = config.pocketDepthMm ?? thickness; // Through-cut if null
  
  // Calculate jig dimensions
  const jigWidth = jigSize.width + padding * 2;
  const jigHeight = jigSize.height + padding * 2;
  
  // Center offset
  const centerX = contour.points.reduce((sum, p) => sum + p.x, 0) / contour.points.length;
  const centerY = contour.points.reduce((sum, p) => sum + p.y, 0) / contour.points.length;
  
  // Convert contour to mm coordinates centered
  const contourMm: Point[] = contour.points.map(p => ({
    x: (p.x - centerX) / pixelsPerMm,
    y: (p.y - centerY) / pixelsPerMm
  }));
  
  // Define the outer rectangle (jig boundary)
  const outerRect: Point[] = [
    { x: -jigWidth / 2, y: -jigHeight / 2 },
    { x: jigWidth / 2, y: -jigHeight / 2 },
    { x: jigWidth / 2, y: jigHeight / 2 },
    { x: -jigWidth / 2, y: jigHeight / 2 }
  ];
  
  const triangles: Triangle[] = [];
  
  // Helper to add quad as two triangles
  function addQuad(v1: Vec3, v2: Vec3, v3: Vec3, v4: Vec3, normal: Vec3): void {
    triangles.push({ v1, v2, v3, normal });
    triangles.push({ v1: v1, v2: v3, v3: v4, normal });
  }
  
  // 1. Bottom face (full rectangle)
  const bottomIndices = earcut(
    outerRect.flatMap(p => [p.x, p.y]),
    [],
    2
  );
  for (let i = 0; i < bottomIndices.length; i += 3) {
    const i0 = bottomIndices[i];
    const i1 = bottomIndices[i + 1];
    const i2 = bottomIndices[i + 2];
    triangles.push({
      v1: { x: outerRect[i0].x, y: outerRect[i0].y, z: 0 },
      v2: { x: outerRect[i1].x, y: outerRect[i1].y, z: 0 },
      v3: { x: outerRect[i2].x, y: outerRect[i2].y, z: 0 },
      normal: { x: 0, y: 0, z: -1 }
    });
  }
  
  // 2. Top face (rectangle with hole)
  // Create polygon with hole for earcut
  const outerFlat = outerRect.flatMap(p => [p.x, p.y]);
  const contourFlat = contourMm.flatMap(p => [p.x, p.y]);
  const holeIndices = [contourFlat.length / 2];
  const combined = [...outerFlat, ...contourFlat];
  
  const topIndices = earcut(combined, holeIndices, 2);
  const topZ = thickness;
  for (let i = 0; i < topIndices.length; i += 3) {
    const i0 = topIndices[i];
    const i1 = topIndices[i + 1];
    const i2 = topIndices[i + 2];
    
    let p0: Point, p1: Point, p2: Point;
    if (i0 < outerRect.length) {
      p0 = outerRect[i0];
    } else {
      p0 = contourMm[i0 - outerRect.length];
    }
    if (i1 < outerRect.length) {
      p1 = outerRect[i1];
    } else {
      p1 = contourMm[i1 - outerRect.length];
    }
    if (i2 < outerRect.length) {
      p2 = outerRect[i2];
    } else {
      p2 = contourMm[i2 - outerRect.length];
    }
    
    triangles.push({
      v1: { x: p0.x, y: p0.y, z: topZ },
      v2: { x: p2.x, y: p2.y, z: topZ },
      v3: { x: p1.x, y: p1.y, z: topZ },
      normal: { x: 0, y: 0, z: 1 }
    });
  }
  
  // 3. Side walls of outer rectangle
  for (let i = 0; i < outerRect.length; i++) {
    const j = (i + 1) % outerRect.length;
    const p1 = outerRect[i];
    const p2 = outerRect[j];
    
    // Calculate normal for this edge
    const edge = { x: p2.x - p1.x, y: p2.y - p1.y, z: 0 };
    const n = normalize({ x: edge.y, y: -edge.x, z: 0 });
    
    addQuad(
      { x: p1.x, y: p1.y, z: 0 },
      { x: p2.x, y: p2.y, z: 0 },
      { x: p2.x, y: p2.y, z: topZ },
      { x: p1.x, y: p1.y, z: topZ },
      n
    );
  }
  
  // 4. Side walls of contour (pocket/cutout)
  const pocketZ = thickness - pocketDepth;
  for (let i = 0; i < contourMm.length; i++) {
    const j = (i + 1) % contourMm.length;
    const p1 = contourMm[i];
    const p2 = contourMm[j];
    
    // Calculate normal (pointing inward for cutout)
    const edge = { x: p2.x - p1.x, y: p2.y - p1.y, z: 0 };
    const n = normalize({ x: -edge.y, y: edge.x, z: 0 });
    
    addQuad(
      { x: p1.x, y: p1.y, z: pocketZ },
      { x: p1.x, y: p1.y, z: topZ },
      { x: p2.x, y: p2.y, z: topZ },
      { x: p2.x, y: p2.y, z: pocketZ },
      n
    );
  }
  
  // Write binary STL
  const headerSize = 80;
  const triangleSize = 50; // 12 bytes per float * 4 floats (normal + 3 verts) + 2 bytes attribute
  const bufferSize = headerSize + 4 + triangles.length * triangleSize;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);
  const writer = new Uint8Array(buffer);
  
  // Header (80 bytes)
  const header = 'JigSnap Generated STL';
  for (let i = 0; i < 80; i++) {
    writer[i] = i < header.length ? header.charCodeAt(i) : 0;
  }
  
  // Number of triangles
  view.setUint32(80, triangles.length, true);
  
  // Write triangles
  let offset = 84;
  for (const tri of triangles) {
    // Normal
    view.setFloat32(offset, tri.normal.x, true);
    view.setFloat32(offset + 4, tri.normal.y, true);
    view.setFloat32(offset + 8, tri.normal.z, true);
    
    // Vertex 1
    view.setFloat32(offset + 12, tri.v1.x, true);
    view.setFloat32(offset + 16, tri.v1.y, true);
    view.setFloat32(offset + 20, tri.v1.z, true);
    
    // Vertex 2
    view.setFloat32(offset + 24, tri.v2.x, true);
    view.setFloat32(offset + 28, tri.v2.y, true);
    view.setFloat32(offset + 32, tri.v2.z, true);
    
    // Vertex 3
    view.setFloat32(offset + 36, tri.v3.x, true);
    view.setFloat32(offset + 40, tri.v3.y, true);
    view.setFloat32(offset + 44, tri.v3.z, true);
    
    // Attribute byte count (0)
    view.setUint16(offset + 48, 0, true);
    
    offset += 50;
  }
  
  return buffer;
}

export function downloadSTL(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
