const g = typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : {});
if (!g.process) g.process = {};
if (typeof g.process.version !== 'string') g.process.version = 'v18.0.0';
if (!g.process.versions || typeof g.process.versions.node !== 'string') g.process.versions = { node: '18.0.0' };
