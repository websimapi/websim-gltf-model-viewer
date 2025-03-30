import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import config from './config.js';
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
import { applyPoseToSkeleton } from './poseMapping.js'; 

let scene, camera, renderer, clock, mixer, currentModel, currentAction;
let controls;
let currentAnimations = [];
const modelInput = document.getElementById('modelInput');
const animationSelect = document.getElementById('animationSelect');
const toggleWebcamButton = document.getElementById('toggleWebcamButton');
const recordAnimationButton = document.getElementById('recordAnimationButton');

let originalGltfData = null;
let isTracking = false;
let isRecording = false;
let recordedPoseData = []; 
let skeletonHelper; 

async function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(config.backgroundColor);

    camera = new THREE.PerspectiveCamera(config.cameraFov, window.innerWidth / window.innerHeight, config.cameraNear, config.cameraFar);
    camera.position.set(config.initialCameraPosition.x, config.initialCameraPosition.y, config.initialCameraPosition.z);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = config.controlsDampingFactor;
    controls.screenSpacePanning = false;
    controls.minDistance = config.controlsMinDistance;
    controls.maxDistance = config.controlsMaxDistance;
    controls.target.set(config.initialControlsTarget.x, config.initialControlsTarget.y, config.initialControlsTarget.z);
    controls.update();

    const hemiLight = new THREE.HemisphereLight(config.hemiLightSkyColor, config.hemiLightGroundColor, config.hemiLightIntensity);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(config.dirLightColor, config.dirLightIntensity);
    dirLight.position.set(config.dirLightPosition.x, config.dirLightPosition.y, config.dirLightPosition.z);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = config.shadowMapSize;
    dirLight.shadow.mapSize.height = config.shadowMapSize;
    dirLight.shadow.camera.top = config.shadowCameraSize;
    dirLight.shadow.camera.bottom = -config.shadowCameraSize;
    dirLight.shadow.camera.left = -config.shadowCameraSize;
    dirLight.shadow.camera.right = config.shadowCameraSize;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 50;
    scene.add(dirLight);

    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshPhongMaterial({ color: config.groundColor, depthWrite: false })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    try {
        await setupBodyTracking(onPoseResults);
        console.log("Body tracking initialized.");
    } catch (error) {
        console.error("Failed to initialize body tracking:", error);
        showError("Failed to initialize body tracking. Webcam features disabled.");
        updateTrackingUI(false, false, "Error initializing tracker."); 
    }

    window.addEventListener('resize', onWindowResize);
    modelInput.addEventListener('change', handleFileSelect);
    animationSelect.addEventListener('change', playSelectedAnimation);
    toggleWebcamButton.addEventListener('click', toggleWebcamTracking);
    recordAnimationButton.addEventListener('click', toggleRecording);

    clearModelInfoUI(); 
    updateTrackingUI(false, false); 
    updateRecordingUI(false); 
    animate();
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.gltf') && !fileName.endsWith('.glb') && !fileName.endsWith('.fbx')) {
        showError('Unsupported file type. Please load a .gltf, .glb, or .fbx file.');
        modelInput.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const contents = e.target.result;
        loadModel(contents, fileName);
    };
    reader.onerror = (e) => {
         console.error("FileReader error:", e);
         showError('Error reading file.');
         hideLoading();
    }

    showLoading();
    clearScene(); 
    showError('');
    originalGltfData = null;
    isTracking = false; 
    isRecording = false; 
    updateTrackingUI(false, false); 
    updateRecordingUI(false); 
    stopWebcam(); 

    if (fileName.endsWith('.glb') || fileName.endsWith('.fbx')) {
        reader.readAsArrayBuffer(file);
    } else {
        reader.readAsText(file);
    }
}

function loadModel(data, fileName) {
    const loadStartTime = performance.now();
    let loader;
    let isGltf = false;

    const setupModel = (model, animations = [], extraData = null) => {
        console.log(`Model "${fileName}" loaded in ${(performance.now() - loadStartTime).toFixed(2)} ms`);
        currentModel = model;
        currentAnimations = animations;
        originalGltfData = isGltf ? extraData : null;

        scene.add(currentModel);

        const skinnedMeshes = [];
        const meshes = [];
        const materials = new Set(); 
        let totalVertices = 0;
        let totalFaces = 0; 
        let rootBones = []; 

        currentModel.traverse((child) => {
            if (child.isMesh) {
                meshes.push(child);
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.geometry) {
                    const geometry = child.geometry;
                    if (geometry.attributes.position) {
                        totalVertices += geometry.attributes.position.count;
                    }
                    if (geometry.index) {
                        totalFaces += geometry.index.count / 3;
                    } else if (geometry.attributes.position) {
                        totalFaces += geometry.attributes.position.count / 3; 
                    }
                }
                 materials.add(child.material);
            }
            if (child.isSkinnedMesh) {
                skinnedMeshes.push(child);
                if (child.skeleton) {
                     child.skeleton.bones.forEach(bone => {
                        if (!bone.parent || !bone.parent.isBone || bone.parent === currentModel) {
                            if (!rootBones.some(root => root.uuid === bone.uuid)) {
                                rootBones.push(bone);
                            }
                         }
                     });
                 }
            }
        });

        let hasSkeleton = false;
        currentModel.traverse((child) => {
             if (child.isSkinnedMesh && child.skeleton) {
                 hasSkeleton = true;
             }
        });

        updateTrackingUI(false, hasSkeleton);

        displayGeneralInfo(fileName, meshes, materials, totalVertices, totalFaces, originalGltfData);
        displaySkeletonInfo(rootBones);
        displaySkinningInfo(skinnedMeshes);

        if (currentAnimations && currentAnimations.length > 0) {
            mixer = new THREE.AnimationMixer(currentModel);
            populateAnimationSelect(currentAnimations);
            playAnimation(currentAnimations[0]);
            displayAnimationDetails(currentAnimations[0]);
        } else {
            console.log("No animations found in the model.");
            clearAnimationUI();
            mixer = null;
        }

        centerAndFocusCamera();
        hideLoading();
        modelInput.value = '';
    };

    const handleLoadError = (error) => {
         console.error(`An error happened during loading of "${fileName}":`, error);
         let errorMsg = `Error loading model: ${error.message || 'Unknown error'}.`;
         if (error.message && error.message.includes('Unexpected token') && typeof data === 'string') {
             errorMsg += ' This might be an invalid text GLTF file (check JSON).';
        } else if (error.message && error.message.includes('Magic')) {
             errorMsg += ' This might indicate a corrupt binary file (GLB/FBX).';
        }
        showError(errorMsg + ' Check console for details.'); 
        hideLoading();
        modelInput.value = '';
    };

    clearScene();

    if (fileName.endsWith('.gltf') || fileName.endsWith('.glb')) {
        loader = new GLTFLoader();
        isGltf = true;
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath(config.dracoDecoderPath);
        loader.setDRACOLoader(dracoLoader);

        try {
            loader.parse(data, '', (gltf) => {
                setupModel(gltf.scene, gltf.animations, gltf);
            }, handleLoadError);
        } catch (error) {
            handleLoadError(error);
        }

    } else if (fileName.endsWith('.fbx')) {
        loader = new FBXLoader();
        isGltf = false;
        try {
            const fbxModel = loader.parse(data, '');
            const modelToAdd = fbxModel.isGroup ? fbxModel : new THREE.Group().add(fbxModel);
            setupModel(modelToAdd, fbxModel.animations); 
        } catch(error) {
             handleLoadError(error);
        }
    }
}

function centerAndFocusCamera() {
    if (!currentModel) return;

    const box = new THREE.Box3().setFromObject(currentModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    if (!isFinite(maxDim) || maxDim <= 0) {
        console.warn("Model has invalid bounds or zero dimensions. Using default camera positioning.");
        camera.position.set(config.initialCameraPosition.x, config.initialCameraPosition.y, config.initialCameraPosition.z);
        controls.target.set(config.initialControlsTarget.x, config.initialControlsTarget.y, config.initialControlsTarget.z);
        controls.update();
        return;
    }

    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ = Math.max(cameraZ, size.y / 2); 
    cameraZ *= config.cameraFocusZoomFactor; 

    cameraZ = Math.max(cameraZ, config.cameraFocusMinDistance);

    camera.position.set(
        center.x,
        center.y + size.y * config.cameraFocusVerticalOffsetFactor, 
        center.z + cameraZ 
    );

    controls.target.copy(center);
    controls.update(); 
}

function playSelectedAnimation() {
    if (!mixer) return;

    const selectedIndex = parseInt(animationSelect.value, 10);
    if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < currentAnimations.length) {
        const clip = currentAnimations[selectedIndex];
        playAnimation(clip);
        displayAnimationDetails(clip); 
    } else if (currentAnimations.length > 0) {
        console.warn("Invalid animation selection index:", animationSelect.value);
        clearAnimationUI(true); 
    }
}

function playAnimation(clip) {
    if (!mixer || !clip) {
        console.warn("Mixer or Animation Clip not available for playback.");
        return;
    }

    if (currentAction) {
        currentAction.fadeOut(config.animationFadeDuration);
    }

    const newAction = mixer.clipAction(clip);
    newAction
        .reset() 
        .setEffectiveTimeScale(1) 
        .setEffectiveWeight(1) 
        .fadeIn(config.animationFadeDuration) 
        .play(); 

    currentAction = newAction;
}

async function toggleWebcamTracking() {
    if (!currentModel) {
        showError("Load a model before starting webcam tracking.");
        return;
    }

    isTracking = !isTracking;
    updateTrackingUI(isTracking, true); 
    updateRecordingUI(isRecording, isTracking); 

    if (isTracking) {
        try {
            await startWebcam();
            console.log("Webcam started.");
            controls.enabled = false; 
            if (currentAction) {
                currentAction.stop();
                mixer?.stopAllAction(); 
                currentAction = null;
                animationSelect.value = ''; 
                clearAnimationDetails();
            }
            animationSelect.disabled = true; 
        } catch (error) {
            console.error("Failed to start webcam:", error);
            showError(`Failed to start webcam: ${error.message}`);
            isTracking = false;
            updateTrackingUI(false, true); 
            updateRecordingUI(false, false); 
            controls.enabled = true; 
            animationSelect.disabled = !(currentAnimations && currentAnimations.length > 0);
        }
    } else {
        stopWebcam();
        console.log("Webcam stopped.");
        isRecording = false; 
        updateRecordingUI(false, false); 
        controls.enabled = true;
        animationSelect.disabled = !(currentAnimations && currentAnimations.length > 0);
    }
}

function onPoseResults(landmarks) {
    if (!isTracking || !currentModel || !landmarks) return;

    applyPoseToSkeleton(currentModel, landmarks);

    if (isRecording) {
        capturePoseFrame();
    }
}

function toggleRecording() {
    if (!isTracking) {
        showError("Start webcam tracking before recording.");
        return;
    }

    isRecording = !isRecording;
    updateRecordingUI(isRecording, true);

    if (isRecording) {
        recordedPoseData = []; 
        console.log("Recording started.");
        capturePoseFrame();
    } else {
        console.log(`Recording stopped. Captured ${recordedPoseData.length} frames.`);
        createAnimationClipFromRecording();
    }
}

function capturePoseFrame() {
    if (!currentModel) return;

    const frameData = {
        time: clock.elapsedTime, 
        bones: []
    };

    currentModel.traverse((object) => {
        if (object.isBone) {
            frameData.bones.push({
                name: object.name,
                position: object.position.clone(),
                quaternion: object.quaternion.clone(),
            });
        }
    });
    recordedPoseData.push(frameData);
}

function createAnimationClipFromRecording() {
    if (recordedPoseData.length < 2) {
        console.warn("Not enough frames recorded to create an animation clip.");
        recordedPoseData = []; 
        return;
    }

    const tracks = [];
    const firstFrame = recordedPoseData[0];
    const startTime = firstFrame.time;
    const duration = recordedPoseData[recordedPoseData.length - 1].time - startTime;

    firstFrame.bones.forEach(boneData => {
        const positionTimes = [];
        const positionValues = [];
        const quaternionTimes = [];
        const quaternionValues = [];

        recordedPoseData.forEach(frame => {
            const boneInFrame = frame.bones.find(b => b.name === boneData.name);
            if (boneInFrame) {
                const time = frame.time - startTime; 

                positionTimes.push(time);
                positionValues.push(boneInFrame.position.x, boneInFrame.position.y, boneInFrame.position.z);

                quaternionTimes.push(time);
                quaternionValues.push(boneInFrame.quaternion.x, boneInFrame.quaternion.y, boneInFrame.quaternion.z, boneInFrame.quaternion.w);
            }
        });

        if (positionTimes.length > 0) {
            const posTrack = new THREE.VectorKeyframeTrack(`${boneData.name}.position`, positionTimes, positionValues);
            tracks.push(posTrack);
        }
        if (quaternionTimes.length > 0) {
            const quatTrack = new THREE.QuaternionKeyframeTrack(`${boneData.name}.quaternion`, quaternionTimes, quaternionValues);
            tracks.push(quatTrack);
        }
    });

    if (tracks.length === 0) {
        console.warn("No valid bone tracks generated from recording.");
        recordedPoseData = [];
        return;
    }

    const clip = new THREE.AnimationClip(`Recorded Pose ${Date.now()}`, duration, tracks);
    console.log("Created AnimationClip:", clip);

    if (!currentAnimations) currentAnimations = [];
    currentAnimations.push(clip);

    if (!mixer && currentModel) {
        mixer = new THREE.AnimationMixer(currentModel); 
    }

    populateAnimationSelect(currentAnimations); 
    animationSelect.value = currentAnimations.length - 1; 
    playSelectedAnimation(); 
    recordedPoseData = []; 

    updateRecordingUI(false, isTracking);
}

function clearScene() {
    if (isTracking) {
         toggleWebcamTracking(); 
     }
     isRecording = false;
     recordedPoseData = [];

    if (skeletonHelper) {
         scene.remove(skeletonHelper);
         skeletonHelper = null;
     }

    if (currentAction) {
        currentAction.stop();
        currentAction = null;
    }
    if (mixer) {
         mixer.stopAllAction();
         try {
             if (currentModel) mixer.uncacheRoot(currentModel);
         } catch (e) {
            console.warn("Error during mixer uncache:", e);
         }
         mixer = null;
     }

    if (currentModel) {
        scene.remove(currentModel);

        currentModel.traverse((object) => {
            if (object.isMesh) {
                if (object.geometry) {
                    object.geometry.dispose();
                }

                if (object.material) {
                    if (Array.isArray(object.material)) {
                         object.material.forEach(material => cleanMaterial(material));
                    } else {
                         cleanMaterial(object.material);
                    }
                }
            } else if (object.isLight) {
                 if(object.shadow && object.shadow.map) {
                     object.shadow.map.dispose();
                 }
            }
        });

        console.log("Previous model resources disposed.");
        currentModel = null;
    }

    originalGltfData = null;
    currentAnimations = [];
    clearAnimationUI(); 
    clearModelInfoUI(); 
    updateTrackingUI(false, false); 
    updateRecordingUI(false); 

    if (typeof window.gc === 'function') {
        window.gc();
    }

    console.log("Scene cleared. Renderer info:", renderer.info.memory);
}

function cleanMaterial(material) {
    if (!material) return;
    material.dispose();

    for (const key of Object.keys(material)) {
        const value = material[key];
        if (value && typeof value === 'object' && typeof value.dispose === 'function' && value.isTexture) {
            value.dispose();
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    renderLoop();
}

function renderLoop() {
    const delta = clock.getDelta();

    if (mixer && !isTracking) { 
        mixer.update(delta);
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