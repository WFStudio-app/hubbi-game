import * as THREE from 'three';

/** Падающий снег вокруг игрока */
export class Snow {
  constructor(scene, count = 1400, radius = 90) {
    this.count = count;
    this.radius = radius;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    this.vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * radius * 2;
      positions[i * 3 + 1] = Math.random() * 60;
      positions[i * 3 + 2] = (Math.random() - 0.5) * radius * 2;
      this.vel[i] = 2 + Math.random() * 4;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.35, transparent: true, opacity: 0.85, depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(dt, center) {
    const pos = this.points.geometry.attributes.position;
    const r = this.radius;
    for (let i = 0; i < this.count; i++) {
      let y = pos.getY(i) - this.vel[i] * dt;
      let x = pos.getX(i) + Math.sin((y + i) * 0.15) * dt * 0.8;
      if (y < -6) y = 55;
      // держим снег вокруг камеры
      let px = x, pz = pos.getZ(i);
      if (px > r) px -= r * 2; if (px < -r) px += r * 2;
      if (pz > r) pz -= r * 2; if (pz < -r) pz += r * 2;
      pos.setXYZ(i, px, y, pz);
    }
    pos.needsUpdate = true;
    this.points.position.set(center.x, center.y, center.z);
  }
}
