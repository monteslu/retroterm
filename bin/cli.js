#!/usr/bin/env node

import { Launcher } from '../src/Launcher.js';

const launcher = new Launcher();
await launcher.start();
