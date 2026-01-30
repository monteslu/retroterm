# retroterm

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

### Controls

| Key | Action |
|-----|--------|
| `Enter` | Launch selected game |
| `j` / `k` or arrows | Navigate list |
| `A` | Show all ROMs |
| `R` | Show recent games |
| `S` | Settings |
| `F5` | Refresh ROM list |
| `Q` | Quit |

## Configuration

Settings are stored in `~/.config/retroterm/config.json`:

```json
{
  "romsDir": "/home/user/roms",
  "savesDir": "/home/user/.config/retroterm/saves",
  "recentGames": [],
  "maxRecent": 10
}
```

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

| Mode | Quality | Bandwidth | Best For |
|------|---------|-----------|----------|
| `half-block-256` | Chunky pixels | Lowest | Retro games (default) |
| `block-256` | Smooth shading | Medium | When detail matters |
| `ascii-256` | Textured | Medium | Aesthetic preference |
| `braille` | Dot matrix | Tiny | Monochrome games |

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
