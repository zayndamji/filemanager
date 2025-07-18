// Load early polyfills first
import './early-process-polyfill.js';

// Polyfill Buffer for web before anything else
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;
// Add fromBuffer polyfill for libraries that expect it
if (!globalThis.Buffer.fromBuffer) {
  globalThis.Buffer.fromBuffer = (buf) => globalThis.Buffer.from(buf);
}
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.runApplication(appName, {
  initialProps: {},
  rootTag: document.getElementById('root'),
});
