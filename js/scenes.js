// 메뉴용 쇼케이스(아이보리 스튜디오의 레드 박스·피스), 정체 드러남 장면, 썸네일
import { THREE, K, MAT, getEnv, getRenderer, draw, marbleTex, glowTex, additive, fitDist, isWide } from './gfx.js';
import { buildPiece, buildRedBox, buildChandelier } from './models.js';
import { makeRed, makeGuard } from './characters.js';
import { clamp } from './util.js';

const IVORY = 0xf3eee6;

// ---------- 쇼케이스 ----------
class Showcase {
  constructor() {
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.userData.fx = { bloom: 0.25, threshold: 0.96, grain: 0.022, vignette: 0.12 };
    this.bg = new THREE.Color(IVORY);
    scene.background = this.bg;
    scene.environment = getEnv();
    scene.environmentIntensity = 1.0;
    this.cam = new THREE.PerspectiveCamera(30, 0.5, 0.05, 50);

    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.14 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    scene.add(this.floor);
    this.darkFloor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshPhysicalMaterial({ map: marbleTex('#0c0b0b', '#bdb3a4', [6, 6], 10), roughness: 0.2, clearcoat: 1 }));
    this.darkFloor.rotation.x = -Math.PI / 2;
    this.darkFloor.position.y = -0.001;
    this.darkFloor.receiveShadow = true;
    scene.add(this.darkFloor);

    // 상아색 석재 받침
    this.plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.3, 96), new THREE.MeshStandardMaterial({ color: 0xece5da, roughness: 0.6 }));
    this.plinth.position.y = 0.15;
    this.plinth.castShadow = this.plinth.receiveShadow = true;
    scene.add(this.plinth);
    this.plinthRim = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.006, 8, 128), MAT.gold());
    this.plinthRim.rotation.x = Math.PI / 2;
    this.plinthRim.position.y = 0.3;
    scene.add(this.plinthRim);

    this.box = buildRedBox();
    this.box.scale.setScalar(1.15);
    scene.add(this.box);

    const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
    key.position.set(-2.5, 6, 3.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -2;
    key.shadow.camera.right = key.shadow.camera.top = 2;
    key.shadow.radius = 6;
    key.shadow.bias = -0.0004;
    scene.add(key);
    this.key = key;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xd8cfc2, 0.8);
    scene.add(this.hemi);
    this.spot = new THREE.SpotLight(0xffe8c8, 0, 8, 0.35, 0.6, 1.3);
    this.spot.position.set(0.3, 4.5, 1.5);
    this.spot.castShadow = true;
    scene.add(this.spot, this.spot.target);

    this.pieces = {};
    this.mode = 'title';
    this.t = 0;
    this.openT = 0;
    this.set({ mode: 'title', piece: 'panthere-brooch' });
  }

  getPiece(id) {
    if (!this.pieces[id]) {
      const p = buildPiece(id);
      this.scene.add(p);
      this.pieces[id] = p;
    }
    return this.pieces[id];
  }

  set({ mode, piece, offsetY = 0 }) {
    this.mode = mode;
    this.offsetY = offsetY;
    this.openT = 0;
    for (const k in this.pieces) this.pieces[k].visible = false;
    this.cur = piece ? this.getPiece(piece) : null;
    if (this.cur) this.cur.visible = true;
    const dark = mode === 'redbox';
    this.bg.setHex(dark ? 0x050404 : IVORY);
    this.darkFloor.visible = dark;
    this.floor.visible = !dark;
    this.hemi.intensity = dark ? 0.08 : 0.8;
    this.scene.userData.fx = dark ? { bloom: 0.8, threshold: 0.85, grain: 0.05, vignette: 0.6 } : { bloom: 0.25, threshold: 0.96, grain: 0.022, vignette: 0.12 };
    this.key.intensity = dark ? 0.25 : 1.7;
    this.spot.intensity = dark ? 60 : 0;
    this.scene.environmentIntensity = dark ? 0.6 : 1.0;
    const boxMode = mode === 'title' || mode === 'redbox';
    this.box.visible = boxMode;
    this.plinth.visible = this.plinthRim.visible = !boxMode;
  }

  render(dt) {
    this.t += dt;
    const t = this.t;
    const lid = this.box.userData.lid;
    const wide = isWide();
    if (this.mode === 'title') {
      lid.rotation.x = -1.95;
      this.box.position.set(0, 0, 0);
      this.box.rotation.y = -0.35;
      if (this.cur) {
        this.cur.scale.setScalar(0.42);
        this.cur.position.set(0, 0.62 + Math.sin(t * 1.1) * 0.025, 0.05);
        this.cur.rotation.set(0, t * 0.5, 0);
      }
      const a = Math.sin(t * 0.12) * 0.35;
      const dd = fitDist(this.cam, 1.1, wide ? 1.05 : 0.8);
      this.cam.position.set(Math.sin(a) * dd, dd * 0.42, Math.cos(a) * dd);
      this.cam.lookAt(0, 0.38, 0);
    } else if (this.mode === 'redbox') {
      this.openT += dt;
      const u = clamp((this.openT - 0.5) / 1.4, 0, 1);
      const e = 1 - Math.pow(1 - u, 3);
      lid.rotation.x = -1.95 * e;
      this.box.rotation.y = -0.2 + t * 0.05;
      this.spot.target.position.set(0, 0.3, 0);
      if (this.cur) {
        const r = clamp((this.openT - 1.6) / 1.2, 0, 1);
        this.cur.visible = r > 0;
        this.cur.scale.setScalar(0.38 * r);
        this.cur.position.set(0, 0.35 + r * 0.32, 0.05);
        this.cur.rotation.set(0, t * 0.5, 0);
      }
      const dd = fitDist(this.cam, 1.05, 0.95) * (1 - Math.min(1, this.openT * 0.3) * 0.1);
      this.cam.position.set(0, dd * 0.45, dd);
      this.cam.lookAt(0, 0.4, 0);
    } else {
      if (this.cur) {
        this.cur.scale.setScalar(0.62);
        this.cur.position.set(0, 0.85 + Math.sin(t * 1.1) * 0.02, 0);
        this.cur.rotation.set(0, t * 0.55, 0);
      }
      const dd = fitDist(this.cam, 0.62, wide ? 0.95 : 0.62);
      this.cam.position.set(0, 0.85 + dd * 0.18, dd);
      this.cam.lookAt(0, 0.8, 0);
    }
    draw(this.scene, this.cam, wide ? 0 : this.offsetY, wide ? 0.21 : 0);
  }
}

let showcase = null;
export function getShowcase() {
  if (!showcase) showcase = new Showcase();
  return showcase;
}

// ---------- 정체가 드러나는 순간 ----------
export class Reveal {
  constructor() {
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.userData.fx = { bloom: 1.0, threshold: 0.85, grain: 0.05, vignette: 0.6 };
    scene.background = new THREE.Color(0x020202);
    scene.environment = getEnv();
    scene.environmentIntensity = 0.15;
    this.cam = new THREE.PerspectiveCamera(42, 0.5, 0.1, 60);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshPhysicalMaterial({ map: marbleTex('#e9e3d9', '#7d7366', [3, 2], 12), roughness: 0.15, clearcoat: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), new THREE.MeshStandardMaterial({ map: marbleTex('#d9d1c4', '#857a6c', [3, 1.5], 8), roughness: 0.4 }));
    wall.position.set(0, 7, -3);
    scene.add(wall);
    // 계단
    const stepMat = new THREE.MeshStandardMaterial({ map: marbleTex('#ece6dc', '#8b8174', [1, 1], 6), roughness: 0.3 });
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3 * (i + 1), 3), stepMat);
      s.position.set(0.6 + i * 0.42, 0.15 * (i + 1), -1.4);
      s.receiveShadow = s.castShadow = true;
      scene.add(s);
      const nose = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.02, 3.02), MAT.gold());
      nose.position.set(0.6 + i * 0.42, 0.3 * (i + 1), -1.4);
      scene.add(nose);
    }
    this.chand = [];
    this.lights = [];
    for (let i = 0; i < 4; i++) {
      const c = buildChandelier(1.1);
      c.position.set(-3.4 + i * 2.6, 5.4, -0.8);
      scene.add(c);
      this.chand.push(c);
      const l = new THREE.PointLight(0xffd9a0, 0, 14, 1.4);
      l.position.set(c.position.x, 4.8, 0);
      l.castShadow = i === 1;
      scene.add(l);
      this.lights.push(l);
    }
    scene.add(new THREE.HemisphereLight(0xffeedd, 0x000000, 0.02));
    this.guard = makeGuard({ scale: 1.05 });
    this.guard.group.position.set(0.6 + 7 * 0.42, 2.4, -1.2);
    this.guard.group.rotation.y = Math.PI;
    scene.add(this.guard.group);
    this.red = makeRed({ scale: 1.1 });
    this.red.group.position.set(-1.2, 0, 0.8);
    this.red.group.rotation.y = 0.5;
    scene.add(this.red.group);
  }

  render(t) {
    this.chand.forEach((c, i) => {
      const k = clamp((t - 0.25 - i * 0.3) / 0.3, 0, 1);
      c.userData.bulb.emissiveIntensity = 0.2 + k * 3;
      c.userData.glow.material.opacity = k * 0.8;
      this.lights[i].intensity = k * 90;
    });
    const dd = fitDist(this.cam, 3.4, 3.2);
    this.cam.position.set(0.7, 2.6, dd);
    this.cam.lookAt(0.7, 2.4, 0);
    const ga = clamp((t - 1.1) / 0.5, 0, 1);
    this.guard.group.visible = ga > 0;
    this.guard.group.position.y = 2.4 - (1 - ga) * 0.3;
    const lift = clamp((t - 1.5) / 0.4, 0, 1) * (1 - clamp((t - 2.2) / 0.3, 0, 1));
    this.red.setPose('stand', 0, { hatLift: lift * 7 });
    const away = clamp((t - 2.2) / 0.6, 0, 1);
    this.red.group.position.x = -1.2 - away * 1.6;
    this.red.group.position.z = 0.8 - away * 1.2;
    this.red.setOpacity(1 - away);
    draw(this.scene, this.cam);
  }
}

// ---------- 썸네일 (살롱 카드) ----------
let thumbScene = null;
const jobs = [];
export function queueThumb(canvas, id, opts = {}) { jobs.push({ canvas, id, opts }); }

function getThumbScene() {
  if (thumbScene) return thumbScene;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfbf8f3);
  scene.environment = getEnv();
  const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
  key.position.set(-2, 5, 4);
  scene.add(key, new THREE.HemisphereLight(0xffffff, 0xd8cfc2, 0.9));
  const cam = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
  cam.position.set(0, 0.5, 3.2);
  cam.lookAt(0, 0, 0);
  thumbScene = { scene, cam, pieces: {}, sil: new THREE.MeshBasicMaterial({ color: 0xdcd5ca }) };
  return thumbScene;
}

export function processThumbs() {
  if (!jobs.length) return;
  const r = getRenderer();
  const ts = getThumbScene();
  const full = r.getSize(new THREE.Vector2());
  const dpr = r.getPixelRatio();
  r.setScissorTest(true);
  while (jobs.length) {
    const { canvas, id, opts } = jobs.shift();
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) continue;
    const w = Math.min(rect.width, full.x);
    const h = Math.min(rect.height, full.y);
    for (const k in ts.pieces) ts.pieces[k].visible = false;
    if (!ts.pieces[id]) { ts.pieces[id] = buildPiece(id); ts.scene.add(ts.pieces[id]); }
    const p = ts.pieces[id];
    p.visible = true;
    p.rotation.set(0, 0.5, 0);
    ts.scene.overrideMaterial = opts.silhouette ? ts.sil : null;
    ts.cam.aspect = w / h;
    ts.cam.updateProjectionMatrix();
    r.setViewport(0, 0, w, h);
    r.setScissor(0, 0, w, h);
    r.render(ts.scene, ts.cam);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const src = r.domElement;
    canvas.getContext('2d').drawImage(src, 0, src.height - h * dpr, w * dpr, h * dpr, 0, 0, canvas.width, canvas.height);
  }
  r.setScissorTest(false);
  r.setViewport(0, 0, full.x, full.y);
}

// 빈 화면 (전환 중)
const blank = new THREE.Scene();
blank.background = new THREE.Color(0x000000);
const blankCam = new THREE.PerspectiveCamera();
export function drawBlank() { draw(blank, blankCam); }

export { K, glowTex, additive };
