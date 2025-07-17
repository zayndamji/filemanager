const gEarlyPolyfill = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : {});
if (!globalThis.process) globalThis.process = {};
if (typeof globalThis.process.version !== 'string') globalThis.process.version = 'v18.0.0';
if (!globalThis.process.versions || typeof globalThis.process.versions.node !== 'string') globalThis.process.versions = { node: '18.0.0' };
if (!globalThis.process.env) globalThis.process.env = {};
if (!globalThis.process.env.EXPO_OS) globalThis.process.env.EXPO_OS = 'web';
