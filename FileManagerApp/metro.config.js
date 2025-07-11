const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

// metro configuration
// https://reactnative.dev/docs/metro
// @type {import('@react-native/metro-config').MetroConfig}
const config = {
  resolver: {
    alias: {
      'crypto': 'react-native-crypto',
      'stream': 'stream-browserify',
      'buffer': 'buffer',
      'process': 'process/browser',
      'events': 'events',
    },
    extraNodeModules: {
      crypto: require.resolve('react-native-crypto'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer'),
      process: require.resolve('process/browser'),
      events: require.resolve('events'),
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
