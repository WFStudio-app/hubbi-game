import * as THREE from 'three';
import { Input } from './core/input.js';
import { getState, addCoins, addGems, addXp, setState } from './core/storage.js';
import { Terrain } from './world/terrain.js';
import { Snow } from './world/snow.js';
import { Player } from './entities/player.js';
import { Pickups } from './entities/pickups.js';
import { initUI, ui, toast, setHP, setStamina, refreshPlayerPanel, showDeath, setHUD, showScreen } from './ui/hud.js';

/* ================= СЦЕНА ================= */
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#bfe0f5');
scene.fog = new THREE.Fog('#cfe8fa', 90, 320);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 600);

// свет
const hemi = new THREE.HemisphereLight('#eaf6ff', '#9db8cc', 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff6da', 1.15);
sun.position.set(-80, 120, -100);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -140; sun.shadow.camera.right = 140;
sun.shadow.camera.top = 140; sun.shadow.camera.bottom = -140;
sun.shadow.camera.far = 500;
scene.add(sun);
scene.add(sun.target);

// далёкие горы (декорация)
addMountains();

/* ================= МИР ================= */
const terrain = new Terrain(scene);
const snow = new Snow(scene);
let st = getState();
const player = new Player(scene, terrain, {
  suitColor: st.suitColor, hatColor: st.hatColor,
  speedBoost: st.speedBoost, jumpBoost: st.jumpBoost,
});
const pickups = new Pickups(scene, terrain);

const input = new Input(canvas);

/* ================= ИГРОВОЙ ЦИКЛ ================= */
let playing = false;
let lastTime = performance.now();
let respawnTimer = 0;
let pickupRespawnT = 0;
const clock = new THREE.Clock();

initUI();
document.getElementById('loading').style.display = 'none';
refreshPlayerPanel();

ui.onPlay = () => {
  playing = true;
  input.requestLock();
  toast('Добро пожаловать на склон, ' + getState().name + '! ❄');
};
ui.onExitToMenu = () => { playing = false; input.releaseLock(); };
ui.onRespawn = () => {
  player.respawn(new THREE.Vector3(0, 0, -455));
  refreshPlayerPanel();
};
ui.onInventoryChanged = () => {
  const s = getState();
  player.walkSpeed = 6 + s.speedBoost * 0.8;
  player.jumpPower = 9 + s.jumpBoost * 1.2;
  if (s.hatColor) player.setHat(s.hatColor);
};

player.deathCallback = () => { showDeath(true); input.releaseLock(); };
player.trickCallback = (points, name) => {
  toast(name + ' XP+' + points, true);
  handleXp(points);
  const best = Math.max(getState().bestTrickScore || 0, points);
  setState({ bestTrickScore: best });
};
player.hitCallback = (text) => toast(text);
player.landCallback = (speed) => { if (speed > 10) handleXp(2); };

pickups.collectedCb = (kind, value) => {
  if (kind === 'coin') { addCoins(value); }
  else { addGems(value); }
  handleXp(kind === 'coin' ? 3 : 8);
  refreshPlayerPanel();
};

function handleXp(n) {
  const events = addXp(n);
  for (const e of events) if (e.type === 'levelup') toast('🎉 Новый уровень: ' + e.level + ' (+5💎)', true);
  refreshPlayerPanel();
}

/* ================= КАМЕРА ================= */
const camGoal = new THREE.Vector3();
const tmp = new THREE.Vector3();
function updateCamera(dt) {
  const headY = player.pos.y + (player.crouching ? 1.0 : 1.5);
  const dist = 7.5;
  const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
  tmp.set(
    player.pos.x + dist * cp * Math.sin(player.yaw),
    headY + dist * sp + 1.2,
    player.pos.z + dist * cp * Math.cos(player.yaw)
  );
  // не даём камере уйти под склон
  const gy = terrain.groundY(tmp.x, tmp.z) + 1.2;
  if (tmp.y < gy) tmp.y = gy;
  camera.position.lerp(tmp, 1 - Math.exp(-dt * 10));
  camGoal.set(player.pos.x, headY, player.pos.z);
  camera.lookAt(camGoal);
  // солнце следует за игроком для теней
  sun.position.set(player.pos.x - 80, player.pos.y + 120, player.pos.z - 100);
  sun.target.position.copy(player.pos);
  sun.target.updateMatrixWorld();
}

/* ================= ЦИКЛ ================= */
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  let dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  const time = clock.getElapsedTime();

  if (playing && !player.dead) {
    player.update(dt, input, updateCamera);
    pickups.update(dt, time, player);
    setHP(player.hp);
    setStamina(player.stamina);

    pickupRespawnT += dt;
    if (pickupRespawnT > 180) { pickupRespawnT = 0; pickups.respawnAll(); }
  } else if (!player.dead) {
    // в меню — медленный облёт сцены
    const a = time * 0.08;
    camera.position.set(Math.sin(a) * 60, terrain.groundY(0, -200) + 35, Math.cos(a) * 60 - 200);
    camera.lookAt(0, terrain.groundY(0, -200) + 2, -200);
  }

  snow.update(dt, camera.position);
  terrain.update(dt, time);
  input.endFrame();
  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Esc возвращает в меню автоматически через pointerlockchange
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && playing && !player.dead) {
    playing = false;
    setHUD(false);
    showScreen('#main-menu');
  }
});

/* ================= ГОРЫ НА ЗАДЕ ================= */
function addMountains() {
  const mat = new THREE.MeshLambertMaterial({ color: '#8fb8d8' });
  const capMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const rand = mulberry(777);
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    const r = 320 + rand() * 120;
    const x = Math.sin(ang) * r, z = Math.cos(ang) * r - 200;
    const h = 90 + rand() * 130;
    const m = new THREE.Mesh(new THREE.ConeGeometry(50 + rand() * 60, h, 6), mat);
    m.position.set(x, h / 2 - 30, z);
    scene.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry((50 + rand() * 60) * 0.4, h * 0.3, 6), capMat);
    cap.position.set(x, h - h * 0.15 - 30, z);
    scene.add(cap);
  }
}

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
