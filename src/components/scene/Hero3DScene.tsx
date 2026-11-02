import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import * as THREE from 'three';

/**
 * Hero 3D scene — a stylised motherboard with a GPU riser.
 *
 * Design notes
 *   · Built from primitives only (no GLTF download), so the hero never blocks on
 *     a network fetch and ships no extra asset weight.
 *   · Lighting is the whole effect: a neon-blue key light, a violet rim light and
 *     a cyan point light inside the "chipset" give the board its glow.
 *   · `OrbitControls` is zoom/pan disabled so the object can be nudged but the
 *     composition can never be broken by the user.
 *   · Everything collapses to a static frame under `prefers-reduced-motion`.
 */

const NEON_BLUE = '#4f6bff';
const NEON_VIOLET = '#8b5cf6';
const NEON_CYAN = '#22d3ee';

/* -------------------------------------------------------------------------- */
/*  Pieces                                                                    */
/* -------------------------------------------------------------------------- */

/** PCB slab: near-black base with an emissive edge, not a lit blue block. */
function Board() {
  return (
    <group>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[4.2, 0.22, 3.4]} />
        {/*
         * Very dark, rough and barely metallic. A metallic surface here mirrors
         * the environment map and flattens the whole board into one blue slab;
         * the glow is meant to come from the emissive edges below.
         */}
        <meshStandardMaterial color="#05070f" roughness={0.88} metalness={0.15} />
      </mesh>

      {/* Emissive rim so the silhouette reads against the background */}
      <mesh position={[0, 0.118, 0]}>
        <boxGeometry args={[4.24, 0.016, 3.44]} />
        <meshBasicMaterial color={NEON_BLUE} transparent opacity={0.3} toneMapped={false} />
      </mesh>

      {/* Traces: thin emissive strips across the board */}
      {[-1.2, -0.6, 0.4, 1.0, 1.55].map((z) => (
        <mesh key={z} position={[0, 0.13, z]}>
          <boxGeometry args={[3.6, 0.006, 0.014]} />
          <meshBasicMaterial color={NEON_BLUE} transparent opacity={0.5} toneMapped={false} />
        </mesh>
      ))}

      {/* Vertical traces: without these the board reads as one flat rectangle */}
      {[-1.7, -1.15, 0.95, 1.6].map((x) => (
        <mesh key={`v${x}`} position={[x, 0.13, 0]}>
          <boxGeometry args={[0.014, 0.006, 3.0]} />
          <meshBasicMaterial color={NEON_VIOLET} transparent opacity={0.35} toneMapped={false} />
        </mesh>
      ))}

      {/* Chipset heatsink — a lower block that gives the surface a second level */}
      {[1.15, -1.2].map((z) => (
        <mesh key={`hs${z}`} position={[0.35, 0.2, z]} castShadow>
          <boxGeometry args={[0.62, 0.1, 0.62]} />
          <meshStandardMaterial color="#161d2e" roughness={0.45} metalness={0.55} />
        </mesh>
      ))}
    </group>
  );
}

/** CPU socket + heatsink block. */
function Cpu() {
  return (
    <group position={[-0.55, 0.26, -0.62]}>
      <mesh castShadow>
        <boxGeometry args={[1.05, 0.16, 1.05]} />
        <meshStandardMaterial color="#1b2338" roughness={0.4} metalness={0.9} />
      </mesh>
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.8, 0.28, 0.8]} />
        <meshStandardMaterial color="#20293f" roughness={0.3} metalness={0.95} />
      </mesh>
      {/* Die glow */}
      <mesh position={[0, 0.37, 0]}>
        <boxGeometry args={[0.5, 0.012, 0.5]} />
        <meshStandardMaterial
          color={NEON_CYAN}
          emissive={NEON_CYAN}
          emissiveIntensity={1.6}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** RAM sticks standing in a row. */
function Ram() {
  return (
    <group position={[1.15, 0.45, -0.42]}>
      {[0, 1, 2, 3].map((i) => (
        <group key={i} position={[0, 0, i * 0.19]}>
          <mesh castShadow>
            <boxGeometry args={[1.35, 0.42, 0.07]} />
            <meshStandardMaterial color="#131a2c" roughness={0.5} metalness={0.8} />
          </mesh>
          <mesh position={[0, 0.225, 0]}>
            <boxGeometry args={[1.35, 0.012, 0.07]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? NEON_VIOLET : NEON_CYAN}
              emissive={i % 2 === 0 ? NEON_VIOLET : NEON_CYAN}
              emissiveIntensity={1.4}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** GPU card raised above the board on a riser. */
function Gpu() {
  return (
    <group position={[0.1, 0.86, 0.95]}>
      <mesh castShadow>
        <boxGeometry args={[2.7, 0.2, 0.95]} />
        <meshStandardMaterial color="#0e1424" roughness={0.35} metalness={0.92} />
      </mesh>
      {/* Fans */}
      {[-0.78, 0, 0.78].map((x) => (
        <group key={x} position={[x, 0.12, 0]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.3, 0.3, 0.03, 32]} />
            <meshStandardMaterial color="#1a2338" roughness={0.4} metalness={0.9} />
          </mesh>
          <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.19, 0.25, 32]} />
            <meshBasicMaterial
              color={NEON_BLUE}
              transparent
              opacity={0.85}
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
      {/* Backplate glow strip */}
      <mesh position={[0, 0.11, -0.42]}>
        <boxGeometry args={[2.4, 0.014, 0.05]} />
        <meshStandardMaterial
          color={NEON_VIOLET}
          emissive={NEON_VIOLET}
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** Drifting dust/star field around the board. */
function Particles({ count = 260 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);

  const { positions, colors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const palette = [new THREE.Color(NEON_BLUE), new THREE.Color(NEON_VIOLET), new THREE.Color(NEON_CYAN)];

    for (let i = 0; i < count; i += 1) {
      // Spherical shell, biased away from the centre so the board stays clean.
      const radius = 5 + Math.random() * 5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = radius * Math.cos(phi) * 0.6;
      pos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

      const c = palette[i % palette.length]!;
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    return { positions: pos, colors: col };
  }, [count]);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.035;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.055}
        vertexColors
        transparent
        opacity={0.85}
        sizeAttenuation
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  );
}

/** Continuous slow rotation + gentle float. */
function Assembled({ animate }: { animate: boolean }) {
  const group = useRef<THREE.Group>(null);

  useFrame((state, delta) => {
    if (!group.current || !animate) return;
    group.current.rotation.y += delta * 0.16;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.12;
    group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.35) * 0.045;
  });

  return (
    <group ref={group} rotation={[0.32, -0.5, 0]}>
      <Board />
      <Cpu />
      <Ram />
      <Gpu />
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Public component                                                          */
/* -------------------------------------------------------------------------- */

export function Hero3DScene({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div className={className} role="img" aria-label="Animated 3D motherboard with a graphics card">
      <Canvas
        /*
         * `demand` renders only when the scene invalidates. The rotation runs in
         * `useFrame`, so frameloop stays `always` there — but reduced motion gets
         * a single static frame, which costs nothing after the first paint.
         */
        frameloop={reduce ? 'demand' : 'always'}
        /* Cap the pixel ratio: a 3× phone would render 9× the fragments for no
           visible gain on a glowing, soft-edged object. */
        dpr={[1, 1.75]}
        camera={{ position: [0, 3.6, 6.4], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <Suspense fallback={null}>
          {/* Key: cool neon blue from above-front */}
          <directionalLight position={[5, 7, 5]} intensity={1.5} color={NEON_BLUE} />
          {/* Rim: violet from behind, this is what separates the board from the bg */}
          <directionalLight position={[-6, 3, -5]} intensity={1.1} color={NEON_VIOLET} />
          {/* Fill: dim neutral so shadows don't crush to black */}
          <ambientLight intensity={0.12} />
          {/* Inner chipset glow */}
          <pointLight position={[0, 1.2, 0]} intensity={5} distance={5} color={NEON_CYAN} />

          <Assembled animate={!reduce} />
          {/*
           * 260 particles on desktop; the scene only reaches small screens via
           * the capability hook, so a single count is enough here. The fallback
           * image handles phones entirely.
           */}
          <Particles count={180} />

          {/*
           * Weak IBL only: the studio presets wash the dark PCB out to near-white,
           * while `night` keeps the metal readable without lifting the blacks.
           */}
          <Environment preset="night" environmentIntensity={0.45} />

          <OrbitControls
            enableZoom={false}
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.45}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 2.1}
            minAzimuthAngle={-Math.PI / 3}
            maxAzimuthAngle={Math.PI / 3}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default Hero3DScene;
