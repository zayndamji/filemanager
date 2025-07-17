// Web mock for react-native-fs (RNFS)
const RNFS = {
  RNFSFileTypeRegular: 0,
  RNFSFileTypeDirectory: 1,
  readFile: async () => { throw new Error('readFile not supported on web'); },
  writeFile: async () => { throw new Error('writeFile not supported on web'); },
};

export const RNFSFileTypeRegular = RNFS.RNFSFileTypeRegular;
export const RNFSFileTypeDirectory = RNFS.RNFSFileTypeDirectory;

export default RNFS;

// For CommonJS compatibility (require)
if (typeof module !== 'undefined') {
  module.exports = RNFS;
  module.exports.RNFSFileTypeRegular = RNFS.RNFSFileTypeRegular;
  module.exports.RNFSFileTypeDirectory = RNFS.RNFSFileTypeDirectory;
}
