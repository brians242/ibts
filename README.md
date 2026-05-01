# In Between the Stills

A Wong Kar-Wai-inspired dual-camera cinematic installation. Merges a laptop webcam and a phone camera into a single widescreen frame with real-time color grading, film grain, and cycling subtitle fragments.

---

## What it does

Two live camera feeds appear side-by-side in a letterboxed 16:9 canvas. A color grade (warm shadows, lifted blacks, vignette) is applied in real-time. Subtitle fragments — pulled from a curated pool of ambiguous mid-scene lines — fade in and out across the bottom bar. Pressing `S` freezes the frame into a "still," deepening the grain and vignette like a film photograph being printed.

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

## Keyboard controls

| Key | Action |
|-----|--------|
| `S` | Toggle still / live mode |
| `G` | Cycle color grade preset |
| `C` | Open config panel |
| `F` | Toggle fullscreen |
| `Space` | Skip to next subtitle |
| `1` | Laptop left, phone right (default) |
| `2` | Phone left, laptop right |

---

## Color grade presets

| Preset | Mood |
|--------|------|
| `warmnight` | *In the Mood for Love* — warm shadows, saturated, lifted blacks |
| `faded` | *Chungking Express* — milky highlights, low contrast, cool shift |
| `overcast` | *2046* — desaturated, blue-grey shadows |
| `raw` | No grade — passthrough |

---

## File overview

```
├── server.js               Express + Socket.io relay server
├── package.json
├── captions/
│   └── fragments.json      Pool of 50 subtitle fragments
└── public/
    ├── index.html          Desktop cinematic view
    ├── mobile.html         Phone camera streamer
    ├── sketch.js           p5.js canvas, layout, keyboard controls
    ├── colorgrade.js       Color grade class and presets
    ├── subtitle.js         Subtitle state machine
    └── style.css           Baseline styles
```

No build step. All frontend dependencies load from CDN.
