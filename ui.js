/**
 * UI Module for the GLTF Viewer
 * Handles DOM manipulation for displaying information, errors, and loading states.
 */
import config from './config.js';

// --- DOM Element References ---
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


// --- UI Update Functions ---

export function displayGeneralInfo(fileName, meshes, materials, vertices, faces, gltfData) {
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
    modelInfoDiv.style.display = 'block'; // Ensure the parent container is visible
}

export function displaySkeletonInfo(rootBones) {
    skeletonInfoDiv.innerHTML = '<h4>Skeleton / Armature Hierarchy</h4>';

    if (!rootBones || rootBones.length === 0) {
        skeletonInfoDiv.innerHTML += '<p>No skeleton data or root bones found.</p>';
        return;
    }

    const rootElement = document.createElement('div');
    rootElement.classList.add('skeleton-hierarchy'); // Add class for styling

    let totalBones = 0;

    function buildBoneTree(bone, parentElement) {
        totalBones++;
        const details = document.createElement('details');
        details.classList.add('bone-node');
        // Don't open leaf nodes by default unless they are root
        if (bone.children.some(child => child.isBone) || !bone.parent || !bone.parent.isBone) {
             details.open = true; // Open nodes with children or root nodes by default
        }


        const summary = document.createElement('summary');
        summary.innerHTML = `<span class="bone-icon">🦴</span> <span class="bone-name" title="ID: ${bone.uuid}">${bone.name || 'Unnamed Bone'}</span>`;
        details.appendChild(summary);

        // Add direct child bones recursively
        if (bone.children.length > 0) {
            const childrenContainer = document.createElement('div');
            childrenContainer.classList.add('bone-children');
            bone.children.forEach(childBone => {
                if (childBone.isBone) {
                    buildBoneTree(childBone, childrenContainer);
                }
            });
            if (childrenContainer.hasChildNodes()) {
                 details.appendChild(childrenContainer);
            }
        }

        parentElement.appendChild(details);
    }

    rootBones.forEach(bone => {
        buildBoneTree(bone, rootElement);
    });

    skeletonInfoDiv.appendChild(rootElement);
    skeletonInfoDiv.innerHTML += `<p class="total-bones"><strong>Total Bones:</strong> ${totalBones}</p>`;
    modelInfoDiv.style.display = 'block'; // Ensure the parent container is visible
}

export function displaySkinningInfo(skinnedMeshes) {
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
     modelInfoDiv.style.display = 'block'; // Ensure the parent container is visible
}

export function clearModelInfoUI() {
    modelInfoDiv.style.display = 'none';
    generalInfoDiv.innerHTML = '<h4>General Info</h4><p>Load a model to see details.</p>';
    skeletonInfoDiv.innerHTML = '<h4>Skeleton / Armature Hierarchy</h4><p>Load a model to see skeleton data.</p>';
    skinningInfoDiv.innerHTML = '<h4>Skinned Meshes</h4><p>Load a model to see skinning data.</p>';
}


// --- Animation UI ---

export function populateAnimationSelect(animations) {
    animationSelect.innerHTML = ''; // Clear previous options
    animationSelect.disabled = !animations || animations.length === 0;
    animationControlsDiv.style.display = (animations && animations.length > 0) ? 'block' : 'none';

    if (animations && animations.length > 0) {
        animations.forEach((clip, index) => {
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
        clearAnimationDetails(); // Clear details if no animations
    }
}

export function displayAnimationDetails(clip) {
    if (!clip) {
         clearAnimationDetails();
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

export function clearAnimationUI(keepSelect = false) {
     if (!keepSelect) {
         animationControlsDiv.style.display = 'none';
         animationSelect.innerHTML = '<option>Load a model first</option>';
         animationSelect.disabled = true;
     }
     clearAnimationDetails();
}

export function clearAnimationDetails() {
     animationDetailsDiv.innerHTML = '<p>No animation selected or details available.</p>';
}

// --- Feedback UI (Error/Loading) ---

export function showError(message) {
    errorMessageDiv.textContent = message;
    errorMessageDiv.style.display = message ? 'block' : 'none';
     if(message) {
         console.error("UI Error:", message);
     }
}

export function showLoading() {
    loadingIndicator.style.display = 'flex';
}

export function hideLoading() {
    loadingIndicator.style.display = 'none';
}