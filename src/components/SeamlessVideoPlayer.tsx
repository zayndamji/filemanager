import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useFileManagerService } from '../hooks/useFileManagerService';
import { EncryptedFile } from '../utils/FileManagerService';
import { ThemeContext } from '../theme';

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
  const fileManagerService = useFileManagerService();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Video player refs
  const videoRef = useRef<any>(null);
  const hlsRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const mediaSourceRef = useRef<any>(null);
  
  // Seamless streaming state
  const [mediaSource, setMediaSource] = useState<any>(null);
  const [sourceBuffer, setSourceBuffer] = useState<any>(null);
  const [segmentCache, setSegmentCache] = useState<Map<number, SegmentBuffer>>(new Map());
  const [currentSegment, setCurrentSegment] = useState(0);
  const [totalSegments, setTotalSegments] = useState(0);
  const [segmentDuration, setSegmentDuration] = useState(10); // Default 10 seconds per segment
  
  // Metadata state
  const [hlsMetadata, setHlsMetadata] = useState<any>(null);
  const [getSegmentFunc, setGetSegmentFunc] = useState<((index: number) => Promise<Uint8Array>) | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  
  const { theme } = React.useContext(ThemeContext);

  useEffect(() => {
    initializePlayer();
    return () => {
      // Cleanup function that doesn't depend on mediaSource state
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      // Clean up MediaSource using ref instead of state
      const currentMediaSource = mediaSourceRef.current;
      if (currentMediaSource && currentMediaSource.readyState !== 'closed') {
        try {
          console.log('[SeamlessVideoPlayer] Cleaning up MediaSource, current state:', currentMediaSource.readyState);
          currentMediaSource.endOfStream();
        } catch (e) {
          console.warn('[SeamlessVideoPlayer] Error ending media source:', e);
        }
      }
      mediaSourceRef.current = null;
      setSegmentCache(new Map());
    };
  }, [file.uuid]);

  useEffect(() => {
    if (isPlaying && hlsMetadata && getSegmentFunc) {
      const interval = setInterval(() => {
        checkAndLoadNextSegments();
      }, 1000); // Check every second
      
      return () => clearInterval(interval);
    }
  }, [isPlaying, currentTime, hlsMetadata, getSegmentFunc]);

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const currentMediaSource = mediaSourceRef.current;
    if (currentMediaSource && currentMediaSource.readyState !== 'closed') {
      try {
        console.log('[SeamlessVideoPlayer] Manual cleanup - MediaSource state:', currentMediaSource.readyState);
        currentMediaSource.endOfStream();
      } catch (e) {
        console.warn('[SeamlessVideoPlayer] Error ending media source:', e);
      }
    }
    mediaSourceRef.current = null;
    setSegmentCache(new Map());
  }, []);

  const initializePlayer = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('[SeamlessVideoPlayer] Starting player initialization for file:', file.uuid);
      
      abortControllerRef.current = new AbortController();
      
      // Load metadata to determine video type
      console.log('[SeamlessVideoPlayer] Loading file metadata...');
      const metadata = await fileManagerService.loadFileMetadata(file.uuid);
      const isHLS = (metadata as any).isHLS === true && (metadata as any).version === '3.0';
      
      console.log('[SeamlessVideoPlayer] Metadata loaded:', {
        isHLS,
        version: (metadata as any).version,
        type: metadata.type
      });
      
      if (!isHLS) {
        throw new Error('SeamlessVideoPlayer only supports HLS videos');
      }
      
      // Load HLS video data
      console.log('[SeamlessVideoPlayer] Loading HLS video data...');
      const { playlistData, metadata: hlsMeta, getSegment } = await fileManagerService.loadEncryptedHLSVideo(
        file.uuid,
        abortControllerRef.current.signal
      );
      
      console.log('[SeamlessVideoPlayer] HLS data loaded:', {
        playlistSize: playlistData.length,
        segmentCount: hlsMeta.segmentCount,
        getSegmentAvailable: !!getSegment
      });
      
      setHlsMetadata(hlsMeta);
      setGetSegmentFunc(() => getSegment);
      setTotalSegments(hlsMeta.segmentCount);
      
      console.log('[SeamlessVideoPlayer] State updated - totalSegments set to:', hlsMeta.segmentCount);
      
      if (Platform.OS === 'web') {
        console.log('[SeamlessVideoPlayer] Initializing web player...');
        await initializeWebPlayer(playlistData, hlsMeta, getSegment);
        console.log('[SeamlessVideoPlayer] Web player initialized successfully');
      } else {
        console.log('[SeamlessVideoPlayer] Initializing native player...');
        await initializeNativePlayer(playlistData, hlsMeta, getSegment);
        console.log('[SeamlessVideoPlayer] Native player initialized successfully');
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize player';
      console.error('[SeamlessVideoPlayer] Initialization error:', err);
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const initializeWebPlayer = async (
    playlistData: Uint8Array, 
    hlsMeta: any, 
    getSegment: (index: number) => Promise<Uint8Array>
  ) => {
    try {
      // Check if we should use MSE or HLS.js
      const MediaSourceClass = getGlobalMediaSource();
      const supportsMSE = MediaSourceClass && typeof MediaSourceClass.isTypeSupported === 'function' && 
                         MediaSourceClass.isTypeSupported('video/mp4; codecs="avc1.64002a,mp4a.40.2"');
      const supportsHLS = Hls && Hls.isSupported();
      
      console.log('[SeamlessVideoPlayer] Browser support check:', {
        MediaSourceClass: !!MediaSourceClass,
        supportsMSE,
        supportsHLS,
        HlsAvailable: !!Hls
      });
      
      if (supportsMSE) {
        console.log('[SeamlessVideoPlayer] Using MSE for seamless playback');
        await initializeMSEPlayer(hlsMeta, getSegment);
      } else if (supportsHLS) {
        console.log('[SeamlessVideoPlayer] Using HLS.js for playback');
        await initializeHLSJSPlayer(playlistData, hlsMeta, getSegment);
      } else {
        throw new Error('No supported streaming method available');
      }
    } catch (error) {
      console.error('[SeamlessVideoPlayer] Web player initialization failed:', error);
      throw error;
    }
  };

  const initializeMSEPlayer = async (hlsMeta: any, getSegment: (index: number) => Promise<Uint8Array>) => {
    const MediaSourceClass = getGlobalMediaSource();
    const URLClass = getGlobalURL();
    
    if (!MediaSourceClass || !URLClass) {
      throw new Error('MediaSource or URL not available');
    }
    
    return new Promise<void>((resolve, reject) => {
      const ms = new MediaSourceClass();
      console.log('[SeamlessVideoPlayer] Created MediaSource, initial state:', ms.readyState);
      
      const videoUrl = URLClass.createObjectURL(ms);
      setVideoUrl(videoUrl);
      
      const onSourceOpen = async () => {
        try {
          console.log('[SeamlessVideoPlayer] MediaSource opened, state:', ms.readyState);
          
          // Remove event listener to prevent multiple calls
          ms.removeEventListener('sourceopen', onSourceOpen);
          
          // Try different codec combinations
          const codecs = [
            'video/mp4; codecs="avc1.64002a,mp4a.40.2"',
            'video/mp2t; codecs="avc1.64002a,mp4a.40.2"',
            'video/mp2t'
          ];
          
          let sb: any = null;
          for (const codec of codecs) {
            if (MediaSourceClass.isTypeSupported(codec)) {
              console.log(`[SeamlessVideoPlayer] Using codec: ${codec}`);
              sb = ms.addSourceBuffer(codec);
              break;
            }
          }
          
          if (!sb) {
            throw new Error('No supported codec found');
          }
          
          setSourceBuffer(sb);
          
          // Set up buffer management
          sb.addEventListener('updateend', () => {
            console.log('[SeamlessVideoPlayer] SourceBuffer update ended, MediaSource state:', ms.readyState);
            if (ms.readyState === 'open') {
              checkAndLoadNextSegments();
            }
          });
          
          sb.addEventListener('error', (e: any) => {
            console.error('[SeamlessVideoPlayer] SourceBuffer error:', e);
            reject(new Error('SourceBuffer error'));
          });
          
          // Store MediaSource reference in both state and ref
          mediaSourceRef.current = ms;
          setMediaSource(ms);
          
          // Load initial segments
          await loadInitialSegments(sb, getSegment, hlsMeta.segmentCount);
          
          console.log('[SeamlessVideoPlayer] MSE initialization complete');
          resolve();
          
        } catch (err) {
          console.error('[SeamlessVideoPlayer] MSE setup error:', err);
          reject(err);
        }
      };
      
      const onSourceEnded = () => {
        console.log('[SeamlessVideoPlayer] MediaSource ended');
      };
      
      const onSourceClose = () => {
        console.log('[SeamlessVideoPlayer] MediaSource closed');
      };
      
      const onError = (e: any) => {
        console.error('[SeamlessVideoPlayer] MediaSource error:', e);
        reject(new Error('MediaSource error'));
      };
      
      // Set up event listeners
      ms.addEventListener('sourceopen', onSourceOpen);
      ms.addEventListener('sourceended', onSourceEnded);
      ms.addEventListener('sourceclose', onSourceClose);
      ms.addEventListener('error', onError);
      
      // Wait for video element to be ready before setting src
      const waitForVideoElement = () => {
        if (videoRef.current) {
          console.log('[SeamlessVideoPlayer] Setting video src to MediaSource URL');
          (videoRef.current as any).src = videoUrl;
        } else {
          console.log('[SeamlessVideoPlayer] Video element not ready, waiting...');
          setTimeout(waitForVideoElement, 100);
        }
      };
      
      waitForVideoElement();
      
      // Timeout to prevent hanging
      setTimeout(() => {
        if (ms.readyState === 'closed') {
          reject(new Error('MediaSource failed to open within timeout'));
        }
      }, 10000);
    });
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
    const FileManagerService = require('../utils/FileManagerService').FileManagerService;
    const tempPath = await FileManagerService.createTempFile(concatenatedVideo, 'streaming_video.ts');
    
    // Start background loading of remaining segments
    backgroundLoadSegments(getSegment, hlsMeta.segmentCount);
    
    return `file://${tempPath}`;
  };

  const loadInitialSegments = async (sb: any, getSegment: (index: number) => Promise<Uint8Array>, segmentCount: number) => {
    try {
      console.log('[SeamlessVideoPlayer] Loading initial segments, total segments:', segmentCount);
      
      // Check MediaSource state before loading using ref
      const currentMediaSource = mediaSourceRef.current;
      if (!currentMediaSource || currentMediaSource.readyState !== 'open') {
        throw new Error(`MediaSource not ready for loading, state: ${currentMediaSource?.readyState}`);
      }
      
      if (segmentCount === 0) {
        throw new Error('No segments available to load');
      }
      
      // Load first segment to get the video started
      console.log('[SeamlessVideoPlayer] Loading first segment...');
      const firstSegment = await getSegment(0);
      console.log('[SeamlessVideoPlayer] First segment loaded, size:', firstSegment.length);
      
      await appendToBuffer(sb, firstSegment);
      console.log('[SeamlessVideoPlayer] First segment appended successfully');
      setCurrentSegment(1);
      
      // Cache upcoming segments
      console.log('[SeamlessVideoPlayer] Starting to preload upcoming segments...');
      for (let i = 1; i < Math.min(bufferAhead + 1, segmentCount); i++) {
        preloadSegment(i, getSegment);
      }
      
    } catch (err) {
      console.error('[SeamlessVideoPlayer] Error loading initial segments:', err);
      throw err;
    }
  };

  const appendToBuffer = (sb: any, data: Uint8Array): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Use ref for MediaSource to avoid state-related issues
      const currentMediaSource = mediaSourceRef.current;
      
      // Check if MediaSource is still valid
      if (!currentMediaSource) {
        console.warn('[SeamlessVideoPlayer] MediaSource reference not available for append');
        reject(new Error('MediaSource not available'));
        return;
      }
      
      if (currentMediaSource.readyState === 'closed' || currentMediaSource.readyState === 'ended') {
        console.warn('[SeamlessVideoPlayer] MediaSource not available for append, state:', currentMediaSource.readyState);
        reject(new Error('MediaSource not available'));
        return;
      }
      
      if (sb.updating) {
        console.log('[SeamlessVideoPlayer] SourceBuffer is updating, waiting...');
        setTimeout(() => appendToBuffer(sb, data).then(resolve).catch(reject), 10);
        return;
      }
      
      const onUpdateEnd = () => {
        sb.removeEventListener('updateend', onUpdateEnd);
        sb.removeEventListener('error', onError);
        console.log('[SeamlessVideoPlayer] Buffer append completed, MediaSource state:', currentMediaSource?.readyState);
        resolve();
      };
      
      const onError = (e: Event) => {
        sb.removeEventListener('updateend', onUpdateEnd);
        sb.removeEventListener('error', onError);
        console.error('[SeamlessVideoPlayer] Buffer append error:', e);
        reject(e);
      };
      
      sb.addEventListener('updateend', onUpdateEnd);
      sb.addEventListener('error', onError);
      
      try {
        console.log('[SeamlessVideoPlayer] Appending buffer, size:', data.length, 'bytes, MediaSource state:', currentMediaSource?.readyState);
        sb.appendBuffer(data.buffer);
      } catch (err) {
        sb.removeEventListener('updateend', onUpdateEnd);
        sb.removeEventListener('error', onError);
        console.error('[SeamlessVideoPlayer] Failed to append buffer:', err);
        reject(err);
      }
    });
  };

  const preloadSegment = async (index: number, getSegment: (index: number) => Promise<Uint8Array>) => {
    // Use hlsMetadata for segment count if totalSegments state isn't ready yet
    const segmentCount = totalSegments || (hlsMetadata?.segmentCount) || 0;
    if (index >= segmentCount) return;
    
    const cached = segmentCache.get(index);
    if (cached?.loaded || cached?.loading) return;
    
    // Mark as loading
    setSegmentCache(prev => new Map(prev.set(index, { 
      data: new Uint8Array(0), 
      index, 
      loaded: false, 
      loading: true 
    })));
    
    try {
      const data = await getSegment(index);
      setSegmentCache(prev => new Map(prev.set(index, { 
        data, 
        index, 
        loaded: true, 
        loading: false 
      })));
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
    if (!sourceBuffer || !getSegmentFunc || !videoRef.current) return;
    
    // Check MediaSource state using ref
    const currentMediaSource = mediaSourceRef.current;
    if (!currentMediaSource || currentMediaSource.readyState !== 'open') {
      console.warn('[SeamlessVideoPlayer] MediaSource not ready for segment loading, state:', currentMediaSource?.readyState);
      return;
    }
    
    // Use hlsMetadata for segment count if totalSegments state isn't ready yet
    const segmentCount = totalSegments || (hlsMetadata?.segmentCount) || 0;
    if (segmentCount === 0) {
      console.warn('[SeamlessVideoPlayer] No segments available for loading');
      return;
    }
    
    const video = videoRef.current as any;
    const currentVideoTime = video.currentTime || 0;
    
    // Calculate which segment we should be on
    const expectedSegment = Math.floor(currentVideoTime / segmentDuration);
    
    // Check if we need to load more segments
    const bufferedEnd = video.buffered && video.buffered.length > 0 ? video.buffered.end(video.buffered.length - 1) : 0;
    const bufferRemaining = bufferedEnd - currentVideoTime;
    
    if (bufferRemaining < 10) { // If less than 10 seconds buffered
      // Load next segments
      for (let i = currentSegment; i < Math.min(currentSegment + bufferAhead, segmentCount); i++) {
        const cached = segmentCache.get(i);
        if (cached?.loaded && !sourceBuffer.updating) {
          try {
            console.log('[SeamlessVideoPlayer] Appending cached segment', i);
            await appendToBuffer(sourceBuffer, cached.data);
            setCurrentSegment(i + 1);
            
            // Preload next segment
            preloadSegment(i + bufferAhead, getSegmentFunc);
            
          } catch (err) {
            console.error(`[SeamlessVideoPlayer] Error appending segment ${i}:`, err);
            // If MediaSource is closed, stop trying to append
            if (currentMediaSource?.readyState === 'closed' || currentMediaSource?.readyState === 'ended') {
              break;
            }
          }
        } else if (!cached?.loading) {
          preloadSegment(i, getSegmentFunc);
        }
      }
    }
    
    // Clean up old segments to prevent memory issues
    cleanupOldSegments(expectedSegment);
  }, [sourceBuffer, getSegmentFunc, currentSegment, totalSegments, segmentDuration, bufferAhead, segmentCache, hlsMetadata]);

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
    // Use hlsMetadata for segment count if totalSegments state isn't ready yet
    const segmentCount = totalSegments || (hlsMetadata?.segmentCount) || 0;
    const startIndex = currentSegment;
    for (let i = startIndex; i < Math.min(startIndex + bufferAhead, segmentCount); i++) {
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

  const renderWebVideo = () => {
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
          onLoadStart={() => console.log('[SeamlessVideoPlayer] Video load started')}
          onCanPlay={() => console.log('[SeamlessVideoPlayer] Video can play')}
          onLoadedData={() => console.log('[SeamlessVideoPlayer] Video loaded data')}
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
    return renderWebVideo();
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
          Segments: {currentSegment}/{totalSegments} | 
          Cached: {segmentCache.size} | 
          Time: {Math.round(currentTime)}s/{Math.round(duration)}s
        </Text>
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
