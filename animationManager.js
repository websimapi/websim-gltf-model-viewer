/**
 * Animation Manager Module
 * Handles THREE.AnimationMixer, playing animations, and recording/creating
 * new AnimationClips from pose data.
 */
import * as THREE from 'three';
import config from './config.js';
import {
    populateAnimationSelect,
    displayAnimationDetails,
    clearAnimationUI,
    clearAnimationDetails,
    updateRecordingUI
} from './ui.js';

let mixer = null;
let currentAction = null;
let currentAnimations = []; 
let recordedPoseData = [];
let isRecording = false;
let associatedModel = null; 

/**
 * Initializes or re-initializes the AnimationMixer for a given model.
 * @param {THREE.Object3D} model - The model to associate the mixer with.
 */
export function initMixerForModel(model) {
    if (mixer) {
        stopAllAnimations(); 
        try {
            if (associatedModel) mixer.uncacheRoot(associatedModel);
        } catch (e) {
            console.warn("Error during mixer uncache:", e);
        }
        mixer = null;
    }
    associatedModel = model;
    mixer = new THREE.AnimationMixer(model);
    console.log("AnimationMixer initialized for model:", model.name);
}

/**
 * Sets the available animations for the current model.
 * @param {THREE.AnimationClip[]} animations - Array of animation clips.
 */
export function setAnimations(animations) {
    currentAnimations = animations || [];
    populateAnimationSelect(currentAnimations);

    if (currentAnimations.length > 0) {
        playAnimation(currentAnimations[0]); 
        displayAnimationDetails(currentAnimations[0]);
    } else {
        clearAnimationUI(); 
        if (mixer) {
             stopAllAnimations(); 
        }
    }
}

/**
 * Plays a specific animation clip.
 * @param {THREE.AnimationClip} clip - The clip to play.
 * @param {boolean} forceReset - If true, resets the animation even if it's the same clip.
 */
export function playAnimation(clip, forceReset = false) {
    if (!mixer || !clip)) {
        console.warn("Mixer or Animation Clip not available for playback.", { mixer, clip });
        return;
    }

    if (!forceReset && currentAction && currentAction.getClip() === clip && currentAction.isRunning()) {
        console.log("Animation already playing:", clip.name);
        displayAnimationDetails(clip); 
        return;
    }

    if (currentAction) {
        if (currentAction.getClip() === clip) {
            currentAction.stop();
        } else {
             currentAction.fadeOut(config.animationFadeDuration);
        }
    }

    const newAction = mixer.clipAction(clip);

    newAction
        .reset() 
        .setEffectiveTimeScale(1) 
        .setEffectiveWeight(1) 
        .fadeIn(config.animationFadeDuration) 
        .play(); 

    currentAction = newAction;
    console.log("Playing animation:", clip.name);
    displayAnimationDetails(clip); 
}

/**
 * Plays an animation based on its index in the currentAnimations array.
 * @param {number} index - The index of the animation to play.
 */
export function playAnimationByIndex(index) {
     if (index >= 0 && index < currentAnimations.length) {
        playAnimation(currentAnimations[index]);
    } else {
         console.warn("Invalid animation index:", index);
         clearAnimationDetails();
         stopAllAnimations();
    }
}

/**
 * Stops the currently playing animation and fades it out.
 */
export function stopAllAnimations() {
    if (currentAction) {
        currentAction.fadeOut(config.animationFadeDuration);
        currentAction = null; 
        console.log("Stopping current animation.");
    }
    clearAnimationDetails();
}

/**
 * Resets the animation state (mixer, current action, UI).
 */
export function resetAnimationSystem() {
    stopAllAnimations();
    if (mixer) {
       try {
           if (associatedModel) mixer.uncacheRoot(associatedModel);
       } catch(e) { console.warn("Error un-caching mixer root:", e); }
    }
    mixer = null;
    currentAction = null;
    currentAnimations = [];
    associatedModel = null;
    recordedPoseData = [];
    isRecording = false;
    clearAnimationUI(); 
    updateRecordingUI(false, false); 
    console.log("Animation system reset.");
}

// --- Recording Logic ---

/** Toggles the recording state */
export function toggleRecording(isTrackingActive) {
     if (!isTrackingActive) {
        console.error("Start webcam tracking before recording."); 
        return false; 
    }
     if (!associatedModel) {
         console.error("Cannot record: No model associated with the animation manager.");
         return false; 
    }

    isRecording = !isRecording;
    updateRecordingUI(isRecording, true);

    if (isRecording) {
        recordedPoseData = []; 
        console.log("Recording started.");
        // Initial frame capture might happen immediately via onPoseResults
    } else {
        console.log(`Recording stopped. Captured ${recordedPoseData.length} frames.`);
        createAnimationClipFromRecording();
    }
    return isRecording; 
}

/**
 * Captures the current pose of the associated model's bones.
 * @param {THREE.Clock} clock - The main clock to get elapsed time.
 */
export function capturePoseFrame(clock) {
    if (!isRecording || !associatedModel || !clock) return;

    const frameData = {
        time: clock.getElapsedTime(), 
        bones: []
    };

    // Traverse the *associated model* to find bones
    associatedModel.traverse((object) => {
        if (object.isBone) {
            frameData.bones.push({
                name: object.name, 
                position: object.position.clone(),
                quaternion: object.quaternion.clone(),
                // Optional: scale: object.scale.clone(),
            });
        }
    });
    recordedPoseData.push(frameData);
}

/** Creates a THREE.AnimationClip from the recorded pose data. */
function createAnimationClipFromRecording() {
    if (recordedPoseData.length < 2) {
        console.warn("Not enough frames recorded (< 2) to create an animation clip.");
        recordedPoseData = []; 
        return;
    }

    const tracks = [];
    const firstFrame = recordedPoseData[0];
    const startTime = firstFrame.time; 
    const duration = recordedPoseData[recordedPoseData.length - 1].time - startTime;

    if (duration <= 0) {
         console.warn("Recording duration is zero or negative. Cannot create clip.");
         recordedPoseData = []; 
         return;
    }


    // Group data by bone name first
    const boneDataMap = new Map();
    recordedPoseData.forEach(frame => {
        const time = Math.max(0, frame.time - startTime); 
        frame.bones.forEach(boneState => {
            if (!boneDataMap.has(boneState.name)) {
                boneDataMap.set(boneState.name, { times: [], positions: [], quaternions: [] });
            }
            const data = boneDataMap.get(boneState.name);
            data.times.push(time);
            data.positions.push(boneState.position.x, boneState.position.y, boneState.position.z);
            data.quaternions.push(boneState.quaternion.x, boneState.quaternion.y, boneState.quaternion.z, boneState.quaternion.w);
        });
    });

    // Create tracks for each bone that had data
    boneDataMap.forEach((data, boneName) => {
        if (data.times.length > 0) {
            const positionTrackName = `${boneName}.position`;
            const quaternionTrackName = `${boneName}.quaternion`;
            // const scaleTrackName = `${boneName}.scale`; 

            const posTrack = new THREE.VectorKeyframeTrack(positionTrackName, data.times, data.positions);
            tracks.push(posTrack);

            const quatTrack = new THREE.QuaternionKeyframeTrack(quaternionTrackName, data.times}`, data.quaternions, THREE.InterpolateLinear);
            tracks.push(quatTrack);

        } else {
            console.warn(`No keyframes captured for bone: ${boneName}`);
        }
    });

    if (tracks.length === 0) {
        console.warn("No valid bone tracks generated from recording.");
        recordedPoseData = []; 
        return;
    }

    // Sanitize clip name
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const clipName = `Recorded Pose ${timestamp}`;
    const clip = new THREE.AnimationClip(clipName, duration, tracks);

    console.log("Created AnimationClip:", clip);

    // Add the new clip to the list and update UI
    currentAnimations.push(clip);
    populateAnimationSelect(currentAnimations); 
    const newClipIndex = currentAnimations.length - 1;
    playAnimationByIndex(newClipIndex); 

    // Reset recording state
    recordedPoseData = []; 
    isRecording = false; 
    updateRecordingUI(false, true); 

    const animationSelect = document.getElementById('animationSelect');
    if (animationSelect) {
        animationSelect.value = newClipIndex;
    }
}

/** Returns if recording is currently active */
export function isRecordingActive() {
    return isRecording;
}

/** Gets the current animation clips array */
export function getCurrentAnimations() {
    return currentAnimations;
}

/** Gets the currently playing action */
export function getCurrentAction() {
    return currentAction;
}

/** Gets the animation mixer instance */
export function getMixer() {
    return mixer;
}