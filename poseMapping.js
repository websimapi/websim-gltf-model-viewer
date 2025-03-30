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

// Helper Vectors & Quaternions (avoid re-creation)
const V_UP = Object.freeze(new THREE.Vector3(0, 1, 0)); // Make immutable
const V_FORWARD = Object.freeze(new THREE.Vector3(0, 0, 1)); // Make immutable
const tempVec1 = new THREE.Vector3();
const tempVec2 = new THREE.Vector3();
const tempVec3 = new THREE.Vector3();
const tempVec4 = new THREE.Vector3(); // Added for cross product
const tempQuat = new THREE.Quaternion();
const tempMatrix = new THREE.Matrix4();
const tempMatrixBone = new THREE.Matrix4();

// --- Bone Name Mapping (Crucial & Model-Dependent) ---
// This is a HIGHLY GENERIC example using Mixamo naming conventions.
// You WILL likely need to adjust these names based on the actual
// bone names in your loaded models (FBX/GLTF).
// Use console logging or the Skeleton UI to find the correct names.
const boneNameMap = {
    Hips: "mixamorigHips",
    Spine: "mixamorigSpine",
    Chest: "mixamorigSpine1", // Often Chest or Spine1
    UpperChest: "mixamorigSpine2", // Often UpperChest or Spine2
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
    LeftToeBase: "mixamorigLeftToeBase", // Optional: for foot rotation

    RightUpperLeg: "mixamorigRightUpLeg",
    RightLowerLeg: "mixamorigRightLeg",
    RightFoot: "mixamorigRightFoot",
    RightToeBase: "mixamorigRightToeBase", // Optional: for foot rotation
};

// Store bone objects found in the current model
let trackedBones = {};
let skeletonRoot = null; // The object containing the skeleton/bones
let initialPose = new Map(); // Stores initial local rotations/positions
let modelUpVector = V_UP.clone(); // Default assumption
let modelForwardVector = V_FORWARD.clone(); // Default assumption
let initialPoseStored = false;

// --- Core Mapping Function ---

/**
 * Applies the detected MediaPipe pose landmarks to the Three.js model's skeleton.
 * @param {THREE.Object3D} model - The loaded model containing the skeleton.
 * @param {Array<Object>} landmarks - Array of MediaPipe world landmark objects {x, y, z, visibility}.
 */
export function applyPoseToSkeleton(model, landmarks) {
    if (!model || !landmarks || landmarks.length === 0) {
        return; // No model or landmarks
    }

    // Find bones and store initial pose ONCE per model load or tracking start
    if (!initialPoseStored || trackedBones[boneNameMap.Hips]?.root !== model) {
         findBonesAndSetup(model); // Renamed for clarity
         if (!initialPoseStored) {
             console.error("Pose Mapping: Could not find essential bones or store initial pose. Mapping aborted.");
             return; // Stop if setup failed
         }
    }

    // Reset bones to initial pose before applying new rotations
    // This prevents cumulative rotation errors and acts as a base
    resetToInitialPose();

    // --- Landmark Processing ---
    // Convert MediaPipe landmarks (Right-handed Y-up) to THREE.js default (Right-handed Y-up)
    // MediaPipe world landmarks: +X right, +Y up, +Z forward (away from camera)
    // THREE.js default: +X right, +Y up, +Z towards camera
    // Negate Z for conversion. We might also need to scale.
    // Let's assume a scale factor for now, might need adjustment per model.
    const scale = 1.0; // Adjust if the model scale doesn't match landmark scale

    const getLandmarkPos = (index) => {
        const lm = landmarks[index];
        // Add visibility check? lm.visibility > 0.5 ?
        if (!lm) return null; // Return null if landmark missing
        // Correcting coordinate system: Negate Z
        return tempVec1.set(lm.x * scale, lm.y * scale, -lm.z * scale);
    };

    // Get all required landmark positions
    const hipL = getLandmarkPos(Landmark.LEFT_HIP);
    const hipR = getLandmarkPos(Landmark.RIGHT_HIP);
    const shoulderL = getLandmarkPos(Landmark.LEFT_SHOULDER);
    const shoulderR = getLandmarkPos(Landmark.RIGHT_SHOULDER);

    // Need at least hips and shoulders for basic torso alignment
    if (!hipL || !hipR || !shoulderL || !shoulderR) {
        // console.warn("Pose Mapping: Missing essential hip or shoulder landmarks.");
        return; // Cannot proceed without these
    }

    // Calculate reference points and directions
    const hipCenter = tempVec2.copy(hipL).add(hipR).multiplyScalar(0.5);
    const shoulderCenter = tempVec3.copy(shoulderL).add(shoulderR).multiplyScalar(0.5);
    const spineDir = tempVec4.copy(shoulderCenter).sub(hipCenter).normalize(); // Direction from hips to shoulders

    // --- Bone Rotation Application ---
    // We use lookAt logic: point a bone's axis towards a target direction.
    // We need to know which local axis of the bone points "forward" (e.g., along the bone length)
    // and which points "up". This often requires inspecting the model or guessing.
    // Common setup: Y-axis up, Z-axis forward (along bone).

    // Torso (Hips, Spine, Chest) - Align with the calculated spine direction
    rotateBone(boneNameMap.Hips, spineDir, modelUpVector);
    rotateBone(boneNameMap.Spine, spineDir, modelUpVector);
    rotateBone(boneNameMap.Chest, spineDir, modelUpVector); // Align Chest too for better posture
    // rotateBone(boneNameMap.UpperChest, spineDir, modelUpVector); // Optional: Align UpperChest as well

     // Arms
    const elbowL = getLandmarkPos(Landmark.LEFT_ELBOW);
    const wristL = getLandmarkPos(Landmark.LEFT_WRIST);
    if (elbowL) rotateBone(boneNameMap.LeftUpperArm, tempVec1.copy(elbowL).sub(shoulderL).normalize());
    if (elbowL && wristL) rotateBone(boneNameMap.LeftLowerArm, tempVec1.copy(wristL).sub(elbowL).normalize());
    // Hand rotation would need wrist + finger landmarks

    const elbowR = getLandmarkPos(Landmark.RIGHT_ELBOW);
    const wristR = getLandmarkPos(Landmark.RIGHT_WRIST);
    if (elbowR) rotateBone(boneNameMap.RightUpperArm, tempVec1.copy(elbowR).sub(shoulderR).normalize());
    if (elbowR && wristR) rotateBone(boneNameMap.RightLowerArm, tempVec1.copy(wristR).sub(elbowR).normalize());

     // Legs
    const kneeL = getLandmarkPos(Landmark.LEFT_KNEE);
    const ankleL = getLandmarkPos(Landmark.LEFT_ANKLE);
    if (kneeL) rotateBone(boneNameMap.LeftUpperLeg, tempVec1.copy(kneeL).sub(hipL).normalize());
    if (kneeL && ankleL) rotateBone(boneNameMap.LeftLowerLeg, tempVec1.copy(ankleL).sub(kneeL).normalize());
    // Foot rotation would need ankle + heel + toe landmarks

    const kneeR = getLandmarkPos(Landmark.RIGHT_KNEE);
    const ankleR = getLandmarkPos(Landmark.RIGHT_ANKLE);
    if (kneeR) rotateBone(boneNameMap.RightUpperLeg, tempVec1.copy(kneeR).sub(hipR).normalize());
    if (kneeR && ankleR) rotateBone(boneNameMap.RightLowerLeg, tempVec1.copy(ankleR).sub(kneeR).normalize());

    // --- Head --- (Optional, requires more landmarks)
     const nose = getLandmarkPos(Landmark.NOSE);
     // Could try aligning Neck/Head based on shoulderCenter to nose/ear direction
     // if (trackedBones[boneNameMap.Neck] && nose) {
     //     const headDir = tempVec1.copy(nose).sub(shoulderCenter).normalize();
     //     rotateBone(boneNameMap.Neck, headDir, spineDir); // Use spineDir as 'up' hint?
     // }
     // if (trackedBones[boneNameMap.Head] && nose) {
     //    const headDir = tempVec1.copy(nose).sub(shoulderCenter).normalize();
     //    rotateBone(boneNameMap.Head, headDir, spineDir);
     // }

    // Optional: Update world matrix manually if needed, though renderer usually handles this
    // if (skeletonRoot) {
    //     skeletonRoot.updateMatrixWorld(true);
    // }
}

// --- Helper Functions ---

/**
 * Finds trackable bones, identifies the skeleton root, and stores the initial pose.
 * Should be called once when a new model is loaded and tracking starts.
 * @param {THREE.Object3D} model
 */
function findBonesAndSetup(model) {
    console.log("Pose Mapping: Finding bones and storing initial pose...");
    trackedBones = {};
    skeletonRoot = null;
    initialPose.clear();
    initialPoseStored = false;
    let foundEssential = false; // Track if Hips/Spine found

    // Attempt to find the skeleton root automatically
    model.traverse((object) => {
        if (object.isSkinnedMesh && object.skeleton) {
            skeletonRoot = object; // Common case: SkinnedMesh holds skeleton
             console.log("Pose Mapping: Found skeleton root via SkinnedMesh:", object.name);
             // Find bones within this specific skeleton
             object.skeleton.bones.forEach(bone => {
                findAndStoreBone(bone, model); // Pass model as potential root reference
             });
             return; // Assume first skinned mesh contains the relevant skeleton
         }
         // Fallback: check for bones directly under the model root if no SkinnedMesh found yet
         if (!skeletonRoot && object.isBone && object.parent === model) {
             skeletonRoot = model; // Assume model itself is the root if bones are direct children
             console.log("Pose Mapping: Assuming model root contains bones directly.");
             // Need to traverse again from model root to get all bones in this case
             model.traverse(child => {
                 if (child.isBone) findAndStoreBone(child, model);
             });
             return;
         }
    });

    // If still no root found, traverse the whole model for any bone
    if (!skeletonRoot) {
         model.traverse((object) => {
             if (object.isBone) {
                 if (!skeletonRoot) {
                     // Find the highest-level bone's non-bone ancestor
                     let current = object;
                     while(current.parent && current.parent.isBone) {
                         current = current.parent;
                     }
                     skeletonRoot = current.parent || model; // Root is parent of top-level bone(s)
                     console.log("Pose Mapping: Found skeleton root via top-level bone:", skeletonRoot.name || "[Model Root]");
                 }
                 findAndStoreBone(object, skeletonRoot); // Store bone with found root
             }
         });
    }

    // Check if essential bones were found
    if (trackedBones[boneNameMap.Hips] || trackedBones[boneNameMap.Spine]) {
         foundEssential = true;
    } else {
         console.warn("Pose Mapping: Essential bones (Hips/Spine) not found in boneNameMap. Mapping might be incorrect.");
         // Attempt to find *any* bone to use as root if Hips/Spine missing
         if (!trackedBones[boneNameMap.Hips] && Object.keys(trackedBones).length > 0) {
             const firstBoneName = Object.keys(trackedBones)[0];
             console.warn(`Pose Mapping: Using fallback bone "${firstBoneName}" for root reference.`);
             // This is unlikely to work well but prevents complete failure
         }
    }

    // Store the initial pose if essential bones are present
    if (foundEssential || Object.keys(trackedBones).length > 0) { // Store if *any* bones found
        storeInitialPose();
        initialPoseStored = true;
        console.log("Pose Mapping: Initial pose stored for", initialPose.size, "bones.");
        // console.log("Tracked Bones:", trackedBones);
        // Determine model's orientation (assuming T-pose or A-pose)
        determineModelOrientation();
    } else {
        console.error("Pose Mapping: No trackable bones found using boneNameMap.");
    }
}

/** Helper to store a found bone and its root reference */
function findAndStoreBone(bone, root) {
     for (const key in boneNameMap) {
         if (boneNameMap[key] === bone.name && !trackedBones[boneNameMap[key]]) {
             bone.root = root; // Attach root reference for check in applyPoseToSkeleton
             trackedBones[boneNameMap[key]] = bone;
             // console.log(`Pose Mapping: Found bone "${bone.name}" mapped to ${key}`);
             break; // Found mapping for this bone
         }
     }
}

/** Stores the initial local rotation and position of tracked bones. */
function storeInitialPose() {
    initialPose.clear();
    for (const name in trackedBones) {
        const bone = trackedBones[name];
        if (bone) { // Ensure bone exists
             initialPose.set(name, {
                 quaternion: bone.quaternion.clone(),
                 position: bone.position.clone() // Store initial position too, though usually not modified
             });
        }
    }
}

/** Determines the model's likely Up and Forward vectors based on initial pose */
function determineModelOrientation() {
    // Try using Hips->Spine direction as Forward, and default Y as Up
    const hips = trackedBones[boneNameMap.Hips];
    const spine = trackedBones[boneNameMap.Spine];

    if (hips && spine) {
        hips.getWorldPosition(tempVec1); // World position of Hips
        spine.getWorldPosition(tempVec2); // World position of Spine
        modelForwardVector.subVectors(tempVec2, tempVec1).normalize();
         // Assume default Y is up for now. More complex checks possible (e.g., using shoulders)
         modelUpVector.set(0, 1, 0);
        console.log("Pose Mapping: Estimated model Forward:", modelForwardVector.toArray().map(n=>n.toFixed(2)));
    } else {
        // Fallback to defaults if Hips/Spine missing
        modelUpVector.set(0, 1, 0);
        modelForwardVector.set(0, 0, 1);
        console.log("Pose Mapping: Using default model orientation (Y-up, Z-forward).");
    }
    // Add check: if forward is too close to up, adjust up vector
    if (Math.abs(modelForwardVector.dot(modelUpVector)) > 0.95) {
        console.warn("Pose Mapping: Model forward vector is closely aligned with up vector. Adjusting Up to X-axis.");
        modelUpVector.set(1, 0, 0); // Try X-axis as up
    }
}

/** Resets tracked bones to their stored initial local pose. */
function resetToInitialPose() {
    if (!initialPoseStored || initialPose.size === 0) return;

    for (const name in trackedBones) {
        const bone = trackedBones[name];
        const initial = initialPose.get(name);
        if (bone && initial) { // Check both exist
            bone.quaternion.copy(initial.quaternion);
             // bone.position.copy(initial.position); // Usually don't reset position
        }
    }
}

/**
 * Rotates a bone to align its determined 'forward' axis towards a target direction.
 * Applies rotation relative to the bone's initial orientation.
 * @param {string} boneMappedName - The mapped name from boneNameMap (e.g., "mixamorigLeftArm").
 * @param {THREE.Vector3} targetDirection - The world-space direction vector to point towards.
 * @param {THREE.Vector3} [upHint=modelUpVector] - An optional world-space up vector hint for orientation.
 */
function rotateBone(boneMappedName, targetDirection, upHint = modelUpVector) {
    const bone = trackedBones[boneMappedName];
    const initial = initialPose.get(boneMappedName);

    // Basic checks
    if (!bone || !initial || targetDirection.lengthSq() < 0.0001) {
         // If targetDirection is zero, maybe keep initial rotation? Or log warning.
         // console.warn(`Skipping rotation for ${boneMappedName}: Missing bone, initial pose, or zero target direction.`);
        return;
    }

    // --- Calculate Target Rotation in World Frame ---
    // Create a rotation matrix that aligns default Z-forward, Y-up to the targetDirection and upHint
    tempMatrix.lookAt(targetDirection, tempVec1.set(0,0,0), upHint); // Position is origin, target is direction vector
    const targetWorldQuaternion = tempQuat.setFromRotationMatrix(tempMatrix);

    // --- Calculate Rotation in Parent Bone's Frame ---
    // We need to convert the world target rotation into the local rotation relative to the parent bone.
    const parent = bone.parent;
    if (parent) {
        parent.updateMatrixWorld(); // Ensure parent matrix is up-to-date
        tempMatrix.copy(parent.matrixWorld).invert(); // Get inverse world matrix of parent
        tempQuat.setFromRotationMatrix(tempMatrix); // Convert inverse matrix to quaternion
        targetWorldQuaternion.premultiply(tempQuat); // Apply parent's inverse world rotation
    }
    // targetWorldQuaternion now represents the desired local rotation relative to the parent

    // --- Apply Rotation relative to Initial Pose ---
    // The goal is: finalLocalRotation = initialLocalRotation * deltaRotation
    // We calculated the desired finalLocalRotation (targetWorldQuaternion in local frame)
    // So, deltaRotation = initialLocalRotation.inverse() * finalLocalRotation
    tempQuat.copy(initial.quaternion).invert(); // Inverse of initial rotation
    bone.quaternion.copy(targetWorldQuaternion).premultiply(tempQuat); // Apply delta: New = Initial * Delta = Initial * (Initial^-1 * Target) = Target

    // Constraint checks (optional)
    // Add limits if needed, e.g., clamp rotations for elbows/knees
}

/**
 * Resets the internal state of the pose mapper (tracked bones, initial pose).
 * Call this when loading a new model or stopping tracking.
 */
export function resetPoseMapping() {
    console.log("Pose Mapping: Resetting internal state.");
    trackedBones = {};
    skeletonRoot = null;
    initialPose.clear();
    initialPoseStored = false;
    // Reset orientation vectors to default? Or keep last known? Resetting is safer.
    modelUpVector.set(0, 1, 0);
    modelForwardVector.set(0, 0, 1);
}