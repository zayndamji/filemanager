import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform, Alert } from 'react-native';
import { useFileManagerService } from '../../hooks/useFileManagerService';
import { EncryptedFile } from '../../utils/FileManagerService';
import { ThemeContext } from '../../theme';

// Conditionally import HLS.js for web platform
let Hls: any = null;
if (Platform.OS === 'web') {
  try {
    // Try direct require first
    let hlsModule = require('hls.js');
    console.log('[VideoFile] HLS.js raw module import:', { 
      module: !!hlsModule, 
      type: typeof hlsModule,
      default: !!hlsModule.default,
      isFunction: typeof hlsModule === 'function',
      isDefaultFunction: typeof hlsModule.default === 'function',
      constructorName: hlsModule.constructor?.name,
      defaultConstructorName: hlsModule.default?.constructor?.name,
      keys: Object.keys(hlsModule || {}),
      prototype: !!hlsModule.prototype,
      defaultPrototype: !!hlsModule.default?.prototype,
      string: String(hlsModule).substring(0, 200), // First 200 chars
      defaultString: String(hlsModule.default).substring(0, 200)
    });
    
    // Try the specific approach for HLS.js v1.x
    if (hlsModule && hlsModule.default && typeof hlsModule.default === 'function') {
      Hls = hlsModule.default;
      console.log('[VideoFile] Using HLS.js default export (ES6 module)');
    } else if (typeof hlsModule === 'function') {
      Hls = hlsModule;
      console.log('[VideoFile] Using HLS.js direct export (CommonJS)');
    } else if (hlsModule && typeof hlsModule.Hls === 'function') {
      Hls = hlsModule.Hls;
      console.log('[VideoFile] Using HLS.js named export');
    } else {
      // Try alternative import patterns for webpack/bundler compatibility
      console.log('[VideoFile] Trying alternative import patterns...');
      try {
        const hlsDefault = require('hls.js').default;
        if (typeof hlsDefault === 'function') {
          Hls = hlsDefault;
          console.log('[VideoFile] Using require("hls.js").default');
        }
      } catch (e) {
        console.warn('[VideoFile] Alternative import failed:', e);
      }
      
      if (!Hls) {
        try {
          // Try dynamic import as last resort
          console.log('[VideoFile] Trying dynamic import...');
          import('hls.js').then(module => {
            console.log('[VideoFile] Dynamic import result:', module);
            if (module.default && typeof module.default === 'function') {
              Hls = module.default;
              console.log('[VideoFile] Successfully loaded HLS.js via dynamic import');
            }
          }).catch(e => {
            console.error('[VideoFile] Dynamic import failed:', e);
          });
        } catch (e) {
          console.error('[VideoFile] Dynamic import not supported:', e);
        }
      }
    }
    
    // Verify the constructor works
    if (Hls) {
      console.log('[VideoFile] HLS.js constructor check:', {
        isFunction: typeof Hls === 'function',
        isSupported: typeof Hls.isSupported === 'function' ? Hls.isSupported() : 'no isSupported method',
        hasEvents: !!Hls.Events,
        hasErrorTypes: !!Hls.ErrorTypes
      });
    }
  } catch (e) {
    console.warn('[VideoFile] HLS.js main import failed:', e);
    // Try alternative paths
    try {
      const hlsDist = require('hls.js/dist/hls.js');
      console.log('[VideoFile] HLS.js dist import:', { 
        module: !!hlsDist,
        type: typeof hlsDist,
        isFunction: typeof hlsDist === 'function'
      });
      
      if (typeof hlsDist === 'function') {
        Hls = hlsDist;
      } else if (hlsDist && typeof hlsDist.default === 'function') {
        Hls = hlsDist.default;
      }
    } catch (e2) {
      console.warn('[VideoFile] All HLS.js imports failed:', e2);
    }
  }
}

// Conditionally import react-native-video for native platforms
let Video: any = null;
if (Platform.OS !== 'web') {
  try {
    const RNVideo = require('react-native-video');
    Video = RNVideo.default || RNVideo;
  } catch (e) {
    console.warn('react-native-video not available:', e);
  }
}

interface VideoFileProps {
  file: EncryptedFile;
  onError?: (error: string) => void;
}

const VideoFile: React.FC<VideoFileProps> = ({ file, onError }) => {
  const fileManagerService = useFileManagerService();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [hlsSupported, setHlsSupported] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const { theme } = React.useContext(ThemeContext);

  useEffect(() => {
    console.log('[VideoFile] useEffect triggered, file.uuid:', file.uuid);
    
    // Check HLS support on web
    if (Platform.OS === 'web') {
      const video = (global as any).document.createElement('video');
      const nativeHLS = video.canPlayType('application/vnd.apple.mpegurl') !== '';
      const hlsJsSupported = Hls && Hls.isSupported();
      setHlsSupported(nativeHLS || hlsJsSupported);
      console.log('[VideoFile] HLS support check:', { nativeHLS, hlsJsSupported, overall: nativeHLS || hlsJsSupported });
    } else {
      setHlsSupported(true); // react-native-video supports HLS on native platforms
    }
    
    // Reset initialization state when file changes
    setIsInitialized(false);
    loadVideo();
    
    return () => {
      // Cleanup on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (videoUrl && Platform.OS === 'web') {
        (global as any).URL.revokeObjectURL(videoUrl);
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      setIsInitialized(false);
    };
  }, [file.uuid]); // Only depend on file.uuid

  const loadVideo = async () => {
    // Prevent multiple simultaneous loads for the same operation
    if (loading && !error && isInitialized) {
      console.log('[VideoFile] Already loading, skipping duplicate load request');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setProgress(0);
      setIsInitialized(true);

      // Create abort controller for cancellation
      abortControllerRef.current = new AbortController();

      console.log('[VideoFile] Loading video for UUID:', file.uuid);
      
      // Check if this is an HLS video
      const metadata = await fileManagerService.loadFileMetadata(file.uuid);
      console.log('[VideoFile] Loaded metadata:', metadata);
      
      const isHLS = (metadata as any).isHLS === true && (metadata as any).version === '3.0';

      if (isHLS) {
        console.log('[VideoFile] Loading HLS video:', file.uuid);
        await loadHLSVideo();
      } else if ((metadata as any).isChunked) {
        console.log('[VideoFile] Loading chunked video:', file.uuid);
        await loadChunkedVideo();
      } else {
        console.log('[VideoFile] Loading standard video:', file.uuid);
        await loadStandardVideo();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load video';
      console.error('[VideoFile] Error loading video:', err);
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadHLSVideo = async () => {
    const { playlistData, metadata, getSegment } = await fileManagerService.loadEncryptedHLSVideo(
      file.uuid,
      abortControllerRef.current?.signal
    );

    const hlsMetadata = metadata as any;
    console.log('[VideoFile] HLS video loaded:', {
      segmentCount: hlsMetadata.segmentCount,
      playlistSize: playlistData.length
    });

    if (Platform.OS === 'web') {
      // Check HLS.js support directly to avoid race condition with state
      const isHlsJsSupported = Hls && Hls.isSupported();
      console.log('[VideoFile] Direct HLS.js support check:', { Hls: !!Hls, isSupported: isHlsJsSupported });
      
      if (isHlsJsSupported) {
        console.log('[VideoFile] Using HLS.js for proper streaming playback');
        await loadHLSWithHlsJs(playlistData, hlsMetadata, getSegment);
      } else {
        console.log('[VideoFile] HLS.js not supported, falling back to concatenation');
        await loadHLSWithConcatenation(hlsMetadata, getSegment);
      }
    } else {
      // Native: react-native-video supports HLS natively
      console.log('[VideoFile] Using native HLS support on React Native');
      await loadHLSNative(playlistData, hlsMetadata, getSegment);
    }
  };

  const loadHLSWithHlsJs = async (playlistData: Uint8Array, hlsMetadata: any, getSegment: (index: number) => Promise<Uint8Array>) => {
    console.log('[VideoFile] Setting up HLS.js with AES decryption');
    
    // Pre-decrypt all segments using the provided getSegment function
    console.log('[VideoFile] Pre-decrypting segments for HLS.js...');
    const decryptedSegments: Uint8Array[] = [];
    const segmentUrls: string[] = [];
    
    for (let i = 0; i < hlsMetadata.segmentCount; i++) {
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Operation cancelled');
      }
      
      console.log(`[VideoFile] Decrypting segment ${i + 1}/${hlsMetadata.segmentCount}...`);
      const segmentData = await getSegment(i);
      decryptedSegments.push(segmentData);
      
      // Create blob URLs for decrypted segments
      const segmentBlob = new (global as any).Blob([segmentData.buffer], { type: 'video/mp2t' });
      const segmentUrl = (global as any).URL.createObjectURL(segmentBlob);
      segmentUrls.push(segmentUrl);
      
      const progress = ((i + 1) / hlsMetadata.segmentCount) * 50; // Use 50% for decryption progress
      setProgress(progress);
    }

    // Modify playlist to use blob URLs for decrypted segments
    const playlistText = new TextDecoder().decode(playlistData);
    const lines = playlistText.split('\n');
    let segmentIndex = 0;
    
    const modifiedLines = lines.map(line => {
      if (line.trim() && !line.startsWith('#')) {
        return segmentUrls[segmentIndex++] || line;
      }
      return line;
    });

    const modifiedPlaylist = modifiedLines.join('\n');
    console.log('[VideoFile] Created HLS playlist with decrypted segment blob URLs');

    // Initialize HLS.js with standard configuration (no custom loaders needed)
    if (hlsRef.current) {
      hlsRef.current.destroy();
    }

    // Create standard HLS.js configuration
    const hlsConfig = {
      debug: true,
      enableWorker: false,
      enableSoftwareAES: true,
      maxBufferLength: 30,
      maxMaxBufferLength: 600,
      // Standard HLS.js will handle the blob URLs normally
      xhrSetup: function(xhr: any, url: string) {
        console.log('[VideoFile] HLS.js XHR setup for URL:', url);
        // No special setup needed since we're using blob URLs
      }
    };

    console.log('[VideoFile] Creating HLS.js instance with standard configuration');
    
    // Detailed safety check before creating HLS.js instance
    console.log('[VideoFile] Final HLS constructor check:', {
      exists: !!Hls,
      type: typeof Hls,
      isFunction: typeof Hls === 'function',
      constructorName: Hls?.constructor?.name,
      prototype: !!Hls?.prototype,
      isSupported: typeof Hls?.isSupported === 'function' ? Hls.isSupported() : 'N/A',
      stringValue: String(Hls),
      keys: Object.keys(Hls || {}).slice(0, 10) // First 10 keys to avoid spam
    });
    
    if (!Hls) {
      // Try one more time with direct module access
      console.log('[VideoFile] HLS.js not found, trying direct module access...');
      try {
        const directModule = ((global as any).window?.Hls) || (global as any).Hls;
        if (directModule && typeof directModule === 'function') {
          Hls = directModule;
          console.log('[VideoFile] Found HLS.js on global/window object');
        } else {
          throw new Error('HLS.js constructor is null or undefined');
        }
      } catch (e) {
        throw new Error('HLS.js constructor is null or undefined');
      }
    }
    
    if (typeof Hls !== 'function') {
      throw new Error(`HLS.js constructor is not a function. Type: ${typeof Hls}, Constructor: ${Hls.constructor?.name}, String: ${String(Hls)}`);
    }
    
    if (typeof Hls.isSupported !== 'function') {
      throw new Error('HLS.js constructor does not have isSupported method');
    }
    
    if (!Hls.isSupported()) {
      throw new Error('HLS.js is not supported in this browser');
    }
    
    console.log('[VideoFile] All HLS.js constructor checks passed, creating instance...');
    
    // Create HLS.js instance with standard approach (no custom loaders)
    try {
      console.log('[VideoFile] Creating HLS.js instance with standard config...');
      hlsRef.current = new Hls(hlsConfig);
      console.log('[VideoFile] HLS.js instance created successfully:', {
        created: !!hlsRef.current,
        type: typeof hlsRef.current,
        constructorName: hlsRef.current?.constructor?.name
      });
    } catch (constructorError: any) {
      console.error('[VideoFile] HLS.js constructor failed:', {
        error: constructorError,
        message: constructorError?.message,
        stack: constructorError?.stack
      });
      
      // Try with minimal config as fallback
      try {
        console.log('[VideoFile] Trying HLS.js with minimal config...');
        hlsRef.current = new Hls({ debug: false });
        console.log('[VideoFile] HLS.js instance created with minimal config');
      } catch (minimalError: any) {
        console.error('[VideoFile] All instantiation methods failed:', {
          originalError: constructorError?.message,
          minimalError: minimalError?.message,
          hlsType: typeof Hls,
          hlsString: String(Hls).substring(0, 200)
        });
        throw new Error(`Failed to create HLS.js instance: ${constructorError?.message || 'Unknown error'}`);
      }
    }
    
    // Set up standard HLS.js error handling
    hlsRef.current.on(Hls.Events.ERROR, (event: any, data: any) => {
      console.error('[VideoFile] HLS.js error event:', {
        event,
        type: data.type,
        details: data.details,
        fatal: data.fatal,
        error: data.error,
        reason: data.reason,
        level: data.level,
        url: data.url,
        response: data.response,
        context: data.context,
        networkDetails: data.networkDetails,
        stats: data.stats,
        buffer: data.buffer,
        frag: data.frag
      });
      
      if (data.fatal) {
        console.error('[VideoFile] Fatal HLS.js error, attempting recovery...');
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log('[VideoFile] Fatal network error, trying to recover');
            try {
              hlsRef.current?.startLoad();
            } catch (recoveryError) {
              console.error('[VideoFile] Failed to recover from network error:', recoveryError);
              setError(`Network error: ${data.details || 'Unknown network error'}`);
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('[VideoFile] Fatal media error, trying to recover');
            try {
              hlsRef.current?.recoverMediaError();
            } catch (recoveryError) {
              console.error('[VideoFile] Failed to recover from media error:', recoveryError);
              setError(`Media error: ${data.details || 'Unknown media error'}`);
            }
            break;
          default:
            console.log('[VideoFile] Fatal error, cannot recover:', data.details);
            setError(`HLS playback error: ${data.details || 'internalException'}`);
            break;
        }
      } else {
        console.warn('[VideoFile] Non-fatal HLS.js error:', data.details);
      }
    });

    // Set up all event listeners for standard HLS.js operation
    hlsRef.current.on(Hls.Events.MEDIA_ATTACHED, () => {
      console.log('[VideoFile] HLS.js media attached');
      
      // Only load source if not already loaded
      if (hlsRef.current && !hlsRef.current.url) {
        // Create playlist blob and load it
        const playlistBlob = new (global as any).Blob([modifiedPlaylist], { type: 'application/vnd.apple.mpegurl' });
        const playlistUrl = (global as any).URL.createObjectURL(playlistBlob);
        
        console.log('[VideoFile] Loading HLS source with pre-decrypted segments:', playlistUrl);
        hlsRef.current.loadSource(playlistUrl);
        setProgress(60); // Show progress after decryption
      }
    });

    hlsRef.current.on(Hls.Events.MANIFEST_PARSED, (event: any, data: any) => {
      console.log('[VideoFile] HLS.js manifest parsed, ready for playback with pre-decrypted segments', data);
      setProgress(100); // Playlist is ready, segments are already decrypted
    });

    hlsRef.current.on(Hls.Events.FRAG_LOADING, (event: any, data: any) => {
      console.log('[VideoFile] HLS.js loading pre-decrypted fragment:', data.frag?.url || 'unknown URL');
    });

    hlsRef.current.on(Hls.Events.FRAG_LOADED, (event: any, data: any) => {
      console.log('[VideoFile] HLS.js pre-decrypted fragment loaded successfully:', data.frag?.url || 'unknown URL');
    });

    hlsRef.current.on(Hls.Events.FRAG_PARSING_INIT_SEGMENT, (event: any, data: any) => {
      console.log('[VideoFile] HLS.js parsing init segment');
    });

    hlsRef.current.on(Hls.Events.FRAG_PARSING_DATA, (event: any, data: any) => {
      console.log('[VideoFile] HLS.js parsing fragment data');
    });

    hlsRef.current.on(Hls.Events.FRAG_PARSED, (event: any, data: any) => {
      console.log('[VideoFile] HLS.js fragment parsed successfully');
    });

    hlsRef.current.on(Hls.Events.LEVEL_LOADED, (event: any, data: any) => {
      console.log('[VideoFile] HLS.js level loaded:', data);
    });

    // Attach the video element to HLS.js
    if (videoRef.current) {
      console.log('[VideoFile] Attaching video element to HLS.js');
      hlsRef.current.attachMedia(videoRef.current);
    }

    // Set a placeholder URL for the video element - HLS.js will handle the actual loading
    setVideoUrl('about:blank');
    console.log('[VideoFile] HLS.js setup complete with pre-decrypted segments');
  };

  const loadHLSWithConcatenation = async (hlsMetadata: any, getSegment: (index: number) => Promise<Uint8Array>) => {
    // This is a fallback approach - try to convert HLS to MP4 using MediaSource if available
    console.log('[VideoFile] Attempting HLS fallback conversion...');
    
    if (typeof (global as any).MediaSource !== 'undefined' && (global as any).MediaSource.isTypeSupported('video/mp4; codecs="avc1.64002a,mp4a.40.2"')) {
      console.log('[VideoFile] MediaSource API available, attempting MSE playback');
      await loadHLSWithMediaSource(hlsMetadata, getSegment);
      return;
    }
    
    console.warn('[VideoFile] MediaSource not available, falling back to concatenation');
    console.warn('[VideoFile] Note: Concatenated HLS playback may not work for all content types');
    
    const decryptedSegments: Uint8Array[] = [];
    let totalBytes = 0;
    
    for (let i = 0; i < hlsMetadata.segmentCount; i++) {
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Operation cancelled');
      }
      
      const segmentData = await getSegment(i);
      decryptedSegments.push(segmentData);
      totalBytes += segmentData.length;
      
      const progress = ((i + 1) / hlsMetadata.segmentCount) * 100;
      setProgress(progress);
      console.log(`[VideoFile] Decrypted segment ${i + 1}/${hlsMetadata.segmentCount} (${progress.toFixed(1)}%)`);
    }

    // Concatenate all segments into a single Uint8Array
    console.log(`[VideoFile] Concatenating ${decryptedSegments.length} segments (${totalBytes} bytes total)...`);
    const concatenatedVideo = new Uint8Array(totalBytes);
    let offset = 0;
    
    for (const segment of decryptedSegments) {
      concatenatedVideo.set(segment, offset);
      offset += segment.length;
    }

    // Create a single video blob from concatenated segments
    // Note: This may not work perfectly since MPEG-TS segments aren't meant to be concatenated directly
    const videoBlob = new (global as any).Blob([concatenatedVideo.buffer], { type: 'video/mp2t' });
    const videoUrl = (global as any).URL.createObjectURL(videoBlob);
    
    setVideoUrl(videoUrl);
    console.log('[VideoFile] HLS video concatenated (fallback method - may have playback issues)');
  };

  const loadHLSWithMediaSource = async (hlsMetadata: any, getSegment: (index: number) => Promise<Uint8Array>) => {
    console.log('[VideoFile] Using MediaSource Extensions for HLS playback');
    
    const mediaSource = new (global as any).MediaSource();
    const objectURL = (global as any).URL.createObjectURL(mediaSource);
    
    mediaSource.addEventListener('sourceopen', async () => {
      try {
        // Try different codec configurations
        const codecs = [
          'video/mp4; codecs="avc1.64002a,mp4a.40.2"',
          'video/mp4; codecs="avc1.42e01e,mp4a.40.2"',
          'video/webm; codecs="vp8,opus"'
        ];
        
        let sourceBuffer: any | null = null;
        
        for (const codec of codecs) {
          if ((global as any).MediaSource.isTypeSupported(codec)) {
            console.log(`[VideoFile] Using codec: ${codec}`);
            sourceBuffer = mediaSource.addSourceBuffer(codec);
            break;
          }
        }
        
        if (!sourceBuffer) {
          throw new Error('No supported codec found for MediaSource');
        }
        
        // Load segments sequentially
        for (let i = 0; i < hlsMetadata.segmentCount; i++) {
          if (abortControllerRef.current?.signal.aborted) {
            throw new Error('Operation cancelled');
          }
          
          const segmentData = await getSegment(i);
          
          // Wait for source buffer to be ready
          await new Promise<void>((resolve, reject) => {
            const checkReady = () => {
              if (!sourceBuffer!.updating) {
                resolve();
              } else {
                setTimeout(checkReady, 10);
              }
            };
            checkReady();
          });
          
          sourceBuffer.appendBuffer(segmentData.buffer);
          
          const progress = ((i + 1) / hlsMetadata.segmentCount) * 100;
          setProgress(progress);
          console.log(`[VideoFile] Appended segment ${i + 1}/${hlsMetadata.segmentCount} (${progress.toFixed(1)}%)`);
        }
        
        // End the stream
        await new Promise<void>((resolve) => {
          const checkReady = () => {
            if (!sourceBuffer!.updating) {
              mediaSource.endOfStream();
              resolve();
            } else {
              setTimeout(checkReady, 10);
            }
          };
          checkReady();
        });
        
        console.log('[VideoFile] MediaSource HLS playback ready');
        
      } catch (error) {
        console.error('[VideoFile] MediaSource playback failed:', error);
        mediaSource.endOfStream('decode');
        throw error;
      }
    });
    
    setVideoUrl(objectURL);
  };

  const loadHLSNative = async (playlistData: Uint8Array, hlsMetadata: any, getSegment: (index: number) => Promise<Uint8Array>) => {
    console.log('[VideoFile] Attempting native HLS playback - trying concatenation approach for better iOS compatibility');
    
    // For iOS, concatenation might work better than segmented files due to CoreMedia restrictions
    // iOS is very strict about HLS format and file paths
    const decryptedSegments: Uint8Array[] = [];
    let totalBytes = 0;
    
    console.log('[VideoFile] Decrypting and concatenating HLS segments for iOS...');
    
    for (let i = 0; i < hlsMetadata.segmentCount; i++) {
      if (abortControllerRef.current?.signal.aborted) {
        throw new Error('Operation cancelled');
      }
      
      const segmentData = await getSegment(i);
      decryptedSegments.push(segmentData);
      totalBytes += segmentData.length;
      
      const progress = ((i + 1) / hlsMetadata.segmentCount) * 100;
      setProgress(progress);
      console.log(`[VideoFile] Decrypted segment ${i + 1}/${hlsMetadata.segmentCount} (${progress.toFixed(1)}%)`);
    }

    // Concatenate all segments into a single video file
    console.log(`[VideoFile] Concatenating ${decryptedSegments.length} segments (${totalBytes} bytes total) for iOS...`);
    const concatenatedVideo = new Uint8Array(totalBytes);
    let offset = 0;
    
    for (const segment of decryptedSegments) {
      concatenatedVideo.set(segment, offset);
      offset += segment.length;
    }

    // Create a single video file from concatenated segments
    const FileManagerService = require('../../utils/FileManagerService').FileManagerService;
    const tempPath = await FileManagerService.createTempFile(concatenatedVideo, 'concatenated_video.ts');
    
    setVideoUrl(`file://${tempPath}`);
    console.log('[VideoFile] HLS video concatenated for native iOS playback:', `file://${tempPath}`);
  };

  const loadChunkedVideo = async () => {
    const progressCallback = (chunkIndex: number, totalChunks: number) => {
      const progress = (chunkIndex / totalChunks) * 100;
      setProgress(progress);
    };

    if (Platform.OS === 'web') {
      // Web: Load in memory and create blob URL
      const result = await fileManagerService.loadEncryptedVideoChunked(
        file.uuid,
        abortControllerRef.current?.signal,
        progressCallback
      );

      if (result.fileData) {
        const blob = new (global as any).Blob([result.fileData.buffer], { type: file.metadata.type });
        const url = (global as any).URL.createObjectURL(blob);
        setVideoUrl(url);
      } else {
        throw new Error('No video data received for web platform');
      }
    } else {
      // Native: Use temp file approach for better memory management
      const result = await fileManagerService.loadEncryptedVideoChunked(
        file.uuid,
        abortControllerRef.current?.signal,
        progressCallback,
        'temp_video' // Use temp file
      );

      if (result.tempFilePath) {
        setVideoUrl(`file://${result.tempFilePath}`);
      } else if (result.fileData) {
        // Fallback: create temp file from data
        const FileManagerService = require('../../utils/FileManagerService').FileManagerService;
        const tempPath = await FileManagerService.createTempFile(result.fileData, file.metadata.name);
        setVideoUrl(`file://${tempPath}`);
      } else {
        throw new Error('No video data received for native platform');
      }
    }

    console.log('[VideoFile] Chunked video ready for playback');
  };

  const loadStandardVideo = async () => {
    const progressCallback = () => {
      setProgress(prev => Math.min(prev + 10, 90));
    };

    const { fileData } = await fileManagerService.loadEncryptedFile(
      file.uuid,
      abortControllerRef.current?.signal,
      progressCallback
    );

    if (Platform.OS === 'web') {
      const blob = new (global as any).Blob([fileData.buffer], { type: file.metadata.type });
      const url = (global as any).URL.createObjectURL(blob);
      setVideoUrl(url);
    } else {
      // Native: Create temp file for video
      const FileManagerService = require('../../utils/FileManagerService').FileManagerService;
      const tempPath = await FileManagerService.createTempFile(fileData, file.metadata.name);
      setVideoUrl(`file://${tempPath}`);
    }
    setProgress(100);
    
    console.log('[VideoFile] Standard video ready for playback');
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    loadingText: {
      color: theme.text,
      marginTop: 10,
      textAlign: 'center',
    },
    progressText: {
      color: theme.textSecondary,
      marginTop: 5,
      fontSize: 14,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    errorText: {
      color: theme.error || '#FF6B6B',
      textAlign: 'center',
      fontSize: 16,
      marginBottom: 10,
    },
    errorSubtext: {
      color: theme.textSecondary,
      textAlign: 'center',
      fontSize: 14,
      marginTop: 5,
    },
    videoContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    video: {
      width: '100%',
      height: '100%',
      backgroundColor: '#000',
    },
  });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading video...</Text>
        {progress > 0 && (
          <Text style={styles.progressText}>{progress.toFixed(1)}%</Text>
        )}
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!videoUrl) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Video not available</Text>
      </View>
    );
  }

  // Render video based on platform
  if (Platform.OS === 'web') {
    return (
      <View style={styles.videoContainer}>
        <video
          ref={(video) => {
            console.log('[VideoFile] Video element ref callback called:', !!video);
            // Only attach HLS.js once when the video element is first created
            if (video && !videoRef.current) {
              videoRef.current = video;
              console.log('[VideoFile] Video element set in ref');
              // If HLS.js is ready and video element is available, attach media
              if (hlsRef.current) {
                console.log('[VideoFile] Attaching HLS.js to video element');
                hlsRef.current.attachMedia(video);
              }
            }
          }}
          src={!hlsRef.current ? videoUrl : undefined}
          controls
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: '#000',
          }}
          onError={(e) => {
            console.error('[VideoFile] Video playback error:', e);
            console.error('[VideoFile] Video element error details:', {
              error: (e.target as any)?.error,
              networkState: (e.target as any)?.networkState,
              readyState: (e.target as any)?.readyState,
              src: (e.target as any)?.src,
              hlsJsAttached: !!hlsRef.current,
              hlsJsUrl: hlsRef.current?.url
            });
            
            const videoElement = e.target as any;
            let errorMessage = 'Video playback error';
            
            if (videoElement?.error) {
              switch (videoElement.error.code) {
                case 1:
                  errorMessage = 'Video loading aborted';
                  break;
                case 2:
                  errorMessage = 'Network error while loading video';
                  break;
                case 3:
                  errorMessage = 'Video decoding error';
                  break;
                case 4:
                  errorMessage = 'Video format not supported';
                  break;
                default:
                  errorMessage = `Video error (code: ${videoElement.error.code})`;
              }
            }
            
            // If using HLS.js and there's an error, try fallback
            if (hlsRef.current && hlsSupported) {
              console.log('[VideoFile] HLS.js error, attempting fallback to concatenation');
              hlsRef.current.destroy();
              hlsRef.current = null;
              setHlsSupported(false);
              // Reset initialization to allow reload
              setIsInitialized(false);
              // Reload will trigger fallback mode
              loadVideo();
              return;
            }
            
            setError(errorMessage);
          }}
          onLoadStart={() => {
            console.log('[VideoFile] Video loading started, HLS.js:', !!hlsRef.current);
          }}
          onLoadedMetadata={() => {
            console.log('[VideoFile] Video metadata loaded successfully, HLS.js:', !!hlsRef.current);
          }}
          onCanPlay={() => {
            console.log('[VideoFile] Video can start playing, HLS.js:', !!hlsRef.current);
          }}
          onPlaying={() => {
            console.log('[VideoFile] Video is now playing');
          }}
          onTimeUpdate={() => {
            // Uncomment for debugging time updates
            // console.log('[VideoFile] Video time update:', videoRef.current?.currentTime);
          }}
          onWaiting={() => {
            console.log('[VideoFile] Video is waiting for data');
          }}
          onLoadedData={() => {
            console.log('[VideoFile] Video loaded data');
          }}
        />
      </View>
    );
  } else {
    // Native video player using react-native-video
    if (!Video) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            react-native-video is required for video playback on native platforms
          </Text>
          <Text style={styles.errorSubtext}>
            Please install react-native-video to enable video playback
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.videoContainer}>
        <Video
          source={{ uri: videoUrl }}
          style={styles.video}
          controls={true}
          resizeMode="contain"
          onError={(error: any) => {
            console.error('[VideoFile] Native video playback error:', error);
            setError(`Video playback error: ${error.error?.localizedDescription || error.error || 'Unknown error'}`);
          }}
          onLoad={(data: any) => {
            console.log('[VideoFile] Native video loaded:', data);
          }}
          onProgress={(data: any) => {
            // Optional: Handle video progress
          }}
        />
      </View>
    );
  }
};

export default VideoFile;
