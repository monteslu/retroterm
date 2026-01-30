import { readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { open } from 'yauzl';

// Supported ROM extensions (from retroemu)
const ROM_EXTENSIONS = new Set([
  '.nes', '.fds', '.unf', '.unif',           // NES
  '.sfc', '.smc',                             // SNES
  '.gb', '.gbc', '.gba',                      // Game Boy
  '.md', '.gen', '.smd', '.bin',              // Genesis
  '.sms', '.gg', '.sg',                       // Master System / Game Gear
  '.a26', '.a52', '.a78',                     // Atari consoles
  '.xex', '.atr', '.atx', '.bas', '.car', '.xfd',  // Atari computers
  '.lnx', '.o',                               // Lynx
  '.pce', '.cue', '.ccd', '.chd',             // PC Engine
  '.ngp', '.ngc',                             // Neo Geo Pocket
  '.ws', '.wsc',                              // WonderSwan
  '.col',                                     // ColecoVision
  '.vec',                                     // Vectrex
  '.tzx', '.z80', '.sna',                     // ZX Spectrum
  '.mx1', '.mx2', '.rom', '.dsk', '.cas',     // MSX
  '.iso', '.pbp', '.m3u',                      // PlayStation
]);

const SYSTEM_NAMES = {
  '.nes': 'NES', '.fds': 'NES', '.unf': 'NES', '.unif': 'NES',
  '.sfc': 'SNES', '.smc': 'SNES',
  '.gb': 'Game Boy', '.gbc': 'Game Boy Color', '.gba': 'Game Boy Advance',
  '.md': 'Genesis', '.gen': 'Genesis', '.smd': 'Genesis', '.bin': 'Genesis',
  '.sms': 'Master System', '.gg': 'Game Gear', '.sg': 'SG-1000',
  '.a26': 'Atari 2600', '.a52': 'Atari 5200', '.a78': 'Atari 7800',
  '.xex': 'Atari 800', '.atr': 'Atari 800', '.atx': 'Atari 800',
  '.bas': 'Atari 800', '.car': 'Atari 800', '.xfd': 'Atari 800',
  '.lnx': 'Lynx', '.o': 'Lynx',
  '.pce': 'PC Engine', '.cue': 'PC Engine', '.ccd': 'PC Engine', '.chd': 'PC Engine',
  '.ngp': 'Neo Geo Pocket', '.ngc': 'Neo Geo Pocket Color',
  '.ws': 'WonderSwan', '.wsc': 'WonderSwan Color',
  '.col': 'ColecoVision',
  '.vec': 'Vectrex',
  '.tzx': 'ZX Spectrum', '.z80': 'ZX Spectrum', '.sna': 'ZX Spectrum',
  '.mx1': 'MSX', '.mx2': 'MSX', '.rom': 'MSX', '.dsk': 'MSX', '.cas': 'MSX',
  '.iso': 'PlayStation', '.pbp': 'PlayStation', '.m3u': 'PlayStation',
  '.zip': 'Archive',
};

export class RomScanner {
  constructor(romsDir) {
    this.romsDir = romsDir;
  }

  async scan() {
    const roms = [];
    await this._scanDir(this.romsDir, roms);
    return roms.sort((a, b) => a.name.localeCompare(b.name));
  }

  async _scanDir(dir, roms, depth = 0) {
    if (depth > 3) return; // Don't recurse too deep

    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;

        const fullPath = join(dir, entry);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            await this._scanDir(fullPath, roms, depth + 1);
          } else if (stat.isFile()) {
            const ext = extname(entry).toLowerCase();
            if (ext === '.zip') {
              // Peek inside ZIP to find ROMs
              const zipRoms = await this._scanZip(fullPath);
              roms.push(...zipRoms);
            } else if (ROM_EXTENSIONS.has(ext)) {
              roms.push({
                name: basename(entry, ext),
                path: fullPath,
                ext,
                system: SYSTEM_NAMES[ext] || 'Unknown',
              });
            }
          }
        } catch {
          // Skip inaccessible files
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  async _scanZip(zipPath) {
    const roms = [];

    try {
      const zipfile = await new Promise((resolve, reject) => {
        open(zipPath, { lazyEntries: true }, (err, zf) => {
          if (err) reject(err);
          else resolve(zf);
        });
      });

      const zipName = basename(zipPath, extname(zipPath));

      await new Promise((resolve) => {
        zipfile.on('entry', (entry) => {
          const ext = extname(entry.fileName).toLowerCase();
          if (ROM_EXTENSIONS.has(ext) && !entry.fileName.startsWith('__MACOSX')) {
            let romName = basename(entry.fileName, ext);
            // If the inner file has a generic/numeric name, use the zip filename instead
            if (/^\d+$/.test(romName) || romName.length < 3) {
              romName = zipName;
            }
            roms.push({
              name: romName,
              path: zipPath,
              zipEntry: entry.fileName,
              ext,
              system: SYSTEM_NAMES[ext] || 'Unknown',
            });
          }
          zipfile.readEntry();
        });

        zipfile.on('end', resolve);
        zipfile.readEntry();
      });

      zipfile.close();
    } catch {
      // Skip unreadable ZIPs
    }

    return roms;
  }

  getSystemGroups(roms) {
    const groups = {};
    for (const rom of roms) {
      if (!groups[rom.system]) {
        groups[rom.system] = [];
      }
      groups[rom.system].push(rom);
    }
    return groups;
  }
}
