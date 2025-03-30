import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

let scene, camera, renderer, clock, mixer, currentModel, currentAnimations = [];
let controls; // OrbitControls
const modelInput = document.getElementById('modelInput');
const animationSelect = document.getElementById('animationSelect');
const errorMessageDiv = document.getElementById('error-message');

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);
    scene.fog = new THREE.Fog(0xf0f0f0, 10, 50);

    // Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.5, 5);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
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
    controls.target.set(0, 1, 0); // Adjust target to look slightly higher
    controls.update();

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 3);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 3);
    dirLight.position.set(3, 10, 10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 4;
    dirLight.shadow.camera.bottom = -4;
    dirLight.shadow.camera.left = -4;
    dirLight.shadow.camera.right = 4;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 40;
    scene.add(dirLight);

    // Ground
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshPhongMaterial({ color: 0xcbcbcb, depthWrite: false })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    modelInput.addEventListener('change', loadModel);
    animationSelect.addEventListener('change', playSelectedAnimation);

    // Animation Loop
    animate();
}

function loadModel(event) {
    const file = event.target.files[0];
    if (!file) return;

    clearScene();
    showError(''); // Clear previous errors

    const reader = new FileReader();
    reader.onload = (e) => {
        const contents = e.target.result;
        const loader = new GLTFLoader();

        // Optional: Provide DRACOLoader instance to decode compressed meshes
        const dracoLoader = new DRACOLoader();
        // Specify path to a folder containing WASM/JS decoder files
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
        loader.setDRACOLoader(dracoLoader);


        loader.parse(contents, '', (gltf) => {
            currentModel = gltf.scene;
            currentAnimations = gltf.animations;

            // Ensure model casts shadows
            currentModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            scene.add(currentModel);

            // Set up animation mixer
            mixer = new THREE.AnimationMixer(currentModel);
            populateAnimationSelect();

            // Auto-play first animation if available
            if (currentAnimations.length > 0) {
                playAnimation(currentAnimations[0]);
            } else {
                 animationSelect.innerHTML = '<option>No animations found</option>';
                 animationSelect.disabled = true;
            }

             // Center the model and adjust camera
            const box = new THREE.Box3().setFromObject(currentModel);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = 2.0 / maxDim; // Scale model to fit within a ~2 unit height

            // currentModel.scale.multiplyScalar(scale); // Scaling might mess up root motion
            box.setFromObject(currentModel); // Recalculate bounds after scaling
            box.getCenter(center); // Recalculate center
            box.getSize(size); // Recalculate size

            currentModel.position.sub(center); // Center model at origin

             // Adjust camera position and target
            camera.position.set(center.x, center.y + size.y * 0.5, center.z + size.y * 1.5); // Position camera relative to model size
            controls.target.copy(center);
            controls.update();


        }, (error) => {
            console.error('An error happened during GLTF loading:', error);
            showError(`Error loading model: ${error.message || error}`);
        });
    };

    if (file.name.endsWith('.glb')) {
        reader.readAsArrayBuffer(file);
    } else if (file.name.endsWith('.gltf')) {
         reader.readAsText(file); // GLTF is JSON based
    } else {
        showError('Unsupported file type. Please load a .gltf or .glb file.');
    }
}

function populateAnimationSelect() {
    animationSelect.innerHTML = ''; // Clear previous options
    animationSelect.disabled = currentAnimations.length === 0;

    if (currentAnimations.length > 0) {
        currentAnimations.forEach((clip, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = clip.name || `Animation ${index + 1}`;
            animationSelect.appendChild(option);
        });
        animationSelect.selectedIndex = 0; // Select the first animation
    } else {
        const option = document.createElement('option');
        option.textContent = 'No animations found';
        animationSelect.appendChild(option);
    }
}

function playSelectedAnimation() {
    const selectedIndex = parseInt(animationSelect.value, 10);
    if (!isNaN(selectedIndex) && currentAnimations[selectedIndex]) {
        playAnimation(currentAnimations[selectedIndex]);
    }
}

function playAnimation(clip) {
    if (!mixer || !clip) return;

    mixer.stopAllAction(); // Stop any currently playing animations
    const action = mixer.clipAction(clip);
    action.reset();
    action.play();
}

function clearScene() {
    if (currentModel) {
        scene.remove(currentModel);
        // Dispose geometries and materials to free memory (optional but good practice)
        currentModel.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (child.material.isMaterial) {
                    cleanMaterial(child.material);
                } else {
                    // For MeshFaceMaterial
                    for (const material of child.material) {
                        cleanMaterial(material);
                    }
                }
            }
        });
        currentModel = null;
    }
    if (mixer) {
        mixer.stopAllAction();
        mixer = null;
    }
    currentAnimations = [];
    animationSelect.innerHTML = '<option>Load a model</option>';
    animationSelect.disabled = true;
}

// Helper function to dispose materials and textures
function cleanMaterial(material) {
    material.dispose();
    // Dispose textures
    for (const key of Object.keys(material)) {
        const value = material[key];
        if (value && typeof value === 'object' && 'isTexture' in value) {
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

    const delta = clock.getDelta();

    if (mixer) {
        mixer.update(delta);
    }

    controls.update(); // Only required if controls.enableDamping = true

    renderer.render(scene, camera);
}

function showError(message) {
    errorMessageDiv.textContent = message;
    errorMessageDiv.style.display = message ? 'block' : 'none';
}

init();

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
    scene.background = new THREE.Color(0xcccccc); // Lighter grey
    scene.fog = new THREE.Fog(0xcccccc, 10, 70); // Adjusted fog distance

    // Camera
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.5, 4); // Slightly different starting position

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
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
    controls.target.set(0, 1, 0); // Initial target
    controls.update();

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x8d8d8d, 2); // Slightly softer intensity
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2.5); // Slightly softer intensity
    dirLight.position.set(5, 10, 7.5); // Adjusted angle
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024; // Shadow map resolution
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.top = 5; // Adjusted shadow camera bounds
    dirLight.shadow.camera.bottom = -5;
    dirLight.shadow.camera.left = -5;
    dirLight.shadow.camera.right = 5;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 50;
    scene.add(dirLight);
    // scene.add( new THREE.CameraHelper( dirLight.shadow.camera ) ); // Uncomment to debug shadow camera

    // Ground
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshPhongMaterial({ color: 0xbbbbbb, depthWrite: false }) // Slightly darker ground
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
        modelInput.value = ''; // Reset file input
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
    showError(''); // Clear previous errors

    if (fileName.endsWith('.glb')) {
        reader.readAsArrayBuffer(file);
    } else { // .gltf
        reader.readAsText(file);
    }
}

function loadModel(data, fileName) {
    const loader = new GLTFLoader();

    // DRACO Loader required for compressed models
    const dracoLoader = new DRACOLoader();
    // Use a CDN link for the decoder path. IMPORTANT: Ensure this path is accessible.
    dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/gltf/');
    loader.setDRACOLoader(dracoLoader);

    const loadStartTime = performance.now();

    loader.parse(data, '', (gltf) => {
        console.log(`Model "${fileName}" loaded in ${(performance.now() - loadStartTime).toFixed(2)} ms`);
        currentModel = gltf.scene;
        currentAnimations = gltf.animations;

        // --- Model Setup ---
        scene.add(currentModel);

        // Enable shadows for all meshes in the model
        currentModel.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                // Optional: Improve shadow appearance for skinned meshes
                if (child.isSkinnedMesh) {
                     child.frustumCulled = false;
                }
            }
        });

        // --- Animation Setup ---
        mixer = new THREE.AnimationMixer(currentModel);
        populateAnimationSelect();

        if (currentAnimations.length > 0) {
            playAnimation(currentAnimations[0]); // Auto-play first animation
        } else {
             animationSelect.innerHTML = '<option>No animations found</option>';
             animationSelect.disabled = true;
        }

        // --- Camera & Controls Adjustment ---
        centerAndFocusCamera();

        hideLoading();
        modelInput.value = ''; // Reset file input after successful load


    }, (error) => {
        console.error(`An error happened during GLTF loading of "${fileName}":`, error);
        showError(`Error loading model: ${error.message || 'Unknown error'}. Check console for details.`);
        hideLoading();
        modelInput.value = ''; // Reset file input
    });
}

function centerAndFocusCamera() {
    if (!currentModel) return;

    const box = new THREE.Box3().setFromObject(currentModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Calculate the necessary distance to fit the model roughly in the view
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2));
    cameraZ *= 1.5; // Zoom out a bit for better framing

    // Reposition the camera
    // Place camera slightly above the center and back along the Z axis relative to the center
    camera.position.set(center.x, center.y + size.y * 0.2, center.z + cameraZ);

    // Point the controls target to the center of the model
    controls.target.copy(center);
    controls.update(); // Important: Update controls after setting target and camera position
}


// --- Animation Control ---

function populateAnimationSelect() {
    animationSelect.innerHTML = ''; // Clear previous options
    animationSelect.disabled = currentAnimations.length === 0;

    if (currentAnimations.length > 0) {
        currentAnimations.forEach((clip, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = clip.name || `Animation ${index + 1}`;
            animationSelect.appendChild(option);
        });
        animationSelect.selectedIndex = 0; // Select the first animation by default
    } else {
        const option = document.createElement('option');
        option.textContent = 'No animations found';
        animationSelect.appendChild(option);
    }
}

function playSelectedAnimation() {
    const selectedIndex = parseInt(animationSelect.value, 10);
    if (!isNaN(selectedIndex) && currentAnimations[selectedIndex]) {
        playAnimation(currentAnimations[selectedIndex]);
    }
}

function playAnimation(clip) {
    if (!mixer || !clip) return;

    // Fade out the previous action and fade in the new one for smoother transitions
    const newAction = mixer.clipAction(clip);

    if (currentAction && currentAction !== newAction) {
        currentAction.fadeOut(0.3); // Fade out over 0.3 seconds
    }

    newAction
        .reset()
        .setEffectiveTimeScale(1)
        .setEffectiveWeight(1)
        .fadeIn(0.3) // Fade in over 0.3 seconds
        .play();

    currentAction = newAction;
}

// --- Scene Management & Cleanup ---

function clearScene() {
    if (currentModel) {
        scene.remove(currentModel);
        // Dispose geometries and materials to free memory
        currentModel.traverse((child) => {
            if (child.isMesh) {
                child.geometry.dispose();
                if (child.material.isMaterial) {
                    cleanMaterial(child.material);
                } else if (Array.isArray(child.material)) {
                    // Handle multi-materials
                    child.material.forEach(cleanMaterial);
                }
            }
        });
        console.log("Previous model resources disposed.");
        currentModel = null;
    }
    if (mixer) {
        mixer.stopAllAction();
        // Uncomment if you need to uncache animations, though usually not necessary
        // currentAnimations.forEach(clip => mixer.uncacheClip(clip));
        mixer = null;
    }
    currentAnimations = [];
    currentAction = null; // Reset current action reference
    animationSelect.innerHTML = '<option>Load a model first</option>';
    animationSelect.disabled = true;
}

// Helper function to dispose materials and associated textures
function cleanMaterial(material) {
    material.dispose();
    // Dispose textures
    for (const key of Object.keys(material)) {
        const value = material[key];
        if (value && typeof value === 'object' && value.isTexture) {
            value.dispose();
            // console.log("Disposed texture:", key);
        }
    }
}

// --- UI Feedback ---

function showError(message) {
    errorMessageDiv.textContent = message;
    errorMessageDiv.style.display = message ? 'block' : 'none';
     if(message) {
         console.error("UI Error:", message); // Log error to console as well
     }
}

function showLoading() {
    loadingIndicator.style.display = 'block';
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

    const delta = clock.getDelta();

    if (mixer) {
        mixer.update(delta);
    }

    controls.update(); // Only required if controls.enableDamping = true

    renderer.render(scene, camera);
}

// --- Start Application ---
init();

