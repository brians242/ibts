// markov.js — Sparse Markov state probability constellation
//
// Three states (quiet / present / moving) updated from live motion data.
// Rendered as a barely-visible scatter of nodes and probabilities.
// "There if you look, invisible if you don't." — 3-layer priority: camera
// first, ascii second, this last.

class MarkovConstellation {
  constructor() {
    this._names = ['quiet', 'here', 'moving']
    this._probs = [0.34, 0.33, 0.33]
    this._nodes = []   // { rx, ry } — fractional position in content area
    this._tick  = 0
  }

  // contentW / contentH are the live image dimensions (excluding letterbox bars)
  init(contentW, contentH) {
    // Asymmetric, off-center placement — not in subtitle zone (lower ~30%)
    // and not competing with the subject (center)
    this._nodes = [
      { rx: 0.09, ry: 0.19 },   // quiet — upper left
      { rx: 0.83, ry: 0.13 },   // here  — upper right
      { rx: 0.72, ry: 0.71 },   // moving — lower right, above subtitle
    ]
  }

  update(motionLevel) {
    // Hard-assign observation to one state
    const obs = motionLevel < 0.25 ? 0 : motionLevel < 0.65 ? 1 : 2

    // Slow exponential pull toward observed state — long memory
    const decay = 0.992
    for (let i = 0; i < 3; i++) this._probs[i] *= decay
    this._probs[obs] += 1 - decay

    // Renormalize
    const sum = this._probs[0] + this._probs[1] + this._probs[2]
    for (let i = 0; i < 3; i++) this._probs[i] /= sum
  }

  draw(x, y, w, h) {
    this._tick++
    // Very slow breath — not noticeable unless you stare
    const pulse     = 0.72 + 0.28 * Math.sin(this._tick * 0.009)
    const baseAlpha = 0.13 * pulse

    const ctx = drawingContext
    ctx.save()
    ctx.font         = '8px monospace'
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'middle'

    for (let i = 0; i < 3; i++) {
      const n  = this._nodes[i]
      const nx = x + n.rx * w
      const ny = y + n.ry * h
      const p  = this._probs[i]

      // Node: 1.5px circle
      ctx.beginPath()
      ctx.arc(nx, ny, 1.5, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${(baseAlpha * 0.85).toFixed(3)})`
      ctx.fill()

      // Probability: floats just right of the node
      ctx.fillStyle = `rgba(255,255,255,${(baseAlpha * 0.60).toFixed(3)})`
      ctx.fillText(p.toFixed(2), nx + 4, ny)
    }

    ctx.restore()
  }
}
