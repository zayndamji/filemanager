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

  // saves an encrypted video file as chunks (1MB each) to the file system
  static async saveEncryptedVideoChunked(
    fileData: Uint8Array,
    originalFileName: string,
    mimeType: string,
    key: Uint8Array,
    folderPath: string[] = [],
    tags: string[] = []
  ): Promise<EncryptedFile> {
    const start = Date.now();
    this.checkKey(key, 'saveEncryptedVideoChunked');
    
    // Generate UUID for this video
    const uuid = EncryptionUtils.generateUUID();
    console.log('[FileManagerService] saveEncryptedVideoChunked: START', { uuid, originalFileName, fileSize: fileData.length });

    // Create metadata with additional video information
    const metadata: FileMetadata = {
      name: originalFileName,
      type: mimeType,
      size: fileData.length,
      folderPath,
      tags,
      uuid,
      encryptedAt: new Date().toISOString(),
      version: '2.0' // Version 2.0 indicates chunked format
    };

    // Add video-specific metadata
    const chunkSize = 1024 * 1024; // 1 MB
    const totalChunks = Math.ceil(fileData.length / chunkSize);
    const videoMetadata = {
      ...metadata,
      isChunked: true,
      chunkSize,
      totalChunks,
      originalSize: fileData.length
    };

    console.log('[FileManagerService] Video chunking info:', { 
      totalSize: fileData.length, 
      chunkSize, 
      totalChunks 
    });

    // Encrypt and save each chunk as individual files
    for (let i = 0; i < totalChunks; i++) {
      const chunkStart = i * chunkSize;
      const chunkEnd = Math.min(chunkStart + chunkSize, fileData.length);
      const chunkData = fileData.slice(chunkStart, chunkEnd);
      
      console.log(`[FileManagerService] Processing chunk ${i + 1}/${totalChunks}, size: ${chunkData.length} bytes`);
      
      // Encrypt the chunk
      const encryptedChunk = await EncryptionUtils.encryptData(chunkData, key);
      
      // Save chunk as individual file
      const chunkFileName = `${uuid}.${i}.chunk.enc`;
      const chunkBase64 = uint8ArrayToBase64(encryptedChunk);
      await FileSystem.writeFile(chunkFileName, chunkBase64, 'base64');
      
      console.log(`[FileManagerService] Saved chunk ${i + 1}/${totalChunks}: ${chunkFileName}`);
    }

    // Encrypt metadata
    const metadataString = JSON.stringify(videoMetadata);
    const metadataBuffer = new TextEncoder().encode(metadataString);
    const encryptedMetadata = await EncryptionUtils.encryptData(metadataBuffer, key);

    // Write encrypted metadata as base64
    const metadataPath = this.getFilePath(uuid, 'metadata');
    const metadataBase64 = uint8ArrayToBase64(encryptedMetadata);
    await FileSystem.writeFile(`${uuid}.metadata.enc`, metadataBase64, 'base64');

    const end = Date.now();
    console.log('[FileManagerService] saveEncryptedVideoChunked: END', { 
      uuid, 
      totalChunks, 
      metadataPath, 
      chunkFilePattern: `${uuid}.*.chunk.enc`,
      durationMs: end - start, 
      timestamp: end 
    });

    return {
      uuid,
      metadata: videoMetadata,
      filePath: `${uuid}.chunks`, // Indicate this is a chunked video (logical reference)
      metadataPath,
      previewPath: undefined, // No preview for chunked videos
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

  // loads an encrypted chunked video from the file system
  static async loadEncryptedVideoChunked(
    uuid: string, 
    key: Uint8Array, 
    abortSignal?: AbortSignal, 
    progressCallback?: (chunkIndex: number, totalChunks: number) => void,
    targetTempPath?: string  // Optional path for temp file reconstruction
  ): Promise<{
    fileData?: Uint8Array;
    tempFilePath?: string;
    metadata: FileMetadata;
    totalChunks: number;
  }> {
    const start = Date.now();
    this.checkKey(key, 'loadEncryptedVideoChunked');
    
    console.log('[FileManagerService] loadEncryptedVideoChunked: START', { uuid });

    // First, load metadata to get chunk information
    const metadata = await this.loadFileMetadata(uuid, key);
    const chunkedMetadata = metadata as any;
    
    if (!chunkedMetadata.isChunked || !chunkedMetadata.totalChunks) {
      throw new Error('File is not a chunked video or metadata is invalid');
    }

    const totalChunks = chunkedMetadata.totalChunks;
    const chunkSize = chunkedMetadata.chunkSize || (1024 * 1024);
    
    console.log('[FileManagerService] Chunked video info:', { 
      totalChunks, 
      chunkSize, 
      originalSize: chunkedMetadata.originalSize 
    });

    // Check if we should reconstruct to a temp file or return data
    if (targetTempPath) {
      // Reconstruct chunks directly to temp file for streaming
      console.log('[FileManagerService] Reconstructing video to temp file:', targetTempPath);
      
      const chunks: Uint8Array[] = [];
      
      for (let i = 0; i < totalChunks; i++) {
        if (abortSignal?.aborted) {
          throw new Error('Operation cancelled');
        }
        
        console.log(`[FileManagerService] Loading chunk ${i + 1}/${totalChunks}`);
        
        const chunkFileName = `${uuid}.${i}.chunk.enc`;
        const chunkBase64 = await FileSystem.readFile(chunkFileName, 'base64');
        const encryptedChunk = base64ToUint8Array(chunkBase64);
        
        // Decrypt chunk
        const decryptedChunkBuffer = await EncryptionUtils.decryptData(encryptedChunk, key, abortSignal);
        const decryptedChunk = new Uint8Array(decryptedChunkBuffer);
        
        chunks.push(decryptedChunk);
        
        // Call progress callback
        if (progressCallback) {
          progressCallback(i + 1, totalChunks);
        }
        
        console.log(`[FileManagerService] Decrypted chunk ${i + 1}/${totalChunks}, size: ${decryptedChunk.length} bytes`);
      }
      
      // Combine all chunks
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combinedData = new Uint8Array(totalSize);
      let offset = 0;
      
      for (const chunk of chunks) {
        combinedData.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Create temp file
      const tempPath = await this.createTempFile(combinedData, metadata.name);
      
      const end = Date.now();
      console.log('[FileManagerService] loadEncryptedVideoChunked: END (temp file)', { 
        uuid, 
        tempPath, 
        totalChunks, 
        durationMs: end - start, 
        timestamp: end 
      });
      
      return {
        tempFilePath: tempPath,
        metadata,
        totalChunks
      };
    } else {
      // Return combined data in memory
      console.log('[FileManagerService] Loading chunked video into memory');
      
      const chunks: Uint8Array[] = [];
      
      for (let i = 0; i < totalChunks; i++) {
        if (abortSignal?.aborted) {
          throw new Error('Operation cancelled');
        }
        
        console.log(`[FileManagerService] Loading chunk ${i + 1}/${totalChunks}`);
        
        const chunkFileName = `${uuid}.${i}.chunk.enc`;
        const chunkBase64 = await FileSystem.readFile(chunkFileName, 'base64');
        const encryptedChunk = base64ToUint8Array(chunkBase64);
        
        // Decrypt chunk
        const decryptedChunkBuffer = await EncryptionUtils.decryptData(encryptedChunk, key, abortSignal);
        const decryptedChunk = new Uint8Array(decryptedChunkBuffer);
        
        chunks.push(decryptedChunk);
        
        // Call progress callback
        if (progressCallback) {
          progressCallback(i + 1, totalChunks);
        }
        
        console.log(`[FileManagerService] Decrypted chunk ${i + 1}/${totalChunks}, size: ${decryptedChunk.length} bytes`);
      }
      
      // Combine all chunks
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const combinedData = new Uint8Array(totalSize);
      let offset = 0;
      
      for (const chunk of chunks) {
        combinedData.set(chunk, offset);
        offset += chunk.length;
      }
      
      const end = Date.now();
      console.log('[FileManagerService] loadEncryptedVideoChunked: END (in memory)', { 
        uuid, 
        totalChunks, 
        totalSize, 
        durationMs: end - start, 
        timestamp: end 
      });
      
      return {
        fileData: combinedData,
        metadata,
        totalChunks
      };
    }
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
      const chunksDirectoryName = `${uuid}.chunks.enc`;

      // Try to read metadata to check if this is a chunked video
      let isChunked = false;
      try {
        if ((Platform.OS as any) === 'web') {
          const metadataBase64 = await FileSystem.readFile(`${uuid}.metadata.enc`, 'base64');
          // For web, we can try to check if chunks exist by listing files
          const files = await FileSystem.listFiles();
          isChunked = files.some((file: any) => {
            const fileName = typeof file === 'string' ? file : file.name;
            return fileName.startsWith(`${uuid}.`) && fileName.includes('.chunk.enc');
          });
        }
      } catch {
        // If we can't read metadata, assume it's not chunked
        isChunked = false;
      }

      // Delete main file
      if ((Platform.OS as any) === 'web') {
        // Try to delete each file, ignore errors if file doesn't exist
        try { await FileSystem.unlink(`${uuid}.enc`); } catch {}
        try { await FileSystem.unlink(`${uuid}.metadata.enc`); } catch {}
        try { await FileSystem.unlink(`${uuid}.preview.enc`); } catch {}
        
        // If this is a chunked video, delete the chunk files
        if (isChunked) {
          try {
            console.log(`[FileManagerService] Deleting chunked video files for UUID: ${uuid}`);
            const files = await FileSystem.listFiles();
            const chunkFiles = files.filter((file: any) => {
              const fileName = typeof file === 'string' ? file : file.name;
              return fileName.startsWith(`${uuid}.`) && fileName.includes('.chunk.enc');
            });
            
            for (const chunkFile of chunkFiles) {
              try {
                const fileName = typeof chunkFile === 'string' ? chunkFile : chunkFile.name;
                await FileSystem.unlink(fileName);
                console.log(`[FileManagerService] Deleted chunk: ${fileName}`);
              } catch (chunkError) {
                console.warn(`[FileManagerService] Failed to delete chunk ${chunkFile}:`, chunkError);
              }
            }
          } catch (chunksError) {
            console.warn(`[FileManagerService] Failed to delete chunk files:`, chunksError);
          }
        }
        
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
        
        // For native, check if chunk files exist and delete them
        if (isChunked) {
          try {
            console.log(`[FileManagerService] Deleting chunked video files for UUID: ${uuid}`);
            const files = await FileSystem.readDir();
            const chunkFiles = files.filter((file: any) => {
              const fileName = file.name || file;
              return fileName.startsWith(`${uuid}.`) && fileName.includes('.chunk.enc');
            });
            
            for (const chunkFile of chunkFiles) {
              try {
                const fileName = chunkFile.name || chunkFile;
                await FileSystem.unlink(fileName);
                console.log(`[FileManagerService] Deleted chunk: ${fileName}`);
              } catch (chunkError) {
                const fileName = chunkFile.name || chunkFile;
                console.warn(`[FileManagerService] Failed to delete chunk ${fileName}:`, chunkError);
              }
            }
          } catch (chunksError) {
            console.warn(`[FileManagerService] Failed to delete chunk files:`, chunksError);
          }
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
