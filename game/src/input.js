// SOLBAY HEAT — keyboard and mouse. Pointer lock on the canvas gives mouse-look;
// a click also fires the pistol, so mouse state is tracked here too.
export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set(); // keys currently down
    this.tapped = new Set(); // keys pressed since the last frame (edge-triggered)
    this.lookX = 0; // accumulated mouse movement while locked
    this.lookY = 0;
    this.mouseHeld = false;
    this.mouseTapped = false;
    this.locked = false;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.held.add(e.code);
      this.tapped.add(e.code);
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => this.held.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    canvas.addEventListener('click', () => {
      if (!this.locked && !document.pointerLockElement) {
        canvas.requestPointerLock?.();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.lookX += e.movementX;
        this.lookY += e.movementY;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseHeld = true;
        this.mouseTapped = true;
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseHeld = false;
    });
  }

  down(code) {
    return this.held.has(code);
  }

  // True only on the frame the key went down.
  hit(code) {
    return this.tapped.has(code);
  }

  // WASD / arrows as a -1..1 vector: x = strafe right, y = forward.
  moveVec() {
    let x = 0;
    let y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    return { x, y };
  }

  takeLook() {
    const out = { dx: this.lookX, dy: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return out;
  }

  endFrame() {
    this.tapped.clear();
    this.mouseTapped = false;
  }
}
