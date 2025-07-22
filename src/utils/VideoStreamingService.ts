import { Platform } from 'react-native';
import { FileManagerService } from './FileManagerService';
import { EncryptionUtils } from './EncryptionUtils';
import { base64ToUint8Array, uint8ArrayToBase64 } from './Base64Utils';
import * as FileSystem from './FileSystem';

// Constants for video streaming
const CHUNK_SIZE = 512 * 1024; // 512KB chunks for streaming
const INITIAL_BUFFER_SIZE = 2 * 1024 * 1024; // 2MB initial buffer
const PREFETCH_CHUNKS = 3; // Number of chunks to prefetch ahead

interface VideoChunkMetadata {
  chunkIndex: number;
  startByte: number;
  endByte: number;
  size: number;
  encrypted: boolean;
}

interface VideoStreamingMetadata {
  uuid: string;
  totalSize: number;
  totalChunks: number;
  chunkSize: number;
  mimeType: string;
  fileName: string;
  duration?: number;
  chunks: VideoChunkMetadata[];
}

interface VideoChunk {
  index: number;
  data: Uint8Array;
  startByte: number;
  endByte: number;
}

export class VideoStreamingService {
  private static chunkCache = new Map<string, Uint8Array>(); // uuid:chunkIndex -> data
  private static streamingMetadata = new Map<string, VideoStreamingMetadata>();
  private static maxCacheSize = 100; // Maximum chunks to keep in memory (increased for full file caching)
  private static activeDecryptions = new Map<string, Promise<Uint8Array>>(); // Track active decryption promises

  /**
   * Prepares a video file for streaming by creating chunk metadata
   * Called during upload to store video streaming information
   */
  static async prepareVideoForStreaming(
    uuid: string,
    fileData: Uint8Array,
    mimeType: string,
    fileName: string,
    key: Uint8Array
  ): Promise<VideoStreamingMetadata> {
    console.log('[VideoStreamingService] Preparing video for streaming:', {
      uuid,
      fileSize: fileData.length,
      mimeType,
      fileName,
      chunkSize: CHUNK_SIZE
    });

    const totalSize = fileData.length;
    const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
    
    const chunks: VideoChunkMetadata[] = [];
    
    // Create chunk metadata
    for (let i = 0; i < totalChunks; i++) {
      const startByte = i * CHUNK_SIZE;
      const endByte = Math.min(startByte + CHUNK_SIZE, totalSize);
      
      chunks.push({
        chunkIndex: i,
        startByte,
        endByte,
        size: endByte - startByte,
        encrypted: true
      });
    }

    const streamingMetadata: VideoStreamingMetadata = {
      uuid,
      totalSize,
      totalChunks,
      chunkSize: CHUNK_SIZE,
      mimeType,
      fileName,
      chunks
    };

    // Store streaming metadata alongside the encrypted file
    await this.saveStreamingMetadata(uuid, streamingMetadata, key);
    this.streamingMetadata.set(uuid, streamingMetadata);

    console.log('[VideoStreamingService] Video streaming metadata prepared:', {
      uuid,
      totalChunks,
      chunkSize: CHUNK_SIZE
    });

    return streamingMetadata;
  }

  /**
   * Loads streaming metadata for a video file
   */
  static async loadStreamingMetadata(uuid: string, key: Uint8Array): Promise<VideoStreamingMetadata | null> {
    // Check if already loaded
    if (this.streamingMetadata.has(uuid)) {
      return this.streamingMetadata.get(uuid)!;
    }

    try {
      const metadataPath = `${uuid}.streaming.enc`;
      let metadataBase64: string;
      
      if ((Platform.OS as any) === 'web') {
        metadataBase64 = await FileSystem.readFile(metadataPath, 'base64');
      } else {
        const RNFS = require('react-native-fs');
        const documentsPath = RNFS.DocumentDirectoryPath;
        const fullPath = `${documentsPath}/${metadataPath}`;
        metadataBase64 = await RNFS.readFile(fullPath, 'base64');
      }

      const encryptedMetadata = base64ToUint8Array(metadataBase64);
      const metadataBuffer = await EncryptionUtils.decryptData(encryptedMetadata, key);
      const metadataString = new TextDecoder().decode(metadataBuffer);
      const metadata = JSON.parse(metadataString) as VideoStreamingMetadata;

      this.streamingMetadata.set(uuid, metadata);
      return metadata;
    } catch (error) {
      console.log('[VideoStreamingService] No streaming metadata found for:', uuid);
      return null;
    }
  }

  /**
   * Loads a specific chunk of video data efficiently (without loading full file)
   */
  static async loadVideoChunk(
    uuid: string,
    chunkIndex: number,
    key: Uint8Array,
    abortSignal?: AbortSignal
  ): Promise<VideoChunk | null> {
    const cacheKey = `${uuid}:${chunkIndex}`;
    
    // Check cache first
    if (this.chunkCache.has(cacheKey)) {
      console.log('[VideoStreamingService] Chunk loaded from cache:', chunkIndex);
      const data = this.chunkCache.get(cacheKey)!;
      const metadata = this.streamingMetadata.get(uuid);
      const chunkMeta = metadata?.chunks[chunkIndex];
      
      if (chunkMeta) {
        return {
          index: chunkIndex,
          data,
          startByte: chunkMeta.startByte,
          endByte: chunkMeta.endByte
        };
      }
    }

    // Check if operation was cancelled
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }

    try {
      console.log('[VideoStreamingService] Loading video chunk efficiently:', { uuid, chunkIndex });
      
      // Get metadata to know chunk boundaries
      const metadata = this.streamingMetadata.get(uuid);
      if (!metadata || chunkIndex >= metadata.totalChunks) {
        throw new Error('Invalid chunk index or missing metadata');
      }

      const chunkMeta = metadata.chunks[chunkIndex];
      
      // For now, we still need to load the full file since AES-GCM doesn't support partial decryption
      // In a future version, we could:
      // 1. Store each chunk as a separate encrypted file
      // 2. Use a streaming cipher mode like AES-CTR
      // 3. Implement custom chunk-level encryption
      
      // TODO: Optimize this to avoid loading full file
      // Current limitation: AES-GCM requires full ciphertext for authentication
      console.log('[VideoStreamingService] Note: Currently loading full file due to AES-GCM limitations');
      
      // Check if we already have the full file decrypted and cached
      const fullFileKey = `${uuid}:fullFile`;
      let fullFileData: Uint8Array;
      
      if (this.chunkCache.has(fullFileKey)) {
        console.log('[VideoStreamingService] Using cached full file data');
        fullFileData = this.chunkCache.get(fullFileKey)!;
      } else {
        console.log('[VideoStreamingService] Loading and decrypting full file (one-time operation)');
        
        const filePath = `${uuid}.enc`;
        let fileBase64: string;
        
        if ((Platform.OS as any) === 'web') {
          fileBase64 = await FileSystem.readFile(filePath, 'base64');
        } else {
          const RNFS = require('react-native-fs');
          const documentsPath = RNFS.DocumentDirectoryPath;
          const fullPath = `${documentsPath}/${filePath}`;
          fileBase64 = await RNFS.readFile(fullPath, 'base64');
        }

        if (abortSignal?.aborted) {
          throw new Error('Operation cancelled');
        }

        const encryptedFile = base64ToUint8Array(fileBase64);
        
        // Decrypt the entire file once
        const fileBuffer = await EncryptionUtils.decryptData(encryptedFile, key, abortSignal);
        fullFileData = new Uint8Array(fileBuffer);

        if (abortSignal?.aborted) {
          throw new Error('Operation cancelled');
        }

        // Cache the full decrypted file data for subsequent chunk requests
        this.chunkCache.set(fullFileKey, fullFileData);
        console.log('[VideoStreamingService] Full file cached for efficient chunk access');
      }

      // Extract the requested chunk from the cached full file
      const chunkData = fullFileData.slice(chunkMeta.startByte, chunkMeta.endByte);

      // Cache the individual chunk as well
      this.chunkCache.set(cacheKey, chunkData);
      this.limitCacheSize();

      console.log('[VideoStreamingService] Chunk extracted efficiently:', {
        chunkIndex,
        size: chunkData.length,
        startByte: chunkMeta.startByte,
        endByte: chunkMeta.endByte,
        fromCache: this.chunkCache.has(fullFileKey)
      });

      return {
        index: chunkIndex,
        data: chunkData,
        startByte: chunkMeta.startByte,
        endByte: chunkMeta.endByte
      };

    } catch (error) {
      console.error('[VideoStreamingService] Failed to load chunk:', error);
      return null;
    }
  }

  /**
   * Creates a streaming data URI that loads minimal initial data and shows progress
   */
  static async createStreamingDataUri(
    uuid: string,
    key: Uint8Array,
    abortSignal?: AbortSignal
  ): Promise<string | null> {
    try {
      console.log('[VideoStreamingService] Creating lightweight streaming data URI for:', uuid);
      
      // Load streaming metadata
      const metadata = await this.loadStreamingMetadata(uuid, key);
      if (!metadata) {
        console.log('[VideoStreamingService] No streaming metadata available, falling back to full load');
        return null;
      }

      console.log('[VideoStreamingService] Streaming metadata loaded:', {
        totalChunks: metadata.totalChunks,
        totalSize: metadata.totalSize,
        chunkSize: metadata.chunkSize
      });

      // For now, return a placeholder that indicates streaming is available
      // The actual video loading will happen in the background
      return 'streaming://ready';

    } catch (error) {
      console.error('[VideoStreamingService] Failed to create streaming data URI:', error);
      return null;
    }
  }

  /**
   * Helper method to decrypt full file with progress reporting
   */
  private static async decryptFullFile(
    uuid: string,
    key: Uint8Array,
    metadata: VideoStreamingMetadata,
    onProgress?: (loaded: number, total: number) => void,
    abortSignal?: AbortSignal
  ): Promise<Uint8Array> {
    const startTime = Date.now();
    console.log(`[VideoStreamingService] [${new Date().toISOString()}] Loading and decrypting full file with progress...`);
    
    // Load the encrypted file
    const filePath = `${uuid}.enc`;
    let fileBase64: string;
    
    const loadStartTime = Date.now();
    if ((Platform.OS as any) === 'web') {
      fileBase64 = await FileSystem.readFile(filePath, 'base64');
    } else {
      const RNFS = require('react-native-fs');
      const documentsPath = RNFS.DocumentDirectoryPath;
      const fullPath = `${documentsPath}/${filePath}`;
      fileBase64 = await RNFS.readFile(fullPath, 'base64');
    }
    console.log(`[VideoStreamingService] File loaded in ${Date.now() - loadStartTime}ms`);

    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }

    onProgress?.(metadata.totalSize * 0.1, metadata.totalSize); // File loaded, starting decryption

    const encryptedFile = base64ToUint8Array(fileBase64);
    console.log(`[VideoStreamingService] Starting decryption of ${encryptedFile.length} bytes...`);
    
    // Use a more responsive progress tracking
    const progressInterval = setInterval(() => {
      if (!abortSignal?.aborted) {
        // More realistic progress simulation
        const elapsed = Date.now() - startTime;
        const progressPercent = Math.min(0.9, 0.1 + (elapsed / 30000) * 0.8); // Reach 90% in 30 seconds
        onProgress?.(metadata.totalSize * progressPercent, metadata.totalSize);
      }
    }, 500); // Update every 500ms for smoother progress

    const decryptStartTime = Date.now();
    const fileBuffer = await EncryptionUtils.decryptData(encryptedFile, key, abortSignal);
    clearInterval(progressInterval);
    console.log(`[VideoStreamingService] Decryption completed in ${Date.now() - decryptStartTime}ms`);

    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }

    const fullFileData = new Uint8Array(fileBuffer);

    // Cache the full decrypted file
    const fullFileKey = `${uuid}:fullFile`;
    this.chunkCache.set(fullFileKey, fullFileData);
    console.log(`[VideoStreamingService] Full file decrypted and cached (total time: ${Date.now() - startTime}ms)`);
    
    onProgress?.(metadata.totalSize, metadata.totalSize); // Complete
    
    return fullFileData;
  }

  /**
   * Creates a complete video blob with progress reporting during decryption
   * Videos need to be complete to be playable, so we load the full file with progress
   */
  static async createProgressiveVideoBlob(
    uuid: string,
    key: Uint8Array,
    onProgress?: (loaded: number, total: number) => void,
    abortSignal?: AbortSignal,
    existingFileData?: Uint8Array // Allow passing already decrypted data
  ): Promise<string | null> {
    try {
      const startTime = Date.now();
      console.log(`[VideoStreamingService] [${new Date().toISOString()}] Creating complete video blob with progress for:`, uuid);
      
      // Load streaming metadata
      const metadata = await this.loadStreamingMetadata(uuid, key);
      if (!metadata) {
        console.log('[VideoStreamingService] No streaming metadata available');
        return null;
      }

      console.log('[VideoStreamingService] Video blob creation initialized:', {
        totalChunks: metadata.totalChunks,
        totalSize: metadata.totalSize,
        chunkSize: metadata.chunkSize,
        strategy: 'Complete file decryption with progress',
        hasExistingData: !!existingFileData
      });

      // Check if we already have the full file cached or passed to us
      const fullFileKey = `${uuid}:fullFile`;
      let fullFileData: Uint8Array | undefined;
      
      if (existingFileData) {
        console.log('[VideoStreamingService] ✅ Using provided file data - instant playback!');
        fullFileData = existingFileData;
        // Cache it for future use
        this.chunkCache.set(fullFileKey, fullFileData);
        onProgress?.(metadata.totalSize, metadata.totalSize);
      } else if (this.chunkCache.has(fullFileKey)) {
        console.log('[VideoStreamingService] ✅ Using cached full file - instant playback!');
        fullFileData = this.chunkCache.get(fullFileKey)!;
        onProgress?.(metadata.totalSize, metadata.totalSize);
      } else {
        // Check if there's already an active decryption for this file
        if (this.activeDecryptions.has(uuid)) {
          console.log('[VideoStreamingService] ⏳ Waiting for existing decryption to complete...');
          try {
            fullFileData = await this.activeDecryptions.get(uuid)!;
            console.log('[VideoStreamingService] ✅ Existing decryption completed, using result');
            onProgress?.(metadata.totalSize, metadata.totalSize);
          } catch (error) {
            console.error('[VideoStreamingService] Existing decryption failed:', error);
            // Continue with new decryption attempt below
            this.activeDecryptions.delete(uuid);
          }
        }
        
        if (!fullFileData) {
          console.log('[VideoStreamingService] Starting new decryption...');
          
          // Create decryption promise and store it
          const decryptionPromise = this.decryptFullFile(uuid, key, metadata, onProgress, abortSignal);
          this.activeDecryptions.set(uuid, decryptionPromise);
          
          try {
            fullFileData = await decryptionPromise;
            console.log('[VideoStreamingService] ✅ New decryption completed');
          } finally {
            this.activeDecryptions.delete(uuid);
          }
        }
      }

      if (!fullFileData) {
        throw new Error('Failed to decrypt video file');
      }

      // Verify file integrity
      if (fullFileData.length !== metadata.totalSize) {
        console.warn(`[VideoStreamingService] File size mismatch: expected ${metadata.totalSize}, got ${fullFileData.length}`);
      }

      // Create blob URL for complete video data
      let blobUrl: string;
      const blobStartTime = Date.now();
      
      if ((Platform.OS as any) === 'web') {
        try {
          const blob = new (globalThis as any).Blob([fullFileData], { type: metadata.mimeType });
          blobUrl = (globalThis as any).URL.createObjectURL(blob);
          console.log(`[VideoStreamingService] ✅ Web video blob created successfully in ${Date.now() - blobStartTime}ms`);
        } catch (error) {
          console.warn('[VideoStreamingService] Failed to create blob, using data URI:', error);
          const base64Data = uint8ArrayToBase64(fullFileData);
          blobUrl = `data:${metadata.mimeType};base64,${base64Data}`;
        }
      } else {
        // For native platforms, use base64 data URI with normalized MIME type
        const base64StartTime = Date.now();
        const base64Data = uint8ArrayToBase64(fullFileData);
        console.log(`[VideoStreamingService] Base64 conversion took ${Date.now() - base64StartTime}ms`);
        
        // Normalize MIME type for better React Native Video compatibility
        let normalizedMimeType = metadata.mimeType;
        if (metadata.mimeType === 'video/quicktime') {
          normalizedMimeType = 'video/mp4'; // React Native Video handles mp4 data URIs better
          console.log('[VideoStreamingService] Normalized QuickTime MIME type to video/mp4 for React Native Video compatibility');
        }
        
        blobUrl = `data:${normalizedMimeType};base64,${base64Data}`;
        console.log(`[VideoStreamingService] ✅ Native video data URI created successfully (${base64Data.length} chars)`);
      }

      console.log(`[VideoStreamingService] ✅ Complete video ready for playback! Total time: ${Date.now() - startTime}ms`, {
        totalSize: metadata.totalSize,
        fileSize: fullFileData.length,
        mimeType: metadata.mimeType,
        fromCache: this.chunkCache.has(fullFileKey),
        dataUriLength: blobUrl.length
      });

      return blobUrl;

    } catch (error) {
      console.error('[VideoStreamingService] Failed to create video blob:', error);
      return null;
    }
  }

  /**
   * Loads remaining video chunks progressively with progress reporting (DEPRECATED)
   * This method is kept for backwards compatibility but not used in the new approach
   */
  private static async loadRemainingChunksProgressively(
    uuid: string,
    startFromChunk: number,
    key: Uint8Array,
    metadata: VideoStreamingMetadata,
    onProgress?: (loaded: number, total: number) => void,
    abortSignal?: AbortSignal
  ): Promise<void> {
    // This method is deprecated - we now load the complete file for proper video playback
    console.log('[VideoStreamingService] Progressive chunk loading is deprecated - using complete file approach');
  }

  /**
   * Prefetches remaining video chunks in the background
   */
  private static async prefetchRemainingChunks(
    uuid: string,
    startFromChunk: number,
    key: Uint8Array
  ): Promise<void> {
    try {
      const metadata = this.streamingMetadata.get(uuid);
      if (!metadata) return;

      console.log('[VideoStreamingService] Starting background prefetch from chunk:', startFromChunk);

      // Prefetch remaining chunks with delay to avoid blocking UI
      for (let i = startFromChunk; i < metadata.totalChunks; i++) {
        // Small delay between chunks to keep UI responsive
        await new Promise(resolve => setTimeout(resolve, 100));
        
        try {
          await this.loadVideoChunk(uuid, i, key);
          console.log('[VideoStreamingService] Prefetched chunk:', i);
        } catch (error) {
          console.warn('[VideoStreamingService] Failed to prefetch chunk:', i, error);
          // Continue with next chunk
        }
      }

      console.log('[VideoStreamingService] Background prefetch completed for:', uuid);
    } catch (error) {
      console.error('[VideoStreamingService] Background prefetch failed:', error);
    }
  }

  /**
   * Gets video chunk for a specific byte range (for HTTP range requests simulation)
   */
  static async getVideoRange(
    uuid: string,
    startByte: number,
    endByte: number,
    key: Uint8Array,
    abortSignal?: AbortSignal
  ): Promise<Uint8Array | null> {
    try {
      const metadata = this.streamingMetadata.get(uuid);
      if (!metadata) {
        await this.loadStreamingMetadata(uuid, key);
      }

      const meta = this.streamingMetadata.get(uuid);
      if (!meta) return null;

      // Find which chunks we need
      const startChunk = Math.floor(startByte / meta.chunkSize);
      const endChunk = Math.floor(endByte / meta.chunkSize);
      
      const chunks: VideoChunk[] = [];
      for (let i = startChunk; i <= endChunk; i++) {
        if (abortSignal?.aborted) {
          throw new Error('Operation cancelled');
        }
        
        const chunk = await this.loadVideoChunk(uuid, i, key, abortSignal);
        if (chunk) {
          chunks.push(chunk);
        }
      }

      if (chunks.length === 0) return null;

      // Combine chunks and extract the requested range
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.data.length, 0);
      const buffer = new Uint8Array(totalSize);
      let offset = 0;
      
      for (const chunk of chunks) {
        buffer.set(chunk.data, offset);
        offset += chunk.data.length;
      }

      // Calculate the offset within the combined buffer
      const startOffset = startByte - (startChunk * meta.chunkSize);
      const length = Math.min(endByte - startByte + 1, buffer.length - startOffset);
      
      return buffer.slice(startOffset, startOffset + length);

    } catch (error) {
      console.error('[VideoStreamingService] Failed to get video range:', error);
      return null;
    }
  }

  /**
   * Saves streaming metadata to encrypted storage
   */
  private static async saveStreamingMetadata(
    uuid: string,
    metadata: VideoStreamingMetadata,
    key: Uint8Array
  ): Promise<void> {
    const metadataString = JSON.stringify(metadata);
    const metadataBuffer = new TextEncoder().encode(metadataString);
    const encryptedMetadata = await EncryptionUtils.encryptData(metadataBuffer, key);
    
    const metadataPath = `${uuid}.streaming.enc`;
    const metadataBase64 = uint8ArrayToBase64(encryptedMetadata);
    
    if ((Platform.OS as any) === 'web') {
      await FileSystem.writeFile(metadataPath, metadataBase64, 'base64');
    } else {
      const RNFS = require('react-native-fs');
      const documentsPath = RNFS.DocumentDirectoryPath;
      const fullPath = `${documentsPath}/${metadataPath}`;
      await RNFS.writeFile(fullPath, metadataBase64, 'base64');
    }

    console.log('[VideoStreamingService] Streaming metadata saved:', metadataPath);
  }

  /**
   * Limits cache size to prevent memory issues
   */
  private static limitCacheSize(): void {
    if (this.chunkCache.size > this.maxCacheSize) {
      const entries = Array.from(this.chunkCache.entries());
      
      // Separate full file entries from chunk entries
      const fullFileEntries = entries.filter(([key]) => key.includes(':fullFile'));
      const chunkEntries = entries.filter(([key]) => !key.includes(':fullFile'));
      
      console.log('[VideoStreamingService] Cache limit reached:', {
        total: this.chunkCache.size,
        fullFiles: fullFileEntries.length,
        chunks: chunkEntries.length,
        maxSize: this.maxCacheSize
      });
      
      // Keep full file entries (they're most valuable for performance)
      // Remove older individual chunks first
      const chunksToDelete = chunkEntries.slice(0, chunkEntries.length - (this.maxCacheSize - fullFileEntries.length - 10));
      
      for (const [key] of chunksToDelete) {
        this.chunkCache.delete(key);
      }
      
      console.log('[VideoStreamingService] Cache size limited, removed', chunksToDelete.length, 'chunk entries, kept', fullFileEntries.length, 'full file entries');
    }
  }

  /**
   * Clears all cached data for a specific video
   */
  static clearVideoCache(uuid: string): void {
    const keysToDelete = Array.from(this.chunkCache.keys()).filter(key => key.startsWith(`${uuid}:`));
    keysToDelete.forEach(key => this.chunkCache.delete(key));
    this.streamingMetadata.delete(uuid);
    this.activeDecryptions.delete(uuid);
    
    console.log('[VideoStreamingService] Cleared cache for video:', uuid, 'entries removed:', keysToDelete.length);
  }

  /**
   * Clears all cached data
   */
  static clearAllCache(): void {
    this.chunkCache.clear();
    this.streamingMetadata.clear();
    this.activeDecryptions.clear();
    
    console.log('[VideoStreamingService] All cache cleared');
  }

  /**
   * Gets cache statistics
   */
  static getCacheStats(): { cachedChunks: number; cachedVideos: number; memorySizeKB: number; fullFilesCached: number } {
    const memorySizeKB = Array.from(this.chunkCache.values())
      .reduce((sum, chunk) => sum + chunk.length, 0) / 1024;
    
    const fullFilesCached = Array.from(this.chunkCache.keys())
      .filter(key => key.includes(':fullFile')).length;
    
    return {
      cachedChunks: this.chunkCache.size - fullFilesCached,
      cachedVideos: this.streamingMetadata.size,
      memorySizeKB: Math.round(memorySizeKB),
      fullFilesCached
    };
  }
}
