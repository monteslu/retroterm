import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.config', 'retroterm');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULTS = {
  romsDir: join(homedir(), 'roms'),
  savesDir: join(homedir(), '.config', 'retroterm', 'saves'),
  recentGames: [],
  maxRecent: 10,
  // Graphics settings (3 independent options)
  symbols: 'ascii+block',   // block, half, ascii, ascii+block, solid, stipple, quad, sextant, octant, braille
  colors: '256',      // true, 256, 16, 2
  fgOnly: true,       // foreground color only (black background)
  dither: false,      // Floyd-Steinberg dithering
  contrast: 5,        // 1-10, where 5 = 1.0 (normal)
};

export class Preferences {
  constructor() {
    this.config = { ...DEFAULTS };
    this.load();
  }

  load() {
    try {
      const data = readFileSync(CONFIG_FILE, 'utf-8');
      this.config = { ...DEFAULTS, ...JSON.parse(data) };
    } catch {
      // No config file yet, use defaults
    }
  }

  save() {
    try {
      mkdirSync(CONFIG_DIR, { recursive: true });
      writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (err) {
      // Ignore save errors
    }
  }

  get(key) {
    return this.config[key];
  }

  set(key, value) {
    this.config[key] = value;
    this.save();
  }

  addRecentGame(romPath) {
    const recent = this.config.recentGames.filter(p => p !== romPath);
    recent.unshift(romPath);
    this.config.recentGames = recent.slice(0, this.config.maxRecent);
    this.save();
  }
}
