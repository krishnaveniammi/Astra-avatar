// =================== avatarChat.js ===================
// RMS Audio-driven Lipsync (basic, no phoneme mapping)

(function () {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function collectMorphTargets(scene) {
    const list = [];
    scene.meshes.forEach(mesh => {
      const mtm = mesh.morphTargetManager;
      if (!mtm) return;
      for (let i = 0; i < mtm.numTargets; i++) {
        const t = mtm.getTarget(i);
        if (!t) continue;
        if (t.name.toLowerCase().includes("viseme") || t.name.toLowerCase().includes("mouth")) {
          list.push(t);
        }
      }
    });
    return list;
  }

  let _audioCtx = null;
  let _source = null;
  let _analyser = null;
  let _raf = null;

  function stopLipSync(targets) {
    if (_raf) cancelAnimationFrame(_raf);
    _raf = null;
    targets.forEach(t => t.influence = 0);
  }

  function startRMSLipSync(scene, audioEl) {
    const targets = collectMorphTargets(scene);
    if (!targets.length) {
      console.warn("No viseme/mouth morph targets found.");
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!_audioCtx) _audioCtx = new AudioContext();
    if (_audioCtx.state === "suspended") _audioCtx.resume();

    if (_source) try { _source.disconnect(); } catch {}
    _source = _audioCtx.createMediaElementSource(audioEl);
    _analyser = _audioCtx.createAnalyser();
    _analyser.fftSize = 1024;
    _source.connect(_analyser);
    _analyser.connect(_audioCtx.destination);

    const buf = new Uint8Array(_analyser.fftSize);

    function loop() {
      if (!audioEl || audioEl.paused || audioEl.ended) {
        stopLipSync(targets);
        return;
      }
      _analyser.getByteTimeDomainData(buf);

      // compute RMS loudness
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      const loud = clamp((rms - 0.02) * 8, 0, 1);

      // apply to morph targets
      targets.forEach((t, i) => {
        const desired = loud * (0.4 + (i % 3) * 0.2);
        t.influence = lerp(t.influence || 0, desired, 0.3);
      });

      _raf = requestAnimationFrame(loop);
    }

    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(loop);
  }

  // ===== Scene Setup =====
  const canvas = document.getElementById("renderCanvas");
  if (!canvas) return;
  const engine = new BABYLON.Engine(canvas, true);
  let chatScene = null;

  async function createScene() {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.05, 0.07, 0.12, 1);

    // ✅ Lighting
    const hemi = new BABYLON.HemisphericLight("hemi", new BABYLON.Vector3(0, 1, 0), scene);
    hemi.intensity = 1.2;

    const dir = new BABYLON.DirectionalLight("dir", new BABYLON.Vector3(0, -0.5, -1), scene);
    dir.position = new BABYLON.Vector3(0, 2, 2);
    dir.intensity = 1.0;
    dir.shadowEnabled = false; // disable shadows

    // ✅ Environment lighting
    const envTex = await BABYLON.CubeTexture.CreateFromPrefilteredData(
      "https://playground.babylonjs.com/textures/environment.env", scene
    );
    scene.environmentTexture = envTex;
    scene.environmentIntensity = 1.2;

    // ✅ Camera (fit avatar nicely)
    const camera = new BABYLON.ArcRotateCamera(
      "cam",
      Math.PI / 2,
      1.3,
      2.2,
      new BABYLON.Vector3(0, 1.4, 0),
      scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 1.8;
    camera.upperRadiusLimit = 2.5;

    // ✅ Load avatar
    await BABYLON.SceneLoader.AppendAsync(
      "https://models.readyplayer.me/68b66d0788d9bef7f4b929b3.glb", "", scene
    );

    const root = scene.meshes.find(m => m.name === "__root__") || scene.meshes[0];
    if (root) {
      root.rotation = new BABYLON.Vector3(0, 0, 0);
      root.position = new BABYLON.Vector3(0, 0, 0);
      root.scaling = new BABYLON.Vector3(1, 1, 1);
    }

    // ✅ Brighten materials
    scene.meshes.forEach(mesh => {
      if (mesh.material && mesh.material.albedoColor) {
        mesh.material.albedoColor = new BABYLON.Color3(1, 1, 1);
        mesh.material.metallic = 0.2;
        mesh.material.roughness = 0.6;
      }
    });

    return scene;
  }

  createScene().then(scene => {
    chatScene = scene;
    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());
  });

  // Global entry
  window.triggerChatSpeaking = function (audioEl) {
    if (!chatScene) {
      setTimeout(() => window.triggerChatSpeaking(audioEl), 300);
      return;
    }
    audioEl.play().catch(() => {});
    startRMSLipSync(chatScene, audioEl);
  };
})();
