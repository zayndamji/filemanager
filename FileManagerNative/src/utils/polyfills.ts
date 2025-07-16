// Patch process as early as possible before any imports
const g: any = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : {});

if (!g.process) {
  g.process = {};
}
if (typeof g.process.version !== 'string') {
  g.process.version = 'v18.0.0';
}
if (!g.process.versions || typeof g.process.versions.node !== 'string') {
  g.process.versions = { node: '18.0.0' };
}

// polyfills

import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import 'react-native-crypto';
import 'react-native-randombytes';
import { Readable } from 'stream-browserify';

console.log('[Polyfill] Starting crypto setup');

console.log('[Polyfill] global.crypto after import:', g.crypto);

if (!g.crypto) {
  g.crypto = {};
  console.log('[Polyfill] global.crypto created');
}
if (typeof g.crypto.getRandomValues !== 'function') {
  console.error('Polyfill: getRandomValues is not a function:', g.crypto.getRandomValues);
} else {
  console.log('[Polyfill] getRandomValues is present');
}
// Polyfill TextEncoder/TextDecoder, btoa, atob
if (!g.TextEncoder) {
  const { TextEncoder, TextDecoder } = require('text-encoding');
  g.TextEncoder = TextEncoder;
  g.TextDecoder = TextDecoder;
}
if (!g.btoa) {
  g.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
}
if (!g.atob) {
  g.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
}
if (!g.Buffer) {
  g.Buffer = Buffer;
}
// Always force process.version to a string (again, for safety)
if (g.process) {
  if (typeof g.process.version !== 'string') {
    g.process.version = 'v18.0.0';
  }
  if (!g.process.versions || typeof g.process.versions.node !== 'string') {
    g.process.versions = { node: '18.0.0' };
  }
}
if (!g.Readable) {
  g.Readable = Readable;
}

// --- Robust process.version patch: patch on every tick for 1s ---
function ensureProcessVersion() {
  if (g.process) {
    if (typeof g.process.version !== 'string') {
      g.process.version = 'v18.0.0';
    }
    if (!g.process.versions || typeof g.process.versions.node !== 'string') {
      g.process.versions = { node: '18.0.0' };
    }
  }
}
// Patch once immediately
ensureProcessVersion();
// Patch on every tick for the first second after startup
let patchCount = 0;
const patchInterval = setInterval(() => {
  ensureProcessVersion();
  patchCount++;
  if (patchCount > 20) clearInterval(patchInterval); // Stop after ~1 second
}, 50);
setTimeout(() => clearInterval(patchInterval), 1000);

console.log('[Polyfill] setup complete');
