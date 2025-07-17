// Polyfill Buffer and fromBuffer for web before anything else
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;
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
