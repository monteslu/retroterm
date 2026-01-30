# Remote Play Network Architecture

## Overview

P2P couch co-op over the internet. Player 1 hosts, Player 2 joins with a code. No accounts, no installs, just `npx retroterm`.

The emulator has no idea it's networked - it just sees two controllers. hsync + WebRTC is "a very long couch."

## UX Flow

```bash
# Player 1 (Host)
archie$ npx retroterm
> Host Game > RC Pro Am
Share code: KWDF-3RMT

# Player 2 (Join)
jughead$ npx retroterm --join KWDF-3RMT
Connecting...
[Game appears, playing as P2]

# Spectator (Watch)
betty$ npx retroterm --watch KWDF-3RMT
[Just watching, no input]
```

## Share Code Format

Base24 alphabet - case-insensitive, no visually ambiguous characters:

```
3 4 6 7 9 A C D E F G H J K M N P R T U V W X Y
```

Removes: 0/O, 1/I/L, 2/Z, 5/S, 8/B

- 24^8 = **110 billion combinations**
- Format: `XXXX-XXXX` (easy to read aloud)
- Ephemeral - code exists only while hosting
- No fuzzy matching needed - invalid chars are just invalid

## Protocol

### Packet Types (MQTT framing over WebRTC data channel)

**P1 → P2 (Host to Guest/Watcher):**
| Topic | Payload | Rate | Bandwidth |
|-------|---------|------|-----------|
| `video` | ANSI frame | ~30fps | 20-100 KB/sec |
| `audio` | Opus chunk | continuous | 1-4 KB/sec |

**P2 → P1 (Guest to Host):**
| Topic | Payload | Rate | Bandwidth |
|-------|---------|------|-----------|
| `input` | 7 bytes gamepad state | 60Hz | 420 bytes/sec |
| `heartbeat` | ping | 1/sec | ~10 bytes/sec |

### Gamepad State (7 bytes)

```javascript
const buf = new Uint8Array(7);
buf[0] = buttons0_7;    // buttons 0-7 as bits
buf[1] = buttons8_15;   // buttons 8-15 as bits
buf[2] = button16;      // button 16 + spare bits
buf[3] = axisLX;        // int8 (-128 to 127)
buf[4] = axisLY;        // int8
buf[5] = axisRX;        // int8
buf[6] = axisRY;        // int8
```

### Total Bandwidth

| Direction | Content | Bandwidth |
|-----------|---------|-----------|
| P1 → P2 | Video + Audio | ~25-105 KB/sec |
| P2 → P1 | Input + Heartbeat | ~0.5 KB/sec |

## Security Model

- **TLS to hsync server** - verified connection, no MITM
- **Code = authentication** - 1 in 110 billion chance of guessing
- **Ephemeral** - code only exists while hosting
- **DTLS data channel** - encrypted P2P (WebRTC default)
- **No accounts** - no passwords, no metadata, no tracking

## Connection Lifecycle

### Connecting
1. Host calls `hsync.dynamicConnect()` → gets hostname/code
2. Guest calls `getRPCPeer(hostCode)` then `peer.connectRTC()`
3. WebRTC data channel established (~3KB signaling)
4. Host starts sending video/audio frames
5. Guest starts sending gamepad state

### Disconnecting
- P2 disconnect: P1 keeps playing, controller 2 reverts to local input
- P2 reconnect: just starts receiving stream again, no handshake
- No interruption to game - true drop-in/drop-out
- Heartbeat timeout (3-5 sec) detects dead connections

## hsync Integration

```javascript
import { dynamicConnect } from 'hsync';

// Host
const con = await dynamicConnect();
const code = con.webUrl; // https://KWDF3RMT.hsync.tech

// Wait for peer
con.on('peerConnected', (peer) => {
  peer.rtcEvents.on('jsonMsg', (msg) => {
    if (msg.topic === 'input') handleP2Input(msg.data);
  });

  // Send frames
  videoOutput.onFrame = (ansi) => {
    peer.packAndSend('video', ansi);
  };
});

// Guest
const peer = con.getRPCPeer({ hostName: code });
await peer.connectRTC();

peer.rtcEvents.on('jsonMsg', (msg) => {
  if (msg.topic === 'video') renderFrame(msg.data);
  if (msg.topic === 'audio') playAudio(msg.data);
});

// Send input at 60Hz
setInterval(() => {
  peer.packAndSend('input', serializeGamepad());
}, 16);
```

## Audio Pipeline

```
libretro PCM (16-bit 44.1kHz stereo)
    ↓
downsample to 24kHz mono
    ↓
opus-wasm encode (8-16 kbps)
    ↓
~1-2 KB/sec over data channel
    ↓
opus-wasm decode
    ↓
play via speaker lib
```

Lo-fi audio is part of the charm. Crispy 8kbps mono = walkie-talkie vibes.

## Future: AI Upscaling

Client-side upscaling option:
1. Host sends chunky ANSI (low bandwidth)
2. Guest receives frames
3. Guest's GPU runs AI upscale locally

Models trained on retro game art:
- `nes-upscale.onnx`
- `snes-upscale.onnx`
- `genesis-upscale.onnx`

Settings toggle:
- "Authentic" - raw ASCII chunks
- "Enhanced" - AI smoothed HD

## Tasks

### hsync Server Changes
- [ ] Implement base24 code generation (no ambiguous chars)
- [ ] Custom peer matching endpoint for game codes
- [ ] Code expiration/cleanup when host disconnects
- [ ] Rate limiting on code generation

### retroterm Changes
- [ ] Add `--join <code>` CLI flag
- [ ] Add `--watch <code>` CLI flag
- [ ] "Host Game" option in launcher UI
- [ ] Display share code when hosting
- [ ] RemotePlay.js module for hsync/peer management

### retroemu Changes
- [ ] Hook video output to capture ANSI frames for streaming
- [ ] Hook AudioBridge to capture PCM for encoding
- [ ] Accept P2 input injection into InputManager
- [ ] Support multiple input sources per controller slot

### Audio Streaming
- [ ] Integrate opus-wasm for encoding (host)
- [ ] Integrate opus-wasm for decoding (guest)
- [ ] Audio playback on guest (speaker lib or similar)
- [ ] Downsample/mono conversion pipeline

### Spectator Mode
- [ ] Watch-only connection type (no input sent)
- [ ] Multiple watchers per host
- [ ] Watcher count display for host

### Future/Nice-to-have
- [ ] AI upscaling models for retro games
- [ ] Per-console upscale models
- [ ] Bandwidth/quality settings
- [ ] Latency stats display
- [ ] Recording/replay support

## Why This Works

- **Terminal rendering** - ANSI is text, not video. Massive bandwidth savings.
- **P2P** - Server only does signaling (~3KB), then out of the loop.
- **Ephemeral codes** - No accounts, no tracking, no attack surface.
- **Emulator stays pure** - No netcode, no rollback, just two controllers.
- **Zero install** - `npx retroterm --join CODE` and you're in.

## Why No One Did This Before

1. "Game streaming = H.264" mindset - no one thought to send text
2. "Terminal = for devs" - not seen as gaming platform
3. "WebRTC = complex" - it's actually just 3KB handshake
4. Pieces existed separately, no one combined them

## Scaling

hsync server handles only signaling. Video/audio/input all P2P.

| Metric | Traditional Streaming | This Approach |
|--------|----------------------|---------------|
| Server bandwidth | ALL video | ~3KB/session |
| Cost scales with | viewer-minutes | connections only |
| 4 hour session cost | $$$ | same as 4 seconds |

Could serve millions on a $5/month VPS.
