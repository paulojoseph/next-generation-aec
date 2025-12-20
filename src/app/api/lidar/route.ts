import { NextResponse } from 'next/server';
import { generateBuildingBuffer } from '@/lib/lidarGenerator';

export async function GET() {
  // 1. Gera os dados no servidor
  const float32Data = generateBuildingBuffer();

  // 2. Transforma em Buffer de bytes brutos para envio
  // Float32Array precisa ser visto como bytes para viajar na rede
  const byteBuffer = Buffer.from(float32Data.buffer);

  // 3. Retorna a resposta binária
  return new NextResponse(byteBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': byteBuffer.length.toString(),
      // Cache control para não re-gerar toda hora (opcional)
      'Cache-Control': 'no-store, max-age=0', 
    },
  });
}