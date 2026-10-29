/* Ввод: WASD, мышь (Pointer Lock), прыжок, спринт, присед, взаимодействие, рывок */
export class Input {
  constructor(domElement) {
    this.keys = {};
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.locked = false;
    this._justPressed = {};
    this.el = domElement;

    document.addEventListener('keydown', (e) => {
      const code = e.code;
      if (!this.keys[code]) this._justPressed[code] = true;
      this.keys[code] = true;
      if (code === 'Space') e.preventDefault();
    });
    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
      if (!this.locked) this.resetKeys();
    });

    window.addEventListener('blur', () => this.resetKeys());
  }

  resetKeys() { this.keys = {}; }

  requestLock() { this.el.requestPointerLock?.(); }
  releaseLock() { if (document.pointerLockElement === this.el) document.exitPointerLock(); }

  down(code) { return !!this.keys[code]; }
  pressed(code) { return !!this._justPressed[code]; }

  get move() {
    const f = (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0);
    const r = (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0);
    return { forward: f, right: r };
  }

  get lookDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY };
    this.mouseDX = 0; this.mouseDY = 0;
    return d;
  }

  /** очистить список "только что нажатых" — вызывать в конце кадра */
  endFrame() { this._justPressed = {}; }
}
