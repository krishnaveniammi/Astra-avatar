// avatarLanding.js - landing page avatar scene (bright, clear framing)
window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('renderCanvas');
  if (!canvas) return;

  const MODEL_URL = "https://models.readyplayer.me/68b66d0788d9bef7f4b929b3.glb"; // replace if needed

  const engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true });
  let scene = null;

  async function createScene() {
    const scene = new BABYLON.Scene(engine);

    // ✅ Dark blue background
    scene.clearColor = new BABYLON.Color4(0.05, 0.07, 0.12, 1);

    // ✅ Hemispheric ambient light
    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 1.0;

    // ✅ Directional fill light
    const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(0, -0.5, -1), scene);
    dir.position = new BABYLON.Vector3(0, 2, 2);
    dir.intensity = 0.8;
    dir.shadowEnabled = false;

    // ✅ Spotlight to brighten face
    const spot = new BABYLON.SpotLight(
      "spot",
      new BABYLON.Vector3(0, 2, 2),    // position above camera
      new BABYLON.Vector3(0, -1, -2),  // points toward avatar
      Math.PI / 2.5,
      20,
      scene
    );
    spot.intensity = 2.0;

    // ✅ Environment texture (soft reflections)
    const envTex = await BABYLON.CubeTexture.CreateFromPrefilteredData(
      "https://playground.babylonjs.com/textures/environment.env", scene
    );
    scene.environmentTexture = envTex;
    scene.environmentIntensity = 1.2;

    // ✅ Camera: chest-to-head view
    const camera = new BABYLON.ArcRotateCamera(
      "cam",
      Math.PI / 2,
      1.3,
      2.0, // distance
      new BABYLON.Vector3(0, 1.4, 0), // target chest/face
      scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 1.6;
    camera.upperRadiusLimit = 2.5;

    // ✅ Load avatar
    await BABYLON.SceneLoader.AppendAsync(MODEL_URL, "", scene);

    const root = scene.meshes.find(m => m.name === "__root__") || scene.meshes[0];
    if (root) {
      root.rotation = new BABYLON.Vector3(0, 0, 0);
      root.position = new BABYLON.Vector3(0, 0, 0);
      root.scaling = new BABYLON.Vector3(1, 1, 1);
    }

    // ✅ Force brighten all materials
    scene.meshes.forEach(mesh => {
      if (mesh.material && mesh.material instanceof BABYLON.PBRMaterial) {
        mesh.material.albedoColor = new BABYLON.Color3(1, 1, 1);
        mesh.material.metallic = 0.0;
        mesh.material.roughness = 0.5;
        mesh.material.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0.3); // self-light so never black
      }
    });

    return scene;
  }

  createScene().then(s => {
    scene = s;
    engine.runRenderLoop(() => {
      if (scene) scene.render();
    });
    window.addEventListener("resize", () => engine.resize());
  }).catch(err => console.error("Landing createScene failed:", err));
});
