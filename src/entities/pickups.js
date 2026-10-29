import * as THREE from 'three';

/** Разбросанные по склону монетки и кристаллы, которые собирает игрок */
export class Pickups {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.items = [];
    this.collectedCb = null; // (kind, value) => void

    const coinGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.1, 16);
    coinGeo.rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshLambertMaterial({ color: '#ffd23f', emissive: '#b8860b', emissiveIntensity: 0.35 });
    const gemGeo = new THREE.OctahedronGeometry(0.42, 0);
    const gemMat = new THREE.MeshLambertMaterial({ color: '#6ee7ff', emissive: '#1899c9', emissiveIntensity: 0.5, transparent: true, opacity: 0.92 });

    const rand = mulberry32(4242);
    for (let i = 0; i < 70; i++) {
      const isGem = rand() < 0.18;
      const x = (rand() - 0.5) * 180;
      const z = -440 + rand() * 480;
      const mesh = new THREE.Mesh(isGem ? gemGeo : coinGeo, isGem ? gemMat : coinMat);
      const y = terrain.groundY(x, z) + 1.1;
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      scene.add(mesh);
      this.items.push({ mesh, kind: isGem ? 'gem' : 'coin', value: isGem ? 2 : 5, baseY: y, phase: rand() * 6.28, taken: false });
    }
  }

  update(dt, time, player) {
    for (const it of this.items) {
      if (it.taken) continue;
      it.mesh.rotation.y += dt * 2.5;
      it.mesh.position.y = it.baseY + Math.sin(time * 2 + it.phase) * 0.2;
      const d = it.mesh.position.distanceTo(player.pos.clone().setY(player.pos.y + 1));
      if (d < 1.6) {
        it.taken = true;
        it.mesh.visible = false;
        if (this.collectedCb) this.collectedCb(it.kind, it.value);
      }
    }
  }

  /** Респавн через N секунд после полного сбора — упрощённо раз в 3 минуты */
  respawnAll() {
    for (const it of this.items) {
      if (it.taken) { it.taken = false; it.mesh.visible = true; }
    }
  }
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
