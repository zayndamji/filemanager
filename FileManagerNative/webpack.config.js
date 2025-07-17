const path = require('path');

module.exports = function (env, argv) {
  return {
    resolve: {
      alias: {
        'react-native-fs': path.resolve(__dirname, 'utils/rnfs.web.js'),
      },
    },
  };
};
