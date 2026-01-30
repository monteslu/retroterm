#!/usr/bin/env node

import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets', 'systems');

const BASE_URL = 'https://raw.githubusercontent.com/RetroPie/es-theme-carbon/master';

// Map our system names to carbon theme folder names
const SYSTEM_MAP = {
  'NES': 'nes',
  'SNES': 'snes',
  'Game Boy': 'gb',
  'Game Boy Color': 'gbc',
  'Game Boy Advance': 'gba',
  'Genesis': 'genesis',
  'Master System': 'mastersystem',
  'Game Gear': 'gamegear',
  'SG-1000': 'sg-1000',
  'Atari 2600': 'atari2600',
  'Atari 5200': 'atari5200',
  'Atari 7800': 'atari7800',
  'Atari 800': 'atari800',
  'Lynx': 'atarilynx',
  'PC Engine': 'pcengine',
  'Neo Geo Pocket': 'ngp',
  'Neo Geo Pocket Color': 'ngpc',
  'WonderSwan': 'wonderswan',
  'WonderSwan Color': 'wonderswancolor',
  'ColecoVision': 'colecovision',
  'Vectrex': 'vectrex',
  'ZX Spectrum': 'zxspectrum',
  'MSX': 'msx',
  'PlayStation': 'psx',
};

const WIDTH = 200; // Output width for horizontal logos
const HEIGHT = 60; // Output height

async function downloadAndConvert(systemName, carbonName) {
  const url = `${BASE_URL}/${carbonName}/art/system.svg`;
  const outPath = join(ASSETS_DIR, `${systemName}.png`);

  // Delete existing to re-download
  if (existsSync(outPath)) {
    await import('fs/promises').then(fs => fs.unlink(outPath));
  }

  try {
    console.log(`  Downloading ${carbonName}/art/system.svg...`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    // Convert SVG to PNG and resize for horizontal banner
    await sharp(buffer, { density: 150 })
      .resize(WIDTH, HEIGHT, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);

    console.log(`  ✓ ${systemName}`);
  } catch (err) {
    console.error(`  ✗ ${systemName}: ${err.message}`);
  }
}

async function main() {
  console.log('Downloading system artwork from canvas-es...\n');

  // Ensure assets directory exists
  await mkdir(ASSETS_DIR, { recursive: true });

  for (const [systemName, canvasName] of Object.entries(SYSTEM_MAP)) {
    await downloadAndConvert(systemName, canvasName);
  }

  console.log('\nDone!');
}

main();
