import { usePasswordContext } from '../context/PasswordContext';
import { FileManagerService, FileMetadata, EncryptedFile } from '../utils/FileManagerService';

/**
 * Custom hook that provides FileManagerService methods with derivedKey automatically injected
 */
export const useFileManagerService = () => {
  const { derivedKey } = usePasswordContext();

  const checkDerivedKey = () => {
    if (!derivedKey) {
      throw new Error('No derived key available. Please ensure password is set.');
    }
    return derivedKey;
  };

  return {
    saveEncryptedFile: async (
      fileData: Uint8Array,
      originalFileName: string,
      mimeType: string,
      folderPath: string[] = [],
      tags: string[] = []
    ): Promise<EncryptedFile> => {
      const key = checkDerivedKey();
      return FileManagerService.saveEncryptedFile(fileData, originalFileName, mimeType, key, folderPath, tags);
    },

    saveEncryptedVideoChunked: async (
      fileData: Uint8Array,
      originalFileName: string,
      mimeType: string,
      folderPath: string[] = [],
      tags: string[] = []
    ): Promise<EncryptedFile> => {
      const key = checkDerivedKey();
      return FileManagerService.saveEncryptedVideoChunked(fileData, originalFileName, mimeType, key, folderPath, tags);
    },

    saveEncryptedImageSet: async (
      images: Array<{ name: string; data: Uint8Array; mimeType: string }>,
      imageSetName: string,
      folderPath: string[] = [],
      tags: string[] = []
    ): Promise<EncryptedFile> => {
      const key = checkDerivedKey();
      return FileManagerService.saveEncryptedImageSet(images, imageSetName, key, folderPath, tags);
    },

    loadEncryptedFile: async (
      uuid: string,
      abortSignal?: AbortSignal,
      progressCallback?: () => void
    ): Promise<{ fileData: Uint8Array; metadata: FileMetadata }> => {
      const key = checkDerivedKey();
      return FileManagerService.loadEncryptedFile(uuid, key, abortSignal, progressCallback);
    },

    loadEncryptedVideoChunked: async (
      uuid: string,
      abortSignal?: AbortSignal,
      progressCallback?: (chunkIndex: number, totalChunks: number) => void,
      targetTempPath?: string
    ): Promise<{ fileData?: Uint8Array; tempFilePath?: string; metadata: FileMetadata; totalChunks: number }> => {
      const key = checkDerivedKey();
      return FileManagerService.loadEncryptedVideoChunked(uuid, key, abortSignal, progressCallback, targetTempPath);
    },

    loadEncryptedVideoProgressive: async (
      uuid: string,
      abortSignal?: AbortSignal,
      progressCallback?: (chunkIndex: number, totalChunks: number) => void,
      initialChunksCount?: number
    ): Promise<{ tempFilePath: string; metadata: FileMetadata; totalChunks: number; backgroundLoadingPromise: Promise<void> }> => {
      const key = checkDerivedKey();
      return FileManagerService.loadEncryptedVideoProgressive(uuid, key, abortSignal, progressCallback, initialChunksCount);
    },

    loadFileMetadata: async (uuid: string): Promise<FileMetadata> => {
      const key = checkDerivedKey();
      return FileManagerService.loadFileMetadata(uuid, key);
    },

    listEncryptedFiles: async (): Promise<EncryptedFile[]> => {
      const key = checkDerivedKey();
      return FileManagerService.listEncryptedFiles(key);
    },

    deleteAllFiles: async (): Promise<number> => {
      const key = checkDerivedKey();
      return FileManagerService.deleteAllFiles(key);
    },

    getFilePreview: async (uuid: string): Promise<Uint8Array | null> => {
      const key = checkDerivedKey();
      return FileManagerService.getFilePreview(uuid, key);
    },

    updateFileMetadata: async (uuid: string, newMetadata: Partial<FileMetadata>): Promise<void> => {
      const key = checkDerivedKey();
      return FileManagerService.updateFileMetadata(uuid, newMetadata, key);
    },

    // Pass through methods that don't need derivedKey
    deleteEncryptedFile: FileManagerService.deleteEncryptedFile,
    clearAllFiles: FileManagerService.clearAllFiles,
    createTempFile: FileManagerService.createTempFile,
    deleteTempFile: FileManagerService.deleteTempFile,
    filterFilesByPath: FileManagerService.filterFilesByPath,
    getSubfolders: FileManagerService.getSubfolders,
  };
};
