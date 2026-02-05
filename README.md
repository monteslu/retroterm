# retroterm

[![NPM](https://img.shields.io/npm/v/retroterm.svg)](https://www.npmjs.com/package/retroterm)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Terminal-based retro game launcher. A blessed TUI frontend for [retroemu](https://github.com/monteslu/retroemu).

- **ROM browser** — Scans your ROMs directory and organizes by system
- **Recent games** — Quick access to recently played games
- **Keyboard navigation** — vim-style controls
- **Preferences** — Configurable ROMs and saves directories
```
retroterm
```

## Installation

```bash
npm install -g retroterm
```

This will also install `retroemu` as a dependency.

## Usage

Just run `retroterm` to launch the browser:

```bash
retroterm
```

On first run, press `S` to configure your ROMs directory.

### Keyboard Controls

| Key | Action |
|-----|--------|
| `Enter` | Launch selected game |
| `↑` / `↓` or `j` / `k` | Navigate list |
| `←` / `→` | Switch system |
| `A` | Show all ROMs (current system) |
| `R` | Show recent games |
| `S` | Settings |
| `F5` | Refresh ROM list |
| `Q` | Quit |

### Gamepad Controls

| Button | Action |
|--------|--------|
| D-pad / Left Stick | Navigate |
| A (south) | Launch game |
| B (east) | Back to system view |
| X (west) | Recent games |
| Y (north) | Settings |
| LB / RB | Page up/down |
| Start | Launch game |

## Configuration

Settings are stored in `~/.config/retroterm/config.json`:

```json
{
  "romsDir": "/home/user/roms",
  "savesDir": "/home/user/.config/retroterm/saves",
  "recentGames": [],
  "maxRecent": 10,
  "symbols": "block",
  "colors": "256",
  "fgOnly": true,
  "dither": false,
  "contrast": 5
}
```

### Graphics Settings

Press `Y` (gamepad) or `S` (keyboard) to open settings. Graphics are controlled by 3 independent options:

**Symbols** — Character set for rendering:
- `block` — Full block characters (default)
- `half` — Vertical half blocks
- `ascii` — ASCII printable characters
- `solid` — Space + background color only
- `stipple` — Shading characters (░▒▓)
- `quad` — 2x2 quadrant blocks
- `sextant` — 2x3 sextant blocks (highest resolution)
- `octant` — 2x4 octant blocks
- `braille` — Braille dot patterns (great for B&W)

**Colors** — Color depth:
- `true` — True color (16M colors)
- `256` — 256 indexed colors (default)
- `16` — 16 ANSI colors
- `2` — Black & white

**Checkboxes:**
- `FG Only` — Foreground color only, black background (default: on)
- `Dither` — Floyd-Steinberg dithering (default: off)

**Contrast** — Slider from 1-10 (5 = normal)

## Supported Systems

retroterm supports all systems that retroemu supports:

- **Nintendo** — NES, SNES, Game Boy, Game Boy Color, Game Boy Advance
- **Sega** — Genesis, Master System, Game Gear, SG-1000
- **Atari** — 2600, 5200, 7800, 800/XL/XE, Lynx
- **NEC** — TurboGrafx-16 / PC Engine
- **SNK** — Neo Geo Pocket, Neo Geo Pocket Color
- **Bandai** — WonderSwan, WonderSwan Color
- **Other** — ColecoVision, Vectrex, ZX Spectrum, MSX

## Streaming / Remote Play

retroterm can stream games over the network using a custom binary protocol optimized for terminal output.

### Recommended Settings

| Terminal Size | Virtual Resolution | Bandwidth (30 FPS) |
|---------------|-------------------|-------------------|
| 60 rows | 160×120 | ~600 KB/s (4.8 Mbps) |
| 120 rows | 320×240 (PS1 native) | ~2.3 MB/s (18 Mbps) |

### Render Modes

Combine symbols + colors for different effects:

| Symbols | Colors | Bandwidth | Best For |
|---------|--------|-----------|----------|
| `block` | `256` | Lower | Default, good compatibility |
| `block` | `true` | Medium | Modern terminals |
| `braille` | `2` | Lowest | Monochrome games |
| `sextant` | `true` | Higher | Maximum resolution |
| `ascii` | `256` | Medium | Retro aesthetic |

### Custom Binary Protocol

Instead of ANSI escape codes (~15 bytes/cell), use raw color indices:

```
[fg_index][bg_index][fg_index][bg_index]...  (2 bytes/cell)
```

Decode on client:
```javascript
output += `\x1b[38;5;${data[i]};48;5;${data[i+1]}m▀`;
```

**10x bandwidth reduction** vs standard ANSI output.

### Architecture Options

**Option A: WebRTC P2P** (current)
- Best latency, works peer-to-peer
- Requires signaling server for NAT traversal

**Option B: Simple WebSocket relay**
- Easier to deploy (single server)
- Works through all firewalls
- node-datachannel for optional WebRTC upgrade

## Dependencies

| Package | Purpose |
|---------|---------|
| [retroemu](https://github.com/monteslu/retroemu) | Terminal emulator engine with libretro WASM cores |
| [blessed](https://github.com/chjj/blessed) | Terminal UI library |
| [chafa-wasm](https://github.com/monteslu/chafa-wasm) | Image-to-ANSI conversion (SIMD-optimized fork) |

## License

MIT
