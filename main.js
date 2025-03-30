import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

let scene, camera, renderer, clock, mixer, currentModel, currentAction;
let controls; // OrbitControls
let currentAnimations = [];
const modelInput = document.getElementById('modelInput');
const animationSelect = document.getElementById('animationSelect');
const errorMessageDiv = document.getElementById('error-message');
const loadingIndicator = document.getElementById('loading-indicator');

// --- Initialization ---

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcccccc); 
    scene.fog = new THREE.Fog(0xcccccc, 10, 70); 

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.5, 4); 

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
    document.body.appendChild(renderer.domElement);

    // Clock
    clock = new THREE.Clock();

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 1;
    controls.maxDistance = 50;
    controls.target.set(0, 1, 0); 
    controls.update();

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2); 
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5); 
    dirLight.position.set(5, 10, 7.5); 
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024; 
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.top = 5; 
    dirLight.shadow.camera.bottom = -5;
    dirLight.shadow.camera.left = -5;
    dirLight.shadow.camera.right = 5;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 50;
    scene.add(dirLight);

    // Ground
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshPhongMaterial({ color: 0xbbbbbb, depthWrite: false }) 
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    modelInput.addEventListener('change', handleFileSelect);
    animationSelect.addEventListener('change', playSelectedAnimation);

    // Animation Loop
    animate();
}

// --- File Handling & Loading ---

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.gltf') && !fileName.endsWith('.glb')) {
        showError('Unsupported file type. Please load a .gltf or .glb file.');
        modelInput.value = ''; 
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const contents = e.target.result;
        loadModel(contents, file.name);
    };
    reader.onerror = (e) => {
         console.error("FileReader error:", e);
         showError('Error reading file.');
         hideLoading();
    }

    showLoading();
    clearScene();
    showError(''); 

    if (fileName.endsWith('.glb')) {
        reader.readAsArrayBuffer(file);
    } else { 
        reader.readAsText(file);
    }
}

function loadModel(data, fileName) {
    const loader = new GLTFLoader();

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/gltf/');
    loader.setDRACOLoader(dracoLoader);

    const loadStartTime = performance.now();

    loader.parse(data, '', (gltf) => {
        console.log(`Model "${fileName}" loaded in ${(performance.now() - loadStartTime).toFixed(2)} ms`);
        currentModel = gltf.scene;
        currentAnimations = gltf.animations;

        scene.add(currentModel);

        currentModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.isSkinnedMesh) {
                     child.frustumCulled = false;
                }
            }
        });

        mixer = new THREE.AnimationMixer(currentModel);
        populateAnimationSelect();

        if (currentAnimations.length > 0) {
            playAnimation(currentAnimations[0]); 
        } else {
             animationSelect.innerHTML = '<option>No animations found</option>';
             animationSelect.disabled = true;
        }

        centerAndFocusCamera();

        hideLoading();
        modelInput.value = ''; 


    }, (error) => {
        console.error(`An error happened during GLTF loading of "${fileName}":`, error);
        let errorMsg = `Error loading model: ${error.message || 'Unknown error'}.`;
        if (error.message && error.message.includes('Unexpected token') && typeof data === 'string') {
             errorMsg += ' This might be a text GLTF file. Ensure it\'s valid JSON.';
        } else if (error.message && error.message.includes('Magic')) {
             errorMsg += ' This might indicate a corrupt GLB file.';
        }
        showError(errorMsg + ' Check console for details.');
        hideLoading();
        modelInput.value = ''; 
    });
}

function centerAndFocusCamera() {
    if (!currentModel) return;

    const box = new THREE.Box3().setFromObject(currentModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim <= 0) {
         console.warn("Model has zero or negative dimensions. Using default camera positioning.");
         camera.position.set(0, 1.5, 4);
         controls.target.set(0, 1, 0);
         controls.update();
         return;
    }

    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5; 

    camera.position.set(center.x, center.y + size.y * 0.2, center.z + Math.max(cameraZ, 1));

    controls.target.copy(center);
    controls.update(); 
}

// --- Animation Control ---

function populateAnimationSelect() {
    animationSelect.innerHTML = ''; 
    animationSelect.disabled = currentAnimations.length === 0;

    if (currentAnimations.length > 0) {
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

    const newAction = mixer.clipAction(clip);

    if (currentAction && currentAction !== newAction) {
        currentAction.fadeOut(0.3); 
    }

    newAction
        .reset() 
        .setEffectiveTimeScale(1) 
        .setEffectiveWeight(1) 
        .fadeIn(0.3) 
        .play(); 

    currentAction = newAction;
}

// --- Scene Management & Cleanup ---

function clearScene() {
    if (currentModel) {
        if (mixer) {
             mixer.stopAllAction();
             mixer = null; 
        }

        scene.remove(currentModel);

        currentModel.traverse((child) => {
            if (child.isMesh) {
                if(child.geometry) child.geometry.dispose();

                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(cleanMaterial);
                    } else {
                        cleanMaterial(child.material);
                    }
                }
            }
        });
        console.log("Previous model resources disposed.");
        currentModel = null; 
    }

    currentAnimations = [];
    currentAction = null; 
    animationSelect.innerHTML = '<option>Load a model first</option>';
    animationSelect.disabled = true;
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
    renderer.setAnimationLoop(renderLoop); 
}

function renderLoop() {
    const delta = clock.getDelta();

    if (mixer) {
        mixer.update(delta);
    }

    controls.update(); 

    renderer.render(scene, camera);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}