// avatar.js - tailored for your rig (uses real viseme_* morphs, caps & smoothing, robust wave fallback)

// ========== Tunables ==========
// avatar.js — fixed version with lipsync + gestures + no recursion bug

let _avatar = {
  scene: null,
  skeleton: null,
  visemes: [],
  headBone: null,
  leftHandBone: null,
  rightHandBone: null,
  analyser: null,
  audioSource: null,
  audioCtx: null,
  speakingLoop: null,
  headLoop: null,
  handsLoop: null
};

// ---------- Rig Index ----------
function findBoneByNames(skeleton, names) {
  if (!skeleton) return null;
  const low = names.map(n => n.toLowerCase());
  return skeleton.bones.find(b => {
    const bn = (b.name || "").toLowerCase();
    return low.some(n => bn.includes(n));
  }) || null;
}

function indexRig(scene) {
  const skel = (scene.skeletons && scene.skeletons.length) ? scene.skeletons[0] : null;

  const headBone = findBoneByNames(skel, ["head","neck","wolf3d_head","mixamorig:head"]);
  const leftHand = findBoneByNames(skel, ["lefthand","hand_l","left","mixamorig:lefthand"]);
  const rightHand = findBoneByNames(skel, ["righthand","hand_r","right","mixamorig:righthand"]);

  // collect viseme morphs
  const visemes = [];
  scene.meshes.forEach(mesh=>{
    const mtm = mesh.morphTargetManager;
    if (mtm) {
      for (let i=0; i<mtm.numTargets; i++) {
        const t = mtm.getTarget(i);
        const name = (t.name || "").toLowerCase();
        if (name.includes("viseme") || name.includes("mouth") || name.includes("jaw")) {
          visemes.push(t);
        }
      }
    }
  });

  _avatar.skeleton = skel;
  _avatar.headBone = headBone;
  _avatar.leftHandBone = leftHand;
  _avatar.rightHandBone = rightHand;
  _avatar.visemes = visemes;

  console.log("Rig indexed ->", {
    head: headBone?.name,
    leftHand: leftHand?.name,
    rightHand: rightHand?.name,
    visemes: visemes.map(v=>v.name)
  });
}

// ---------- Anim helpers ----------
function nod(scene) {
  if (!_avatar.headBone) return;
  const bone = _avatar.headBone;
  const anim = new BABYLON.Animation("nodOnce","rotation.x",30,BABYLON.Animation.ANIMATIONTYPE_FLOAT,BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
  anim.setKeys([{frame:0,value:0},{frame:10,value:0.15},{frame:20,value:0}]);
  bone.animations=[anim];
  scene.beginAnimation(bone,0,20,false);
}

function startHeadIdle(scene) {
  if (!_avatar.headBone) return;
  const bone=_avatar.headBone;
  const anim=new BABYLON.Animation("headIdle","rotation.y",30,BABYLON.Animation.ANIMATIONTYPE_FLOAT,BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
  anim.setKeys([{frame:0,value:0},{frame:20,value:0.06},{frame:40,value:-0.06},{frame:60,value:0}]);
  bone.animations=[anim];
  _avatar.headLoop=scene.beginAnimation(bone,0,60,true,0.8);
}
function stopHeadIdle(){ if(_avatar.headLoop) _avatar.headLoop.stop(); _avatar.headLoop=null; }

function startHandsLoop(scene){
  const bones=[_avatar.leftHandBone,_avatar.rightHandBone].filter(Boolean);
  _avatar.handsLoop=[];
  bones.forEach((bone,idx)=>{
    const anim=new BABYLON.Animation("handTalk"+idx,"rotation.z",30,BABYLON.Animation.ANIMATIONTYPE_FLOAT,BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
    const sign=(idx%2===0)?1:-1;
    anim.setKeys([{frame:0,value:0},{frame:15,value:0.25*sign},{frame:30,value:-0.25*sign},{frame:45,value:0}]);
    bone.animations=[anim];
    _avatar.handsLoop.push(scene.beginAnimation(bone,0,45,true,1.0));
  });
}
function stopHandsLoop(){ if(Array.isArray(_avatar.handsLoop)) _avatar.handsLoop.forEach(l=>l.stop()); _avatar.handsLoop=null; }

function doWave(scene){
  const hand=_avatar.rightHandBone||_avatar.leftHandBone;
  if(!hand)return;
  const anim=new BABYLON.Animation("wave","rotation.z",30,BABYLON.Animation.ANIMATIONTYPE_FLOAT,BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
  anim.setKeys([{frame:0,value:0},{frame:8,value:0.5},{frame:16,value:-0.5},{frame:24,value:0.4},{frame:32,value:-0.4},{frame:40,value:0}]);
  hand.animations=[anim];
  scene.beginAnimation(hand,0,40,false,1.2);
}

// ---------- Lipsync ----------
function startLipsyncFromAudioElement(audioEl){
  const AudioContext=window.AudioContext||window.webkitAudioContext;
  if(!_avatar.audioCtx)_avatar.audioCtx=new AudioContext();
  if(_avatar.audioCtx.state==="suspended") _avatar.audioCtx.resume();

  if(_avatar.audioSource){ try{_avatar.audioSource.disconnect();}catch{} }

  _avatar.audioSource=_avatar.audioCtx.createMediaElementSource(audioEl);
  _avatar.analyser=_avatar.audioCtx.createAnalyser();
  _avatar.analyser.fftSize=1024;
  _avatar.audioSource.connect(_avatar.analyser);
  _avatar.analyser.connect(_avatar.audioCtx.destination);

  const buf=new Uint8Array(_avatar.analyser.fftSize);

  function update(){
    if(audioEl.paused||audioEl.ended){
      _avatar.visemes.forEach(t=>t.influence=0);
      _avatar.speakingLoop=null;
      return;
    }
    _avatar.analyser.getByteTimeDomainData(buf);
    let sum=0; for(let i=0;i<buf.length;i++){const v=(buf[i]-128)/128; sum+=v*v;}
    const rms=Math.sqrt(sum/buf.length);
    const loud=Math.min(1,Math.max(0,(rms-0.02)*8));

    if (_avatar.visemes.length) {
  _avatar.visemes.forEach(t => {
    // scale down amplitude so mouth moves less (max ~0.4 instead of 1.0)
    const scaled = loud * 0.6;     // lower this (e.g., 0.4) for even smaller movement
    const jitter = 0.8 + Math.random() * 0.2; // tiny randomness
    t.influence = Math.min(0.4, scaled * jitter); // clamp max to 0.4
  });
}

    _avatar.speakingLoop=requestAnimationFrame(update);
  }
  _avatar.speakingLoop=requestAnimationFrame(update);
}

function stopLipsync(){ if(_avatar.speakingLoop) cancelAnimationFrame(_avatar.speakingLoop); _avatar.visemes.forEach(t=>t.influence=0); _avatar.speakingLoop=null; }

// ---------- Speaking Impl ----------
function _triggerAvatarSpeakingImpl(scene,audioEl){
  nod(scene);
  startHeadIdle(scene);
  startHandsLoop(scene);
  startLipsyncFromAudioElement(audioEl);

  const cleanup=()=>{
    stopLipsync(); stopHeadIdle(); stopHandsLoop();
    audioEl.removeEventListener("ended",cleanup);
    audioEl.removeEventListener("pause",cleanup);
  };
  audioEl.addEventListener("ended",cleanup);
  audioEl.addEventListener("pause",cleanup);
}

// ---------- Scene setup ----------
window.addEventListener("DOMContentLoaded",function(){
  const canvas=document.getElementById("renderCanvas");
  const engine=new BABYLON.Engine(canvas,true);

  const createScene=async function(){
    const scene=new BABYLON.Scene(engine);
    new BABYLON.HemisphericLight("light",new BABYLON.Vector3(1,1,0),scene);

    const camera=new BABYLON.UniversalCamera("Camera",new BABYLON.Vector3(0,1.6,1.2),scene);
    camera.setTarget(new BABYLON.Vector3(0,1.5,0));
    camera.attachControl(canvas,false);

    await BABYLON.SceneLoader.AppendAsync("https://models.readyplayer.me/68b66d0788d9bef7f4b929b3.glb","",scene);

    // rotate root to face camera
    scene.meshes.forEach(m=>{if(m.name==="__root__")m.rotation=new BABYLON.Vector3(0,Math.PI,0);});

    indexRig(scene);

    _avatar.scene=scene;
    window.currentScene=scene;
    return scene;
  };

  createScene().then(scene=>{
    engine.runRenderLoop(()=>scene.render());
    window.addEventListener("resize",()=>engine.resize());
  });
});

// ---------- Global Exports ----------
window.triggerAvatarSpeaking=function(scene,audioEl){ try{_triggerAvatarSpeakingImpl(scene,audioEl);}catch(e){console.warn(e);} };
window.sayHiLikeTalkingTom=function(scene){ try{doWave(scene);}catch(e){console.warn(e);} };
