const path = require('path');

module.exports = function (env, argv) {
  return {
    resolve: {
      alias: {
        'react-native-fs': path.resolve(__dirname, 'utils/rnfs.web.js'),
        // Prevent native-only libraries from being bundled on web
        'react-native-simple-crypto': false,
        'react-native-image-resizer': false,
        'react-native-document-picker': false,
        'react-native-image-picker': false,
        'react-native-video': false,
        'react-native-share': false,
        'react-native-randombytes': false,
        'react-native-gesture-handler': false,
        'react-native-zoom-toolkit': false,
      },
    },
  };
};
