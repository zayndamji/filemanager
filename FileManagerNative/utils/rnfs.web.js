// Web mock for react-native-fs (RNFS)
const RNFS = {
  RNFSFileTypeRegular: 0,
  RNFSFileTypeDirectory: 1,
  DocumentDirectoryPath: '/app-documents', // Virtual path for web
  readFile: async () => { throw new Error('readFile not supported on web - use FileSystem abstraction'); },
  writeFile: async () => { throw new Error('writeFile not supported on web - use FileSystem abstraction'); },
  exists: async () => { throw new Error('exists not supported on web - use FileSystem abstraction'); },
  unlink: async () => { throw new Error('unlink not supported on web - use FileSystem abstraction'); },
  readDir: async () => { throw new Error('readDir not supported on web - use FileSystem abstraction'); },
  mkdir: async () => { throw new Error('mkdir not supported on web - use FileSystem abstraction'); },
  copyFile: async () => { throw new Error('copyFile not supported on web - use FileSystem abstraction'); },
  moveFile: async () => { throw new Error('moveFile not supported on web - use FileSystem abstraction'); },
  downloadFile: async () => { throw new Error('downloadFile not supported on web - use FileSystem abstraction'); },
  stat: async () => { throw new Error('stat not supported on web - use FileSystem abstraction'); },
};

// Export named constants
export const RNFSFileTypeRegular = RNFS.RNFSFileTypeRegular;
export const RNFSFileTypeDirectory = RNFS.RNFSFileTypeDirectory;
export const DocumentDirectoryPath = RNFS.DocumentDirectoryPath;

export default RNFS;

// For CommonJS compatibility (require)
if (typeof module !== 'undefined') {
  module.exports = RNFS;
  module.exports.RNFSFileTypeRegular = RNFS.RNFSFileTypeRegular;
  module.exports.RNFSFileTypeDirectory = RNFS.RNFSFileTypeDirectory;
  module.exports.DocumentDirectoryPath = RNFS.DocumentDirectoryPath;
  module.exports.default = RNFS;
}
