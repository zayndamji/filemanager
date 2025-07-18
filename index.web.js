// Load early polyfills first
import './early-process-polyfill.js';

// Polyfill Buffer for web before anything else
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;
// Add fromBuffer polyfill for libraries that expect it
if (!globalThis.Buffer.fromBuffer) {
  globalThis.Buffer.fromBuffer = (buf) => globalThis.Buffer.from(buf);
}

// Load crypto polyfills
import './src/utils/polyfills.ts';

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// For development
if (__DEV__) {
  // Enable keep awake in development
  try {
    const { activateKeepAwake } = require('expo-keep-awake');
    activateKeepAwake();
  } catch (e) {
    // Ignore if expo-keep-awake is not available
  }
}

AppRegistry.registerComponent(appName, () => App);
AppRegistry.runApplication(appName, {
  initialProps: {},
  rootTag: document.getElementById('root') || document.getElementById('main'),
});
