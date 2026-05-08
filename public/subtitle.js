// subtitle.js — Cinematic subtitle system for "In Between the Stills"
//
// Renders large, poetic fragments over the image in the lower third.
// State machine: waiting → fadein → hold → fadeout → waiting → …

class SubtitleSystem {
  constructor(fragments = []) {
    this.pool   = [...fragments]
    this.current  = null
    this.alpha    = 0
    this.state    = 'waiting'
    this.timer    = 0

    this.fadeInDuration  = 1200
    this.holdDuration    = 6000
    this.fadeOutDuration = 800
    this.waitDuration    = 2500
    this.holdMultiplier  = 1.0

    this._lastIdx = -1
    this._scheduleNext()
  }

  update(dt) {
    this.timer += dt
    switch (this.state) {
      case 'waiting':
        if (this.timer >= this.waitDuration) { this.timer = 0; this._startFadeIn() }
        break
      case 'fadein':
        this.alpha = Math.min(1, this.timer / this.fadeInDuration)
        if (this.timer >= this.fadeInDuration) {
          this.alpha = 1; this.timer = 0; this.state = 'hold'
          this.holdDuration = (5500 + Math.random() * 4500) * this.holdMultiplier
        }
        break
      case 'hold':
        if (this.timer >= this.holdDuration) { this.timer = 0; this.state = 'fadeout' }
        break
      case 'fadeout':
        this.alpha = Math.max(0, 1 - this.timer / this.fadeOutDuration)
        if (this.timer >= this.fadeOutDuration) {
          this.alpha = 0; this.current = null; this.timer = 0; this.state = 'waiting'
          this.waitDuration = 2000 + Math.random() * 3500
        }
        break
    }
  }

  // Draw subtitle centered in the lower third of the content area
  // contentY / contentH describe the live image area (not the bars)
  draw(contentX, contentY, contentW, contentH) {
    if (!this.current || this.alpha <= 0) return

    const a   = this.alpha
    const cx  = contentX + contentW * 0.5
    const cy  = contentY + contentH - 52   // just above the spectrum bar

    push()
    noStroke()
    textFont('monospace')
    textSize(18)
    textAlign(CENTER, CENTER)
    textStyle(NORMAL)

    // Soft shadow for legibility over any image
    drawingContext.save()
    drawingContext.shadowColor  = `rgba(0,0,0,${a * 0.85})`
    drawingContext.shadowBlur   = 18
    drawingContext.shadowOffsetY = 1

    // Main text — WKW amber yellow
    fill(255, 215, 45, a * 238)
    text(this.current, cx, cy)

    drawingContext.restore()
    pop()
  }

  forceNext() {
    this.timer = 0; this.current = null; this.alpha = 0
    this.state = 'waiting'; this.waitDuration = 0
    this._scheduleNext()
  }

  _scheduleNext() {
    if (this.pool.length === 0) return
    let idx
    do { idx = Math.floor(Math.random() * this.pool.length) }
    while (idx === this._lastIdx && this.pool.length > 1)
    this._lastIdx  = idx
    this._nextText = this.pool[idx]
  }

  _startFadeIn() {
    this.current = this._nextText || this.pool[0]
    this.alpha   = 0
    this.state   = 'fadein'
    this.timer   = 0
    this._scheduleNext()
  }
}
