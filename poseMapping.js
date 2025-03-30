/**
 * Pose Mapping Module
 * Maps MediaPipe Pose landmarks to a Three.js skeleton.
 */
import * as THREE from 'three';

// --- Constants ---

// Indices for MediaPipe Pose Landmarker (refer to MediaPipe documentation)
const Landmark = {
    NOSE: 0,
    LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
    RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
    LEFT_EAR: 7, RIGHT_EAR: 8,
    MOUTH_LEFT: 9, MOUTH_RIGHT: 10,
    LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
    LEFT_WRIST: 15, RIGHT_WRIST: 16,
    LEFT_PINKY: 17, RIGHT_PINKY: 18,
    LEFT_INDEX: 19, RIGHT_INDEX: 20,
    LEFT_THUMB: 21, RIGHT_THUMB: 22,
    LEFT_HIP: 23, RIGHT_HIP: 24,
    LEFT_KNEE: 25, RIGHT_KNEE: 26,
    LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
    LEFT_HEEL: 29, RIGHT_HEEL: 30,
    LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32
};

// Helper Vectors
const V_UP = new THREE.Vector3(0, 1, 0);
const V_FORWARD = new THREE.Vector3(0, 0, 1); 
const tempVec1 = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const tempVec3 = new THREE.Vector3();
const tempQuat = new THREE.Quaternion();
const tempMatrix = new THREE.Matrix4();

// --- Bone Name Mapping (Crucial & Model-Dependent) ---
// This is a HIGHLY GENERIC example. You WILL need to adjust these names
// based on the actual bone names in your loaded models (FBX/GLTF).
// Use console logging or the Skeleton UI to find the correct names.
const boneNameMap = {
    Hips: "mixamorigHips",
    Spine: "mixamorigSpine", 
    Chest: "mixamorigSpine1", 
    UpperChest: "mixamorigSpine2", 
    Neck: "mixamorigNeck",
    Head: "mixamorigHead",

    LeftShoulder: "mixamorigLeftShoulder", 
    LeftUpperArm: "mixamorigLeftArm", 
    LeftLowerArm: "mixamorigLeftForeArm", 
    LeftHand: "mixamorigLeftHand", 

    RightShoulder: "mixamorigRightShoulder",
    RightUpperArm: "mixamorigRightArm",
    RightLowerArm: "mixamorigRightForeArm",
    RightHand: "mixamorigRightHand",

    LeftUpperLeg: "mixamorigLeftUpLeg", 
    LeftLowerLeg: "mixamorigLeftLeg", 
    LeftFoot: "mixamorigLeftFoot", 
    LeftToeBase: "mixamorigLeftToeBase", 

    RightUpperLeg: "mixamorigRightUpLeg",
    RightLowerLeg: "mixamorigRightLeg",
    RightFoot: "mixamorigRightFoot",
    RightToeBase: "mixamorigRightToeBase",
};

// Store bone objects found in the current model
let trackedBones = {};
let skeletonRoot = null; 
let initialPose = new Map(); 


// --- Core Mapping Function ---

/**
 * Applies the detected MediaPipe pose landmarks to the Three.js model's skeleton.
 * @param {THREE.Object3D} model - The loaded model containing the skeleton.
 * @param {Array<Object>} landmarks - Array of MediaPipe world landmark objects {x, y, z, visibility}.
 */
export function applyPoseToSkeleton(model, landmarks) {
    if (!model || !landmarks || landmarks.length === 0) {
        return;
    }

    if (!skeletonRoot || !trackedBones[boneNameMap.Hips] || trackedBones[boneNameMap.Hips].root !== model) {
        findBones(model);
        if (!skeletonRoot) {
            console.error("Could not find skeleton root or essential bones for pose mapping.");
            return; 
        }
        storeInitialPose();
        console.log("Tracked Bones:", trackedBones); 
        console.log("Initial Pose Stored:", initialPose);
    }

    const getLandmarkPos = (index) => {
        const lm = landmarks[index];
        if (!lm) return new THREE.Vector3(); 
        const scale = 1; 
        return tempVec1.set(-lm.x * scale, lm.y * scale, -lm.z * scale);
    };

    const leftShoulderPos = getLandmarkPos(Landmark.LEFT_SHOULDER);
    const rightShoulderPos = getLandmarkPos(Landmark.RIGHT_SHOULDER);
    const leftElbowPos = getLandmarkPos(Landmark.LEFT_ELBOW);
    const leftHipPos = getLandmarkPos(Landmark.LEFT_HIP);
    const rightHipPos = getLandmarkPos(Landmark.RIGHT_HIP);
    const leftKneePos = getLandmarkPos(Landmark.LEFT_KNEE);
    const rightKneePos = getLandmarkPos(Landmark.RIGHT_KNEE);
    const leftWristPos = getLandmarkPos(Landmark.LEFT_WRIST);
    const rightWristPos = getLandmarkPos(Landmark.RIGHT_WRIST);
    const leftAnklePos = getLandmarkPos(Landmark.LEFT_ANKLE);
    const rightAnklePos = getLandmarkPos(Landmark.RIGHT_ANKLE);

    const hipCenter = tempVec2.copy(leftHipPos).add(rightHipPos).multiplyScalar(0.5);
    const shoulderCenter = tempVec3.copy(leftShoulderPos).add(rightShoulderPos).multiplyScalar(0.5);
    const spineDir = tempVec1.copy(shoulderCenter).sub(hipCenter).normalize();

    if (trackedBones[boneNameMap.Hips]) {
        rotateBoneToTarget(trackedBones[boneNameMap.Hips], spineDir, V_UP); 
    }
    if (trackedBones[boneNameMap.Spine]) {
        rotateBoneToTarget(trackedBones[boneNameMap.Spine], spineDir, V_UP);
    }
    if (trackedBones[boneNameMap.Chest]) {
        rotateBoneToTarget(trackedBones[boneNameMap.Chest], spineDir, V_UP); 
    }

    if (trackedBones[boneNameMap.LeftUpperArm]) {
        const upperArmDir = tempVec1.copy(leftElbowPos).sub(leftShoulderPos).normalize();
        rotateBoneToTarget(trackedBones[boneNameMap.LeftUpperArm], upperArmDir);
    }
    if (trackedBones[boneNameMap.LeftLowerArm]) {
        const lowerArmDir = tempVec1.copy(leftWristPos).sub(leftElbowPos).normalize();
        rotateBoneToTarget(trackedBones[boneNameMap.LeftLowerArm], lowerArmDir);
    }

    if (trackedBones[boneNameMap.RightUpperArm]) {
        const upperArmDir = tempVec1.copy(rightElbowPos).sub(rightShoulderPos).normalize();
        rotateBoneToTarget(trackedBones[boneNameMap.RightUpperArm], upperArmDir);
    }
    if (trackedBones[boneNameMap.RightLowerArm]) {
        const lowerArmDir = tempVec1.copy(rightWristPos).sub(rightElbowPos).normalize();
        rotateBoneToTarget(trackedBones[boneNameMap.RightLowerArm], lowerArmDir);
    }

    if (trackedBones[boneNameMap.LeftUpperLeg]) {
        const upperLegDir = tempVec1.copy(leftKneePos).sub(leftHipPos).normalize();
        rotateBoneToTarget(trackedBones[boneNameMap.LeftUpperLeg], upperLegDir);
    }
    if (trackedBones[boneNameMap.LeftLowerLeg]) {
        const lowerLegDir = tempVec1.copy(leftAnklePos).sub(leftKneePos).normalize();
        rotateBoneToTarget(trackedBones[boneNameMap.LeftLowerLeg], lowerLegDir);
    }

    if (trackedBones[boneNameMap.RightUpperLeg]) {
        const upperLegDir = tempVec1.copy(rightKneePos).sub(rightHipPos).normalize();
        rotateBoneToTarget(trackedBones[boneNameMap.RightUpperLeg], upperLegDir);
    }
    if (trackedBones[boneNameMap.RightLowerLeg]) {
        const lowerLegDir = tempVec1.copy(rightAnklePos).sub(rightKneePos).normalize();
        rotateBoneToTarget(trackedBones[boneNameMap.RightLowerLeg], lowerLegDir);
    }

    if (skeletonRoot) {
        skeletonRoot.updateMatrixWorld(true);
    }
}

// --- Helper Functions ---

/**
 * Finds and stores references to trackable bones within the model.
 * @param {THREE.Object3D} model
 */
function findBones(model) {
    trackedBones = {};
    skeletonRoot = null; 
    initialPose.clear();

    model.traverse((object) => {
        if (object.isBone) {
            if (!skeletonRoot && object.parent && !object.parent.isBone) {
                if (object.parent === model || (object.parent.isObject3D && !object.parent.isBone)) {
                    skeletonRoot = object.parent; 
                    console.log("Skeleton Root identified:", skeletonRoot.name || skeletonRoot.type);
                }
            }
            for (const key in boneNameMap) {
                if (boneNameMap[key] === object.name) {
                    trackedBones[boneNameMap[key]] = object;
                    break; 
                }
            }
        }
        if (object.isSkinnedMesh && object.skeleton && !skeletonRoot) {
            console.log("Found SkinnedMesh, checking its skeleton bones:", object.name);
            object.skeleton.bones.forEach(bone => {
                for (const key in boneNameMap) {
                    if (boneNameMap[key] === bone.name && !trackedBones[boneNameMap[key]]) { 
                        trackedBones[boneNameMap[key]] = bone;
                    }
                }
            });
            if(!skeletonRoot) skeletonRoot = object;
        }

    });
    if (!skeletonRoot) skeletonRoot = model;
}

/**
 * Stores the initial local rotation and position of tracked bones.
 */
function storeInitialPose() {
    initialPose.clear();
    for (const name in trackedBones) {
        const bone = trackedBones[name];
        initialPose.set(name, {
            quaternion: bone.quaternion.clone(),
            position: bone.position.clone() 
        });
    }
}

/**
 * Resets tracked bones to their stored initial local pose.
 */
function resetToInitialPose() {
    if (initialPose.size === 0) return;
    for (const name in trackedBones) {
        const bone = trackedBones[name];
        const initial = initialPose.get(name);
        if (initial) {
            bone.quaternion.copy(initial.quaternion);
        }
    }
}

/**
 * Rotates a bone to align its local Z-axis towards a target direction.
 * @param {THREE.Bone} bone - The bone to rotate.
 * @param {THREE.Vector3} targetDirection - The world-space direction vector to point towards.
 * @param {THREE.Vector3} [upVector=V_UP] - An optional up vector hint for orientation.
 */
function rotateBoneToTarget(bone, targetDirection, upVector = V_UP) {
    if (!bone || targetDirection.lengthSq() < 0.001) return; 

    tempMatrix.identity(); 
    const parent = bone.parent; 
    if (parent) {
        parent.updateMatrixWorld(); 
        tempMatrix.copy(parent.matrixWorld).invert();
    }

    const localTargetDir = tempVec2.copy(targetDirection).transformDirection(tempMatrix).normalize();

    const boneAxis = V_UP.clone(); 

    tempQuat.setFromUnitVectors(boneAxis, localTargetDir);

    const initial = initialPose.get(bone.name);
    if (initial) {
        bone.quaternion.copy(initial.quaternion).multiply(tempQuat);
    } else {
        bone.quaternion.copy(tempQuat);
    }
}