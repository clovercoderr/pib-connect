import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { useViewStore, VIEW_PRESETS } from "../../stores/viewStore";
import { useTrackingStore } from "../../stores/trackingStore";

const _pointerVec = new THREE.Vector2();

function isRobotHit(object: THREE.Object3D | null): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    // Block camera orbit only when user grabbed an interactive joint handle.
    if (current.userData?.isHandle) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

export function CameraController() {
  const controlsRef = useRef<any>(null);
  const viewMode = useViewStore((s) => s.viewMode);
  const cameraZoomFactor = useViewStore((s) => s.cameraZoomFactor);
  const { camera, raycaster, scene, gl } = useThree();
  const targetPosition = useRef(
    new THREE.Vector3(...VIEW_PRESETS.full.camera),
  );
  const targetLookAt = useRef(new THREE.Vector3(...VIEW_PRESETS.full.target));
  const lastViewMode = useRef(viewMode);
  const transitionSpeed = useRef(0.08);
  const backgroundRotateDragRef = useRef(false);
  const manualOrbitRef = useRef(false);
  const manualCameraOverrideRef = useRef(false);
  
  const headPosition = useTrackingStore((s) => s.headPosition);
  const rightArmPosition = useTrackingStore((s) => s.rightArmPosition);
  const leftArmPosition = useTrackingStore((s) => s.leftArmPosition);
  const rightHandPosition = useTrackingStore((s) => s.rightHandPosition);
  const leftHandPosition = useTrackingStore((s) => s.leftHandPosition);

  const getPresetTarget = () => {
    const preset = VIEW_PRESETS[viewMode];

    let targetPos: [number, number, number];
    let targetAt: [number, number, number];

    if (viewMode === "head") {
      targetPos = preset.camera;
      targetAt = [headPosition.x, headPosition.y, headPosition.z];
    } else if (viewMode === "right_arm") {
      targetPos = preset.camera;
      targetAt = [rightArmPosition.x, rightArmPosition.y, rightArmPosition.z];
    } else if (viewMode === "left_arm") {
      targetPos = preset.camera;
      targetAt = [leftArmPosition.x, leftArmPosition.y, leftArmPosition.z];
    } else if (viewMode === "right_hand") {
      targetPos = preset.camera;
      targetAt = [rightHandPosition.x, rightHandPosition.y, rightHandPosition.z];
    } else if (viewMode === "left_hand") {
      targetPos = preset.camera;
      targetAt = [leftHandPosition.x, leftHandPosition.y, leftHandPosition.z];
    } else {
      targetPos = preset.camera;
      targetAt = preset.target;
    }

    const targetAtVector = new THREE.Vector3(...targetAt);
    const targetPosVector = new THREE.Vector3(...targetPos);
    const zoomedPosition = targetPosVector
      .sub(targetAtVector)
      .multiplyScalar(cameraZoomFactor)
      .add(targetAtVector);

    return {
      targetPos: [zoomedPosition.x, zoomedPosition.y, zoomedPosition.z] as [number, number, number],
      targetAt,
    };
  };

  useEffect(() => {
    if (lastViewMode.current !== viewMode) {
      transitionSpeed.current = 0.15;
      lastViewMode.current = viewMode;
    }
  }, [viewMode]);

  useEffect(() => {
    const { targetPos, targetAt } = getPresetTarget();

    targetPosition.current.set(...targetPos);
    targetLookAt.current.set(...targetAt);
    manualCameraOverrideRef.current = false;
  }, [viewMode, cameraZoomFactor]);

  useEffect(() => {
    if (!controlsRef.current) return;

    const controls = controlsRef.current;
    const canvas = gl.domElement;

    const isPointerOverRobot = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      _pointerVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(_pointerVec, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      return intersects.some((intersect) => isRobotHit(intersect.object));
    };

    const stopBackgroundRotate = () => {
      backgroundRotateDragRef.current = false;
      controls.enableRotate = false;

      if (manualOrbitRef.current) {
        manualOrbitRef.current = false;
        manualCameraOverrideRef.current = true;
        targetPosition.current.copy(camera.position);
        targetLookAt.current.copy(controls.target);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType !== "touch") return;

      const shouldRotate = !isPointerOverRobot(event);
      backgroundRotateDragRef.current = shouldRotate;
      controls.enableRotate = shouldRotate;
    };

    const handleControlsStart = () => {
      if (backgroundRotateDragRef.current) {
        manualOrbitRef.current = true;
        manualCameraOverrideRef.current = true;
      }
    };

    const handleControlsEnd = () => {
      if (!manualOrbitRef.current) {
        controls.enableRotate = false;
        return;
      }

      manualOrbitRef.current = false;
      backgroundRotateDragRef.current = false;
      controls.enableRotate = false;
      manualCameraOverrideRef.current = true;
      targetPosition.current.copy(camera.position);
      targetLookAt.current.copy(controls.target);
    };

    controls.enableRotate = false;
    controls.addEventListener("start", handleControlsStart);
    controls.addEventListener("end", handleControlsEnd);
    canvas.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", stopBackgroundRotate);
    window.addEventListener("pointercancel", stopBackgroundRotate);

    return () => {
      controls.removeEventListener("start", handleControlsStart);
      controls.removeEventListener("end", handleControlsEnd);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", stopBackgroundRotate);
      window.removeEventListener("pointercancel", stopBackgroundRotate);
    };
  }, [camera, gl, raycaster, scene]);

  useFrame(() => {
    if (!controlsRef.current) return;

    const controls = controlsRef.current;

    if (manualOrbitRef.current || manualCameraOverrideRef.current) {
      controls.update();
      return;
    }

    // Ease transition speed toward steady-state so mode switches start fast
    // and settle into smooth tracking without overshoot.
    transitionSpeed.current = THREE.MathUtils.lerp(transitionSpeed.current, 0.04, 0.025);

    if (viewMode === "head") {
      targetLookAt.current.lerp(headPosition, 0.09);
    } else if (viewMode === "right_arm") {
      targetLookAt.current.lerp(rightArmPosition, 0.09);
    } else if (viewMode === "left_arm") {
      targetLookAt.current.lerp(leftArmPosition, 0.09);
    } else if (viewMode === "right_hand") {
      targetLookAt.current.lerp(rightHandPosition, 0.09);
    } else if (viewMode === "left_hand") {
      targetLookAt.current.lerp(leftHandPosition, 0.09);
    }

    camera.position.lerp(targetPosition.current, transitionSpeed.current);
    controls.target.lerp(targetLookAt.current, transitionSpeed.current);
    controls.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.14}
      rotateSpeed={0.55}
      enablePan={false}
      minPolarAngle={Math.PI * 0.12}
      maxPolarAngle={Math.PI * 0.88}
      enableRotate
      enableZoom={false}
    />
  );
}
