// ascii.js — Brightness-mapped character texture layer
//
// Samples the raw video at grid resolution, maps per-cell luma to character
// opacity. Dark areas are truly absent; bright areas are warm and dense.
// The video underneath remains the primary — this is a second skin over it.

class AsciiLayer {
  constructor() {
    this._chars = 'abcdefghijklmnopqrstuvwxyz0123456789.,;:'
    this._cellW = 14   // px per column
    this._cellH = 17   // px per row
    this._sampleCanvas = null
    this._sampleCtx    = null
    this._grid         = null   // Uint8Array of char indices, stable + slow-drifting
    this._gridCols     = 0
    this._gridRows     = 0
    this._driftTick    = 0
  }

  init(w, h) {
    this._gridCols = Math.ceil(w / this._cellW)
    this._gridRows = Math.ceil(h / this._cellH)

    if (!this._sampleCanvas) {
      this._sampleCanvas = document.createElement('canvas')
      this._sampleCtx    = this._sampleCanvas.getContext('2d', { willReadFrequently: true })
    }
    this._sampleCanvas.width  = this._gridCols
    this._sampleCanvas.height = this._gridRows
    this._fillGrid()
  }

  resize(w, h) { this.init(w, h) }

  _fillGrid() {
    const len = this._chars.length
    const n   = this._gridCols * this._gridRows
    this._grid = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
      this._grid[i] = Math.floor(Math.random() * len)
    }
  }

  _drift() {
    // ~0.8% of characters flip per call — slow, living texture, not flicker
    const len = this._chars.length
    const n   = this._grid.length
    for (let i = 0; i < n; i++) {
      if (Math.random() < 0.008) {
        this._grid[i] = Math.floor(Math.random() * len)
      }
    }
  }

  draw(source, x, y, w, h) {
    if (!source) return
    const srcW = source.videoWidth || source.naturalWidth || 0
    const srcH = source.videoHeight || source.naturalHeight || 0
    if (!srcW || !srcH) return

    // Sample source down to grid resolution for brightness map
    this._sampleCtx.drawImage(source, 0, 0, this._gridCols, this._gridRows)
    const data = this._sampleCtx.getImageData(0, 0, this._gridCols, this._gridRows).data

    // Slow character drift — every 15 frames
    if (++this._driftTick % 15 === 0) this._drift()

    const cols  = this._gridCols
    const rows  = this._gridRows
    const cellW = this._cellW
    const cellH = this._cellH
    const ctx   = drawingContext

    ctx.save()
    ctx.font         = '12px monospace'
    ctx.textAlign    = 'left'
    ctx.textBaseline = 'top'

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const di  = (r * cols + c) * 4
        // Perceptual luma (BT.601)
        const lum = (data[di] * 77 + data[di + 1] * 150 + data[di + 2] * 29) >> 8
        const brightness = lum / 255

        // Strong nonlinearity: dark truly absent, bright vivid
        // Exponent 2.1 means mid-tones are sparse, not just faded
        const alpha = Math.pow(brightness, 2.1) * 0.74
        if (alpha < 0.04) continue

        const char = this._chars[this._grid[r * cols + c]]
        // Warm amber — same palette family as the subtitle yellow
        ctx.fillStyle = `rgba(255,185,90,${alpha.toFixed(3)})`
        ctx.fillText(char, x + c * cellW, y + r * cellH)
      }
    }

    ctx.restore()
  }
}
