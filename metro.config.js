const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add web support
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

// Configure aliases for Node.js polyfills
config.resolver.alias = {
  'crypto': 'react-native-crypto',
  'stream': 'stream-browserify',
  'buffer': 'buffer',
  'process': 'process/browser',
  'events': 'events',
  'react-native-fs': path.resolve(__dirname, 'utils/rnfs.web.js'),
  // Prevent native-only libraries from being bundled on web
  'react-native-simple-crypto': false,
  'react-native-image-resizer': false,
  'react-native-document-picker': false,
  'react-native-image-picker': false,
  'react-native-sound': false,
  'react-native-video': false,
  'react-native-share': false,
  'react-native-randombytes': false,
  'react-native-gesture-handler': false,
  'react-native-zoom-toolkit': false,
  // Add more native-only modules here as needed
};

// Add extra node modules
config.resolver.extraNodeModules = {
  crypto: require.resolve('react-native-crypto'),
  stream: require.resolve('stream-browserify'),
  buffer: require.resolve('buffer'),
  process: require.resolve('process/browser'),
  events: require.resolve('events'),
};

// Configure web-specific settings
config.transformer.minifierConfig = {
  mangle: {
    keep_fnames: true,
  },
  output: {
    ascii_only: true,
    quote_keys: true,
    wrap_iife: true,
  },
  sourceMap: {
    includeSources: false,
  },
  toplevel: false,
  warnings: false,
};

module.exports = config;
