// sketch.js — "In Between the Stills" v3
//
// Experience: full-canvas laptop camera with phone as a live double-exposure
// overlay. Particles swarm toward wherever you are in the frame.
//
// Keys (discoverable, not required):
//   Space  — next subtitle / trigger moment
//   G      — open stills gallery
//   P      — photobooth countdown → 3D parallax composite
//   R      — start/stop video recording
//   C      — config panel (camera select, grade, swap)
//   1/2    — swap which camera is base vs overlay

// ── Layout ────────────────────────────────────────────────────────────────────
let CONTENT_Y, CONTENT_H, BAR_H

// ── Camera / socket ───────────────────────────────────────────────────────────
let laptopVideo
let phoneImg
let phoneConnected = false
let phoneHasFrame  = false
let socket

// ── Systems ───────────────────────────────────────────────────────────────────
let grade
let subtitles
let particles
let gallery

// ── App state ──────────────────────────────────────────────────────────────────
let swapped     = false   // 1/2 key: swap base vs overlay
let showConfig  = false
let configPanel = null
let videoDevices = []

// ── Presence detection (low-res video sampling) ───────────────────────────────
let _presCanvas, _presCtx
let _presX = 0.5, _presY = 0.5   // normalised 0-1
let _presTick = 0
let _presMotion = 0  // how much motion is detected (0-1)

// ── Glitch ─────────────────────────────────────────────────────────────────────
let _glitchCooldown = 150
let _glitchFrames   = 0
let _glitchSlices   = []

// ── Photobooth ─────────────────────────────────────────────────────────────────
let pb = { phase: null, count: 3, countTimer: 0, flashTimer: 0, showTimer: 0,
           baseImg: null, overlayImg: null, wobble: 0 }

// ── Scanlines ──────────────────────────────────────────────────────────────────
let _scanOffset = 0

// ── Grade cycling flash ────────────────────────────────────────────────────────
let _gradeFlash = 0   // frames to show grade name

// ── Branching paths ────────────────────────────────────────────────────────────
const BRANCHING_PATHS = [
  "in another version of right now\nyou take the slow bus home\nand the window fogs\nand you draw your name in it",
  "somewhere a you said yes to the detour\nand found a street that only exists\nafter certain kinds of rain",
  "there's a version where you stayed for coffee\nand the stranger at the next table\ntold you the funniest true story\nyou've ever heard",
  "in that branch you missed the train\nand the forty-minute wait became\nan hour you'd choose to keep",
  "a parallel you looked up at exactly the right moment\nand the sky was doing something\nit had never done before\nand you were the only witness",
  "somewhere you took the photograph\nand thirty years from now\nsomeone asks you about it\nand you tell them everything",
  "in the version where you turned left\nthe street smelled like warm bread and jasmine\nand you stayed so long\nyou forgot where you were going",
  "there's a you right now dancing in a kitchen\nat 2am to a song only you know\nand it is exactly right",
  "in that other afternoon\nyou fell asleep near a window\nand dreamed in a color\nthat doesn't have a name yet",
  "somewhere you sent the message\nand the reply came back\nlike a door you forgot\nyou'd left slightly open",
  "in the branch where you waited in the rain\nthe fog came in slowly\nand made everything look\nlike it was just invented",
  "a different you is right now\ntelling this exact moment to someone\nwho needed to hear it\nand doesn't know that yet",
  "somewhere the rain found you\nand you had nowhere to be\nand it was the most important\nhour of that whole year",
  "in another version the song came on\nat exactly that moment\nand you let yourself feel it\nfully, just once",
  "there's a you who stayed\nand the room slowly filled\nwith the kind of quiet\nthat feels like someone staying with you",
]
let _bp = { state: 'off', alpha: 0, timer: 0, text: '' }
const BP_FADEIN = 1400, BP_HOLD = 5500, BP_FADEOUT = 1000

// ── Moment auto-clip ───────────────────────────────────────────────────────────
let _momentClipMs = 0
const CLIP_DURATION = 5000

// ── Discoverable hint ──────────────────────────────────────────────────────────
let _hintTimer  = 0
let _interacted = false

// ── Rapidfire mode ─────────────────────────────────────────────────────────────
const RF_PREP_MS   = 4000
const RF_SHOW_MS   = 2500
const RF_CLIP_MS   = 3500
const RF_PREP_MSGS = [
  'find your frame', 'let the light find you', 'compose',
  'hold the space', 'feel the distance', 'be in the light',
  'hold still', 'wait for it',
]
let _rfMode = false
let _rf = {
  phase: 'off', round: 0, prepTimer: 0, prepMsg: '',
  count: 3, countTimer: 0, flashTimer: 0, showTimer: 0, snapImg: null,
}

// ─────────────────────────────────────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────────────────────────────────────
function setup() {
  createCanvas(windowWidth, windowHeight).style('display', 'block')
  frameRate(30)
  _computeLayout()

  laptopVideo = createCapture(VIDEO)
  laptopVideo.size(640, 480)
  laptopVideo.hide()

  phoneImg     = createImg('', '')
  phoneImg.hide()
  phoneImg.elt.alt = ''

  socket = io({ transports: ['websocket'] })
  socket.on('phone-frame', ({ dataURL }) => {
    phoneImg.elt.src = dataURL
    phoneConnected   = true
    phoneHasFrame    = true
  })
  socket.on('phone-connected',    () => { phoneConnected = true  })
  socket.on('phone-disconnected', () => { phoneConnected = false; phoneHasFrame = false })

  grade     = new ColorGrade('moodforlove')
  grade.initGrain(width, height)

  subtitles = new SubtitleSystem([])
  fetch('/captions/fragments.json')
    .then(r => r.json())
    .then(data => { subtitles.pool = data.fragments; subtitles._scheduleNext() })
    .catch(() => {})

  particles = new ParticleSystem()
  particles.init(260)

  gallery = new Gallery()
  window._galleryRecToggle = () => {
    gallery.recording ? gallery.stopRec() : gallery.startRec(document.querySelector('canvas'))
  }

  // Low-res canvas for presence detection
  _presCanvas = document.createElement('canvas')
  _presCanvas.width  = 20
  _presCanvas.height = 12
  _presCtx = _presCanvas.getContext('2d', { willReadFrequently: true })

  _buildConfigPanel()
  navigator.mediaDevices.enumerateDevices()
    .then(ds => { videoDevices = ds.filter(d => d.kind === 'videoinput'); _populateDeviceSelector() })
    .catch(() => {})

  textFont('monospace')
  noStroke()
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAW
// ─────────────────────────────────────────────────────────────────────────────
function draw() {
  background(0)

  // ── 1. Presence from webcam ────────────────────────────────────────────────
  _samplePresence()
  particles.setAttractor(_presX, _presY, _presMotion * 0.9 + 0.25)

  // ── 2. Particle swarm (behind everything) ──────────────────────────────────
  particles.update()
  particles.draw()

  // ── 3. Camera content ─────────────────────────────────────────────────────
  if (pb.phase === 'showing') {
    _drawPhotoboothComposite()
  } else if (pb.phase === 'flash') {
    _drawPhotoboothFlash()
  } else {
    _drawFeeds()
  }

  // ── 4. Photobooth logic (capture before overlays) ─────────────────────────
  _tickPhotobooth()

  // ── 5. Scanlines + glitch ─────────────────────────────────────────────────
  _drawScanlines()
  _tickGlitch()

  // ── 6. Subtitle over the image ────────────────────────────────────────────
  subtitles.update(deltaTime)
  subtitles.draw(0, CONTENT_Y, width, CONTENT_H)

  // ── 7. Thin letterbox bars ────────────────────────────────────────────────
  fill(0); noStroke()
  rect(0, 0, width, BAR_H)
  rect(0, height - BAR_H, width, BAR_H)

  // ── 8. Bottom bar: frequency spectrum ─────────────────────────────────────
  const specW = width * 0.3
  particles.drawSpectrum((width - specW) * 0.5, height - BAR_H + 3, specW, BAR_H - 6)

  // ── 9. Minimal HUD in bars ────────────────────────────────────────────────
  _drawHUD()

  // ── 10. Photobooth countdown overlay ──────────────────────────────────────
  if (pb.phase === 'countdown') _drawCountdown()

  // ── 11. Recording blink ───────────────────────────────────────────────────
  if (gallery.recording) _drawRecDot()

  // ── 12. Auto-capture ──────────────────────────────────────────────────────
  gallery.tick(Date.now(), document.querySelector('canvas'))

  // ── 13. Auto-clip countdown ─────────────────────────────────────────────────
  if (_momentClipMs > 0) {
    _momentClipMs -= deltaTime
    if (_momentClipMs <= 0) { _momentClipMs = 0; gallery.stopRec() }
  }

  // ── 14. Branching path overlay ──────────────────────────────────────────────
  _drawBranchingPath()

  // ── 15. Discoverable hint ───────────────────────────────────────────────────
  _drawHint()

  // ── 16. Rapidfire UI ────────────────────────────────────────────────────────
  if (_rfMode) _tickAndDrawRapidfire()
}

// ─────────────────────────────────────────────────────────────────────────────
// FEEDS  — full-canvas base + phone overlay
// ─────────────────────────────────────────────────────────────────────────────
function _drawFeeds() {
  const baseSrc     = swapped ? phoneImg.elt     : laptopVideo.elt
  const overlaySrc  = swapped ? laptopVideo.elt  : phoneImg.elt
  const overlayReady = swapped ? true            : phoneHasFrame

  // Base feed: full canvas
  if (!swapped || phoneHasFrame) {
    grade.drawFeed(baseSrc, 0, CONTENT_Y, width, CONTENT_H)
  } else {
    _placeholder(0, CONTENT_Y, width, CONTENT_H)
  }

  // Phone overlay: screen-blended on top — unmissably different when phone connects
  if (overlayReady) {
    _drawOverlay(overlaySrc)
  }
}

// Screen-blend the phone feed on top of the base as a double-exposure
function _drawOverlay(src) {
  const srcW = src.videoWidth  || src.naturalWidth  || 0
  const srcH = src.videoHeight || src.naturalHeight || 0
  if (!srcW || !srcH) return

  // Cover-fit source into full canvas
  const srcAR = srcW / srcH
  const dstAR = width / CONTENT_H
  let sx, sy, sw, sh
  if (srcAR > dstAR) { sh = srcH; sw = srcH * dstAR; sx = (srcW - sw) / 2; sy = 0 }
  else               { sw = srcW; sh = srcW / dstAR; sx = 0; sy = (srcH - sh) / 2 }

  const ctx = drawingContext
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  ctx.globalAlpha = 0.42
  ctx.filter = grade._cssFilter()
  // Slight horizontal offset creates natural parallax from the two camera positions
  ctx.drawImage(src, sx, sy, sw, sh, 18, CONTENT_Y, width, CONTENT_H)
  ctx.restore()
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESENCE DETECTION  — low-res video sampling every 5 frames
// ─────────────────────────────────────────────────────────────────────────────
function _samplePresence() {
  if (!laptopVideo || !laptopVideo.elt.videoWidth) return
  if (++_presTick % 5 !== 0) return

  _presCtx.drawImage(laptopVideo.elt, 0, 0, 20, 12)
  const d = _presCtx.getImageData(0, 0, 20, 12).data

  let wx = 0, wy = 0, wt = 0, motionSum = 0
  for (let i = 0; i < 20 * 12; i++) {
    const luma = (d[i*4]*77 + d[i*4+1]*150 + d[i*4+2]*29) >> 8
    if (luma < 20 || luma > 240) continue   // skip pure black / blown-out white
    const w = 1
    wx += (i % 20) * w
    wy += Math.floor(i / 20) * w
    wt += w
    motionSum += luma / 255
  }

  if (wt > 10) {
    // Mirror X (webcam is typically front-facing / mirrored)
    const nx = 1 - (wx / wt) / 20
    const ny = (wy / wt) / 12
    _presX = _presX * 0.88 + nx * 0.12
    _presY = _presY * 0.88 + ny * 0.12
    _presMotion = min(1, (wt / (20 * 12)) * 3)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHOTOBOOTH
// ─────────────────────────────────────────────────────────────────────────────
function _startPhotobooth() {
  if (pb.phase) return
  pb.phase = 'countdown'; pb.count = 3; pb.countTimer = 0
}

function _tickPhotobooth() {
  if (!pb.phase) return

  if (pb.phase === 'countdown') {
    pb.countTimer += deltaTime
    if (pb.countTimer >= 1000) {
      pb.countTimer = 0; pb.count--
      if (pb.count <= 0) {
        pb.baseImg    = get(0, CONTENT_Y, width, CONTENT_H)
        pb.overlayImg = get(0, CONTENT_Y, width, CONTENT_H)  // second capture with shift
        pb.phase = 'flash'; pb.flashTimer = 0
      }
    }
  }

  if (pb.phase === 'flash') {
    pb.flashTimer += deltaTime
    if (pb.flashTimer >= 280) { pb.phase = 'showing'; pb.showTimer = 0; pb.wobble = 0 }
  }

  if (pb.phase === 'showing') {
    pb.showTimer += deltaTime
    pb.wobble = sin(pb.showTimer * 0.003) * 30 + sin(pb.showTimer * 0.007) * 12
    if (pb.showTimer >= 6000) {
      _pushPhotoboothToGallery()
      pb.phase = null
    }
  }
}

function _drawCountdown() {
  drawingContext.save()
  drawingContext.fillStyle = 'rgba(0,0,0,0.5)'
  drawingContext.fillRect(0, 0, width, height)
  drawingContext.restore()

  const pulse = 0.9 + 0.1 * sin(pb.countTimer / 1000 * TWO_PI * 1.5)
  push()
  textAlign(CENTER, CENTER)
  textSize(height * 0.28 * pulse)
  noStroke()
  drawingContext.save()
  drawingContext.shadowColor = 'rgba(255,255,255,0.5)'
  drawingContext.shadowBlur  = 50
  fill(255, 255, 255, 210)
  text(pb.count, width / 2, height / 2)
  drawingContext.restore()
  textSize(13)
  fill(255, 255, 255, 80)
  text('PHOTOBOOTH', width / 2, height * 0.5 + height * 0.18)
  pop()
}

function _drawPhotoboothFlash() {
  const alpha = map(pb.flashTimer, 0, 280, 1, 0)
  drawingContext.save()
  drawingContext.fillStyle = `rgba(255,255,255,${alpha})`
  drawingContext.fillRect(0, 0, width, height)
  drawingContext.restore()
}

function _drawPhotoboothComposite() {
  if (!pb.baseImg || !pb.overlayImg) return
  const off = pb.wobble

  push()
  tint(255, 195)
  image(pb.baseImg, off * 0.5, CONTENT_Y, width, CONTENT_H)
  pop()

  push()
  blendMode(SCREEN)
  tint(255, 155)
  image(pb.overlayImg, -off * 0.5, CONTENT_Y, width, CONTENT_H)
  pop()

  // Vignette
  const cx = width * 0.5, cy = CONTENT_Y + CONTENT_H * 0.5
  const grd = drawingContext.createRadialGradient(cx, cy, width * 0.1, cx, cy, width * 0.8)
  grd.addColorStop(0, 'rgba(0,0,0,0)')
  grd.addColorStop(1, 'rgba(0,0,0,0.7)')
  drawingContext.save()
  drawingContext.fillStyle = grd
  drawingContext.fillRect(0, CONTENT_Y, width, CONTENT_H)
  drawingContext.restore()

  // Progress bar
  const elapsed = pb.showTimer
  const fadeAlpha = constrain(map(elapsed, 0, 700, 0, 1), 0, 1) *
                    constrain(map(elapsed, 5200, 6000, 1, 0), 0, 1)
  push()
  noFill()
  strokeWeight(1)
  stroke(255, 255, 255, fadeAlpha * 50)
  const bw = 180, bx = (width - bw) / 2, by = CONTENT_Y + CONTENT_H - 28
  line(bx, by, bx + bw, by)
  stroke(255, 255, 255, fadeAlpha * 180)
  line(bx, by, bx + bw * (elapsed / 6000), by)
  textAlign(CENTER, CENTER)
  textSize(10)
  noStroke()
  fill(255, 255, 255, fadeAlpha * 70)
  text('PARALLAX COMPOSITE', width / 2, CONTENT_Y + 20)
  pop()
}

function _pushPhotoboothToGallery() {
  if (!pb.baseImg) return
  const pg = createGraphics(width, CONTENT_H)
  pg.image(pb.baseImg, 0, 0, width, CONTENT_H)
  pg.blendMode(SCREEN)
  pg.tint(255, 155)
  pg.image(pb.overlayImg, 0, 0, width, CONTENT_H)
  gallery.pushFrame(pg.elt.toDataURL('image/jpeg', 0.85))
  pg.remove()
}

// ─────────────────────────────────────────────────────────────────────────────
// POST-PROCESS
// ─────────────────────────────────────────────────────────────────────────────
function _drawScanlines() {
  _scanOffset = (_scanOffset + 0.35) % 4
  const ctx = drawingContext
  ctx.save()
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  ctx.lineWidth   = 1
  for (let y = CONTENT_Y + _scanOffset; y < CONTENT_Y + CONTENT_H; y += 4) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()
  }
  ctx.restore()
}

function _tickGlitch() {
  _glitchCooldown--
  if (_glitchCooldown <= 0 && _glitchFrames <= 0) {
    _glitchFrames   = floor(random(2, 4))
    _glitchCooldown = floor(random(100, 320))
    _glitchSlices   = []
    const n = floor(random(2, 5))
    for (let i = 0; i < n; i++) {
      _glitchSlices.push({
        y:  random(CONTENT_Y, CONTENT_Y + CONTENT_H - 12),
        h:  random(1, 14),
        dx: random(-35, 35),
      })
    }
  }

  if (_glitchFrames > 0) {
    _glitchFrames--
    const ctx = drawingContext
    ctx.save()
    for (const s of _glitchSlices) {
      ctx.fillStyle = `rgba(255,255,255,0.03)`
      ctx.fillRect(0, s.y, width, s.h)
      // thin displaced line
      ctx.fillStyle = `rgba(180,220,255,0.12)`
      ctx.fillRect(s.dx, s.y, width - Math.abs(s.dx), 1)
    }
    ctx.restore()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HUD  — minimal: just phone dot + optional grade name flash
// ─────────────────────────────────────────────────────────────────────────────
function _drawHUD() {
  const ctx = drawingContext
  const r   = 5
  const cy  = BAR_H * 0.5

  // Phone status dot (right bar)
  ctx.save()
  ctx.beginPath()
  ctx.arc(width - 18, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = phoneConnected
    ? `rgba(90,215,110,${0.7 + 0.3 * sin(frameCount * 0.08)})`
    : 'rgba(255,70,70,0.5)'
  ctx.fill()
  ctx.restore()

  // Recording dot
  if (gallery.recording && frameCount % 20 < 10) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(18, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,40,40,0.9)'
    ctx.fill()
    ctx.restore()
  }

  // Mode indicator (top-left)
  ctx.save()
  ctx.font = '9px monospace'
  ctx.textAlign = 'left'
  if (_rfMode) {
    ctx.fillStyle = `rgba(255,75,75,${0.6 + 0.4 * Math.sin(frameCount * 0.09)})`
    ctx.fillText(`RAPIDFIRE  ·  ROUND ${_rf.round}`, 32, cy + 3.5)
  }
  ctx.restore()

  // Momentary grade name flash when cycling
  if (_gradeFlash > 0) {
    _gradeFlash--
    const a = min(1, _gradeFlash / 20)
    push()
    textAlign(CENTER, CENTER)
    textSize(11)
    noStroke()
    fill(255, 255, 255, a * 160)
    text(grade.presetName.toUpperCase(), width * 0.5, cy)
    pop()
  }
}

function _drawRecDot() {
  // handled in _drawHUD
}

// ─────────────────────────────────────────────────────────────────────────────
// KEYBOARD
// ─────────────────────────────────────────────────────────────────────────────
function keyPressed() {
  if (keyCode === ESCAPE) {
    if (gallery.visible) { gallery.toggle(); return }
    if (_rfMode)         { _stopRapidfire(); return }
    if (pb.phase)        { pb.phase = null;  return }
  }

  switch (key.toUpperCase()) {
    case ' ':
      _triggerMoment()
      return false

    case 'F':
      if (_rfMode) _stopRapidfire()
      else _startRapidfire()
      break

    case 'P':
      _startPhotobooth()
      break

    case 'G':
      gallery.toggle()
      break

    case 'R':
      if (gallery.recording) {
        gallery.stopRec()
        _momentClipMs = 0
      } else {
        gallery.startRec(document.querySelector('canvas'))
        _momentClipMs = 0  // manual — no auto-stop
      }
      break

    case 'C':
      showConfig = !showConfig
      if (configPanel) configPanel.style.display = showConfig ? 'block' : 'none'
      break

    case '1': swapped = false; break
    case '2': swapped = true;  break
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MOUSE / TOUCH — click anywhere to trigger a moment
// ─────────────────────────────────────────────────────────────────────────────
function mousePressed() {
  if (gallery.visible || showConfig || pb.phase) return
  if (mouseButton !== LEFT) return
  if (_rfMode) {
    if (_rf.phase === 'prep') _rf.prepTimer = RF_PREP_MS  // skip to countdown
    return false
  }
  _triggerMoment()
  return false
}

function touchStarted() {
  if (gallery.visible || showConfig || pb.phase) return
  if (_rfMode) {
    if (_rf.phase === 'prep') _rf.prepTimer = RF_PREP_MS
    return false
  }
  _triggerMoment()
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// RESIZE
// ─────────────────────────────────────────────────────────────────────────────
function windowResized() {
  resizeCanvas(windowWidth, windowHeight)
  _computeLayout()
  grade.resizeGrain(width, height)
  particles.init(260)
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function _computeLayout() {
  BAR_H     = Math.round(height * 0.055)   // thinner bars — 5.5%
  CONTENT_Y = BAR_H
  CONTENT_H = height - BAR_H * 2
}

function _placeholder(x, y, w, h) {
  noStroke(); fill(8); rect(x, y, w, h)
  fill(35); textSize(12); textAlign(CENTER, CENTER)
  text('waiting for phone…', x + w * 0.5, y + h * 0.5)
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG PANEL
// ─────────────────────────────────────────────────────────────────────────────
function _buildConfigPanel() {
  configPanel = document.createElement('div')
  Object.assign(configPanel.style, {
    display: 'none', position: 'fixed', top: '50%', left: '50%',
    transform: 'translate(-50%,-50%)',
    background: 'rgba(0,0,0,0.93)', border: '1px solid #1e1e1e',
    borderRadius: '4px', padding: '18px 22px',
    color: '#777', fontFamily: 'monospace', fontSize: '11px',
    lineHeight: '2.2', zIndex: '9999', minWidth: '280px',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
  })

  configPanel.innerHTML = `
    <div style="font-size:12px;color:#ccc;margin-bottom:10px;letter-spacing:.12em">
      SETTINGS <span style="float:right;cursor:pointer;color:#333" id="cfg-close">✕</span>
    </div>
    <label>Grade &nbsp;
      <select id="cfg-grade" style="${_sel()}">
        ${Object.keys(PRESETS).map(n => `<option value="${n}">${n}</option>`).join('')}
      </select>
    </label><br>
    <label>Camera order &nbsp;
      <select id="cfg-swap" style="${_sel()}">
        <option value="normal">laptop base · phone overlay</option>
        <option value="swapped">phone base · laptop overlay</option>
      </select>
    </label><br>
    <label>Laptop camera &nbsp;
      <select id="cfg-device" style="${_sel()}"><option>default</option></select>
    </label>
    <hr style="border-color:#111;margin:12px 0 8px">
    <div style="color:#333;font-size:10px;line-height:1.9">
      Click / Space · moment &nbsp; F · rapidfire<br>
      G · gallery &nbsp; R · manual record &nbsp; C · this panel<br>
      P · photobooth &nbsp; 1/2 · swap
    </div>
  `
  document.body.appendChild(configPanel)

  document.getElementById('cfg-close').addEventListener('click', () => {
    showConfig = false; configPanel.style.display = 'none'
  })

  const gradeSelect = document.getElementById('cfg-grade')
  gradeSelect.value = grade.presetName
  gradeSelect.addEventListener('change', () => { grade.setPreset(gradeSelect.value); _gradeFlash = 55 })

  document.getElementById('cfg-swap').addEventListener('change', e => {
    swapped = e.target.value === 'swapped'
  })

  window._cfgDeviceSelect = document.getElementById('cfg-device')
  window._cfgDeviceSelect.addEventListener('change', () => {
    const id = window._cfgDeviceSelect.value
    if (!id || id === 'default') return
    if (laptopVideo) laptopVideo.remove()
    laptopVideo = createCapture({ video: { deviceId: { exact: id } } })
    laptopVideo.size(640, 480)
    laptopVideo.hide()
  })
}

function _sel() {
  return 'background:#080808;color:#777;border:1px solid #1e1e1e;padding:2px 7px;font-family:monospace;border-radius:2px'
}

function _populateDeviceSelector() {
  const sel = window._cfgDeviceSelect
  if (!sel) return
  sel.innerHTML = '<option value="default">default</option>'
  videoDevices.forEach((d, i) => {
    const opt = document.createElement('option')
    opt.value = d.deviceId
    opt.textContent = d.label || `Camera ${i + 1}`
    sel.appendChild(opt)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// MOMENT TRIGGER — click / touch / space: 2 stills + 5s clip + branching path
// ─────────────────────────────────────────────────────────────────────────────
function _triggerMoment() {
  _interacted = true

  const cvs = document.querySelector('canvas')

  // Still #1 — before grade shifts
  gallery.pushFrame(cvs.toDataURL('image/jpeg', 0.85))

  // Cycle grade + subtitle
  subtitles.forceNext()
  grade.cyclePreset()
  _gradeFlash = 55

  // Still #2 — after grade has settled
  setTimeout(() => {
    gallery.pushFrame(document.querySelector('canvas').toDataURL('image/jpeg', 0.85))
  }, 350)

  // Auto-clip: extend if already running, else start fresh
  if (_momentClipMs > 0) {
    _momentClipMs = CLIP_DURATION  // extend
  } else if (!gallery.recording) {
    gallery.startRec(cvs)
    _momentClipMs = CLIP_DURATION
  }

  // Branching path
  _startBranchingPath()
}

function _startBranchingPath() {
  let idx
  do { idx = Math.floor(Math.random() * BRANCHING_PATHS.length) }
  while (BRANCHING_PATHS[idx] === _bp.text && BRANCHING_PATHS.length > 1)
  _bp.text = BRANCHING_PATHS[idx]
  _bp.alpha = 0; _bp.timer = 0; _bp.state = 'fadein'
}

// ─────────────────────────────────────────────────────────────────────────────
// BRANCHING PATH OVERLAY — poetic parallel scenarios after each switch
// ─────────────────────────────────────────────────────────────────────────────
function _drawBranchingPath() {
  if (_bp.state === 'off') return

  _bp.timer += deltaTime

  if (_bp.state === 'fadein') {
    _bp.alpha = constrain(_bp.timer / BP_FADEIN, 0, 1)
    if (_bp.timer >= BP_FADEIN) { _bp.alpha = 1; _bp.timer = 0; _bp.state = 'hold' }
  } else if (_bp.state === 'hold') {
    if (_bp.timer >= BP_HOLD) { _bp.timer = 0; _bp.state = 'fadeout' }
  } else if (_bp.state === 'fadeout') {
    _bp.alpha = constrain(1 - _bp.timer / BP_FADEOUT, 0, 1)
    if (_bp.timer >= BP_FADEOUT) { _bp.alpha = 0; _bp.state = 'off' }
  }

  if (_bp.alpha <= 0.01) return

  const a     = _bp.alpha
  const cx    = width / 2
  const lines = _bp.text.split('\n')
  const lh    = 24
  const startY = CONTENT_Y + CONTENT_H * 0.36 - (lines.length * lh) / 2

  push()
  noStroke()
  textFont('Georgia, "Times New Roman", serif')
  textSize(15)
  textAlign(CENTER, TOP)
  textStyle(ITALIC)

  drawingContext.save()
  drawingContext.shadowColor = `rgba(0,0,0,${a * 0.92})`
  drawingContext.shadowBlur  = 22

  lines.forEach((line, i) => {
    fill(255, 252, 242, a * (195 - i * 10))
    text(line, cx, startY + i * lh)
  })

  drawingContext.restore()
  pop()
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCOVERABLE HINT — fades in after 5s inactivity, gone after first touch
// ─────────────────────────────────────────────────────────────────────────────
function _drawHint() {
  if (_interacted || _rfMode) return

  _hintTimer += deltaTime
  if (_hintTimer < 5000) return

  const a = constrain(map(_hintTimer, 5000, 7000, 0, 1), 0, 1) *
            constrain(map(_hintTimer, 12000, 14500, 1, 0), 0, 1)
  if (a <= 0.01) return

  const pulse = 0.82 + 0.18 * sin(millis() * 0.0018)
  push()
  noStroke()
  textFont('Georgia, "Times New Roman", serif')
  textSize(13)
  textAlign(CENTER, CENTER)
  textStyle(ITALIC)
  drawingContext.save()
  drawingContext.shadowColor = `rgba(0,0,0,${a * 0.75})`
  drawingContext.shadowBlur  = 12
  fill(255, 255, 255, a * 50 * pulse)
  text('— touch the light —', width / 2, CONTENT_Y + CONTENT_H * 0.5)
  drawingContext.restore()
  pop()
}

// ─────────────────────────────────────────────────────────────────────────────
// RAPIDFIRE MODE — storyboard loop: prep → 3-2-1 → snap → show → repeat
// ─────────────────────────────────────────────────────────────────────────────
function _startRapidfire() {
  _rfMode        = true
  _interacted    = true
  _rf.round      = 1
  _rf.prepTimer  = 0
  _rf.phase      = 'prep'
  _rf.prepMsg    = RF_PREP_MSGS[Math.floor(Math.random() * RF_PREP_MSGS.length)]
}

function _stopRapidfire() {
  if (_rf.snapImg) { _rf.snapImg.remove(); _rf.snapImg = null }
  if (_momentClipMs > 0) { _momentClipMs = 0; gallery.stopRec() }
  _rfMode   = false
  _rf.phase = 'off'
}

function _tickAndDrawRapidfire() {
  switch (_rf.phase) {
    case 'prep':
      _rf.prepTimer += deltaTime
      _drawRfPrep()
      if (_rf.prepTimer >= RF_PREP_MS) _rfStartCountdown()
      break

    case 'countdown':
      _rf.countTimer += deltaTime
      _drawRfCountdown()
      if (_rf.countTimer >= 1000) {
        _rf.countTimer = 0
        _rf.count--
        if (_rf.count <= 0) _rfSnap()
      }
      break

    case 'flash':
      _rf.flashTimer += deltaTime
      _drawRfFlash()
      if (_rf.flashTimer >= 280) { _rf.phase = 'showing'; _rf.showTimer = 0 }
      break

    case 'showing':
      _rf.showTimer += deltaTime
      _drawRfShowing()
      if (_rf.showTimer >= RF_SHOW_MS) _rfNextRound()
      break
  }
}

function _rfStartCountdown() {
  _rf.count = 3; _rf.countTimer = 0; _rf.phase = 'countdown'
}

function _rfSnap() {
  const cvs = document.querySelector('canvas')
  gallery.pushFrame(cvs.toDataURL('image/jpeg', 0.85))
  setTimeout(() => {
    gallery.pushFrame(document.querySelector('canvas').toDataURL('image/jpeg', 0.85))
  }, 300)

  _rf.snapImg = get(0, CONTENT_Y, width, CONTENT_H)

  if (_momentClipMs > 0) {
    _momentClipMs = RF_CLIP_MS
  } else if (!gallery.recording) {
    gallery.startRec(cvs)
    _momentClipMs = RF_CLIP_MS
  }

  _startBranchingPath()
  _rf.phase = 'flash'; _rf.flashTimer = 0
}

function _rfNextRound() {
  if (_rf.snapImg) { _rf.snapImg.remove(); _rf.snapImg = null }
  _rf.round++
  _rf.prepTimer = 0
  _rf.phase     = 'prep'
  _rf.prepMsg   = RF_PREP_MSGS[Math.floor(Math.random() * RF_PREP_MSGS.length)]
}

function _drawRfPrep() {
  const fadeIn = constrain(map(_rf.prepTimer, 0, 600, 0, 1), 0, 1)
  const barA   = constrain(map(_rf.prepTimer, 200, 900, 0, 1), 0, 1)
  const progress = _rf.prepTimer / RF_PREP_MS

  // Prep message — faint, centered
  push()
  noStroke()
  textFont('Georgia, "Times New Roman", serif')
  textSize(14)
  textAlign(CENTER, CENTER)
  textStyle(ITALIC)
  drawingContext.save()
  drawingContext.shadowColor = `rgba(0,0,0,${fadeIn * 0.8})`
  drawingContext.shadowBlur  = 10
  fill(255, 255, 255, fadeIn * 42)
  text(_rf.prepMsg, width / 2, CONTENT_Y + CONTENT_H * 0.5)
  drawingContext.restore()
  pop()

  // Progress bar at top of content area
  const bw = width * 0.36
  const bx = (width - bw) / 2
  const by = CONTENT_Y + 18
  const ctx = drawingContext
  ctx.save()
  ctx.strokeStyle = `rgba(255,255,255,${barA * 0.12})`
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by); ctx.stroke()
  ctx.strokeStyle = `rgba(255,215,45,${barA * 0.55})`
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw * progress, by); ctx.stroke()
  ctx.font = '9px monospace'
  ctx.fillStyle = `rgba(255,255,255,${barA * 0.3})`
  ctx.textAlign = 'left'
  ctx.fillText(`ROUND ${_rf.round}  ·  CLICK TO SKIP`, bx, by - 6)
  ctx.restore()
}

function _drawRfCountdown() {
  drawingContext.save()
  drawingContext.fillStyle = 'rgba(0,0,0,0.45)'
  drawingContext.fillRect(0, 0, width, height)
  drawingContext.restore()

  const pulse = 0.9 + 0.1 * sin(_rf.countTimer / 1000 * TWO_PI * 1.5)
  push()
  textAlign(CENTER, CENTER)
  textSize(height * 0.28 * pulse)
  noStroke()
  drawingContext.save()
  drawingContext.shadowColor = 'rgba(255,255,255,0.45)'
  drawingContext.shadowBlur  = 50
  fill(255, 255, 255, 210)
  text(_rf.count, width / 2, height / 2)
  drawingContext.restore()
  textSize(11)
  fill(255, 255, 255, 60)
  text(`RAPIDFIRE  ·  ROUND ${_rf.round}`, width / 2, height * 0.5 + height * 0.18)
  pop()
}

function _drawRfFlash() {
  const alpha = map(_rf.flashTimer, 0, 280, 1, 0)
  drawingContext.save()
  drawingContext.fillStyle = `rgba(255,255,255,${alpha})`
  drawingContext.fillRect(0, 0, width, height)
  drawingContext.restore()
}

function _drawRfShowing() {
  if (!_rf.snapImg) return
  const elapsed = _rf.showTimer
  const a = constrain(map(elapsed, 0, 350, 0, 1), 0, 1) *
            constrain(map(elapsed, RF_SHOW_MS - 350, RF_SHOW_MS, 1, 0), 0, 1)

  push()
  tint(255, a * 245)
  image(_rf.snapImg, 0, CONTENT_Y, width, CONTENT_H)
  pop()

  // WKW yellow progress line
  const progress = elapsed / RF_SHOW_MS
  const bw = 140
  const bx = (width - bw) / 2
  const by = CONTENT_Y + CONTENT_H - 22
  const ctx = drawingContext
  ctx.save()
  ctx.strokeStyle = `rgba(255,255,255,${a * 0.2})`
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by); ctx.stroke()
  ctx.strokeStyle = `rgba(255,215,45,${a * 0.72})`
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw * progress, by); ctx.stroke()
  ctx.restore()
}
