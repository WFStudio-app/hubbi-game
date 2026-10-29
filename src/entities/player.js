import * as THREE from 'three';

/**
 * Игрок-хабби: Third-person, физика склона (скольжение), прыжок,
 * спринт, присед, рывок, трюки в воздухе.
 */
export class Player {
  constructor(scene, terrain, opts = {}) {
    this.scene = scene;
    this.terrain = terrain;

    // --- характеристики ---
    this.walkSpeed = 6 + (opts.speedBoost || 0) * 0.8;
    this.sprintMul = 1.6;
    this.jumpPower = 9 + (opts.jumpBoost || 0) * 1.2;
    this.gravity = 24;
    this.crouchHeight = 1.1;
    this.standHeight = 1.9;
    this.radius = 0.55;

    // --- состояние ---
    this.pos = new THREE.Vector3(0, 0, -460);
    this.vel = new THREE.Vector3();
    this.yaw = 0;            // направление взгляда камеры
    this.pitch = -0.25;
    this.onGround = false;
    this.crouching = false;
    this.sprinting = false;
    this.hp = 100;
    this.stamina = 100;
    this.airTime = 0;
    this.spinAccum = 0;      // накопленное вращение для трюков
    this.lastGroundY = 0;
    this.dashCooldown = 0;
    this.dead = false;
    this.trickCallback = null;   // (points, name) => void
    this.landCallback = null;    // (speed) => void
    this.hitCallback = null;     // (text) => void

    this._buildModel(opts.suitColor || '#f7c948', opts.hatColor || null);
    this.respawn(new THREE.Vector3(0, 0, -455));
  }

  _buildModel(suitColor, hatColor) {
    const g = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color: suitColor });
    const skinMat = new THREE.MeshLambertMaterial({ color: '#ffe9a8' });
    const darkMat = new THREE.MeshBasicMaterial({ color: '#1d1d1d' });

    // Тело — capsule-ish из сфер и цилиндра
    this.body = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.85, 12), bodyMat);
    torso.position.y = 0.85; torso.castShadow = true;
    this.body.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), skinMat);
    head.position.y = 1.62; head.castShadow = true;
    this.body.add(head);

    // глаза
    for (const sx of [-0.2, 0.2]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), darkMat);
      eye.position.set(sx, 1.7, 0.48);
      this.body.add(eye);
    }
    // улыбка
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 10, Math.PI), darkMat);
    smile.position.set(0, 1.5, 0.5); smile.rotation.z = Math.PI;
    this.body.add(smile);

    // руки
    this.armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.5, 3, 8), bodyMat);
    this.armL.position.set(-0.68, 1.05, 0); this.armL.rotation.z = 0.5;
    this.armR = this.armL.clone(); this.armR.position.x = 0.68; this.armR.rotation.z = -0.5;
    this.body.add(this.armL, this.armR);

    // ноги
    this.legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.35, 3, 8),
      new THREE.MeshLambertMaterial({ color: '#34495e' }));
    this.legL.position.set(-0.25, 0.28, 0);
    this.legR = this.legL.clone(); this.legR.position.x = 0.25;
    this.body.add(this.legL, this.legR);

    // шапка (если куплена)
    if (hatColor) this.setHat(hatColor);

    g.add(this.body);
    this.model = g;
    this.scene.add(g);
  }

  setHat(color) {
    if (this.hat) this.body.remove(this.hat);
    const hat = new THREE.Group();
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color }));
    cap.position.y = 1.95;
    const pompom = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshLambertMaterial({ color: '#ffffff' }));
    pompom.position.y = 2.45;
    hat.add(cap, pompom);
    this.hat = hat;
    this.body.add(hat);
  }

  respawn(at) {
    this.pos.copy(at);
    this.pos.y = this.terrain.groundY(at.x, at.z) + 0.1;
    this.vel.set(0, 0, 0);
    this.hp = 100;
    this.stamina = 100;
    this.dead = false;
    this.yaw = Math.PI; // лицом вниз по склону
    this.airTime = 0;
    this.model.visible = true;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }

  update(dt, input, cameraGoalCb) {
    if (this.dead) return;

    // --- взгляд ---
    const look = input.lookDelta;
    this.yaw -= look.x * 0.0028;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.y * 0.0022, -1.2, 0.6);

    // --- движение ---
    const mv = input.move;
    const sprinting = input.down('ShiftLeft') && mv.forward > 0 && this.stamina > 1;
    this.crouching = input.down('KeyF');
    this.sprinting = sprinting;

    let speed = this.walkSpeed * (sprinting ? this.sprintMul : 1) * (this.crouching ? 0.45 : 1);

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // вперёд камеры: на экране -Z это "вниз по склону" при yaw=PI
    let wishX = (mv.right * cos - mv.forward * sin);
    let wishZ = (mv.right * sin + mv.forward * cos);
    const wl = Math.hypot(wishX, wishZ);
    if (wl > 0.001) { wishX /= wl; wishZ /= wl; }

    // рывок
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (input.pressed('KeyQ') && this.dashCooldown <= 0 && this.stamina >= 20) {
      this.dashCooldown = 1.4;
      this.stamina -= 20;
      const dx = wl > 0.001 ? wishX : -sin, dz = wl > 0.001 ? wishZ : -cos;
      this.vel.x += dx * 14; this.vel.z += dz * 14;
      this.vel.y = Math.max(this.vel.y, 3.5);
    }

    // управление на земле vs в воздухе (уменьшенное)
    const airControl = this.onGround ? 1 : 0.35;
    const targetVX = wishX * speed, targetVZ = wishZ * speed;
    this.vel.x += (targetVX - this.vel.x) * Math.min(1, dt * 8 * airControl);
    this.vel.z += (targetVZ - this.vel.z) * Math.min(1, dt * 8 * airControl);

    // гравитация
    this.vel.y -= this.gravity * dt;

    // прыжок
    if (input.pressed('Space') && this.onGround && !this.crouching) {
      this.vel.y = this.jumpPower;
      this.onGround = false;
    }

    // спринт тратит выносливость
    if (sprinting) this.stamina = Math.max(0, this.stamina - dt * 22);
    else this.stamina = Math.min(100, this.stamina + dt * 14);

    // интеграция позиции
    const prevPos = this.pos.clone();
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // коллизии с препятствиями
    this._resolveColliders(prevPos);

    // земля: высота склона
    const gy = this.terrain.groundY(this.pos.x, this.pos.z);
    if (this.pos.y <= gy + 0.02) {
      // приземление
      if (!this.onGround) this._onLand(gy);
      this.pos.y = gy;
      this.vel.y = 0;
      this.onGround = true;
      this.airTime = 0;
      // скольжение по склону: небольшая составляющая вниз по уклону
      const grad = this._gradient();
      const slide = this.crouching ? 9 : 4.5;
      this.vel.x += grad.x * slide * dt;
      this.vel.z += grad.z * slide * dt;
      // мягкое трение снега
      const fr = Math.exp(-dt * (this.crouching ? 0.6 : 1.4));
      this.vel.x *= fr; this.vel.z *= fr;
    } else {
      this.onGround = false;
      this.airTime += dt;
      // трюки: вращение телом в воздухе через A/D
      if (input.down('KeyA')) this.spinAccum += dt * 540;
      if (input.down('KeyD')) this.spinAccum -= dt * 540;
    }

    // падение за пределы мира
    if (this.pos.y < gy - 60 || this.pos.y < -200) this.die();

    // HP от столкновений на скорости обрабатывается в коллизиях

    // --- модель ---
    this.model.position.copy(this.pos);
    const moving = Math.abs(this.vel.x) + Math.abs(this.vel.z) > 0.8;
    // тело смотрит в сторону движения (или от камеры, если стоим)
    const moveAngle = moving ? Math.atan2(this.vel.x, this.vel.z) : this.yaw + Math.PI;
    this.model.rotation.y = 0;
    this.body.rotation.y = moveAngle;
    // трюк-вращение визуально — вокруг продольной оси тела
    this.body.rotation.z = this.onGround
      ? (this.crouching ? 0.2 : 0)
      : THREE.MathUtils.degToRad(this.spinAccum % 360) * 0.35 + Math.sin(this.airTime * 6) * 0.12;
    this.body.rotation.x = this.onGround ? 0 : Math.sin(this.airTime * 4) * 0.1;
    // присед
    const h = this.crouching ? this.crouchHeight : this.standHeight;
    this.body.scale.set(1, h / this.standHeight, 1);
    // анимация ходьбы
    const t = performance.now() / 1000;
    const spd = this.speed;
    const swing = Math.min(1, spd / 8);
    if (this.onGround && spd > 0.6) {
      this.legL.rotation.x = Math.sin(t * 10) * 0.7 * swing;
      this.legR.rotation.x = -Math.sin(t * 10) * 0.7 * swing;
      this.armL.rotation.x = -Math.sin(t * 10) * 0.5 * swing;
      this.armR.rotation.x = Math.sin(t * 10) * 0.5 * swing;
    } else if (!this.onGround) {
      this.armL.rotation.z = 1.2; this.armR.rotation.z = -1.2;
      this.legL.rotation.x = -0.4; this.legR.rotation.x = 0.3;
    } else {
      this.armL.rotation.z = 0.5; this.armR.rotation.z = -0.5;
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.armL.rotation.x = this.armR.rotation.x = 0;
    }

    cameraGoalCb(this);
  }

  _gradient() {
    const e = 1.0;
    const hx = (this.terrain.groundY(this.pos.x + e, this.pos.z) - this.terrain.groundY(this.pos.x - e, this.pos.z)) / (2 * e);
    const hz = (this.terrain.groundY(this.pos.x, this.pos.z + e) - this.terrain.groundY(this.pos.x, this.pos.z - e)) / (2 * e);
    return { x: -hx, z: -hz }; // вниз по уклону
  }

  _onLand(gy) {
    const fallSpeed = this.lastGroundY > 0 ? (this.lastGroundY - gy) : 0;
    // трюк засчитывается если был в воздухе достаточно долго и крутился
    if (this.airTime > 0.55) {
      const spins = Math.floor(Math.abs(this.spinAccum) / 360);
      if (spins > 0 && this.trickCallback) {
        const names = ['Спин! ', 'Двойной спин!! ', 'Тройной СПИН!!! '];
        const idx = Math.min(spins - 1, 2);
        this.trickCallback((idx + 1) * 15 * Math.round(this.airTime * 10), names[idx] + '+' + ((idx + 1) * 15));
      } else if (this.airTime > 1.0 && this.trickCallback) {
        this.trickCallback(10, 'Полёт! +10');
      }
    }
    this.spinAccum = 0;
    // урон от жёсткого падения
    if (fallSpeed > 18) {
      const dmg = Math.round((fallSpeed - 18) * 4);
      this.damage(dmg);
      if (this.hitCallback) this.hitCallback('Жёсткая посадка! -' + dmg);
    }
    if (this.landCallback) this.landCallback(this.speed);
  }

  _resolveColliders(prevPos) {
    const feet = this.pos.y;
    const head = feet + (this.crouching ? this.crouchHeight : this.standHeight);
    for (const c of this.terrain.colliders) {
      const b = c.box;
      if (head < b.min.y || feet > b.max.y) continue;
      const dx = this.pos.x - b.min.x, dx2 = b.max.x - this.pos.x;
      const dz = this.pos.z - b.min.z, dz2 = b.max.z - this.pos.z;
      if (dx < 0 || dx2 < 0 || dz < 0 || dz2 < 0) continue;
      // пересечение есть — выталкиваем по минимальной оси XZ
      const minPen = Math.min(dx, dx2, dz, dz2);
      const impact = Math.hypot(this.vel.x, this.vel.z);
      if (minPen === dx) this.pos.x = b.min.x - 0.01;
      else if (minPen === dx2) this.pos.x = b.max.x + 0.01;
      else if (minPen === dz) this.pos.z = b.min.z - 0.01;
      else this.pos.z = b.max.z + 0.01;
      // потеря скорости + урон при быстром ударе
      this.vel.x *= -0.15; this.vel.z *= -0.15;
      if (impact > 11) {
        const dmg = Math.round((impact - 11) * 3);
        this.damage(dmg);
        if (this.hitCallback) this.hitCallback('Врезался! -' + dmg);
      }
      return;
    }
    // границы мира
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -125, 125);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -475, 75);
    // запоминаем высоту для оценки падения
    if (!this.onGround && this.vel.y > 0) this.lastGroundY = Math.max(this.lastGroundY, this.pos.y);
    if (this.onGround) this.lastGroundY = this.pos.y;
  }

  damage(n) {
    this.hp = Math.max(0, this.hp - n);
    if (this.hp <= 0) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.model.visible = false;
    if (this.deathCallback) this.deathCallback();
  }
}
