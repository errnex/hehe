import * as THREE from 'three';
import './style.css';

// ================= Number Royale — Bot Mode =================
const MAP = 120; // half-size: map 240x240
const CHAR_SCALE = 0.56; // ~1.34-unit-tall characters (was ~2.4 units)
const CHAR_RADIUS = 0.34;
const CHAR_EYE = 1.22;
const CHAR_AIM_Y = 1.02;
const app = document.getElementById('app');
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ---------- Graphics quality (auto: LOW on touch, HIGH on desktop; chosen in SELECT GRAPHICS screen pre-match) ----------
// LOWQ is re-resolved at every startMatch so the pre-match choice applies without a page reload.
const QUALITY_KEY = 'nr_quality'; // 'auto' | 'low' | 'high'
function resolveQuality() {
  let q = 'auto';
  try { q = localStorage.getItem(QUALITY_KEY) || 'auto'; } catch (e) {}
  if (q === 'low') return 'low';
  if (q === 'high') return 'high';
  return isTouch ? 'low' : 'high';
}
let LOWQ = resolveQuality() === 'low';

// ---------- Renderer / Scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ec8f2);
scene.fog = new THREE.Fog(0xaed6f5, 60, LOWQ ? 190 : 220); // low quality: slightly closer fog
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);

const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x5a7048, 1.05); // warmer, livelier bounce
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe9c4, 1.25); // warm golden sun
sun.position.set(60, 90, 30);
scene.add(sun);

// ---------- Sky dome, sun disc & blocky clouds (v16 visual polish) ----------
function skyTexture(day) {
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 256;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  if (day) {
    gr.addColorStop(0.0, '#1e6fd2'); // vibrant blue zenith
    gr.addColorStop(0.5, '#5fb2ef');
    gr.addColorStop(0.78, '#b9e2ff');
    gr.addColorStop(1.0, '#ffe3ae'); // warm horizon glow
  } else {
    gr.addColorStop(0.0, '#020409');
    gr.addColorStop(0.6, '#0a1224');
    gr.addColorStop(1.0, '#182a45');
  }
  g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const skyTexDay = skyTexture(true), skyTexNight = skyTexture(false);
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(430, 24, 16),
  new THREE.MeshBasicMaterial({ map: skyTexDay, side: THREE.BackSide, fog: false, depthWrite: false })
);
skyDome.renderOrder = -10;
scene.add(skyDome);
// visible sun disc (day only; glowSprite is defined below, hoisted via function decl)
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,252,235,1)');
    gr.addColorStop(0.35, 'rgba(255,240,190,0.95)');
    gr.addColorStop(1, 'rgba(255,210,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  })(), transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending
}));
sunSprite.position.set(230, 195, 115); sunSprite.scale.set(110, 110, 1);
scene.add(sunSprite);
// blocky voxel clouds: one InstancedMesh draw call, drifting slowly
const cloudData = []; // {cx,cz,cy,s,spd, parts:[{ox,oy,oz,sx,sy,sz}]}
let cloudMesh = null;
const _cd = new THREE.Object3D();
{
  const nClouds = LOWQ ? 9 : 16, boxesPer = 6;
  cloudMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.94 }),
    nClouds * boxesPer
  );
  let idx = 0;
  for (let c = 0; c < nClouds; c++) {
    const cl = { cx: (Math.random() * 2 - 1) * 210, cz: (Math.random() * 2 - 1) * 210, cy: 60 + Math.random() * 24, s: 8 + Math.random() * 10, spd: 1.0 + Math.random() * 1.2, parts: [] };
    for (let b = 0; b < boxesPer; b++) {
      cl.parts.push({
        ox: (Math.random() * 2 - 1) * cl.s, oy: (Math.random() * 2 - 1) * 1.8, oz: (Math.random() * 2 - 1) * cl.s * 0.55,
        sx: cl.s * (0.45 + Math.random() * 0.5), sy: 2.4 + Math.random() * 1.6, sz: cl.s * 0.38 * (0.5 + Math.random() * 0.5)
      });
    }
    cloudData.push(cl);
  }
  cloudMesh.frustumCulled = false;
  scene.add(cloudMesh);
  refreshCloudInstances();
}
function refreshCloudInstances() {
  let idx = 0;
  for (const cl of cloudData) for (const p of cl.parts) {
    _cd.position.set(cl.cx + p.ox, cl.cy + p.oy, cl.cz + p.oz);
    _cd.scale.set(p.sx, p.sy, p.sz);
    _cd.rotation.set(0, 0, 0); _cd.updateMatrix();
    cloudMesh.setMatrixAt(idx++, _cd.matrix);
  }
  cloudMesh.instanceMatrix.needsUpdate = true;
}
let cloudTick = 0;

// ---------- Audio (WebAudio beeps) ----------
let AC = null;
const SOUND_KEY = 'nr_sound'; // 'on' | 'off'
function soundOn() {
  try { return (localStorage.getItem(SOUND_KEY) || 'on') === 'on'; } catch (e) { return true; }
}
function beep(freq = 660, dur = 0.07, type = 'square', vol = 0.12) {
  if (!soundOn()) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, AC.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
    o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + dur);
  } catch (e) { /* audio optional */ }
}
// Announcer voice for the PLAYER's kill announcements (speechSynthesis, no assets)
function speak(text) {
  if (!soundOn()) return;
  try {
    const ss = window.speechSynthesis;
    if (!ss) return;
    ss.cancel(); // never queue up announcements
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.pitch = 0.85; u.rate = 0.95; u.volume = 1;
    const vs = ss.getVoices();
    const en = vs.find(v => v.lang && v.lang.toLowerCase().startsWith('en'));
    if (en) u.voice = en;
    ss.speak(u);
  } catch (e) { /* voice optional */ }
}
// Simple disappointed "ahhh" when the PLAYER dies (WebAudio, no assets)
function deathScream() {
  if (!soundOn()) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const t = AC.currentTime, dur = 0.55;
    const o = AC.createOscillator(); o.type = 'sine'; // pure sine — no harshness
    o.frequency.setValueAtTime(330, t);
    o.frequency.exponentialRampToValueAtTime(140, t + dur); // short disappointed glide down
    const g = AC.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(AC.destination);
    o.start(t); o.stop(t + dur);
  } catch (e) { /* audio optional */ }
}
// resume audio on first user gesture (browsers block audio before interaction)
window.addEventListener('pointerdown', function unlockAudio() {
  try { if (AC && AC.state === 'suspended') AC.resume(); } catch (e) {}
  window.removeEventListener('pointerdown', unlockAudio);
});

// ---------- Colliders (3D AABB: y0..y1 vertical span) ----------
const colliders = []; // {minX,maxX,minZ,maxZ,y0,y1}
function addCollider(cx, cz, w, d, top, y0 = 0) {
  const c = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, y0, y1: top };
  colliders.push(c);
  return c;
}
// walkable floor surfaces (upper floors, stair steps): {minX,maxX,minZ,maxZ,top}
const walkables = [];
function addWalkable(cx, cz, w, d, top) { walkables.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, top }); }
function groundY(x, z, feet) {
  let g = 0;
  for (const s of walkables) {
    if (x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ && s.top <= feet + 0.55 && s.top > g) g = s.top;
  }
  return g;
}
const CHAR_H = 1.35; // character world height (for vertical overlap tests)
function collide(pos, r = CHAR_RADIUS) {
  pos.x = Math.max(-MAP + r, Math.min(MAP - r, pos.x));
  pos.z = Math.max(-MAP + r, Math.min(MAP - r, pos.z));
  const feet = pos.y, head = pos.y + CHAR_H;
  for (const c of colliders) {
    if (head <= c.y0 + 0.05 || feet >= c.y1 - 0.05) continue; // no vertical overlap
    if (pos.x > c.minX - r && pos.x < c.maxX + r && pos.z > c.minZ - r && pos.z < c.maxZ + r) {
      const dxl = Math.abs(pos.x - (c.minX - r)), dxr = Math.abs(pos.x - (c.maxX + r));
      const dzl = Math.abs(pos.z - (c.minZ - r)), dzr = Math.abs(pos.z - (c.maxZ + r));
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) pos.x = c.minX - r; else if (m === dxr) pos.x = c.maxX + r;
      else if (m === dzl) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
    }
  }
}
const eyeTmp = new THREE.Vector3(), midTmp = new THREE.Vector3();
function segHitsBox(ax, ay, az, bx, by, bz, c) {
  // 3D slab test: does segment a->b intersect box c?
  let t0 = 0, t1 = 1;
  const mins = [c.minX, c.y0, c.minZ], maxs = [c.maxX, c.y1, c.maxZ];
  const A = [ax, ay, az], B = [bx, by, bz];
  for (let i = 0; i < 3; i++) {
    const d = B[i] - A[i];
    if (Math.abs(d) < 1e-9) { if (A[i] < mins[i] || A[i] > maxs[i]) return false; }
    else {
      let ta = (mins[i] - A[i]) / d, tb = (maxs[i] - A[i]) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return t1 > 0.02 && t0 < 0.98;
}
function losBlocked(a, b) {
  // tolerates plain {x,z} points (assumes eye height) and Vector3s
  const ay = a.y ?? CHAR_EYE, by = b.y ?? CHAR_EYE;
  for (const c of colliders) {
    if (segHitsBox(a.x, ay, a.z, b.x, by, b.z, c)) return true;
  }
  return false;
}

// ---------- Map building ----------
const MAT = (c) => new THREE.MeshLambertMaterial({ color: c });
function box(x, y, z, w, h, d, color, collider = true, y0 = null) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT(color));
  m.position.set(x, y, z); scene.add(m);
  if (collider) addCollider(x, z, w, d, y + h / 2, y0 === null ? y - h / 2 : y0);
  return m;
}
// two-story enterable buildings: registry for bot campers + stair routing
const buildings2 = []; // {cx,cz,ground:{x,z,y},upper:{x,z,y},stairs:{base:{x,z},top:{x,z}}}
const stairsList = [];
const SLAB_TOP = 3.6;
function building2(cx, cz, w, d, color) {
  const t = 0.7, gh = 3.6, uh = 2.3;
  // ground-floor walls (door gap 3.4 wide on the front)
  box(cx, gh / 2, cz - d / 2, w, gh, t, color);
  box(cx - w / 2, gh / 2, cz, t, gh, d, color);
  box(cx + w / 2, gh / 2, cz, t, gh, d, color);
  const doorW = 3.4, seg = (w - doorW) / 2;
  box(cx - (seg / 2 + doorW / 2), gh / 2, cz + d / 2, seg, gh, t, color);
  box(cx + (seg / 2 + doorW / 2), gh / 2, cz + d / 2, seg, gh, t, color);
  // upper floor slab (walkable)
  box(cx, 3.45, cz, w - 1.0, 0.3, d - 1.0, 0x8d99ae);
  addWalkable(cx, cz, w - 1.0, d - 1.0, SLAB_TOP);
  // stairs: 8 steps along the left interior wall (visual + walkable, not blocking)
  // the run is a straight line at x=sx so bots climb without drifting off the edge
  const stairW = 2.6, steps = 8, stepD = 0.8, rise = SLAB_TOP / steps;
  const sx = cx - w / 2 + 1.6, sz0 = cz - d / 2 + 2.2;
  for (let i = 0; i < steps; i++) {
    const top = (i + 1) * rise, sz = sz0 + (i + 0.5) * stepD;
    box(sx, top / 2, sz, stairW, top, stepD + 0.04, 0x9aa5b1, false);
    addWalkable(sx, sz, stairW, stepD + 0.04, top);
  }
  // upper walls with window gaps; a low sill under each window (blocks movement, LOS passes over)
  function upperWall(px, pz, len, alongX) {
    const period = 5.0, gap = 2.6;
    let cursor = -len / 2;
    while (cursor < len / 2 - 0.01) {
      const wallLen = Math.min(period - gap, len / 2 - cursor);
      if (wallLen > 0.25) {
        const c = cursor + wallLen / 2;
        if (alongX) box(px + c, SLAB_TOP + uh / 2, pz, wallLen, uh, t, color);
        else box(px, SLAB_TOP + uh / 2, pz + c, t, uh, wallLen, color);
      }
      const gapStart = cursor + (period - gap), gapEnd = Math.min(cursor + period, len / 2);
      const gapLen = gapEnd - gapStart;
      if (gapLen > 0.25) {
        const c = gapStart + gapLen / 2, sillH = 0.8;
        if (alongX) box(px + c, SLAB_TOP + sillH / 2, pz, gapLen, sillH, t, color);
        else box(px, SLAB_TOP + sillH / 2, pz + c, t, sillH, gapLen, color);
      }
      cursor += period;
    }
  }
  upperWall(cx, cz - d / 2, w, true);
  upperWall(cx, cz + d / 2, w, true);
  upperWall(cx - w / 2, cz, d, false);
  upperWall(cx + w / 2, cz, d, false);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.3, d + 1.2), MAT(0x6b7280));
  roof.position.set(cx, 6.25, cz); scene.add(roof);
  const b = {
    cx, cz,
    ground: { x: cx + 1.5, z: cz, y: 0 },
    upper: { x: cx + 1.5, z: cz - 1.5, y: SLAB_TOP },
    stairs: { base: { x: sx, z: sz0 - 1.6 }, top: { x: sx, z: sz0 + steps * stepD + 0.2 } },
  };
  buildings2.push(b); stairsList.push(b.stairs);
  return b;
}
function nearestStairs(x, z) {
  let best = stairsList[0], bestD = 1e9;
  for (const s of stairsList) {
    const d = Math.hypot(x - s.base.x, z - s.base.z);
    if (d < bestD) { best = s; bestD = d; }
  }
  return best;
}
function buildMap() {
  // lush two-tone grass with dirt patches (shared canvas texture)
  const gtex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = '#57a047'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5200; i++) {
      const x = (Math.random() * 256) | 0, y = (Math.random() * 256) | 0;
      g.fillStyle = Math.random() < 0.5 ? '#4c9440' : '#64b356';
      g.fillRect(x, y, 2, 2);
    }
    for (let i = 0; i < 16; i++) { // dirt patches
      g.fillStyle = 'rgba(141,110,72,0.5)';
      g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 15, 0, 7); g.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(30, 30);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP * 2, MAP * 2),
    new THREE.MeshLambertMaterial({ map: gtex }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  // roads
  const road1 = new THREE.Mesh(new THREE.PlaneGeometry(MAP * 2, 10), MAT(0x606a76));
  road1.rotation.x = -Math.PI / 2; road1.position.y = 0.02; scene.add(road1);
  const road2 = road1.clone(); road2.rotation.z = Math.PI / 2; scene.add(road2);
  // perimeter walls
  box(0, 2, -MAP, MAP * 2, 4, 1, 0x8a8f98, false); box(0, 2, MAP, MAP * 2, 4, 1, 0x8a8f98, false);
  box(-MAP, 2, 0, 1, 4, MAP * 2, 0x8a8f98, false); box(MAP, 2, 0, 1, 4, MAP * 2, 0x8a8f98, false);
  // container yard — punchy saturated colors like the banner
  const cCols = [0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7];
  let ci = 0;
  for (const [x, z] of [[-60, -40], [-48, -40], [-60, -26], [62, 44], [50, 44], [62, 30], [-70, 60], [30, -70]]) {
    box(x, 1.3, z, 10, 2.6, 4, cCols[ci++ % cCols.length]);
    if (ci % 3 === 0) box(x, 3.9, z, 10, 2.6, 4, cCols[ci % cCols.length]);
  }
  // warehouses with door gaps (walls as segments)
  function building(cx, cz, w, d, color) {
    const t = 0.6, h = 4;
    box(cx, h / 2, cz - d / 2, w, h, t, color); // back
    box(cx - w / 2, h / 2, cz, t, h, d, color); // left
    box(cx + w / 2, h / 2, cz, t, h, d, color); // right
    const seg = (w - 3) / 2; // front with 3-wide door gap
    box(cx - (seg / 2 + 1.5), h / 2, cz + d / 2, seg, h, t, color);
    box(cx + (seg / 2 + 1.5), h / 2, cz + d / 2, seg, h, t, color);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.3, d + 1), MAT(0x6b7280));
    roof.position.set(cx, h + 0.15, cz); scene.add(roof);
  }
  building(-30, 30, 22, 16, 0xb08968); building(40, -35, 26, 18, 0x7f8c9b); building(75, 70, 18, 14, 0xa3b18a);
  // crates & barriers scattered
  const spots = [[-15, -15], [15, 18], [-45, 5], [55, -10], [5, -50], [-90, -70], [90, -55], [20, 65], [-25, 85], [80, 10], [-80, 20], [10, 100], [-100, 90], [100, 100], [-55, -85], [45, 90]];
  for (const [x, z] of spots) { box(x, 0.9, z, 1.8, 1.8, 1.8, 0xc9a227); if (Math.random() < 0.4) box(x, 2.7, z, 1.8, 1.8, 1.8, 0xc9a227); }
  for (let i = 0; i < 14; i++) {
    const x = (Math.random() * 2 - 1) * 100, z = (Math.random() * 2 - 1) * 100;
    box(x, 0.55, z, 3.2, 1.1, 0.6, 0xe0e4ea);
  }
  // ---- extra cover: fill the empty quadrants ----
  function container(x, z, rot, col) { if (rot) box(x, 1.3, z, 4, 2.6, 10, col); else box(x, 1.3, z, 10, 2.6, 4, col); }
  // NE + SE container stacks
  container(62, 96, false, cCols[1]); container(62, 90, false, cCols[3]); box(62, 3.9, 96, 10, 2.6, 4, cCols[4]);
  container(96, -62, true, cCols[0]); container(90, -62, true, cCols[2]);
  container(-96, -78, false, cCols[2]); container(-84, -84, true, cCols[4]); box(-96, 3.9, -78, 10, 2.6, 4, cCols[1]);
  container(-88, 44, true, cCols[3]); container(24, 96, false, cCols[0]);
  container(102, 58, false, cCols[1]); container(-18, -96, true, cCols[4]);
  // two extra small huts with door gaps
  building(-80, -52, 14, 11, 0x94a3b8); building(98, -24, 16, 12, 0xb08968);
  // five two-story enterable buildings (doorway, stairs, windowed upper floor)
  building2(-48, 68, 14, 10, 0xc08552);
  building2(48, 68, 14, 10, 0x7d8ba1);
  building2(-95, -30, 14, 10, 0xa3b18a);
  building2(100, -75, 14, 10, 0xb08968);
  building2(-15, -55, 14, 10, 0x94a3b8);
  // central park: lawn, paths, fountain, trees, benches, and lamps
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(38, 38), MAT(0x77b255));
  lawn.rotation.x = -Math.PI / 2; lawn.position.y = 0.035; scene.add(lawn);
  const pathMat = MAT(0xd8cf9f);
  const pathX = new THREE.Mesh(new THREE.PlaneGeometry(38, 4), pathMat);
  pathX.rotation.x = -Math.PI / 2; pathX.position.y = 0.05; scene.add(pathX);
  const pathZ = new THREE.Mesh(new THREE.PlaneGeometry(4, 38), pathMat);
  pathZ.rotation.x = -Math.PI / 2; pathZ.position.y = 0.051; scene.add(pathZ);
  const pond = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.16, 24), MAT(0x4aa3d8));
  pond.position.set(0, 0.1, 0); scene.add(pond);
  const fountainBase = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, 0.55, 16), MAT(0xb8c0c8));
  fountainBase.position.set(0, 0.32, 0); scene.add(fountainBase);
  const fountainTop = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.48, 0.75, 12), MAT(0xd6dde5));
  fountainTop.position.set(0, 0.95, 0); scene.add(fountainTop);
  addCollider(0, 0, 7, 7, 0.8);
  function parkTree(x, z) {
    box(x, 0.75, z, 0.48, 1.5, 0.48, 0x7a4a21);
    box(x, 2.2, z, 2.1, 1.7, 2.1, 0x2f7d32, false);
    box(x, 3.3, z, 1.35, 1.1, 1.35, 0x388e3c, false);
  }
  for (const [x, z] of [[-13, -11], [13, -11], [-13, 11], [13, 11], [-7, -15], [7, 15], [-16, 2], [16, -2]]) parkTree(x, z);
  for (const [x, z] of [[5.5, 4.2], [-5.5, -4.2], [5.5, -4.2], [-5.5, 4.2]]) {
    box(x, 0.48, z, 2, 0.18, 0.55, 0x8d6e63);
    box(x - 0.75, 0.22, z, 0.14, 0.44, 0.45, 0x4b5563, false);
    box(x + 0.75, 0.22, z, 0.14, 0.44, 0.45, 0x4b5563, false);
  }
  for (const [x, z] of [[-3.8, 8.5], [3.8, -8.5], [-8.5, -3.8], [8.5, 3.8]]) {
    box(x, 1.35, z, 0.16, 2.7, 0.16, 0x374151);
    box(x, 2.82, z, 0.42, 0.28, 0.42, 0xfff2a8, false);
  }
  for (const [x, z, c] of [[-9, 6, 0xec407a], [9, -6, 0xffca28], [-9, -6, 0xab47bc], [9, 6, 0xef5350]]) {
    box(x, 0.18, z, 3, 0.36, 1.2, c, false);
  }
  // grass tufts + wildflowers: instanced (2 draw calls), skipped on LOW quality
  if (!LOWQ) {
    const dummy = new THREE.Object3D();
    const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.14, 0.55, 5), new THREE.MeshLambertMaterial({ color: 0xffffff }), 240);
    const tcol = new THREE.Color();
    let ti = 0, guard = 0;
    while (ti < 240 && guard++ < 3000) {
      const x = (Math.random() * 2 - 1) * 112, z = (Math.random() * 2 - 1) * 112;
      if (Math.abs(x) < 6.5 || Math.abs(z) < 6.5) continue; // keep roads clear
      if (Math.abs(x) < 20 && Math.abs(z) < 20 && Math.random() < 0.5) continue; // park lawn is separate
      dummy.position.set(x, 0.27, z);
      dummy.scale.setScalar(0.8 + Math.random() * 0.9);
      dummy.rotation.y = Math.random() * 6.28; dummy.updateMatrix();
      tuft.setMatrixAt(ti, dummy.matrix);
      tuft.setColorAt(ti, tcol.setHSL(0.29 + Math.random() * 0.06, 0.6, 0.32 + Math.random() * 0.14));
      ti++;
    }
    tuft.instanceMatrix.needsUpdate = true; if (tuft.instanceColor) tuft.instanceColor.needsUpdate = true;
    scene.add(tuft);
    // flower heads on stems in the park
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5), new THREE.MeshLambertMaterial({ color: 0x3e7d32 }), 70);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), new THREE.MeshLambertMaterial({ color: 0xffffff }), 70);
    const fcols = [0xff5d8f, 0xffd93b, 0xffffff, 0xb678ff, 0xff7a4d];
    for (let i = 0; i < 70; i++) {
      const x = (Math.random() * 2 - 1) * 17, z = (Math.random() * 2 - 1) * 17;
      if (Math.abs(x) < 2.4 || Math.abs(z) < 2.4) { i--; continue; } // keep paths clear
      dummy.position.set(x, 0.25, z); dummy.scale.setScalar(1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 0.58; dummy.updateMatrix();
      heads.setMatrixAt(i, dummy.matrix);
      heads.setColorAt(i, tcol.set(fcols[i % fcols.length]));
    }
    stems.instanceMatrix.needsUpdate = true; heads.instanceMatrix.needsUpdate = true;
    if (heads.instanceColor) heads.instanceColor.needsUpdate = true;
    scene.add(stems); scene.add(heads);
  }
  // wrecked cars on/near the roads
  function wreckedCar(x, z, rot, color, onSide = false) {
    const car = new THREE.Group(); car.position.set(x, 0, z); car.rotation.y = rot;
    const inner = new THREE.Group(); car.add(inner);
    const rust = MAT(color), darkRust = MAT(0x3a3130);
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.58, 1.9), rust); body.position.y = 0.58; inner.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.62, 1.65), darkRust); cabin.position.set(-0.25, 1.16, 0); inner.add(cabin);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.3, 1.75), rust); hood.position.set(1.75, 0.72, 0); hood.rotation.z = -0.08; inner.add(hood);
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 12);
    for (const [wx, wz] of [[-1.5, -0.98], [1.5, -0.98], [-1.5, 0.98], [1.5, 0.98]]) {
      const wheel = new THREE.Mesh(wheelGeo, MAT(0x17191c));
      wheel.rotation.x = Math.PI / 2; wheel.position.set(wx, 0.38, wz); inner.add(wheel);
    }
    if (onSide) { inner.rotation.x = Math.PI / 2; inner.position.y = 1.05; }
    scene.add(car);
    const side = Math.abs(Math.sin(rot)) > 0.5;
    addCollider(x, z, side ? 2.2 : 4.9, side ? 4.9 : 2.2, onSide ? 2.2 : 1.45);
  }
  wreckedCar(-32, 4.7, 0, 0x8a4b2f); wreckedCar(38, -4.7, Math.PI, 0x5f6f7a);
  wreckedCar(4.7, 44, Math.PI / 2, 0x71543a); wreckedCar(-4.7, -54, Math.PI / 2, 0x4f6158, true);
  wreckedCar(-66, -4.6, 0, 0x7a3f36); wreckedCar(74, 4.6, 0, 0x626a72);
  wreckedCar(-4.6, 82, Math.PI / 2, 0x86613d); wreckedCar(56, -4.8, 0, 0x546e7a);
  // water tower in the north-west quadrant
  const towerX = -88, towerZ = 88;
  for (const [lx, lz] of [[-2.7, -2.7], [2.7, -2.7], [-2.7, 2.7], [2.7, 2.7]]) {
    box(towerX + lx, 3.4, towerZ + lz, 0.42, 6.8, 0.42, 0x6b7280, false);
  }
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(4.7, 4.7, 0.3, 18), MAT(0x8a8f98));
  deck.position.set(towerX, 6.95, towerZ); scene.add(deck);
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.1, 3.4, 18), MAT(0x38a8e0));
  tank.position.set(towerX, 8.85, towerZ); scene.add(tank);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.55, 1.7, 18), MAT(0xe05252));
  roof.position.set(towerX, 11.4, towerZ); scene.add(roof);
  addCollider(towerX, towerZ, 7.2, 7.2, 10.6);
  // ---- crashed airplane (SE quadrant landmark): broken fuselage, detached wing, debris, scorch mark ----
  const planeX = 58, planeZ = -108;
  const fuseMat = MAT(0x9aa5b1), stripeMat = MAT(0xd8543f), darkMat = MAT(0x3a3130);
  function cylX(r, len, x, y, z, tiltZ = 0) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), fuseMat);
    m.rotation.z = Math.PI / 2 + tiltZ; m.position.set(x, y, z); scene.add(m); return m;
  }
  cylX(1.5, 7, planeX, 1.25, planeZ, 0.1); // front fuselage, nose buried
  cylX(1.3, 5.5, planeX + 8, 1.05, planeZ, -0.18); // rear fuselage, tail kicked up
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.2, 14), fuseMat);
  nose.rotation.z = -Math.PI / 2 - 0.12; nose.position.set(planeX - 4.4, 0.75, planeZ); scene.add(nose);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.35, 0.12), stripeMat);
  stripe.position.set(planeX, 2.35, planeZ + 1.42); stripe.rotation.z = 0.1; scene.add(stripe);
  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.4, 2.3), stripeMat);
  tailFin.position.set(planeX + 10.2, 3.4, planeZ); tailFin.rotation.z = -0.15; scene.add(tailFin);
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.28, 5), fuseMat);
  tailWing.position.set(planeX + 9.6, 2.2, planeZ); tailWing.rotation.z = -0.18; scene.add(tailWing);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.35, 2.4), fuseMat);
  wing.position.set(planeX - 10, 0.7, planeZ + 6); wing.rotation.x = 0.5; wing.rotation.y = 0.35; scene.add(wing); // detached wing, stuck in ground
  const wing2 = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 2), darkMat);
  wing2.position.set(planeX + 12, 0.4, planeZ - 6); wing2.rotation.y = 0.7; scene.add(wing2);
  for (let i = 0; i < 7; i++) { // scattered debris
    const s = 0.5 + Math.random() * 0.9, a = Math.random() * Math.PI * 2, r = 7 + Math.random() * 6;
    box(planeX + Math.cos(a) * r, s / 2, planeZ + Math.sin(a) * r, s, s, s * 0.8, i % 2 ? 0x6b7280 : 0x3a3130, false);
  }
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(10, 24), new THREE.MeshBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.7 }));
  scorch.rotation.x = -Math.PI / 2; scorch.position.set(planeX + 2, 0.045, planeZ); scene.add(scorch);
  const scorch2 = new THREE.Mesh(new THREE.CircleGeometry(5.5, 20), new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.8 }));
  scorch2.rotation.x = -Math.PI / 2; scorch2.position.set(planeX + 2, 0.055, planeZ); scene.add(scorch2);
  addCollider(planeX, planeZ, 8, 3.4, 2.9); // front fuselage
  addCollider(planeX + 8, planeZ, 6, 3, 4.6); // rear fuselage + tail
  addCollider(planeX - 10, planeZ + 6, 9.5, 3, 2.6); // detached wing
  // maze low walls (axis-aligned segments)
  const maze = [[-40, -62, 14, 0], [-33, -55, 0, 12], [-52, -30, 0, 14], [36, 58, 16, 0], [44, 51, 0, 12], [58, 78, 12, 0], [-62, 82, 0, 16], [-70, 74, 14, 0], [70, -96, 14, 0], [76, -89, 0, 12], [-105, -10, 0, 18], [105, 20, 0, 16]];
  for (const [x, z, len, rot] of maze) { if (rot) box(x, 0.8, z, 0.6, 1.6, len, 0x9aa5b1); else box(x, 0.8, z, len, 1.6, 0.6, 0x9aa5b1); }
  // crate clusters
  const clusters = [[-100, 65], [55, -58], [88, 88], [-35, -88], [15, -25], [-58, 18], [48, 22], [100, -100], [-110, -45], [30, 45]];
  for (const [cx, cz] of clusters) {
    box(cx, 0.9, cz, 1.8, 1.8, 1.8, 0xc9a227); box(cx + 2, 0.9, cz + 1, 1.8, 1.8, 1.8, 0xb08968);
    box(cx - 1, 0.9, cz + 2.2, 1.8, 1.8, 1.8, 0xc9a227); box(cx + 0.5, 2.7, cz + 0.5, 1.8, 1.8, 1.8, 0xb08968);
  }
  // extra fixed barriers
  const bars = [[-20, 55], [25, -15], [-48, -48], [65, 65], [-75, -5], [12, 78], [85, -40], [-15, -70], [40, 105], [-105, 30]];
  for (const [x, z] of bars) box(x, 0.55, z, 3.2, 1.1, 0.6, 0xe0e4ea);
}
buildMap();

// drifting smoke over the crashed plane (cheap: 5 looping sprites; off on low quality)
const smokePuffs = [];
{
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  gr.addColorStop(0, 'rgba(95,95,100,0.5)'); gr.addColorStop(1, 'rgba(95,95,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(cv);
  for (let i = 0; i < (LOWQ ? 0 : 5); i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.5, depthWrite: false }));
    sp.position.set(58 + (Math.random() * 4 - 2), 2 + i * 1.7, -108 + (Math.random() * 4 - 2));
    sp.scale.set(3, 3, 1);
    sp.userData.ph = Math.random() * 6.28;
    scene.add(sp); smokePuffs.push(sp);
  }
}

// ---------- Night mode lighting (toggled by map select) ----------
const nightGroup = new THREE.Group(); nightGroup.visible = false; scene.add(nightGroup);
function glowSprite(color, scale) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: true, transparent: true, blending: THREE.AdditiveBlending }));
  sp.scale.set(scale, scale, 1);
  return sp;
}
// ---------- Night lamps: every building + streets get lamps ----------
// Pole meshes are physical (visible day & night); bulbs/glow/point lights live in nightGroup.
// Real point lights are budgeted: 4 park + 4 building + 2 street = 10 total.
function lampPost(x, z, h = 4.2, real = false) {
  box(x, h / 2, z, 0.22, h, 0.22, 0x374151, false);
  addCollider(x, z, 0.5, 0.5, h);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  bulb.position.set(x, h + 0.18, z); nightGroup.add(bulb);
  const gl = glowSprite('rgba(255,205,120,0.95)', 3.4); gl.position.set(x, h + 0.2, z); nightGroup.add(gl);
  if (real && !LOWQ) {
    const pl = new THREE.PointLight(0xffc37a, 40, 32, 1.7);
    pl.position.set(x, h + 0.7, z); nightGroup.add(pl);
  }
}
for (const [i, [lx, lz]] of [[-3.8, 8.5], [3.8, -8.5], [-8.5, -3.8], [8.5, 3.8]].entries()) {
  const gl = glowSprite('rgba(255,205,120,0.95)', 3.4); gl.position.set(lx, 2.95, lz); nightGroup.add(gl);
  if (!LOWQ || i < 2) { // low quality: only 2 real point lights for the whole night map
    const pl = new THREE.PointLight(0xffc37a, 40, 30, 1.7); pl.position.set(lx, 3.4, lz); nightGroup.add(pl);
  }
}
// entrance lamps for ALL five two-story buildings (2 with real lights)
const B2_LAMPS = [[-45.4, 73.9, true], [50.6, 73.9, true], [-92.4, -24.1, false], [102.6, -69.1, false], [-12.4, -49.1, false]];
for (const [bx, bz, real] of B2_LAMPS) lampPost(bx, bz, 3.6, real);
// entrance lamps for ALL five single-story buildings/warehouses (2 with real lights)
const B1_LAMPS = [[-27.6, 38.9, true], [42.4, -25.1, true], [77.4, 77.9, false], [-77.6, -45.6, false], [100.4, -17.1, false]];
for (const [bx, bz, real] of B1_LAMPS) lampPost(bx, bz, 3.4, real);
// street lamps along both roads, alternating sides (2 with real lights)
const STREET_LAMPS = [[-100, 7, false], [-60, -7, false], [-20, 7, false], [20, -7, true], [60, 7, false], [100, -7, false],
  [7, -100, false], [-7, -60, false], [7, -20, false], [-7, 20, true], [7, 60, false], [-7, 100, false]];
for (const [sx, sz, real] of STREET_LAMPS) lampPost(sx, sz, 4.6, real);
// stars (night only)
{
  const n = 420, posArr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.45 + 0.08, r = 380;
    posArr[i * 3] = Math.cos(a) * Math.cos(e) * r;
    posArr[i * 3 + 1] = Math.sin(e) * r;
    posArr[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  nightGroup.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85 })));
}
function applyMapMode() {
  const night = G.mapMode === 'night';
  nightGroup.visible = night;
  skyDome.material.map = night ? skyTexNight : skyTexDay;
  skyDome.material.needsUpdate = true;
  sunSprite.visible = !night;
  cloudMesh.material.opacity = night ? 0.5 : 0.94;
  hemi.intensity = night ? 0.22 : 1.05;
  sun.intensity = night ? 0.3 : 1.25;
  sun.color.set(night ? 0x9db8ff : 0xffe9c4);
  scene.background.set(night ? 0x070b16 : 0x8ec8f2);
  scene.fog.color.set(night ? 0x0a1220 : 0xaed6f5);
  scene.fog.near = night ? 45 : 60;
  scene.fog.far = night ? (LOWQ ? 165 : 185) : (LOWQ ? 190 : 220);
}
// label read distance: night mode fades enemy codes out ~15% sooner
const LABEL_DIST_DAY = 130, LABEL_DIST_NIGHT = 110;
function labelDistLimit() { return G.mapMode === 'night' ? LABEL_DIST_NIGHT : LABEL_DIST_DAY; }

// waypoints for bots (skip points buried inside colliders); each has a floor height wy
const waypoints = [];
for (let x = -100; x <= 100; x += 25) for (let z = -100; z <= 100; z += 25) {
  let inside = false;
  for (const c of colliders) if (x > c.minX - 1.5 && x < c.maxX + 1.5 && z > c.minZ - 1.5 && z < c.maxZ + 1.5) { inside = true; break; }
  if (!inside) waypoints.push({ x, z, y: 0 });
}
// two-story building interiors: ground + upper floor waypoints (bots camp/patrol both)
for (const b of buildings2) {
  waypoints.push({ x: b.ground.x, z: b.ground.z, y: 0 });
  waypoints.push({ x: b.upper.x, z: b.upper.z, y: SLAB_TOP });
}

// ---------- Characters ----------
const COLORS = [0xff5252, 0x42a5f5, 0x66bb6a, 0xffca28, 0xab47bc, 0x26a69a, 0xff7043, 0x8d6e63, 0x5c6bc0, 0xec407a, 0x9ccc65, 0xffa726, 0x78909c, 0x26c6da, 0xd4e157, 0xff8a80, 0x82b1ff, 0xb9f6ca, 0xffff8d, 0xd7aefb, 0x80cbc4, 0xffab91, 0xa1887f, 0x9fa8da, 0xf48fb1,
  0xe53935, 0x1e88e5, 0x43a047, 0xfdd835, 0x8e24aa, 0x00897b, 0xf4511c, 0x6d4c41, 0x3949ab, 0xd81b60, 0x7cb342, 0xfb8c00, 0x546e7a, 0x00acc1, 0xc0ca33, 0xef5350, 0x64b5f6, 0xaed581, 0xfff176, 0xba68c8, 0x4db6ac, 0xff8a65, 0xbcaaa4, 0x7986cb, 0xf06292];
function drawCodeLabel(cv, code) {
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.roundRect(56, 16, 400, 160, 36); g.fill();
  g.font = '900 104px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#ffd93b'; g.fillText(code, 256, 100);
}
function codeSprite(code, color) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 192;
  drawCodeLabel(cv, code);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  sp.scale.set(3.35, 1.18, 1); // local units; character group scale brings this to ~1.88 x 0.66 world units
  sp.userData.setCode = (c) => { drawCodeLabel(cv, c); tex.needsUpdate = true; };
  return sp;
}
function heartSprite(scale = 0.62) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#ff4d6d';
  g.strokeStyle = '#ffffff'; g.lineWidth = 7;
  g.beginPath();
  g.moveTo(64, 112);
  g.bezierCurveTo(64, 112, 12, 72, 12, 44);
  g.bezierCurveTo(12, 24, 28, 12, 44, 12);
  g.bezierCurveTo(56, 12, 62, 20, 64, 26);
  g.bezierCurveTo(66, 20, 72, 12, 84, 12);
  g.bezierCurveTo(100, 12, 116, 24, 116, 44);
  g.bezierCurveTo(116, 72, 64, 112, 64, 112);
  g.fill(); g.stroke();
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: true, transparent: true }));
  sp.scale.set(scale, scale, 1);
  return sp;
}
function decoySprite(scale = 1.1) {
  // floating shuffle-arrows icon (purple) for decoy drops
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(20,10,40,0.55)'; g.beginPath(); g.roundRect(8, 8, 112, 112, 24); g.fill();
  g.strokeStyle = '#c07bff'; g.lineWidth = 12; g.lineCap = 'round';
  function arrow(x1, y1, x2, y2, flip) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.beginPath(); g.moveTo(x2, y2); g.lineTo(x2 - (flip ? -18 : 18), y2 - 12); g.lineTo(x2 - (flip ? -18 : 18), y2 + 12); g.closePath(); g.fillStyle = '#c07bff'; g.fill();
  }
  arrow(28, 46, 100, 46, false); arrow(100, 82, 28, 82, true);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: true, transparent: true }));
  sp.scale.set(scale, scale, 1);
  return sp;
}
function loveIconCanvas() {
  // small icon used for item drops: heart on pink glow
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,120,160,0.9)'); grad.addColorStop(1, 'rgba(255,120,160,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#ff4d6d';
  g.beginPath();
  g.moveTo(64, 100);
  g.bezierCurveTo(64, 100, 24, 68, 24, 46);
  g.bezierCurveTo(24, 30, 36, 20, 48, 20);
  g.bezierCurveTo(58, 20, 62, 26, 64, 31);
  g.bezierCurveTo(66, 26, 70, 20, 80, 20);
  g.bezierCurveTo(92, 20, 104, 30, 104, 46);
  g.bezierCurveTo(104, 68, 64, 100, 64, 100);
  g.fill();
  return cv;
}
function fireSprite() {
  // 🔥 ON FIRE streak visual (purely cosmetic)
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  function blob(cx, cy, r, col) {
    const gr = g.createRadialGradient(cx, cy, 2, cx, cy, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,80,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  }
  blob(64, 88, 46, 'rgba(255,60,0,0.85)');
  blob(56, 70, 34, 'rgba(255,150,0,0.9)');
  blob(72, 56, 24, 'rgba(255,220,80,0.95)');
  blob(64, 44, 14, 'rgba(255,255,200,0.95)');
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: true, transparent: true }));
  sp.scale.set(1.35, 1.35, 1);
  sp.position.y = 1.15;
  return sp;
}
function attachFire(p) {
  if (p.grp.userData.fireSprite) return;
  const sp = fireSprite();
  p.grp.add(sp);
  p.grp.userData.fireSprite = sp;
  p.grp.userData.firePhase = Math.random() * 6.28;
}
function removeFire(p) {
  const sp = p.grp.userData.fireSprite;
  if (sp) { p.grp.remove(sp); p.grp.userData.fireSprite = null; }
}
// ---------- Steve-style character faces (shared canvas textures, cheap for 50 players) ----------
const HAIR_COLORS = [0x3b2a1a, 0x141414, 0xd9a441, 0xb5542c, 0x6e4a2f, 0x9c9c9c];
const SKIN_CSS = '#f2c99a';
function makeFaceTexture() {
  // 16x16 pixel-art face, Minecraft style: eyes + smile on skin background
  const S = 16, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = SKIN_CSS; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, 0, S, 2); // subtle top shading
  // eyes: white with blue-violet pupils
  g.fillStyle = '#ffffff'; g.fillRect(2, 6, 4, 3); g.fillRect(10, 6, 4, 3);
  g.fillStyle = '#4a3fd6'; g.fillRect(3, 7, 2, 2); g.fillRect(11, 7, 2, 2);
  g.fillStyle = '#1a1a2e'; g.fillRect(4, 7, 1, 1); g.fillRect(12, 7, 1, 1); // pupil glint shadow
  // smile
  g.fillStyle = '#8a4030';
  g.fillRect(5, 11, 1, 1); g.fillRect(6, 12, 4, 1); g.fillRect(10, 11, 1, 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; // crisp pixels
  return tex;
}
function makeHairSideTexture(hairCss) {
  // head sides/back: hair fringe on top rows, skin below
  const S = 16, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = SKIN_CSS; g.fillRect(0, 0, S, S);
  g.fillStyle = hairCss; g.fillRect(0, 0, S, 5);
  // jagged hairline
  g.fillRect(1, 5, 2, 1); g.fillRect(6, 5, 3, 1); g.fillRect(12, 5, 2, 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
  return tex;
}
const FACE_TEX = makeFaceTexture();
const FACE_MAT = new THREE.MeshLambertMaterial({ map: FACE_TEX });
const SKIN_MAT = new THREE.MeshLambertMaterial({ color: 0xf2c99a });
const HAIR_MATS = HAIR_COLORS.map(c => new THREE.MeshLambertMaterial({ color: c }));
const HAIR_SIDE_TEX = {}, HAIR_SIDE_MATS = {};
for (const c of HAIR_COLORS) {
  const css = '#' + c.toString(16).padStart(6, '0');
  HAIR_SIDE_TEX[c] = makeHairSideTexture(css);
  HAIR_SIDE_MATS[c] = new THREE.MeshLambertMaterial({ map: HAIR_SIDE_TEX[c] });
}
function hairMatsFor(code) {
  // deterministic hair color per character; returns [sideMat, topMat]
  const i = (parseInt(code, 10) || 0) % HAIR_COLORS.length;
  return [HAIR_SIDE_MATS[HAIR_COLORS[i]], HAIR_MATS[i]];
}
function makeCharacter(color, code, isPlayer = false, skinId = 'default') {
  const grp = new THREE.Group();
  const skin = skinById(skinId);
  const bodyColor = isPlayer && skin.color ? skin.color : color;
  const mat = MAT(bodyColor), dark = MAT(0x2f3542);
  // Steve-like proportions (local units, ~2.42 tall before CHAR_SCALE)
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.75, 0.36), dark); legL.position.set(-0.17, 0.375, 0);
  const legR = legL.clone(); legR.position.x = 0.17;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.78, 0.42), mat); body.position.y = 1.14;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.3), mat); armL.position.set(-0.48, 1.17, 0);
  const armR = armL.clone(); armR.position.x = 0.48;
  // head: pixel-art face on +Z (character front), hair on top/sides/back
  const [hairSide, hairTop] = hairMatsFor(code);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.56, 0.56, 0.56),
    [hairSide, hairSide, hairTop, SKIN_MAT, FACE_MAT, hairSide]
  );
  head.position.y = 1.81;
  const hat = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.16, 0.62), mat); hat.position.y = 2.17;
  grp.add(legL, legR, body, armL, armR, head, hat);
  let label = null;
  if (isPlayer) {
    // locator ring (feet) instead of a floating code label — no view obstruction
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.07, 8, 26), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08; grp.add(ring);
  } else {
    label = codeSprite(code); label.position.y = 2.9;
    grp.add(label);
  }
  grp.scale.setScalar(CHAR_SCALE);
  grp.userData = { legL, legR, armL, armR, label, skinMats: isPlayer ? [mat] : null, skinId: isPlayer ? skinId : 'default' };
  scene.add(grp);
  return grp;
}

// ---------- Unlockable skins (localStorage, cosmetic only) ----------
const UNLOCKS_KEY = 'nr_unlocks';
const SKINS = [
  { id: 'default', name: 'Rookie', color: null, need: 0 },
  { id: 'gold', name: 'Gold', color: 0xffd700, need: 1 },
  { id: 'flame', name: 'Flame', color: 0xff5722, need: 5 },
  { id: 'rainbow', name: 'Rainbow', color: null, need: 10 },
];
function loadUnlocks() {
  try {
    const u = JSON.parse(localStorage.getItem(UNLOCKS_KEY)) || {};
    let acc = {};
    if (u.acc && typeof u.acc === 'object') acc = u.acc;
    else if (u.accOn === false) { for (const r of REWARDS) acc[r.id] = false; } // migrate old "hide all" setting
    return { wins: u.wins || 0, skin: u.skin || 'default', totalKills: u.totalKills || 0, acc };
  } catch (e) { return { wins: 0, skin: 'default', totalKills: 0, acc: {} }; }
}
function saveUnlocks(u) {
  try { localStorage.setItem(UNLOCKS_KEY, JSON.stringify(u)); } catch (e) { /* storage optional */ }
}
function skinById(id) { return SKINS.find(s => s.id === id) || SKINS[0]; }

// ---------- Lifetime kill rewards: player-only cosmetic accessories (auto-equip, stack visually) ----------
const REWARDS = [
  { id: 'shoes', name: 'SHOES', icon: '👟', need: 10 },
  { id: 'hat', name: 'HAT', icon: '🎩', need: 15 },
  { id: 'shirt', name: 'SHIRT', icon: '👕', need: 25 },
  { id: 'jacket', name: 'JACKET', icon: '🧥', need: 35 },
  { id: 'crown', name: 'GOLDEN CROWN', icon: '👑', need: 50 },
  { id: 'wings', name: 'WINGS', icon: '🪽', need: 75 },
  { id: 'trail', name: 'RAINBOW TRAIL', icon: '🌈', need: 100 },
  { id: 'cape', name: 'CAPE', icon: '🦸', need: 150 },
];
function rewardUnlocked(id) { const r = REWARDS.find(r => r.id === id); return unlocks.totalKills >= (r ? r.need : Infinity); }
// per-accessory equip state: unlocked AND not explicitly unequipped (default = equipped)
function accEquipped(id) { return rewardUnlocked(id) && unlocks.acc[id] !== false; }
// pure helper: which reward tiers were crossed between prev and now (used by tests too)
function newlyUnlockedRewards(prev, now) {
  return REWARDS.filter(r => prev < r.need && now >= r.need);
}
function attachAccessory(p, id) {
  const grp = p.grp, parts = [];
  const add = (m) => { grp.add(m); parts.push(m); };
  const bx = (x, y, z, w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT(c)); m.position.set(x, y, z); add(m); return m; };
  if (id === 'shoes') { bx(-0.17, 0.12, 0.02, 0.36, 0.24, 0.42, 0xf5f5f5); bx(0.17, 0.12, 0.02, 0.36, 0.24, 0.42, 0xf5f5f5); }
  else if (id === 'hat') { bx(0, 2.3, 0, 0.68, 0.1, 0.66, 0x212121); bx(0, 2.56, 0, 0.48, 0.42, 0.48, 0x37474f); }
  else if (id === 'shirt') { bx(0, 1.3, 0, 0.7, 0.22, 0.46, 0x00e5ff); }
  else if (id === 'jacket') { bx(0, 1.14, 0, 0.74, 0.86, 0.5, 0x5d4037); }
  else if (id === 'crown') {
    const yB = accEquipped('hat') ? 2.82 : 2.3; // stack on top of the hat when both equipped
    bx(0, yB, 0, 0.5, 0.2, 0.5, 0xffd700);
    bx(-0.17, yB + 0.2, 0, 0.1, 0.22, 0.1, 0xffd700); bx(0, yB + 0.24, 0, 0.1, 0.3, 0.1, 0xffd700); bx(0.17, yB + 0.2, 0, 0.1, 0.22, 0.1, 0xffd700);
  }
  else if (id === 'wings') {
    const w1 = bx(-0.42, 1.35, 0.3, 0.5, 0.7, 0.12, 0xffffff); w1.rotation.z = 0.35;
    const w2 = bx(0.42, 1.35, 0.3, 0.5, 0.7, 0.12, 0xffffff); w2.rotation.z = -0.35;
  }
  else if (id === 'cape') { const c = bx(0, 1.15, 0.3, 0.56, 0.9, 0.1, 0xd32f2f); c.rotation.x = 0.12; }
  // 'trail' is a particle effect — handled by updateTrail, no mesh
  grp.userData.acc = grp.userData.acc || {};
  grp.userData.acc[id] = parts;
}
function clearAccessories(p) {
  const acc = p.grp.userData.acc;
  if (acc) for (const id in acc) for (const m of acc[id]) p.grp.remove(m);
  p.grp.userData.acc = {};
  p.grp.userData.trail = false;
}
function applyAccessories(p) {
  clearAccessories(p);
  if (!p || !p.isPlayer) return;
  for (const r of REWARDS) {
    if (r.id === 'trail') { if (accEquipped('trail')) p.grp.userData.trail = true; continue; }
    if (accEquipped(r.id)) attachAccessory(p, r.id);
  }
}
// rainbow trail particles while the player moves
const trailP = []; let trailT = 0; const trailLast = new THREE.Vector3(1e9, 0, 1e9);
function updateTrail(dt) {
  const pl = G.player;
  for (let i = trailP.length - 1; i >= 0; i--) {
    const t = trailP[i];
    t.life -= dt;
    t.sp.material.opacity = Math.max(0, t.life * 1.4);
    t.sp.position.y += dt * 0.5;
    if (t.life <= 0) { scene.remove(t.sp); t.sp.material.dispose(); trailP.splice(i, 1); }
  }
  if (!pl || !pl.alive || !pl.grp.userData.trail || G.mode !== 'play') return;
  trailT += dt;
  if (trailT > 0.09 && trailLast.distanceToSquared(pl.pos) > 0.04 && trailP.length < (LOWQ ? 20 : 60)) {
    trailT = 0; trailLast.copy(pl.pos);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color().setHSL((G.elapsed * 0.6) % 1, 0.9, 0.6), transparent: true, opacity: 0.7, depthWrite: false }));
    sp.position.set(pl.pos.x, pl.pos.y + 0.5, pl.pos.z);
    sp.scale.set(0.55, 0.55, 1);
    scene.add(sp); trailP.push({ sp, life: 0.5 });
  }
}

// ---------- DOM ----------
app.insertAdjacentHTML('beforeend', `
<div id="menu">
  <div class="mscreen" id="scr-main">
    <h1>NUMBER ROYALE</h1>
    <div class="tag">Number Battle Royale &mdash; pure speed &amp; memory. No weapons: type an enemy's 4-digit code to eliminate them!</div>
    <button class="btn" id="btn-bot">&#x1F3AE; PLAY WITH BOTS</button>
    <button class="btn" id="btn-real">&#x1F310; PLAY WITH REAL PLAYERS</button>
    <button class="btn" id="btn-char">&#x1F9CD; CHARACTER</button>
    <button class="btn" id="btn-info">&#x2139;&#xFE0F; INFO</button>
  </div>
  <div class="mscreen hidden" id="scr-map">
    <div class="diff-title">SELECT MAP</div>
    <button class="btn diff-btn sel" data-map="day">&#x2600;&#xFE0F; DAY<br><small>Clear skies, full visibility</small></button>
    <button class="btn diff-btn" data-map="night">&#x1F319; NIGHT<br><small>Dark map, glowing lamps &mdash; enemy codes fade out sooner</small></button>
    <button class="btn small back-btn" data-back="scr-main">&larr; BACK</button>
  </div>
  <div class="mscreen hidden" id="scr-diff">
    <div class="diff-title">SELECT DIFFICULTY</div>
    <button class="btn diff-btn" data-diff="easy">&#x1F60A; EASY<br><small>Bots are slow &mdash; good for learning</small></button>
    <button class="btn diff-btn sel" data-diff="medium">&#x1F610; MEDIUM &#x2605;<br><small>Balanced bots &mdash; recommended</small></button>
    <button class="btn diff-btn" data-diff="hard">&#x1F608; HARD<br><small>Fast, ruthless bots</small></button>
    <button class="btn small back-btn" data-back="scr-map">&larr; BACK</button>
  </div>
  <div class="mscreen hidden" id="scr-gfx">
    <div class="diff-title">SELECT GRAPHICS</div>
    <button class="btn diff-btn sel" data-q="auto">&#x2699;&#xFE0F; AUTO<br><small>LOW on phones, HIGH on desktop &mdash; recommended</small></button>
    <button class="btn diff-btn" data-q="low">&#x1F4F1; LOW<br><small>Smoother on older phones</small></button>
    <button class="btn diff-btn" data-q="high">&#x1F5A5;&#xFE0F; HIGH<br><small>Full effects on desktop</small></button>
    <button class="btn small back-btn" data-back="scr-diff">&larr; BACK</button>
  </div>
  <div class="mscreen hidden" id="scr-coming">
    <div class="diff-title">PLAY WITH REAL PLAYERS</div>
    <div class="coming">&#x1F310; Coming soon &mdash; X login required</div>
    <button class="btn small back-btn" data-back="scr-main">&larr; BACK</button>
  </div>
  <div class="mscreen hidden" id="scr-char">
    <div class="diff-title">CHARACTER</div>
    <div id="skins"><div class="diff-title">YOUR SKIN <span id="wins-line"></span></div><div id="skin-row"></div></div>
    <div id="rewards"><div class="diff-title">KILL REWARDS <span id="kills-line"></span></div><div id="reward-row"></div><div id="next-reward"></div><div class="dim" style="font-size:12px">Tap an unlocked reward to equip / unequip it</div></div>
    <button class="btn small back-btn" data-back="scr-main">&larr; BACK</button>
  </div>
  <div class="mscreen hidden" id="scr-info">
    <div class="diff-title">INFO</div>
    <div class="info-list">
      <details open><summary>How to play</summary><p>Every enemy has a 4-digit code above their head. Spot an enemy's code, memorize it, then type the exact numbers. You play in third person &mdash; your own code is shown at the top of the screen. Wrong code = input locked for 0.8 seconds.</p></details>
      <details><summary>Map</summary><p>Five two-story buildings you can enter and climb &mdash; hide inside, peek through upstairs windows. Pick &#x2600;&#xFE0F; DAY or &#x1F319; NIGHT: at night every building and street is lamp-lit and enemy codes fade out sooner. Watch for the crashed airplane in the south-east &mdash; a scorched landmark with good cover. 50 players, shrinking zone, sudden death when 5 remain.</p></details>
      <details><summary>Items</summary><p>&#x2764;&#xFE0F; LOVE blocks one kill &bull; &#x1F500; DECOY randomizes your code &bull; &#x1F4A5; CONFUSE scrambles the nearest enemy's code &mdash; but beware &#x1F3AD; MIMIC traps that look like real items and scramble YOUR code! Supply drops fall every 15 seconds &mdash; fight over them.</p></details>
      <details><summary>Kill rewards</summary><p>Your total kills across all matches unlock accessories for YOUR character: &#x1F45F; SHOES (10), &#x1F3A9; HAT (15), &#x1F455; SHIRT (25), &#x1F9E5; JACKET (35), &#x1F451; GOLDEN CROWN (50), &#x1F9B8; WINGS (75), &#x1F308; RAINBOW TRAIL (100), &#x1F9B8;&#x200D;&#x2642;&#xFE0F; CAPE (150). They equip automatically; toggle them in CHARACTER.</p></details>
      <details><summary>Minimap</summary><p>Top-left corner shows you, the zone, items, drop beacons &mdash; and enemies, but ONLY ones you can actually see (no wallhack!).</p></details>
      <details><summary>Announcements</summary><p>Kill streaks earn on-screen announcements WITH an announcer voice: FIRST BLOOD, GOOD GAME, DOUBLE KILL, TRIPLE KILL, RAMPAGE, UNSTOPPABLE, LEGENDARY, plus REVENGE and LONG SHOT. 3+ streak sets you ON FIRE (bragging rights only!). Dying plays a short disappointed "ahhh". Toggle all sound in INFO &rarr; Sound.</p></details>
      <details><summary>PC controls</summary><p>Mouse locks automatically when the match starts &mdash; move the mouse to look (ESC to release, click to re-lock) &bull; WASD moves relative to the camera, like an FPS &bull; SHIFT to sprint &bull; SPACE to jump &bull; type 0-9</p></details>
      <details><summary>Mobile controls</summary><p>Phones must be in <b>LANDSCAPE</b> mode — portrait shows a rotate prompt and pauses the game. Left joystick to move &bull; drag the right side of the screen to look &bull; JUMP button &bull; number keypad. Tap the minimap to collapse/expand it.</p></details>
      <details><summary>Sound</summary><p><button id="snd-btn" class="btn small">&#x1F50A; SOUND: ON</button><br>Announcer voice, death groan and menu beeps. Saved in this browser.</p></details>
      <details><summary>Mouse sensitivity</summary><p><input type="range" id="sens" min="0.5" max="2" step="0.1" style="width:180px;vertical-align:middle"> <b id="sens-val">…</b><br>Higher = faster camera look. Applies instantly and is saved in this browser.</p></details>
    </div>
    <button class="btn small back-btn" data-back="scr-main">&larr; BACK</button>
  </div>
</div>
<div id="hud" class="hidden">
  <div id="warn"><span>⚠ DETECTED</span></div>
  <div id="crosshair">+</div>
  <div id="alivebox"><div class="alive">👥 <span id="alive">50</span></div><div class="zone" id="zonetxt">Safe zone</div><div class="diff" id="diffname">MEDIUM</div></div>
  <div id="killfeed"></div>
  <div id="banner"></div>
  <div id="announce" class="hidden"></div>
  <canvas id="minimap" width="150" height="150"></canvas>
  <button id="mmbtn" class="hidden" title="Expand minimap">&#x1F5FA;&#xFE0F;</button>
  <div id="zonebar"></div>
  <div id="bufferbox"><div class="lbl">TYPE ENEMY CODE</div><div id="typed">_ _ _ _</div></div>
  <div id="specbar" class="hidden">
    <div id="specinfo">💀 <b id="specplace">#?</b> — 🚁 DRONE CAM <span class="dim">(WASD / arrows / drag to pan • wheel / pinch to zoom)</span></div>
    <div><button class="btn small" id="btn-specfollow">🎯 FOLLOW LEADER: OFF</button>
    <button class="btn small" id="btn-spexit" style="background:#3a4654;color:#d8e6f2;box-shadow:0 5px 0 #232c36">EXIT</button></div>
  </div>
</div>
<div id="touch" class="hidden">
  <div id="joy"><div id="joy-knob"></div></div>
  <button id="btn-jump">JUMP</button>
  <div id="pad"></div>
</div>
<div id="locktip" class="hidden">🖱 Click to lock the mouse &amp; play</div>
<div id="rotate" class="hidden"><div class="rot-phone">&#x1F4F1;</div><div class="rot-txt">&#x1F504; ROTATE YOUR PHONE</div><div class="rot-sub">Number Royale needs LANDSCAPE mode to play</div></div>
<div id="center-msg" class="hidden"></div>`);

const $ = (id) => document.getElementById(id);
const padEl = $('pad');
padEl.innerHTML = [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k =>
  k === '' ? '<span></span>' : `<button data-k="${k}">${k}</button>`).join('');

// skins picker on the menu
let unlocks = loadUnlocks();
function renderSkins() {
  const row = $('skin-row');
  row.innerHTML = '';
  $('wins-line').textContent = `🏆 ${unlocks.wins} win${unlocks.wins === 1 ? '' : 's'}`;
  for (const s of SKINS) {
    const unlocked = unlocks.wins >= s.need;
    const b = document.createElement('button');
    b.className = 'btn skin-btn' + (unlocks.skin === s.id ? ' sel' : '');
    const dotColor = s.id === 'default' ? '#9aa5b1' : s.id === 'gold' ? '#ffd700' : s.id === 'flame' ? '#ff5722' : 'linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f)';
    b.innerHTML = `<span class="dot" style="background:${dotColor}"></span>${unlocked ? s.name : '🔒 ' + s.name + ' (' + s.need + ' wins)'}`;
    if (unlocked) b.addEventListener('click', () => {
      unlocks.skin = s.id; saveUnlocks(unlocks); renderSkins(); beep(820, 0.08);
    });
    else b.disabled = true;
    row.appendChild(b);
  }
}
renderSkins();

// kill rewards panel on the menu — each unlocked reward is an equip/unequip toggle
function renderRewards() {
  const kl = $('kills-line');
  if (!kl) return;
  kl.textContent = `⚔️ ${unlocks.totalKills} total kills`;
  const row = $('reward-row'); row.innerHTML = '';
  for (const r of REWARDS) {
    const un = unlocks.totalKills >= r.need;
    const eq = un && unlocks.acc[r.id] !== false;
    const b = document.createElement('button');
    b.className = 'btn skin-btn' + (eq ? ' sel' : '');
    b.innerHTML = `<span style="font-size:18px">${un ? r.icon : '🔒'}</span>${r.name}${un ? '' : ' (' + r.need + ')'}`;
    if (un) {
      b.title = eq ? 'Equipped — click to unequip' : 'Unequipped — click to equip';
      b.addEventListener('click', () => {
        unlocks.acc[r.id] = !eq;
        saveUnlocks(unlocks);
        renderRewards();
        if (G.player) applyAccessories(G.player);
        beep(820, 0.08);
      });
    } else {
      b.disabled = true;
      b.title = 'Unlock at ' + r.need + ' total kills';
    }
    row.appendChild(b);
  }
  const next = REWARDS.find(r => unlocks.totalKills < r.need);
  $('next-reward').textContent = next ? `Next: ${next.icon} ${next.name} — ${next.need - unlocks.totalKills} kills to go` : '🏆 All rewards unlocked!';
}
renderRewards();

// graphics choice (SELECT GRAPHICS screen, pre-match; applies to the next match, no reload needed)
function renderGfxSel() {
  let q = 'auto';
  try { q = localStorage.getItem(QUALITY_KEY) || 'auto'; } catch (e) {}
  document.querySelectorAll('#scr-gfx .diff-btn').forEach((b) => b.classList.toggle('sel', b.dataset.q === q));
}
document.querySelectorAll('#scr-gfx .diff-btn').forEach((b) => {
  b.addEventListener('click', () => {
    try { localStorage.setItem(QUALITY_KEY, b.dataset.q); } catch (e) {}
    renderGfxSel();
    beep(820, 0.08);
    if (menuFlow === 'real') { showScreen('scr-coming'); return; }
    startMatch(pendingDiff);
  });
});
renderGfxSel();

// master sound toggle (INFO screen; persists; gates beeps, announcer voice, death groan)
function renderSndBtn() {
  const b = $('snd-btn'); if (!b) return;
  b.innerHTML = soundOn() ? '&#x1F50A; SOUND: ON' : '&#x1F507; SOUND: OFF';
}
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'snd-btn') {
    try { localStorage.setItem(SOUND_KEY, soundOn() ? 'off' : 'on'); } catch (err) {}
    renderSndBtn();
    beep(820, 0.08);
  }
});
renderSndBtn();

// mouse sensitivity slider (INFO screen; applies instantly, persisted)
// (declared up here so initSens below can use it at load time)
const SENS_KEY = 'nr_sens';
let sensMul = 1;
try { sensMul = Math.min(2, Math.max(0.5, parseFloat(localStorage.getItem(SENS_KEY)) || 1)); } catch (e) {}
(function initSens() {
  const r = $('sens'), v = $('sens-val');
  if (!r || !v) return;
  r.value = sensMul.toFixed(1);
  v.textContent = sensMul.toFixed(1) + 'x';
  r.addEventListener('input', () => {
    sensMul = Math.min(2, Math.max(0.5, parseFloat(r.value) || 1));
    v.textContent = sensMul.toFixed(1) + 'x';
    try { localStorage.setItem(SENS_KEY, sensMul.toFixed(1)); } catch (e) {}
  });
})();

// ---------- Drop items (LOVE shield + DECOY + CONFUSE) ----------
const items = []; // {type:'love'|'decoy'|'confuse', pos, grp, icon, phase}
let itemTimer = 0;
const ITEM_RING = { love: 0xff6b8f, decoy: 0xc07bff, confuse: 0xff9e3d };
function spawnItemPos() {
  for (let i = 0; i < 80; i++) {
    const x = (Math.random() * 2 - 1) * 100, z = (Math.random() * 2 - 1) * 100;
    let bad = false;
    for (const c of colliders) if (x > c.minX - 1.5 && x < c.maxX + 1.5 && z > c.minZ - 1.5 && z < c.maxZ + 1.5) { bad = true; break; }
    if (!bad) return { x, z };
  }
  return { x: 60, z: 60 };
}
function confuseIconCanvas() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,160,60,0.9)'); grad.addColorStop(1, 'rgba(255,160,60,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#ff9e3d'; g.lineWidth = 11; g.lineCap = 'round';
  // spiral swirl
  g.beginPath();
  for (let a = 0; a < Math.PI * 4.4; a += 0.12) {
    const r = 8 + a * 4.6;
    const x = 64 + Math.cos(a) * r, y = 64 + Math.sin(a) * r;
    if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
  return cv;
}
function spawnItemAt(x, z, type, bypassCap = false) {
  if (!bypassCap && items.length >= 7) return;
  if (items.length >= 10) return; // hard cap even for supply drops
  // MIMIC: a trap that looks IDENTICAL to a random real item (love/decoy/confuse)
  const mimic = type === 'mimic';
  const visual = mimic ? ['love', 'decoy', 'confuse'][Math.floor(Math.random() * 3)] : type;
  const grp = new THREE.Group(); grp.position.set(x, 0, z);
  const ringCol = ITEM_RING[visual];
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.09, 8, 26), new THREE.MeshBasicMaterial({ color: ringCol }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; grp.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshBasicMaterial({ color: ringCol, transparent: true, opacity: 0.25 }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.13; grp.add(disc);
  let icon;
  if (visual === 'love') icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(loveIconCanvas()), depthTest: true, transparent: true }));
  else if (visual === 'decoy') icon = decoySprite(1.1);
  else icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(confuseIconCanvas()), depthTest: true, transparent: true }));
  icon.position.y = 1.35; grp.add(icon);
  scene.add(grp);
  items.push({ type, mimic, disguise: mimic ? visual : null, pos: grp.position, grp, icon, phase: Math.random() * 6.28 });
}
function rollItemType(pool) {
  // ~22% of items are MIMICS — never trust a pickup blindly
  if (Math.random() < 0.22) return 'mimic';
  return pool[Math.floor(Math.random() * pool.length)];
}
function spawnItem() {
  // ambient spawns: keep roughly 3 items active (love/decoy mix, sometimes a mimic)
  if (items.length >= 7) return;
  const { x, z } = spawnItemPos();
  spawnItemAt(x, z, rollItemType(['love', 'decoy']));
}
function removeItemAt(idx) {
  const [it] = items.splice(idx, 1);
  if (it) scene.remove(it.grp);
}
function updateItems(dt) {
  // gentle bob + spin
  for (const it of items) {
    it.phase += dt * 3;
    it.icon.position.y = 1.35 + Math.sin(it.phase) * 0.22;
    it.icon.material.rotation = Math.sin(it.phase * 0.5) * 0.25;
  }
  // keep roughly 3 items active (max 4)
  itemTimer += dt;
  if (itemTimer >= 3) { itemTimer = 0; if (items.length < 3) spawnItem(); }
}
function newUniqueCode() {
  const used = new Set(G.players.filter(p => p.alive).map(p => p.code));
  let c;
  do { c = String(Math.floor(1000 + Math.random() * 9000)); } while (used.has(c));
  return c;
}
// Instantly re-randomize a living player's code (unique). Shared by DECOY (self) and CONFUSE (enemy).
function scrambleCode(p) {
  const old = p.code;
  const nc = newUniqueCode();
  p.code = nc;
  if (p.grp.userData.label) p.grp.userData.label.userData.setCode(nc);
  G.seen.delete(old);
  // bots mid-typing this target fumble: their typed code no longer matches
  for (const b of G.players) {
    if (!b.isPlayer && b.alive && b.target === p && b.typeProgress > 0) { b.typeProgress = 0; b.typeTimer = -0.5; }
  }
  return nc;
}
function nearestEnemy(p) {
  let best = null, bestD = 1e9;
  for (const e of G.players) {
    if (e === p || !e.alive) continue;
    const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}
function attachLoveSprite(p) {
  const sp = heartSprite(0.55);
  sp.position.set(0.85, 2.55, 0); // small, offset to the side — never obstructs the view
  p.grp.add(sp);
  p.grp.userData.loveSprite = sp;
}
function consumeLove(p) {
  p.hasLove = false;
  const sp = p.grp.userData.loveSprite;
  if (sp) { p.grp.remove(sp); p.grp.userData.loveSprite = null; }
}
function pickUpItem(p, idx) {
  const it = items[idx];
  if (it.mimic) {
    // MIMIC trap: scrambles the PICKER's own code instead of the expected effect
    const nc = scrambleCode(p);
    feed('🎭 Someone grabbed a MIMIC!'); // generic — never reveal whose code changed
    if (p.isPlayer) { banner('🎭 MIMIC! Your code got scrambled! New: ' + nc); beep(280, 0.25, 'sawtooth', 0.14); }
    else beep(480, 0.1, 'sawtooth', 0.08);
    removeItemAt(idx);
    return;
  }
  if (it.type === 'love') {
    if (p.hasLove) return; // non-stackable: leave the item for someone else
    p.hasLove = true;
    attachLoveSprite(p);
    feed(`❤️ <b>${p.isPlayer ? 'YOU' : p.code}</b> picked up a LOVE shield!`);
    if (p.isPlayer) { banner('❤️ LOVE SHIELD! One kill attempt will be blocked.'); beep(990, 0.12, 'sine', 0.14); }
    else beep(760, 0.08, 'sine', 0.08);
  } else if (it.type === 'decoy') {
    // DECOY: instant code re-randomization (no duration, no stacking)
    const nc = scrambleCode(p);
    feed('🔀 Someone used a decoy!'); // generic — never reveal whose code changed
    if (p.isPlayer) { banner('🔀 New code: ' + nc); beep(1200, 0.12, 'sine', 0.14); }
    else beep(880, 0.08, 'sine', 0.08);
  } else {
    // CONFUSE: scramble the NEAREST living enemy's code, instant. Fizzles if none.
    const tgt = nearestEnemy(p);
    if (!tgt) { if (p.isPlayer) banner('💥 Confuse fizzled — no enemies left!'); return; }
    const nc = scrambleCode(tgt);
    feed('💥 Someone\'s code got scrambled!'); // generic — never reveal whose
    if (tgt.isPlayer) { banner('💥 Your code was scrambled! New: ' + nc); beep(400, 0.2, 'sawtooth', 0.14); }
    else beep(940, 0.1, 'sine', 0.1);
  }
  removeItemAt(idx);
}
function tryPickupItems(p) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    const d = Math.hypot(p.pos.x - it.pos.x, p.pos.z - it.pos.z);
    if (d < 1.4) pickUpItem(p, i);
  }
}
function nearestItem(pos, maxD) {
  let best = null, bestD = maxD;
  for (const it of items) {
    const d = Math.hypot(pos.x - it.pos.x, pos.z - it.pos.z);
    if (d < bestD) { best = it; bestD = d; }
  }
  return best;
}

// ---------- Supply drops: every 15s, first one right at GO ----------
const drops = []; // falling pods {grp,x,z,t}
const beacons = []; // {mesh,t}
const dropCols = []; // supply-pod colliders (removed between matches)
const DROP_EVERY = 15;
const DROP_TYPES = ['love', 'decoy', 'confuse'];
function supplyDrop() {
  const { x, z } = spawnItemPos();
  // drop pod: glowing crate falling from the sky
  const grp = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), MAT(0xffb300));
  const glow = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.25, 2.0), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
  glow.position.y = 0.95; grp.add(crate, glow);
  grp.position.set(x, 34, z);
  scene.add(grp);
  drops.push({ grp, x, z, t: 0 });
  banner('📦 SUPPLY DROP INCOMING!');
  feed('📦 A supply drop is falling!');
  beep(660, 0.1, 'square', 0.1); setTimeout(() => beep(880, 0.12, 'square', 0.1), 150);
}
function updateDrops(dt) {
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.t += dt;
    const k = Math.min(1, d.t / 1.9);
    d.grp.position.y = 34 * (1 - k) + 0.85 * k;
    d.grp.rotation.y += dt * 4;
    if (k >= 1) {
      // landed: burst 2-3 items around the pod, leave a light beacon
      const n = 2 + (Math.random() < 0.5 ? 1 : 0);
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + Math.random() * 0.6;
        const ix = d.x + Math.cos(a) * 2.4, iz = d.z + Math.sin(a) * 2.4;
        const cx = Math.max(-MAP + 2, Math.min(MAP - 2, ix));
        const cz = Math.max(-MAP + 2, Math.min(MAP - 2, iz));
        spawnItemAt(cx, cz, rollItemType(DROP_TYPES), true);
      }
      dropCols.push(addCollider(d.x, d.z, 1.9, 1.9, 1.7));
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(1.3, 1.7, 70, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xffb300, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
      );
      beam.position.set(d.x, 35, d.z);
      scene.add(beam);
      beacons.push({ mesh: beam, t: 0 });
      feed('📦 Supply drop landed — grab the loot!');
      scene.remove(d.grp);
      drops.splice(i, 1);
    }
  }
  for (let i = beacons.length - 1; i >= 0; i--) {
    const b = beacons[i];
    b.t += dt;
    const base = G.mapMode === 'night' ? 0.55 : 0.3; // brighter beacons at night
    b.mesh.material.opacity = Math.max(0, base * (1 - b.t / 25));
    if (b.t >= 25) { scene.remove(b.mesh); beacons.splice(i, 1); }
  }
}

// ---------- Game state ----------
const DIFFS = {
  easy:   { label: 'EASY',   react: [1.4, 2.2], digit: [0.9, 1.3],  speedMul: 0.82, mistake: 0.22 },
  medium: { label: 'MEDIUM', react: [0.8, 1.4], digit: [0.6, 0.9],  speedMul: 0.93, mistake: 0.07 },
  hard:   { label: 'HARD',   react: [0.4, 0.9], digit: [0.35, 0.6], speedMul: 1.0,  mistake: 0 },
};
const GRACE_S = 3; // seconds after GO where bots cannot type
const G = {
  mode: 'menu', // menu | countdown | play | spectate | end
  players: [], player: null, startTime: 0, elapsed: 0,
  buffer: '', lockUntil: 0, kills: 0, seen: new Map(), // code -> lastSeen time
  diff: 'medium', diffCfg: DIFFS.medium, mapMode: 'day', firstBlood: false,
  zone: { r: 175, targetR: 175, cx: 0, cz: 0, nextAt: 25, phase: 0, outSince: null },
  suddenDeath: false,
  dropT: 0,
  specPlace: 0, drone: null, // drone: {x, z, h, follow} — free spectate camera
};
const ZONE_PHASES = [ // [waitSec, shrinkToRadius] — tuned for 50-player matches
  [16, 110], [14, 75], [12, 50], [10, 30], [9, 16], [8, 7], [7, 2],
];
const ZONE_SHRINK_SPEED = 3.2;
let zoneMesh = null;
function makeZoneMesh(r) {
  if (zoneMesh && Math.abs(zoneMesh._r - r) < 0.6) return;
  if (zoneMesh) { scene.remove(zoneMesh); zoneMesh.geometry.dispose(); }
  zoneMesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 60, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
  zoneMesh._r = r;
  zoneMesh.position.set(G.zone.cx, 30, G.zone.cz);
  scene.add(zoneMesh);
}

function uniqueCodes(n) {
  const s = new Set();
  while (s.size < n) s.add(String(Math.floor(1000 + Math.random() * 9000)));
  return [...s];
}
function freeSpot(taken = []) {
  let bestSpot = null, bestScore = -1;
  for (let i = 0; i < 200; i++) {
    const x = (Math.random() * 2 - 1) * 100, z = (Math.random() * 2 - 1) * 100;
    let bad = false;
    for (const c of colliders) if (x > c.minX - 2 && x < c.maxX + 2 && z > c.minZ - 2 && z < c.maxZ + 2) { bad = true; break; }
    if (bad) continue;
    // keep spawns spread out and preferably out of direct sight of earlier spawns
    let minD = 1e9, seen = false;
    for (const t of taken) {
      const d = Math.hypot(x - t.x, z - t.z);
      if (d < minD) minD = d;
      if (d < 16) { bad = true; break; }
      if (d < 45 && !seen && !losBlocked({ x, z }, t)) seen = true;
    }
    if (!bad && !seen) return { x, z };
    if (!bad && minD > bestScore) { bestScore = minD; bestSpot = { x, z }; }
  }
  return bestSpot || { x: 0, z: 105 }; // best-effort spread, never a stacked duplicate
}

const PLAYER_COUNT = 50;
function startMatch(diffKey) {
  if (diffKey && DIFFS[diffKey]) { G.diff = diffKey; G.diffCfg = DIFFS[diffKey]; }
  LOWQ = resolveQuality() === 'low'; // apply the SELECT GRAPHICS choice to this match
  // auto-lock the mouse straight from this click (it's a user gesture, so the
  // browser allows it) — no extra click needed to start looking around
  if (!isTouch) {
    try {
      const r = renderer.domElement.requestPointerLock();
      if (r && r.catch) r.catch(() => {});
    } catch (e) {}
  }
  const cfg = G.diffCfg;
  // clear old
  for (const p of G.players) scene.remove(p.grp);
  for (let i = items.length - 1; i >= 0; i--) removeItemAt(i);
  for (const d of drops) scene.remove(d.grp);
  drops.length = 0;
  for (const b of beacons) scene.remove(b.mesh);
  beacons.length = 0;
  for (const c of dropCols) { const i = colliders.indexOf(c); if (i >= 0) colliders.splice(i, 1); }
  dropCols.length = 0;
  G.players = []; G.buffer = ''; G.kills = 0; G.seen.clear(); G.elapsed = 0;
  G.suddenDeath = false; G.dropT = 0; G.firstBlood = false;
  G.drone = null; G.specPlace = 0;
  $('specbar').classList.add('hidden');
  G.zone = { r: 175, targetR: 175, cx: 0, cz: 0, nextAt: ZONE_PHASES[0][0], phase: 0, outSince: null };
  makeZoneMesh(175);
  const codes = uniqueCodes(PLAYER_COUNT);
  const spots = [];
  for (let i = 0; i < PLAYER_COUNT; i++) {
    const spot = freeSpot(spots); spots.push(spot);
    const isPlayer = i === 0;
    const grp = makeCharacter(COLORS[i], codes[i], isPlayer, unlocks.skin);
    grp.position.set(spot.x, 0, spot.z);
    // bot personality: 40% aggressive, 30% camper, 30% hunter
    let persona = 'aggro';
    if (!isPlayer) {
      const r = Math.random();
      persona = r < 0.4 ? 'aggro' : r < 0.7 ? 'camper' : 'hunter';
    }
    const p = {
      id: i, isPlayer, code: codes[i], alive: true, grp, hasLove: false,
      persona, streak: 0,
      pos: grp.position, yaw: Math.random() * Math.PI * 2, vy: 0, grounded: true,
      walkPhase: Math.random() * 6,
      // bot fields (scaled by difficulty)
      target: null, best: null, bestD: 1e9, scanT: Math.random() * 0.3,
      route: [], home: null, homeWp: null, seenTargetAt: -9, typeProgress: 0, typeTimer: 0,
      reaction: cfg.react[0] + Math.random() * (cfg.react[1] - cfg.react[0]),
      digitTime: cfg.digit[0] + Math.random() * (cfg.digit[1] - cfg.digit[0]),
      speedMul: cfg.speedMul * (0.92 + Math.random() * 0.16),
      repathAt: 0,
      // v17 movement: whisker avoidance + stuck recovery (spawn pos so the detector starts honest)
      stuckX: spot.x, stuckZ: spot.z, stuckT: 0, steerBias: 0,
      probeT: Math.random() * 0.15, detourUntil: 0,
    };
    if (isPlayer) G.player = p;
    G.players.push(p);
  }
  // initial item drops (love + decoy mix)
  for (let i = 0; i < 3; i++) spawnItem();
  applyAccessories(G.player); // equip earned kill-reward accessories
  yaw = G.player.yaw - Math.PI; pitch = 0; yawT = yaw; pitchT = pitch; camSnap = true;
  $('diffname').textContent = cfg.label + ' • ' + (G.mapMode === 'night' ? '🌙' : '☀️');
  applyMapMode();
  $('killfeed').innerHTML = '';
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (isTouch) $('touch').classList.remove('hidden');
  G.mode = 'countdown'; G.startTime = performance.now();
  showCenter('5', 'Memorize your code: <b style="color:#ffd93b">' + G.player.code + '</b>');
  let c = 5;
  const iv = setInterval(() => {
    if (rotPaused) return; // don't tick the countdown while the rotate overlay is up
    c--;
    if (c > 0) showCenter(String(c), 'Memorize your code: <b style="color:#ffd93b">' + G.player.code + '</b>');
    else if (c === 0) {
      showCenter('GO!', 'Type an enemy code to eliminate them!');
      clearInterval(iv);
      setTimeout(() => {
        $('center-msg').classList.add('hidden');
        G.mode = 'play'; G.startTime = performance.now();
        supplyDrop(); // first drop lands immediately at match start
        G.dropT = 0;
        lockPointer();
      }, 600);
    }
  }, 1000);
  updateAliveHUD();
}
function showCenter(big, sub) {
  const el = $('center-msg');
  el.classList.remove('hidden');
  el.innerHTML = `<div class="big">${big}</div><div class="sub">${sub || ''}</div>`;
}
function lockPointer() {
  if (!isTouch && G.mode === 'play') renderer.domElement.requestPointerLock();
}

// ---------- Input ----------
const keys = {};
let yaw = 0, pitch = 0, yawT = 0, pitchT = 0, locked = false;
// FPS-style mouse look: mouse/touch write yawT/pitchT targets, the camera
// eases toward them every frame (dt-correct, no jitter). The mouse has full
// authority over the camera — no auto-follow fighting it.
const PITCH_MIN = -1.2, PITCH_MAX = 1.35;
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (G.mode === 'play' && /^[0-9]$/.test(e.key)) inputDigit(e.key);
  if (G.mode === 'spectate' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'Backspace') { e.preventDefault(); backspace(); }
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  $('locktip').classList.toggle('hidden', locked || isTouch || G.mode !== 'play');
});
$('btn-specfollow').addEventListener('click', () => {
  if (G.drone) { G.drone.follow = !G.drone.follow; updateFollowBtn(); beep(700, 0.06); }
});
$('btn-spexit').addEventListener('click', () => location.reload());
renderer.domElement.addEventListener('click', () => {
  if (G.mode === 'play' && !isTouch) lockPointer();
});
$('locktip').addEventListener('click', lockPointer);
addEventListener('mousemove', (e) => {
  if (!locked || G.mode !== 'play') return;
  // clamp spikes (browsers can emit a jump when pointer lock engages/disengages)
  const mx = Math.max(-250, Math.min(250, e.movementX || 0));
  const my = Math.max(-250, Math.min(250, e.movementY || 0));
  yawT -= mx * 0.0022 * sensMul; pitchT -= my * 0.0022 * sensMul;
  pitchT = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitchT));
});
// drone camera zoom (spectate mode only)
addEventListener('wheel', (e) => {
  if (G.mode !== 'spectate' || !G.drone) return;
  e.preventDefault();
  const d = G.drone;
  d.h = Math.max(DRONE_H_MIN, Math.min(DRONE_H_MAX, d.h * (e.deltaY > 0 ? 1.12 : 1 / 1.12)));
}, { passive: false });

// touch controls
const joyVec = { x: 0, y: 0 };
let lookTouch = null, joyTouch = null;
const joyEl = $('joy'), knob = $('joy-knob');
function joyHandle(t) {
  const r = joyEl.getBoundingClientRect();
  let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
  const len = Math.hypot(dx, dy), max = r.width / 2;
  if (len > max) { dx *= max / len; dy *= max / len; }
  knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  joyVec.x = dx / max; joyVec.y = dy / max;
}
renderer.domElement.addEventListener('touchstart', (e) => {
  if (G.mode === 'spectate') { specTouchStart(e); return; }
  for (const t of e.changedTouches) {
    if (t.clientX > innerWidth / 2 && !lookTouch) lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
  }
}, { passive: true });
addEventListener('touchmove', (e) => {
  if (G.mode === 'spectate') { specTouchMove(e); return; }
  for (const t of e.changedTouches) {
    if (lookTouch && t.identifier === lookTouch.id) {
      yawT -= (t.clientX - lookTouch.x) * 0.005; pitchT -= (t.clientY - lookTouch.y) * 0.005;
      pitchT = Math.max(PITCH_MIN, Math.min(PITCH_MAX, pitchT));
      lookTouch.x = t.clientX; lookTouch.y = t.clientY;
    }
    if (joyTouch && t.identifier === joyTouch.id) joyHandle(t);
  }
}, { passive: true });
addEventListener('touchend', (e) => {
  if (G.mode === 'spectate') { specTouchEnd(e); return; }
  for (const t of e.changedTouches) {
    if (lookTouch && t.identifier === lookTouch.id) lookTouch = null;
    if (joyTouch && t.identifier === joyTouch.id) { joyTouch = null; joyVec.x = joyVec.y = 0; knob.style.transform = 'translate(-50%,-50%)'; }
  }
});
joyEl.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; joyTouch = { id: t.identifier }; joyHandle(t); e.preventDefault(); }, { passive: false });
$('btn-jump').addEventListener('touchstart', (e) => { e.preventDefault(); doJump(G.player); }, { passive: false });
padEl.addEventListener('touchstart', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  e.preventDefault();
  const k = b.dataset.k;
  if (k === '⌫') backspace(); else inputDigit(k);
}, { passive: false });

// ---------- Combat ----------
function nowS() { return G.elapsed; }
function refreshSeen() {
  // mark enemies the player currently sees (from the third-person camera, angle+LOS)
  const p = G.player; if (!p || !p.alive) return;
  const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  for (const e of G.players) {
    if (e === p || !e.alive) continue;
    eyeTmp.copy(camera.position);
    midTmp.copy(e.pos); midTmp.y += CHAR_AIM_Y;
    const to = midTmp.clone().sub(eyeTmp);
    const dist = to.length();
    if (dist > labelDistLimit()) continue; // night mode: codes readable ~15% sooner
    const ang = to.normalize().angleTo(fwd);
    if (ang < 0.6 && !losBlocked(eyeTmp, midTmp)) G.seen.set(e.code, nowS());
  }
}
function inputDigit(d) {
  if (G.mode !== 'play' || !G.player.alive) return;
  if (performance.now() < G.lockUntil) return;
  G.buffer += d; beep(600 + Number(d) * 30, 0.05);
  renderBuffer();
  if (G.buffer.length === 4) resolveBuffer();
}
function backspace() {
  if (performance.now() < G.lockUntil) return;
  G.buffer = G.buffer.slice(0, -1); renderBuffer();
}
function resolveBuffer() {
  const code = G.buffer;
  const target = G.players.find(p => p.alive && !p.isPlayer && p.code === code);
  const seenAt = G.seen.get(code);
  const inMemory = seenAt !== undefined && nowS() - seenAt <= 5;
  const isSelf = code === G.player.code;
  if (target && !isSelf) {
    if (target.hasLove) {
      // LOVE shield consumes the kill attempt
      consumeLove(target);
      feed(`🛡 <b>${target.code}</b> blocked a kill with LOVE!`);
      banner('🛡 IMMUNE! Their LOVE shield blocked your code.');
      beep(300, 0.2, 'sawtooth', 0.14);
      G.lockUntil = performance.now() + 800;
      $('typed').classList.add('locked');
      $('bufferbox').classList.add('shake');
      setTimeout(() => $('bufferbox').classList.remove('shake'), 200);
    } else if (inMemory) {
      const killDist = Math.hypot(G.player.pos.x - target.pos.x, G.player.pos.z - target.pos.z);
      eliminate(target, G.player, 'code', killDist);
      beep(880, 0.12, 'square', 0.16); setTimeout(() => beep(1320, 0.15), 90);
    } else {
      beep(160, 0.18, 'sawtooth', 0.14);
      G.lockUntil = performance.now() + 800;
      $('typed').classList.add('locked');
      $('bufferbox').classList.add('shake');
      setTimeout(() => $('bufferbox').classList.remove('shake'), 200);
      banner(target ? 'Correct code, but enemy not seen / forgotten!' : 'Wrong code!');
    }
  } else {
    beep(160, 0.18, 'sawtooth', 0.14);
    G.lockUntil = performance.now() + 800;
    $('typed').classList.add('locked');
    $('bufferbox').classList.add('shake');
    setTimeout(() => $('bufferbox').classList.remove('shake'), 200);
    banner(isSelf ? "That's YOUR OWN code!" : 'Wrong code!');
  }
  G.buffer = '';
  setTimeout(() => { $('typed').classList.remove('locked'); renderBuffer(); }, 60);
  renderBuffer();
}
function renderBuffer() {
  const b = G.buffer.padEnd(4, '_').split('').join(' ');
  $('typed').textContent = b;
}
function banner(txt) {
  const b = $('banner'); b.textContent = txt; b.style.opacity = 1;
  clearTimeout(b._t); b._t = setTimeout(() => b.style.opacity = 0, 2500);
}
// ---------- Kill announcements: compact top-center pills (v18), queued (max 2) ----------
const annQ = []; let annActive = false;
function announce(txt, cls, voice) {
  if (annQ.length >= 2) annQ.shift(); // never stack-block the view
  annQ.push({ txt, cls });
  if (voice) speak(voice); // announcer voice for the player's moments
  if (!annActive) dequeueAnnounce();
}
function dequeueAnnounce() {
  const n = annQ.shift();
  const el = $('announce');
  if (!n) { annActive = false; el.classList.add('hidden'); return; }
  annActive = true;
  el.className = 'show ' + n.cls;
  el.textContent = n.txt;
  el.classList.remove('hidden');
  beep(880, 0.1, 'square', 0.12);
  setTimeout(() => { el.classList.add('hidden'); dequeueAnnounce(); }, 1700);
}
function feed(txt) {
  const f = $('killfeed');
  const div = document.createElement('div'); div.className = 'k'; div.innerHTML = txt;
  f.prepend(div);
  while (f.children.length > 6) f.lastChild.remove();
}
function updateAliveHUD() { $('alive').textContent = G.players.filter(p => p.alive).length; }

function eliminate(victim, killer, how, killDist = 0) {
  if (!victim.alive) return;
  victim.alive = false;
  victim.streak = 0;
  if (killer && how === 'code') victim.lastKiller = killer; // for REVENGE tracking
  removeFire(victim);
  victim.grp.rotation.z = Math.PI / 2; victim.grp.position.y = Math.max(0.18, victim.pos.y + 0.18);
  setTimeout(() => { victim.grp.visible = false; }, 2500);
  // kill streak tracking (code kills only, not zone)
  if (killer && killer !== victim && how === 'code') {
    killer.streak = (killer.streak || 0) + 1;
    // FIRST BLOOD: the very first code kill of the whole match
    if (!G.firstBlood) {
      G.firstBlood = true;
      if (killer.isPlayer) announce('🩸 FIRST BLOOD!', 'firstblood', 'First Blood!');
      else feed(`🩸 <b>FIRST BLOOD</b> — ${killer.code}`);
    }
    if (killer.streak >= 3 && !killer.grp.userData.fireSprite) {
      attachFire(killer);
      const who = killer.isPlayer ? 'YOU' : killer.code;
      feed(`🔥 <b>${who}</b> is ON FIRE! (${killer.streak} kill streak)`);
      // no big banner here — the streak-tier announcement below covers the player
    }
    if (killer.isPlayer) {
      G.kills++;
      // lifetime kill counter + reward unlocks (mid-match, banner + instant equip)
      unlocks.totalKills++;
      const fresh = newlyUnlockedRewards(unlocks.totalKills - 1, unlocks.totalKills);
      for (const r of fresh) {
        unlocks.acc[r.id] = true; // newly unlocked rewards start equipped
        announce('🎁 REWARD UNLOCKED: ' + r.icon + ' ' + r.name + '!', 'reward');
        feed(`🎁 <b>REWARD</b> — ${r.icon} ${r.name} unlocked!`);
      }
      saveUnlocks(unlocks);
      if (fresh.length) applyAccessories(G.player);
      renderRewards();
      const tier = Math.min(killer.streak, 6);
      const tierVoice = ['', 'Good game!', 'Double kill!', 'Triple kill!', 'Rampage!', 'Unstoppable!', 'Legendary!'][tier];
      announce(['', 'GOOD GAME!!!', 'DOUBLE KILL!!', 'TRIPLE KILL!!!', 'RAMPAGE!!!!', 'UNSTOPPABLE!!!!!', 'LEGENDARY!!!!!!'][tier], 't' + tier, tierVoice);
      if (G.player.lastKiller === victim) { announce('😤 REVENGE!', 'revenge', 'Revenge!'); G.player.lastKiller = null; }
      if (killDist > 40) announce('🎯 LONG SHOT! ' + Math.round(killDist) + 'm', 'longshot', 'Long shot!');
    }
  }
  feed(`<b>${killer ? killer.code : 'ZONE'}</b> ▸ ${victim.code}${victim.isPlayer ? ' (YOU)' : ''}`);
  beep(220, 0.15, 'triangle', 0.1);
  updateAliveHUD();
  const alive = G.players.filter(p => p.alive);
  // SUDDEN DEATH at 5 or fewer alive
  if (alive.length <= 5 && alive.length > 1) triggerSuddenDeath();
  if (victim.isPlayer) { deathScream(); enterSpectate(killer); return; }
  if (alive.length === 1 && alive[0].isPlayer) { endMatch(true); return; }
  if (alive.length <= 1) { endMatch(G.player.alive); }
}
function placement() { return G.players.filter(p => p.alive).length + (G.player.alive ? 0 : 1); }
function endMatch(won) {
  if (G.mode === 'end') return;
  G.mode = 'end';
  document.exitPointerLock && document.exitPointerLock();
  $('minimap').style.display = 'none';
  $('mmbtn').classList.add('hidden');
  const place = won ? 1 : placement();
  if (won) {
    beep(523, .15); setTimeout(() => beep(659, .15), 140); setTimeout(() => beep(784, .3), 300);
    // track wins + unlock skins
    unlocks.wins++; saveUnlocks(unlocks);
    let unlockedNew = null;
    for (const s of SKINS) if (unlocks.wins >= s.need && unlocks.wins - 1 < s.need) unlockedNew = s;
    if (unlockedNew) setTimeout(() => banner('🏆 New skin unlocked: ' + unlockedNew.name + '!'), 1600);
  }
  const el = $('center-msg');
  el.classList.remove('hidden');
  el.innerHTML = `<div class="big">${won ? '🏆 #1 VICTORY!' : '💀 #' + place}</div>
    <div class="sub">${won ? 'You are the last one standing. GG!' : 'You were eliminated.'}</div>
    <div class="stats">Eliminations: <b>${G.kills}</b> &nbsp;•&nbsp; Survived: <b>${Math.floor(G.elapsed)}s</b> &nbsp;•&nbsp; Difficulty: <b>${G.diffCfg.label}</b> &nbsp;•&nbsp; Wins: <b>${unlocks.wins}</b><br>Your code: <b style="color:#ffd93b">${G.player.code}</b></div>
    <button class="btn small" id="btn-again">↻ PLAY AGAIN</button>
    <button class="btn small" id="btn-menu" style="background:#3a4654;color:#d8e6f2;box-shadow:0 5px 0 #232c36">MENU</button>`;
  $('btn-again').onclick = () => { el.classList.add('hidden'); resetChars(); startMatch(); };
  $('btn-menu').onclick = () => location.reload();
}

// ---------- Spectate mode: free drone camera (after the player dies) ----------
// Tilted top-down view: code labels (camera-facing sprites) stay readable,
// and the camera never gets low enough to clip through buildings.
const DRONE_H_MIN = 16, DRONE_H_MAX = 42, DRONE_TILT = 0.5;
const clampDrone = (v) => Math.max(-(MAP - 8), Math.min(MAP - 8, v));
let dronePan = null, dronePinch = null; // touch state for the drone
function enterSpectate(killer) {
  G.mode = 'spectate';
  document.exitPointerLock && document.exitPointerLock();
  G.specPlace = G.players.filter(p => p.alive).length + 1; // placement at death
  const p = G.player;
  G.drone = {
    x: clampDrone(p ? p.pos.x : 0),
    z: clampDrone(p ? p.pos.z : 0),
    h: 26, follow: false,
  };
  dronePan = null; dronePinch = null;
  $('specbar').classList.remove('hidden');
  $('specplace').textContent = '#' + G.specPlace + ' of ' + PLAYER_COUNT;
  updateFollowBtn();
  $('warn').style.opacity = 0; // no DETECTED warnings while spectating
  $('touch').classList.add('hidden');
  $('minimap').style.display = 'none'; // drone cam covers the map anyway
  $('mmbtn').classList.add('hidden');
  banner('\uD83D\uDC80 You were eliminated \u2014 \uD83D\uDE81 drone cam: WASD / drag to pan, wheel / pinch to zoom');
}
function updateFollowBtn() {
  const b = $('btn-specfollow');
  if (b) b.textContent = '\uD83C\uDFAF FOLLOW LEADER: ' + (G.drone && G.drone.follow ? 'ON' : 'OFF');
}
function specTouchStart(e) {
  const ts = e.changedTouches;
  if (ts.length >= 2) {
    const a = ts[0], b = ts[1];
    dronePan = null;
    dronePinch = {
      a: a.identifier, b: b.identifier,
      d0: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
      h0: G.drone ? G.drone.h : 26,
    };
  } else if (ts.length === 1 && !dronePinch) {
    dronePan = { id: ts[0].identifier, x: ts[0].clientX, y: ts[0].clientY };
  }
}
function specTouchMove(e) {
  const d = G.drone; if (!d) return;
  if (dronePinch) {
    let a = null, b = null;
    for (const t of e.touches) {
      if (t.identifier === dronePinch.a) a = t;
      if (t.identifier === dronePinch.b) b = t;
    }
    if (a && b && dronePinch.d0 > 10) {
      const dd = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (dd > 10) d.h = Math.max(DRONE_H_MIN, Math.min(DRONE_H_MAX, dronePinch.h0 * dronePinch.d0 / dd));
    }
    return;
  }
  if (dronePan) {
    for (const t of e.changedTouches) {
      if (t.identifier === dronePan.id) {
        const s = d.h / 650; // world units per pixel at current zoom
        d.x = clampDrone(d.x - (t.clientX - dronePan.x) * s);
        d.z = clampDrone(d.z - (t.clientY - dronePan.y) * s);
        dronePan.x = t.clientX; dronePan.y = t.clientY;
        if (d.follow) { d.follow = false; updateFollowBtn(); }
      }
    }
  }
}
function specTouchEnd(e) {
  for (const t of e.changedTouches) {
    if (dronePan && t.identifier === dronePan.id) dronePan = null;
    if (dronePinch && (t.identifier === dronePinch.a || t.identifier === dronePinch.b)) dronePinch = null;
  }
}
function updateSpectate(dt) {
  const alive = G.players.filter(p => p.alive && !p.isPlayer);
  if (alive.length <= 1) {
    // match over while spectating
    const winner = alive[0];
    G.mode = 'end';
    $('specbar').classList.add('hidden');
    const el = $('center-msg');
    el.classList.remove('hidden');
    el.innerHTML = `<div class="big">\uD83C\uDFC6 ${winner ? winner.code : '\u2014'} WINS!</div>
      <div class="sub">You placed <b>#${G.specPlace} of ${PLAYER_COUNT}</b>.</div>
      <div class="stats">Eliminations: <b>${G.kills}</b> &nbsp;\u2022&nbsp; Survived: <b>${Math.floor(G.elapsed)}s</b> &nbsp;\u2022&nbsp; Difficulty: <b>${G.diffCfg.label}</b></div>
      <button class="btn small" id="btn-again">\u21BB PLAY AGAIN</button>
      <button class="btn small" id="btn-menu" style="background:#3a4654;color:#d8e6f2;box-shadow:0 5px 0 #232c36">MENU</button>`;
    $('btn-again').onclick = () => { el.classList.add('hidden'); resetChars(); startMatch(); };
    $('btn-menu').onclick = () => location.reload();
    return;
  }
  const d = G.drone;
  if (!d) return;
  if (d.follow) {
    // glide after the kill leader (highest streak)
    const lead = alive.reduce((a, b) => ((b.streak || 0) > (a.streak || 0) ? b : a), alive[0]);
    if (lead) {
      d.x = clampDrone(d.x + (lead.pos.x - d.x) * Math.min(1, dt * 3));
      d.z = clampDrone(d.z + (lead.pos.z - d.z) * Math.min(1, dt * 3));
    }
  } else {
    let px = 0, pz = 0;
    if (keys['KeyW'] || keys['ArrowUp']) pz -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) pz += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) px -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) px += 1;
    if (px || pz) {
      const l = Math.hypot(px, pz), sp = d.h * 1.15;
      d.x = clampDrone(d.x + (px / l) * sp * dt);
      d.z = clampDrone(d.z + (pz / l) * sp * dt);
    }
  }
  // tilted top-down drone view
  camera.position.set(d.x, d.h, d.z + d.h * DRONE_TILT);
  camera.lookAt(d.x, 0, d.z);
}

function resetChars() { for (const p of G.players) { p.grp.rotation.z = 0; p.grp.visible = true; } }

// ---------- Movement ----------
function angleDelta(from, to) { return Math.atan2(Math.sin(to - from), Math.cos(to - from)); }
function turnToward(current, target, dt, rate) { return current + angleDelta(current, target) * (1 - Math.exp(-rate * dt)); }
function doJump(p) { if (p && p.grounded && p.alive) { p.vy = 7.6; p.grounded = false; } }
function stepPhysics(p, dt) {
  // stair/floor-aware: groundY() returns the highest walkable surface underfoot
  if (p.vy > 0) {
    // actively jumping: only land when falling back down
    p.vy -= 22 * dt;
    p.pos.y += p.vy * dt;
    const g = groundY(p.pos.x, p.pos.z, p.pos.y);
    if (p.pos.y <= g) { p.pos.y = g; p.vy = 0; p.grounded = true; }
    else p.grounded = false;
  } else {
    const g = groundY(p.pos.x, p.pos.z, p.pos.y);
    if (g > p.pos.y) {
      p.pos.y = g; p.vy = 0; p.grounded = true; // climbed a stair step
    } else {
      p.vy = Math.min(0, p.vy - 22 * dt);
      p.pos.y += p.vy * dt;
      const g2 = groundY(p.pos.x, p.pos.z, p.pos.y);
      if (p.pos.y <= g2 + 0.001) { p.pos.y = g2; p.vy = 0; p.grounded = true; }
      else if (p.pos.y - g2 <= 0.6) { p.pos.y = g2; p.vy = 0; p.grounded = true; } // smooth step-down
      else p.grounded = false; // walked off an edge: falling
    }
  }
}
function animateChar(p, dt, moving) {
  const u = p.grp.userData;
  if (!p.alive) return;
  if (moving) p.walkPhase += dt * 9;
  const s = moving ? Math.sin(p.walkPhase) * 0.5 : 0;
  u.legL.rotation.x = s; u.legR.rotation.x = -s; u.armL.rotation.x = -s; u.armR.rotation.x = s;
  p.grp.position.y = p.pos.y;
  p.grp.rotation.y = p.yaw;
}
function camBlockedAt(x, z, y) {
  for (const c of colliders) {
    if (y > c.y0 - 0.2 && y < c.y1 + 0.25 && x > c.minX - 0.3 && x < c.maxX + 0.3 && z > c.minZ - 0.3 && z < c.maxZ + 0.3) return true;
  }
  return false;
}
const _fwd = new THREE.Vector3(), _tgt = new THREE.Vector3(), _des = new THREE.Vector3(), _pt = new THREE.Vector3();
let camSnap = true;
function updateCamera(dt) {
  const p = G.player; if (!p) return;
  // smooth look: ease actual yaw/pitch toward the mouse/touch targets
  const sk = 1 - Math.exp(-22 * dt);
  yaw += angleDelta(yaw, yawT) * sk;
  pitch += (pitchT - pitch) * sk;
  _fwd.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  _tgt.copy(p.pos); _tgt.y += 1.18;
  _tgt.x += Math.cos(yaw) * 0.4; _tgt.z += -Math.sin(yaw) * 0.4; // slight shoulder offset
  _des.copy(_tgt).addScaledVector(_fwd, -3.45); _des.y += 0.55;
  // pull camera in when an obstacle sits between character and camera
  let dist = 3.45;
  for (let i = 1; i <= 14; i++) {
    _pt.copy(_tgt).addScaledVector(_fwd, -(3.45 * i / 14));
    _pt.y = _tgt.y + (_des.y - _tgt.y) * (i / 14);
    if (camBlockedAt(_pt.x, _pt.z, _pt.y)) { dist = 3.45 * Math.max(0, i - 1) / 14; break; }
  }
  _des.copy(_tgt).addScaledVector(_fwd, -dist); _des.y = _tgt.y + 0.55 * (dist / 3.45);
  if (_des.y < 0.5) _des.y = 0.5;
  if (camSnap) { camera.position.copy(_des); camSnap = false; }
  else camera.position.lerp(_des, Math.min(1, dt * 14));
  camera.lookAt(_tgt.x + _fwd.x * 10, _tgt.y + _fwd.y * 10, _tgt.z + _fwd.z * 10);
}
function updatePlayer(dt) {
  const p = G.player; if (!p || !p.alive) return;
  const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? 10.5 : 6.4;
  let mx = 0, mz = 0;
  if (keys['KeyW']) mz -= 1; if (keys['KeyS']) mz += 1;
  if (keys['KeyA']) mx -= 1; if (keys['KeyD']) mx += 1;
  mx += joyVec.x; mz += joyVec.y;
  const len = Math.hypot(mx, mz);
  let moving = false;
  if (len > 0.05) {
    // WASD moves relative to the CAMERA direction. The mouse owns the camera
    // fully (no auto-follow), so a held key can never bend into a circle.
    const moveYaw = Math.atan2(mx, mz) + yaw;
    const strength = Math.min(1, len);
    p.pos.x += Math.sin(moveYaw) * speed * strength * dt;
    p.pos.z += Math.cos(moveYaw) * speed * strength * dt;
    moving = true;
    // Character model rotates to face its actual travel direction.
    p.yaw = turnToward(p.yaw, moveYaw, dt, 11);
  }
  collide(p.pos);
  if (keys['Space']) doJump(p);
  stepPhysics(p, dt);
  animateChar(p, dt, moving);
  updateCamera(dt);
  tryPickupItems(p); // love / decoy drop pickups
  // zone check
  const dx = p.pos.x - G.zone.cx, dz = p.pos.z - G.zone.cz;
  const dist = Math.hypot(dx, dz);
  if (dist > G.zone.r && G.mode === 'play') {
    if (!G.zone.outSince) G.zone.outSince = nowS();
    const left = 5 - (nowS() - G.zone.outSince);
    $('zonebar').textContent = `⚠ OUTSIDE THE ZONE! Get back in ${Math.max(0, left).toFixed(1)}s`;
    if (left <= 0) eliminate(p, null, 'zone');
  } else {
    G.zone.outSince = null;
    $('zonebar').textContent = '';
  }
}

// ---------- Bots ----------
function botSee(bot, target) {
  eyeTmp.copy(bot.pos); eyeTmp.y += CHAR_EYE;
  midTmp.copy(target.pos); midTmp.y += CHAR_AIM_Y;
  const d = eyeTmp.distanceTo(midTmp);
  if (d > 95) return false;
  return !losBlocked(eyeTmp, midTmp);
}
function scanTargets(bot) {
  // staggered perception: full enemy scan every ~0.3s instead of every frame (50 players!)
  let best = null, bestD = 1e9;
  for (const e of G.players) {
    if (e === bot || !e.alive) continue;
    const d = bot.pos.distanceTo(e.pos);
    if (d < bestD && botSee(bot, e)) { best = e; bestD = d; }
  }
  if (best) { bot.target = best; bot.seenTargetAt = nowS(); bot.best = best; bot.bestD = bestD; }
  else { bot.best = null; bot.bestD = 1e9; }
}
// route the bot toward (x,z,y), climbing stairs via the nearest staircase if floors differ
function routeTo(bot, x, z, y) {
  if (Math.abs(y - bot.pos.y) > 1 && stairsList.length) {
    const st = nearestStairs(bot.pos.x, bot.pos.z);
    bot.route = [
      { x: st.base.x, z: st.base.z, y: 0 },
      { x: st.top.x, z: st.top.z, y: SLAB_TOP },
      { x, z, y },
    ];
  } else {
    bot.route = [{ x, z, y }];
  }
  bot.routeDest = { x, z, y }; // final destination, for re-routing if the bot falls off the stairs
}
// ---------- Bot movement helpers (v17): whisker avoidance + stuck recovery ----------
// point collision test for steering probes (same rules as collide(), but read-only)
function pointBlocked(x, z, y) {
  const feet = y, head = y + CHAR_H, r = CHAR_RADIUS;
  for (const c of colliders) {
    if (head <= c.y0 + 0.05 || feet >= c.y1 - 0.05) continue;
    if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return c;
  }
  return null;
}
// clearance probe: how far we can walk in direction ang before hitting something
function probeDist(x, z, y, ang, maxD) {
  const sx = Math.sin(ang), cz = Math.cos(ang);
  for (let d = 1.2; d <= maxD; d += 1.2) {
    if (pointBlocked(x + sx * d, z + cz * d, y)) return d - 1.2;
  }
  return maxD;
}
function updateBot(bot, dt) {
  if (!bot.alive) return;
  // perception (staggered)
  bot.scanT -= dt;
  if (bot.scanT <= 0) { bot.scanT = 0.25 + Math.random() * 0.15; scanTargets(bot); }
  const best = bot.best, bestD = bot.bestD;
  const memoryValid = bot.target && bot.target.alive && (nowS() - bot.seenTargetAt <= 3);
  const activeTarget = (best || (memoryValid ? bot.target : null));

  // typing progress (frozen during the post-GO grace period)
  if (activeTarget && best && nowS() >= GRACE_S) { // only progresses while actually seeing
    bot.typeTimer += dt;
    const need = bot.typeProgress === 0 ? bot.reaction : bot.digitTime;
    if (bot.typeTimer >= need) {
      bot.typeTimer = 0;
      if (Math.random() < G.diffCfg.mistake) { bot.typeProgress = 0; bot.typeTimer = -0.5; } // bot fumbles the code
      else {
        bot.typeProgress++;
        if (bot.typeProgress >= 4) {
          const t = bot.target; bot.typeProgress = 0; bot.target = null;
          if (t && t.alive) {
            if (t.hasLove) {
              // LOVE shield blocks the bot's kill attempt
              consumeLove(t);
              feed(`🛡 <b>${t.isPlayer ? 'YOU' : t.code}</b> blocked a kill with LOVE!`);
              if (t.isPlayer) { banner('🛡 Your LOVE shield saved you!'); beep(520, 0.18, 'sine', 0.14); }
            } else {
              eliminate(t, bot, 'code');
            }
          }
          return;
        }
      }
    }
  } else if (!memoryValid) { bot.typeProgress = 0; bot.typeTimer = 0; bot.target = null; }

  // ---- movement by personality ----
  let destX = null, destZ = null, destY = 0;
  const dxz = Math.hypot(bot.pos.x - G.zone.cx, bot.pos.z - G.zone.cz);
  const inDetour = nowS() < bot.detourUntil; // stuck recovery owns the route right now
  if (dxz > G.zone.r * 0.82) {
    destX = G.zone.cx; destZ = G.zone.cz; destY = 0; // everyone heads inside the zone
  } else if (bot.persona === 'camper') {
    if (!bot.home) { bot.home = buildings2[Math.floor(Math.random() * buildings2.length)]; bot.homeWp = null; }
    if (activeTarget && best && bestD < 40) { destX = best.pos.x; destZ = best.pos.z; destY = best.pos.y; }
    else {
      // patrol the hideout instead of freezing: shuffle between floors / nearby spots
      const hd = bot.homeWp ? Math.hypot(bot.pos.x - bot.homeWp.x, bot.pos.z - bot.homeWp.z) : 1e9;
      if (!bot.homeWp || hd < 2 || Math.random() < dt * 0.3) {
        const r = Math.random();
        if (r < 0.55) bot.homeWp = Math.random() < 0.5 ? bot.home.ground : bot.home.upper;
        else { // small wander around the hideout
          const a = Math.random() * Math.PI * 2, d = 3 + Math.random() * 5;
          bot.homeWp = {
            x: Math.max(-MAP + 2, Math.min(MAP - 2, bot.home.cx + Math.sin(a) * d)),
            z: Math.max(-MAP + 2, Math.min(MAP - 2, bot.home.cz + Math.cos(a) * d)),
            y: 0,
          };
        }
      }
      destX = bot.homeWp.x; destZ = bot.homeWp.z; destY = bot.homeWp.y || 0;
      // occasionally rotate to a different building, like a human switching spots
      if (Math.random() < dt * 0.02) { bot.home = buildings2[Math.floor(Math.random() * buildings2.length)]; bot.homeWp = null; }
    }
  } else if (bot.persona === 'hunter') {
    if (activeTarget && best && bestD < 14) { destX = best.pos.x; destZ = best.pos.z; destY = best.pos.y; } // close prey
    else {
      const it = nearestItem(bot.pos, 45);
      if (it) { destX = it.pos.x; destZ = it.pos.z; destY = 0; }
      else if (!bot.route.length || nowS() > bot.repathAt) {
        const wp = waypoints[Math.floor(Math.random() * waypoints.length)];
        routeTo(bot, wp.x, wp.z, wp.y); bot.repathAt = nowS() + 6 + Math.random() * 5;
      }
    }
  } else {
    // AGGRESSIVE: chase visible enemies, roam otherwise
    if (activeTarget && bestD > 12) { destX = activeTarget.pos.x; destZ = activeTarget.pos.z; destY = activeTarget.pos.y; }
    else if (activeTarget && best && bestD <= 12) {
      // close enough to type: circle-strafe the prey like a human instead of freezing
      const oa = Math.atan2(bot.pos.x - activeTarget.pos.x, bot.pos.z - activeTarget.pos.z) + 0.5;
      destX = activeTarget.pos.x + Math.sin(oa) * 7;
      destZ = activeTarget.pos.z + Math.cos(oa) * 7;
      destY = activeTarget.pos.y;
    }
    else {
      const it = nearestItem(bot.pos, 12);
      if (it) { destX = it.pos.x; destZ = it.pos.z; destY = 0; }
      else if (!bot.route.length || nowS() > bot.repathAt) {
        const wp = waypoints[Math.floor(Math.random() * waypoints.length)];
        routeTo(bot, wp.x, wp.z, wp.y); bot.repathAt = nowS() + 6 + Math.random() * 5;
      }
    }
  }
  if (destX !== null && !inDetour) routeTo(bot, destX, destZ, destY);
  // global anti-idle fallback: a bot with no route and no orders always finds something to do
  if (!inDetour && !bot.route.length && destX === null) {
    if (bot.persona === 'camper' && bot.home) {
      const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * 5;
      routeTo(bot,
        Math.max(-MAP + 2, Math.min(MAP - 2, bot.home.cx + Math.sin(a) * d)),
        Math.max(-MAP + 2, Math.min(MAP - 2, bot.home.cz + Math.cos(a) * d)), 0);
    } else {
      const wp2 = waypoints[Math.floor(Math.random() * waypoints.length)];
      routeTo(bot, wp2.x, wp2.z, wp2.y);
    }
    bot.repathAt = nowS() + 5 + Math.random() * 4;
  }

  // follow the route queue (whisker avoidance steering + stuck recovery)
  const wp = bot.route[0];
  let moving = false;
  if (wp) {
    const dx = wp.x - bot.pos.x, dz = wp.z - bot.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.6) {
      // reached a stair-top leg but still downstairs = slipped off the stairs: re-route
      if (wp.y > 1 && bot.pos.y < wp.y - 1 && bot.routeDest && Math.abs(bot.routeDest.y - bot.pos.y) > 1) {
        routeTo(bot, bot.routeDest.x, bot.routeDest.z, bot.routeDest.y);
      } else {
        bot.route.shift();
      }
    }
    else {
      const baseAng = Math.atan2(dx, dz);
      // staggered whisker probes: if something blocks the path ahead, steer
      // toward whichever side (±37°) has more clearance — like a human sidestepping
      bot.probeT -= dt;
      if (bot.probeT <= 0) {
        bot.probeT = 0.1 + Math.random() * 0.08;
        const y = bot.pos.y;
        if (probeDist(bot.pos.x, bot.pos.z, y, baseAng, 6) < 2.4) {
          const left = probeDist(bot.pos.x, bot.pos.z, y, baseAng + 0.65, 6);
          const right = probeDist(bot.pos.x, bot.pos.z, y, baseAng - 0.65, 6);
          bot.steerBias = (left >= right ? 1 : -1) * (0.85 + Math.random() * 0.45);
          // low obstacle right ahead (crate lip, step, curb): hop it like a human would
          const c = pointBlocked(bot.pos.x + Math.sin(baseAng) * 1.5, bot.pos.z + Math.cos(baseAng) * 1.5, y);
          if (c && c.y1 - y <= 1.35 && bot.grounded) doJump(bot);
        } else {
          bot.steerBias *= 0.55; // path clear: ease back to a straight line
          if (Math.abs(bot.steerBias) < 0.06) bot.steerBias = 0;
        }
      }
      const ang = baseAng + bot.steerBias;
      const sp = (activeTarget && best && bestD <= 16 ? 3.2 : 5.4) * bot.speedMul;
      bot.pos.x += Math.sin(ang) * sp * dt; collide(bot.pos);
      bot.pos.z += Math.cos(ang) * sp * dt; collide(bot.pos);
      // Face the intended (steered) travel direction, NOT the post-collision
      // displacement: when collide() cancels most of a step (wall corners, map
      // edges), the leftover displacement is perpendicular noise and the old
      // code made bots visibly strafe/walk sideways.
      bot.yaw = turnToward(bot.yaw, ang, dt, 10);
      moving = true;
      // stuck detector: pushing toward a waypoint but barely displaced over ~1.5s
      bot.stuckT += dt;
      if (bot.stuckT >= 1.5) {
        const moved = Math.hypot(bot.pos.x - bot.stuckX, bot.pos.z - bot.stuckZ);
        if (moved < 0.7) {
          // STUCK: pick a fresh heading, hop, and own the route briefly so the
          // personality logic doesn't immediately re-issue the blocked order
          const na = Math.random() * Math.PI * 2;
          let nx = bot.pos.x + Math.sin(na) * 9, nz = bot.pos.z + Math.cos(na) * 9;
          if (pointBlocked(nx, nz, bot.pos.y)) { nx = bot.pos.x - Math.sin(na) * 9; nz = bot.pos.z - Math.cos(na) * 9; }
          bot.route = [{
            x: Math.max(-MAP + 2, Math.min(MAP - 2, nx)),
            z: Math.max(-MAP + 2, Math.min(MAP - 2, nz)),
            y: bot.pos.y,
          }];
          bot.routeDest = null;
          bot.steerBias = 0;
          bot.detourUntil = nowS() + 2.5;
          bot.repathAt = nowS() + 5 + Math.random() * 4;
          if (bot.grounded) doJump(bot);
        }
        bot.stuckX = bot.pos.x; bot.stuckZ = bot.pos.z; bot.stuckT = 0;
      }
    }
  } else if (best) {
    bot.yaw = turnToward(bot.yaw, Math.atan2(best.pos.x - bot.pos.x, best.pos.z - bot.pos.z), dt, 8);
  } else if (Math.random() < dt * 0.5) {
    bot.yaw += (Math.random() - 0.5) * 1.5; // idle glance around, human-like
  }
  if (!moving) { bot.stuckX = bot.pos.x; bot.stuckZ = bot.pos.z; bot.stuckT = 0; }
  animateChar(bot, dt, moving);
  if (Math.random() < dt * 0.08) doJump(bot);
  stepPhysics(bot, dt);
  bot.grp.position.y = bot.pos.y;
  tryPickupItems(bot); // bots grab love / decoy / confuse drops too
  // zone elimination for bots
  if (dxz > G.zone.r) {
    bot.outT = (bot.outT || 0) + dt;
    if (bot.outT > 5) { eliminate(bot, null, 'zone'); return; }
  } else bot.outT = 0;
}

// player detection warning + crosshair heat
let warnLevel = -1;
function updateWarnings() {
  let dangerFrac = 0, hot = false;
  const p = G.player;
  if (p && p.alive) {
    for (const b of G.players) {
      if (b.isPlayer || !b.alive) continue;
      if (b.target === p && nowS() - b.seenTargetAt <= 3) {
        const frac = b.typeProgress > 0 ? (b.typeProgress + Math.min(1, Math.max(0, b.typeTimer / b.digitTime))) / 4 : 0.06;
        if (frac > dangerFrac) dangerFrac = frac;
      }
    }
    // crosshair: is a visible enemy near center?
    const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    for (const e of G.players) {
      if (e.isPlayer || !e.alive) continue;
      eyeTmp.copy(camera.position);
      midTmp.copy(e.pos); midTmp.y += CHAR_AIM_Y;
      const to = midTmp.clone().sub(eyeTmp);
      if (to.length() < labelDistLimit() && to.normalize().angleTo(fwd) < 0.045 && !losBlocked(eyeTmp, midTmp)) { hot = true; break; }
    }
  }
  const w = $('warn');
  if (dangerFrac > 0) {
    w.style.opacity = 0.35 + 0.65 * dangerFrac;
    const lvl = Math.max(1, Math.ceil(dangerFrac * 4));
    if (lvl !== warnLevel) { warnLevel = lvl; w.querySelector('span').textContent = `⚠ DETECTED ${'▮'.repeat(lvl)}${'▯'.repeat(4 - lvl)} ⚠`; }
  } else { w.style.opacity = 0; warnLevel = -1; }
  $('crosshair').classList.toggle('hot', hot);
}

// ---------- Minimap (canvas 2D overlay; enemies only when visible — no wallhack) ----------
// Smaller on touch devices; tap the minimap to collapse it to a dot button, tap the button to expand.
const mmC = $('minimap'), mmg = mmC.getContext('2d');
let mmSize = isTouch ? 88 : 150;
let MM_S = mmSize / (MAP * 2);
const mmXY = (x, z) => [mmSize / 2 + x * MM_S, mmSize / 2 + z * MM_S];
let mmCollapsed = false;
function mmSetup() { mmC.width = mmC.height = mmSize; MM_S = mmSize / (MAP * 2); }
mmSetup();
mmC.addEventListener('click', () => { mmCollapsed = true; beep(600, 0.05); });
$('mmbtn').addEventListener('click', () => { mmCollapsed = false; beep(700, 0.05); });
let mmTimer = 0;
function enemyVisibleNow(e, fwd) {
  // same visibility/LOS rules as the 3D view: angle from camera + LOS, within label distance
  eyeTmp.copy(camera.position); midTmp.copy(e.pos); midTmp.y += CHAR_AIM_Y;
  const dx = midTmp.x - eyeTmp.x, dy = midTmp.y - eyeTmp.y, dz = midTmp.z - eyeTmp.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist > labelDistLimit()) return false;
  const inv = 1 / Math.max(dist, 0.001);
  const cosA = (dx * inv) * fwd.x + (dy * inv) * fwd.y + (dz * inv) * fwd.z;
  if (Math.acos(Math.max(-1, Math.min(1, cosA))) > 0.6) return false;
  return !losBlocked(eyeTmp, midTmp);
}
function updateMinimap(dt) {
  const show = G.mode === 'play' && !mmCollapsed;
  mmC.style.display = show ? 'block' : 'none';
  $('mmbtn').classList.toggle('hidden', !(G.mode === 'play' && mmCollapsed));
  if (!show) return;
  mmTimer -= dt;
  if (mmTimer > 0) return;
  mmTimer = 0.1; // ~10fps redraw
  const g = mmg;
  g.clearRect(0, 0, mmSize, mmSize);
  const z = G.zone;
  const [zx, zy] = mmXY(z.cx, z.cz);
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,70,60,.95)';
  g.beginPath(); g.arc(zx, zy, Math.max(0.5, z.r * MM_S), 0, 7); g.stroke();
  if (!G.suddenDeath && z.phase < ZONE_PHASES.length) {
    const tgt = z.shrinking ? ZONE_PHASES[z.phase][1] : z.r;
    if (Math.abs(tgt - z.r) > 1) {
      g.setLineDash([4, 4]); g.strokeStyle = 'rgba(255,255,255,.75)';
      g.beginPath(); g.arc(zx, zy, Math.max(0.5, tgt * MM_S), 0, 7); g.stroke(); g.setLineDash([]);
    }
  }
  // items: generic dots (never reveal the type — mimics included)
  g.fillStyle = '#ffe08a';
  for (const it of items) {
    const [x, y] = mmXY(it.pos.x, it.pos.z);
    g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill();
  }
  // supply drop beacons: pulsing orange
  const pr = 3 + Math.sin(performance.now() * 0.008) * 1.4;
  g.fillStyle = '#ff9800';
  for (const b of beacons) {
    const [x, y] = mmXY(b.mesh.position.x, b.mesh.position.z);
    g.beginPath(); g.arc(x, y, pr, 0, 7); g.fill();
  }
  for (const d of drops) {
    const [x, y] = mmXY(d.x, d.z);
    g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill();
  }
  // enemies: ONLY those the player can currently see
  const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  g.fillStyle = '#ff5252';
  for (const e of G.players) {
    if (e.isPlayer || !e.alive) continue;
    if (enemyVisibleNow(e, fwd)) {
      const [x, y] = mmXY(e.pos.x, e.pos.z);
      g.beginPath(); g.arc(x, y, 2.6, 0, 7); g.fill();
    }
  }
  // player: green arrow facing character direction
  const p = G.player;
  if (p && p.alive) {
    const [x, y] = mmXY(p.pos.x, p.pos.z);
    g.save(); g.translate(x, y);
    g.rotate(Math.atan2(Math.cos(p.yaw), Math.sin(p.yaw))); // angle of (sin yaw, cos yaw) from +x
    g.fillStyle = '#4dff7a';
    g.beginPath(); g.moveTo(7.5, 0); g.lineTo(-4.5, -5.5); g.lineTo(-4.5, 5.5); g.closePath(); g.fill();
    g.restore();
  }
}

// ---------- Zone ----------
function updateZone(dt) {
  const z = G.zone;
  if (G.suddenDeath) {
    // SUDDEN DEATH: collapse steadily but fairly — a sprinting player can keep up
    z.r = Math.max(2, z.r - dt * 3.5);
    makeZoneMesh(z.r);
    $('zonetxt').textContent = '⚠ SUDDEN DEATH!';
    return;
  }
  if (z.phase >= ZONE_PHASES.length) { $('zonetxt').textContent = 'Final zone!'; return; }
  const target = ZONE_PHASES[z.phase][1];
  if (!z.shrinking) {
    z.nextAt -= dt;
    $('zonetxt').textContent = 'Zone: ' + Math.max(0, z.nextAt).toFixed(0) + 's';
    if (z.nextAt <= 0) z.shrinking = true;
  } else {
    z.r = Math.max(target, z.r - dt * ZONE_SHRINK_SPEED);
    makeZoneMesh(z.r);
    $('zonetxt').textContent = 'ZONE SHRINKING!';
    if (z.r <= target) {
      z.phase++; z.shrinking = false;
      if (z.phase < ZONE_PHASES.length) z.nextAt = ZONE_PHASES[z.phase][0];
    }
  }
}
function triggerSuddenDeath() {
  if (G.suddenDeath) return;
  G.suddenDeath = true;
  banner('⚠️ SUDDEN DEATH! Zone collapsing — codes blinking!');
  feed('⚠️ <b>SUDDEN DEATH</b> — 5 players left, zone collapsing!');
  beep(440, 0.2, 'sawtooth', 0.16); setTimeout(() => beep(330, 0.25, 'sawtooth', 0.16), 220);
}

// ---------- Main loop ----------
const clock = new THREE.Clock();
// ---------- Landscape enforcement on touch devices ----------
// Portrait on a phone blocks the menu PLAY buttons and pauses a running match.
let rotPaused = false;
let pauseT0 = 0; // wall-clock time when the rotate pause began (to shift G.startTime on resume)
function isPortrait() {
  try {
    if (matchMedia('(orientation: portrait)').matches) return true;
    if (matchMedia('(orientation: landscape)').matches) return false;
  } catch (e) {}
  return innerHeight > innerWidth;
}
function checkRotate() {
  const need = isTouch && isPortrait();
  $('rotate').classList.toggle('hidden', !need);
  const was = rotPaused;
  rotPaused = need && (G.mode === 'play' || G.mode === 'countdown' || G.mode === 'spectate');
  if (rotPaused && !was) pauseT0 = performance.now();
  // on resume, shift the match clock so the zone/bots don't jump forward
  if (!rotPaused && was && pauseT0) { G.startTime += performance.now() - pauseT0; pauseT0 = 0; }
  for (const id of ['btn-bot', 'btn-real']) {
    const b = $(id);
    if (b) b.classList.toggle('disabled', need);
  }
}
addEventListener('orientationchange', () => setTimeout(checkRotate, 250));
addEventListener('resize', checkRotate);
checkRotate();

function loop() {
  requestAnimationFrame(loop);
  if (rotPaused) return; // portrait on phone: freeze the game behind the rotate overlay
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.mode === 'play' || G.mode === 'countdown' || G.mode === 'spectate') {
    G.elapsed = (performance.now() - G.startTime) / 1000;
    if (G.mode === 'play') {
      updatePlayer(dt);
      refreshSeen();
      for (const b of G.players) if (!b.isPlayer) updateBot(b, dt);
      updateItems(dt);
      updateDrops(dt);
      // supply drop every 15s (first one already fired at GO)
      G.dropT += dt;
      if (G.dropT >= DROP_EVERY) { G.dropT = 0; supplyDrop(); }
      updateWarnings();
      updateZone(dt);
      updateMinimap(dt);
    } else if (G.mode === 'spectate') {
      for (const b of G.players) if (!b.isPlayer) updateBot(b, dt);
      updateItems(dt);
      updateDrops(dt);
      updateZone(dt);
      updateSpectate(dt);
    } else if (G.mode === 'countdown') {
      const p = G.player;
      if (p) { p.yaw = yaw + Math.PI; animateChar(p, dt, false); updateCamera(dt); }
    }
    // Code label visibility: night mode fades enemy codes out ~15% sooner,
    // sudden death makes them blink. Neither touches the memory-window logic.
    {
      const night = G.mapMode === 'night';
      const pulse = 0.35 + 0.65 * Math.abs(Math.sin(G.elapsed * 5));
      for (const p of G.players) {
        const lbl = p.grp.userData.label;
        if (!lbl) continue;
        if (!p.alive) { lbl.visible = false; continue; }
        let op = 1;
        if (night) {
          const d = camera.position.distanceTo(p.pos);
          op = Math.max(0, Math.min(1, (LABEL_DIST_NIGHT - d) / 25));
        }
        if (G.suddenDeath && (G.mode === 'play' || G.mode === 'spectate')) op *= pulse;
        lbl.material.opacity = op;
        lbl.visible = op > 0.02;
      }
    }
    // rainbow skin shimmer (player only)
    const pl = G.player;
    if (pl && pl.grp.userData.skinId === 'rainbow' && pl.grp.userData.skinMats) {
      const hue = (G.elapsed * 0.12) % 1;
      for (const m of pl.grp.userData.skinMats) m.color.setHSL(hue, 0.85, 0.55);
    }
    // ON FIRE streak pulse
    for (const p of G.players) {
      const fs = p.grp.userData.fireSprite;
      if (fs && p.alive) {
        p.grp.userData.firePhase += dt * 9;
        const s = 1.3 + Math.sin(p.grp.userData.firePhase) * 0.18;
        fs.scale.set(s, s, 1);
      }
    }
    // crashed-plane smoke drift
    for (const sp of smokePuffs) {      sp.userData.ph += dt * 1.2;
      sp.position.y += dt * 0.7;
      sp.position.x += Math.sin(sp.userData.ph) * dt * 0.5;
      const ss = 3 + (sp.position.y - 2) * 0.35;
      sp.scale.set(ss, ss, 1);
      sp.material.opacity = Math.max(0, 0.5 - (sp.position.y - 2) * 0.045);
      if (sp.position.y > 11) sp.position.y = 2;
    }
    // drifting blocky clouds (matrix refresh throttled)
    cloudTick += dt;
    let moved = false;
    for (const cl of cloudData) {
      cl.cx += cl.spd * dt;
      if (cl.cx > 230) { cl.cx = -230; }
      moved = true;
    }
    if (moved && cloudTick > 0.15) { cloudTick = 0; refreshCloudInstances(); }
    // rainbow trail particles (player only)
    updateTrail(dt);
  }
  // idle camera in menu
  if (G.mode === 'menu') {
    const t = performance.now() * 0.00008;
    camera.position.set(Math.sin(t) * 70, 26, Math.cos(t) * 70);
    camera.lookAt(0, 2, 0);
  }
  renderer.render(scene, camera);
}
loop();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

let menuFlow = 'bot'; // 'bot' | 'real'
function showScreen(id) {
  document.querySelectorAll('#menu .mscreen').forEach((sc) => sc.classList.toggle('hidden', sc.id !== id));
}
$('btn-bot').addEventListener('click', () => {
  if (isTouch && isPortrait()) return; // landscape required on phones
  beep(720, 0.08);
  menuFlow = 'bot';
  showScreen('scr-map');
});
$('btn-real').addEventListener('click', () => {
  if (isTouch && isPortrait()) return; // landscape required on phones
  beep(720, 0.08);
  menuFlow = 'real';
  showScreen('scr-map');
});
$('btn-char').addEventListener('click', () => {
  beep(720, 0.08);
  renderSkins(); renderRewards();
  showScreen('scr-char');
});
$('btn-info').addEventListener('click', () => {
  beep(720, 0.08);
  showScreen('scr-info');
});
document.querySelectorAll('.back-btn').forEach((b) => {
  b.addEventListener('click', () => {
    beep(500, 0.06);
    showScreen(b.dataset.back);
  });
});
document.querySelectorAll('#scr-map .diff-btn').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#scr-map .diff-btn').forEach((x) => x.classList.toggle('sel', x === b));
    G.mapMode = b.dataset.map; beep(720, 0.08);
    showScreen('scr-diff');
  });
});
let pendingDiff = 'medium';
document.querySelectorAll('#scr-diff .diff-btn').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#scr-diff .diff-btn').forEach((x) => x.classList.toggle('sel', x === b));
    beep(820, 0.08);
    pendingDiff = b.dataset.diff;
    renderGfxSel();
    showScreen('scr-gfx');
  });
});
renderBuffer();
