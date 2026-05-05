// colorgrade.js — WKW / Hong Kong cinema color grades

const PRESETS = {
  moodforlove: {
    // In the Mood for Love (2000) — crimson shadows, amber warmth, heavy vignette
    brightness: 0.92, contrast: 1.28, saturation: 1.35, hue: 8,
    grain: 0.055, vignette: 0.62, liftR: 20, liftG: 3, liftB: -16,
    ca: 1.2, halation: 0.10,
  },
  chungking: {
    // Chungking Express (1994) — bleached highs, cool-neon blue shadows
    brightness: 1.05, contrast: 1.42, saturation: 1.18, hue: -14,
    grain: 0.062, vignette: 0.45, liftR: -6, liftG: 4, liftB: 22,
    ca: 2.8, halation: 0.04,
  },
  yr2046: {
    // 2046 (2004) — amber gold throughout, deep crushed warmth
    brightness: 0.94, contrast: 1.22, saturation: 1.68, hue: 14,
    grain: 0.05, vignette: 0.58, liftR: 22, liftG: 10, liftB: -22,
    ca: 0.9, halation: 0.13,
  },
  fallenangels: {
    // Fallen Angels (1995) — cold blue-green, ultra-contrast, neon
    brightness: 0.84, contrast: 1.52, saturation: 1.08, hue: -38,
    grain: 0.07, vignette: 0.68, liftR: -10, liftG: 6, liftB: 26,
    ca: 3.5, halation: 0.03,
  },
  dayswild: {
    // Days of Being Wild (1990) — humid yellow-green, tropical haze
    brightness: 1.02, contrast: 1.12, saturation: 1.32, hue: 20,
    grain: 0.045, vignette: 0.38, liftR: 12, liftG: 15, liftB: -8,
    ca: 1.0, halation: 0.08,
  },
  happytogether: {
    // Happy Together (1997) — vivid cross-process, saturated greens and yellows
    brightness: 1.08, contrast: 1.22, saturation: 1.92, hue: -4,
    grain: 0.05, vignette: 0.42, liftR: 8, liftG: 16, liftB: 4,
    ca: 1.5, halation: 0.06,
  },
  bleachbypass: {
    // Bleach bypass — silver halide shadows, reduced chroma, high contrast
    brightness: 1.02, contrast: 1.58, saturation: 0.52, hue: 0,
    grain: 0.068, vignette: 0.55, liftR: 18, liftG: 18, liftB: 18,
    ca: 1.8, halation: 0.05,
  },
  neonrouge: {
    // HK neon night — magenta warmth, deep crushed shadows
    brightness: 0.88, contrast: 1.38, saturation: 1.58, hue: 26,
    grain: 0.06, vignette: 0.72, liftR: 20, liftG: -4, liftB: 6,
    ca: 2.2, halation: 0.09,
  },
}

class ColorGrade {
  constructor(presetName = 'moodforlove') {
    this.presetName   = presetName
    this.params       = { ...PRESETS[presetName] }
    this._grainBuffer = null
    this._grainFrame  = 0
    this._grainW      = 0
    this._grainH      = 0
  }

  initGrain(canvasW, canvasH) {
    this._grainW = Math.ceil(canvasW  / 4)
    this._grainH = Math.ceil(canvasH / 4)
    this._grainBuffer = createGraphics(this._grainW, this._grainH)
    this._refreshGrain()
  }

  resizeGrain(canvasW, canvasH) {
    if (this._grainBuffer) this._grainBuffer.remove()
    this.initGrain(canvasW, canvasH)
  }

  // Draw source video/img into (x,y,w,h) with COVER aspect-ratio fit
  drawFeed(source, x, y, w, h, stillMode = false) {
    if (!source) return

    const srcW = source.videoWidth  || source.naturalWidth  || source.width  || 0
    const srcH = source.videoHeight || source.naturalHeight || source.height || 0
    if (!srcW || !srcH) {
      noStroke(); fill(12); rect(x, y, w, h)
      return
    }

    // Cover fit
    const srcAR = srcW / srcH
    const dstAR = w    / h
    let sx, sy, sw, sh
    if (srcAR > dstAR) {
      sh = srcH; sw = srcH * dstAR; sx = (srcW - sw) / 2; sy = 0
    } else {
      sw = srcW; sh = srcW / dstAR; sx = 0; sy = (srcH - sh) / 2
    }

    const ctx = drawingContext

    // 1. Base image with CSS colour filter
    ctx.save()
    ctx.filter = this._cssFilter()
    ctx.drawImage(source, sx, sy, sw, sh, x, y, w, h)
    ctx.restore()

    // 2. Halation — warm film-stock glow around highlights
    const hal = this.params.halation || 0
    if (hal > 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = hal * 0.75
      ctx.filter = 'blur(14px) brightness(2.4) saturate(0) sepia(1) hue-rotate(355deg)'
      ctx.drawImage(source, sx, sy, sw, sh, x, y, w, h)
      ctx.restore()
    }

    // 3. Chromatic aberration (subtle R/B fringing)
    const ca = this.params.ca || 0
    if (ca > 0) {
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      ctx.globalAlpha = 0.12

      ctx.filter = 'saturate(0) sepia(1) hue-rotate(175deg) brightness(1.8)'
      ctx.drawImage(source, sx, sy, sw, sh, x + ca, y, w, h)

      ctx.filter = 'saturate(0) sepia(1) hue-rotate(335deg) brightness(1.8)'
      ctx.drawImage(source, sx, sy, sw, sh, x - ca, y, w, h)

      ctx.restore()
    }

    // 4. Shadow lift (tinted fill in SCREEN mode)
    const { liftR, liftG, liftB } = this.params
    if (liftR || liftG || liftB) {
      push()
      blendMode(SCREEN)
      noStroke()
      fill(
        Math.max(0, Math.min(255, liftR + 128)),
        Math.max(0, Math.min(255, liftG + 128)),
        Math.max(0, Math.min(255, liftB + 128)),
        18
      )
      rect(x, y, w, h)
      pop()
    }

    // 5. Vignette
    this._drawVignette(x, y, w, h, stillMode)

    // 6. Film grain
    if (this.params.grain > 0) this._drawGrain(x, y, w, h, stillMode)
  }

  cyclePreset() {
    const names = Object.keys(PRESETS)
    const next  = names[(names.indexOf(this.presetName) + 1) % names.length]
    this.setPreset(next)
    return next
  }

  setPreset(name) {
    if (!PRESETS[name]) return
    this.presetName = name
    this.params     = { ...PRESETS[name] }
  }

  drawStillOverlay(x, y, w, h) {
    this._drawVignette(x, y, w, h, true)
    this._drawGrain(x, y, w, h, true)
  }

  _cssFilter() {
    const p = this.params
    return [
      `brightness(${p.brightness})`,
      `contrast(${p.contrast})`,
      `saturate(${p.saturation})`,
      `hue-rotate(${p.hue}deg)`,
    ].join(' ')
  }

  _drawVignette(x, y, w, h, stillMode) {
    const strength = this.params.vignette + (stillMode ? 0.22 : 0)
    if (strength <= 0) return
    const cx = x + w * 0.5, cy = y + h * 0.5
    const r  = Math.max(w, h) * 0.72
    const grad = drawingContext.createRadialGradient(cx, cy, r * 0.15, cx, cy, r)
    grad.addColorStop(0, 'rgba(0,0,0,0)')
    grad.addColorStop(1, `rgba(0,0,0,${Math.min(1, strength).toFixed(3)})`)
    drawingContext.save()
    drawingContext.fillStyle = grad
    drawingContext.fillRect(x, y, w, h)
    drawingContext.restore()
  }

  _drawGrain(x, y, w, h, stillMode) {
    if (!this._grainBuffer) return
    this._grainFrame++
    if (this._grainFrame % (stillMode ? 2 : 3) === 0) this._refreshGrain(stillMode)
    push()
    blendMode(OVERLAY)
    image(this._grainBuffer, x, y, w, h)
    pop()
  }

  _refreshGrain(stillMode = false) {
    if (!this._grainBuffer) return
    const pg        = this._grainBuffer
    const intensity = this.params.grain * (stillMode ? 1.6 : 1.0)
    const alpha     = stillMode ? 55 : 38
    pg.loadPixels()
    for (let i = 0; i < pg.pixels.length; i += 4) {
      const n = (Math.random() * 2 - 1) * 255 * intensity
      const v = Math.max(0, Math.min(255, 128 + n))
      pg.pixels[i]     = v
      pg.pixels[i + 1] = v
      pg.pixels[i + 2] = v
      pg.pixels[i + 3] = alpha
    }
    pg.updatePixels()
  }
}
