// @format

// Import process patch first
import './early-process-polyfill';
// Import polyfills next
import './src/utils/polyfills.ts';

// Import gesture handler first (required for proper initialization)
import 'react-native-gesture-handler';
// Import reanimated for proper initialization
import 'react-native-reanimated';

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Mirror all logs to Metro terminal, even if DevTools is open
['log', 'warn', 'error', 'info'].forEach(level => {
  const orig = console[level];
  console[level] = function (...args) {
    orig.apply(console, args);
    if (typeof global !== 'undefined' && global.__METRO_GLOBAL_LOG__) {
      global.__METRO_GLOBAL_LOG__(level, ...args);
    } else if (typeof process !== 'undefined' && process.stdout) {
      // Fallback: print to stdout
      process.stdout.write(`[${level}] ` + args.map(String).join(' ') + '\n');
    }
  };
});

AppRegistry.registerComponent(appName, () => App);
