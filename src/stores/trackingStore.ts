import { create } from "zustand";
import * as THREE from "three";

interface TrackingState {
  headPosition: THREE.Vector3;
  rightArmPosition: THREE.Vector3;
  leftArmPosition: THREE.Vector3;
  rightHandPosition: THREE.Vector3;
  leftHandPosition: THREE.Vector3;
  setHeadPosition: (pos: THREE.Vector3) => void;
  setRightArmPosition: (pos: THREE.Vector3) => void;
  setLeftArmPosition: (pos: THREE.Vector3) => void;
  setRightHandPosition: (pos: THREE.Vector3) => void;
  setLeftHandPosition: (pos: THREE.Vector3) => void;
}

export const useTrackingStore = create<TrackingState>((set) => ({
  headPosition: new THREE.Vector3(0, 1.65, 0),
  rightArmPosition: new THREE.Vector3(-0.6, 0.9, 0),
  leftArmPosition: new THREE.Vector3(0.6, 0.9, 0),
  rightHandPosition: new THREE.Vector3(-0.7, 0.35, 0.25),
  leftHandPosition: new THREE.Vector3(0.7, 0.35, 0.25),
  setHeadPosition: (pos) => set({ headPosition: pos }),
  setRightArmPosition: (pos) => set({ rightArmPosition: pos }),
  setLeftArmPosition: (pos) => set({ leftArmPosition: pos }),
  setRightHandPosition: (pos) => set({ rightHandPosition: pos }),
  setLeftHandPosition: (pos) => set({ leftHandPosition: pos }),
}));
