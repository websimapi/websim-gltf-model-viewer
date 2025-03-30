/**
 * Scene Setup Module
 * Handles creation and configuration of the main THREE.js components:
 * scene, camera, renderer, lighting, ground, and controls.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import config from './config.js';

let scene, camera, renderer, controls, hemiLight, dirLight, ground;

/**
 * Initializes the core THREE.js scene components.
 * @returns {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer }}
 */
export function initScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(config.backgroundColor);

    camera = new THREE.PerspectiveCamera(
        config.cameraFov,
        window.innerWidth / window.innerHeight,
        config.cameraNear,
        config.cameraFar
    );
    camera.position.set(config.initialCameraPosition.x, config.initialCameraPosition.y, config.initialCameraPosition.z);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    return { scene, camera, renderer };
}

/**
 * Sets up the scene lighting.
 * @param {THREE.Scene} targetScene - The scene to add lights to.
 */
export function initLighting(targetScene) {
    hemiLight = new THREE.HemisphereLight(config.hemiLightSkyColor, config.hemiLightGroundColor, config.hemiLightIntensity);
    hemiLight.position.set(0, 20, 0);
    targetScene.add(hemiLight);

    dirLight = new THREE.DirectionalLight(config.dirLightColor, config.dirLightIntensity);
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
    targetScene.add(dirLight);

    // Optional: Add a light helper for debugging
    // const dirLightHelper = new THREE.DirectionalLightHelper(dirLight, 5);
    // targetScene.add(dirLightHelper);
    // const shadowCameraHelper = new THREE.CameraHelper(dirLight.shadow.camera);
    // targetScene.add(shadowCameraHelper);
}

/**
 * Creates and adds the ground plane to the scene.
 * @param {THREE.Scene} targetScene - The scene to add the ground to.
 */
export function initGround(targetScene) {
    ground = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshPhongMaterial({ color: config.groundColor, depthWrite: false })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    targetScene.add(ground);
}

/**
 * Initializes the OrbitControls.
 * @param {THREE.Camera} targetCamera - The camera to control.
 * @param {HTMLElement} domElement - The renderer's DOM element.
 * @returns {OrbitControls} The initialized controls.
 */
export function initControls(targetCamera, domElement) {
    controls = new OrbitControls(targetCamera, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = config.controlsDampingFactor;
    controls.screenSpacePanning = false;
    controls.minDistance = config.controlsMinDistance;
    controls.maxDistance = config.controlsMaxDistance;
    controls.target.set(config.initialControlsTarget.x, config.initialControlsTarget.y, config.initialControlsTarget.z);
    controls.update();
    return controls;
}

/**
 * Handles window resize events.
 */
export function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

/**
 * Cleans up scene resources (lights, ground).
 */
export function disposeSceneElements() {
    if (scene) {
        if (hemiLight) scene.remove(hemiLight);
        if (dirLight) {
             if (dirLight.shadow && dirLight.shadow.map) {
                 dirLight.shadow.map.dispose();
             }
            scene.remove(dirLight);
        }
        if (ground) scene.remove(ground);
    }
    hemiLight = null;
    dirLight = null;
    ground = null;
    // Scene itself is usually kept, but camera/renderer might be disposed if re-initializing fully
    // camera = null;
    // if (renderer) {
    //     renderer.dispose();
    //     renderer.domElement.remove();
    //     renderer = null;
    // }
    // if (controls) {
    //     controls.dispose();
    //     controls = null;
    // }
}
