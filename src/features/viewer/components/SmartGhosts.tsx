import { Line, Html } from '@react-three/drei';
import * as THREE from 'three';

interface SmartGhostsProps {
  candidates: Record<string, THREE.Vector3>;
  measurementPoints: THREE.Vector3[];
}

// Direction labels for numpad keys
const DIRECTION_LABELS: Record<string, string> = {
  '1': '↑ Ceiling',
  '2': '↓ Floor',
  '3': '← Left',
  '4': '→ Right',
  '5': '⊕ Forward'
};

export function SmartGhosts({ candidates, measurementPoints }: SmartGhostsProps) {
  return (
    <>
      {Object.entries(candidates).map(([key, pos]) => (
        <group key={key} position={pos}>
          {measurementPoints.length === 1 && (
            <Line
              points={[measurementPoints[0], pos]}
              color={key === '5' ? '#f43f5e' : '#22d3ee'}
              opacity={0.6}
              transparent
              lineWidth={2}
              depthTest={false}
            />
          )}
          <mesh>
            <sphereGeometry args={[0.08, 16, 16]} />
            <meshBasicMaterial color={key === '5' ? '#f43f5e' : '#22d3ee'} depthTest={false} transparent opacity={0.8} />
          </mesh>
          <Html center>
            <div className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono border shadow-lg backdrop-blur-sm ${key === '5'
              ? 'bg-rose-900/80 text-rose-200 border-rose-500/50'
              : 'bg-cyan-900/80 text-cyan-200 border-cyan-500/50'
              }`}>
              {DIRECTION_LABELS[key] || key.toUpperCase()}
            </div>
          </Html>
        </group>
      ))}

      {measurementPoints.map((p, i) => (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshBasicMaterial color="#fbbf24" depthTest={false} />
        </mesh>
      ))}

      {measurementPoints.length === 2 && measurementPoints[0] && measurementPoints[1] && (
        <>
          <Line points={measurementPoints} color="#fbbf24" lineWidth={3} depthTest={false} />
          <Html position={measurementPoints[1]} center>
            <div className="bg-amber-500 text-black font-bold px-3 py-1.5 rounded-lg text-sm shadow-xl whitespace-nowrap -translate-y-8 flex flex-col items-center">
              <span>{measurementPoints[0].distanceTo(measurementPoints[1]).toFixed(3)}m</span>
              <div className="w-2 h-2 bg-amber-500 rotate-45 -mb-1 translate-y-2"></div>
            </div>
          </Html>
        </>
      )}
    </>
  );
}
