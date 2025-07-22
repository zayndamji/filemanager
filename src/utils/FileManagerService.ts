import * as FileSystem from './FileSystem';
import { EncryptionUtils } from './EncryptionUtils';
import { uint8ArrayToBase64, base64ToUint8Array } from './Base64Utils';
import { Platform } from 'react-native';

// Conditionally import RNFS for native platforms
let RNFS: any = null;
if (Platform.OS !== 'web') {
  try {
    RNFS = require('react-native-fs');
  } catch (e) {
    console.warn('Failed to load RNFS:', e);
  }
}

export interface FileMetadata {
  name: string;
  type: string;
  size: number;
  folderPath: string[];
  tags: string[];
  uuid: string;
  encryptedAt: string;
  version: string;
}

export interface EncryptedFile {
  uuid: string;
  metadata: FileMetadata;
  filePath: string;
  metadataPath: string;
  previewPath?: string;
  isEncrypted: boolean;
}

export class FileManagerService {
  // Track active temp files for cleanup
  private static activeTempFiles = new Set<string>();

  /**
   * Creates a temporary file from data and returns its path (cross-platform)
   */
  static async createTempFile(data: Uint8Array, fileName: string): Promise<string> {
    const tempName = `temp_${Date.now()}_${fileName}`;
    
    if ((Platform.OS as any) === 'web') {
      const base64Data = uint8ArrayToBase64(data);
      await FileSystem.writeFile(tempName, base64Data, 'base64');
    } else {
      // For native platforms, create temp file in a temp directory
      const tempDir = RNFS ? `${RNFS.TemporaryDirectoryPath}` : `${RNFS.DocumentDirectoryPath}/temp`;
      const tempPath = `${tempDir}/${tempName}`;
      
      // Ensure temp directory exists
      if (RNFS) {
        await RNFS.mkdir(tempDir).catch(() => {}); // Ignore if exists
        const base64Data = uint8ArrayToBase64(data);
        await RNFS.writeFile(tempPath, base64Data, 'base64');
      }
      
      // Track the temp file for cleanup
      this.activeTempFiles.add(tempPath);
      console.log('[FileManagerService] Created temp file:', tempPath);
      return tempPath;
    }
    
    this.activeTempFiles.add(tempName);
    console.log('[FileManagerService] Created temp file:', tempName);
    return tempName;
  }

  /**
   * Deletes a temporary file (cross-platform)
   */
  static async deleteTempFile(tempFilePath: string): Promise<void> {
    try {
      if ((Platform.OS as any) === 'web') {
        await FileSystem.deleteFile(tempFilePath);
      } else if (RNFS) {
        await RNFS.unlink(tempFilePath);
      }
      
      this.activeTempFiles.delete(tempFilePath);
      console.log('[FileManagerService] Deleted temp file:', tempFilePath);
    } catch (error) {
      console.warn('[FileManagerService] Failed to delete temp file:', tempFilePath, error);
      // Still remove from tracking even if deletion failed
      this.activeTempFiles.delete(tempFilePath);
    }
  }

  /**
   * Cleanup all temporary files (called on app startup and shutdown)
   */
  static async cleanupAllTempFiles(): Promise<void> {
    console.log('[FileManagerService] Cleaning up all temporary files...');
    
    try {
      if ((Platform.OS as any) === 'web') {
        // For web, we can't easily list files, so just clear our tracking
        this.activeTempFiles.clear();
      } else if (RNFS) {
        // For native platforms, clean up temp directory
        const tempDir = `${RNFS.TemporaryDirectoryPath}`;
        const documentsTemp = `${RNFS.DocumentDirectoryPath}/temp`;
        
        // Clean temp directory
        try {
          const tempFiles = await RNFS.readDir(tempDir);
          for (const file of tempFiles) {
            if (file.name.startsWith('temp_')) {
              try {
                await RNFS.unlink(file.path);
                console.log('[FileManagerService] Cleaned up temp file:', file.path);
              } catch (error) {
                console.warn('[FileManagerService] Failed to clean temp file:', file.path, error);
              }
            }
          }
        } catch (error) {
          console.warn('[FileManagerService] Failed to read temp directory:', error);
        }
        
        // Clean documents temp directory
        try {
          const docTempFiles = await RNFS.readDir(documentsTemp);
          for (const file of docTempFiles) {
            if (file.name.startsWith('temp_')) {
              try {
                await RNFS.unlink(file.path);
                console.log('[FileManagerService] Cleaned up documents temp file:', file.path);
              } catch (error) {
                console.warn('[FileManagerService] Failed to clean documents temp file:', file.path, error);
              }
            }
          }
        } catch (error) {
          // Temp directory might not exist, which is fine
          console.log('[FileManagerService] Documents temp directory does not exist or is empty');
        }
      }
      
      // Clean up tracked temp files
      const tempFilesArray = Array.from(this.activeTempFiles);
      for (const tempFile of tempFilesArray) {
        await this.deleteTempFile(tempFile);
      }
      
      this.activeTempFiles.clear();
      console.log('[FileManagerService] Temporary file cleanup completed');
    } catch (error) {
      console.error('[FileManagerService] Error during temp file cleanup:', error);
    }
  }

  /**
   * Get list of active temp files (for debugging)
   */
  static getActiveTempFiles(): string[] {
    return Array.from(this.activeTempFiles);
  }
  
  /**
   * Updates the metadata for a file (re-encrypts and saves metadata.enc)
   */
  static async updateFileMetadata(uuid: string, newMetadata: Partial<FileMetadata>, key: Uint8Array): Promise<void> {
    this.checkKey(key, 'updateFileMetadata');
    // Load current metadata
    const metadataPath = this.getFilePath(uuid, 'metadata');
    let metadata: FileMetadata;
    try {
      metadata = await this.loadFileMetadata(uuid, key);
    } catch (e) {
      throw new Error('Failed to load current metadata for update');
    }
    // Merge new fields
    const updated: FileMetadata = {
      ...metadata,
      ...newMetadata,
      uuid,
      encryptedAt: new Date().toISOString(),
    };
    // Encrypt and save
    const metadataString = JSON.stringify(updated);
    const metadataBuffer = new TextEncoder().encode(metadataString);
    const encryptedMetadata = await EncryptionUtils.encryptData(metadataBuffer, key);
    const metadataBase64 = uint8ArrayToBase64(encryptedMetadata);
    await FileSystem.writeFile(`${uuid}.metadata.enc`, metadataBase64, 'base64');
  }

  // gets the documents path dynamically to avoid accessing RNFS during import
  private static getDocumentsPath(): string {
    if ((Platform.OS as any) === 'web') {
      return '/app-documents';
    } else {
      return RNFS ? RNFS.DocumentDirectoryPath : '/app-documents';
    }
  }

  // gets the file path for a given UUID and type
  // Now always uses UUID for file naming, but original filename is preserved in metadata
  private static getFilePath(uuid: string, type: 'file' | 'metadata' | 'preview'): string {
    const extension = type === 'file' ? '.enc' : type === 'metadata' ? '.metadata.enc' : '.preview.enc';
    return `${this.getDocumentsPath()}/${uuid}${extension}`;
  }

  static checkKey(key: any, context: string) {
    if (!(key instanceof Uint8Array) || key.length !== 32) {
      console.error(`[FileManagerService] Invalid key passed to ${context}:`, key, typeof key, key && key.length);
      throw new Error('Invalid derivedKey for decryption');
    }
  }

  // saves an encrypted file to the file system
  static async saveEncryptedFile(
    fileData: Uint8Array,
    originalFileName: string,
    mimeType: string,
    key: Uint8Array,
    folderPath: string[] = [],
    tags: string[] = []
  ): Promise<EncryptedFile> {
    const start = Date.now();
    this.checkKey(key, 'saveEncryptedFile');
    // Encrypt file and metadata
    const { encryptedFile, encryptedMetadata, encryptedPreview, uuid } = await EncryptionUtils.encryptFile(
      fileData,
      originalFileName,
      mimeType,
      key,
      folderPath,
      tags
    );

    // Write encrypted file as base64
    const filePath = this.getFilePath(uuid, 'file');
    const fileBase64 = uint8ArrayToBase64(encryptedFile);
    await FileSystem.writeFile(`${uuid}.enc`, fileBase64, 'base64');

    // Write encrypted metadata as base64
    const metadataPath = this.getFilePath(uuid, 'metadata');
    const metadataBase64 = uint8ArrayToBase64(encryptedMetadata);
    await FileSystem.writeFile(`${uuid}.metadata.enc`, metadataBase64, 'base64');

    // Write preview if present
    let previewPath: string | undefined;
    if (encryptedPreview) {
      previewPath = this.getFilePath(uuid, 'preview');
      const previewBase64 = uint8ArrayToBase64(encryptedPreview);
      await FileSystem.writeFile(`${uuid}.preview.enc`, previewBase64, 'base64');
    }

    const end = Date.now();
    console.log('[FileManagerService] saveEncryptedFile: END', { uuid, filePath, metadataPath, previewPath, isEncrypted: true, durationMs: end - start, timestamp: end });

    // Decrypt metadata for return value (do not parse encrypted buffer)
    let metadata: FileMetadata = {} as FileMetadata;
    try {
      const metadataBuffer = await EncryptionUtils.decryptData(new Uint8Array(encryptedMetadata), key);
      const metadataString = new TextDecoder().decode(metadataBuffer);
      metadata = JSON.parse(metadataString);
    } catch (e) {
      console.error('[FileManagerService] Error parsing metadata JSON:', e);
    }

    return {
      uuid,
      metadata,
      filePath,
      metadataPath,
      previewPath,
      isEncrypted: true
    };
  }

  // loads an encrypted file from the file system
  static async loadEncryptedFile(
    uuid: string, 
    key: Uint8Array, 
    abortSignal?: AbortSignal, 
    progressCallback?: () => void  // Simplified callback
  ): Promise<{
    fileData: Uint8Array;
    metadata: FileMetadata;
  }> {
    const start = Date.now();
    this.checkKey(key, 'loadEncryptedFile');
    const filePath = this.getFilePath(uuid, 'file');
    const metadataPath = this.getFilePath(uuid, 'metadata');

    // Check cancellation before starting file operations
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }

    // Read encrypted file as base64
    let encryptedFile: Uint8Array, encryptedMetadata: Uint8Array;
    if ((Platform.OS as any) === 'web') {
      const fileBase64 = await FileSystem.readFile(`${uuid}.enc`, 'base64');
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled');
      }
      encryptedFile = base64ToUint8Array(fileBase64);
      const metadataBase64 = await FileSystem.readFile(`${uuid}.metadata.enc`, 'base64');
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled');
      }
      encryptedMetadata = base64ToUint8Array(metadataBase64);
    } else {
      const fileBase64 = await FileSystem.readFile(`${uuid}.enc`, 'base64');
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled');
      }
      encryptedFile = base64ToUint8Array(fileBase64);
      const metadataBase64 = await FileSystem.readFile(`${uuid}.metadata.enc`, 'base64');
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled');
      }
      encryptedMetadata = base64ToUint8Array(metadataBase64);
    }

    // Decrypt and return
    const result = await EncryptionUtils.decryptFile(
      encryptedFile,
      encryptedMetadata,
      key,
      abortSignal,
      progressCallback
    );
    const end = Date.now();
    console.log('[FileManagerService] loadEncryptedFile: END', { uuid, filePath, metadataPath, durationMs: end - start, timestamp: end });
    return result;
  }

  /**
   * Loads encrypted file metadata only
   */
  static async loadFileMetadata(uuid: string, key: Uint8Array): Promise<FileMetadata> {
    this.checkKey(key, 'loadFileMetadata');
    const metadataPath = this.getFilePath(uuid, 'metadata');
    try {
      // Read encrypted metadata as base64
      let metadataBase64: string;
      metadataBase64 = await FileSystem.readFile(`${uuid}.metadata.enc`, 'base64');
      if (!metadataBase64) {
        throw new Error('metadataBase64 is empty');
      }
      const encryptedMetadataBytes = base64ToUint8Array(metadataBase64);
      
      if (!key || !(key instanceof Uint8Array) || key.length !== 32) {
        console.error('[FileManagerService] loadFileMetadata: Invalid derivedKey', key);
        throw new Error('Invalid derivedKey for decryption');
      }
      let metadataBuffer, metadataString;
      try {
        metadataBuffer = await EncryptionUtils.decryptData(encryptedMetadataBytes, key);
        metadataString = new TextDecoder().decode(metadataBuffer);
      } catch (e) {
        console.error('Failed to decrypt metadata for', uuid, e);
        throw e;
      }
      return JSON.parse(metadataString) as FileMetadata;
    } catch (error) {
      console.error('Failed to load metadata for', uuid, error);
      throw new Error('Failed to load file metadata');
    }
  }

  /**
   * Lists all encrypted files in the system
   */
  static async listEncryptedFiles(key: Uint8Array): Promise<EncryptedFile[]> {
    const start = Date.now();
    this.checkKey(key, 'listEncryptedFiles');
    try {
      let encryptedFiles: EncryptedFile[] = [];
      if ((Platform.OS as any) === 'web') {
        // Use FileSystem to list files instead of direct web API access
        const files = await FileSystem.listFiles();
        const metadataFiles = files.filter((file: string) => file.endsWith('.metadata.enc'));
        for (const fileName of metadataFiles) {
          const uuid = fileName.replace('.metadata.enc', '');
          try {
            const metadata = await this.loadFileMetadata(uuid, key);
            const filePath = `${uuid}.enc`;
            const metadataPath = `${uuid}.metadata.enc`;
            const previewPath = `${uuid}.preview.enc`;
            // Check if preview exists
            const previewExists = await FileSystem.exists(previewPath);
            encryptedFiles.push({
              uuid,
              metadata,
              filePath,
              metadataPath,
              previewPath: previewExists ? previewPath : undefined,
              isEncrypted: true
            });
          } catch (error) {
            console.warn('Failed to load metadata for', uuid, error);
          }
        }
      } else {
        const files = await FileSystem.readDir(this.getDocumentsPath());
        const metadataFiles = files.filter(file => file.name.endsWith('.metadata.enc'));
        for (const metadataFile of metadataFiles) {
          const uuid = metadataFile.name.replace('.metadata.enc', '');
          try {
            const metadata = await this.loadFileMetadata(uuid, key);
            const filePath = this.getFilePath(uuid, 'file');
            const metadataPath = this.getFilePath(uuid, 'metadata');
            const previewPath = this.getFilePath(uuid, 'preview');
            const previewExists = await FileSystem.exists(previewPath);
            encryptedFiles.push({
              uuid,
              metadata,
              filePath,
              metadataPath,
              previewPath: previewExists ? previewPath : undefined,
              isEncrypted: true
            });
          } catch (error) {
            console.warn('Failed to load metadata for', uuid, error);
          }
        }
      }
      const end = Date.now();
      console.log('[FileManagerService] listEncryptedFiles: END', { count: encryptedFiles.length, durationMs: end - start, timestamp: end });
      return encryptedFiles;
    } catch (error) {
      console.error('[FileManagerService] Error listing encrypted files:', error);
      return [];
    }
  }

  /**
   * Deletes an encrypted file
   */
  static async deleteEncryptedFile(uuid: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(uuid, 'file');
      const metadataPath = this.getFilePath(uuid, 'metadata');
      const previewPath = this.getFilePath(uuid, 'preview');

      // Delete main file
      if ((Platform.OS as any) === 'web') {
        // Try to delete each file, ignore errors if file doesn't exist
        try { await FileSystem.unlink(`${uuid}.enc`); } catch {}
        try { await FileSystem.unlink(`${uuid}.metadata.enc`); } catch {}
        try { await FileSystem.unlink(`${uuid}.preview.enc`); } catch {}
        return true;
      } else {
        if (await FileSystem.exists(filePath)) {
          await FileSystem.unlink(filePath);
        }
        if (await FileSystem.exists(metadataPath)) {
          await FileSystem.unlink(metadataPath);
        }
        if (await FileSystem.exists(previewPath)) {
          await FileSystem.unlink(previewPath);
        }
        return true;
      }
    } catch (error) {
      console.error('Failed to delete encrypted file:', error);
      return false;
    }
  }

  /**
   * Deletes all encrypted files (of the user's key) in the app's document directory
   */
  static async deleteAllFiles(derivedKey: Uint8Array): Promise<number> {
    let deletedCount = 0;
    if ((Platform.OS as any) === 'web') {
      const files = await FileSystem.listFiles();
      const metadataFiles = files.filter((file: string) => file.endsWith('.metadata.enc'));
      for (const fileName of metadataFiles) {
        const uuid = fileName.replace('.metadata.enc', '');
        try {
          await this.loadFileMetadata(uuid, derivedKey);
          try { await FileSystem.unlink(`${uuid}.enc`); } catch {}
          try { await FileSystem.unlink(`${uuid}.metadata.enc`); } catch {}
          try { await FileSystem.unlink(`${uuid}.preview.enc`); } catch {}
          deletedCount++;
        } catch (e) {
          continue;
        }
      }
      return deletedCount;
    } else {
      const files = await FileSystem.readDir(this.getDocumentsPath());
      const metadataFiles = files.filter(file => file.name.endsWith('.metadata.enc'));
      for (const metadataFile of metadataFiles) {
        const uuid = metadataFile.name.replace('.metadata.enc', '');
        try {
          await this.loadFileMetadata(uuid, derivedKey);
          const filePath = this.getFilePath(uuid, 'file');
          const metadataPath = this.getFilePath(uuid, 'metadata');
          const previewPath = this.getFilePath(uuid, 'preview');
          if (await FileSystem.exists(filePath)) await FileSystem.unlink(filePath);
          if (await FileSystem.exists(metadataPath)) await FileSystem.unlink(metadataPath);
          if (await FileSystem.exists(previewPath)) await FileSystem.unlink(previewPath);
          deletedCount++;
        } catch (e) {
          continue;
        }
      }
      return deletedCount;
    }
  }

  /**
   * Clears all encrypted files (useful for cleaning up corrupted files)
   */
  static async clearAllFiles(): Promise<{ deletedCount: number }> {
    try {
      const files = await FileSystem.readDir();
      let deletedCount = 0;
      
      for (const file of files) {
        const fileName = typeof file === 'string' ? file : file.name;
        if (fileName.endsWith('.enc')) {
          try {
            await FileSystem.unlink(fileName);
            deletedCount++;
          } catch (e) {
            console.warn(`Failed to delete ${fileName}:`, e);
          }
        }
      }
      
      console.log(`[FileManagerService] clearAllFiles: Deleted ${deletedCount} files`);
      return { deletedCount };
    } catch (error) {
      console.error('[FileManagerService] clearAllFiles: Error:', error);
      throw error;
    }
  }

  /**
   * Gets file preview data
   */
  static async getFilePreview(uuid: string, key: Uint8Array): Promise<Uint8Array | null> {
    const start = Date.now();
    this.checkKey(key, 'getFilePreview');
    const previewPath = this.getFilePath(uuid, 'preview');
    try {
      let previewBase64: string;
      if ((Platform.OS as any) === 'web') {
        try {
          previewBase64 = await FileSystem.readFile(`${uuid}.preview.enc`, 'base64');
        } catch {
          return null;
        }
      } else {
        if (!(await FileSystem.exists(previewPath))) {
          return null;
        }
        previewBase64 = await RNFS.readFile(previewPath, 'base64');
      }
      const encryptedPreview = base64ToUint8Array(previewBase64);
      const previewBuffer = await EncryptionUtils.decryptData(encryptedPreview, key);
      const end = Date.now();
      console.log('[FileManagerService] getFilePreview: END', { uuid, previewPath, durationMs: end - start, timestamp: end });
      return new Uint8Array(previewBuffer);
    } catch (error) {
      console.error('Failed to load preview:', error);
      return null;
    }
  }

  /**
   * Filters files by folder path
   */
  static filterFilesByPath(files: EncryptedFile[], folderPath: string[]): EncryptedFile[] {
    return files.filter(file => 
      file.metadata.folderPath.length === folderPath.length &&
      file.metadata.folderPath.every((path, index) => path === folderPath[index])
    );
  }

  /**
   * Gets all subfolders from a list of files
   */
  static getSubfolders(files: EncryptedFile[], currentPath: string[]): string[] {
    const subfolders = new Set<string>();
    
    for (const file of files) {
      const filePath = file.metadata.folderPath;
      if (filePath.length > currentPath.length) {
        const isInCurrentPath = currentPath.every((path, index) => path === filePath[index]);
        if (isInCurrentPath) {
          subfolders.add(filePath[currentPath.length]);
        }
      }
    }
    
    return Array.from(subfolders).sort();
  }
}

export default FileManagerService;
