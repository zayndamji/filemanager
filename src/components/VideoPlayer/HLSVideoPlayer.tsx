import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { ThemeContext } from '../../theme';
import { EncryptedFile } from '../../utils/FileManagerService';
import { useFileManagerService } from '../../hooks/useFileManagerService';
import { waitForVideoElement, waitForVideoMediaReady, safeVideoOperation } from './VideoUtils';

// Type definitions for web APIs
declare global {
  interface Window {
    MediaSource: any;
    SourceBuffer: any;
    URL: any;
    Blob: any;
  }
}

// Get global references for web APIs
const getGlobalMediaSource = () => {
  if (Platform.OS === 'web') {
    return (global as any).MediaSource || (global as any).window?.MediaSource;
  }
  return null;
};

const getGlobalURL = () => {
  if (Platform.OS === 'web') {
    return (global as any).URL || (global as any).window?.URL;
  }
  return null;
};

const getGlobalBlob = () => {
  if (Platform.OS === 'web') {
    return (global as any).Blob || (global as any).window?.Blob;
  }
  return null;
};

// Conditionally import HLS.js for web platform
let Hls: any = null;
if (Platform.OS === 'web') {
  try {
    const hlsModule = require('hls.js');
    Hls = hlsModule.default || hlsModule;
  } catch (e) {
    console.warn('[SeamlessVideoPlayer] HLS.js not available:', e);
  }
}

// Conditionally import react-native-video for native platforms
let Video: any = null;
if (Platform.OS !== 'web') {
  try {
    const RNVideo = require('react-native-video');
    Video = RNVideo.default || RNVideo;
  } catch (e) {
    console.warn('[SeamlessVideoPlayer] react-native-video not available:', e);
  }
}

interface SeamlessVideoPlayerProps {
  file: EncryptedFile;
  onError?: (error: string) => void;
  bufferAhead?: number; // Number of segments to buffer ahead
  maxBufferSize?: number; // Maximum buffer size in seconds
}

interface SegmentBuffer {
  data: Uint8Array;
  index: number;
  loaded: boolean;
  loading: boolean;
}

const SeamlessVideoPlayer: React.FC<SeamlessVideoPlayerProps> = ({ 
  file, 
  onError, 
  bufferAhead = 3,
  maxBufferSize = 30 
}) => {
  console.log('🚀 [SeamlessVideoPlayer] Component ENTRY - Starting initialization', {
    fileUuid: file?.uuid,
    bufferAhead,
    maxBufferSize,
    timestamp: Date.now()
  });
  const fileManagerService = useFileManagerService();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const initializePromiseRef = useRef<Promise<void> | null>(null);
  
  // Video player refs
  const videoRef = useRef<any>(null);
  const hlsRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Seamless streaming state
  const [mediaSource, setMediaSource] = useState<any>(null);
  const [sourceBuffer, setSourceBuffer] = useState<any>(null);
  const [segmentCache, setSegmentCache] = useState<Map<number, SegmentBuffer>>(new Map());
  const [currentSegment, setCurrentSegment] = useState(0);
  const [totalSegments, setTotalSegments] = useState(0);
  const [segmentDuration, setSegmentDuration] = useState(10); // Default 10 seconds per segment
  
  // Metadata state
  const [hlsMetadata, setHlsMetadata] = useState<any>(null);
  const getSegmentFuncRef = useRef<((index: number) => Promise<Uint8Array>) | null>(null);
  const [getSegmentFuncReady, setGetSegmentFuncReady] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  
  const { theme } = React.useContext(ThemeContext);

  useEffect(() => {
    console.log('🚀 [SeamlessVideoPlayer] Component mounted/updated with file:', file?.uuid);
    console.log('📊 [SeamlessVideoPlayer] FileManagerService available:', !!fileManagerService);
    console.log('🔍 [SeamlessVideoPlayer] Current state:', { isInitialized, loading, error: !!error });
    
    // Prevent re-initialization if already initialized or currently initializing
    if (isInitialized || initializePromiseRef.current) {
      console.log('⚠️ [SeamlessVideoPlayer] Player already initialized or initializing, skipping...');
      return;
    }
    
    // Delay initialization to ensure DOM is ready
    const initTimer = setTimeout(() => {
      if (!initializePromiseRef.current) {
        initializePromiseRef.current = initializePlayer();
      }
    }, 50);
    
    return () => {
      clearTimeout(initTimer);
      if (!isInitialized) {
        cleanup();
      }
    };
  }, [file.uuid, isInitialized]);

  useEffect(() => {
    if (isPlaying && hlsMetadata && getSegmentFuncReady && getSegmentFuncRef.current) {
      const interval = setInterval(() => {
        checkAndLoadNextSegments();
      }, 1000); // Check every second
      
      return () => clearInterval(interval);
    }
  }, [isPlaying, currentTime, hlsMetadata, getSegmentFuncReady]);

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (mediaSource && mediaSource.readyState !== 'closed') {
      try {
        mediaSource.endOfStream();
      } catch (e) {
        console.warn('[SeamlessVideoPlayer] Error ending media source:', e);
      }
    }
    getSegmentFuncRef.current = null;
    setGetSegmentFuncReady(false);
    setSegmentCache(new Map());
    setIsInitialized(false);
    initializePromiseRef.current = null;
  }, [mediaSource]);

  const initializePlayer = async () => {
    console.log('🎬 [SeamlessVideoPlayer] initializePlayer: START');
    console.log('📊 [SeamlessVideoPlayer] Initial state:', {
      fileUuid: file?.uuid,
      fileManagerService: !!fileManagerService,
      loading: loading,
      error: error
    });
    
    try {
      setLoading(true);
      setError(null);
      
      abortControllerRef.current = new AbortController();
      
      console.log('📋 [SeamlessVideoPlayer] Loading file metadata...');
      // Load metadata to determine video type
      const metadata = await fileManagerService.loadFileMetadata(file.uuid);
      console.log('✅ [SeamlessVideoPlayer] Metadata loaded:', {
        isHLS: (metadata as any).isHLS,
        version: (metadata as any).version
      });
      
      const isHLS = (metadata as any).isHLS === true && (metadata as any).version === '3.0';
      
      if (!isHLS) {
        const error = 'SeamlessVideoPlayer only supports HLS videos';
        console.error('❌ [SeamlessVideoPlayer]', error);
        throw new Error(error);
      }
      
      console.log('🎥 [SeamlessVideoPlayer] Valid HLS video detected, loading...');
      // Load HLS video data
      console.log('📡 [SeamlessVideoPlayer] Calling loadEncryptedHLSVideo...');
      
      try {
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('loadEncryptedHLSVideo timeout after 15 seconds')), 15000);
        });
        
        const loadPromise = fileManagerService.loadEncryptedHLSVideo(
          file.uuid,
          abortControllerRef.current.signal
        );
        
        console.log('⏰ [SeamlessVideoPlayer] Racing loadEncryptedHLSVideo with 15s timeout...');
        const { playlistData, metadata: hlsMeta, getSegment } = await Promise.race([
          loadPromise,
          timeoutPromise
        ]) as any;
        console.log('📡 [SeamlessVideoPlayer] loadEncryptedHLSVideo completed successfully');
        
        console.log('✅ [SeamlessVideoPlayer] HLS data loaded:', {
          playlistSize: playlistData?.length,
          segmentCount: hlsMeta?.segmentCount,
          getSegmentFunction: typeof getSegment
        });
        
        console.log('🔧 [SeamlessVideoPlayer] Setting HLS metadata and functions...');
        setHlsMetadata(hlsMeta);
        getSegmentFuncRef.current = getSegment;
        setGetSegmentFuncReady(true);
        setTotalSegments(hlsMeta.segmentCount);
        console.log('🔧 [SeamlessVideoPlayer] HLS metadata and functions set successfully');
        
        console.log('🌐 [SeamlessVideoPlayer] Platform detection:', Platform.OS);
        
        // Set loading to false FIRST to render video element
        console.log('🎯 [SeamlessVideoPlayer] Setting loading to false to render video element');
        setLoading(false);
        
        // Wait for React to render AND force a re-render cycle
        console.log('⏰ [SeamlessVideoPlayer] Forcing React re-render...');
        await new Promise(resolve => {
          // Use requestAnimationFrame to wait for the next render cycle
          if (Platform.OS === 'web' && (global as any).requestAnimationFrame) {
            (global as any).requestAnimationFrame(() => {
              // Wait one more frame to be sure
              (global as any).requestAnimationFrame(resolve);
            });
          } else {
            setTimeout(resolve, 200);
          }
        });
        
        // Now wait for video element to appear with polling
        console.log('⏰ [SeamlessVideoPlayer] Waiting for video element to appear...');
        let attempts = 0;
        const maxAttempts = 30; // 30 attempts * 100ms = 3 seconds max
        let videoElementFound = false;
        
        while (attempts < maxAttempts && !videoElementFound) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
          
          // Check if video element exists in DOM (web only)
          if (Platform.OS === 'web') {
            const videoElements = (global as any).document?.querySelectorAll('video') || [];
            console.log(`🔍 [SeamlessVideoPlayer] Attempt ${attempts}: Found ${videoElements.length} video elements, ref ready: ${!!videoRef.current}`);
            
            if (videoElements.length > 0 && videoRef.current) {
              console.log('✅ [SeamlessVideoPlayer] Video element found in DOM and ref is ready');
              videoElementFound = true;
              break;
            }
          } else {
            // For native, just check if ref is ready
            if (videoRef.current) {
              console.log('✅ [SeamlessVideoPlayer] Video ref is ready (native)');
              videoElementFound = true;
              break;
            }
          }
        }
        
        if (!videoElementFound) {
          console.error('❌ [SeamlessVideoPlayer] Video element failed to appear after polling');
          throw new Error('Video element failed to render after waiting');
        }
        
        if (Platform.OS === 'web') {
          console.log('🔧 [SeamlessVideoPlayer] Initializing web player...');
          await initializeWebPlayer(playlistData, hlsMeta, getSegment);
          console.log('✅ [SeamlessVideoPlayer] Web player initialization completed');
        } else {
          console.log('📱 [SeamlessVideoPlayer] Initializing native player...');
          await initializeNativePlayer(playlistData, hlsMeta, getSegment);
          console.log('✅ [SeamlessVideoPlayer] Native player initialization completed');
        }
        
        // Mark as successfully initialized
        console.log('🎉 [SeamlessVideoPlayer] Player initialization completed successfully');
        setIsInitialized(true);
        initializePromiseRef.current = null;
        
      } catch (hlsError) {
        console.error('💥 [SeamlessVideoPlayer] Error in loadEncryptedHLSVideo:', hlsError);
        throw hlsError; // Re-throw to trigger main catch block
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize player';
      console.error('[SeamlessVideoPlayer] Initialization error:', err);
      setError(errorMessage);
      setLoading(false); // Set loading false on error
      initializePromiseRef.current = null; // Clear promise ref on error
      onError?.(errorMessage);
    }
    // Note: setLoading(false) is now called earlier in the success path
  };

  const initializeWebPlayer = async (
    playlistData: Uint8Array, 
    hlsMeta: any, 
    getSegment: (index: number) => Promise<Uint8Array>
  ) => {
    console.log('🌐 [SeamlessVideoPlayer] initializeWebPlayer START');
    
    // Check if we should use MSE or HLS.js
    const MediaSourceClass = getGlobalMediaSource();
    const supportsMSE = MediaSourceClass && typeof MediaSourceClass.isTypeSupported === 'function' && 
                       MediaSourceClass.isTypeSupported('video/mp4; codecs="avc1.64002a,mp4a.40.2"');
    const supportsHLS = Hls && Hls.isSupported();
    
    if (supportsMSE) {
      console.log('[SeamlessVideoPlayer] Using MSE for seamless playback');
      await initializeMSEPlayer(hlsMeta, getSegment);
    } else if (supportsHLS) {
      console.log('[SeamlessVideoPlayer] Using HLS.js for playback');
      await initializeHLSJSPlayer(playlistData, hlsMeta, getSegment);
    } else {
      throw new Error('No supported streaming method available');
    }
  };

  const initializeMSEPlayer = async (hlsMeta: any, getSegment: (index: number) => Promise<Uint8Array>) => {
    console.log('🚀 [SeamlessVideoPlayer] initializeMSEPlayer: START');
    
    const MediaSourceClass = getGlobalMediaSource();
    const URLClass = getGlobalURL();
    
    console.log('🔧 [SeamlessVideoPlayer] Browser support check:', {
      MediaSourceClass: !!MediaSourceClass,
      URLClass: !!URLClass,
      hlsMetaSegments: hlsMeta?.segmentCount,
      getSegmentType: typeof getSegment,
      videoRefAvailable: !!videoRef.current
    });
    
    if (!MediaSourceClass || !URLClass) {
      const error = 'MediaSource or URL not available';
      console.error('❌ [SeamlessVideoPlayer]', error);
      throw new Error(error);
    }

    // Wait for video element to be properly available
    console.log('⏳ [SeamlessVideoPlayer] Waiting for video element to be ready...');
    const video = await waitForVideoElement(videoRef, 5000, 50);
    console.log('✅ [SeamlessVideoPlayer] Video element ready:', {
      tagName: video.tagName || 'unknown',
      readyState: video.readyState || 'unknown'
    });
    
    console.log('🎬 [SeamlessVideoPlayer] Creating MediaSource...');
    const ms = new MediaSourceClass();
    setMediaSource(ms);
    
    console.log('🔗 [SeamlessVideoPlayer] Creating object URL...');
    const videoUrl = URLClass.createObjectURL(ms);
    setVideoUrl(videoUrl);
    console.log('✅ [SeamlessVideoPlayer] Video URL created:', videoUrl);
    
    ms.addEventListener('sourceopen', async () => {
      try {
        console.log('🎉 [SeamlessVideoPlayer] MediaSource opened! Setting up SourceBuffer...');
        console.log('🔍 [SeamlessVideoPlayer] MediaSource state:', ms.readyState);
        
        // Double-check MediaSource is still open
        if (ms.readyState !== 'open') {
          throw new Error(`MediaSource not open, state: ${ms.readyState}`);
        }
        
        // Try different codec combinations
        const codecs = [
          'video/mp4; codecs="avc1.64002a,mp4a.40.2"',
          'video/mp2t; codecs="avc1.64002a,mp4a.40.2"',
          'video/mp2t'
        ];
        
        console.log('🧪 [SeamlessVideoPlayer] Testing codec support...');
        let sb: any = null;
        for (const codec of codecs) {
          console.log(`🔍 [SeamlessVideoPlayer] Checking codec: ${codec}`);
          const isSupported = MediaSourceClass.isTypeSupported(codec);
          console.log(`📊 [SeamlessVideoPlayer] Codec ${codec} supported:`, isSupported);
          
          if (isSupported) {
            console.log(`✅ [SeamlessVideoPlayer] Using codec: ${codec}`);
            try {
              // Check MediaSource state before creating SourceBuffer
              if (ms.readyState !== 'open') {
                throw new Error(`MediaSource closed before SourceBuffer creation, state: ${ms.readyState}`);
              }
              
              sb = ms.addSourceBuffer(codec);
              console.log('🎯 [SeamlessVideoPlayer] SourceBuffer created successfully with codec:', codec);
              break;
            } catch (codecError) {
              console.error(`❌ [SeamlessVideoPlayer] Failed to create SourceBuffer with ${codec}:`, codecError);
            }
          }
        }
        
        if (!sb) {
          const error = 'No supported codec found or SourceBuffer creation failed';
          console.error('💥 [SeamlessVideoPlayer]', error);
          console.log('🔍 [SeamlessVideoPlayer] Available codecs test results:');
          codecs.forEach(codec => {
            console.log(`  - ${codec}: ${MediaSourceClass.isTypeSupported(codec)}`);
          });
          throw new Error(error);
        }
        
        console.log('🎉 [SeamlessVideoPlayer] SourceBuffer created successfully!');
        setSourceBuffer(sb);
        
        // Set up buffer management
        sb.addEventListener('updateend', () => {
          console.log('🔄 [SeamlessVideoPlayer] SourceBuffer updateend event');
          checkAndLoadNextSegments();
        });
        
        sb.addEventListener('error', (e: any) => {
          console.error('❌ [SeamlessVideoPlayer] SourceBuffer error:', e);
        });
        
        // Load initial segments
        console.log('🎬 [SeamlessVideoPlayer] About to load initial segments...');
        console.log('📊 [SeamlessVideoPlayer] Parameters for loadInitialSegments:', {
          sourceBuffer: !!sb,
          getSegmentFunction: typeof getSegment,
          hlsMetaSegments: hlsMeta?.segmentCount
        });
        
        await loadInitialSegments(sb, getSegment);
        console.log('🎉 [SeamlessVideoPlayer] Initial segments loaded successfully!');
        
      } catch (err) {
        console.error('💥 [SeamlessVideoPlayer] MSE setup error:', err);
        console.error('🔍 [SeamlessVideoPlayer] MSE setup error details:', {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          mediaSourceState: ms?.readyState,
          hlsMetaSegments: hlsMeta?.segmentCount
        });
        setError('Failed to setup video streaming');
      }
    });
    
    ms.addEventListener('sourceclose', () => {
      console.log('🔒 [SeamlessVideoPlayer] MediaSource closed');
    });
    
    ms.addEventListener('sourceended', () => {
      console.log('🏁 [SeamlessVideoPlayer] MediaSource ended');
    });
    
    console.log('📺 [SeamlessVideoPlayer] Setting video source using verified video element...');
    video.src = videoUrl;
    console.log('✅ [SeamlessVideoPlayer] Video source set successfully to:', videoUrl);
    
    console.log('🎯 [SeamlessVideoPlayer] initializeMSEPlayer: END - waiting for sourceopen event');
  };

  const initializeHLSJSPlayer = async (
    playlistData: Uint8Array,
    hlsMeta: any,
    getSegment: (index: number) => Promise<Uint8Array>
  ) => {
    if (!Hls) {
      throw new Error('HLS.js not available');
    }
    
    const BlobClass = getGlobalBlob();
    const URLClass = getGlobalURL();
    
    if (!BlobClass || !URLClass) {
      throw new Error('Blob or URL not available');
    }
    
    const hls = new Hls({
      debug: false,
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: maxBufferSize,
      maxMaxBufferLength: maxBufferSize * 2,
    });
    
    hlsRef.current = hls;
    
    // Pre-decrypt initial segments
    const decryptedSegments: string[] = [];
    for (let i = 0; i < Math.min(bufferAhead, hlsMeta.segmentCount); i++) {
      const segmentData = await getSegment(i);
      const blob = new BlobClass([segmentData.buffer], { type: 'video/mp2t' });
      const url = URLClass.createObjectURL(blob);
      decryptedSegments.push(url);
    }
    
    // Modify playlist to use decrypted segments
    const playlistText = new TextDecoder().decode(playlistData);
    const lines = playlistText.split('\n');
    let segmentIndex = 0;
    
    const modifiedLines = lines.map(line => {
      if (line.trim() && !line.startsWith('#')) {
        if (segmentIndex < decryptedSegments.length) {
          return decryptedSegments[segmentIndex++];
        }
        return line;
      }
      return line;
    });
    
    const modifiedPlaylist = modifiedLines.join('\n');
    const playlistBlob = new BlobClass([modifiedPlaylist], { type: 'application/vnd.apple.mpegurl' });
    const playlistUrl = URLClass.createObjectURL(playlistBlob);
    
    hls.loadSource(playlistUrl);
    
    if (videoRef.current) {
      hls.attachMedia(videoRef.current);
    }
    
    // Set up dynamic segment loading
    hls.on(Hls.Events.FRAG_LOADING, async (event: any, data: any) => {
      // Preload next segments
      preloadUpcomingSegments(getSegment);
    });
  };

  const initializeNativePlayer = async (
    playlistData: Uint8Array,
    hlsMeta: any,
    getSegment: (index: number) => Promise<Uint8Array>
  ) => {
    // For native platforms, use concatenated approach with better buffering
    console.log('[SeamlessVideoPlayer] Initializing native player with streaming');
    
    // Start by loading the first few segments
    const initialSegments: Uint8Array[] = [];
    for (let i = 0; i < Math.min(bufferAhead, hlsMeta.segmentCount); i++) {
      const segmentData = await getSegment(i);
      initialSegments.push(segmentData);
      setProgress((i + 1) / Math.min(bufferAhead, hlsMeta.segmentCount) * 50);
    }
    
    // Create initial concatenated video
    const totalBytes = initialSegments.reduce((sum, seg) => sum + seg.length, 0);
    const concatenatedVideo = new Uint8Array(totalBytes);
    let offset = 0;
    
    for (const segment of initialSegments) {
      concatenatedVideo.set(segment, offset);
      offset += segment.length;
    }
    
    // Create temp file for initial playback
    const FileManagerService = require('../../utils/FileManagerService').FileManagerService;
    const tempPath = await FileManagerService.createTempFile(concatenatedVideo, 'streaming_video.ts');
    
    // Start background loading of remaining segments
    backgroundLoadSegments(getSegment, hlsMeta.segmentCount);
    
    return `file://${tempPath}`;
  };

  const loadInitialSegments = async (sb: any, getSegment: (index: number) => Promise<Uint8Array>) => {
    try {
      console.log('🚀 [SeamlessVideoPlayer] Starting to load initial segments, total segments:', totalSegments);
      console.log('🔧 [SeamlessVideoPlayer] getSegment function:', typeof getSegment, !!getSegment);
      console.log('🔧 [SeamlessVideoPlayer] SourceBuffer state:', sb?.readyState, sb?.updating);
      
      // Load first segment to get the video started
      console.log('📥 [SeamlessVideoPlayer] About to call getSegment(0)...');
      const firstSegment = await getSegment(0);
      console.log('✅ [SeamlessVideoPlayer] getSegment(0) returned:', {
        hasData: !!firstSegment,
        size: firstSegment?.length || 0,
        type: typeof firstSegment
      });
      
      if (!firstSegment || firstSegment.length === 0) {
        throw new Error('First segment is empty or null');
      }
      
      console.log('🔄 [SeamlessVideoPlayer] Appending first segment to buffer...');
      await appendToBuffer(sb, firstSegment);
      console.log('✅ [SeamlessVideoPlayer] First segment appended successfully');
      
      setCurrentSegment(1);
      
      // Cache upcoming segments
      console.log('📦 [SeamlessVideoPlayer] Starting to preload upcoming segments...');
      for (let i = 1; i < Math.min(bufferAhead + 1, totalSegments); i++) {
        console.log(`📥 [SeamlessVideoPlayer] About to preload segment ${i}...`);
        preloadSegment(i, getSegment);
      }
      
      console.log('🎉 [SeamlessVideoPlayer] Initial segments loading completed');
      
    } catch (err) {
      console.error('❌ [SeamlessVideoPlayer] Error in loadInitialSegments:', err);
      console.error('📋 [SeamlessVideoPlayer] Error details:', {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        totalSegments,
        bufferAhead,
        getSegmentType: typeof getSegment
      });
      throw err;
    }
  };

  const appendToBuffer = (sb: any, data: Uint8Array): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Check if SourceBuffer and MediaSource are still valid
      if (!sb) {
        reject(new Error('SourceBuffer is null'));
        return;
      }
      
      // Check if the parent MediaSource is still open
      const parentMediaSource = mediaSource;
      if (!parentMediaSource || parentMediaSource.readyState !== 'open') {
        reject(new Error(`MediaSource not open, state: ${parentMediaSource?.readyState || 'null'}`));
        return;
      }
      
      // Check if SourceBuffer was removed from MediaSource
      try {
        // This will throw if the SourceBuffer was removed
        const buffered = sb.buffered;
        console.log(`[SeamlessVideoPlayer] SourceBuffer buffered ranges: ${buffered.length}`);
      } catch (e) {
        reject(new Error('SourceBuffer has been removed from MediaSource'));
        return;
      }
      
      if (sb.updating) {
        console.log('[SeamlessVideoPlayer] SourceBuffer is updating, waiting...');
        setTimeout(() => appendToBuffer(sb, data).then(resolve).catch(reject), 10);
        return;
      }
      
      console.log(`[SeamlessVideoPlayer] Appending ${data.length} bytes to buffer`);
      
      const onUpdateEnd = () => {
        console.log('[SeamlessVideoPlayer] Buffer append completed successfully');
        sb.removeEventListener('updateend', onUpdateEnd);
        sb.removeEventListener('error', onError);
        resolve();
      };
      
      const onError = (e: Event) => {
        console.error('[SeamlessVideoPlayer] Buffer append error:', e);
        sb.removeEventListener('updateend', onUpdateEnd);
        sb.removeEventListener('error', onError);
        reject(e);
      };
      
      sb.addEventListener('updateend', onUpdateEnd);
      sb.addEventListener('error', onError);
      
      try {
        console.log('[SeamlessVideoPlayer] Calling sb.appendBuffer with data.buffer...');
        sb.appendBuffer(data.buffer);
      } catch (err) {
        console.error('[SeamlessVideoPlayer] Error calling appendBuffer:', err);
        sb.removeEventListener('updateend', onUpdateEnd);
        sb.removeEventListener('error', onError);
        reject(err);
      }
    });
  };

  const preloadSegment = async (index: number, getSegment: (index: number) => Promise<Uint8Array>) => {
    if (index >= totalSegments) {
      console.log(`[SeamlessVideoPlayer] Skipping preload for segment ${index} (>= totalSegments ${totalSegments})`);
      return;
    }
    
    const cached = segmentCache.get(index);
    if (cached?.loaded || cached?.loading) {
      console.log(`[SeamlessVideoPlayer] Segment ${index} already loaded or loading, skipping`);
      return;
    }
    
    console.log(`[SeamlessVideoPlayer] Starting preload for segment ${index}`);
    
    // Mark as loading
    setSegmentCache(prev => new Map(prev.set(index, { 
      data: new Uint8Array(0), 
      index, 
      loaded: false, 
      loading: true 
    })));
    
    try {
      console.log(`[SeamlessVideoPlayer] Loading segment ${index} data...`);
      const data = await getSegment(index);
      console.log(`[SeamlessVideoPlayer] Segment ${index} loaded successfully, size: ${data.length} bytes`);
      
      setSegmentCache(prev => new Map(prev.set(index, { 
        data, 
        index, 
        loaded: true, 
        loading: false 
      })));
      
      console.log(`[SeamlessVideoPlayer] Segment ${index} cached successfully`);
    } catch (err) {
      console.error(`[SeamlessVideoPlayer] Error preloading segment ${index}:`, err);
      setSegmentCache(prev => {
        const newCache = new Map(prev);
        newCache.delete(index);
        return newCache;
      });
    }
  };

  const checkAndLoadNextSegments = useCallback(async () => {
    if (!sourceBuffer || !getSegmentFuncRef.current || !videoRef.current) return;
    
    const video = videoRef.current as any;
    const currentVideoTime = video.currentTime || 0;
    
    // Calculate which segment we should be on
    const expectedSegment = Math.floor(currentVideoTime / segmentDuration);
    
    // Check if we need to load more segments
    const bufferedEnd = video.buffered && video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;
    const bufferRemaining = bufferedEnd - currentVideoTime;
    
    if (bufferRemaining < 10) { // If less than 10 seconds buffered
      // Load next segments
      for (let i = currentSegment; i < Math.min(currentSegment + bufferAhead, totalSegments); i++) {
        const cached = segmentCache.get(i);
        if (cached?.loaded && !sourceBuffer.updating) {
          try {
            await appendToBuffer(sourceBuffer, cached.data);
            setCurrentSegment(i + 1);
            
            // Preload next segment
            preloadSegment(i + bufferAhead, getSegmentFuncRef.current);
            
          } catch (err) {
            console.error(`[SeamlessVideoPlayer] Error appending segment ${i}:`, err);
          }
        } else if (!cached?.loading) {
          preloadSegment(i, getSegmentFuncRef.current);
        }
      }
    }
    
    // Clean up old segments to prevent memory issues
    cleanupOldSegments(expectedSegment);
  }, [sourceBuffer, getSegmentFuncReady, currentSegment, totalSegments, segmentDuration, bufferAhead, segmentCache]);

  const cleanupOldSegments = (currentSeg: number) => {
    setSegmentCache(prev => {
      const newCache = new Map();
      
      // Keep current segment and a few behind/ahead
      const keepRange = 5;
      for (let i = Math.max(0, currentSeg - keepRange); i < Math.min(totalSegments, currentSeg + bufferAhead + keepRange); i++) {
        const cached = prev.get(i);
        if (cached) {
          newCache.set(i, cached);
        }
      }
      
      return newCache;
    });
  };

  const preloadUpcomingSegments = async (getSegment: (index: number) => Promise<Uint8Array>) => {
    const startIndex = currentSegment;
    for (let i = startIndex; i < Math.min(startIndex + bufferAhead, totalSegments); i++) {
      preloadSegment(i, getSegment);
    }
  };

  const backgroundLoadSegments = async (getSegment: (index: number) => Promise<Uint8Array>, totalCount: number) => {
    // Continue loading segments in the background for native platforms
    for (let i = bufferAhead; i < totalCount; i++) {
      try {
        await preloadSegment(i, getSegment);
        setProgress(50 + (i / totalCount) * 50);
      } catch (err) {
        console.warn(`[SeamlessVideoPlayer] Background loading failed for segment ${i}:`, err);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const video = videoRef.current as any;
      setCurrentTime(video.currentTime || 0);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      const video = videoRef.current as any;
      setDuration(video.duration || 0);
      
      // Estimate segment duration
      const estimatedSegmentDuration = (video.duration || 0) / totalSegments;
      setSegmentDuration(estimatedSegmentDuration);
    }
  };

  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleError = (e: any) => {
    console.error('[SeamlessVideoPlayer] Video error:', e);
    const errorMessage = 'Video playback error';
    setError(errorMessage);
    onError?.(errorMessage);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Loading seamless video player... {Math.round(progress)}%
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface }]}>
        <Text style={[styles.errorText, { color: theme.error }]}>
          {error}
        </Text>
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface }]}>
        <video
          ref={videoRef}
          style={styles.video}
          controls
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handlePause}
          onError={handleError}
          playsInline
          preload="metadata"
        />
        <View style={styles.debugInfo}>
          <Text style={[styles.debugText, { color: theme.text }]}>
            Segments: {currentSegment}/{totalSegments} | 
            Cached: {segmentCache.size} | 
            Time: {Math.round(currentTime)}s/{Math.round(duration)}s
          </Text>
        </View>
      </View>
    );
  }

  // Native video player
  if (!Video) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface }]}>
        <Text style={[styles.errorText, { color: theme.error }]}>
          react-native-video not available
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      <Video
        source={{ uri: videoUrl }}
        style={styles.video}
        controls={true}
        resizeMode="contain"
        onLoad={(data: any) => {
          setDuration(data.duration);
          const estimatedSegmentDuration = data.duration / totalSegments;
          setSegmentDuration(estimatedSegmentDuration);
        }}
        onProgress={(data: any) => {
          setCurrentTime(data.currentTime);
        }}
        onPlay={handlePlay}
        onPause={handlePause}
        onError={handleError}
        paused={false}
        bufferConfig={{
          minBufferMs: 15000,
          maxBufferMs: 50000,
          bufferForPlaybackMs: 2500,
          bufferForPlaybackAfterRebufferMs: 5000,
        }}
      />
      <View style={styles.debugInfo}>
        <Text style={[styles.debugText, { color: theme.text }]}>
          🚀 Seamless Player: {currentSegment}/{totalSegments} | Cached: {segmentCache.size} | {Math.round(currentTime)}s/{Math.round(duration)}s
        </Text>
        <Text style={[styles.debugText, { color: theme.text, fontSize: 10 }]}>
          MSE: {mediaSource ? mediaSource.readyState : 'N/A'} | 
          SB: {sourceBuffer ? (sourceBuffer.updating ? 'updating' : 'ready') : 'none'} | 
          URL: {videoUrl ? '✓' : '✗'} | 
          Loading: {loading ? 'Yes' : 'No'}
        </Text>
        {error && (
          <Text style={[styles.debugText, { color: '#ff6b6b', fontSize: 10 }]}>
            Error: {error}
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  video: {
    width: '100%',
    height: '80%',
    backgroundColor: '#000',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    padding: 16,
  },
  debugInfo: {
    position: 'absolute',
    bottom: 50,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
    borderRadius: 4,
  },
  debugText: {
    fontSize: 12,
    color: '#fff',
    textAlign: 'center',
  },
});

export default SeamlessVideoPlayer;
