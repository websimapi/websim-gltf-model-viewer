import * as THREE from 'three';
import config from './config.js';
import {
    initScene,
    initLighting,
    initGround,
    initControls,
    onWindowResize as handleWindowResize, 
    disposeSceneElements
} from './sceneSetup.js';
import {
    initLoaders,
    handleFileSelect as handleModelFileSelect, 
    centerAndFocusCamera,
    clearScene as clearModelFromScene, 
    getCurrentModel
} from './modelLoader.js';
import {
    initMixerForModel,
    setAnimations,
    playAnimationByIndex,
    updateMixer,
    resetAnimationSystem,
    toggleRecording as toggleAnimationRecording, 
    capturePoseFrame,
    isRecordingActive,
    stopAllAnimations,
    getCurrentAnimations,
    getCurrentAction, 
    getMixer 
} from './animationManager.js';
import {
    displayGeneralInfo,
    displaySkeletonInfo,
    displaySkinningInfo,
    clearModelInfoUI,
    populateAnimationSelect,
    displayAnimationDetails,
    clearAnimationUI,
    showError,
    showLoading,
    hideLoading,
    updateTrackingUI,
    updateRecordingUI
} from './ui.js';
import { setupBodyTracking, startWebcam, stopWebcam, getLatestPose } from './bodyTracking.js';
import { applyPoseToSkeleton, resetPoseMapping } from './poseMapping.js'; 

let scene, camera, renderer, clock, controls;
let isTracking = false;
let skeletonHelper; 

const modelInput = document.getElementById('modelInput');
const animationSelect = document.getElementById('animationSelect');
const toggleWebcamButton = document.getElementById('toggleWebcamButton');
const recordAnimationButton = document.getElementById('recordAnimationButton');

async function init() {
    const sceneObjects = initScene();
    scene = sceneObjects.scene;
    camera = sceneObjects.camera;
    renderer = sceneObjects.renderer;

    initLighting(scene);
    initGround(scene);
    controls = initControls(camera, renderer.domElement);
    clock = new THREE.Clock();

    initLoaders();

    try {
        await setupBodyTracking(onPoseResults);
        console.log("Body tracking initialized.");
        updateTrackingUI(false, false, "Tracking ready. Load a rigged model.");
    } catch (error) {
        console.error("Failed to initialize body tracking:", error);
        updateTrackingUI(false, false, "Error initializing tracker. Features disabled.");
    }

    window.addEventListener('resize', handleWindowResize);
    modelInput.addEventListener('change', (event) => handleModelFileSelect(event, scene, onModelLoaded, onBeforeLoadModel));
    animationSelect.addEventListener('change', handleAnimationSelectChange);
    toggleWebcamButton.addEventListener('click', handleToggleWebcam);
    recordAnimationButton.addEventListener('click', handleToggleRecording);

    clearModelInfoUI();
    clearAnimationUI();
    updateTrackingUI(false, false); 
    updateRecordingUI(false, false); 

    animate();
    console.log("Initialization complete. Application started.");
}

function onBeforeLoadModel() {
    console.log("Preparing to load new model...");
    if (isTracking) {
        handleToggleWebcam(); 
    }
    resetAnimationSystem();
    resetPoseMapping(); 

    clearModelFromScene();
    disposeSceneElements();
}

function onModelLoaded({ model, animations, fileName, gltfData }) {
    console.log(`Model "${fileName}" loaded successfully.`);

    initMixerForModel(model); 
    setAnimations(animations); 

    const modelInfo = { hasSkeleton: false }; 
    model.traverse(node => { if (node.isSkinnedMesh || node.isBone) modelInfo.hasSkeleton = true; });
    updateTrackingUI(isTracking, modelInfo.hasSkeleton); 
    updateRecordingUI(isRecordingActive(), isTracking && modelInfo.hasSkeleton); 

    centerAndFocusCamera(model, camera, controls);
}

function handleAnimationSelectChange() {
    const selectedIndex = parseInt(animationSelect.value, 10);
    if (!isNaN(selectedIndex)) {
        if (isTracking) {
             console.log("Switching from tracking to playing selected animation.");
             stopTracking(); 
        }
         playAnimationByIndex(selectedIndex);
    }
}

async function handleToggleWebcam() {
    const model = getCurrentModel();
    if (!model) {
        showError("Load a model before starting webcam tracking.");
        return;
    }
    let hasSkeleton = false;
    model.traverse(node => { if (node.isSkinnedMesh || node.isBone) hasSkeleton = true; });
    if (!hasSkeleton) {
         showError("Loaded model does not appear to have a skeleton for tracking.");
         return;
    }

    if (isTracking) {
        stopTracking();
    } else {
        await startTracking();
    }
}

async function startTracking() {
    try {
        await startWebcam(); 
        isTracking = true;
        console.log("Webcam started. Tracking enabled.");
        updateTrackingUI(true, true); 
        updateRecordingUI(isRecordingActive(), true); 
        controls.enabled = false; 
        stopAllAnimations(); 
        animationSelect.disabled = true; 
        animationSelect.value = ''; 
        clearAnimationDetails(); 
        resetPoseMapping(); 

    } catch (error) {
        console.error("Failed to start webcam:", error);
        isTracking = false;
        updateTrackingUI(false, true); 
        updateRecordingUI(false, false); 
        controls.enabled = true; 
        animationSelect.disabled = !(getCurrentAnimations() && getCurrentAnimations().length > 0); 
    }
}

function stopTracking() {
     if (!isTracking) return; 

     stopWebcam(); 
     isTracking = false;
     console.log("Webcam stopped. Tracking disabled.");

     if (isRecordingActive()) {
         toggleAnimationRecording(false); 
     }

     updateTrackingUI(false, true); 
     updateRecordingUI(false, false); 
     controls.enabled = true; 
     animationSelect.disabled = !(getCurrentAnimations() && getCurrentAnimations().length > 0); 
}

function handleToggleRecording() {
    const currentRecordingState = toggleAnimationRecording(isTracking);
    if (currentRecordingState) {
        console.log("Main: Recording started via toggle.");
    } else {
        console.log("Main: Recording stopped via toggle.");
    }
}

function onPoseResults(landmarks) {
    if (!isTracking) return; 

    const model = getCurrentModel();
    if (model && landmarks) {
        applyPoseToSkeleton(model, landmarks);

        if (isRecordingActive()) {
            capturePoseFrame(clock); 
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    renderLoop();
}

function renderLoop() {
    const delta = clock.getDelta();

    if (getMixer() && !isTracking) {
        updateMixer(delta);
    }

    if (controls.enabled) {
        controls.update();
    }

    renderer.render(scene, camera);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init(); 
}

window.addEventListener('error', function (event) {
    if (event.message.includes('ResizeObserver loop limit exceeded')) {
        return; 
    }
     if (event.filename && (event.filename.includes('main.js') || event.filename.includes('sceneSetup.js'))) {
         console.error("Critical Script Error:", event.message, "at", event.filename, ":", event.lineno);
         showError(`Critical script error: ${event.message}. App may not function.`);
         hideLoading();
     }
});