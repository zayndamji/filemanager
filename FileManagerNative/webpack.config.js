const path = require('path');

module.exports = function (env, argv) {
  return {
    resolve: {
      alias: {
        'react-native-fs': path.resolve(__dirname, 'utils/rnfs.web.js'),
        // Prevent react-native-simple-crypto from being bundled on web
        'react-native-simple-crypto': false,
        // Prevent other native-only libraries from being bundled on web
        'react-native-image-resizer': false,
        'react-native-document-picker': false,
        'react-native-image-picker': false,
      },
    },
  };
};
