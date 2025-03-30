import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js'; 
import config from './config.js'; 

let scene, camera, renderer, clock, mixer, currentModel, currentAction;
let controls; 
let currentAnimations = [];
const modelInput = document.getElementById('modelInput');
const animationSelect = document.getElementById('animationSelect');
const errorMessageDiv = document.getElementById('error-message');
const loadingIndicator = document.getElementById('loading-indicator');

// --- Initialization ---

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(config.backgroundColor);
    // scene.fog = new THREE.Fog(config.fogColor, config.fogNear, config.fogFar);

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

    window.addEventListener('resize', onWindowResize);
    modelInput.addEventListener('change', handleFileSelect);
    animationSelect.addEventListener('change', playSelectedAnimation);

    animate();
}

// --- File Handling & Loading ---

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

    if (fileName.endsWith('.glb') || fileName.endsWith('.fbx')) {
        reader.readAsArrayBuffer(file);
    } else { 
        reader.readAsText(file);
    }
}

function loadModel(data, fileName) {
    const loadStartTime = performance.now();
    let loader;

    const setupModel = (model, animations = []) => {
        console.log(`Model "${fileName}" loaded in ${(performance.now() - loadStartTime).toFixed(2)} ms`);
        currentModel = model;
        currentAnimations = animations;

        scene.add(currentModel);

        currentModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        if (currentAnimations && currentAnimations.length > 0) {
            mixer = new THREE.AnimationMixer(currentModel);
            populateAnimationSelect();
            playAnimation(currentAnimations[0]);
        } else {
            console.log("No animations found in the model.");
            animationSelect.innerHTML = '<option>No animations found</option>';
            animationSelect.disabled = true;
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

    if (fileName.endsWith('.gltf') || fileName.endsWith('.glb')) {
        loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath(config.dracoDecoderPath);
        loader.setDRACOLoader(dracoLoader);

        try {
            loader.parse(data, '', (gltf) => {
                setupModel(gltf.scene, gltf.animations);
            }, handleLoadError);
        } catch (error) {
            handleLoadError(error);
        }

    } else if (fileName.endsWith('.fbx')) {
        loader = new FBXLoader();
        try {
            const fbxModel = loader.parse(data, ''); 
            setupModel(fbxModel, fbxModel.animations); 
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

// --- Animation Control ---

function populateAnimationSelect() {
    animationSelect.innerHTML = '';
    animationSelect.disabled = !currentAnimations || currentAnimations.length === 0;

    if (currentAnimations && currentAnimations.length > 0) {
        currentAnimations.forEach((clip, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = clip.name ? clip.name.trim() : `Animation ${index + 1}`;
            animationSelect.appendChild(option);
        });
        animationSelect.selectedIndex = 0; 
    } else {
        const option = document.createElement('option');
        option.textContent = 'No animations found';
        animationSelect.appendChild(option);
    }
}

function playSelectedAnimation() {
    if (!mixer) return; 

    const selectedIndex = parseInt(animationSelect.value, 10);
    if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < currentAnimations.length) {
        playAnimation(currentAnimations[selectedIndex]);
    } else if (currentAnimations.length > 0) {
        console.warn("Invalid animation selection index:", animationSelect.value);
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

// --- Scene Management & Cleanup ---

function clearScene() {
    if (currentAction) {
        currentAction.stop(); 
        currentAction = null;
    }
    if (mixer) {
         mixer.stopAllAction();
         mixer.uncacheRoot(currentModel); 
         mixer = null;
     }

    if (currentModel) {
        scene.remove(currentModel);

        currentModel.traverse((child) => {
            if (child.isMesh) {
                if(child.geometry) {
                    child.geometry.dispose();
                }
                if (child.material) {
                    cleanMaterial(child.material);
                }
            }
        });
        console.log("Previous model resources disposed.");
        currentModel = null;
    }

    currentAnimations = []; 
    animationSelect.innerHTML = '<option>Load a model first</option>';
    animationSelect.disabled = true;

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

// --- UI Feedback ---

function showError(message) {
    errorMessageDiv.textContent = message;
    errorMessageDiv.style.display = message ? 'block' : 'none';
     if(message) {
         console.error("UI Error:", message); 
     }
}

function showLoading() {
    loadingIndicator.style.display = 'flex'; 
}

function hideLoading() {
    loadingIndicator.style.display = 'none';
}

// --- Core Loop & Resize ---

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

    if (mixer) {
        mixer.update(delta);
    }

    controls.update(); 

    renderer.render(scene, camera);
}

// --- Initialization Call ---
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init(); 
}