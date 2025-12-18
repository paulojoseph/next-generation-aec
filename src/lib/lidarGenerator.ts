export function generateBuildingBuffer() {
  const config = {
    floors: 20,
    width: 15,
    depth: 15,
    density: 3.0,
    floorHeight: 3.5
  };

  const { floors, width, depth, density, floorHeight } = config;
  const totalHeight = floors * floorHeight;
  
  const maxPoints = 1000000; 
  const stride = 4;
  const buffer = new Float32Array(maxPoints * stride);
  
  let cursor = 0;

  const addPoint = (x: number, y: number, z: number, intensity: number) => {
    if (cursor >= buffer.length) return;
    const jitter = 0.04; 
    buffer[cursor] = x + (Math.random() - 0.5) * jitter;
    buffer[cursor + 1] = y + (Math.random() - 0.5) * jitter;
    buffer[cursor + 2] = z + (Math.random() - 0.5) * jitter;
    buffer[cursor + 3] = intensity;
    cursor += stride;
  };

  // 1. ANDARES E TETO
  for (let f = 0; f <= floors; f++) {
    const y = f * floorHeight;
    const isRoof = f === floors;

    for (let x = -width / 2; x <= width / 2; x += 1 / density) {
      for (let z = -depth / 2; z <= depth / 2; z += 1 / density) {
        if (isRoof) {
            // Teto: Intensidade Máxima (Brilhante e Sólido)
            addPoint(x, y, z, 1.0);
        } else {
            // Chão Interno: Intensidade Média
            if (Math.random() > 0.5) addPoint(x, y, z, 0.4);
        }
      }
    }
  }

  // 2. PAREDES EXTERNAS (Ajuste de Transparência)
  // Reduzi a densidade para 1.0 e a intensidade para 0.15
  // Isso cria um efeito de "vidro" ou "rede fina"
  const wallDensity = density * 1.0; 
  
  for (let y = 0; y <= totalHeight; y += 1 / wallDensity) {
    // Paredes Frente/Trás
    for (let x = -width / 2; x <= width / 2; x += 1 / wallDensity) {
        if (Math.random() > 0.3) addPoint(x, y, depth / 2, 0.15);
        if (Math.random() > 0.3) addPoint(x, y, -depth / 2, 0.15);
    }

    // Paredes Esquerda/Direita
    for (let z = -depth / 2; z <= depth / 2; z += 1 / wallDensity) {
        if (Math.random() > 0.3) addPoint(-width / 2, y, z, 0.15);
        if (Math.random() > 0.3) addPoint(width / 2, y, z, 0.15);
    }
  }

  // 3. PILARES ESTRUTURAIS (Para dar contexto visual)
  // Adicionei pilares nos cantos com alta intensidade para emoldurar o prédio
  for (let y = 0; y <= totalHeight; y += 0.2) {
      const corners = [
          [-width/2, -depth/2], [width/2, -depth/2],
          [-width/2, depth/2], [width/2, depth/2]
      ];
      corners.forEach(([cx, cz]) => addPoint(cx, y, cz, 0.8));
  }

  return buffer.slice(0, cursor);
}