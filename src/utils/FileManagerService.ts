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
   * Creates a temporary directory (cross-platform)
   */
  static async createTempDirectory(): Promise<string> {
    const tempDirName = `temp_dir_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    
    if ((Platform.OS as any) === 'web') {
      // For web, we'll just return a logical directory name
      // (actual file system operations will be handled differently)
      return tempDirName;
    } else if (RNFS) {
      // For native platforms, create actual directory
      const tempDirPath = `${RNFS.TemporaryDirectoryPath}/${tempDirName}`;
      await RNFS.mkdir(tempDirPath);
      console.log('[FileManagerService] Created temp directory:', tempDirPath);
      return tempDirPath;
    }
    
    throw new Error('File system not available');
  }

  /**
   * Deletes a temporary directory (cross-platform)
   */
  static async deleteTempDirectory(tempDirPath: string): Promise<void> {
    try {
      if ((Platform.OS as any) === 'web') {
        // For web, this is mostly a no-op since we don't create real directories
        console.log('[FileManagerService] Cleaned up temp directory (web):', tempDirPath);
      } else if (RNFS) {
        // For native platforms, remove the actual directory
        await RNFS.unlink(tempDirPath);
        console.log('[FileManagerService] Deleted temp directory:', tempDirPath);
      }
    } catch (error) {
      console.warn('[FileManagerService] Failed to delete temp directory:', tempDirPath, error);
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

  /**
   * Saves an HLS video with playlist and segments as separate encrypted files
   */
  static async saveEncryptedHLSVideo(
    playlistData: Uint8Array,
    playlistFileName: string,
    playlistMimeType: string,
    segmentFiles: Array<{ name: string; type: string; size?: number; uri?: string; webFile?: File }>,
    key: Uint8Array,
    folderPath: string[] = [],
    tags: string[] = []
  ): Promise<{
    uuid: string;
    metadata: FileMetadata;
    filePath: string;
    metadataPath: string;
    isEncrypted: boolean;
  }> {
    const start = Date.now();
    this.checkKey(key, 'saveEncryptedHLSVideo');

    const uuid = EncryptionUtils.generateUUID();
    console.log('[FileManagerService] saveEncryptedHLSVideo: START', { 
      uuid, 
      playlistFileName, 
      segmentCount: segmentFiles.length,
      playlistSize: playlistData.length 
    });

    // Read all segment file data
    const segmentDataArray: Uint8Array[] = [];
    for (let i = 0; i < segmentFiles.length; i++) {
      const segment = segmentFiles[i];
      let segmentData: Uint8Array;

      if (segment.webFile) {
        // Web File object
        const arrayBuffer = await segment.webFile.arrayBuffer();
        segmentData = new Uint8Array(arrayBuffer);
      } else if (segment.uri && Platform.OS !== 'web' && RNFS) {
        // Native file URI
        const segmentBase64 = await RNFS.readFile(segment.uri, 'base64');
        segmentData = base64ToUint8Array(segmentBase64);
      } else {
        console.error(`[FileManagerService] No valid data source for segment: ${segment.name}`);
        throw new Error(`Cannot read segment file: ${segment.name}`);
      }

      segmentDataArray.push(segmentData);
      console.log(`[FileManagerService] Read segment ${i}: ${segment.name}, size: ${segmentData.length} bytes`);
    }

    // Encrypt and save playlist file
    console.log('[FileManagerService] Encrypting HLS playlist');
    const encryptedPlaylist = await EncryptionUtils.encryptData(playlistData, key);
    const playlistPath = `${uuid}.m3u8.enc`;
    
    if ((Platform.OS as any) === 'web') {
      const playlistBase64 = uint8ArrayToBase64(encryptedPlaylist);
      await FileSystem.writeFile(playlistPath, playlistBase64, 'base64');
    } else if (RNFS) {
      const playlistBase64 = uint8ArrayToBase64(encryptedPlaylist);
      await RNFS.writeFile(`${RNFS.DocumentDirectoryPath}/${playlistPath}`, playlistBase64, 'base64');
    }

    // Encrypt and save segment files
    console.log('[FileManagerService] Encrypting HLS segments');
    for (let i = 0; i < segmentDataArray.length; i++) {
      const segmentData = segmentDataArray[i];
      const encryptedSegment = await EncryptionUtils.encryptData(segmentData, key);
      const segmentPath = `${uuid}.ts.${i}.enc`;
      
      if ((Platform.OS as any) === 'web') {
        const segmentBase64 = uint8ArrayToBase64(encryptedSegment);
        await FileSystem.writeFile(segmentPath, segmentBase64, 'base64');
      } else if (RNFS) {
        const segmentBase64 = uint8ArrayToBase64(encryptedSegment);
        await RNFS.writeFile(`${RNFS.DocumentDirectoryPath}/${segmentPath}`, segmentBase64, 'base64');
      }
      
      console.log(`[FileManagerService] Saved encrypted segment ${i}: ${segmentPath}`);
    }

    // Create metadata for HLS video
    const totalSize = playlistData.length + segmentDataArray.reduce((sum, data) => sum + data.length, 0);
    const hlsMetadata: FileMetadata & { 
      isHLS: boolean; 
      segmentCount: number; 
      segmentFiles: string[];
      version: string;
    } = {
      name: playlistFileName,
      type: playlistMimeType,
      size: totalSize,
      folderPath,
      tags,
      uuid,
      encryptedAt: new Date().toISOString(),
      version: '3.0', // HLS version
      isHLS: true,
      segmentCount: segmentFiles.length,
      segmentFiles: segmentFiles.map(f => f.name)
    };

    // Encrypt and save metadata
    console.log('[FileManagerService] Encrypting HLS metadata');
    const metadataJson = JSON.stringify(hlsMetadata);
    const metadataBytes = new TextEncoder().encode(metadataJson);
    const encryptedMetadata = await EncryptionUtils.encryptData(metadataBytes, key);
    const metadataPath = `${uuid}.metadata.enc`;
    
    if ((Platform.OS as any) === 'web') {
      const metadataBase64 = uint8ArrayToBase64(encryptedMetadata);
      await FileSystem.writeFile(metadataPath, metadataBase64, 'base64');
    } else if (RNFS) {
      const metadataBase64 = uint8ArrayToBase64(encryptedMetadata);
      await RNFS.writeFile(`${RNFS.DocumentDirectoryPath}/${metadataPath}`, metadataBase64, 'base64');
    }

    const end = Date.now();
    console.log('[FileManagerService] saveEncryptedHLSVideo: END', { 
      uuid, 
      segmentCount: segmentFiles.length,
      totalSize,
      metadataPath,
      durationMs: end - start, 
      timestamp: end 
    });

    return {
      uuid,
      metadata: hlsMetadata,
      filePath: `${uuid}.hls`, // Indicate this is an HLS video
      metadataPath,
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

  // Loads a single encrypted chunk for progressive streaming
  static async loadEncryptedChunk(
    uuid: string,
    chunkIndex: number,
    key: Uint8Array,
    abortSignal?: AbortSignal
  ): Promise<Uint8Array | null> {
    try {
      this.checkKey(key, 'loadEncryptedChunk');
      
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled');
      }
      
      console.log(`[FileManagerService] Loading chunk ${chunkIndex} for uuid: ${uuid}`);
      
      const chunkFileName = `${uuid}.${chunkIndex}.chunk.enc`;
      const chunkBase64 = await FileSystem.readFile(chunkFileName, 'base64');
      const encryptedChunk = base64ToUint8Array(chunkBase64);
      
      // Decrypt chunk
      const decryptedChunkBuffer = await EncryptionUtils.decryptData(encryptedChunk, key, abortSignal);
      const decryptedChunk = new Uint8Array(decryptedChunkBuffer);
      
      console.log(`[FileManagerService] Successfully loaded chunk ${chunkIndex}, size: ${decryptedChunk.length} bytes`);
      return decryptedChunk;
      
    } catch (error) {
      if (abortSignal?.aborted) {
        console.log(`[FileManagerService] Chunk ${chunkIndex} loading was cancelled`);
        return null;
      }
      console.error(`[FileManagerService] Error loading chunk ${chunkIndex}:`, error);
      return null;
    }
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
   * Loads an HLS video playlist and provides on-demand segment decryption
   */
  static async loadEncryptedHLSVideo(
    uuid: string,
    key: Uint8Array,
    abortSignal?: AbortSignal
  ): Promise<{
    playlistData: Uint8Array;
    metadata: FileMetadata & { isHLS: boolean; segmentCount: number; segmentFiles: string[] };
    getSegment: (segmentIndex: number) => Promise<Uint8Array>;
  }> {
    const start = Date.now();
    this.checkKey(key, 'loadEncryptedHLSVideo');

    console.log('[FileManagerService] loadEncryptedHLSVideo: START', { uuid });

    // Load metadata first to verify this is an HLS video
    const metadata = await this.loadFileMetadata(uuid, key) as FileMetadata & { 
      isHLS: boolean; 
      segmentCount: number; 
      segmentFiles: string[];
      version: string;
    };

    if (!metadata.isHLS || metadata.version !== '3.0') {
      throw new Error('This is not a valid HLS video file');
    }

    console.log('[FileManagerService] HLS metadata loaded:', { 
      segmentCount: metadata.segmentCount,
      version: metadata.version 
    });

    // Check cancellation
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }

    // Load and decrypt the playlist (.m3u8) file
    console.log('[FileManagerService] Loading HLS playlist');
    const playlistPath = `${uuid}.m3u8.enc`;
    let encryptedPlaylist: Uint8Array;

    if ((Platform.OS as any) === 'web') {
      const playlistBase64 = await FileSystem.readFile(playlistPath, 'base64');
      encryptedPlaylist = base64ToUint8Array(playlistBase64);
    } else if (RNFS) {
      const playlistBase64 = await RNFS.readFile(`${RNFS.DocumentDirectoryPath}/${playlistPath}`, 'base64');
      encryptedPlaylist = base64ToUint8Array(playlistBase64);
    } else {
      throw new Error('File system not available');
    }

    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }

    const playlistBuffer = await EncryptionUtils.decryptData(encryptedPlaylist, key, abortSignal);
    const playlistData = new Uint8Array(playlistBuffer);

    console.log('[FileManagerService] HLS playlist decrypted, size:', playlistData.length);

    // Create a function to decrypt segments on demand
    const getSegment = async (segmentIndex: number): Promise<Uint8Array> => {
      if (segmentIndex < 0 || segmentIndex >= metadata.segmentCount) {
        throw new Error(`Invalid segment index: ${segmentIndex}. Valid range: 0-${metadata.segmentCount - 1}`);
      }

      console.log(`[FileManagerService] Loading HLS segment ${segmentIndex}`);
      const segmentPath = `${uuid}.ts.${segmentIndex}.enc`;
      let encryptedSegment: Uint8Array;

      if ((Platform.OS as any) === 'web') {
        const segmentBase64 = await FileSystem.readFile(segmentPath, 'base64');
        encryptedSegment = base64ToUint8Array(segmentBase64);
      } else if (RNFS) {
        const segmentBase64 = await RNFS.readFile(`${RNFS.DocumentDirectoryPath}/${segmentPath}`, 'base64');
        encryptedSegment = base64ToUint8Array(segmentBase64);
      } else {
        throw new Error('File system not available');
      }

      const segmentBuffer = await EncryptionUtils.decryptData(encryptedSegment, key);
      const segmentData = new Uint8Array(segmentBuffer);
      
      console.log(`[FileManagerService] HLS segment ${segmentIndex} decrypted, size:`, segmentData.length);
      return segmentData;
    };

    const end = Date.now();
    console.log('[FileManagerService] loadEncryptedHLSVideo: END', { 
      uuid, 
      segmentCount: metadata.segmentCount,
      playlistSize: playlistData.length,
      durationMs: end - start, 
      timestamp: end 
    });

    return {
      playlistData,
      metadata,
      getSegment
    };
  }

  /**
   * Loads encrypted file metadata only
   */
  static async loadFileMetadata(uuid: string, key: Uint8Array): Promise<FileMetadata> {
    this.checkKey(key, 'loadFileMetadata');
    console.log('[FileManagerService] loadFileMetadata: START', { uuid });
    
    try {
      // Read encrypted metadata as base64
      let metadataBase64: string;
      const metadataFilename = `${uuid}.metadata.enc`;
      console.log('[FileManagerService] loadFileMetadata: Attempting to read file:', metadataFilename);
      
      metadataBase64 = await FileSystem.readFile(metadataFilename, 'base64');
      console.log('[FileManagerService] loadFileMetadata: Successfully read metadata file, length:', metadataBase64?.length || 0);
      
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
        console.log('[FileManagerService] loadFileMetadata: Successfully decrypted metadata');
      } catch (e) {
        console.error('Failed to decrypt metadata for', uuid, e);
        throw e;
      }
      const metadata = JSON.parse(metadataString) as FileMetadata;
      console.log('[FileManagerService] loadFileMetadata: SUCCESS', { uuid, metadata });
      return metadata;
    } catch (error) {
      console.error('[FileManagerService] loadFileMetadata: ERROR for', uuid, error);
      throw new Error(`Failed to load file metadata: ${error instanceof Error ? error.message : String(error)}`);
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

      // Try to read metadata to check if this is a chunked video or HLS video
      let isChunked = false;
      let isHLS = false;
      let segmentCount = 0;
      try {
        if ((Platform.OS as any) === 'web') {
          const metadataBase64 = await FileSystem.readFile(`${uuid}.metadata.enc`, 'base64');
          const encryptedMetadata = base64ToUint8Array(metadataBase64);
          // We can't decrypt without key, so check file patterns instead
          const files = await FileSystem.listFiles();
          isChunked = files.some((file: any) => {
            const fileName = typeof file === 'string' ? file : file.name;
            return fileName.startsWith(`${uuid}.`) && fileName.includes('.chunk.enc');
          });
          isHLS = files.some((file: any) => {
            const fileName = typeof file === 'string' ? file : file.name;
            return fileName === `${uuid}.m3u8.enc`;
          });
          if (isHLS) {
            // Count HLS segments
            segmentCount = files.filter((file: any) => {
              const fileName = typeof file === 'string' ? file : file.name;
              return fileName.startsWith(`${uuid}.ts.`) && fileName.endsWith('.enc');
            }).length;
          }
        }
      } catch {
        // If we can't read metadata, assume it's not chunked or HLS
        isChunked = false;
        isHLS = false;
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
        
        // If this is an HLS video, delete the playlist and segment files
        if (isHLS) {
          try {
            console.log(`[FileManagerService] Deleting HLS video files for UUID: ${uuid} (${segmentCount} segments)`);
            
            // Delete playlist file
            try { await FileSystem.unlink(`${uuid}.m3u8.enc`); } catch {}
            
            // Delete segment files
            for (let i = 0; i < segmentCount; i++) {
              try {
                await FileSystem.unlink(`${uuid}.ts.${i}.enc`);
                console.log(`[FileManagerService] Deleted HLS segment: ${uuid}.ts.${i}.enc`);
              } catch (segmentError) {
                console.warn(`[FileManagerService] Failed to delete HLS segment ${i}:`, segmentError);
              }
            }
          } catch (hlsError) {
            console.warn(`[FileManagerService] Failed to delete HLS files:`, hlsError);
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
            const files = await FileSystem.readDir(this.getDocumentsPath());
            const chunkFiles = files.filter((file: any) => {
              const fileName = file.name || file;
              return fileName.startsWith(`${uuid}.`) && fileName.includes('.chunk.enc');
            });
            
            for (const chunkFile of chunkFiles) {
              try {
                const fileName = chunkFile.name || chunkFile;
                const fullPath = `${this.getDocumentsPath()}/${fileName}`;
                await FileSystem.unlink(fullPath);
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
        
        // For native, check if HLS files exist and delete them
        if (isHLS) {
          try {
            console.log(`[FileManagerService] Deleting HLS video files for UUID: ${uuid} (${segmentCount} segments)`);
            
            // Delete playlist file
            try { 
              const playlistPath = `${this.getDocumentsPath()}/${uuid}.m3u8.enc`;
              await FileSystem.unlink(playlistPath); 
            } catch {}
            
            // Delete segment files
            for (let i = 0; i < segmentCount; i++) {
              try {
                const segmentPath = `${this.getDocumentsPath()}/${uuid}.ts.${i}.enc`;
                await FileSystem.unlink(segmentPath);
                console.log(`[FileManagerService] Deleted HLS segment: ${uuid}.ts.${i}.enc`);
              } catch (segmentError) {
                console.warn(`[FileManagerService] Failed to delete HLS segment ${i}:`, segmentError);
              }
            }
          } catch (hlsError) {
            console.warn(`[FileManagerService] Failed to delete HLS files:`, hlsError);
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
   * Removes duplicate HLS videos that have the same name but different UUIDs
   * Keeps the most recent version based on encryptedAt timestamp
   */
  static async cleanupDuplicateHLSVideos(key: Uint8Array): Promise<{ removedCount: number, keptVideos: string[] }> {
    this.checkKey(key, 'cleanupDuplicateHLSVideos');
    
    try {
      const allFiles = await this.listEncryptedFiles(key);
      const hlsFiles = allFiles.filter(file => 
        (file.metadata as any).isHLS === true && 
        (file.metadata as any).version === '3.0'
      );
      
      console.log(`[FileManagerService] Found ${hlsFiles.length} HLS video files`);
      
      // Group by name
      const groupedByName = new Map<string, typeof hlsFiles>();
      for (const file of hlsFiles) {
        const name = file.metadata.name;
        if (!groupedByName.has(name)) {
          groupedByName.set(name, []);
        }
        groupedByName.get(name)!.push(file);
      }
      
      let removedCount = 0;
      const keptVideos: string[] = [];
      
      for (const [name, duplicates] of groupedByName.entries()) {
        if (duplicates.length > 1) {
          console.log(`[FileManagerService] Found ${duplicates.length} duplicates of "${name}"`);
          
          // Sort by encryptedAt timestamp (newest first)
          duplicates.sort((a, b) => 
            new Date(b.metadata.encryptedAt).getTime() - new Date(a.metadata.encryptedAt).getTime()
          );
          
          // Keep the newest, delete the rest
          const toKeep = duplicates[0];
          const toDelete = duplicates.slice(1);
          
          keptVideos.push(`${toKeep.metadata.name} (${toKeep.uuid})`);
          
          for (const duplicate of toDelete) {
            console.log(`[FileManagerService] Deleting duplicate HLS video: ${duplicate.metadata.name} (${duplicate.uuid})`);
            try {
              await this.deleteEncryptedFile(duplicate.uuid);
              removedCount++;
            } catch (error) {
              console.warn(`[FileManagerService] Failed to delete duplicate ${duplicate.uuid}:`, error);
            }
          }
        } else {
          keptVideos.push(`${duplicates[0].metadata.name} (${duplicates[0].uuid})`);
        }
      }
      
      console.log(`[FileManagerService] Cleanup complete: removed ${removedCount} duplicates, kept ${keptVideos.length} videos`);
      return { removedCount, keptVideos };
    } catch (error) {
      console.error('[FileManagerService] Error during HLS cleanup:', error);
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
