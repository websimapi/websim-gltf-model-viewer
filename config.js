/**
 * Configuration for the GLTF Viewer
 */
const config = {
  /** Background color of the scene (CSS color value or hex number) */
  backgroundColor: 0xcccccc,
  /** Fog color (should generally match background) */
  fogColor: 0xcccccc,
  /** Fog density near plane */
  fogNear: 10,
  /** Fog density far plane */
  fogFar: 70,

  /** Hemisphere light sky color */
  hemiLightSkyColor: 0xffffff,
  /** Hemisphere light ground color */
  hemiLightGroundColor: 0x8d8d8d,
  /** Hemisphere light intensity */
  hemiLightIntensity: 2.0,

  /** Directional light color */
  dirLightColor: 0xffffff,
  /** Directional light intensity */
  dirLightIntensity: 2.5,
  /** Directional light position (x, y, z) */
  dirLightPosition: { x: 5, y: 10, z: 7.5 },
  /** Shadow map resolution (width/height) */
  shadowMapSize: 1024,
   /** Shadow camera frustum size */
  shadowCameraSize: 5, // top/bottom/left/right will be +/- this value

  /** Ground plane color */
  groundColor: 0xbbbbbb,

  /** Initial camera position (x, y, z) */
  initialCameraPosition: { x: 0, y: 1.5, z: 4 },
  /** Initial camera FOV */
  cameraFov: 60,
   /** Camera near plane */
  cameraNear: 0.1,
  /** Camera far plane */
  cameraFar: 1000,

  /** OrbitControls damping factor */
  controlsDampingFactor: 0.05,
  /** OrbitControls minimum distance */
  controlsMinDistance: 0.1, // Allow zooming in closer
  /** OrbitControls maximum distance */
  controlsMaxDistance: 200, // Allow zooming out further
  /** Initial controls target position (x, y, z) */
  initialControlsTarget: { x: 0, y: 1, z: 0 },


  /** Path to the DRACO decoder files (ensure this is correct and accessible) */
  dracoDecoderPath: 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/gltf/',

   /** Fade duration for animation transitions (in seconds) */
  animationFadeDuration: 0.3,

   /** Zoom factor applied when focusing camera on model */
  cameraFocusZoomFactor: 1.5,
  /** Minimum distance for camera when focusing */
  cameraFocusMinDistance: 1.0,
   /** Vertical offset factor for camera when focusing (relative to model height) */
  cameraFocusVerticalOffsetFactor: 0.2,


};

// Make the config object available for import
export default config;