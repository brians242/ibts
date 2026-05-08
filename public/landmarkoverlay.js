// landmarkoverlay.js — MediaPipe Hands → ASCII Markov character fill
//
// Each hand is covered by a grid of ASCII characters. Coverage uses skeleton
// capsule tests (palm + all finger segments) so fingers are fully included.
// Per-cell Markov walk: each character state drifts along an ordered alphabet
// driven by local brightness and hand motion. High velocity → rapid transitions.
// asciiShift (set externally from markov constellation) biases the whole hand
// toward lighter or denser characters.
//
// Exposed for external use:
//   .velocity   — 0–1 aggregate hand motion this frame
//   .handOpen   — 0–1 palm openness (fingertips spread from wrist)
//   .asciiShift — number set by caller to bias character density

class LandmarkOverlay {
  constructor() {
    this._hands        = null
    this._results      = null
    this._pending      = false
    this._videoEl      = null
    this._frame        = 0

    // Per-cell Markov state: integer key → char index
    this._cellMap = new Map()

    // ASCII chain ordered light → dense. All 21 chars.
    this._ascii = ' ·.,~-:;/\\|!+x*oO0#@%'

    this.cellSize = 8   // px per grid cell

    // Brightness sample canvas (quarter-res for speed)
    this._sampleCanvas = document.createElement('canvas')
    this._sampleCanvas.width  = 160
    this._sampleCanvas.height = 120
    this._sampleCtx = this._sampleCanvas.getContext('2d', { willReadFrequently: true })

    // Publicly readable state
    this.velocity  = 0   // 0–1
    this.handOpen  = 0   // 0–1

    // Set externally by sketch.js from the markov constellation
    this.asciiShift = 0  // biases char density: negative=lighter, positive=denser

    // Previous landmarks for velocity computation (normalized coords)
    this._prevLms = null

    // Gesture callbacks — set by sketch.js
    this.onSnap = null   // brief velocity spike from calm → photobooth
    this.onFist = null   // closed fist sustained → gallery

    this._snapCooldownUntil = 0
    this._fistStart         = null
    this._fistCooldownUntil = 0
    this._handVisibleSince  = null   // timestamp when hand first appeared in frame

    // Skeleton segment definitions: [landmarkA, landmarkB, radiusScale]
    // radiusScale is multiplied by the computed base radius for this hand
    this._segs = [
      // Palm — expanded radii and cross-connections for fuller coverage
      [0,  1,  1.7], [0,  5,  2.0], [0,  9,  2.1],
      [0,  13, 2.0], [0,  17, 1.7], [0,  9,  2.2],
      [1,  2,  1.1], [2,  5,  1.1], [5,  9,  1.3],
      [9,  13, 1.3], [13, 17, 1.1], [5,  17, 1.4],
      [1,  17, 1.6], [1,  13, 1.3], [5,  13, 1.1],
      // Thumb
      [1,  2,  0.80], [2,  3,  0.70], [3,  4,  0.58],
      // Index
      [5,  6,  0.72], [6,  7,  0.62], [7,  8,  0.52],
      // Middle
      [9,  10, 0.72], [10, 11, 0.62], [11, 12, 0.52],
      // Ring
      [13, 14, 0.68], [14, 15, 0.58], [15, 16, 0.48],
      // Pinky
      [17, 18, 0.62], [18, 19, 0.52], [19, 20, 0.42],
    ]
  }

  init(videoElement) {
    this._videoEl = videoElement
    this._hands = new Hands({
      locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
    })
    this._hands.setOptions({
      maxNumHands:            2,
      modelComplexity:        1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence:  0.5,
    })
    this._hands.onResults(r => {
      this._trackMotion(r)
      this._results = r
    })
  }

  tick() {
    const v = this._videoEl
    if (!this._hands || !v || v.readyState < 2 || this._pending) return
    this._pending = true
    this._hands.send({ image: v })
      .then(()  => { this._pending = false })
      .catch(() => { this._pending = false })
  }

  draw(source, x, y, w, h) {
    if (!this._results || !this._results.multiHandLandmarks?.length) return

    this._frame++
    this._sampleCtx.drawImage(source, 0, 0, 160, 120)
    const pix = this._sampleCtx.getImageData(0, 0, 160, 120).data

    const ctx = drawingContext
    ctx.save()
    ctx.textAlign    = 'center'
    ctx.textBaseline = 'middle'
    ctx.font         = `${this.cellSize + 1}px monospace`

    for (const landmarks of this._results.multiHandLandmarks) {
      const pts = landmarks.map(lm => ({
        x: x + lm.x * w,
        y: y + lm.y * h,
      }))
      this._renderHand(ctx, pts, pix, x, y, w, h)
    }

    ctx.restore()
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  _trackMotion(r) {
    const prevVelocity = this.velocity
    const now = Date.now()

    if (!r.multiHandLandmarks?.length) {
      this.velocity *= 0.82
      this.handOpen  = 0
      this._prevLms  = null
      this._fistStart = null
      return
    }

    if (this._prevLms && this._prevLms.length === r.multiHandLandmarks.length) {
      let dist = 0
      for (let h = 0; h < r.multiHandLandmarks.length; h++) {
        for (let i = 0; i < 21; i++) {
          const c = r.multiHandLandmarks[h][i]
          const p = this._prevLms[h][i]
          dist += Math.hypot(c.x - p.x, c.y - p.y)
        }
      }
      this.velocity = Math.min(1, this.velocity * 0.65 + dist * 9)
    }

    // Palm openness: average distance of fingertips from wrist (normalized)
    const lms  = r.multiHandLandmarks[0]
    const tips = [4, 8, 12, 16, 20]
    let spread = 0
    for (const t of tips) spread += Math.hypot(lms[t].x - lms[0].x, lms[t].y - lms[0].y)
    this.handOpen = Math.min(1, (spread / tips.length) / 0.4)

    this._prevLms = r.multiHandLandmarks.map(h => h.map(lm => ({ x: lm.x, y: lm.y })))

    // Snap: sudden velocity spike from a calm baseline
    if (now > this._snapCooldownUntil && prevVelocity < 0.15 && this.velocity > 0.55) {
      this._snapCooldownUntil = now + 1500
      if (this.onSnap) this.onSnap()
    }

    // Fist: handOpen below threshold sustained for 500ms
    if (this.handOpen < 0.35) {
      if (!this._fistStart) this._fistStart = now
      else if (now - this._fistStart > 500 && now > this._fistCooldownUntil) {
        this._fistCooldownUntil = now + 2500
        this._fistStart = null
        if (this.onFist) this.onFist()
      }
    } else {
      this._fistStart = null
    }
  }

  _inCapsule(px, py, pts, baseR) {
    for (const [ai, bi, rs] of this._segs) {
      const ax = pts[ai].x, ay = pts[ai].y
      const bx = pts[bi].x, by = pts[bi].y
      const r  = baseR * rs
      const dx = bx - ax, dy = by - ay
      const len2 = dx*dx + dy*dy
      let cx, cy
      if (len2 < 0.001) { cx = ax; cy = ay }
      else {
        const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / len2))
        cx = ax + t*dx; cy = ay + t*dy
      }
      const ex = px-cx, ey = py-cy
      if (ex*ex + ey*ey <= r*r) return true
    }
    return false
  }

  _luma(pix, px, py, x, y, w, h) {
    const sx = Math.max(0, Math.min(159, Math.round((px - x) / w * 160)))
    const sy = Math.max(0, Math.min(119, Math.round((py - y) / h * 120)))
    const i  = (sy * 160 + sx) * 4
    return (pix[i]*77 + pix[i+1]*150 + pix[i+2]*29) >> 8
  }

  _renderHand(ctx, pts, pix, x, y, w, h) {
    // Base capsule radius: 13% of wrist→middle-knuckle span
    const span  = Math.hypot(pts[9].x - pts[0].x, pts[9].y - pts[0].y)
    const baseR = span * 0.13

    const cs = this.cellSize
    const ascii    = this._ascii
    const asciiLen = ascii.length

    // Bounding box with a little padding
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of pts) {
      minX = Math.min(minX, p.x - baseR * 1.6)
      minY = Math.min(minY, p.y - baseR * 1.6)
      maxX = Math.max(maxX, p.x + baseR * 1.6)
      maxY = Math.max(maxY, p.y + baseR * 1.6)
    }
    minX = Math.max(x, minX); minY = Math.max(y, minY)
    maxX = Math.min(x + w, maxX); maxY = Math.min(y + h, maxY)

    // Transition probability: higher when moving or hand is open
    const tranP = 0.05 + this.velocity * 0.22 + this.handOpen * 0.06

    for (let py = minY + cs * 0.5; py < maxY; py += cs) {
      for (let px = minX + cs * 0.5; px < maxX; px += cs) {
        if (!this._inCapsule(px, py, pts, baseR)) continue

        // Unique integer key from grid coords
        const col = (px - x) / cs | 0
        const row = (py - y) / cs | 0
        const key = col * 4096 + row

        let ci = this._cellMap.get(key)
        if (ci === undefined) {
          ci = Math.floor(Math.random() * asciiLen)
          this._cellMap.set(key, ci)
        }

        // Target index: dark pixels → dense chars (high index), bright → light chars
        const lum = this._luma(pix, px, py, x, y, w, h)
        const targetRaw = Math.round((1 - lum / 255) * (asciiLen - 1) + this.asciiShift)
        const target    = Math.max(0, Math.min(asciiLen - 1, targetRaw))

        // Markov step: drift one position toward target, plus occasional jitter
        if (Math.random() < tranP) {
          if      (ci < target) ci++
          else if (ci > target) ci--
          if (Math.random() < 0.08) ci += Math.random() < 0.5 ? 1 : -1
          ci = Math.max(0, Math.min(asciiLen - 1, ci))
          this._cellMap.set(key, ci)
        }

        const char = ascii[ci]
        if (char === ' ') continue

        // Denser chars get slightly higher alpha
        const alpha = 0.65 + 0.35 * (ci / asciiLen)
        ctx.fillStyle = `rgba(255,195,75,${alpha.toFixed(2)})`
        ctx.fillText(char, px, py)
      }
    }
  }
}
