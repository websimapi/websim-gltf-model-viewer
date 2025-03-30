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
const animationControlsDiv = document.getElementById('animation-controls');
const animationDetailsDiv = document.getElementById('animation-details');
const modelInfoDiv = document.getElementById('model-info');
const generalInfoDiv = document.getElementById('general-model-info');
const skeletonInfoDiv = document.getElementById('skeleton-info');
const skinningInfoDiv = document.getElementById('skinning-info');
let originalGltfData = null;

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

    clearModelInfoUI(); 
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
    originalGltfData = null; 

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
                         if (bone.parent && !bone.parent.isBone) {
                            if (!rootBones.some(root => root.uuid === bone.uuid)) {
                                rootBones.push(bone);
                            }
                         } else if (!bone.parent) { 
                            if (!rootBones.some(root => root.uuid === bone.uuid)) {
                                rootBones.push(bone);
                            }
                         }
                     });
                 }
            }
        });

        displayGeneralInfo(fileName, meshes, materials, totalVertices, totalFaces, originalGltfData);
        displaySkeletonInfo(rootBones); 
        displaySkinningInfo(skinnedMeshes);
        modelInfoDiv.style.display = 'block'; 

        if (currentAnimations && currentAnimations.length > 0) {
            mixer = new THREE.AnimationMixer(currentModel);
            populateAnimationSelect();
            playAnimation(currentAnimations[0]); 
            animationControlsDiv.style.display = 'block'; 
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
        displayAnimationDetails(currentAnimations[0]); 
    } else {
        clearAnimationUI();
    }
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

function displayAnimationDetails(clip) {
    if (!clip) {
         animationDetailsDiv.innerHTML = '<p>No animation selected or details available.</p>';
         return;
    }
    const duration = clip.duration.toFixed(2);
    const tracks = clip.tracks.length;
    animationDetailsDiv.innerHTML = `
        <ul>
            <li><strong>Name:</strong> ${clip.name || 'N/A'}</li>
            <li><strong>Duration:</strong> ${duration} seconds</li>
            <li><strong>Tracks:</strong> ${tracks}</li>
        </ul>
    `;
}

// --- UI Display for Model Info ---

function displayGeneralInfo(fileName, meshes, materials, vertices, faces, gltfData) {
    generalInfoDiv.innerHTML = '<h4>General Info</h4>'; 

    const list = document.createElement('ul');

    let listItem = document.createElement('li');
    listItem.innerHTML = `<strong>File Name:</strong> ${fileName}`;
    list.appendChild(listItem);

    listItem = document.createElement('li');
    listItem.innerHTML = `<strong>Meshes:</strong> ${meshes.length}`;
    list.appendChild(listItem);

    listItem = document.createElement('li');
    listItem.innerHTML = `<strong>Materials:</strong> ${materials.size}`; 
    list.appendChild(listItem);

    listItem = document.createElement('li');
    listItem.innerHTML = `<strong>Vertices:</strong> ${vertices.toLocaleString()}`;
    list.appendChild(listItem);

    listItem = document.createElement('li');
    listItem.innerHTML = `<strong>Faces (Triangles):</strong> ${Math.round(faces).toLocaleString()}`;
    list.appendChild(listItem);

    if (gltfData && gltfData.parser && gltfData.parser.json) {
        const json = gltfData.parser.json;
        if (json.asset && json.asset.generator) {
            listItem = document.createElement('li');
            listItem.innerHTML = `<strong>Generator:</strong> ${json.asset.generator}`;
            list.appendChild(listItem);
        }
        const hasDraco = gltfData.parser.extensionsUsed && gltfData.parser.extensionsUsed.includes('KHR_draco_mesh_compression');
        listItem = document.createElement('li');
        listItem.innerHTML = `<strong>Draco Compressed:</strong> ${hasDraco ? 'Yes' : 'No'}`;
        list.appendChild(listItem);
    }

    generalInfoDiv.appendChild(list);
}

function displaySkeletonInfo(rootBones) {
    skeletonInfoDiv.innerHTML = '<h4>Skeleton / Armature Hierarchy</h4>'; 

    if (!rootBones || rootBones.length === 0) {
        skeletonInfoDiv.innerHTML += '<p>No skeleton data or root bones found.</p>';
        return;
    }

    const rootList = document.createElement('ul');
    rootList.style.paddingLeft = '0'; 

    let totalBones = 0;

    function buildBoneList(bone, parentElement, level) {
        totalBones++;
        const listItem = document.createElement('li');
        listItem.style.marginLeft = `${level * 15}px`; 
        listItem.innerHTML = `<span title="ID: ${bone.id}"> ${bone.name || 'Unnamed Bone'}</span>`; 
        parentElement.appendChild(listItem);

        if (bone.children.length > 0) {
            const childrenList = document.createElement('ul');
             childrenList.style.paddingLeft = '0'; 
             listItem.appendChild(childrenList); 
            bone.children.forEach(childBone => {
                if (childBone.isBone) {
                    buildBoneList(childBone, childrenList, level + 1);
                }
            });
        }
    }

    rootBones.forEach(bone => {
        buildBoneList(bone, rootList, 0);
    });

    skeletonInfoDiv.appendChild(rootList);
    skeletonInfoDiv.innerHTML += `<p style="margin-top: 10px;"><strong>Total Bones:</strong> ${totalBones}</p>`;
}

function displaySkinningInfo(skinnedMeshes) {
    skinningInfoDiv.innerHTML = '<h4>Skinned Meshes</h4>'; 

    if (!skinnedMeshes || skinnedMeshes.length === 0) {
        skinningInfoDiv.innerHTML += '<p>No skinned meshes found in model.</p>';
        return;
    }

    const list = document.createElement('ul');
    skinnedMeshes.forEach((mesh, index) => {
        const listItem = document.createElement('li');
        const boneCount = mesh.skeleton ? mesh.skeleton.bones.length : 'N/A';
        const materialName = Array.isArray(mesh.material)
            ? mesh.material.map(m => m.name || 'Unnamed Material').join(', ')
            : (mesh.material?.name || 'Unnamed Material');

        listItem.innerHTML = `
            <strong>${mesh.name || `Skinned Mesh ${index + 1}`}</strong>
            <ul style="padding-left: 15px; font-size: 0.9em;">
                <li>Bones: ${boneCount}</li>
                <li>Material(s): ${materialName}</li>
                 <li>Vertices: ${mesh.geometry.attributes.position ? mesh.geometry.attributes.position.count.toLocaleString() : 'N/A'}</li>
            </ul>
        `;
        list.appendChild(listItem);
    });
     skinningInfoDiv.appendChild(list);
}

function clearModelInfoUI() {
    modelInfoDiv.style.display = 'none'; 
    generalInfoDiv.innerHTML = '<h4>General Info</h4><p>Load a model to see details.</p>'; 
    skeletonInfoDiv.innerHTML = '<h4>Skeleton / Armature Hierarchy</h4><p>Load a model to see skeleton data.</p>';
    skinningInfoDiv.innerHTML = '<h4>Skinned Meshes</h4><p>Load a model to see skinning data.</p>';
}

function clearAnimationUI(keepSelect = false) {
     if (!keepSelect) {
         animationControlsDiv.style.display = 'none'; 
         animationSelect.innerHTML = '<option>Load a model first</option>';
         animationSelect.disabled = true;
     }
     animationDetailsDiv.innerHTML = '<p>No animations found or model not loaded.</p>';
}

// --- Scene Management & Cleanup ---

function clearScene() {
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
                     console.log(`Disposed geometry for mesh: ${object.name || object.uuid}`);
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
                     console.log(`Disposed shadow map for light: ${object.name || object.uuid}`);
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