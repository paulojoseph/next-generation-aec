import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ViewerStats } from '@/types';

// Interface for robust point cloud bounds
export interface PointCloudBounds {
  floor: number;      // Robust floor Y (1st percentile, after centering = 0)
  ceiling: number;    // Robust ceiling Y (99th percentile)
  centerX: number;    // Original X center
  centerZ: number;    // Original Z center
  rawFloor: number;   // Raw floor before centering
  rawCeiling: number; // Raw ceiling before centering
}

// Função de Parsing desacoplada para poder ser reutilizada
const parsePLYBuffer = (buffer: ArrayBuffer, skipRate: number) => {
  const headerLength = 1000;
  const headerView = new DataView(buffer, 0, Math.min(buffer.byteLength, headerLength));
  let headerText = '';

  for (let i = 0; i < headerView.byteLength; i++) {
    headerText += String.fromCharCode(headerView.getUint8(i));
    if (headerText.endsWith('end_header\n')) break;
  }

  const headerEnd = headerText.indexOf('end_header') + 11;
  const vertexCountMatch = headerText.match(/element vertex (\d+)/);
  const rawVertexCount = vertexCountMatch ? parseInt(vertexCountMatch[1], 10) : 0;

  const stride = 18;
  const body = buffer.slice(headerEnd);

  // Calcula quantos pontos REAIS vamos carregar com o skipRate atual
  const pointsToLoad = Math.floor(Math.floor(body.byteLength / stride) / skipRate);

  return {
    rawVertexCount,
    pointsToLoad,
    headerEnd,
    stride
  };
};

/**
 * Calculate percentile value from sorted array
 */
function percentile(sortedArr: Float32Array, p: number): number {
  if (sortedArr.length === 0) return 0;
  const index = Math.floor(sortedArr.length * p);
  return sortedArr[Math.min(index, sortedArr.length - 1)];
}

export function usePointCloudLoader(
  fileUrl: string,
  skipRate: number, // <--- NOVO: Recebe a qualidade dinâmica
  onStatsUpdate: (stats: ViewerStats) => void,
  onLoadingChange: (loading: boolean) => void
) {
  const [bufferGeometry, setBufferGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [modelMetrics, setModelMetrics] = useState<{ center: THREE.Vector3; height: number } | null>(null);
  const [pointCloudBounds, setPointCloudBounds] = useState<PointCloudBounds | null>(null);

  // CACHE: Guarda o arquivo bruto na RAM para não baixar de novo ao mudar qualidade
  const rawDataRef = useRef<ArrayBuffer | null>(null);

  // 1. EFEITO DE DOWNLOAD (Só roda quando muda a URL/Sala)
  useEffect(() => {
    if (!fileUrl) return;

    // Limpa cache anterior
    rawDataRef.current = null;
    let isMounted = true;
    const abortController = new AbortController();

    async function downloadData() {
      try {
        onLoadingChange(true);
        console.log(`🔌 Streaming Raw PLY from: ${fileUrl}`);

        const response = await fetch(fileUrl, { signal: abortController.signal });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        if (!response.body) throw new Error('ReadableStream not supported');

        const reader = response.body.getReader();
        let receivedLength = 0;
        const chunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          receivedLength += value.length;
        }

        if (!isMounted) return;

        // Reconstrói o arquivo completo na memória
        const combinedBuffer = new Uint8Array(receivedLength);
        let position = 0;
        for (const chunk of chunks) {
          combinedBuffer.set(chunk, position);
          position += chunk.length;
        }

        // SALVA NO CACHE
        rawDataRef.current = combinedBuffer.buffer;

        // Dispara o processamento inicial
        processData(rawDataRef.current, skipRate);

      } catch (err) {
        if (!abortController.signal.aborted) console.error("Download Error:", err);
      } finally {
        // Nota: Não desligamos o loading aqui, pois o processamento ainda vai acontecer
      }
    }

    downloadData();

    return () => {
      isMounted = false;
      abortController.abort();
      setBufferGeometry(prev => { prev?.dispose(); return null; });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]); // Roda apenas na troca de arquivo

  // 2. FUNÇÃO DE PROCESSAMENTO (Roda no Download ou Troca de Qualidade)
  const processData = (buffer: ArrayBuffer, currentSkip: number) => {
    if (!buffer) return;

    try {
      console.log(`⚙️ Processing Geometry (Quality: 1/${currentSkip})...`);

      const { pointsToLoad, headerEnd, stride } = parsePLYBuffer(buffer, currentSkip);

      const positions = new Float32Array(pointsToLoad * 3);
      const colors = new Float32Array(pointsToLoad * 3);
      const objectIds = new Float32Array(pointsToLoad);
      
      // NEW: Collect Y values for percentile calculation
      const yValues = new Float32Array(pointsToLoad);

      const dataView = new DataView(buffer);
      let offset = headerEnd;
      let writeIndex = 0;

      let minX = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxZ = -Infinity;

      const totalBytes = buffer.byteLength;

      // Loop Otimizado com Skip - First pass: collect all coordinates
      while (offset + stride <= totalBytes && writeIndex < pointsToLoad) {
        const x = dataView.getFloat32(offset, true);
        const y = dataView.getFloat32(offset + 4, true);
        const z = dataView.getFloat32(offset + 8, true);

        positions[writeIndex * 3] = x;
        positions[writeIndex * 3 + 1] = y;
        positions[writeIndex * 3 + 2] = z;
        
        // Collect Y for percentile calculation
        yValues[writeIndex] = y;

        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;

        colors[writeIndex * 3] = dataView.getUint8(offset + 12) / 255.0;
        colors[writeIndex * 3 + 1] = dataView.getUint8(offset + 13) / 255.0;
        colors[writeIndex * 3 + 2] = dataView.getUint8(offset + 14) / 255.0;

        objectIds[writeIndex] = dataView.getUint16(offset + 16, true);

        writeIndex++;
        offset += stride * currentSkip; // <--- O PULO DO GATO
      }

      // ========== ROBUST PERCENTILE-BASED FLOOR/CEILING ==========
      // Sort Y values to find percentiles (this eliminates outliers)
      const sortedY = yValues.slice(0, writeIndex).sort((a, b) => a - b);
      
      // Use 1st and 99th percentile for robust floor/ceiling
      const rawFloor = percentile(sortedY, 0.01);    // 1st percentile = robust floor
      const rawCeiling = percentile(sortedY, 0.99);  // 99th percentile = robust ceiling
      
      console.log(`📐 Robust Floor/Ceiling: floor=${rawFloor.toFixed(3)}, ceiling=${rawCeiling.toFixed(3)}`);
      console.log(`📐 Raw min/max Y: min=${sortedY[0].toFixed(3)}, max=${sortedY[sortedY.length-1].toFixed(3)}`);
      console.log(`📐 Outliers filtered: ${((sortedY[0] - rawFloor) * 100).toFixed(1)}cm below, ${((sortedY[sortedY.length-1] - rawCeiling) * 100).toFixed(1)}cm above`);

      // ========== CENTRALIZAÇÃO DO POINT CLOUD ==========
      // Use PERCENTILE floor for centering (not raw minY)
      const centerX = (minX + maxX) / 2;
      const centerZ = (minZ + maxZ) / 2;
      const floorY = rawFloor; // Use robust floor, not absolute minimum

      // Aplica offset a todas as posições
      for (let i = 0; i < writeIndex; i++) {
        positions[i * 3] -= centerX;      // Centraliza X
        positions[i * 3 + 1] -= floorY;   // Move robust floor para Y=0
        positions[i * 3 + 2] -= centerZ;  // Centraliza Z
      }

      // Calculate adjusted bounds after centering
      const adjCeiling = rawCeiling - floorY;
      
      // Save bounds for BIM alignment
      const bounds: PointCloudBounds = {
        floor: 0,           // After centering, floor is at Y=0
        ceiling: adjCeiling, // Ceiling relative to floor
        centerX,
        centerZ,
        rawFloor,
        rawCeiling
      };
      setPointCloudBounds(bounds);
      // =================================================

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute('objectId', new THREE.BufferAttribute(objectIds, 1));

      geometry.computeBoundingSphere();

      // Métricas (usando bounds ajustados)
      const adjMinX = minX - centerX;
      const adjMaxX = maxX - centerX;
      const adjMinZ = minZ - centerZ;
      const adjMaxZ = maxZ - centerZ;
      
      const width = adjMaxX - adjMinX;
      const height = adjCeiling; // Use robust ceiling height
      const depth = adjMaxZ - adjMinZ;

      const center = new THREE.Vector3(
        (adjMinX + adjMaxX) / 2,
        height / 2,
        (adjMinZ + adjMaxZ) / 2
      );

      setBufferGeometry(geometry);
      setModelMetrics({ center, height });

      onStatsUpdate({
        points: pointsToLoad,
        fps: 60,
        drawCalls: 1,
        memory: Math.round(buffer.byteLength / 1024 / 1024), // Total RAM cacheada
        width, height, depth,
        area: width * depth,
        volume: width * height * depth
      });

    } catch (e) {
      console.error("Processing Error", e);
    } finally {
      onLoadingChange(false);
    }
  };

  // 3. EFEITO DE MUDANÇA DE QUALIDADE
  useEffect(() => {
    if (rawDataRef.current) {
      // Se já temos o arquivo, só reprocessamos
      onLoadingChange(true);
      // Pequeno timeout para dar tempo da UI mostrar o loading antes de travar a thread
      setTimeout(() => {
        processData(rawDataRef.current!, skipRate);
      }, 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skipRate]); // Roda quando o usuário muda a qualidade

  return { bufferGeometry, modelMetrics, pointCloudBounds };
}
