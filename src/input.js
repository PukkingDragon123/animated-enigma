// ---- Input --------------------------------------------------------------
const Input = {
  keys: {}, pressed: {}, mouse: { x: 320, y: 180, down: false, rdown: false, clicked: false, rclicked: false },
  canvas: null, scale: 1, offX: 0, offY: 0,
  init(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', e => {
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
      this.anyKey = true;
      Audio_.init(); Audio_.resume();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.down = false; this.mouse.rdown = false; });
    canvas.addEventListener('mousemove', e => this.updateMouse(e));
    canvas.addEventListener('mousedown', e => {
      this.updateMouse(e);
      Audio_.init(); Audio_.resume();
      if (e.button === 0) { this.mouse.down = true; this.mouse.clicked = true; }
      if (e.button === 2) { this.mouse.rdown = true; this.mouse.rclicked = true; }
      this.anyKey = true;
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.rdown = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  },
  wheel: 0, anyKey: false,
  updateMouse(e) {
    const r = this.canvas.getBoundingClientRect();
    // the canvas is high-res, but all interface coordinates are a fixed 640x360
    this.mouse.x = (e.clientX - r.left) / r.width * 640;
    this.mouse.y = (e.clientY - r.top) / r.height * 360;
  },
  down(code) { return !!this.keys[code]; },
  hit(code) { return !!this.pressed[code]; },
  axis() {
    let x = 0, y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y -= 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y += 1;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    // the ship's wheel takes over when the player is steering by touch
    if (typeof MobileUI !== 'undefined' && MobileUI.enabled) {
      const m = MobileUI.axis();
      if (Math.hypot(m.x, m.y) > 0.06) return m;
    }
    return { x, y };
  },
  // a named action, however it was triggered (key, mouse or touch button)
  act(name) {
    if (typeof MobileUI !== 'undefined' && MobileUI.enabled && MobileUI.held(name)) return true;
    switch (name) {
      case 'fire':    return this.mouse.down;
      case 'shield':  return this.mouse.rdown || this.down('KeyE');
      case 'roll':    return this.down('Space');
      case 'rampage': return this.down('KeyQ');
      case 'dive':    return this.down('ShiftLeft') || this.down('ShiftRight');
      case 'decoy':   return this.down('KeyF');
      case 'tidal':   return this.down('KeyR');
      case 'interact': return this.down('KeyG') || this.down('KeyX');
    }
    return false;
  },
  actHit(name) {
    if (typeof MobileUI !== 'undefined' && MobileUI.enabled && MobileUI.pressed(name)) return true;
    switch (name) {
      case 'fire':    return this.mouse.clicked;
      case 'shield':  return this.mouse.rclicked || this.hit('KeyE');
      case 'roll':    return this.hit('Space');
      case 'rampage': return this.hit('KeyQ');
      case 'dive':    return this.hit('ShiftLeft') || this.hit('ShiftRight');
      case 'decoy':   return this.hit('KeyF');
      case 'tidal':   return this.hit('KeyR');
      case 'interact': return this.hit('KeyG') || this.hit('KeyX');
    }
    return false;
  },
  endFrame() { if (typeof MobileUI !== 'undefined' && MobileUI.enabled) MobileUI.endFrame();
    this.pressed = {}; this.mouse.clicked = false; this.mouse.rclicked = false; this.wheel = 0; this.anyKey = false; },
};
