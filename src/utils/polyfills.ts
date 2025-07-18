
// Polyfill setup for cross-platform (web/native) crypto and random
const isWeb = typeof globalThis !== 'undefined' && typeof (globalThis as any).window !== 'undefined' && typeof (globalThis as any).window.document !== 'undefined';

if (isWeb) {
  // --- WEB: Use browser-native crypto, avoid Node/React Native shims ---
  if (!globalThis.crypto) globalThis.crypto = globalThis.crypto;
  if (typeof globalThis.crypto.getRandomValues !== 'function') {
    throw new Error('Web crypto.getRandomValues is not available!');
  }
  // Polyfill Buffer (for compatibility)
  if (!globalThis.Buffer) {
    try {
      globalThis.Buffer = require('buffer').Buffer;
    } catch {}
  }
  // Add fromBuffer polyfill for libraries that expect it
  if (globalThis.Buffer && !(globalThis.Buffer as any).fromBuffer) {
    (globalThis.Buffer as any).fromBuffer = (buf: any) => globalThis.Buffer.from(buf);
  }
  // Polyfill TextEncoder/TextDecoder, btoa, atob
  if (!globalThis.TextEncoder) {
    globalThis.TextEncoder = globalThis.TextEncoder;
    globalThis.TextDecoder = globalThis.TextDecoder;
  }
  if (!globalThis.btoa) {
    globalThis.btoa = (str: string) => globalThis.btoa(str);
  }
  if (!globalThis.atob) {
    globalThis.atob = (str: string) => globalThis.atob(str);
  }
  // Patch @noble/ciphers and @noble/hashes random source if available
  try {
    const nobleCiphers = require('@noble/ciphers');
    if (nobleCiphers && nobleCiphers.utils && nobleCiphers.utils.randomBytes) {
      nobleCiphers.utils.randomBytes = (length: number) => {
        const arr = new Uint8Array(length);
        globalThis.crypto.getRandomValues(arr);
        return arr;
      };
    }
  } catch {}
  try {
    const nobleHashes = require('@noble/hashes');
    if (nobleHashes && nobleHashes.utils && nobleHashes.utils.randomBytes) {
      nobleHashes.utils.randomBytes = (length: number) => {
        const arr = new Uint8Array(length);
        globalThis.crypto.getRandomValues(arr);
        return arr;
      };
    }
  } catch {}
} else {
  // --- NATIVE: Use Node/React Native shims ---
  if (!globalThis.process) globalThis.process = {} as any;
  // Patch process.version and process.versions using defineProperty to avoid read-only errors
  try {
    if (typeof (globalThis.process as any).version !== 'string') {
      Object.defineProperty(globalThis.process, 'version', {
        value: 'v18.0.0',
        writable: false,
        configurable: true,
        enumerable: true
      });
    }
    if (!globalThis.process.versions || typeof (globalThis.process.versions as any).node !== 'string') {
      Object.defineProperty(globalThis.process, 'versions', {
        value: { node: '18.0.0' },
        writable: false,
        configurable: true,
        enumerable: true
      });
    }
  } catch {}
  require('react-native-get-random-values');
  const { Buffer } = require('buffer');
  // Conditionally require react-native-crypto (might have fromBuffer issues)
  try {
    require('react-native-crypto');
  } catch (e) {
    console.warn('Failed to load react-native-crypto:', e);
  }
  require('react-native-randombytes');
  const { Readable } = require('stream-browserify');
  if (!globalThis.Buffer) globalThis.Buffer = Buffer;
  // Add fromBuffer polyfill for libraries that expect it
  if (globalThis.Buffer && !(globalThis.Buffer as any).fromBuffer) {
    (globalThis.Buffer as any).fromBuffer = (buf: any) => globalThis.Buffer.from(buf);
  }
  if (!globalThis.TextEncoder) {
    const { TextEncoder, TextDecoder } = require('text-encoding');
    globalThis.TextEncoder = TextEncoder;
    globalThis.TextDecoder = TextDecoder;
  }
  if (!globalThis.btoa) {
    globalThis.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
  }
  if (!globalThis.atob) {
    globalThis.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
  }
  if (!(globalThis as any).Readable) (globalThis as any).Readable = Readable;
  // --- Robust process.version patch: patch on every tick for 1s ---
  // No-op: process.version/versions are patched above and should not be reassigned
}
