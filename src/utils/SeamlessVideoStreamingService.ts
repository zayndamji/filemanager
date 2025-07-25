import { Platform } from 'react-native';
import { FileManagerService } from '../utils/FileManagerService';

interface StreamingSegment {
  index: number;
  data: Uint8Array | null;
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

interface StreamingState {
  segments: Map<number, StreamingSegment>;
  totalSegments: number;
  currentSegment: number;
  bufferAhead: number;
  maxCacheSize: number;
}

export class SeamlessVideoStreamingService {
  private static streamingStates = new Map<string, StreamingState>();
  
  /**
   * Initialize streaming for a video file
   */
  static async initializeStreaming(
    uuid: string,
    key: Uint8Array,
    bufferAhead: number = 3,
    maxCacheSize: number = 10
  ): Promise<{
    totalSegments: number;
    getSegment: (index: number) => Promise<Uint8Array>;
    preloadSegments: (startIndex: number, count: number) => Promise<void>;
    cleanupCache: () => void;
  }> {
    console.log('[SeamlessVideoStreamingService] Initializing streaming for:', uuid);
    
    // Load HLS metadata to get segment info
    const metadata = await FileManagerService.loadFileMetadata(uuid, key);
    
    if (!(metadata as any).isHLS || (metadata as any).version !== '3.0') {
      throw new Error('File is not a valid HLS video');
    }
    
    const totalSegments = (metadata as any).segmentCount;
    
    // Initialize streaming state
    const streamingState: StreamingState = {
      segments: new Map(),
      totalSegments,
      currentSegment: 0,
      bufferAhead,
      maxCacheSize
    };
    
    this.streamingStates.set(uuid, streamingState);
    
    // Create segment getter function
    const getSegment = async (index: number): Promise<Uint8Array> => {
      return this.getSegmentWithCache(uuid, index, key);
    };
    
    // Create preload function
    const preloadSegments = async (startIndex: number, count: number): Promise<void> => {
      const promises: Promise<void>[] = [];
      for (let i = startIndex; i < Math.min(startIndex + count, totalSegments); i++) {
        promises.push(this.preloadSegment(uuid, i, key));
      }
      await Promise.all(promises);
    };
    
    // Create cleanup function
    const cleanupCache = (): void => {
      this.cleanupOldSegments(uuid);
    };
    
    console.log('[SeamlessVideoStreamingService] Streaming initialized:', {
      uuid,
      totalSegments,
      bufferAhead,
      maxCacheSize
    });
    
    return {
      totalSegments,
      getSegment,
      preloadSegments,
      cleanupCache
    };
  }
  
  /**
   * Get a segment with intelligent caching
   */
  private static async getSegmentWithCache(
    uuid: string,
    index: number,
    key: Uint8Array
  ): Promise<Uint8Array> {
    const state = this.streamingStates.get(uuid);
    if (!state) {
      throw new Error('Streaming not initialized for UUID: ' + uuid);
    }
    
    // Check if segment is already cached
    const cached = state.segments.get(index);
    if (cached?.loaded && cached.data) {
      console.log(`[SeamlessVideoStreamingService] Serving cached segment ${index}`);
      
      // Update current segment and trigger background preloading
      state.currentSegment = Math.max(state.currentSegment, index);
      this.backgroundPreload(uuid, key);
      
      return cached.data;
    }
    
    // If segment is currently loading, wait for it
    if (cached?.loading) {
      console.log(`[SeamlessVideoStreamingService] Waiting for segment ${index} to load`);
      return this.waitForSegment(uuid, index);
    }
    
    // Load the segment
    console.log(`[SeamlessVideoStreamingService] Loading segment ${index} on-demand`);
    return this.loadSegmentDirect(uuid, index, key);
  }
  
  /**
   * Preload a segment without blocking
   */
  private static async preloadSegment(
    uuid: string,
    index: number,
    key: Uint8Array
  ): Promise<void> {
    const state = this.streamingStates.get(uuid);
    if (!state || index >= state.totalSegments) return;
    
    const cached = state.segments.get(index);
    if (cached?.loaded || cached?.loading) return;
    
    // Mark as loading
    state.segments.set(index, {
      index,
      data: null,
      loading: true,
      loaded: false,
      error: null
    });
    
    try {
      const data = await this.loadSegmentDirect(uuid, index, key);
      state.segments.set(index, {
        index,
        data,
        loading: false,
        loaded: true,
        error: null
      });
      
      console.log(`[SeamlessVideoStreamingService] Preloaded segment ${index} (${data.length} bytes)`);
      
      // Cleanup old segments if cache is getting too large
      if (state.segments.size > state.maxCacheSize) {
        this.cleanupOldSegments(uuid);
      }
      
    } catch (error) {
      console.error(`[SeamlessVideoStreamingService] Failed to preload segment ${index}:`, error);
      state.segments.set(index, {
        index,
        data: null,
        loading: false,
        loaded: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Load segment directly from storage
   */
  private static async loadSegmentDirect(
    uuid: string,
    index: number,
    key: Uint8Array
  ): Promise<Uint8Array> {
    const state = this.streamingStates.get(uuid);
    if (!state) {
      throw new Error('Streaming not initialized');
    }
    
    // Mark as loading
    state.segments.set(index, {
      index,
      data: null,
      loading: true,
      loaded: false,
      error: null
    });
    
    try {
      // Use the existing HLS segment loading from FileManagerService
      const segmentPath = `${uuid}.ts.${index}.enc`;
      let encryptedSegment: Uint8Array;
      
      if (Platform.OS === 'web') {
        const FileSystem = require('../utils/FileSystem').FileSystem;
        const { base64ToUint8Array } = require('../utils/Base64Utils');
        const segmentBase64 = await FileSystem.readFile(segmentPath, 'base64');
        encryptedSegment = base64ToUint8Array(segmentBase64);
      } else {
        const RNFS = require('react-native-fs');
        const { base64ToUint8Array } = require('../utils/Base64Utils');
        const segmentBase64 = await RNFS.readFile(`${RNFS.DocumentDirectoryPath}/${segmentPath}`, 'base64');
        encryptedSegment = base64ToUint8Array(segmentBase64);
      }
      
      // Decrypt segment
      const { EncryptionUtils } = require('../utils/EncryptionUtils');
      const segmentBuffer = await EncryptionUtils.decryptData(encryptedSegment, key);
      const segmentData = new Uint8Array(segmentBuffer);
      
      // Cache the loaded segment
      state.segments.set(index, {
        index,
        data: segmentData,
        loading: false,
        loaded: true,
        error: null
      });
      
      console.log(`[SeamlessVideoStreamingService] Loaded segment ${index} (${segmentData.length} bytes)`);
      return segmentData;
      
    } catch (error) {
      console.error(`[SeamlessVideoStreamingService] Failed to load segment ${index}:`, error);
      state.segments.set(index, {
        index,
        data: null,
        loading: false,
        loaded: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  /**
   * Wait for a segment that's currently loading
   */
  private static async waitForSegment(uuid: string, index: number): Promise<Uint8Array> {
    const state = this.streamingStates.get(uuid);
    if (!state) {
      throw new Error('Streaming not initialized');
    }
    
    const maxWaitTime = 10000; // 10 seconds
    const pollInterval = 100; // 100ms
    let waited = 0;
    
    while (waited < maxWaitTime) {
      const segment = state.segments.get(index);
      if (segment?.loaded && segment.data) {
        return segment.data;
      }
      if (segment?.error) {
        throw new Error(`Segment ${index} failed to load: ${segment.error}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      waited += pollInterval;
    }
    
    throw new Error(`Timeout waiting for segment ${index}`);
  }
  
  /**
   * Background preloading of upcoming segments
   */
  private static backgroundPreload(uuid: string, key: Uint8Array): void {
    const state = this.streamingStates.get(uuid);
    if (!state) return;
    
    // Preload upcoming segments
    const startIndex = state.currentSegment + 1;
    const endIndex = Math.min(startIndex + state.bufferAhead, state.totalSegments);
    
    for (let i = startIndex; i < endIndex; i++) {
      // Don't await - let this run in background
      this.preloadSegment(uuid, i, key).catch(err => {
        console.warn(`[SeamlessVideoStreamingService] Background preload failed for segment ${i}:`, err);
      });
    }
  }
  
  /**
   * Clean up old segments to manage memory
   */
  private static cleanupOldSegments(uuid: string): void {
    const state = this.streamingStates.get(uuid);
    if (!state) return;
    
    const keepRange = Math.max(state.bufferAhead, 5);
    const minIndex = Math.max(0, state.currentSegment - keepRange);
    const maxIndex = Math.min(state.totalSegments - 1, state.currentSegment + state.bufferAhead + keepRange);
    
    // Remove segments outside the keep range
    const segmentsToRemove: number[] = [];
    for (const [index] of state.segments) {
      if (index < minIndex || index > maxIndex) {
        segmentsToRemove.push(index);
      }
    }
    
    for (const index of segmentsToRemove) {
      state.segments.delete(index);
    }
    
    if (segmentsToRemove.length > 0) {
      console.log(`[SeamlessVideoStreamingService] Cleaned up ${segmentsToRemove.length} old segments`);
    }
  }
  
  /**
   * Get streaming statistics
   */
  static getStreamingStats(uuid: string): {
    totalSegments: number;
    cachedSegments: number;
    currentSegment: number;
    cacheHitRatio: number;
  } | null {
    const state = this.streamingStates.get(uuid);
    if (!state) return null;
    
    const cachedSegments = Array.from(state.segments.values()).filter(s => s.loaded).length;
    const cacheHitRatio = state.totalSegments > 0 ? cachedSegments / state.totalSegments : 0;
    
    return {
      totalSegments: state.totalSegments,
      cachedSegments,
      currentSegment: state.currentSegment,
      cacheHitRatio
    };
  }
  
  /**
   * Destroy streaming state for a video
   */
  static destroyStreaming(uuid: string): void {
    console.log('[SeamlessVideoStreamingService] Destroying streaming for:', uuid);
    this.streamingStates.delete(uuid);
  }
  
  /**
   * Destroy all streaming states (cleanup)
   */
  static destroyAllStreaming(): void {
    console.log('[SeamlessVideoStreamingService] Destroying all streaming states');
    this.streamingStates.clear();
  }
}

export default SeamlessVideoStreamingService;
