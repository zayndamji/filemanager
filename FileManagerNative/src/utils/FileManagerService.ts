import RNFS from 'react-native-fs';
import { EncryptionUtils } from './EncryptionUtils';

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
  private static documentsPath = RNFS.DocumentDirectoryPath;

  // gets the file path for a given UUID and type
  // Now always uses UUID for file naming, but original filename is preserved in metadata
  private static getFilePath(uuid: string, type: 'file' | 'metadata' | 'preview'): string {
    const extension = type === 'file' ? '.enc' : type === 'metadata' ? '.metadata.enc' : '.preview.enc';
    return `${this.documentsPath}/${uuid}${extension}`;
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
    const fileBase64 = Buffer.from(encryptedFile).toString('base64');
    await RNFS.writeFile(filePath, fileBase64, 'base64');

    // Write encrypted metadata as base64
    const metadataPath = this.getFilePath(uuid, 'metadata');
    const metadataBase64 = Buffer.from(encryptedMetadata).toString('base64');
    await RNFS.writeFile(metadataPath, metadataBase64, 'base64');

    // Write preview if present
    let previewPath: string | undefined;
    if (encryptedPreview) {
      previewPath = this.getFilePath(uuid, 'preview');
      const previewBase64 = Buffer.from(encryptedPreview).toString('base64');
      await RNFS.writeFile(previewPath, previewBase64, 'base64');
    }

    const end = Date.now();
    console.log('[FileManagerService] saveEncryptedFile: END', { uuid, durationMs: end - start, timestamp: end });

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
  static async loadEncryptedFile(uuid: string, key: Uint8Array): Promise<{
    fileData: Uint8Array;
    metadata: FileMetadata;
  }> {
    const start = Date.now();
    this.checkKey(key, 'loadEncryptedFile');
    const filePath = this.getFilePath(uuid, 'file');
    const metadataPath = this.getFilePath(uuid, 'metadata');

    // Read encrypted file as base64
    const fileBase64 = await RNFS.readFile(filePath, 'base64');
    const encryptedFile = Buffer.from(fileBase64, 'base64');

    // Read encrypted metadata as base64
    const metadataBase64 = await RNFS.readFile(metadataPath, 'base64');
    const encryptedMetadata = Buffer.from(metadataBase64, 'base64');

    // Decrypt and return
    const result = await EncryptionUtils.decryptFile(
      new Uint8Array(encryptedFile),
      new Uint8Array(encryptedMetadata),
      key
    );
    const end = Date.now();
    console.log('[FileManagerService] loadEncryptedFile: END', { uuid, durationMs: end - start, timestamp: end });
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
      const metadataBase64 = await RNFS.readFile(metadataPath, 'base64');
      if (!metadataBase64) {
        throw new Error('metadataBase64 is empty');
      }
      const encryptedMetadata = Buffer.from(metadataBase64, 'base64');
      // Ensure we have a true Uint8Array
      let encryptedMetadataBytes: Uint8Array;
      if (encryptedMetadata instanceof Uint8Array) {
        encryptedMetadataBytes = encryptedMetadata;
      } else if (encryptedMetadata && typeof encryptedMetadata === 'object' && 'buffer' in encryptedMetadata && 'byteOffset' in encryptedMetadata && 'byteLength' in encryptedMetadata) {
        encryptedMetadataBytes = new Uint8Array(
          (encryptedMetadata as any).buffer,
          (encryptedMetadata as any).byteOffset,
          (encryptedMetadata as any).byteLength
        );
      } else if (encryptedMetadata && typeof encryptedMetadata === 'object' && (encryptedMetadata as any).constructor && (encryptedMetadata as any).constructor.name === 'ArrayBuffer') {
        encryptedMetadataBytes = new Uint8Array(encryptedMetadata as ArrayBuffer);
      } else {
        throw new Error('encryptedMetadata is not a valid byte array');
      }
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
      const files = await RNFS.readDir(this.documentsPath);
      const metadataFiles = files.filter(file => file.name.endsWith('.metadata.enc'));
      
      const encryptedFiles: EncryptedFile[] = [];
      
      for (const metadataFile of metadataFiles) {
        const uuid = metadataFile.name.replace('.metadata.enc', '');
        
        try {
          const metadata = await this.loadFileMetadata(uuid, key);
          
          const filePath = this.getFilePath(uuid, 'file');
          const metadataPath = this.getFilePath(uuid, 'metadata');
          const previewPath = this.getFilePath(uuid, 'preview');
          
          // Check if preview exists
          const previewExists = await RNFS.exists(previewPath);
          
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
      const end = Date.now();
    console.log('[FileManagerService] listEncryptedFiles: END', { count: encryptedFiles.length, durationMs: end - start, timestamp: end });
      return encryptedFiles.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
    } catch (error) {
      console.error('Failed to list encrypted files:', error);
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
      if (await RNFS.exists(filePath)) {
        await RNFS.unlink(filePath);
      }

      // Delete metadata
      if (await RNFS.exists(metadataPath)) {
        await RNFS.unlink(metadataPath);
      }

      // Delete preview if exists
      if (await RNFS.exists(previewPath)) {
        await RNFS.unlink(previewPath);
      }

      return true;
    } catch (error) {
      console.error('Failed to delete encrypted file:', error);
      return false;
    }
  }

  /**
   * Deletes all files in the app's document directory (not just encrypted ones)
   */
  static async deleteAllFiles(derivedKey: Uint8Array): Promise<number> {
    const files = await RNFS.readDir(this.documentsPath);
    const metadataFiles = files.filter(file => file.name.endsWith('.metadata.enc'));
    let deletedCount = 0;
    for (const metadataFile of metadataFiles) {
      const uuid = metadataFile.name.replace('.metadata.enc', '');
      try {
        // Try to decrypt metadata
        await this.loadFileMetadata(uuid, derivedKey);
        // If successful, delete the triplet
        const filePath = this.getFilePath(uuid, 'file');
        const metadataPath = this.getFilePath(uuid, 'metadata');
        const previewPath = this.getFilePath(uuid, 'preview');
        if (await RNFS.exists(filePath)) await RNFS.unlink(filePath);
        if (await RNFS.exists(metadataPath)) await RNFS.unlink(metadataPath);
        if (await RNFS.exists(previewPath)) await RNFS.unlink(previewPath);
        deletedCount++;
      } catch (e) {
        // Could not decrypt metadata, skip
        continue;
      }
    }
    return deletedCount;
  }

  /**
   * Gets file preview data
   */
  static async getFilePreview(uuid: string, key: Uint8Array): Promise<Uint8Array | null> {
    const start = Date.now();
    this.checkKey(key, 'getFilePreview');
    const previewPath = this.getFilePath(uuid, 'preview');
    
    try {
      if (!(await RNFS.exists(previewPath))) {
        return null;
      }
      
      // Read encrypted preview as base64
      const previewBase64 = await RNFS.readFile(previewPath, 'base64');
      const encryptedPreview = Buffer.from(previewBase64, 'base64');
      const previewBuffer = await EncryptionUtils.decryptData(new Uint8Array(encryptedPreview), key);
      const end = Date.now();
      console.log('[FileManagerService] getFilePreview: END', { uuid, durationMs: end - start, timestamp: end });
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
