'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Contour, JigConfig } from '@/lib/types';

interface ThreeDPreviewProps {
  contour: Contour;
  pixelsPerMm: number;
  config: JigConfig;
  contourBounds: { width: number; height: number };
}

export default function ThreeDPreview({ 
  contour, 
  pixelsPerMm, 
  config,
  contourBounds 
}: ThreeDPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    mesh: THREE.Mesh | null;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x18181b);

    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 100);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const backLight = new THREE.DirectionalLight(0x06b6d4, 0.3);
    backLight.position.set(-10, 5, -10);
    scene.add(backLight);

    sceneRef.current = { scene, camera, renderer, controls, mesh: null };

    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !sceneRef.current) return;
      const { camera, renderer } = sceneRef.current;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  // Update geometry when props change
  useEffect(() => {
    if (!sceneRef.current) return;
    const { scene, mesh: oldMesh } = sceneRef.current;

    if (oldMesh) {
      scene.remove(oldMesh);
      oldMesh.geometry.dispose();
      (oldMesh.material as THREE.Material).dispose();
    }

    const jigSize = config.jigSizeMm;
    const centerX = contour.points.reduce((sum, p) => sum + p.x, 0) / contour.points.length;
    const centerY = contour.points.reduce((sum, p) => sum + p.y, 0) / contour.points.length;

    // Create outer shape (square)
    const outerShape = new THREE.Shape();
    const half = jigSize / 2;
    outerShape.moveTo(-half, -half);
    outerShape.lineTo(half, -half);
    outerShape.lineTo(half, half);
    outerShape.lineTo(-half, half);
    outerShape.closePath();

    // Create contour hole (through-cut)
    const holePath = new THREE.Path();
    contour.points.forEach((p, i) => {
      const mmX = (p.x - centerX) / pixelsPerMm;
      const mmY = -(p.y - centerY) / pixelsPerMm;
      if (i === 0) {
        holePath.moveTo(mmX, mmY);
      } else {
        holePath.lineTo(mmX, mmY);
      }
    });
    holePath.closePath();
    outerShape.holes.push(holePath);

    const geometry = new THREE.ExtrudeGeometry(outerShape, {
      depth: config.extrudeHeightMm,
      bevelEnabled: false,
      curveSegments: 32
    });

    geometry.translate(0, 0, -config.extrudeHeightMm / 2);

    const material = new THREE.MeshStandardMaterial({
      color: 0x3f3f46,
      roughness: 0.4,
      metalness: 0.3
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    const wireframeGeometry = new THREE.WireframeGeometry(geometry);
    const wireframeMaterial = new THREE.LineBasicMaterial({ 
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.3
    });
    const wireframe = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
    mesh.add(wireframe);

    scene.add(mesh);
    sceneRef.current.mesh = mesh;

    const maxDim = Math.max(jigSize, config.extrudeHeightMm);
    sceneRef.current.camera.position.z = maxDim * 2;
    sceneRef.current.controls.update();

  }, [contour, pixelsPerMm, config, contourBounds]);

  return (
    <div className="flex flex-col gap-4">
      <div 
        ref={containerRef}
        className="w-full h-[400px] rounded-lg overflow-hidden border border-zinc-700"
      />
      
      <div className="text-sm text-zinc-500 text-center">
        Click and drag to rotate • Scroll to zoom
      </div>
    </div>
  );
}
