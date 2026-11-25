/* =========================================================
   MascotStage — one fixed WebGL layer that hosts the 3D mascot.

   • Each section contains an invisible anchor:
       <div class="m-anchor" data-mascot="about" data-yaw="20"></div>
     Its box = where the mascot (on its little pedestal) stands.
     Feet sit on the pedestal; the pedestal's bottom = the box bottom.
   • The stage follows the anchor closest to the middle of the screen;
     when that changes, the mascot hops + spins across.
   • The hero anchor (data-tooth) also places the big 3D tooth platform.
   • Arm animation: the model has no skeleton, so the crossed arms are
     "skinned" procedurally in the vertex shader (lift / pitch / roll).
     If you swap in a rigged GLB that contains animation clips named
     e.g. "Idle", "Wave", "Cheer", "Walk", those are used instead.
   ========================================================= */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const FOV = 22;
const CAM_Z = 30;
const TAU = Math.PI * 2;
const BASE_H = 0.075; // pedestal height, relative to mascot height
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t, s = 1.7) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

function radialTexture(stops, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => grd.addColorStop(o, col));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- shared materials ---------- */
const MAT = {
  marble: () => new THREE.MeshPhysicalMaterial({ color: 0xefebe1, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.9 }),
  marbleTop: () => new THREE.MeshPhysicalMaterial({ color: 0xe2e5d6, roughness: 0.35, clearcoat: 0.5, envMapIntensity: 0.8 }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xd9a74a, metalness: 1, roughness: 0.24, emissive: 0x7a5410, emissiveIntensity: 0.35, envMapIntensity: 1.2 }),
  led: () => new THREE.MeshBasicMaterial({ color: 0xffe2a0, toneMapped: false }),
};

/* ---------- big hero tooth + platform ---------- */
function buildToothPlatform() {
  const group = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(0, 0.88);
  s.bezierCurveTo(0.22, 1.04, 0.7, 1.12, 0.9, 0.86);
  s.bezierCurveTo(1.08, 0.62, 1.04, 0.18, 0.9, -0.12);
  s.bezierCurveTo(0.8, -0.38, 0.76, -0.88, 0.62, -1.08);
  s.bezierCurveTo(0.52, -1.22, 0.38, -1.14, 0.34, -0.9);
  s.bezierCurveTo(0.29, -0.62, 0.2, -0.46, 0, -0.46);
  s.bezierCurveTo(-0.2, -0.46, -0.29, -0.62, -0.34, -0.9);
  s.bezierCurveTo(-0.38, -1.14, -0.52, -1.22, -0.62, -1.08);
  s.bezierCurveTo(-0.76, -0.88, -0.8, -0.38, -0.9, -0.12);
  s.bezierCurveTo(-1.04, 0.18, -1.08, 0.62, -0.9, 0.86);
  s.bezierCurveTo(-0.7, 1.12, -0.22, 1.04, 0, 0.88);

  let tg = new THREE.ExtrudeGeometry(s, { depth: 0.55, curveSegments: 72, bevelEnabled: true, bevelThickness: 0.6, bevelSize: 0.3, bevelSegments: 20 });
  tg.center();
  tg.deleteAttribute("normal");
  tg.deleteAttribute("uv");
  tg = mergeVertices(tg, 1e-4);
  tg.computeVertexNormals();
  {
    tg.computeBoundingBox();
    const { min, max } = tg.boundingBox;
    const pos = tg.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const lo = new THREE.Color(0xd9ccb4), hi = new THREE.Color(0xfffcf4), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      c.copy(lo).lerp(hi, Math.pow((pos.getY(i) - min.y) / (max.y - min.y), 0.7));
      cols.set([c.r, c.g, c.b], i * 3);
    }
    tg.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  }
  const tooth = new THREE.Mesh(tg, new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.3, metalness: 0,
    clearcoat: 0.9, clearcoatRoughness: 0.12, sheen: 0.3, sheenColor: new THREE.Color(0xfff0d6), sheenRoughness: 0.6, envMapIntensity: 0.75,
  }));
  tooth.scale.set(0.92, 0.74, 0.92);

  const marble = MAT.marble(), gold = MAT.gold();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.6, 0.24, 128), marble); base.position.y = 0.12;
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.555, 0.03, 16, 220), gold); band.rotation.x = Math.PI / 2; band.position.y = 0.24;
  const led = new THREE.Mesh(new THREE.TorusGeometry(1.605, 0.014, 8, 220), MAT.led()); led.rotation.x = Math.PI / 2; led.position.y = 0.025;
  const tier = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.22, 0.12, 128), marble); tier.position.y = 0.3;
  const band2 = new THREE.Mesh(new THREE.TorusGeometry(1.185, 0.024, 16, 200), gold); band2.rotation.x = Math.PI / 2; band2.position.y = 0.36;
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.02, 128), MAT.marbleTop()); inner.position.y = 0.365;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({
    map: radialTexture([[0, "rgba(255,214,130,0.85)"], [0.32, "rgba(255,200,110,0.35)"], [0.7, "rgba(255,200,110,0)"]]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.004;

  tooth.geometry.computeBoundingBox();
  tooth.position.y = 0.365 - tooth.geometry.boundingBox.min.y * tooth.scale.y - 0.1;
  group.add(glow, base, band, led, tier, band2, inner, tooth);
  group.userData = { tooth, glow };

  group.updateMatrixWorld(true);
  const hit = new THREE.Raycaster(new THREE.Vector3(0, 20, 0), new THREE.Vector3(0, -1, 0)).intersectObject(tooth)[0];
  group.userData.topLocal = hit ? hit.point.clone() : new THREE.Vector3(0, 2.4, 0);
  group.userData.height = new THREE.Box3().setFromObject(group).max.y;
  return group;
}

/* ---------- the little figurine pedestal that travels with the mascot ---------- */
function buildBase() {
  const g = new THREE.Group();
  const marble = MAT.marble(), gold = MAT.gold();
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.045, 72), marble); top.position.y = -0.0225;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.292, 0.0055, 10, 120), gold); band.rotation.x = Math.PI / 2; band.position.y = -0.002;
  const low = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.35, 0.03, 72), marble); low.position.y = -0.06;
  const band2 = new THREE.Mesh(new THREE.TorusGeometry(0.332, 0.005, 10, 120), gold); band2.rotation.x = Math.PI / 2; band2.position.y = -0.045;
  const led = new THREE.Mesh(new THREE.TorusGeometry(0.352, 0.0035, 8, 120), MAT.led()); led.rotation.x = Math.PI / 2; led.position.y = -0.073;
  g.add(top, band, low, band2, led);
  return g;
}

export class MascotStage {
  constructor({ canvas, modelUrl, reduceMotion = false }) {
    this.canvas = canvas;
    this.modelUrl = modelUrl;
    this.reduce = reduceMotion;
    this.ready = false;
    this.introDone = false;
    this.listeners = {};

    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" }));
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 1, 200);
    this.camera.position.set(0, 0, CAM_Z);
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xfff8ea, 0x7d9068, 0.9));
    const key = new THREE.DirectionalLight(0xfff0d6, 2.0); key.position.set(-11, 9, 9);
    const rim = new THREE.DirectionalLight(0xeef8ff, 1.8); rim.position.set(8, 5, -10);
    const fill = new THREE.DirectionalLight(0xffe0b0, 0.55); fill.position.set(6, -3, 8);
    this.scene.add(key, rim, fill);

    // rig: root (feet) → [base] + yaw → squash → model
    this.root = new THREE.Group();
    this.yawG = new THREE.Group();
    this.squashG = new THREE.Group();
    this.base = buildBase();
    this.root.add(this.base, this.yawG);
    this.yawG.add(this.squashG);
    this.root.visible = false;
    this.scene.add(this.root);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: radialTexture([[0, "rgba(20,35,18,0.55)"], [0.5, "rgba(20,35,18,0.18)"], [1, "rgba(20,35,18,0)"]]), transparent: true, depthWrite: false })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.visible = false;
    this.scene.add(this.shadow);

    this.platform = buildToothPlatform();
    this.platform.visible = false;
    this.scene.add(this.platform);

    // state
    this.anchors = [];
    this.active = null;
    this.pos = new THREE.Vector3(0, -40, 0);
    this.height = 1;
    this.yaw = 0;
    this.pitch = 0;
    this.trans = null;
    this.spinT = 0;
    this.hopT = 1; this.hopH = 0;
    this.sq = 0; this.sqV = 0;
    this.walkPhase = 0; this.walkBlend = 0;
    this.baseK = 0;
    this.nextIdle = 5;
    this.pointer = { x: 0.5, y: 0.5 };
    this.introT = -1;
    this.time = 0;
    this.gest = null;
    this.arm = new THREE.Vector4();      // current  (lift, pitch, roll, push)
    this.armT = new THREE.Vector4();     // target

    window.addEventListener("pointermove", (e) => {
      this.pointer.x = e.clientX / window.innerWidth;
      this.pointer.y = e.clientY / window.innerHeight;
    }, { passive: true });
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.collectAnchors();
  }

  on(type, fn) { (this.listeners[type] ||= []).push(fn); }
  emit(type, d) { (this.listeners[type] || []).forEach((fn) => fn(d)); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.vw = w; this.vh = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w < 768 ? 1.5 : 1.75));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.visH = 2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * CAM_Z;
    this.k = this.visH / h;
  }

  collectAnchors() {
    this.anchors = Array.from(document.querySelectorAll("[data-mascot]")).map((el) => ({
      el,
      name: el.dataset.mascot,
      yaw: THREE.MathUtils.degToRad(parseFloat(el.dataset.yaw || "0")),
      tooth: el.hasAttribute("data-tooth"),
      walk: el.hasAttribute("data-walk"),
      ratio: parseFloat(el.dataset.ratio || "1"),
      lastX: null, vx: 0,
    }));
  }

  async load(onProgress) {
    const gltf = await new GLTFLoader().loadAsync(this.modelUrl, (e) => {
      if (onProgress) onProgress(e.total ? e.loaded / e.total : Math.min(0.95, e.loaded / 4.2e6));
    });
    const model = gltf.scene;
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y;

    if (gltf.animations && gltf.animations.length) {
      // rigged model: use its own clips
      this.mixer = new THREE.AnimationMixer(model);
      this.clips = {};
      for (const clip of gltf.animations) {
        const n = clip.name.toLowerCase();
        const key = /wave|hello|greet/.test(n) ? "hello" : /cheer|jump|celebr|happy/.test(n) ? "cheer" : /walk|run/.test(n) ? "walk" : /idle|breath/.test(n) ? "idle" : n;
        this.clips[key] = this.mixer.clipAction(clip);
      }
      if (this.clips.idle) this.clips.idle.play();
    }

    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material.envMapIntensity = 0.55;
      if (o.material.map) o.material.map.anisotropy = Math.min(8, maxAniso);
      if (!this.mixer) this.rigArms(o, box);
    });
    model.scale.setScalar(1 / h);
    model.position.set(-((box.max.x + box.min.x) / 2) / h, -box.min.y / h, -((box.max.z + box.min.z) / 2) / h);
    this.squashG.add(model);
    this.model = model;
    this.renderer.compile(this.scene, this.camera);
    this.ready = true;
  }

  /* Procedural arm skinning for the un-rigged model (crossed forearms). */
  rigArms(mesh, box) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const H = box.max.y - box.min.y;
    const y0 = box.min.y;
    // region of the crossed forearms in normalised height (0 = feet, 1 = top of head)
    const w = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const y = (pos.getY(i) - y0) / H, z = pos.getZ(i) / H;
      w[i] = ss(0.33, 0.38, y) * (1 - ss(0.48, 0.53, y)) * ss(0.05, 0.1, z);
    }
    geo.setAttribute("armW", new THREE.BufferAttribute(w, 1));
    const pivot = new THREE.Vector3(0, y0 + 0.42 * H, 0.06 * H);
    const uArm = { value: this.arm };
    const uScale = { value: H };
    const mat = mesh.material;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uArm = uArm;
      shader.uniforms.uArmPivot = { value: pivot };
      shader.uniforms.uArmScale = uScale;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>
          attribute float armW;
          uniform vec4 uArm;
          uniform vec3 uArmPivot;
          uniform float uArmScale;
          vec3 armRot(vec3 p, float k) {
            float a = uArm.y * k; float ca = cos(a), sa = sin(a);
            p = vec3(p.x, p.y * ca - p.z * sa, p.y * sa + p.z * ca);
            float b = uArm.z * k; float cb = cos(b), sb = sin(b);
            return vec3(p.x * cb - p.y * sb, p.x * sb + p.y * cb, p.z);
          }`)
        .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>
          objectNormal = armRot(objectNormal, armW);`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>
          transformed = armRot(transformed - uArmPivot, armW) + uArmPivot + vec3(0.0, uArm.x * armW, uArm.w * armW) * uArmScale;`);
    };
    mat.customProgramCacheKey = () => "bs-mascot-arms";
    mat.needsUpdate = true;
  }

  /* ---------- public actions ---------- */
  intro() {
    this.introT = 0;
    this.root.visible = true;
    this.platform.visible = true;
    this.shadow.visible = true;
  }
  /** Arm gesture: "hello" (rocking wave), "cheer", "squeeze". */
  gesture(name = "hello") {
    if (this.reduce) return;
    if (this.mixer && this.clips[name]) {
      const a = this.clips[name];
      a.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.25).play();
      a.clampWhenFinished = false;
      return;
    }
    const dur = { hello: 2.1, cheer: 1.5, squeeze: 0.9 }[name] || 1.5;
    this.gest = { name, t: 0, dur };
  }
  spin() { if (this.spinT <= 0) { this.spinT = 1; this.hop(0.45); this.gesture("cheer"); } }
  hop(strength = 0.18) { if (this.hopT >= 1) { this.hopT = 0; this.hopH = strength; this.sqV -= 3 * strength; } }
  celebrate() {
    this.spinT = 1; this.hop(0.6); this.gesture("cheer");
    setTimeout(() => { this.hopT = 1; this.hop(0.4); }, 750);
  }
  travelTo(anchor, instant = false) {
    const prev = this.active;
    this.active = anchor;
    if (instant || !prev || this.reduce) { this.trans = null; if (prev) this.emit("anchor", anchor.name); return; }
    this.trans = { t: 0, from: this.pos.clone(), fromH: this.height, dur: 1.05 };
    this.emit("anchor", anchor.name);
  }

  /* ---------- geometry ---------- */
  toWorld(x, y) { return [(x - this.vw / 2) * this.k, -(y - this.vh / 2) * this.k]; }

  targetFor(a) {
    const r = a.rect;
    if (a.tooth) {
      const top = this.platform.userData.topLocal.clone().applyMatrix4(this.platform.matrixWorld);
      return { x: top.x, y: top.y - 0.02 * this.platform.scale.y, h: r.height * this.k * a.ratio, ground: top.y };
    }
    const [x, y] = this.toWorld(r.left + r.width / 2, r.bottom);
    const h = (r.height * this.k) / (1 + BASE_H);
    return { x, y: y + h * BASE_H, h, ground: y };
  }

  pickActive() {
    const vh = this.vh;
    let best = null, bestD = Infinity, curD = Infinity;
    for (const a of this.anchors) {
      const r = a.rect;
      if (!r) continue;
      const visible = r.bottom > vh * 0.15 && r.top < vh * 0.85;
      const d = Math.abs((r.top + r.bottom) / 2 - vh * 0.5);
      if (a === this.active) curD = visible ? d : Infinity;
      if (visible && d < bestD) { best = a; bestD = d; }
    }
    if (best && best !== this.active && bestD + 60 < curD) this.travelTo(best);
  }

  /* ---------- arms ---------- */
  updateArms(dt) {
    const t = this.armT.set(Math.sin(this.time * 2.3) * 0.004, 0, 0, 0); // breathing
    let sway = 0;
    const g = this.gest;
    if (g) {
      g.t += dt;
      const p = g.t / g.dur;
      if (p >= 1) this.gest = null;
      else {
        const env = Math.pow(Math.sin(Math.PI * p), 0.55);
        if (g.name === "hello") {
          const wob = Math.sin(g.t * 12.5);
          t.z += wob * 0.24 * env; t.x += 0.028 * env; t.y -= 0.22 * env; sway = -wob * 0.05 * env;
        } else if (g.name === "cheer") {
          t.x += 0.05 * env * Math.abs(Math.sin(g.t * 10)); t.y -= 0.36 * env; t.w += 0.012 * env;
        } else if (g.name === "squeeze") {
          t.x += 0.014 * env; t.y -= 0.1 * env; t.w -= 0.008 * env;
        }
      }
    }
    t.z += Math.sin(this.walkPhase) * 0.13 * this.walkBlend;
    const k = 1 - Math.exp(-22 * dt);
    this.arm.x += (t.x - this.arm.x) * k;
    this.arm.y += (t.y - this.arm.y) * k;
    this.arm.z += (t.z - this.arm.z) * k;
    this.arm.w += (t.w - this.arm.w) * k;
    return sway;
  }

  /* ---------- per frame ---------- */
  tick(dt) {
    if (!this.ready) return;
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    if (this.mixer) this.mixer.update(dt);

    for (const a of this.anchors) {
      const r = a.el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { a.rect = null; continue; }
      a.rect = r;
      const cx = r.left + r.width / 2;
      if (a.lastX !== null) a.vx = damp(a.vx, (cx - a.lastX) / Math.max(dt, 1e-3), 10, dt);
      a.lastX = cx;
    }

    // hero platform follows its anchor
    const heroA = this.anchors.find((a) => a.tooth);
    if (heroA && heroA.rect) {
      const r = heroA.rect;
      const [x, y] = this.toWorld(r.left + r.width / 2, r.bottom);
      const s = (r.height * this.k) / this.platform.userData.height;
      let k = s;
      if (this.introT >= 0 && this.introT < 1.4) {
        const p = clamp(this.introT / 0.9, 0, 1);
        k = s * (p === 0 ? 0.001 : easeOutBack(p, 1.4));
      }
      this.platform.scale.setScalar(Math.max(k, 0.001));
      this.platform.position.set(x, y, 0);
      this.platform.rotation.y = damp(this.platform.rotation.y, (this.pointer.x - 0.5) * 0.35, 3, dt);
      this.platform.updateMatrixWorld(true);
      this.platform.userData.glow.material.opacity = 0.75 + Math.sin(this.time * 2) * 0.15;
    }

    if (!this.active) {
      const first = heroA && heroA.rect ? heroA : this.anchors.find((a) => a.rect);
      if (first) this.travelTo(first, true);
    } else if (this.introDone) {
      this.pickActive();
    }
    const a = this.active;
    if (!a || !a.rect) { this.render(); return; }

    const tgt = this.targetFor(a);
    let x = tgt.x, y = tgt.y, h = tgt.h, ground = tgt.ground;
    let extraYaw = 0;

    // intro: drop from the sky onto the tooth, then say hello
    if (this.introT >= 0 && !this.introDone) {
      this.introT += dt;
      const p = clamp((this.introT - 0.55) / 0.75, 0, 1);
      y += (1 - p * p) * this.visH * 0.9;
      extraYaw = (1 - p) * TAU;
      if (p >= 1) {
        this.introDone = true; this.sqV = -5.5;
        this.emit("landed", a.name);
        setTimeout(() => this.gesture("hello"), 250);
      }
    }

    // travel between anchors
    if (this.trans) {
      const T = this.trans;
      T.t = Math.min(1, T.t + dt / T.dur);
      const e = easeInOut(T.t);
      const dist = Math.hypot(x - T.from.x, y - T.from.y);
      const arc = Math.sin(Math.PI * T.t) * (this.visH * 0.12 + dist * 0.25);
      x = lerp(T.from.x, x, e);
      y = lerp(T.from.y, y, e) + arc;
      ground = y - arc;
      h = lerp(T.fromH, h, e);
      extraYaw += e * TAU;
      if (T.t >= 1) { this.trans = null; this.sqV = -4.5; this.gesture("hello"); this.emit("arrived", a.name); }
    }

    // walking (anchor moving sideways)
    const walking = a.walk && Math.abs(a.vx) > 25 && !this.trans;
    this.walkBlend = damp(this.walkBlend, walking ? 1 : 0, 8, dt);
    if (walking) this.walkPhase += dt * clamp(Math.abs(a.vx) / 55, 4, 14);
    y += Math.abs(Math.sin(this.walkPhase)) * h * 0.05 * this.walkBlend;

    // idle personality
    if (this.introDone && !this.trans && !walking && !this.reduce) {
      this.nextIdle -= dt;
      if (this.nextIdle <= 0) {
        const r = Math.random();
        if (r < 0.4) this.hop(0.12); else if (r < 0.75) this.gesture("squeeze"); else this.gesture("hello");
        this.nextIdle = 6 + Math.random() * 5;
      }
    }
    if (this.hopT < 1) {
      this.hopT = Math.min(1, this.hopT + dt / 0.6);
      y += Math.sin(Math.PI * this.hopT) * this.hopH * h;
      if (this.hopT >= 1) this.sqV -= 3.2;
    }
    if (this.spinT > 0) {
      this.spinT = Math.max(0, this.spinT - dt / 0.9);
      extraYaw += easeInOut(1 - this.spinT) * TAU;
    }

    const sway = this.updateArms(dt);

    // squash & stretch spring
    this.sqV += (-180 * this.sq - 14 * this.sqV) * dt;
    this.sq += this.sqV * dt;
    const breathe = this.reduce ? 0 : Math.sin(this.time * 2.3) * 0.012;
    const sq = clamp(this.sq, -0.25, 0.25);
    const sy = 1 + sq * 0.6 + breathe;
    const sxz = 1 - sq * 0.35 - breathe * 0.5;

    // look at the pointer
    const sx = this.vw / 2 + x / this.k;
    const syScr = this.vh / 2 - (y + h * 0.75) / this.k;
    const lookX = clamp((this.pointer.x * this.vw - sx) / (this.vw * 0.5), -1, 1);
    const lookY = clamp((this.pointer.y * this.vh - syScr) / (this.vh * 0.6), -1, 1);
    let yawT = a.yaw + lookX * 0.55;
    yawT = lerp(yawT, (Math.sign(a.vx) || 1) * Math.PI * 0.46, this.walkBlend);
    this.yaw = damp(this.yaw, yawT, 5, dt);
    this.pitch = damp(this.pitch, lookY * 0.16 * (1 - this.walkBlend), 5, dt);

    this.height = this.trans ? h : damp(this.height, h, 14, dt);
    this.pos.set(x, y, 0);

    // pedestal under the feet everywhere except on the big tooth
    this.baseK = damp(this.baseK, a.tooth && !this.trans ? 0 : 1, 7, dt);
    this.base.scale.setScalar(Math.max(this.baseK, 0.001));
    this.base.visible = this.baseK > 0.01;

    this.root.position.copy(this.pos);
    this.root.scale.setScalar(this.height);
    this.root.rotation.z = (this.reduce ? 0 : Math.sin(this.time * 1.2) * 0.02) + sway + Math.sin(this.walkPhase) * 0.06 * this.walkBlend;
    this.yawG.rotation.set(this.pitch, this.yaw + extraYaw, 0);
    this.squashG.scale.set(sxz, sy, sxz);

    const groundY = a.tooth && !this.trans ? tgt.y : ground;
    const lift = clamp((y - tgt.y) / Math.max(h, 1e-3), 0, 3);
    this.shadow.position.set(x, groundY + 0.002, -0.05);
    this.shadow.scale.setScalar(this.height * (a.tooth ? 0.85 : 0.95) * (1 - lift * 0.35));
    this.shadow.material.opacity = clamp(1 - lift * 0.8, 0, 1) * (this.trans ? 0.4 : 1);

    this.render();
  }

  render() {
    const onScreen = (y, half) => { const s = this.vh / 2 - y / this.k; return s > -half && s < this.vh + half; };
    const mascotVisible = this.root.visible && onScreen(this.root.position.y, this.height / this.k + 200);
    const platVisible = this.platform.visible && onScreen(this.platform.position.y, (this.platform.userData.height * this.platform.scale.y) / this.k + 200);
    if (!mascotVisible && !platVisible) {
      if (!this.cleared) { this.renderer.clear(); this.cleared = true; }
      return;
    }
    this.cleared = false;
    this.renderer.render(this.scene, this.camera);
  }
}
