/**
 * Model Loader Module
 * Handles loading GLTF, GLB, and FBX models, processing them,
 * and managing scene clearing/resource disposal related to models.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import config from './config.js';
import { showError, showLoading, hideLoading, displayGeneralInfo, displaySkeletonInfo, displaySkinningInfo, clearModelInfoUI } from './ui.js';

let gltfLoader, fbxLoader;
let currentModel = null;
let originalGltfData = null; // Store original GLTF structure if needed

/**
 * Initializes the necessary model loaders (GLTF, FBX, DRACO).
 */
export function initLoaders() {
    gltfLoader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(config.dracoDecoderPath);
    gltfLoader.setDRACOLoader(dracoLoader);

    fbxLoader = new FBXLoader();
    console.log("GLTF and FBX loaders initialized.");
}

/**
 * Handles the file selection event, reads the file, and initiates loading.
 * @param {Event} event - The file input change event.
 * @param {THREE.Scene} scene - The main scene object.
 * @param {Function} onModelLoaded - Callback function when model is successfully loaded. Passes { model, animations, fileName, gltfData }.
 * @param {Function} onClearCallback - Callback function before loading starts (e.g., to reset animation state).
 */
export function handleFileSelect(event, scene, onModelLoaded, onClearCallback) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.gltf') && !fileName.endsWith('.glb') && !fileName.endsWith('.fbx')) {
        showError('Unsupported file type. Please load a .gltf, .glb, or .fbx file.');
        event.target.value = ''; // Reset file input
        return;
    }

    // --- Initiate Loading Process ---
    showLoading();
    showError(''); // Clear previous errors
    if (onClearCallback) onClearCallback(); // Notify main script to reset things
    clearScene(scene); // Clear previous model

    const reader = new FileReader();
    reader.onload = (e) => {
        const contents = e.target.result;
        parseAndLoadModel(contents, fileName, scene, onModelLoaded);
    };
    reader.onerror = (e) => {
         console.error("FileReader error:", e);
         showError('Error reading file.');
         hideLoading();
         event.target.value = ''; // Reset file input
    }

    if (fileName.endsWith('.glb') || fileName.endsWith('.fbx')) {
        reader.readAsArrayBuffer(file);
    } else { // .gltf
        reader.readAsText(file);
    }
}


/**
 * Parses the loaded file data and uses the appropriate loader.
 * @param {string | ArrayBuffer} data - The file content.
 * @param {string} fileName - The name of the file.
 * @param {THREE.Scene} scene - The main scene object.
 * @param {Function} onModelLoaded - Callback function when model is successfully loaded.
 */
function parseAndLoadModel(data, fileName, scene, onModelLoaded) {
    const loadStartTime = performance.now();
    let loader;
    let isGltf = false;

    const handleLoadSuccess = (modelData) => {
        console.log(`Model "${fileName} parsed in ${(performance.now() - loadStartTime).toFixed(2)} ms`);
        const { model, animations, gltf } = processLoadedData(modelData, isGltf);
        currentModel = model; // Store reference for clearing
        originalGltfData = gltf; // Store for UI info if needed

        scene.add(currentModel);
        const modelInfo = extractModelInfo(currentModel, fileName, originalGltfData);
        displayModelInfo(modelInfo); // Update UI

        if (onModelLoaded) {
            onModelLoaded({ model: currentModel, animations, fileName, gltfData: originalGltfData });
        }

        hideLoading();
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
        clearScene(scene); // Ensure partially loaded things are removed
    };

    if (fileName.endsWith('.gltf') || fileName.endsWith('.glb')) {
        if (!gltfLoader) {
             handleLoadError({ message: "GLTFLoader not initialized." });
             return;
         }
        loader = gltfLoader;
        isGltf = true;
        try {
            loader.parse(data, '', (gltf) => {
                 handleLoadSuccess(gltf);
            }, handleLoadError);
        } catch (error) {
            handleLoadError(error);
        }

    } else if (fileName.endsWith('.fbx')) {
         if (!fbxLoader) {
            handleLoadError({ message: "FBXLoader not initialized." });
            return;
        }
        loader = fbxLoader;
        isGltf = false;
        try {
            const fbxModel = loader.parse(data, '');
            handleLoadSuccess(fbxModel);
        } catch(error) {
             handleLoadError(error);
        }
    }
}

/**
 * Processes the raw loaded data from GLTF or FBX loader.
 * @param {Object} loadedData - The data returned by the loader's parse method (GLTF object or FBX Group/Object3D).
 * @param {boolean} isGltf - Flag indicating if the data is from GLTFLoader.
 * @returns {{ model: THREE.Object3D, animations: THREE.AnimationClip[], gltf: Object|null }}
 */
function processLoadedData(loadedData, isGltf) {
    let model, animations = [], gltf = null;

    if (isGltf) {
        gltf = loadedData; // Keep the full GLTF object
        model = gltf.scene;
        animations = gltf.animations || [];
    } else { // FBX
        // FBXLoader returns the root object directly, animations are attached
        model = loadedData.isGroup ? loadedData : new THREE.Group().add(loadedData); // Ensure it's always an Object3D root
        animations = loadedData.animations || [];
    }

    // Basic processing applicable to both
    model.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return { model, animations, gltf };
}

/**
 * Extracts displayable information from the loaded model.
 * @param {THREE.Object3D} model - The loaded model object.
 * @param {string} fileName - Original file name.
 * @param {Object|null} gltfData - The original parsed GLTF data, if available.
 * @returns {Object} Object containing information for the UI.
 */
function extractModelInfo(model, fileName, gltfData = null) {
    const info = {
        fileName: fileName,
        meshes: [],
        materials: new Set(),
        skinnedMeshes: [],
        totalVertices: 0,
        totalFaces: 0,
        rootBones: [],
        hasSkeleton: false,
        gltfData: gltfData // Pass along for potential extra info (like generator)
    };

    model.traverse((child) => {
        if (child.isMesh) {
            info.meshes.push(child);
            if (child.material) {
                 if (Array.isArray(child.material)) {
                    child.material.forEach(m => info.materials.add(m));
                 } else {
                    info.materials.add(child.material);
                 }
            }

            if (child.geometry) {
                const geometry = child.geometry;
                if (geometry.attributes.position) {
                    info.totalVertices += geometry.attributes.position.count;
                }
                // Calculate faces (triangles)
                if (geometry.index) {
                    info.totalFaces += geometry.index.count / 3;
                } else if (geometry.attributes.position) {
                    // Non-indexed geometry
                    info.totalFaces += geometry.attributes.position.count / 3;
                }
            }
        }
        if (child.isSkinnedMesh) {
            info.skinnedMeshes.push(child);
            info.hasSkeleton = true; // Assume skinned mesh implies skeleton
            if (child.skeleton) {
                 child.skeleton.bones.forEach(bone => {
                    // Identify root bones (parent is not a bone or is the model root)
                    if (!bone.parent || !bone.parent.isBone || bone.parent === model) {
                        // Avoid duplicates if multiple skinned meshes share roots
                        if (!info.rootBones.some(root => root.uuid === bone.uuid)) {
                            info.rootBones.push(bone);
                        }
                    }
                 });
             }
        }
         // Fallback check for bones not part of a skinned mesh skeleton property (less common)
         if (child.isBone && !info.hasSkeleton) {
            if (!child.parent || !child.parent.isBone || child.parent === model) {
                 if (!info.rootBones.some(root => root.uuid === child.uuid)) {
                     info.rootBones.push(child);
                 }
             }
            info.hasSkeleton = true; // Found at least one bone
         }
    });

     // If no roots found via skinnedMesh, try finding top-level bones directly under scene
     if (info.hasSkeleton && info.rootBones.length === 0) {
         model.traverse((child) => {
            if (child.isBone && (!child.parent || !child.parent.isBone || child.parent === model) ) {
                 if (!info.rootBones.some(root => root.uuid === child.uuid)) {
                     info.rootBones.push(child);
                 }
            }
         });
     }


    return info;
}


/**
 * Updates the UI with the extracted model information.
 * @param {Object} modelInfo - The object returned by extractModelInfo.
 */
function displayModelInfo(modelInfo) {
    displayGeneralInfo(
        modelInfo.fileName,
        modelInfo.meshes,
        modelInfo.materials,
        modelInfo.totalVertices,
        modelInfo.totalFaces,
        modelInfo.gltfData
    );
    displaySkeletonInfo(modelInfo.rootBones);
    displaySkinningInfo(modelInfo.skinnedMeshes);
}


/**
 * Centers and focuses the camera on the loaded model.
 * @param {THREE.Object3D} model - The model to focus on.
 * @param {THREE.PerspectiveCamera} camera - The scene camera.
 * @param {OrbitControls} controls - The orbit controls instance.
 */
export function centerAndFocusCamera(model, camera, controls) {
    if (!model || !camera || !controls) return;

    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // Check for invalid bounds (e.g., model with no geometry, points at origin)
    if (!box.isEmpty() && size.lengthSq() > 0.0001) {
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)); // Base distance
        cameraZ = Math.max(cameraZ, size.y / 2); // Ensure height is visible
        cameraZ *= config.cameraFocusZoomFactor; // Apply zoom factor
        cameraZ = Math.max(cameraZ, config.cameraFocusMinDistance); // Apply min distance

        // Adjust camera position for better framing
        camera.position.set(
            center.x,
            center.y + size.y * config.cameraFocusVerticalOffsetFactor, // Raise camera slightly based on height
            center.z + cameraZ // Position behind the model
        );

        // Set controls target to model center
        controls.target.copy(center);
    } else {
        // Fallback for invalid bounds: Reset to initial positions
        console.warn("Model has invalid bounds or zero dimensions. Using default camera positioning.");
        camera.position.set(config.initialCameraPosition.x, config.initialCameraPosition.y, config.initialCameraPosition.z);
        controls.target.set(config.initialControlsTarget.x, config.initialControlsTarget.y, config.initialControlsTarget.z);
    }

    controls.update();
}


/**
 * Clears the previously loaded model and associated resources from the scene.
 * @param {THREE.Scene} scene - The main scene object.
 * @param {THREE.SkeletonHelper} [skeletonHelper] - Optional skeleton helper to remove.
 */
export function clearScene(scene, skeletonHelper = null) {
    if (skeletonHelper) {
        scene.remove(skeletonHelper);
    }

    if (currentModel) {
        scene.remove(currentModel);

        // Dispose geometries and materials
        currentModel.traverse((object) => {
            if (object.isMesh) {
                if (object.geometry) {
                    object.geometry.dispose();
                }
                if (object.material) {
                    cleanMaterial(object.material);
                }
            }
        });

        console.log("Previous model resources disposed.");
        currentModel = null;
    }

    originalGltfData = null;
    clearModelInfoUI(); // Reset UI sections

    // Trigger garbage collection if available (developer tools only)
    if (typeof window.gc === 'function') {
        window.gc();
    }
    // console.log("Scene cleared. Renderer info:", renderer?.info?.memory); // Renderer might not be accessible here
}

/**
 * Helper function to dispose of material and its textures.
 * @param {THREE.Material | THREE.Material[]} material - The material(s) to clean.
 */
function cleanMaterial(material) {
    if (!material) return;

    if (Array.isArray(material)) {
        material.forEach(m => cleanMaterial(m));
        return;
    }

    material.dispose();

    // Dispose textures
    for (const key of Object.keys(material)) {
        const value = material[key];
        if (value && typeof value === 'object' && value.isTexture && typeof value.dispose === 'function') {
            value.dispose();
        }
    }
}

/**
 * Gets the currently loaded model.
 * @returns {THREE.Object3D | null}
 */
export function getCurrentModel() {
    return currentModel;
}