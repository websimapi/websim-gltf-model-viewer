// No configuration needed for this simple viewer yet.
// Potential future configs: default model URL, background color, light intensity etc.
export {}; // Make it a module
`````` index.html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GLTF Model Viewer</title>
    <style>
        body { margin: 0; overflow: hidden; background-color: #f0f0f0; font-family: sans-serif; }
        canvas { display: block; }
        #controls {
            position: absolute;
            top: 10px;
            left: 10px;
            background: rgba(255, 255, 255, 0.8);
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
            max-width: 300px;
        }
        #controls label, #controls select, #controls input[type="file"] {
            display: block;
            margin-bottom: 8px;
            width: 100%;
            box-sizing: border-box; /* Include padding and border in the element's total width and height */
        }
         #controls label {
            margin-bottom: 4px;
            font-weight: bold;
            font-size: 0.9em;
         }
        #controls input[type="file"] {
             padding: 8px;
             border: 1px solid #ccc;
             border-radius: 4px;
             background-color: #fff;
         }
         #controls select {
             padding: 8px;
             border: 1px solid #ccc;
             border-radius: 4px;
             background-color: #fff;
         }
        #error-message {
            position: absolute;
            bottom: 10px;
            left: 10px;
            background: rgba(220, 53, 69, 0.9); /* Bootstrap danger red */
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            font-size: 0.9em;
            display: none; /* Hidden by default */
            max-width: calc(100% - 40px); /* Prevent overflow */
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        #loading-indicator {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            font-size: 1.1em;
            display: none; /* Hidden by default */
            z-index: 10;
        }
    </style>
    <script type="importmap">
    {
      "imports": {
        "three": "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js",
        "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/"
      }
    }
    </script>
</head>
<body>
    <div id="controls">
        <label for="modelInput">Load GLTF/GLB Model:</label>
        <input type="file" id="modelInput" accept=".gltf,.glb">

        <label for="animationSelect">Select Animation:</label>
        <select id="animationSelect" disabled>
            <option>Load a model first</option>
        </select>
    </div>
    <div id="error-message"></div>
    <div id="loading-indicator">Loading...</div>
    <script type="module" src="main.js"></script>
</body>
</html>

// Configuration for the GLTF Viewer (currently unused)

const config = {
  backgroundColor: 0xcccccc, // Example: Background color
  ambientLightIntensity: 1.0, // Example: Ambient light intensity
  dracoDecoderPath: 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/gltf/', // Default path
};

export default config; // Export config object

