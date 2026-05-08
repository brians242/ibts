# In Between the Stills

A Wong Kar-Wai-inspired dual-camera cinematic installation. Merges a laptop webcam and a phone camera into a single widescreen frame with real-time color grading, film grain, particle swarms, hand-landmark ASCII overlays, and cycling subtitle fragments.

---

## Setup

**Requirements:** Node.js 18+, a smartphone and laptop on the same WiFi network.

```bash
# 1. Install dependencies (first time only)
npm install

# 2. Start the server
node server.js
```

- **Desktop (cinematic view):** open `http://localhost:3000` in a browser
- **Phone (camera streamer):** open `http://<your-laptop-ip>:3000/mobile` in the phone browser

To find your laptop's local IP on macOS:
```bash
ipconfig getifaddr en0
```

### HTTPS for mobile camera access

Some mobile browsers require HTTPS before granting camera permission. Use ngrok to create a tunnel:

```bash
npx ngrok http 3000
```

Open the `https://...ngrok.io` URL on the phone instead.

### Debugging: phone can't open the HTTPS URL

Work through these in order — each one is a common failure point.

**1. ngrok shows a browser warning ("Deceptive site" or "Visit Site" interstitial)**

ngrok free tunnels open with an interstitial page. On the phone browser, tap **Visit Site** once; after that the actual app loads. If you don't see that option, try opening the URL in Safari instead of Chrome (or vice versa).

**2. Page loads but camera permission is never asked**

Mobile browsers only grant `getUserMedia` on pages served over HTTPS *or* `localhost`. Confirm the URL in your phone's address bar starts with `https://` — not `http://`. If it shows `http://`, copy the ngrok URL again from the terminal; it must be the `https://…ngrok-free.app` one.

**3. Page loads but the video feed never appears on the desktop**

The Socket.io connection is probably blocked. Check:
- Open the phone browser's dev console (Safari: Settings → Safari → Advanced → Web Inspector, then connect via Mac's Safari Develop menu). Look for `WebSocket connection failed` or `CORS` errors.
- Your desktop browser console may show `phone-connected` never fired.
- Cause: the Socket.io client on the phone is trying to connect back to `http://localhost:3000` instead of the ngrok host. In `public/mobile.html`, make sure the socket is initialized with no explicit URL so it connects to whatever host served the page:
  ```js
  const socket = io()   // correct — inherits the ngrok origin
  // not: const socket = io('http://localhost:3000')
  ```

**4. ngrok URL stopped working mid-session**

Free ngrok tunnels expire after ~2 hours and the URL changes every restart. Kill ngrok (`Ctrl-C`), run `npx ngrok http 3000` again, and send the new `https://` URL to your phone.

**5. Camera permission was denied and won't re-prompt**

iOS/Android remember the denial per origin. Since the ngrok URL changes each session this usually self-clears, but if it doesn't:
- **iPhone:** Settings → Safari → Camera → find the ngrok domain and set it to Allow (or remove it so it prompts again).
- **Android/Chrome:** tap the lock icon in the address bar → Site settings → Camera → Allow.

**6. Laptop has a VPN running**

A VPN on your laptop routes outbound traffic through a corporate/private tunnel, which can break ngrok in two ways:

- **ngrok can't reach its servers** — the tunnel fails to establish or drops intermittently. You'll see `connection refused` or the ngrok dashboard shows 0 requests coming through. Fix: disconnect the VPN, restart ngrok, then reconnect the VPN (ngrok only needs internet access at startup to negotiate the tunnel).
- **Split-tunnel VPN blocks localhost** — some VPNs intercept `localhost` or `127.0.0.1`. If `http://localhost:3000` stops loading on the laptop after connecting to VPN, start the server with an explicit bind:
  ```bash
  node server.js   # already listens on 0.0.0.0 via Express default
  ```
  Then access it via your LAN IP (`http://192.168.x.x:3000`) instead of `localhost`.

If you can't disconnect the VPN (e.g. required for work), use [localhost.run](https://localhost.run) as an alternative tunnel — it uses plain SSH and is less likely to be blocked:
```bash
ssh -R 80:localhost:3000 nokey@localhost.run
```
It prints an `https://` URL you can open on the phone.

**7. Nothing works — quick sanity checklist**

```
[ ] ngrok is running and shows a Forwarding https://... line
[ ] You're opening the /mobile path: https://xxxx.ngrok-free.app/mobile
[ ] Laptop and phone are connected (doesn't need to be same WiFi with ngrok)
[ ] No VPN active on the phone that might block WebSocket upgrades
[ ] No VPN on the laptop blocking ngrok (try disconnecting VPN and restarting ngrok)
[ ] Tried a hard reload on the phone (hold reload button → "Reload Without Content Blockers" on Safari)
```

---

## Controls

### Keyboard

| Key | Action |
|-----|--------|
| `Space` | Trigger a moment — 2 stills + 5 s clip + branching path overlay |
| `S` | Toggle still / live mode (freezes frame, deepens grain) |
| `P` | Start photobooth 3-2-1 countdown → parallax composite |
| `F` | Toggle rapidfire storyboard mode |
| `G` | Cycle color grade preset |
| `R` | Start / stop video recording |
| `` ` `` | Open / close gallery |
| `C` | Open config panel (grade, camera select, layout) |
| `1` | Laptop as base, phone as overlay (default) |
| `2` | Phone as base, laptop as overlay |
| `ESC` | Close gallery / exit rapidfire / cancel photobooth |

### Hand gestures (laptop webcam)

| Gesture | Action |
|---------|--------|
| Snap fingers | 3-2-1 countdown → trigger moment (stills + clip) |
| Hold a fist for ~0.5 s | Open / close gallery |

### Phone controls

| Button | Action |
|--------|--------|
| ⟳ flip | Switch between front and rear camera |
| ⇄ swap | Make the phone the primary base camera (laptop becomes overlay) |

---

## Color grade presets

| Preset | Mood |
|--------|------|
| `moodforlove` | *In the Mood for Love* — crimson shadows, amber warmth, heavy vignette |
| `chunking` | *Chungking Express* — milky highlights, low contrast, cool shift |
| `2046` | *2046* — desaturated, blue-grey shadows |
| `fallen` | *Fallen Angels* — high contrast, pushed greens, deep blacks |
| `raw` | No grade — passthrough |

---

## File structure

```
├── server.js               Express + Socket.io relay server
├── package.json
├── captions/
│   └── fragments.json      Pool of subtitle fragments
└── public/
    ├── index.html          Desktop cinematic view (loads all scripts)
    ├── mobile.html         Phone camera streamer + swap/flip controls
    ├── style.css           Baseline styles
    ├── sketch.js           p5.js main loop, layout, keyboard + gesture wiring
    ├── colorgrade.js       ColorGrade class — LUT-style CSS filter grades + film grain
    ├── subtitle.js         SubtitleSystem — fade-in/hold/fade-out state machine
    ├── landmarkoverlay.js  MediaPipe Hands → per-cell ASCII Markov fill; snap/fist detection
    ├── markov.js           Sparse Markov state constellation (quiet/present/moving)
    ├── particles.js        Audio-reactive swarming particle backdrop
    ├── gallery.js          Auto-capture stills, canvas video recorder, lightbox UI
    └── ascii.js            Brightness-mapped ASCII texture layer over raw video
```

No build step. All frontend dependencies load from CDN.

---

## How it works

### Dual-camera architecture

The desktop (`index.html`) opens the laptop webcam directly via `getUserMedia`. The phone (`mobile.html`) opens its own camera, encodes each frame as a compressed JPEG dataURL at ~15 fps, and streams it over a Socket.io WebSocket to the server (`server.js`), which relays it to any connected desktop. The desktop receives frames and paints them onto a hidden `<img>` element that feeds into the p5.js canvas.

By default the laptop feed fills the full canvas as the base layer and the phone feed is blended on top at 42% opacity in `screen` blending mode, producing a double-exposure effect. Pressing `2` (or the phone's ⇄ swap button) inverts this — the phone becomes the base and the laptop becomes the ghost overlay.

### Render pipeline

Each frame `draw()` runs these layers in order:

1. **Presence detection** — the laptop frame is sampled at 20×12 pixels to find a weighted centroid of motion, which becomes the particle attractor.
2. **Particle swarm** — ~260 particles drift toward the detected presence point, drawn behind everything.
3. **Camera feeds** — base feed drawn full-canvas with the active color grade; phone overlay screen-blended on top with a slight horizontal offset for natural parallax.
4. **MediaPipe hand landmarks** — fingers and palm are covered with a live ASCII character grid (see below).
5. **Markov constellation** — barely-visible probability scatter reacts to motion and hand state.
6. **Post-process** — animated scanlines, occasional glitch slices.
7. **Subtitles** — poetic fragments fade in over the lower third.
8. **Letterbox bars** — thin black bars top and bottom; particle frequency spectrum drawn in the bottom bar.
9. **HUD** — phone connection dot, recording dot, mode labels.
10. **Countdown / flash overlays** — photobooth, rapidfire, snap-record countdowns drawn on top.
11. **Branching path overlay** — after a moment is triggered, an italic parallel-timeline text fades in and out over the image.

### Hand landmark ASCII fill (`landmarkoverlay.js`)

MediaPipe Hands runs asynchronously on the laptop webcam feed. For each detected hand, a capsule-based hit test covers the palm and all five fingers (no forearm — the coverage stops at the wrist). Each 8×8 px grid cell inside that shape holds a Markov state: an integer index into a 21-character ASCII chain ordered light-to-dense (`·.,~-:;/\|!+x*oO0#@%`). Per frame, each cell drifts one step toward a target index derived from the local video brightness, with the speed of drift driven by hand motion velocity. The result is a shimmering ASCII skin that reads the texture of whatever is behind the hand.

The same module watches for two gestures:
- **Snap** — detected when the hand velocity spikes above 0.55 after being calm (< 0.15) for at least 500 ms of continuous visibility, preventing false triggers from a hand entering frame. Fires the snap-record countdown.
- **Fist** — detected when `handOpen` (average fingertip-to-wrist distance, normalized) falls below 0.35 and stays there for 500 ms. Opens or closes the gallery. Resets with a 2.5 s cooldown.

### Color grade + film grain (`colorgrade.js`)

Grades are applied as CSS `filter` strings (brightness, contrast, saturate, hue-rotate, sepia) composed at draw time. Film grain is a pre-generated noise texture drawn over the content area each frame at low opacity, refreshed on resize. The grain texture updates slowly each frame using a noise offset so it feels organic rather than frozen.

### Subtitle system (`subtitle.js`)

Fragments are loaded from `captions/fragments.json`. The state machine cycles: **waiting** → **fade in** (800 ms) → **hold** (3–6 s, randomized) → **fade out** (600 ms) → **waiting**. Still mode doubles the hold duration. `forceNext()` skips immediately to the next fragment — called on every moment trigger so grade changes always coincide with a subtitle shift.

### Gallery + recording (`gallery.js`)

Auto-captures a still every 4 seconds while not recording. A moment trigger adds two manual stills (before and after the grade shift) and starts a 5-second video clip via `MediaRecorder` on the canvas stream. The gallery overlay shows stills in a scrollable grid and clips in a horizontal row; clips play on hover. A lightbox allows full-screen viewing and JPEG/WebM download.

### Markov constellation (`markov.js`)

Three hidden states — quiet, present, moving — update their transition probabilities from live presence-detection and hand velocity data. A sparse scatter of dots and probability labels is rendered at very low opacity in the content area, invisible at a glance but present on closer inspection. The constellation also exports an `asciiShift` value that biases the hand overlay toward lighter or denser characters depending on the current state.

### Branching path overlays

After each moment trigger, one of fifteen pre-written parallel-timeline sentences fades in over the upper-middle of the frame in italic serif type, holds for ~5.5 seconds, then fades out. The text describes an alternate version of the present moment — the same structural conceit as the film's parallel-life theme.
