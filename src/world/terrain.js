import * as THREE from 'three';

/**
 * Процедурный горнолыжный склон в стиле Hubbi World "Frozen Heights".
 * Склон идёт вниз по -Z; высота задана функцией terrainHeight(x, z).
 */
export class Terrain {
  constructor(scene) {
    this.scene = scene;
    this.sizeX = 260;   // ширина склона
    this.sizeZ = 520;   // длина склона
    this.segs = 140;
    this.colliders = []; // {box: THREE.Box3, mesh} — препятствия для коллизий

    this._buildGround();
    this._buildDecorations();
    this._buildLift();
  }

  /** Высота склона в точке (x, z). Чем меньше z — тем выше гора. */
  heightAt(x, z) {
    const slope = -z * 0.18;                       // общий уклон вниз
    const bump = Math.sin(x * 0.05) * Math.cos(z * 0.03) * 1.6; // мягкие неровности
    const edge = Math.max(0, (Math.abs(x) - 95)) * 0.6;         // боковые стенки-валы
    return slope + bump + edge;
  }

  _buildGround() {
    const geo = new THREE.PlaneGeometry(this.sizeX, this.sizeZ, this.segs, this.segs * 2);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cSnow = new THREE.Color('#ffffff');
    const cSnow2 = new THREE.Color('#cfe4f5');
    const cIce = new THREE.Color('#a8d4ee');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);
      // лёгкая вариация снега + ледяные полосы
      const t = (Math.sin(z * 0.12) * 0.5 + 0.5) * 0.35 + Math.random() * 0.05;
      const c = cSnow.clone().lerp(t > 0.28 ? cIce : cSnow2, t);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(0, 0, -this.sizeZ / 2 + 60);
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
    this.offset = this.mesh.position.clone();
  }

  /** Мировая высота грунта в точке */
  groundY(x, z) {
    return this.heightAt(x - this.offset.x, z - this.offset.z) + this.offset.y;
  }

  _tree(x, z, scale = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25 * scale, 0.35 * scale, 1.2 * scale, 6),
      new THREE.MeshLambertMaterial({ color: '#6b4a2a' })
    );
    trunk.position.y = 0.6 * scale;
    g.add(trunk);
    const layers = [[1.6, 2.0], [1.25, 1.6], [0.85, 1.2]];
    let y = 1.1;
    layers.forEach(([r, h]) => {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(r * scale, h * scale, 8),
        new THREE.MeshLambertMaterial({ color: '#1e6b3a' })
      );
      cone.position.y = y * scale + (h * scale) / 2;
      cone.castShadow = true;
      g.add(cone);
      // шапка снега
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(r * scale * 0.55, h * scale * 0.4, 8),
        new THREE.MeshLambertMaterial({ color: '#f2faff' })
      );
      cap.position.y = cone.position.y + h * scale * 0.3;
      g.add(cap);
      y += h * scale * 0.55;
    });
    g.position.set(x, this.groundY(x, z), z);
    this.scene.add(g);
    this._addCollider(g, 1.2 * scale, 3.4 * scale);
    return g;
  }

  _rock(x, z, s = 1) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(s, 0),
      new THREE.MeshLambertMaterial({ color: '#8a97a5' })
    );
    rock.position.set(x, this.groundY(x, z) + s * 0.4, z);
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.scale.y = 0.7;
    rock.castShadow = true;
    this.scene.add(rock);
    this._addCollider(rock, s * 0.9, s * 0.9);
    return rock;
  }

  _hut(x, z, color = '#c0392b') {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(6, 3.4, 5),
      new THREE.MeshLambertMaterial({ color })
    );
    body.position.y = 1.7; body.castShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(4.8, 2.2, 4),
      new THREE.MeshLambertMaterial({ color: '#f7f2ea' })
    );
    roof.position.y = 4.4; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    g.add(roof);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2, 0.2),
      new THREE.MeshLambertMaterial({ color: '#5d4037' })
    );
    door.position.set(0, 1, 2.55);
    g.add(door);
    const win = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 0.15),
      new THREE.MeshLambertMaterial({ color: '#ffd54f', emissive: '#ff9800', emissiveIntensity: 0.6 })
    );
    win.position.set(2, 1.9, 2.55);
    g.add(win);
    g.position.set(x, this.groundY(x, z), z);
    this.scene.add(g);
    this._addCollider(g, 4.2, 4.5);
    return g;
  }

  _flag(x, z, color) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 4, 6),
      new THREE.MeshLambertMaterial({ color: '#dfe6ec' })
    );
    const fy = this.groundY(x, z);
    pole.position.set(x, fy + 2, z);
    this.scene.add(pole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 0.7),
      new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })
    );
    flag.position.set(x + 0.65, fy + 3.5, z);
    this.scene.add(flag);
    this._addCollider(pole, 0.3, 4);
  }

  _addCollider(obj, radius, height) {
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3(
      new THREE.Vector3(obj.position.x - radius, obj.position.y, obj.position.z - radius),
      new THREE.Vector3(obj.position.x + radius, obj.position.y + height, obj.position.z + radius)
    );
    this.colliders.push({ box, center: obj.position.clone(), radius });
  }

  _buildDecorations() {
    const rand = mulberry32(1337);
    // ели вдоль склона
    for (let i = 0; i < 90; i++) {
      const z = -rand() * 480 + 40;
      const side = rand() > 0.5 ? 1 : -1;
      const x = side * (62 + rand() * 60);
      this._tree(x, z, 0.8 + rand() * 0.9);
    }
    // редкие деревья на склоне (как препятствия трассы)
    for (let i = 0; i < 14; i++) {
      const z = -40 - rand() * 380;
      const x = (rand() - 0.5) * 140;
      if (Math.abs(x) < 8 && z > -80) continue;
      this._tree(x, z, 0.7 + rand() * 0.5);
    }
    // камни
    for (let i = 0; i < 18; i++) {
      const z = -20 - rand() * 420;
      const x = (rand() - 0.5) * 170;
      this._rock(x, z, 0.7 + rand() * 1.4);
    }
    // домики курорта у подножия
    this._hut(-26, 42, '#c0392b');
    this._hut(24, 48, '#2e86ab');
    this._hut(-4, 58, '#e67e22');
    // стартовая площадка наверху
    this.platform = this._startPlatform();
    // флажки-указатели трассы
    for (let z = 20; z > -420; z -= 34) {
      this._flag(-30 - (z % 3), z, z % 68 === 0 ? '#e74c3c' : '#2ecc71');
      this._flag(30 + (z % 3), z, '#e74c3c');
    }
    // снеговик-маскот у базы
    this._snowman(10, 38);
  }

  _snowman(x, z) {
    const g = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: '#ffffff' });
    [[1.3, 0.9], [0.9, 2.3], [0.6, 3.4]].forEach(([r, y]) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), m);
      s.position.y = y; s.castShadow = true;
      g.add(s);
    });
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6),
      new THREE.MeshLambertMaterial({ color: '#e67e22' }));
    nose.rotation.x = Math.PI / 2; nose.position.set(0, 3.4, 0.62);
    g.add(nose);
    g.position.set(x, this.groundY(x, z), z);
    this.scene.add(g);
    this._addCollider(g, 1.3, 4);
  }

  _startPlatform() {
    const topZ = -460;
    const y = this.groundY(0, topZ);
    const plat = new THREE.Mesh(
      new THREE.BoxGeometry(30, 1, 16),
      new THREE.MeshLambertMaterial({ color: '#dfe9f3' })
    );
    plat.position.set(0, y + 0.5, topZ);
    plat.receiveShadow = true;
    this.scene.add(plat);
    this._addCollider(plat, 15, 1); // стоя на платформе игрок на ней и так
    this.colliders.pop();           // платформа не должна блокировать — уберём
    // перила платформы
    const railMat = new THREE.MeshLambertMaterial({ color: '#b03a2e' });
    for (const sx of [-15, 15]) {
      for (const sz of [-8, 8]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 6), railMat);
        post.position.set(sx, y + 1.6, topZ + sz);
        this.scene.add(post);
      }
    }
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.4),
      new THREE.MeshLambertMaterial({ color: '#1a5276', side: THREE.DoubleSide }));
    banner.position.set(0, y + 4.6, topZ - 8);
    this.scene.add(banner);
    return plat;
  }

  /** Канатная дорога над склоном (декорация) */
  _buildLift() {
    const liftX = 75;
    const zTop = -440, zBase = 30;
    const yTop = this.groundY(liftX, zTop) + 14;
    const yBase = this.groundY(liftX, zBase) + 10;
    const line = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, Math.hypot(zBase - zTop, yBase - yTop), 4),
      new THREE.MeshBasicMaterial({ color: '#445' })
    );
    line.position.set(liftX, (yTop + yBase) / 2, (zTop + zBase) / 2);
    line.rotation.x = Math.atan2(yBase - yTop, zBase - zTop) + Math.PI / 2;
    this.scene.add(line);
    this.liftChairs = [];
    for (let i = 0; i < 6; i++) {
      const chair = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.9, 1),
        new THREE.MeshLambertMaterial({ color: ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6', '#e67e22'][i] })
      );
      chair.castShadow = true;
      this.scene.add(chair);
      this.liftChairs.push({ mesh: chair, t: i / 6, a: [liftX, yTop, zTop], b: [liftX, yBase, zBase] });
    }
    // опоры
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const z = zTop + (zBase - zTop) * t;
      const y = this.groundY(liftX, z);
      const pylon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.5, 12, 6),
        new THREE.MeshLambertMaterial({ color: '#7f8c8d' })
      );
      pylon.position.set(liftX, y + 6, z);
      this.scene.add(pylon);
    }
  }

  update(dt, time) {
    if (!this.liftChairs) return;
    for (const c of this.liftChairs) {
      c.t = (c.t + dt * 0.02) % 1;
      const [ax, ay, az] = c.a, [bx, by, bz] = c.b;
      c.mesh.position.set(ax + (bx - ax) * c.t, ay + (by - ay) * c.t + Math.sin(time * 2 + c.t * 20) * 0.05, az + (bz - az) * c.t);
    }
  }
}

/** Детерминированный ГПСЧ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
