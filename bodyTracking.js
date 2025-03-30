/**
 * Body Tracking Module using MediaPipe Tasks Vision
 */
import {
    PoseLandmarker,
    FilesetResolver,
    DrawingUtils
} from "@mediapipe/tasks-vision";
import { getWebcamVideoElement, getWebcamCanvasElement, showError } from './ui.js'; // Import UI functions including error display

let poseLandmarker = null;
let runningMode = "VIDEO"; // Or "IMAGE"
let webcamRunning = false;
let lastWebcamTime = -1;
let poseResultsCallback = null; // Function to call with pose results
let videoElement = null;
let canvasElement = null;
let canvasCtx = null;
let drawingUtils = null;

const POSE_LANDMARKS_MODEL_PATH = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
// const POSE_LANDMARKS_MODEL_PATH = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
// const POSE_LANDMARKS_MODEL_PATH = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task";


/**
 * Initializes the PoseLandmarker.
 * @param {Function} resultsCallback - Function to call with landmark results.
 */
export async function setupBodyTracking(resultsCallback) {
    poseResultsCallback = resultsCallback;
    videoElement = getWebcamVideoElement();
    canvasElement = getWebcamCanvasElement();
    canvasCtx = canvasElement.getContext("2d");
    drawingUtils = new DrawingUtils(canvasCtx);

    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm"
        );
        poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: POSE_LANDMARKS_MODEL_PATH,
                delegate: "GPU" // Use GPU if available, falls back to CPU
            },
            runningMode: runningMode,
            numPoses: 1, // Track only one person
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputSegmentationMasks: false // Not needed for skeleton mapping
        });
        console.log("PoseLandmarker created successfully.");
    } catch (error) {
        console.error("Error initializing PoseLandmarker:", error);
        showError(`Error initializing pose tracker: ${error.message}. Check console.`);
        throw error; // Re-throw to indicate failure
    }
}

/**
 * Enables the webcam feed and starts predicting poses.
 */
export async function startWebcam() {
    if (!poseLandmarker) {
        console.error("PoseLandmarker not initialized.");
        showError("Pose tracker not ready. Please wait or refresh.");
        return;
    }
    if (webcamRunning) {
        console.warn("Webcam is already running.");
        return; // Already running
    }

    // Get user media
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.srcObject = stream;
        videoElement.addEventListener("loadeddata", predictWebcam);
        webcamRunning = true;
        console.log("Webcam access granted and stream set.");
    } catch (error) {
        console.error("getUserMedia error:", error);
        showError(`Failed to access webcam: ${error.message}. Check browser permissions.`);
         webcamRunning = false; // Ensure state is correct
         throw error; // Re-throw to indicate failure
    }
}

/**
 * Stops the webcam feed and prediction loop.
 */
export function stopWebcam() {
    if (!webcamRunning) return; // Already stopped

    webcamRunning = false;
    videoElement.removeEventListener("loadeddata", predictWebcam);
    const stream = videoElement.srcObject;
    if (stream) {
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        videoElement.srcObject = null;
    }
     // Clear the canvas
     if (canvasCtx && canvasElement) {
         canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
     }
    console.log("Webcam stopped.");
}

/**
 * Prediction loop for webcam video stream.
 */
async function predictWebcam() {
    if (!webcamRunning) return; // Stop loop if webcam was disabled

     // Ensure video dimensions are set for canvas
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;


    // Start detecting poses
    let startTimeMs = performance.now();
    if (lastWebcamTime !== videoElement.currentTime && poseLandmarker) {
        lastWebcamTime = videoElement.currentTime;
        try {
            // Use detectForVideo for continuous streams
            const results = poseLandmarker.detectForVideo(videoElement, startTimeMs);

            // Draw landmarks on the canvas
            canvasCtx.save();
            canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
            if (results.landmarks && results.landmarks.length > 0) {
                 results.landmarks.forEach(landmark => {
                     drawingUtils.drawLandmarks(landmark, {
                         radius: (data) => DrawingUtils.lerp(data.from.z, -0.15, 0.1, 5, 1) // Adjust radius based on depth
                     });
                     drawingUtils.drawConnectors(landmark, PoseLandmarker.POSE_CONNECTIONS);
                 });

                // Pass world landmarks (3D) to the callback if available
                 if (results.worldLandmarks && results.worldLandmarks.length > 0 && poseResultsCallback) {
                      // Note: worldLandmarks are relative to the center of the hips.
                     poseResultsCallback(results.worldLandmarks[0]); // Pass landmarks of the first detected pose
                 } else if (results.landmarks && results.landmarks.length > 0 && poseResultsCallback) {
                      // Fallback to normalized 2D landmarks if 3D aren't available (though they should be)
                      // This might require different mapping logic in poseMapping.js
                      console.warn("Using normalized 2D landmarks for pose mapping (3D worldLandmarks preferred).");
                      poseResultsCallback(results.landmarks[0]);
                 }

            } else {
                 // No pose detected, maybe pass null to callback?
                 if (poseResultsCallback) poseResultsCallback(null);
            }
            canvasCtx.restore();

        } catch (error) {
             console.error("Error during pose detection:", error);
             // Potentially stop webcam if errors persist? For now, just log.
             showError(`Pose detection error: ${error.message}`);
             stopWebcam(); // Stop on error to prevent loop issues
             // Update UI to reflect tracking stopped due to error? Requires main.js access.
        }
    }

    // Call this function again to keep predicting when the browser is ready.
    if (webcamRunning) {
        window.requestAnimationFrame(predictWebcam);
    }
}

/**
 * Gets the latest pose landmarks detected (primarily for debugging or polling).
 * Note: The primary way to get poses is via the resultsCallback.
 */
export function getLatestPose() {
    // This function isn't strictly necessary with the callback approach,
    // but might be useful for debugging. It doesn't have access to the
    // latest results directly without storing them globally within this module.
    console.warn("getLatestPose is not implemented to return live data. Use the callback passed to setupBodyTracking.");
    return null; // Placeholder
}