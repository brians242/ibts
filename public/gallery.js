// gallery.js — Auto-capture photo gallery + canvas video recorder

class Gallery {
  constructor() {
    this.stills    = []      // [{ dataURL, ts }]
    this.max       = 60
    this.lastMs    = 0
    this.visible   = false

    this.recorder  = null
    this.chunks    = []
    this.recording = false

    this.videos   = []
    this.videoMax = 16

    this._buildDOM()
  }

  // Call each frame; canvas is the raw HTMLCanvasElement
  tick(nowMs, canvas) {
    if (nowMs - this.lastMs >= 1000) {
      this._snap(canvas)
      this.lastMs = nowMs
    }
  }

  pushVideo(blob) {
    const url = URL.createObjectURL(blob)
    this.videos.unshift({ url, ts: Date.now() })
    if (this.videos.length > this.videoMax) URL.revokeObjectURL(this.videos.pop().url)
    if (this.visible) this._refreshVideos()
  }

  // Force-capture a still (e.g. photobooth result)
  pushFrame(dataURL) {
    this.stills.unshift({ dataURL, ts: Date.now() })
    if (this.stills.length > this.max) this.stills.pop()
    if (this.visible) this._refresh()
  }

  startRec(canvas) {
    if (this.recording) return
    this.chunks = []
    let mime = 'video/webm;codecs=vp9'
    if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm'
    const stream = canvas.captureStream(30)
    this.recorder = new MediaRecorder(stream, { mimeType: mime })
    this.recorder.ondataavailable = e => e.data.size && this.chunks.push(e.data)
    this.recorder.onstop = () => this._dlVideo()
    this.recorder.start(200)
    this.recording = true
  }

  stopRec() {
    if (!this.recording || !this.recorder) return
    this.recorder.stop()
    this.recording = false
  }

  toggle() {
    this.visible = !this.visible
    this.overlay.style.display = this.visible ? 'flex' : 'none'
    if (this.visible) this._refresh()
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _snap(canvas) {
    try {
      const url = canvas.toDataURL('image/jpeg', 0.62)
      this.stills.unshift({ dataURL: url, ts: Date.now() })
      if (this.stills.length > this.max) this.stills.pop()
      if (this.visible) this._refresh()
    } catch (_) {}
  }

  _dlVideo() {
    const blob = new Blob(this.chunks, { type: 'video/webm' })
    this.pushVideo(blob)
  }

  _refreshVideos() {
    if (!this.videoRow) return
    this.videoRow.innerHTML = ''
    if (this.videos.length === 0) {
      const ph = document.createElement('span')
      ph.textContent = 'clips appear here after each moment'
      Object.assign(ph.style, {
        color: '#252525', fontFamily: 'monospace', fontSize: '10px',
        lineHeight: '30px',
      })
      this.videoRow.appendChild(ph)
      return
    }
    this.videos.forEach(v => {
      const wrap = document.createElement('div')
      Object.assign(wrap.style, { position: 'relative', flexShrink: '0' })

      const vid = document.createElement('video')
      vid.src = v.url; vid.loop = true; vid.muted = true; vid.playsInline = true
      Object.assign(vid.style, {
        width: '160px', height: '90px', objectFit: 'cover', display: 'block',
        background: '#050505', border: '1px solid #1e1e1e', cursor: 'pointer',
      })
      vid.addEventListener('mouseenter', () => vid.play())
      vid.addEventListener('mouseleave', () => { vid.pause(); vid.currentTime = 0 })
      vid.addEventListener('click', () => vid.paused ? vid.play() : vid.pause())

      const ts = document.createElement('span')
      const d  = new Date(v.ts)
      ts.textContent = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
      Object.assign(ts.style, {
        position: 'absolute', bottom: '4px', left: '6px',
        fontSize: '9px', color: 'rgba(255,255,255,0.35)',
        fontFamily: 'monospace', pointerEvents: 'none',
      })

      const dl = document.createElement('button')
      dl.textContent = '↓'
      Object.assign(dl.style, {
        position: 'absolute', top: '4px', right: '4px',
        background: 'rgba(0,0,0,0.8)', border: '1px solid #2a2a2a',
        color: '#666', padding: '2px 7px', cursor: 'pointer',
        fontFamily: 'monospace', fontSize: '9px', borderRadius: '2px',
      })
      dl.addEventListener('click', e => {
        e.stopPropagation()
        const a = document.createElement('a')
        a.href = v.url; a.download = `moment-${v.ts}.webm`; a.click()
      })

      wrap.appendChild(vid); wrap.appendChild(ts); wrap.appendChild(dl)
      this.videoRow.appendChild(wrap)
    })
  }

  _refresh() {
    this._refreshVideos()
    this.grid.innerHTML = ''
    this.stills.forEach(s => {
      const wrap = document.createElement('div')
      Object.assign(wrap.style, {
        position: 'relative', flexShrink: '0',
        border: '1px solid #1e1e1e', cursor: 'pointer',
        transition: 'border-color 0.12s',
        width: '176px', height: '99px', overflow: 'hidden',
      })

      const img = document.createElement('img')
      img.src = s.dataURL
      Object.assign(img.style, {
        width: '100%', height: '100%', objectFit: 'cover', display: 'block',
      })

      const ts = document.createElement('span')
      const d  = new Date(s.ts)
      ts.textContent = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`
      Object.assign(ts.style, {
        position: 'absolute', bottom: '4px', right: '6px',
        fontSize: '9px', color: 'rgba(255,255,255,0.4)',
        fontFamily: 'monospace', pointerEvents: 'none',
      })

      wrap.appendChild(img)
      wrap.appendChild(ts)
      wrap.addEventListener('mouseover', () => wrap.style.borderColor = '#555')
      wrap.addEventListener('mouseout',  () => wrap.style.borderColor = '#1e1e1e')
      wrap.addEventListener('click', () => this._lightbox(s.dataURL))
      this.grid.appendChild(wrap)
    })
  }

  _lightbox(url) {
    this.lbImg.src = url
    this.lb.style.display = 'flex'
    this.dlBtn.onclick = () => {
      const a = document.createElement('a')
      a.href = url
      a.download = `still-${Date.now()}.jpg`
      a.click()
    }
  }

  _buildDOM() {
    const mono = 'monospace'

    // ── Gallery overlay ──────────────────────────────────────────────────────
    this.overlay = document.createElement('div')
    Object.assign(this.overlay.style, {
      display:        'none',
      position:       'fixed',
      inset:          '0',
      background:     'rgba(0,0,0,0.93)',
      flexDirection:  'column',
      zIndex:         '1000',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    })

    // Header bar
    const hdr = document.createElement('div')
    Object.assign(hdr.style, {
      padding:        '0 20px',
      height:         '44px',
      borderBottom:   '1px solid #1c1c1c',
      display:        'flex',
      alignItems:     'center',
      gap:            '20px',
      flexShrink:     '0',
    })

    const title = document.createElement('span')
    title.textContent = 'STILLS'
    Object.assign(title.style, {
      color: '#fff', fontFamily: mono, fontSize: '11px', letterSpacing: '.2em',
    })

    const sub = document.createElement('span')
    sub.id = 'gallery-count'
    Object.assign(sub.style, { color: '#444', fontFamily: mono, fontSize: '10px' })

    const recBtn = document.createElement('button')
    recBtn.id = 'gal-rec'
    recBtn.textContent = '⏺  RECORD'
    _styleBtn(recBtn)
    recBtn.addEventListener('click', () => {
      window._galleryRecToggle && window._galleryRecToggle()
    })

    const closeBtn = document.createElement('button')
    closeBtn.textContent = '✕'
    _styleBtn(closeBtn, { marginLeft: 'auto' })
    closeBtn.addEventListener('click', () => this.toggle())

    hdr.appendChild(title)
    hdr.appendChild(sub)
    hdr.appendChild(recBtn)
    hdr.appendChild(closeBtn)

    // Scroll grid
    this.grid = document.createElement('div')
    Object.assign(this.grid.style, {
      display:   'flex',
      flexWrap:  'wrap',
      gap:       '6px',
      padding:   '16px 20px',
      overflowY: 'auto',
      flex:      '1',
      alignContent: 'flex-start',
    })

    // Moments / video clip row
    const vidSec = document.createElement('div')
    Object.assign(vidSec.style, {
      borderBottom: '1px solid #111', padding: '10px 20px',
      flexShrink: '0',
    })
    const vidLabel = document.createElement('div')
    vidLabel.textContent = 'MOMENTS'
    Object.assign(vidLabel.style, {
      color: '#333', fontFamily: mono, fontSize: '10px',
      letterSpacing: '.2em', marginBottom: '8px',
    })
    this.videoRow = document.createElement('div')
    Object.assign(this.videoRow.style, {
      display: 'flex', gap: '8px', overflowX: 'auto',
      paddingBottom: '4px', minHeight: '30px',
    })
    vidSec.appendChild(vidLabel)
    vidSec.appendChild(this.videoRow)

    this.overlay.appendChild(hdr)
    this.overlay.appendChild(vidSec)
    this.overlay.appendChild(this.grid)
    document.body.appendChild(this.overlay)

    // ── Lightbox ─────────────────────────────────────────────────────────────
    this.lb = document.createElement('div')
    Object.assign(this.lb.style, {
      display:         'none',
      position:        'fixed',
      inset:           '0',
      zIndex:          '2000',
      background:      '#000',
      alignItems:      'center',
      justifyContent:  'center',
      flexDirection:   'column',
    })

    this.lbImg = document.createElement('img')
    Object.assign(this.lbImg.style, {
      maxWidth: '92vw', maxHeight: '82vh',
      objectFit: 'contain', display: 'block',
    })

    const lbBar = document.createElement('div')
    Object.assign(lbBar.style, {
      marginTop: '16px', display: 'flex', gap: '12px',
    })

    this.dlBtn = document.createElement('button')
    this.dlBtn.textContent = 'DOWNLOAD'
    _styleBtn(this.dlBtn)

    const lbClose = document.createElement('button')
    lbClose.textContent = '✕  CLOSE'
    _styleBtn(lbClose)
    lbClose.addEventListener('click', () => { this.lb.style.display = 'none' })

    lbBar.appendChild(this.dlBtn)
    lbBar.appendChild(lbClose)
    this.lb.appendChild(this.lbImg)
    this.lb.appendChild(lbBar)
    document.body.appendChild(this.lb)
  }
}

function _styleBtn(el, extra = {}) {
  Object.assign(el.style, {
    background:    'none',
    border:        '1px solid #2a2a2a',
    color:         '#888',
    padding:       '5px 14px',
    cursor:        'pointer',
    fontFamily:    'monospace',
    fontSize:      '10px',
    letterSpacing: '.1em',
    borderRadius:  '2px',
    transition:    'border-color 0.12s, color 0.12s',
    ...extra,
  })
  el.addEventListener('mouseover', () => { el.style.borderColor = '#555'; el.style.color = '#ccc' })
  el.addEventListener('mouseout',  () => { el.style.borderColor = '#2a2a2a'; el.style.color = '#888' })
}
