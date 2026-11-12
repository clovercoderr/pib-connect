import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { RobotModel } from "./RobotModel";
import { CameraController } from "./CameraController";
import { VIEW_PRESETS } from "../../stores/viewStore";

const initialCamera = VIEW_PRESETS.full.camera;

interface SceneProps {
  visible?: boolean;
}

// Backdrop that matches the app shell (#111118) so the canvas, the top bar,
// and the surrounding chrome read as one continuous surface. Just a whisper of
// central lift for depth; the edges land exactly on the shell color so the
// navbar bar blends in instead of capping a brighter panel.
//
// The plane rides with the camera — sitting a fixed distance in front and
// always facing it — so orbiting never swings it edge-on and exposes a black
// gap behind the robot. depthTest/depthWrite are off, so it never occludes.
function GradientBackground() {
  const ref = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const forward = useRef(new THREE.Vector3()).current;

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.quaternion.copy(camera.quaternion);
    forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    mesh.position.copy(camera.position).addScaledVector(forward, 60);
  });

  return (
    <mesh ref={ref} renderOrder={-1} frustumCulled={false}>
      <planeGeometry args={[400, 300]} />
      <shaderMaterial
        depthWrite={false}
        depthTest={false}
        uniforms={{
          uTop: { value: new THREE.Color("#1b1e2a") },
          uBottom: { value: new THREE.Color("#111118") },
        }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform vec3 uTop;
          uniform vec3 uBottom;
          void main() {
            float d = distance(vUv, vec2(0.5, 0.5));
            vec3 col = mix(uTop, uBottom, smoothstep(0.0, 0.62, d));
            gl_FragColor = vec4(col, 1.0);
          }
        `}
      />
    </mesh>
  );
}

export function Scene({ visible = true }: SceneProps) {
  return (
    <Canvas
      camera={{
        position: initialCamera,
        fov: 45,
        near: 0.01,
        far: 100,
      }}
      gl={{
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
        stencil: false,
        depth: true,
      }}
      dpr={[1, 1.5]}
      frameloop={visible ? "always" : "demand"}
      onCreated={({ gl }) => gl.setClearColor("#111118", 1)}
      flat
    >
      <GradientBackground />

      {/* Flat, even lighting — no shadows, no environment maps, no PBR theatrics.
          Just enough light from a few angles to read the form clearly. */}
      <ambientLight intensity={0.85} />
      <directionalLight position={[4, 6, 4]} intensity={0.7} />
      <directionalLight position={[-4, 3, -2]} intensity={0.35} />
      <hemisphereLight args={["#c8d4ff", "#0a0c14", 0.4]} />

      <RobotModel />
      <CameraController />
    </Canvas>
  );
}
