// ---- light.js : lighting and grade for the world layer --------------------
// Called once a frame from game.js, after the world has been composed onto
// the presentation canvas and BEFORE any interface is drawn on top of it --
// the HUD is not part of the world and must not be graded with it.
//
// Everything here is pixel-art discipline: integer coordinates, posterized
// bands, hard edges, no gradients, no blur, no antialiasing. Canvas 2D has no
// real shaders, so "shader" here means cheap screen-space passes built out of
// composite modes and baked masks, which is what gets the look without
// costing the frame.
//
//   Light.init()                 build whatever is baked, idempotent
//   Light.render(ctx, G, t)      the pass itself, in full 1280x720 canvas space
//   Light.enabled                false turns the whole thing off
//
const Light = {
  enabled: true,
  _built: false,

  init() { this._built = true; },

  render(ctx, G, t) {
    if (!this.enabled) return;
    if (!this._built) this.init();
    // Nothing yet: the passes land here. Deliberately a no-op rather than a
    // half-lit frame, so the game looks exactly as it did until the real work
    // arrives.
  },
};
if (typeof globalThis !== 'undefined') globalThis.Light = Light;
