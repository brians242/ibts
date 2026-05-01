// particles.js — Audio-reactive swarming backdrop with presence attractor

class ParticleSystem {
  constructor() {
    this.particles    = []
    this.analyser     = null
    this.audioData    = null
    this.amplitude    = 0
    this.bass         = 0
    this.treble       = 0
    this.freqBars     = new Float32Array(32)
    // Presence attractor (set externally from video sampling)
    this._atx         = 0.5   // normalised 0-1
    this._aty         = 0.5
    this._atStrength  = 0
    this._initAudio()
  }

  _initAudio() {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        const ac  = new (window.AudioContext || window.webkitAudioContext)()
        const src = ac.createMediaStreamSource(stream)
        this.analyser = ac.createAnalyser()
        this.analyser.fftSize = 256
        this.analyser.smoothingTimeConstant = 0.78
        src.connect(this.analyser)
        this.audioData = new Uint8Array(this.analyser.frequencyBinCount)
      })
      .catch(() => {})
  }

  // Call each time canvas resizes
  init(n = 260) {
    this.particles = []
    for (let i = 0; i < n; i++) {
      this.particles.push(this._make(random(width), random(height)))
    }
  }

  // Normalised attractor position [0-1] — from presence detection
  setAttractor(nx, ny, strength) {
    this._atx       = nx
    this._aty       = ny
    this._atStrength = strength
  }

  _make(x, y) {
    return { x, y, vx: 0, vy: 0, sz: random(0.4, 2.2), op: random(0.12, 0.58), tr: [] }
  }

  _readAudio() {
    if (!this.analyser) return
    this.analyser.getByteFrequencyData(this.audioData)
    const d = this.audioData, n = d.length
    let total = 0
    for (let i = 0; i < n; i++) total += d[i]
    this.amplitude = total / (n * 255)
    let b = 0
    for (let i = 0; i < n >> 3; i++) b += d[i]
    this.bass = b / ((n >> 3) * 255)
    let t = 0
    for (let i = n >> 1; i < n; i++) t += d[i]
    this.treble = t / ((n - (n >> 1)) * 255)
    const step = Math.floor(n / 32)
    for (let i = 0; i < 32; i++) {
      this.freqBars[i] = this.freqBars[i] * 0.72 + (d[i * step] / 255) * 0.28
    }
  }

  update() {
    this._readAudio()

    const t    = frameCount * 0.0018
    const spd  = 0.5 + this.amplitude * 5.5
    const kick = this.bass > 0.28
    const ax   = this._atx  * width
    const ay   = this._aty  * height
    const astr = this._atStrength

    for (const p of this.particles) {
      // Perlin flow field
      const ang = noise(p.x * 0.0028, p.y * 0.0028, t) * TWO_PI * 2.8
      let tx = cos(ang) * spd + (kick ? random(-1.5, 1.5) * this.bass : 0)
      let ty = sin(ang) * spd + (kick ? random(-1.5, 1.5) * this.bass : 0)

      // Drift toward attractor (where the viewer is)
      if (astr > 0.01) {
        const dx   = ax - p.x
        const dy   = ay - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const zone = 350
        if (dist < zone) {
          const f = astr * (1 - dist / zone) * 2.2
          tx += (dx / Math.max(dist, 1)) * f
          ty += (dy / Math.max(dist, 1)) * f
        }
      }

      p.vx = lerp(p.vx, tx, 0.11)
      p.vy = lerp(p.vy, ty, 0.11)

      p.tr.push({ x: p.x, y: p.y })
      if (p.tr.length > 12) p.tr.shift()

      p.x += p.vx
      p.y += p.vy
      if (p.x < -12) p.x = width + 12
      else if (p.x > width + 12) p.x = -12
      if (p.y < -12) p.y = height + 12
      else if (p.y > height + 12) p.y = -12
    }
  }

  draw() {
    const ctx  = drawingContext
    const amp  = this.amplitude
    const bass = this.bass
    const treb = this.treble

    ctx.save()
    for (const p of this.particles) {
      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
      const a   = p.op * Math.min(1, 0.3 + amp * 1.7)
      const r   = Math.round(lerp(90,  255, bass * 0.8))
      const g   = Math.round(lerp(155, 205, treb * 0.7))
      const b   = Math.round(lerp(240, 90,  bass * 0.7))

      if (p.tr.length > 4 && spd > 1) {
        ctx.beginPath()
        ctx.moveTo(p.tr[0].x, p.tr[0].y)
        for (const pt of p.tr) ctx.lineTo(pt.x, pt.y)
        ctx.strokeStyle = `rgba(${r},${g},${b},${a * 0.22})`
        ctx.lineWidth   = p.sz * 0.55
        ctx.stroke()
      }

      const radius = p.sz * (1 + amp * 1.4)
      ctx.beginPath()
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${r},${g},${b},${a})`
      ctx.fill()

      if (bass > 0.25 && p.sz > 1.4) {
        ctx.beginPath()
        ctx.arc(p.x, p.y, radius * 5, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${a * 0.05})`
        ctx.fill()
      }
    }
    ctx.restore()
  }

  // Frequency spectrum visualisation for the bottom bar
  drawSpectrum(x, y, w, h) {
    const ctx = drawingContext
    ctx.save()
    const bw = w / 32
    for (let i = 0; i < 32; i++) {
      const v  = this.freqBars[i]
      const bh = v * h * 0.88
      const t  = i / 31
      const r  = Math.round(lerp(255, 80,  t))
      const g  = Math.round(lerp(160, 220, t))
      const b  = Math.round(lerp(60,  255, t))
      ctx.fillStyle = `rgba(${r},${g},${b},${0.4 + v * 0.55})`
      ctx.fillRect(x + i * bw + 1, y + h - bh, bw - 2, bh)
    }
    ctx.restore()
  }
}
