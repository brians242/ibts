// server.js — Express + Socket.io relay server for "In Between the Stills"
//
// Routes:
//   GET /        → index.html  (desktop cinematic view)
//   GET /mobile  → mobile.html (phone camera streamer)
//
// Socket.io events:
//   phone-register     phone → server           phone announces itself
//   phone-frame        phone → server → desktop  JPEG dataURL relay
//   phone-connected    server → desktop          phone joined
//   phone-disconnected server → desktop          phone left

import express from 'express'
import { createServer as createHttpServer } from 'http'
import { createServer as createHttpsServer } from 'https'
import { readFileSync } from 'fs'
import { Server } from 'socket.io'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { networkInterfaces } from 'os'

function getLocalIP() {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return 'localhost'
}

const __dirname = dirname(fileURLToPath(import.meta.url))

const app = express()

// Use HTTPS if cert files exist (required for camera on mobile browsers)
let server
try {
  const ssl = {
    key:  readFileSync(join(__dirname, 'cert.key')),
    cert: readFileSync(join(__dirname, 'cert.crt')),
  }
  server = createHttpsServer(ssl, app)
} catch {
  server = createHttpServer(app)
}

const io = new Server(server)

// Serve static assets and captions JSON
app.use(express.static(join(__dirname, 'public')))
app.use('/captions', express.static(join(__dirname, 'captions')))

// Dedicated route so /mobile always resolves even without a trailing slash
app.get('/mobile', (_, res) =>
  res.sendFile(join(__dirname, 'public', 'mobile.html'))
)

// Track the phone socket so we can detect its specific disconnect
let phoneSocketId = null

io.on('connection', socket => {
  console.log(`[connect]    ${socket.id}`)

  // Phone client announces itself after socket connects
  socket.on('phone-register', () => {
    phoneSocketId = socket.id
    socket.broadcast.emit('phone-connected')
    console.log(`[phone]      registered ${socket.id}`)
  })

  // Relay compressed JPEG frame to every desktop client except the sender
  socket.on('phone-frame', data => {
    socket.compress(true).broadcast.emit('phone-frame', data)
  })

  // Phone requests camera swap (phone ↔ laptop base/overlay roles)
  socket.on('phone-swap', () => {
    socket.broadcast.emit('phone-swap')
    console.log(`[phone]      camera swap requested`)
  })

  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`)
    if (socket.id === phoneSocketId) {
      phoneSocketId = null
      io.emit('phone-disconnected')
      console.log('[phone]      left — notifying all desktops')
    }
  })
})

const PORT  = process.env.PORT || 3000
const proto = (() => { try { readFileSync(join(__dirname, 'cert.key')); return 'https' } catch { return 'http' } })()

server.listen(PORT, () => {
  const ip = getLocalIP()
  console.log('\n  In Between the Stills')
  console.log(`  Desktop : ${proto}://localhost:${PORT}`)
  console.log(`  Phone   : ${proto}://${ip}:${PORT}/mobile`)
  if (proto === 'https') console.log('  ↑ tap "Advanced → Proceed" to accept the self-signed cert')
  console.log()
})
