import blessed from 'blessed';
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { installNavigatorShim } from 'gamepad-node';
import { Preferences } from './Preferences.js';
import { RomScanner } from './RomScanner.js';
import initChafa from '@monteslu/chafa-wasm';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, '..', 'assets', 'systems');

// Chafa constants
const CHAFA_SYMBOL_TAG_SPACE = 0x1;
const CHAFA_SYMBOL_TAG_BLOCK = 0x8;
const CHAFA_CANVAS_MODE_TRUECOLOR = 0;

export class Launcher {
  constructor() {
    this.prefs = new Preferences();
    this.screen = null;
    this.romList = null;
    this.statusBar = null;
    this.controllerBox = null;
    this.systemArtBox = null;
    this.chafa = null;
    this.roms = [];
    this.sortedRoms = null;
    this.systems = []; // Available systems
    this.systemRoms = {}; // ROMs grouped by system
    this.currentSystemIndex = 0;
    this._lastSelected = 0;
    this.currentView = 'system'; // 'system' or 'recent'
    this.gamepadManager = null;
    this.gamepadPollInterval = null;
    this._settingsOpen = false;
  }

  async start() {
    // Initialize chafa for image rendering
    if (!this.chafa) {
      this.chafa = await initChafa();
    }

    // Initialize gamepad support
    this.gamepadManager = installNavigatorShim();

    this.screen = blessed.screen({
      smartCSR: true,
      title: 'retroterm',
      fullUnicode: true,
    });

    this._createUI();
    this._loadRoms();
    this._setupKeys();
    this._startControllerPolling();

    this.screen.render();
  }

  _createUI() {
    // System logo box (horizontal banner)
    this.systemArtBox = blessed.box({
      top: 0,
      left: 0,
      width: 40,
      height: 5,
      tags: true,
    });

    // System info (right of logo)
    this.systemTitle = blessed.box({
      top: 0,
      left: 40,
      width: '100%-40',
      height: 5,
      tags: true,
      padding: { left: 1, top: 1 },
      content: '{bold}{cyan-fg}RETROTERM{/}',
    });

    // ROM list
    this.romList = blessed.list({
      top: 5,
      left: 0,
      width: '50%',
      bottom: 3,
      border: { type: 'line' },
      style: {
        border: { fg: 'blue' },
        selected: { bg: 'blue', fg: 'white', bold: true },
        item: { fg: 'white' },
      },
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: ' ',
        style: { bg: 'blue' },
      },
      tags: true,
    });

    // Info panel (for game details and eventually cover art)
    this.infoPanel = blessed.box({
      top: 0,
      right: 0,
      width: '50%',
      bottom: 9,
      border: { type: 'line' },
      style: { border: { fg: 'green' } },
      tags: true,
      padding: { left: 1, right: 1 },
      content: '{gray-fg}Select a game{/}',
    });

    // Controller status
    this.controllerBox = blessed.box({
      right: 0,
      bottom: 3,
      width: '50%',
      height: 6,
      border: { type: 'line' },
      style: { border: { fg: 'magenta' } },
      tags: true,
      padding: { left: 1, right: 1 },
      content: '{gray-fg}Scanning controllers...{/}',
    });

    // Status bar
    this.statusBar = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'gray' } },
      tags: true,
      content: ' {bold}A{/} Play  {bold}←→{/} System  {bold}↑↓{/} Browse  {bold}LB/RB{/} Page  {bold}X{/} Recent  {bold}Y{/} Settings  {bold}Q{/} Quit',
    });

    this.screen.append(this.systemArtBox);
    this.screen.append(this.systemTitle);
    this.screen.append(this.romList);
    this.screen.append(this.infoPanel);
    this.screen.append(this.controllerBox);
    this.screen.append(this.statusBar);

    this.romList.focus();

    // Update info panel on selection
    this.romList.on('select item', (item, index) => {
      this._lastSelected = index;
      this._updateInfoPanel(index);
    });
  }

  async _loadRoms() {
    const romsDir = this.prefs.get('romsDir');

    if (!existsSync(romsDir)) {
      this.romList.setItems(['{yellow-fg}ROMs directory not found{/}', '', `{gray-fg}${romsDir}{/}`, '', '{white-fg}Press S to configure{/}']);
      this.roms = [];
      this.screen.render();
      return;
    }

    this.romList.setItems(['{cyan-fg}Scanning ROMs...{/}']);
    this.screen.render();

    const scanner = new RomScanner(romsDir);
    this.roms = await scanner.scan();

    if (this.roms.length === 0) {
      this.romList.setItems(['{yellow-fg}No ROMs found{/}', '', `{gray-fg}${romsDir}{/}`, '', '{white-fg}Press S to configure{/}']);
    } else {
      this._groupRomsBySystem();
      this._showCurrentSystem();
    }

    this.screen.render();
  }

  _groupRomsBySystem() {
    // Group by system, then alphabetize within each group
    this.systemRoms = {};
    for (const rom of this.roms) {
      if (!this.systemRoms[rom.system]) {
        this.systemRoms[rom.system] = [];
      }
      this.systemRoms[rom.system].push(rom);
    }

    // Sort systems alphabetically, sort ROMs within each system
    this.systems = Object.keys(this.systemRoms).sort();
    for (const system of this.systems) {
      this.systemRoms[system].sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  _showCurrentSystem() {
    this.currentView = 'system';

    if (this.systems.length === 0) return;

    const system = this.systems[this.currentSystemIndex];
    const roms = this.systemRoms[system];
    this.sortedRoms = roms;

    const items = roms.map(rom => rom.name);
    this.romList.setItems(items);
    this.romList.select(0);

    // Update system title
    this.systemTitle.setContent(
      `{bold}{yellow-fg}${system}{/}\n` +
      `{white-fg}${roms.length} games{/}  {gray-fg}[${this.currentSystemIndex + 1}/${this.systems.length}]{/}`
    );

    // Render system art (async, will update when done)
    this._renderSystemArt(system);

    this._updateInfoPanel(0);
    this.screen.render();
  }

  async _renderSystemArt(system) {
    const artPath = join(ASSETS_DIR, `${system}.png`);
    if (!existsSync(artPath) || !this.chafa) {
      this.systemArtBox.setContent('');
      return;
    }

    try {
      // Decode image with sharp
      const { data, info } = await sharp(artPath)
        .raw()
        .ensureAlpha()
        .toBuffer({ resolveWithObject: true });

      const chafa = this.chafa;

      // Set up chafa with block characters
      const symbolMap = chafa._chafa_symbol_map_new();
      chafa._chafa_symbol_map_add_by_tags(symbolMap, CHAFA_SYMBOL_TAG_SPACE | CHAFA_SYMBOL_TAG_BLOCK);

      const canvasConfig = chafa._chafa_canvas_config_new();
      chafa._chafa_canvas_config_set_geometry(canvasConfig, 36, 6); // 3 rows with half-blocks
      chafa._chafa_canvas_config_set_canvas_mode(canvasConfig, CHAFA_CANVAS_MODE_TRUECOLOR);
      chafa._chafa_canvas_config_set_symbol_map(canvasConfig, symbolMap);

      const canvas = chafa._chafa_canvas_new(canvasConfig);

      // Copy RGBA data to heap
      const dataPtr = chafa._malloc(data.length);
      chafa.HEAPU8.set(data, dataPtr);

      // Set canvas contents
      chafa._chafa_canvas_set_contents_rgba8(canvas, dataPtr, info.width, info.height, info.width * 4);
      chafa._free(dataPtr);

      // Get ANSI output
      const gsPtr = chafa._chafa_canvas_build_ansi(canvas);
      const strPtr = chafa._g_string_free_and_steal(gsPtr);
      const ansi = chafa.UTF8ToString(strPtr);
      chafa._free(strPtr);

      // Cleanup
      chafa._chafa_canvas_unref(canvas);
      chafa._chafa_canvas_config_unref(canvasConfig);
      chafa._chafa_symbol_map_unref(symbolMap);

      // Trim any trailing newlines to prevent clipping
      this.systemArtBox.setContent(ansi.trimEnd());
      this.screen.render();
    } catch (err) {
      this.systemArtBox.setContent('');
    }
  }

  _showRecentRoms() {
    this.currentView = 'recent';
    const recent = this.prefs.get('recentGames');
    const recentRoms = recent
      .map(path => this.roms.find(r => r.path === path))
      .filter(r => r);

    this.sortedRoms = recentRoms;

    if (recentRoms.length === 0) {
      this.romList.setItems(['{gray-fg}No recent games{/}']);
      this.sortedRoms = [];
    } else {
      const items = recentRoms.map(rom => `{cyan-fg}[${rom.system}]{/} ${rom.name}`);
      this.romList.setItems(items);
    }

    // Update header for recent view
    this.systemTitle.setContent(
      `{bold}{magenta-fg}Recent Games{/}\n` +
      `{white-fg}${recentRoms.length} games{/}`
    );
    this.systemArtBox.setContent('');

    this.romList.select(0);
    this._updateInfoPanel(0);
    this.screen.render();
  }

  _updateInfoPanel(index) {
    const rom = this._getSelectedRom(index);
    if (!rom) {
      this.infoPanel.setContent('{gray-fg}Select a game{/}');
      this.screen.render();
      return;
    }

    const lines = [
      `{bold}{white-fg}${rom.name}{/}`,
      '',
      `{cyan-fg}System:{/} ${rom.system}`,
      `{cyan-fg}File:{/} ${rom.ext}`,
    ];

    if (rom.zipEntry) {
      lines.push(`{cyan-fg}In ZIP:{/} ${rom.zipEntry}`);
    }

    lines.push('', `{gray-fg}${rom.path}{/}`);

    this.infoPanel.setContent(lines.join('\n'));
    this.screen.render();
  }

  _getSelectedRom(index) {
    return this.sortedRoms ? this.sortedRoms[index] : null;
  }

  _setupKeys() {
    // Quit
    this.screen.key(['q', 'C-c'], () => {
      if (this._settingsOpen) return;
      process.exit(0);
    });

    // Launch game
    this.romList.key(['enter'], () => {
      if (this._settingsOpen) return;
      const index = this.romList.selected;
      const rom = this._getSelectedRom(index);
      if (rom) {
        this._launchGame(rom);
      }
    });

    // View toggles
    this.screen.key(['a'], () => {
      if (this._settingsOpen) return;
      this._showCurrentSystem();
    });

    // Left/Right arrow keys for system navigation
    this.screen.key(['left'], () => {
      if (this._settingsOpen) return;
      this._navigatePrevSystem();
    });
    this.screen.key(['right'], () => {
      if (this._settingsOpen) return;
      this._navigateNextSystem();
    });

    this.screen.key(['r'], () => {
      if (this._settingsOpen) return;
      this._showRecentRoms();
    });

    // Settings
    this.screen.key(['s'], () => {
      if (this._settingsOpen) return;
      this._showSettings();
    });

    // Refresh
    this.screen.key(['f5'], () => {
      if (this._settingsOpen) return;
      this._loadRoms();
    });
  }

  _launchGame(rom) {
    this.prefs.addRecentGame(rom.path);

    // Stop controller polling and clean up
    this._stopControllerPolling();
    if (this.gamepadManager && this.gamepadManager.destroy) {
      try {
        this.gamepadManager.destroy();
      } catch {
        // Ignore cleanup errors
      }
    }

    // Hide the screen and launch retroemu
    this.screen.destroy();

    const args = [rom.path];

    // Graphics options
    const symbols = this.prefs.get('symbols');
    const colors = this.prefs.get('colors');
    const fgOnly = this.prefs.get('fgOnly');
    const dither = this.prefs.get('dither');

    args.push('--symbols', symbols);
    args.push('--colors', colors);
    if (fgOnly) args.push('--fg-only');
    if (dither) args.push('--dither');

    // Convert 1-10 slider to contrast value (1=0.5, 5=1.0, 10=2.0)
    const contrastSlider = this.prefs.get('contrast') || 5;
    const contrastValue = 0.5 + (contrastSlider - 1) * (1.5 / 9);
    if (contrastValue !== 1.0) {
      args.push('--contrast', contrastValue.toFixed(2));
    }

    // Resolve retroemu CLI path regardless of hoisting
    const retroemuCliPath = fileURLToPath(import.meta.resolve('retroemu/bin/cli.js'));
    const child = spawn(process.execPath, [retroemuCliPath, ...args], {
      stdio: 'inherit',
    });

    child.on('close', () => {
      // Give SDL time to clean up before reinitializing
      setTimeout(() => this.start(), 500);
    });
  }

  _showSettings() {
    this._settingsOpen = true;

    // Load current settings
    const currentSymbols = this.prefs.get('symbols');
    const currentColors = this.prefs.get('colors');
    const currentFgOnly = this.prefs.get('fgOnly');
    const currentDither = this.prefs.get('dither');
    const currentContrast = this.prefs.get('contrast');

    const form = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '70%',
      height: 22,
      border: { type: 'line' },
      style: { border: { fg: 'yellow' } },
    });

    blessed.text({
      parent: form,
      top: 0,
      left: 2,
      content: '{bold}Settings{/}',
      tags: true,
    });

    // ROMs Directory
    blessed.text({
      parent: form,
      top: 2,
      left: 2,
      content: 'ROMs Directory:',
    });

    const romsInput = blessed.textbox({
      parent: form,
      top: 3,
      left: 2,
      right: 2,
      height: 3,
      border: { type: 'line' },
      style: {
        border: { fg: 'blue' },
        focus: { border: { fg: 'green' } },
      },
      inputOnFocus: true,
      value: this.prefs.get('romsDir'),
    });

    // Symbols selection
    const SYMBOLS = ['block', 'half', 'ascii', 'ascii+block', 'solid', 'stipple', 'quad', 'sextant', 'octant', 'braille'];
    const SYMBOL_LABELS = {
      'block': 'Block ▀▄█',
      'half': 'Half ▀▄',
      'ascii': 'ASCII @#%',
      'ascii+block': 'ASCII+Block',
      'solid': 'Solid (BG)',
      'stipple': 'Stipple ░▒▓',
      'quad': 'Quad 2x2',
      'sextant': 'Sextant 2x3',
      'octant': 'Octant 2x4',
      'braille': 'Braille ⠿⡿',
    };

    blessed.text({ parent: form, top: 7, left: 2, content: 'Symbols:' });

    let selectedSymbols = currentSymbols;
    const symbolsBox = blessed.box({
      parent: form,
      top: 8,
      left: 2,
      width: 20,
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'blue' } },
      tags: true,
      content: ` ${SYMBOL_LABELS[selectedSymbols] || 'Block ▀▄█'}`,
    });

    const toggleSymbols = (delta = 1) => {
      const idx = SYMBOLS.indexOf(selectedSymbols);
      selectedSymbols = SYMBOLS[(idx + delta + SYMBOLS.length) % SYMBOLS.length];
      symbolsBox.setContent(` ${SYMBOL_LABELS[selectedSymbols]}`);
      this.screen.render();
    };

    // Colors selection
    const COLORS = ['true', '256', '16', '2'];
    const COLOR_LABELS = {
      'true': 'True Color',
      '256': '256 Colors',
      '16': '16 Colors',
      '2': 'B&W',
    };

    blessed.text({ parent: form, top: 7, left: 24, content: 'Colors:' });

    let selectedColors = currentColors;
    const colorsBox = blessed.box({
      parent: form,
      top: 8,
      left: 24,
      width: 16,
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'blue' } },
      tags: true,
      content: ` ${COLOR_LABELS[selectedColors] || 'True Color'}`,
    });

    const toggleColors = (delta = 1) => {
      const idx = COLORS.indexOf(selectedColors);
      selectedColors = COLORS[(idx + delta + COLORS.length) % COLORS.length];
      colorsBox.setContent(` ${COLOR_LABELS[selectedColors]}`);
      this.screen.render();
    };

    // FG Only checkbox
    let selectedFgOnly = currentFgOnly;
    const fgOnlyBox = blessed.box({
      parent: form,
      top: 8,
      left: 42,
      width: 14,
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'blue' } },
      tags: true,
      content: selectedFgOnly ? ' [X] FG Only' : ' [ ] FG Only',
    });

    const toggleFgOnly = () => {
      selectedFgOnly = !selectedFgOnly;
      fgOnlyBox.setContent(selectedFgOnly ? ' [X] FG Only' : ' [ ] FG Only');
      this.screen.render();
    };

    // Dither checkbox
    let selectedDither = currentDither;
    const ditherBox = blessed.box({
      parent: form,
      top: 8,
      left: 58,
      width: 13,
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'blue' } },
      tags: true,
      content: selectedDither ? ' [X] Dither' : ' [ ] Dither',
    });

    const toggleDither = () => {
      selectedDither = !selectedDither;
      ditherBox.setContent(selectedDither ? ' [X] Dither' : ' [ ] Dither');
      this.screen.render();
    };

    // Contrast slider
    blessed.text({ parent: form, top: 12, left: 2, content: 'Contrast:' });

    let selectedContrast = currentContrast;

    const renderSlider = (value) => {
      const filled = '█'.repeat(value);
      const empty = '░'.repeat(10 - value);
      return ` ${filled}${empty} ${value}`;
    };

    const contrastBox = blessed.box({
      parent: form,
      top: 13,
      left: 2,
      width: 20,
      height: 3,
      border: { type: 'line' },
      style: { border: { fg: 'blue' } },
      tags: true,
      content: renderSlider(selectedContrast),
    });

    const adjustContrast = (delta) => {
      selectedContrast = Math.max(1, Math.min(10, selectedContrast + delta));
      contrastBox.setContent(renderSlider(selectedContrast));
      this.screen.render();
    };

    // Help text
    blessed.text({
      parent: form,
      top: 17,
      left: 2,
      content: '{white-fg}↑↓{/} field  {white-fg}←→{/} adjust/toggle  {white-fg}Space{/} toggle  {white-fg}Enter{/} save  {white-fg}Esc{/} cancel',
      tags: true,
    });

    // Field navigation
    const FIELDS = ['roms', 'symbols', 'colors', 'fgOnly', 'dither', 'contrast'];
    let focusedField = 'roms';

    const updateFieldStyles = () => {
      romsInput.style.border.fg = focusedField === 'roms' ? 'green' : 'blue';
      symbolsBox.style.border.fg = focusedField === 'symbols' ? 'green' : 'blue';
      colorsBox.style.border.fg = focusedField === 'colors' ? 'green' : 'blue';
      fgOnlyBox.style.border.fg = focusedField === 'fgOnly' ? 'green' : 'blue';
      ditherBox.style.border.fg = focusedField === 'dither' ? 'green' : 'blue';
      contrastBox.style.border.fg = focusedField === 'contrast' ? 'green' : 'blue';
      if (focusedField === 'roms') {
        romsInput.focus();
      } else {
        romsInput.cancel();  // Stop textbox from capturing input
      }
      this.screen.render();
    };

    const focusField = (field) => {
      focusedField = field;
      updateFieldStyles();
    };

    const focusNextField = () => {
      const idx = FIELDS.indexOf(focusedField);
      focusField(FIELDS[(idx + 1) % FIELDS.length]);
    };

    const focusPrevField = () => {
      const idx = FIELDS.indexOf(focusedField);
      focusField(FIELDS[(idx - 1 + FIELDS.length) % FIELDS.length]);
    };

    const handleLeftRight = (delta) => {
      if (focusedField === 'symbols') toggleSymbols(delta);
      else if (focusedField === 'colors') toggleColors(delta);
      else if (focusedField === 'fgOnly') toggleFgOnly();
      else if (focusedField === 'dither') toggleDither();
      else if (focusedField === 'contrast') adjustContrast(delta);
    };

    const handleToggle = () => {
      if (focusedField === 'symbols') toggleSymbols(1);
      else if (focusedField === 'colors') toggleColors(1);
      else if (focusedField === 'fgOnly') toggleFgOnly();
      else if (focusedField === 'dither') toggleDither();
    };

    focusField('roms');

    // Define handler first so closeForm/saveAndClose can remove it
    let screenKeyHandler;

    const closeForm = () => {
      this.screen.removeListener('keypress', screenKeyHandler);
      this._settingsOpen = false;
      this._settingsState = null;
      form.destroy();
      this.romList.focus();
      this.screen.render();
    };

    const saveAndClose = () => {
      this.screen.removeListener('keypress', screenKeyHandler);
      const newPath = romsInput.getValue().trim();
      if (newPath) {
        this.prefs.set('romsDir', newPath);
      }
      this.prefs.set('symbols', selectedSymbols);
      this.prefs.set('colors', selectedColors);
      this.prefs.set('fgOnly', selectedFgOnly);
      this.prefs.set('dither', selectedDither);
      this.prefs.set('contrast', selectedContrast);
      this._settingsOpen = false;
      this._settingsState = null;
      form.destroy();
      this._loadRoms();
      this.romList.focus();
    };

    // Store state for gamepad handling
    this._settingsState = {
      focusNextField,
      focusPrevField,
      handleLeftRight,
      handleToggle,
      closeForm,
      saveAndClose,
      getFocusedField: () => focusedField,
    };

    // Textbox needs its own handlers since inputOnFocus captures keys
    romsInput.key(['escape'], closeForm);
    romsInput.key(['tab', 'down'], focusNextField);
    romsInput.key(['up'], focusPrevField);
    romsInput.key(['enter'], saveAndClose);

    // Screen-level key handler for when textbox doesn't have focus
    screenKeyHandler = (ch, key) => {
      if (!this._settingsOpen) return;
      if (focusedField === 'roms') return; // Let textbox handle its own keys
      if (key.name === 'escape') closeForm();
      else if (key.name === 'enter') saveAndClose();
      else if (key.name === 'tab' || key.name === 'down') focusNextField();
      else if (key.name === 'up') focusPrevField();
      else if (key.name === 'space') handleToggle();
      else if (key.name === 'left') handleLeftRight(-1);
      else if (key.name === 'right') handleLeftRight(1);
    };
    this.screen.on('keypress', screenKeyHandler);

    this.screen.render();
  }

  _navigateUp() {
    const index = this.romList.selected - 1;
    if (index >= 0) {
      this.romList.select(index);
      this._updateInfoPanel(index);
      this.screen.render();
    }
  }

  _navigateDown() {
    const index = this.romList.selected + 1;
    const max = this.sortedRoms ? this.sortedRoms.length : 0;
    if (index < max) {
      this.romList.select(index);
      this._updateInfoPanel(index);
      this.screen.render();
    }
  }

  _navigatePrevSystem() {
    if (this.currentView !== 'system' || this.systems.length === 0) return;

    this.currentSystemIndex--;
    if (this.currentSystemIndex < 0) {
      this.currentSystemIndex = this.systems.length - 1;
    }
    this._showCurrentSystem();
  }

  _navigateNextSystem() {
    if (this.currentView !== 'system' || this.systems.length === 0) return;

    this.currentSystemIndex++;
    if (this.currentSystemIndex >= this.systems.length) {
      this.currentSystemIndex = 0;
    }
    this._showCurrentSystem();
  }

  _startControllerPolling() {
    // Track previous button states for edge detection
    this._prevButtons = {};
    // Track held time for repeat
    this._holdTime = {};
    // Wait for all buttons to be released before accepting input (prevents re-launch on resume)
    this._waitingForRelease = true;

    this.gamepadPollInterval = setInterval(() => {
      const gamepads = navigator.getGamepads().filter(gp => gp !== null);
      this._updateControllerStatus(gamepads);

      // Check if we're waiting for buttons to be released
      if (this._waitingForRelease && gamepads.length > 0) {
        const gp = gamepads[0];
        const anyPressed = gp.buttons.some(b => b?.pressed);
        if (!anyPressed) {
          this._waitingForRelease = false;
        }
        return; // Skip input handling until released
      }

      this._handleGamepadInput(gamepads);
    }, 16); // Poll at ~60Hz for responsive input
  }

  _stopControllerPolling() {
    if (this.gamepadPollInterval) {
      clearInterval(this.gamepadPollInterval);
      this.gamepadPollInterval = null;
    }
  }

  _updateControllerStatus(gamepads) {
    const symbols = this.prefs.get('symbols');
    const colors = this.prefs.get('colors');
    const fgOnly = this.prefs.get('fgOnly');
    const dither = this.prefs.get('dither');
    const fgMode = fgOnly ? 'fg' : 'fg+bg';
    const modeLine = `{cyan-fg}Mode:{/} ${symbols} ${colors} ${fgMode}${dither ? ' dither' : ''}`;

    if (gamepads.length === 0) {
      this.controllerBox.setContent(`{gray-fg}No controllers{/}\n{gray-fg}Keyboard: arrows + Enter{/}\n${modeLine}`);
    } else {
      const lines = gamepads.slice(0, 2).map((gp, i) => {
        const name = gp.id.length > 24 ? gp.id.substring(0, 24) + '...' : gp.id;
        return `{green-fg}P${i + 1}:{/} ${name}`;
      });
      if (gamepads.length > 2) {
        lines.push(`{gray-fg}+${gamepads.length - 2} more{/}`);
      }
      lines.push(modeLine);
      this.controllerBox.setContent(lines.join('\n'));
    }
    this.screen.render();
  }

  _handleGamepadInput(gamepads) {
    if (gamepads.length === 0) return;

    const now = Date.now();
    const gp = gamepads[0]; // Use first controller for navigation
    const buttons = gp.buttons;
    const prev = this._prevButtons;
    const hold = this._holdTime;

    // Helper: detect button press (edge detection only)
    const pressed = (idx) => {
      const isPressed = buttons[idx]?.pressed;
      const wasPressed = prev[idx];
      prev[idx] = isPressed;
      return isPressed && !wasPressed;
    };

    // Handle settings dialog input separately
    if (this._settingsOpen && this._settingsState) {
      const s = this._settingsState;

      // B button = close/cancel
      if (pressed(1)) {
        s.closeForm();
        return;
      }

      // A button or Start = save
      if (pressed(0) || pressed(9)) {
        s.saveAndClose();
        return;
      }

      // D-pad up/down = switch fields
      if (pressed(12)) {
        s.focusPrevField();
        return;
      }
      if (pressed(13)) {
        s.focusNextField();
        return;
      }

      // D-pad left/right = adjust current field
      if (pressed(14)) {
        s.handleLeftRight(-1);
        return;
      }
      if (pressed(15)) {
        s.handleLeftRight(1);
        return;
      }

      // X button = toggle current field
      if (pressed(2)) {
        s.handleToggle();
        return;
      }

      return; // Don't process normal navigation while settings open
    }

    // Helper: detect held with repeat (initial delay 300ms, then repeat every 80ms)
    const heldWithRepeat = (key, isActive) => {
      if (isActive) {
        if (!hold[key]) {
          hold[key] = now;
          return true; // First press
        }
        const elapsed = now - hold[key];
        if (elapsed > 300) {
          // Repeat phase - check if enough time for next repeat
          const repeatElapsed = (elapsed - 300) % 80;
          const prevRepeatElapsed = (elapsed - 300 - 16) % 80; // ~16ms ago
          if (repeatElapsed < prevRepeatElapsed || elapsed - 300 < 16) {
            return true;
          }
        }
        return false;
      } else {
        delete hold[key];
        return false;
      }
    };

    // D-pad navigation (buttons 12-15) or left stick
    const leftStickY = gp.axes[1] || 0;
    const leftStickX = gp.axes[0] || 0;

    const upActive = buttons[12]?.pressed || leftStickY < -0.5;
    const downActive = buttons[13]?.pressed || leftStickY > 0.5;
    const leftActive = buttons[14]?.pressed || leftStickX < -0.5;
    const rightActive = buttons[15]?.pressed || leftStickX > 0.5;

    if (heldWithRepeat('up', upActive)) {
      this._navigateUp();
    }
    if (heldWithRepeat('down', downActive)) {
      this._navigateDown();
    }
    if (heldWithRepeat('left', leftActive)) {
      this._navigatePrevSystem();
    }
    if (heldWithRepeat('right', rightActive)) {
      this._navigateNextSystem();
    }

    // Shoulder bumpers (buttons 4 and 5) = fast scroll with repeat
    if (heldWithRepeat('lb', buttons[4]?.pressed)) {
      for (let i = 0; i < 10; i++) this._navigateUp();
    }
    if (heldWithRepeat('rb', buttons[5]?.pressed)) {
      for (let i = 0; i < 10; i++) this._navigateDown();
    }

    // A button (south/button 0) = Enter/Select
    if (pressed(0)) {
      const index = this.romList.selected;
      const rom = this._getSelectedRom(index);
      if (rom) {
        this._launchGame(rom);
      }
    }


    // X button (west/button 2) = Recent
    if (pressed(2)) {
      this._showRecentRoms();
    }

    // Y button (north/button 3) = Settings
    if (pressed(3)) {
      this._showSettings();
    }

    // Start button (button 9) = Launch
    if (pressed(9)) {
      const index = this.romList.selected;
      const rom = this._getSelectedRom(index);
      if (rom) {
        this._launchGame(rom);
      }
    }
  }
}
