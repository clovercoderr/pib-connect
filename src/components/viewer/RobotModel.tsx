import { useRef, useEffect, Suspense, useState } from "react";
import { Html } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  JOINT_CONFIGS,
  centidegreesToJointRadians,
  jointConfigById,
  getJointInvert,
} from "../../lib/jointConfig";
import { useRobotStore } from "../../stores/robotStore";
import { useTrackingStore } from "../../stores/trackingStore";
import { useViewStore, VIEW_PRESETS } from "../../stores/viewStore";

// Reusable Vector3 to avoid per-frame allocations
const _tempVec = new THREE.Vector3();
const _pointerVec = new THREE.Vector2();
const _dragArcScale = new THREE.Vector3();
// Scratch vectors for plane-projection rotation math (hit point and offset
// from the joint pivot). Reused every pointer-move event so we don't
// allocate new Vector3s on every frame of a drag.
const _planeHit = new THREE.Vector3();
const _planeOffset = new THREE.Vector3();
// Scratch storage for the arc-visibility loop in useFrame: the view direction,
// each arc's world-space axis, and the arc's world quaternion.
const _arcViewDir = new THREE.Vector3();
const _arcAxisTmp = new THREE.Vector3();
const _arcQuat = new THREE.Quaternion();

function LoadingSpinner() {
  return (
    <Html center>
      <div className="flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium">Loading PIB Model...</p>
      </div>
    </Html>
  );
}

function ErrorDisplay({ message }: { message: string }) {
  return (
    <Html center>
      <div className="flex flex-col items-center justify-center text-red-400 max-w-md p-4 bg-red-900/20 rounded-lg">
        <p className="text-lg font-bold mb-2">Error Loading Model</p>
        <p className="text-sm text-center">{message}</p>
      </div>
    </Html>
  );
}

const URDF_JOINT_MAP: Record<string, string> = Object.fromEntries(
  JOINT_CONFIGS.map((config) => [config.urdfJointName, config.id]),
);

// Combined joints - one handle controls multiple joints
const COMBINED_JOINTS: Record<string, string[]> = {
  // Neck - one handle for both directions
  neck: ["neck_pan", "neck_tilt"],
  // Shoulders - one handle for both directions
  left_shoulder: ["left_shoulder_inner", "left_shoulder_outer"],
  right_shoulder: ["right_shoulder_inner", "right_shoulder_outer"],
  // Hands - one point controls all finger joints per hand.
  left_hand_grip: [
    "left_thumb_proximal",
    "left_thumb_distal",
    "left_index_proximal",
    "left_index_distal",
    "left_middle_proximal",
    "left_middle_distal",
    "left_ring_proximal",
    "left_ring_distal",
    "left_pinky_proximal",
    "left_pinky_distal",
  ],
  right_hand_grip: [
    "right_thumb_proximal",
    "right_thumb_distal",
    "right_index_proximal",
    "right_index_distal",
    "right_middle_proximal",
    "right_middle_distal",
    "right_ring_proximal",
    "right_ring_distal",
    "right_pinky_proximal",
    "right_pinky_distal",
  ],
};

// Hand grip handles should be centered near the palm joints.
const HANDLE_ANCHOR_JOINTS: Record<string, string> = {
  left_hand_grip: "left_index_proximal",
  right_hand_grip: "right_index_proximal",
};

// Single neutral palette so handles read as one consistent control surface.
// Much softer than the previous near-white so they don't fight the model.
const HANDLE_COLOR_REST = 0xff4fa3;   // bright pink — handles pop at rest
const HANDLE_COLOR_HOVER = 0xffa6d2;  // lighter pink accent on hover
const HANDLE_COLOR_ACTIVE = 0x7fbfff; // solid light blue when pressed/grabbed
const HANDLE_COLOR_SELECTED = 0xffe7a3; // warm gold when this body part is selected

// Axis gizmo palette: distinct, friendly hues so a kid can map "the orange
// ring" to "this is the rotation I'm grabbing". Per-axis color stays
// consistent across joints, so once the user learns "blue ring = sideways",
// the same color means the same thing on the elbow, wrist, etc.
const AXIS_COLORS: Record<"x" | "y" | "z", number> = {
  x: 0x6db4ff, // light blue — pan / nod axis
  y: 0x7fbfff, // light blue — tilt / lift axis (matches the pressed handle)
  z: 0x9ccbff, // light blue — twist / roll axis
};
const AXIS_COLOR_HOVER: Record<"x" | "y" | "z", number> = {
  x: 0xa9d4ff,
  y: 0xb8ddff,
  z: 0xc9e4ff,
};

// Handle sizes - smaller to avoid overlap
const HANDLE_SIZES: Record<string, number> = {
  // Neck
  neck: 0.04,
  // Arms - smaller and different sizes
  left_shoulder: 0.038,
  left_upper_arm_rotation: 0.032,
  left_elbow: 0.030,
  left_wrist: 0.026,
  left_wrist_bend: 0.022,
  right_shoulder: 0.038,
  right_upper_arm_rotation: 0.032,
  right_elbow: 0.030,
  right_wrist: 0.026,
  right_wrist_bend: 0.022,
  // One-point hand grips.
  left_hand_grip: 0.022,
  right_hand_grip: 0.022,
};

// Which joints to show handles for
const INTERACTIVE_JOINTS = Object.keys(HANDLE_SIZES);

// Which body group each handle belongs to — drives the focus-area filter so
// only the handles for the currently selected area are shown (the rest of the
// time, all those rings at once just read as clutter).
const HANDLE_GROUP: Record<string, string> = {};
for (const handleId of INTERACTIVE_JOINTS) {
  const representativeJoint = COMBINED_JOINTS[handleId]?.[0] ?? handleId;
  const group = jointConfigById.get(representativeJoint)?.group;
  if (group) HANDLE_GROUP[handleId] = group;
}

const TWO_AXIS_HANDLES = new Set(["neck", "left_shoulder", "right_shoulder"]);
type AxisLock = "x" | "y";

function getTwoAxisJointMapping(handleId: string, combinedJoints: string[]): { xJointId: string; yJointId: string } {
  const [firstJointId, secondJointId] = combinedJoints;

  // Shoulder request: Y should lift the arm, X should rotate.
  if (handleId === "left_shoulder" || handleId === "right_shoulder") {
    return {
      xJointId: secondJointId,
      yJointId: firstJointId,
    };
  }

  // Neck: X = pan, Y = tilt
  return {
    xJointId: firstJointId,
    yJointId: secondJointId,
  };
}

// Two-axis drag now uses per-axis screen tangents (computeScreenTangent for
// each underlying joint), so no more hard-coded direction multipliers.

// Hand-grip handles aren't a visible rotation arc — they're a "drag to curl
// the fingers" gesture, so they keep one fixed gesture direction. Every other
// handle takes its direction purely from the arc geometry (the screen-space
// tangent of its real URDF axis), which is what keeps the rotation from ever
// feeling inverted.
const HAND_GRIP_HANDLES = new Set(["left_hand_grip", "right_hand_grip"]);

// Per-joint drag-direction sign. The screen tangent can't be derived reliably
// for handles that sit exactly on the joint pivot — computeScreenTangent then
// falls back to a synthesized perpendicular, so a few joints end up dragging
// the wrong way. These flips are tuned from real testing; set a joint to -1
// to invert its drag direction.
const JOINT_DRAG_FLIP: Record<string, number> = {
  neck_tilt: -1, // head up / down
  right_shoulder_inner: -1, // right shoulder up / down (the lift axis)
  left_upper_arm_rotation: -1,
};

// Load URDF using dynamic import with STL support
async function loadURDFModel(): Promise<any> {
  const [{ default: URDFLoader }, STLLoaderModule] = await Promise.all([
    import("urdf-loader"),
    import("three/examples/jsm/loaders/STLLoader.js"),
  ]);
  const STLLoader = (STLLoaderModule as any).STLLoader;
  
  return new Promise((resolve, reject) => {
    const manager = new THREE.LoadingManager();
    const loader = new (URDFLoader as any)(manager);
    loader.packages = { pibsim_webots: "/pib_V3_urdf (1)" };
    loader.loadMeshCb = (path: string, manager: any, onComplete: any) => {
      const stlLoader = new STLLoader(manager);
      stlLoader.load(path, (geometry: any) => {
        geometry.computeVertexNormals();
        // Plain matte material — no shadows, no clearcoat. Reads cleanly
        // under the simple lighting setup without GPU overhead.
        const material = new THREE.MeshLambertMaterial({
          color: 0xe4e6ec,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        onComplete(mesh);
      }, undefined, (err: any) => onComplete(null, err));
    };
    
    loader.load("/pib_V3_urdf (1)/robot.urdf", (robot: any) => resolve(robot), undefined, (err: any) => reject(err));
  });
}

function URDFRobotModel() {
  const robotRef = useRef<any>(null);
  const jointRefs = useRef<Map<string, any>>(new Map());
  const linkRefs = useRef<Map<string, any>>(new Map());
  const { invalidate, raycaster, camera, gl } = useThree();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hoveredJointRef = useRef<string | null>(null);

  const setHeadPosition = useTrackingStore((s) => s.setHeadPosition);
  const setRightArmPosition = useTrackingStore((s) => s.setRightArmPosition);
  const setLeftArmPosition = useTrackingStore((s) => s.setLeftArmPosition);
  const setRightHandPosition = useTrackingStore((s) => s.setRightHandPosition);
  const setLeftHandPosition = useTrackingStore((s) => s.setLeftHandPosition);

  // Subscribe to selection so we can rebuild the rotation arcs when the user
  // picks a different body part (or clears selection by clicking empty space).
  const selectedHandleId = useRobotStore((s) => s.selectedHandleId);
  // Subscribe to the focus area so we can show only the relevant handles —
  // "R. Arm" shows just the right-arm rings, "Full" shows everything, etc.
  const viewMode = useViewStore((s) => s.viewMode);

  type Tangent = { unitX: number; unitY: number; pixelsPerRadian: number };
  // Plane-projection rotation state. This is the geometry-correct way to drive
  // a single-axis rotation gizmo: cast the pointer ray onto the joint's
  // rotation plane, then measure the change in angle around the joint pivot.
  // The user can grab the arc anywhere and "circle" the pivot — the joint
  // tracks the angular sweep 1:1, exactly like Maya/Blender rotation handles.
  type PlaneRotation = {
    jointWorldPos: THREE.Vector3;
    /** Joint rotation axis in world space, normalized. */
    axisWorld: THREE.Vector3;
    /** Orthonormal in-plane basis vector aligned with screen-right. */
    uBasis: THREE.Vector3;
    /** Orthonormal in-plane basis vector (axisWorld × uBasis). */
    vBasis: THREE.Vector3;
    /** Last raw atan2 angle, for wrap-around handling. */
    prevAngle: number;
    /** Accumulated angular change since drag start (radians). */
    totalDelta: number;
  };
  const draggingState = useRef<{
    jointId: string;
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    dragMode: "single-axis" | "two-axis";
    axisLock: AxisLock | null;
    startPositions: Record<string, number>;
    currentPositions: Record<string, number>;
    /** Plane-projection rotation (preferred for single-axis drags). */
    planeRotation: PlaneRotation | null;
    /** Screen-space tangent of the handle's arc + pixels/radian factor. */
    screenTangent: Tangent | null;
    /** Per-axis tangents for two-axis drags. */
    twoAxisTangents: { xJoint: string; yJoint: string; xTangent: Tangent | null; yTangent: Tangent | null } | null;
  } | null>(null);

  // Cached handle groups for efficient updates (avoid scene traversal)
  const handleGroupsRef = useRef<Map<string, THREE.Group>>(new Map());

  // Smooth-chase targets. Pointer events write here; useFrame eases the live
  // joint values toward them, low-passing pointer jitter and giving every
  // motion a soft trailing weight (the thing that makes Figma/Procreate feel
  // "premium"). Without this, raw pointer→joint mapping always feels twitchy.
  const dragTargetsRef = useRef<Map<string, number>>(new Map());
  // Robot sync deferred until the chase converges, so the hardware command
  // reflects the final settled pose rather than an in-flight lerped value.
  const pendingSyncRef = useRef<{ jointIds: string[] } | null>(null);

  // Click-vs-drag state. A pointer-down records intent here; if movement
  // crosses CLICK_THRESHOLD_PX before release, it upgrades to a drag.
  // Otherwise on release it fires as a click → toggles body-part selection.
  // Lets the handle act both as "tap to discover" and "drag to nudge".
  type PendingClick = {
    handleId: string | null; // null = pointer landed on empty space
    arcJointId: string | null; // gizmo-arc joint (when set, drag immediately)
    startX: number;
    startY: number;
    pointerId: number;
    pointerType: string;
  };
  const pendingClickRef = useRef<PendingClick | null>(null);
  const CLICK_THRESHOLD_PX = 5;

  // Active gizmo state — meshes the user can grab to rotate one axis at a
  // time. Created when `selectedHandleId` becomes non-null, torn down on
  // deselection. Each mesh has userData.gizmoJointId so picking is direct.
  type GizmoArc = {
    mesh: THREE.Mesh;
    parent: THREE.Object3D;
    jointId: string;
  };
  const gizmoArcsRef = useRef<GizmoArc[]>([]);
  const hoveredArcJointRef = useRef<string | null>(null);

  // Create visible circular handles attached to joints
  const createHandles = (robot: any) => {
    INTERACTIVE_JOINTS.forEach((handleId) => {
      const combinedJoints = COMBINED_JOINTS[handleId];
      let targetJoint: any = null;
      
      if (combinedJoints) {
        // Use an anchor joint for positioning grouped handles.
        const anchorJointId = HANDLE_ANCHOR_JOINTS[handleId] || combinedJoints[0];
        const urdfEntry = Object.entries(URDF_JOINT_MAP).find(([_, id]) => id === anchorJointId);
        if (urdfEntry) {
          targetJoint = robot.joints[urdfEntry[0]];
        }
      } else {
        // Single joint handle
        const urdfEntry = Object.entries(URDF_JOINT_MAP).find(([_, id]) => id === handleId);
        if (urdfEntry) {
          targetJoint = robot.joints[urdfEntry[0]];
        }
      }
      
      if (!targetJoint) {
        return;
      }

      const size = HANDLE_SIZES[handleId] || 0.036;

      // Create handle group as child of joint
      const handleGroup = new THREE.Group();
      handleGroup.name = `Handle_${handleId}`;

      // Just one chunky ring — no center dot. The ring alone reads as a clean
      // "grab here" mark, and a thicker band is an easier target to hit.
      const ringGeo = new THREE.RingGeometry(size * 0.52, size * 1.18, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: HANDLE_COLOR_REST,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        depthTest: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.name = `Ring_${handleId}`;
      ring.userData.jointId = handleId;
      ring.userData.isHandle = true;
      ring.userData.combinedJoints = combinedJoints || null;
      handleGroup.add(ring);

      // Larger hit area for touch and forgiving cursor targeting.
      const hitGeo = new THREE.CircleGeometry(size * 4, 16);
      const hitMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthTest: false,
      });
      const hitArea = new THREE.Mesh(hitGeo, hitMat);
      hitArea.name = `Hit_${handleId}`;
      hitArea.userData.jointId = handleId;
      hitArea.userData.isHandle = true;
      hitArea.userData.combinedJoints = combinedJoints || null;
      handleGroup.add(hitArea);
      
      // Pin the ring to the joint's own pivot — the same point the rotation
      // arcs use as their center — so handle and arcs share one center.
      // Adding `targetJoint.origin` here would double-offset by the URDF
      // origin (the joint's transform already places the joint there), which
      // pushed every ring a few cm off its rotation pivot.
      handleGroup.position.set(0, 0, 0);
      
      // Add to joint and cache reference
      targetJoint.add(handleGroup);
      handleGroupsRef.current.set(handleId, handleGroup);
    });
  };

  // ── Axis gizmo ────────────────────────────────────────────────────
  // Build colored rotation arcs around the joint(s) underneath a selected
  // handle. Each arc is a thin torus oriented so its central axis matches
  // the URDF joint's rotation axis — drag the arc and the joint rotates
  // around exactly that axis. Combined handles (neck = pan + tilt) get one
  // arc per underlying joint, color-coded by axis.
  const buildAxisGizmo = (handleId: string) => {
    const robot = robotRef.current;
    if (!robot) return;

    // Hands don't get per-finger arcs — they're a single grab point you drag
    // to curl/open all the fingers at once. No arcs to build for them.
    if (HAND_GRIP_HANDLES.has(handleId)) return;

    const jointIds = COMBINED_JOINTS[handleId] ?? [handleId];
    const handleSize = HANDLE_SIZES[handleId] ?? 0.036;
    // Arc radius scales with handle size so neck rings aren't tiny on the
    // hand-grip handles or vice versa.
    const arcRadius = Math.max(handleSize * 2.4, 0.07);
    // A chunky visible ring, plus a much fatter invisible hit-torus around it
    // (roughly half the ring radius) so it's genuinely easy to grab.
    const arcTube = Math.max(handleSize * 0.22, 0.0075);
    const arcHitTube = Math.max(arcRadius * 0.5, arcTube * 5);

    jointIds.forEach((jointId, idx) => {
      const joint = jointRefs.current.get(jointId);
      if (!joint) return;

      const config = jointConfigById.get(jointId);
      // Determine the axis. Prefer URDF-declared axis (true source of truth);
      // fall back to the static config so synthetic finger joints still work.
      const urdfAxis = (joint as any).axis as THREE.Vector3 | undefined;
      let axisLocal: THREE.Vector3;
      let axisKey: "x" | "y" | "z" = config?.rotationAxis ?? "x";
      if (urdfAxis && urdfAxis.lengthSq() > 1e-6) {
        axisLocal = urdfAxis.clone().normalize();
        // Pick the closest cardinal axis for color so the palette stays
        // consistent even when URDF declares oblique axes.
        const ax = Math.abs(axisLocal.x);
        const ay = Math.abs(axisLocal.y);
        const az = Math.abs(axisLocal.z);
        axisKey = ax >= ay && ax >= az ? "x" : ay >= az ? "y" : "z";
      } else {
        axisLocal = new THREE.Vector3(
          axisKey === "x" ? 1 : 0,
          axisKey === "y" ? 1 : 0,
          axisKey === "z" ? 1 : 0,
        );
      }

      // Torus: thin ring. Default torus axis is +Z, so we rotate it to
      // align with the joint's actual rotation axis. The result is a
      // colored hoop in the plane perpendicular to the rotation axis —
      // exactly the path the joint sweeps through as it turns.
      const torusGeo = new THREE.TorusGeometry(arcRadius, arcTube, 12, 64);
      const torusMat = new THREE.MeshBasicMaterial({
        color: AXIS_COLORS[axisKey],
        transparent: true,
        opacity: 0.55,
        depthTest: false,
      });
      const torus = new THREE.Mesh(torusGeo, torusMat);
      torus.renderOrder = 999; // draw on top so the model never occludes it
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        axisLocal,
      );
      torus.quaternion.copy(q);
      torus.userData = {
        isGizmoArc: true,
        gizmoJointId: jointId,
        gizmoHandleId: handleId,
        gizmoAxisKey: axisKey,
      };

      // For combined joints, nudge the second arc's center off-origin
      // slightly so two crossed arcs don't z-fight at exact joint center.
      if (jointIds.length > 1 && idx > 0) {
        torus.position.set(0, 0, 0);
      }

      joint.add(torus);
      gizmoArcsRef.current.push({ mesh: torus, parent: joint, jointId });

      // Fat invisible hit-torus so the thin ring is actually easy to grab.
      // It carries the same arc userData (so picking works) plus an
      // `isGizmoArcHit` flag so the coloring loop knows to leave it alone.
      const hitGeo = new THREE.TorusGeometry(arcRadius, arcHitTube, 6, 40);
      const hitMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthTest: false,
      });
      const hitTorus = new THREE.Mesh(hitGeo, hitMat);
      hitTorus.quaternion.copy(q);
      hitTorus.userData = {
        isGizmoArc: true,
        isGizmoArcHit: true,
        gizmoJointId: jointId,
        gizmoHandleId: handleId,
        gizmoAxisKey: axisKey,
      };
      joint.add(hitTorus);
      gizmoArcsRef.current.push({ mesh: hitTorus, parent: joint, jointId });
    });
  };

  const clearAxisGizmo = () => {
    for (const { mesh, parent } of gizmoArcsRef.current) {
      parent.remove(mesh);
      mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else {
        mat.dispose();
      }
    }
    gizmoArcsRef.current = [];
    hoveredArcJointRef.current = null;
  };

  // Cast the camera ray through (pointerX, pointerY) onto a world-space plane.
  // Returns the hit point, or null if the ray is nearly parallel to the plane
  // (which happens when the rotation axis points across the screen and the arc
  // appears edge-on — caller should fall back to tangent-based drag there).
  const _planeRay = useRef(new THREE.Raycaster()).current;
  const _plane = useRef(new THREE.Plane()).current;
  const intersectRayWithPlane = (
    pointerX: number,
    pointerY: number,
    planePoint: THREE.Vector3,
    planeNormal: THREE.Vector3,
    out: THREE.Vector3,
  ): THREE.Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _pointerVec.x = ((pointerX - rect.left) / rect.width) * 2 - 1;
    _pointerVec.y = -((pointerY - rect.top) / rect.height) * 2 + 1;
    _planeRay.setFromCamera(_pointerVec, camera);
    // Near-perpendicular ray = no usable plane hit. Without this guard the
    // returned point can be wildly far from the pivot and torch the angle math.
    if (Math.abs(_planeRay.ray.direction.dot(planeNormal)) < 0.05) return null;
    _plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
    if (!_planeRay.ray.intersectPlane(_plane, out)) return null;
    return out;
  };

  // Build a fresh PlaneRotation context for a single-axis joint. The plane
  // is the joint's actual rotation plane (perpendicular to its URDF axis in
  // world space), and the initial pointer position seeds the angle reference.
  const computePlaneRotation = (
    jointId: string,
    pointerX: number,
    pointerY: number,
  ): PlaneRotation | null => {
    const joint = jointRefs.current.get(jointId);
    if (!joint) return null;
    joint.updateMatrixWorld();

    const jointWorldPos = new THREE.Vector3();
    joint.getWorldPosition(jointWorldPos);

    const urdfAxis = (joint as any).axis as THREE.Vector3 | undefined;
    let axisLocal: THREE.Vector3;
    if (urdfAxis && urdfAxis.lengthSq() > 1e-6) {
      axisLocal = urdfAxis.clone().normalize();
    } else {
      const config = jointConfigById.get(jointId);
      axisLocal = new THREE.Vector3(
        config?.rotationAxis === "x" ? 1 : 0,
        config?.rotationAxis === "y" ? 1 : 0,
        config?.rotationAxis === "z" ? 1 : 0,
      );
    }
    const axisWorld = axisLocal.clone().transformDirection(joint.matrixWorld).normalize();

    // u = camera-right projected onto the rotation plane. This anchors atan2
    // so that horizontal pointer motion at the "3 o'clock" position of the
    // arc reads as the natural starting direction.
    const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    let uBasis = cameraRight.sub(
      axisWorld.clone().multiplyScalar(cameraRight.dot(axisWorld)),
    );
    if (uBasis.lengthSq() < 1e-4) {
      // Camera-right is (anti)parallel to axis — fall back to camera-up.
      const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      uBasis = cameraUp.sub(axisWorld.clone().multiplyScalar(cameraUp.dot(axisWorld)));
    }
    uBasis.normalize();
    const vBasis = new THREE.Vector3().crossVectors(axisWorld, uBasis).normalize();

    const hit = intersectRayWithPlane(
      pointerX,
      pointerY,
      jointWorldPos,
      axisWorld,
      new THREE.Vector3(),
    );
    if (!hit) return null;

    const offset = hit.sub(jointWorldPos);
    const startAngle = Math.atan2(offset.dot(vBasis), offset.dot(uBasis));

    return {
      jointWorldPos,
      axisWorld,
      uBasis,
      vBasis,
      prevAngle: startAngle,
      totalDelta: 0,
    };
  };

  // Compute screen-space tangent of the handle's rotation arc, plus the
  // pixels-per-radian factor so we can map mouse motion 1:1 to joint rotation.
  // Drag the handle 100 pixels along its arc → the handle moves exactly 100
  // pixels on screen. Uses the URDF joint's actual axis (joint.axis).
  const computeScreenTangent = (
    jointId: string,
    handleId: string = jointId,
  ): { unitX: number; unitY: number; pixelsPerRadian: number } | null => {
    const joint = jointRefs.current.get(jointId);
    if (!joint) return null;

    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const urdfAxis = (joint as any).axis as THREE.Vector3 | undefined;
    let axisLocal: THREE.Vector3;
    if (urdfAxis && urdfAxis.lengthSq() > 1e-6) {
      axisLocal = urdfAxis.clone().normalize();
    } else {
      const config = jointConfigById.get(jointId);
      axisLocal = new THREE.Vector3(
        config?.rotationAxis === "x" ? 1 : 0,
        config?.rotationAxis === "y" ? 1 : 0,
        config?.rotationAxis === "z" ? 1 : 0,
      );
    }
    const axisWorld = axisLocal.clone().transformDirection(joint.matrixWorld);

    const handle = handleGroupsRef.current.get(handleId) ?? handleGroupsRef.current.get(jointId);
    const jointWorld = new THREE.Vector3();
    joint.getWorldPosition(jointWorld);
    const pointWorld = new THREE.Vector3();
    if (handle) {
      handle.getWorldPosition(pointWorld);
    } else {
      pointWorld.copy(jointWorld).add(new THREE.Vector3(0.05, 0, 0));
    }

    let offset = pointWorld.clone().sub(jointWorld);
    if (offset.lengthSq() < 1e-4) {
      // Handle is coincident with joint origin — synthesize a perpendicular
      // offset so we still have a well-defined tangent direction.
      const arbitrary = Math.abs(axisWorld.x) < 0.9
        ? new THREE.Vector3(1, 0, 0)
        : new THREE.Vector3(0, 1, 0);
      offset = arbitrary
        .sub(axisWorld.clone().multiplyScalar(arbitrary.dot(axisWorld)))
        .normalize()
        .multiplyScalar(0.05);
      pointWorld.copy(jointWorld).add(offset);
    }

    // Rotate the handle point by a small epsilon around axisWorld, then look
    // at how many pixels the projected point moved. That gives both direction
    // and an honest pixels/radian factor for the current camera & geometry.
    const epsilon = 0.05;
    const q = new THREE.Quaternion().setFromAxisAngle(axisWorld, epsilon);
    const rotatedOffset = offset.clone().applyQuaternion(q);
    const rotatedWorld = jointWorld.clone().add(rotatedOffset);

    const p0 = pointWorld.clone().project(camera);
    const p1 = rotatedWorld.project(camera);
    const dx = (p1.x - p0.x) * rect.width * 0.5;
    const dy = -(p1.y - p0.y) * rect.height * 0.5; // y-down to match pointer events
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) return null;

    return {
      unitX: dx / len,
      unitY: dy / len,
      pixelsPerRadian: len / epsilon,
    };
  };

  /**
   * Look at what's under the pointer — a rotation arc, a regular handle, or
   * nothing at all. Arcs beat plain handles since they float on top of the
   * model and need to stay grabbable even where they overlap a handle.
   */
  type Pick =
    | { kind: "arc"; jointId: string; handleId: string }
    | { kind: "handle"; id: string }
    | null;
  const pickInteractiveAtPointer = (event: PointerEvent): Pick => {
    if (!robotRef.current) return null;

    const rect = gl.domElement.getBoundingClientRect();
    _pointerVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _pointerVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(_pointerVec, camera);

    const intersects = raycaster.intersectObject(robotRef.current, true);

    // Pass 1: gizmo arcs (priority over plain handles)
    for (const intersect of intersects) {
      const ud = (intersect.object as any).userData;
      if (ud?.isGizmoArc && ud.gizmoJointId) {
        return { kind: "arc", jointId: ud.gizmoJointId, handleId: ud.gizmoHandleId };
      }
    }
    // Pass 2: regular handles
    for (const intersect of intersects) {
      const ud = (intersect.object as any).userData;
      if (ud?.isHandle && ud.jointId) {
        return { kind: "handle", id: ud.jointId };
      }
    }
    return null;
  };

  const updateHandleVisualState = (hoveredId: string | null) => {
    const draggingHandleId = draggingState.current
      ? Object.entries(COMBINED_JOINTS).find(([, ids]) => ids.includes(draggingState.current!.jointId))?.[0]
        ?? draggingState.current.jointId
      : null;
    const selectedId = useRobotStore.getState().selectedHandleId;

    handleGroupsRef.current.forEach((handleGroup, handleId) => {
      const isHovered = handleId === hoveredId;
      const isDragging = handleId === draggingHandleId;
      const isSelected = handleId === selectedId;
      const isAnyActive = isHovered || isDragging || isSelected;
      // When something is engaged and this isn't it, fade further out so
      // the active control reads cleanly without the "everything is on" feel.
      const someoneElseEngaged = !isAnyActive && (hoveredId !== null || draggingHandleId !== null || selectedId !== null);

      const color = isSelected
        ? HANDLE_COLOR_SELECTED
        : isDragging
          ? HANDLE_COLOR_ACTIVE
          : isHovered
            ? HANDLE_COLOR_HOVER
            : HANDLE_COLOR_REST;

      handleGroup.children.forEach((mesh: any) => {
        if (!mesh.material) return;

        const isHit = mesh.name?.startsWith("Hit_");
        const isRing = mesh.name?.startsWith("Ring_");

        if (isHit) {
          mesh.material.opacity = 0;
          return;
        }

        if (isRing) {
          mesh.material.color.setHex(color);
          // Once a handle is selected, its big colored rotation circles ARE
          // the visual — the inner ring becomes redundant and just clutters
          // the joint center. Hide it completely while selected; the hit
          // area still picks up a deselect-click on the same spot.
          mesh.material.opacity = isSelected
            ? 0
            : isDragging
              ? 1.0
              : isHovered
                ? 0.95
                : someoneElseEngaged
                  ? 0.5
                  : 0.82;
        }
      });
    });
  };

  // Make handles face camera, animate hover glow, breathe active/drag arc.
  useFrame(() => {
    if (!robotRef.current) return;

    const time = Date.now() * 0.001;
    const draggingId = draggingState.current?.jointId ?? null;

    handleGroupsRef.current.forEach((handleGroup, handleId) => {
      // Billboard toward camera
      handleGroup.getWorldPosition(_tempVec);
      handleGroup.lookAt(camera.position);

      // Scale: 1.0 idle, 1.15 hovered, 1.30 active drag (eased)
      let targetScale = 1.0;
      if (handleId === draggingId) targetScale = 1.30;
      else if (handleId === hoveredJointRef.current) targetScale = 1.15;
      const cur = handleGroup.scale.x;
      const next = cur + (targetScale - cur) * 0.22;
      _dragArcScale.setScalar(next);
      handleGroup.scale.copy(_dragArcScale);

      // Subtle ring breath while dragging — single-source pulse, no glow halo.
      if (handleId === draggingId) {
        const ring = handleGroup.children.find((c: any) => c.name?.startsWith("Ring_"));
        if (ring) {
          (ring as any).material.opacity = 0.96 + Math.sin(time * 6) * 0.04;
        }
      }
    });

    // Gizmo arc state — color the hovered/grabbed arc brighter so the user
    // sees which axis they're about to (or are currently) rotating around,
    // and turn it red when its joint is pinned at a motion limit so the user
    // understands the handle stopped because the joint can't go further.
    const grabbedArcJointId = draggingState.current && (draggingState.current.startPositions
      ? draggingState.current.jointId
      : null);
    const arcRobotState = useRobotStore.getState();
    const arcPositions = arcRobotState.pairingMode
      ? arcRobotState.pairingPositions
      : arcRobotState.jointPositions;
    // Compute view-direction once so we can fade arcs that are nearly edge-on
    // to the camera (they read as a line and clutter the view without giving
    // any useful interaction signal).
    camera.getWorldDirection(_arcViewDir);

    for (const { mesh, jointId } of gizmoArcsRef.current) {
      const ud: any = mesh.userData;
      // The fat invisible hit-toruses share this list for cleanup, but they
      // must stay invisible — never paint them.
      if (ud.isGizmoArcHit) continue;
      const axisKey = ud.gizmoAxisKey as "x" | "y" | "z";
      const isHovered = hoveredArcJointRef.current === jointId;
      const isGrabbed = grabbedArcJointId === jointId;
      const someoneElseGrabbed = grabbedArcJointId !== null && !isGrabbed;
      const mat = mesh.material as THREE.MeshBasicMaterial;

      const range = arcRobotState.getMotorRange(jointId);
      const pos = arcPositions[jointId] ?? 0;
      const atLimit = pos <= range.minCentidegrees || pos >= range.maxCentidegrees;

      // Edge-on factor: |axis · view| is 1 when arc faces camera (full circle
      // visible), 0 when its axis lies in the screen plane (arc appears as a
      // thin stripe). We fade non-active arcs as edge-on grows, so the view
      // stays clean without robbing the user of a face-on grab target.
      mesh.getWorldQuaternion(_arcQuat);
      _arcAxisTmp.set(0, 0, 1).applyQuaternion(_arcQuat); // torus local axis = +Z
      const axisDot = Math.abs(_arcAxisTmp.dot(_arcViewDir));
      const edgeOn = 1 - axisDot;
      const edgeOnMul = isGrabbed || isHovered ? 1 : 1 - edgeOn * 0.3;

      if (atLimit) {
        // Stay blue at the motion limit — the pulse/opacity still signals it.
        mat.color.setHex(isGrabbed || isHovered ? AXIS_COLOR_HOVER[axisKey] : AXIS_COLORS[axisKey]);
        mat.opacity = isGrabbed
          ? 0.92 + Math.sin(time * 6) * 0.06
          : isHovered
            ? 0.9
            : 0.7 * edgeOnMul;
      } else if (isGrabbed) {
        mat.color.setHex(AXIS_COLOR_HOVER[axisKey]);
        mat.opacity = 0.98 + Math.sin(time * 6) * 0.02;
      } else if (isHovered) {
        mat.color.setHex(AXIS_COLOR_HOVER[axisKey]);
        mat.opacity = 0.85;
      } else if (someoneElseGrabbed) {
        // Active drag in progress — quiet the other arcs right down so the
        // grabbed one reads as the single source of attention.
        mat.color.setHex(AXIS_COLORS[axisKey]);
        mat.opacity = 0.3 * edgeOnMul;
      } else {
        mat.color.setHex(AXIS_COLORS[axisKey]);
        mat.opacity = 0.9 * edgeOnMul;
      }

      // Gentle pop on hover/grab
      const targetScale = isGrabbed ? 1.18 : isHovered ? 1.08 : 1.0;
      const cur = mesh.scale.x;
      const next = cur + (targetScale - cur) * 0.22;
      mesh.scale.setScalar(next);
    }

    // Smooth-chase: ease the live joint positions toward their drag targets.
    // This is the key thing that makes manipulation feel buttery — the
    // displayed pose lags the pointer by a few frames, low-passing twitches
    // and turning every release into a soft ease-out instead of a hard stop.
    if (dragTargetsRef.current.size > 0) {
      const state = useRobotStore.getState();
      const positions = state.pairingMode ? state.pairingPositions : state.jointPositions;
      const setPos = state.pairingMode ? state.setPairingPosition : state.setJointPositionLocal;
      const LERP = 0.22;
      const SETTLE = 1; // centidegrees — below this, snap and stop chasing

      for (const [chaseJointId, target] of Array.from(dragTargetsRef.current.entries())) {
        const current = positions[chaseJointId] ?? 0;
        const diff = target - current;

        if (Math.abs(diff) < SETTLE) {
          if (current !== target) setPos(chaseJointId, target);
          dragTargetsRef.current.delete(chaseJointId);
          continue;
        }

        const stepped = Math.round(current + diff * LERP);
        // Force at least one centideg of progress so micro-rounding can't
        // freeze the chase one tick away from the target.
        const next = stepped === current ? current + Math.sign(diff) : stepped;
        setPos(chaseJointId, next);

        // Detect a clamp wall (range limit hit): the store didn't accept the
        // write, so further chasing is futile. Drop this entry.
        const after = state.pairingMode
          ? useRobotStore.getState().pairingPositions
          : useRobotStore.getState().jointPositions;
        if ((after[chaseJointId] ?? 0) === current) {
          dragTargetsRef.current.delete(chaseJointId);
        }
      }

      // Once the chase has fully drained, fire the deferred robot sync
      // so the hardware sees the final settled pose.
      if (dragTargetsRef.current.size === 0 && pendingSyncRef.current) {
        const { jointIds } = pendingSyncRef.current;
        pendingSyncRef.current = null;
        if (state.robotCommandEnabled && !state.pairingMode) {
          state.syncJointSelectionToRobot(jointIds);
        }
      }

      invalidate();
    }
  });

  useEffect(() => {
    loadURDFModel()
      .then((robot) => {
        // Mark root to let camera controls detect robot-vs-background dragging.
        robot.userData = {
          ...robot.userData,
          isRobotModelRoot: true,
        };
        robotRef.current = robot;
        
        // Store joints
        Object.entries(URDF_JOINT_MAP).forEach(([urdfName, jointId]) => {
          const joint = robot.joints[urdfName];
          if (joint) {
            jointRefs.current.set(jointId, joint);
          }
        });

        // Store links for tracking
        const linksToTrack = {
          head: "head_vertical",
          right_arm: "elbow_right",
          left_arm: "elbow_left",
          right_hand: "urdf_palm_right",
          left_hand: "urdf_palm_left"
        };

        Object.entries(linksToTrack).forEach(([key, urdfName]) => {
          const link = robot.links[urdfName] || robot.joints[urdfName];
          if (link) linkRefs.current.set(key, link);
        });

        // Create handles
        createHandles(robot);
        updateHandleVisualState(null);

        setIsLoading(false);
        invalidate();
      })
      .catch((err) => {
        setError(err.message || "Failed to load URDF");
        setIsLoading(false);
      });
  }, [invalidate]);

  // Build / tear down the axis gizmo when selection changes. The gizmo
  // sits on top of the model showing colored rotation rings — one ring per
  // axis the selected body part can move on.
  useEffect(() => {
    clearAxisGizmo();
    if (selectedHandleId && robotRef.current && !isLoading) {
      buildAxisGizmo(selectedHandleId);
      updateHandleVisualState(hoveredJointRef.current);
      invalidate();
    } else {
      // Refresh handle visuals so the previously-selected handle drops back
      // to its default styling.
      updateHandleVisualState(hoveredJointRef.current);
      invalidate();
    }
    return () => clearAxisGizmo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedHandleId, isLoading]);

  // Show only the handles for the current focus area. "Full" shows everything;
  // "R. Arm" / "Head" / etc. narrow it down so the viewer isn't a wall of rings.
  // Hidden groups (visible = false) are also skipped by the raycaster, so they
  // can't be hovered or grabbed either.
  useEffect(() => {
    if (isLoading || !robotRef.current) return;
    const activeGroups = VIEW_PRESETS[viewMode].groups;
    handleGroupsRef.current.forEach((handleGroup, handleId) => {
      handleGroup.visible = activeGroups.includes(HANDLE_GROUP[handleId] ?? "");
    });
    // If the selected handle just got filtered out, drop the selection so its
    // rotation arcs don't linger with no handle to anchor them.
    const selected = useRobotStore.getState().selectedHandleId;
    if (selected && !activeGroups.includes(HANDLE_GROUP[selected] ?? "")) {
      useRobotStore.getState().setSelectedHandle(null);
    }
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, isLoading]);

  // Handle interactions
  useEffect(() => {
    const canvas = gl.domElement;
    const previousTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = "none";

    const setHoveredJoint = (jointId: string | null) => {
      if (hoveredJointRef.current === jointId) return;
      hoveredJointRef.current = jointId;
      updateHandleVisualState(jointId);
      canvas.style.cursor = jointId ? "grab" : "auto";
      invalidate();
    };

    const handlePointerMove = (e: PointerEvent) => {
      // Pending click that's about to escalate into a drag? Check threshold
      // and either upgrade or just keep waiting. We do this first so the
      // click-vs-drag decision happens before any hover redraws.
      const pending = pendingClickRef.current;
      if (pending && !draggingState.current) {
        const dx = e.clientX - pending.startX;
        const dy = e.clientY - pending.startY;
        if (Math.hypot(dx, dy) >= CLICK_THRESHOLD_PX) {
          // The big rotation circles are the sole rotation gizmo. The handle
          // ring itself is click-to-select only — dragging off it does NOT
          // escalate into rotation anymore. Hand-grip handles are the one
          // exception: they have no arcs, so the "drag to curl fingers"
          // gesture lives on the ring itself.
          if (pending.handleId && HAND_GRIP_HANDLES.has(pending.handleId)) {
            startDrag(pending.handleId, {
              startX: pending.startX,
              startY: pending.startY,
              pointerId: pending.pointerId,
              pointerType: pending.pointerType,
            });
          }
          pendingClickRef.current = null;
        } else {
          // Still within click range — leave hover/cursor alone.
          return;
        }
      }

      if (!draggingState.current) {
        const pick = pickInteractiveAtPointer(e);
        if (pick?.kind === "arc") {
          // Hovering an arc — show grab cursor and remember which one.
          if (hoveredArcJointRef.current !== pick.jointId) {
            hoveredArcJointRef.current = pick.jointId;
            invalidate();
          }
          canvas.style.cursor = "grab";
          setHoveredJoint(null);
          return;
        }
        if (hoveredArcJointRef.current) {
          hoveredArcJointRef.current = null;
          invalidate();
        }
        setHoveredJoint(pick?.kind === "handle" ? pick.id : null);
        return;
      }

      const { jointId, startPositions } = draggingState.current;
      const drag = draggingState.current;

      // The chase loop in useFrame is what actually writes to the store —
      // pointer events just record where the joint *should* end up.
      const writeTarget = (id: string, value: number) => {
        dragTargetsRef.current.set(id, value);
      };

      const DEAD_ZONE_PX = drag.pointerType === "touch" ? 6 : 4;
      const AXIS_LOCK_THRESHOLD_PX = drag.pointerType === "touch" ? 11 : 8;
      // Radians → centidegrees factor: (180/π) × 100.
      const RAD_TO_CENTIDEG = 5729.5779513;
      // Global drag-sensitivity damper. Lower = gentler, more deliberate motion
      // so the robot is easy to pose precisely (and friendly for kids). The
      // smooth-chase loop in useFrame on top of this turns the raw input into
      // a soft, weighted feel (low-passes jitter, eases out on release).
      const MOTION_DAMPER = 0.4;

      const applyDeadZone = (value: number) => {
        const abs = Math.abs(value);
        if (abs <= DEAD_ZONE_PX) return 0;
        return Math.sign(value) * (abs - DEAD_ZONE_PX);
      };

      const rawDeltaX = e.clientX - drag.startX;
      const rawDeltaY = e.clientY - drag.startY;
      const mappedDeltaX = -rawDeltaX;
      const mappedDeltaY = rawDeltaY;

      // 1:1 tracking helper — pixels along tangent → centideg of joint
      // rotation, using the live pixels-per-radian factor for this handle.
      const pixelsToCentideg = (pixels: number, tangent: Tangent) => {
        const radians = pixels / tangent.pixelsPerRadian;
        return radians * RAD_TO_CENTIDEG;
      };

      if (drag.dragMode === "two-axis") {
        const combinedJoints = COMBINED_JOINTS[jointId];
        const tangents = drag.twoAxisTangents;

        if (combinedJoints && combinedJoints.length === 2 && tangents) {
          const { xJoint, yJoint, xTangent, yTangent } = tangents;
          // Project pointer delta onto each axis's screen tangent. Two-axis
          // handles (head, shoulder) sit close to their joint pivot in
          // screen space, so we apply a stronger damper than the single-axis
          // global one to keep motion feeling intentional.
          const TWO_AXIS_DAMPER = MOTION_DAMPER * 0.85;
          const projX = xTangent ? rawDeltaX * xTangent.unitX + rawDeltaY * xTangent.unitY : 0;
          const projY = yTangent ? rawDeltaX * yTangent.unitX + rawDeltaY * yTangent.unitY : 0;
          const dx = xTangent ? pixelsToCentideg(applyDeadZone(projX), xTangent) * TWO_AXIS_DAMPER : 0;
          const dy = yTangent ? pixelsToCentideg(applyDeadZone(projY), yTangent) * TWO_AXIS_DAMPER : 0;
          // INV flips the rendered angle, so flip the UI delta to keep the
          // handle moving with the pointer regardless of invert state, then
          // apply any per-joint direction correction.
          const xSign = (getJointInvert(xJoint) ? -1 : 1) * (JOINT_DRAG_FLIP[xJoint] ?? 1);
          const ySign = (getJointInvert(yJoint) ? -1 : 1) * (JOINT_DRAG_FLIP[yJoint] ?? 1);
          const nextX = Math.round((startPositions[xJoint] ?? 0) + dx * xSign);
          const nextY = Math.round((startPositions[yJoint] ?? 0) + dy * ySign);
          drag.currentPositions[xJoint] = nextX;
          drag.currentPositions[yJoint] = nextY;
          writeTarget(xJoint, nextX);
          writeTarget(yJoint, nextY);
        }

        invalidate();
        return;
      }


      // Single-axis: plane-projection path. Cast the pointer ray onto the
      // joint's rotation plane and measure the angle change around the pivot.
      // 1:1 mapping — circle the arc once, joint rotates once. The grab spot
      // on the arc doesn't matter: anywhere works, and the rotation always
      // follows the actual circular sweep the hand is making on screen.
      if (drag.planeRotation) {
        const pr = drag.planeRotation;
        const hit = intersectRayWithPlane(
          e.clientX,
          e.clientY,
          pr.jointWorldPos,
          pr.axisWorld,
          _planeHit,
        );
        if (hit) {
          _planeOffset.copy(hit).sub(pr.jointWorldPos);
          // Guard: extreme close-to-pivot points blow up atan2. Below ~1cm
          // the pointer is on top of the joint center and any motion produces
          // huge angular swings — skip the frame instead of jumping the joint.
          if (_planeOffset.lengthSq() >= 1e-4) {
            const rawAngle = Math.atan2(
              _planeOffset.dot(pr.vBasis),
              _planeOffset.dot(pr.uBasis),
            );
            // Unwrap relative to last frame so a sweep past atan2's ±π seam
            // accumulates instead of snapping to the opposite sign.
            let step = rawAngle - pr.prevAngle;
            if (step > Math.PI) step -= 2 * Math.PI;
            else if (step < -Math.PI) step += 2 * Math.PI;
            pr.totalDelta += step;
            pr.prevAngle = rawAngle;

            const deltaCentideg = pr.totalDelta * RAD_TO_CENTIDEG;

            // Plane projection drives exactly ONE joint at a time — for arc
            // drags that's the arc's joint; for simple handles it's the
            // handle's own joint. (Two-axis handles take the other branch.)
            Object.keys(startPositions).forEach((id) => {
              // INV negates the viewer rotation, so flip the UI delta to keep
              // the handle moving with the pointer regardless of invert state.
              // No JOINT_DRAG_FLIP here — the plane normal IS the URDF axis,
              // so the sign is geometrically correct.
              const sign = getJointInvert(id) ? -1 : 1;
              const nextPos = Math.round((startPositions[id] ?? 0) + deltaCentideg * sign);
              drag.currentPositions[id] = nextPos;
              writeTarget(id, nextPos);
            });

            invalidate();
            return;
          }
        }
        // Plane hit failed (ray parallel / pointer outside view) — fall through
        // to the screen-tangent fallback so the drag doesn't freeze.
      }

      // Single-axis fallback: project the pointer motion onto the arc's
      // screen-space tangent. Used when plane-projection isn't available
      // (hand grips, arc edge-on, etc.).
      let oneAxisDelta: number;
      if (drag.screenTangent) {
        const projected =
          rawDeltaX * drag.screenTangent.unitX + rawDeltaY * drag.screenTangent.unitY;
        oneAxisDelta =
          pixelsToCentideg(applyDeadZone(projected), drag.screenTangent) * MOTION_DAMPER;
      } else {
        // Rare fallback when no tangent could be built (handle sits exactly on
        // the joint pivot, or a degenerate camera angle): axis-locked screen drag.
        if (!drag.axisLock) {
          const absX = Math.abs(mappedDeltaX);
          const absY = Math.abs(mappedDeltaY);
          if (Math.max(absX, absY) < AXIS_LOCK_THRESHOLD_PX) return;
          drag.axisLock = absX >= absY ? "x" : "y";
        }
        const fallbackPixelsPerRadian = 80;
        const projected = drag.axisLock === "x" ? mappedDeltaX : mappedDeltaY;
        oneAxisDelta =
          (applyDeadZone(projected) / fallbackPixelsPerRadian) * RAD_TO_CENTIDEG * MOTION_DAMPER;
      }

      // Hand grips have no visible arc — keep their fixed "drag to curl" gesture.
      if (HAND_GRIP_HANDLES.has(jointId)) oneAxisDelta = -oneAxisDelta;

      const combinedJoints = COMBINED_JOINTS[jointId];

      if (combinedJoints) {
        combinedJoints.forEach((nestedJointId) => {
          // INV negates the viewer rotation, so flip the UI delta to keep
          // the handle moving with the pointer regardless of invert state,
          // then apply any per-joint direction correction.
          const sign =
            (getJointInvert(nestedJointId) ? -1 : 1) * (JOINT_DRAG_FLIP[nestedJointId] ?? 1);
          const nextPos = Math.round((startPositions[nestedJointId] ?? 0) + oneAxisDelta * sign);
          drag.currentPositions[nestedJointId] = nextPos;
          writeTarget(nestedJointId, nextPos);
        });
      } else {
        const sign = (getJointInvert(jointId) ? -1 : 1) * (JOINT_DRAG_FLIP[jointId] ?? 1);
        const nextPos = Math.round((startPositions[jointId] ?? 0) + oneAxisDelta * sign);
        drag.currentPositions[jointId] = nextPos;
        writeTarget(jointId, nextPos);
      }

      invalidate();
    };

    /**
     * Set up the drag state for a handle or a gizmo arc. Pulled into its
     * own function so it can be called either:
     *   • from pointer-down on a gizmo arc (immediate drag), or
     *   • from pointer-move when a pending click crosses the drag threshold.
     *
     * `arcJointId`, when set, locks the drag to a single joint axis (the
     * gizmo arc model). Otherwise we use the existing single/two-axis
     * heuristics for the bare handle.
     */
    const startDrag = (
      handleId: string,
      params: {
        startX: number;
        startY: number;
        pointerId: number;
        pointerType: string;
        arcJointId?: string;
      },
    ) => {
      const { jointPositions, pairingMode, pairingPositions } = useRobotStore.getState();
      const positions = pairingMode ? pairingPositions : jointPositions;

      // For arc drags we only ever drive ONE joint, regardless of whether
      // the parent handle is combined (e.g. neck → neck_pan when grabbing
      // the pan-axis arc).
      const activeJointIds = params.arcJointId
        ? [params.arcJointId]
        : (COMBINED_JOINTS[handleId] ?? [handleId]);
      const startPositions: Record<string, number> = {};
      activeJointIds.forEach((id) => {
        startPositions[id] = positions[id] || 0;
      });

      // Arc drag is always single-axis even on combined-handle parents.
      const dragMode: "single-axis" | "two-axis" =
        !params.arcJointId && TWO_AXIS_HANDLES.has(handleId) ? "two-axis" : "single-axis";
      const tangentJointId = params.arcJointId
        ?? COMBINED_JOINTS[handleId]?.[0]
        ?? handleId;
      // Plane-projection is the preferred path for single-axis rotation: grab
      // anywhere on the arc, circle around the pivot, joint follows 1:1. The
      // screen-tangent path stays as fallback for the rare degenerate cases
      // (arc edge-on to camera, pointer outside the plane, etc.).
      // HAND_GRIP handles deliberately stay on the tangent path — they aren't
      // an arc gizmo but a "drag down to curl fingers" gesture.
      const useTangentOnly = dragMode !== "single-axis" || HAND_GRIP_HANDLES.has(handleId);
      const planeRotation = !useTangentOnly
        ? computePlaneRotation(tangentJointId, params.startX, params.startY)
        : null;
      const screenTangent = dragMode === "single-axis"
        ? computeScreenTangent(tangentJointId, handleId)
        : null;

      type TwoAxisTangents = NonNullable<NonNullable<typeof draggingState.current>["twoAxisTangents"]>;
      let twoAxisTangents: TwoAxisTangents | null = null;
      if (dragMode === "two-axis") {
        const combined = COMBINED_JOINTS[handleId];
        if (combined && combined.length === 2) {
          const { xJointId, yJointId } = getTwoAxisJointMapping(handleId, combined);
          twoAxisTangents = {
            xJoint: xJointId,
            yJoint: yJointId,
            xTangent: computeScreenTangent(xJointId, handleId),
            yTangent: computeScreenTangent(yJointId, handleId),
          };
        }
      }

      draggingState.current = {
        jointId: params.arcJointId ?? handleId,
        pointerId: params.pointerId,
        pointerType: params.pointerType,
        startX: params.startX,
        startY: params.startY,
        dragMode,
        axisLock: null,
        startPositions,
        currentPositions: { ...startPositions },
        planeRotation,
        screenTangent,
        twoAxisTangents,
      };

      setHoveredJoint(handleId);
      canvas.style.cursor = "grabbing";
      if (canvas.setPointerCapture) {
        canvas.setPointerCapture(params.pointerId);
      }
    };

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType !== "touch") return;

      const pick = pickInteractiveAtPointer(e);

      // Gizmo arc → start a one-axis drag straight away. The arc itself
      // is the dedicated drag target, no click-vs-drag distinction needed.
      if (pick?.kind === "arc") {
        startDrag(pick.handleId, {
          startX: e.clientX,
          startY: e.clientY,
          pointerId: e.pointerId,
          pointerType: e.pointerType,
          arcJointId: pick.jointId,
        });
        e.preventDefault();
        return;
      }

      // Handle hit → record as a pending click. If the user moves past
      // CLICK_THRESHOLD_PX before releasing it'll upgrade to a drag (legacy
      // direct-rotate path); otherwise it fires as a click on release and
      // toggles the body-part selection.
      if (pick?.kind === "handle") {
        pendingClickRef.current = {
          handleId: pick.id,
          arcJointId: null,
          startX: e.clientX,
          startY: e.clientY,
          pointerId: e.pointerId,
          pointerType: e.pointerType,
        };
        if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

      // Empty space → potential deselect on release (only fires if pointer
      // didn't move, so panning the camera doesn't accidentally clear it).
      pendingClickRef.current = {
        handleId: null,
        arcJointId: null,
        startX: e.clientX,
        startY: e.clientY,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
      };
    };

    const finishDrag = (pointerId?: number) => {
      if (!draggingState.current) return;
      if (pointerId !== undefined && draggingState.current.pointerId !== pointerId) {
        return;
      }

      const { jointId, pointerId: activePointerId } = draggingState.current;
      const activeJointIds = COMBINED_JOINTS[jointId] ?? [jointId];

      // Defer the robot sync until the smooth-chase has settled, so the
      // hardware gets the final pose rather than an in-flight lerp value.
      // If the chase is already drained (e.g. user clicked without dragging),
      // fire it now.
      if (dragTargetsRef.current.size > 0) {
        pendingSyncRef.current = { jointIds: activeJointIds };
      } else {
        const { robotCommandEnabled, syncJointSelectionToRobot, pairingMode } = useRobotStore.getState();
        if (robotCommandEnabled && !pairingMode) {
          syncJointSelectionToRobot(activeJointIds);
        }
      }

      draggingState.current = null;
      if (canvas.hasPointerCapture?.(activePointerId)) {
        canvas.releasePointerCapture(activePointerId);
      }

      canvas.style.cursor = hoveredJointRef.current ? "grab" : "auto";
      updateHandleVisualState(hoveredJointRef.current);
      invalidate();
    };

    const handlePointerUp = (e: PointerEvent) => {
      // If a drag is in flight, finalize it normally (and ignore any
      // pending-click record — the drag overrides the click).
      if (draggingState.current) {
        finishDrag(e.pointerId);
        pendingClickRef.current = null;
        return;
      }

      // No drag — fire any pending click. handleId set means "toggle this
      // body part's selection"; null means "click on empty space, clear
      // selection". The click-threshold is enforced in pointerMove, so by
      // the time we get here the pointer has moved less than 5px.
      const pending = pendingClickRef.current;
      if (pending && pending.pointerId === e.pointerId) {
        pendingClickRef.current = null;
        if (canvas.hasPointerCapture?.(pending.pointerId)) {
          canvas.releasePointerCapture(pending.pointerId);
        }
        const { selectedHandleId, setSelectedHandle } = useRobotStore.getState();
        if (pending.handleId) {
          // Toggle: same handle → deselect; different (or first) → select.
          setSelectedHandle(selectedHandleId === pending.handleId ? null : pending.handleId);
        } else if (selectedHandleId) {
          // Click on empty space clears selection.
          setSelectedHandle(null);
        }
      }
    };

    const handlePointerLeave = () => {
      if (draggingState.current) return;
      if (hoveredJointRef.current) {
        hoveredJointRef.current = null;
        updateHandleVisualState(null);
        canvas.style.cursor = "auto";
        invalidate();
      }
    };

    const handlePointerCancel = (e: PointerEvent) => {
      finishDrag(e.pointerId);
    };

    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      canvas.style.touchAction = previousTouchAction;
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [gl, invalidate, camera, raycaster]);

  useEffect(() => {
    if (isLoading || !robotRef.current) return;

    // Apply positions from state (covers initial load + future changes)
    // In pairing mode, use pairingPositions for the 3D view.
    const applyPositions = (state: { jointPositions: Record<string, number>; pairingMode: boolean; pairingPositions: Record<string, number> }) => {
      const positions = state.pairingMode ? state.pairingPositions : state.jointPositions;
      // Outside pairing, respect the URDF's joint limits so limbs can't rotate
      // through the torso — the URDF already encodes physically reasonable
      // ranges per joint. In pairing mode we deliberately bypass them so the
      // user can drive each motor to its physical zero independent of the
      // simulator's pose limits.
      for (const [jointId, centideg] of Object.entries(positions)) {
        const joint = jointRefs.current.get(jointId);
        if (!joint) continue;
        (joint as any).ignoreLimits = state.pairingMode;
        joint.setJointValue(centidegreesToJointRadians(jointId, centideg));
      }
      invalidate();
    };

    // Apply current positions immediately when model finishes loading
    applyPositions(useRobotStore.getState());

    return useRobotStore.subscribe(applyPositions);
  }, [isLoading, invalidate]);

  useFrame(() => {
    if (!robotRef.current) return;
    const update = (key: string, setter: (v: THREE.Vector3) => void) => {
      const link = linkRefs.current.get(key);
      if (link) {
        link.getWorldPosition(_tempVec);
        setter(_tempVec.clone());
      }
    };
    update("head", setHeadPosition);
    update("right_arm", setRightArmPosition);
    update("left_arm", setLeftArmPosition);
    update("right_hand", setRightHandPosition);
    update("left_hand", setLeftHandPosition);
  });

  if (error) return <ErrorDisplay message={error} />;
  if (isLoading || !robotRef.current) return <LoadingSpinner />;

  return (
    <group position={[0, 0.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <primitive object={robotRef.current} />
    </group>
  );
}

export function RobotModel() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <URDFRobotModel />
    </Suspense>
  );
}
