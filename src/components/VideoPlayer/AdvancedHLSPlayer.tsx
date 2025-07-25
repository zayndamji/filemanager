import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useFileManagerService } from '../../hooks/useFileManagerService';
import { EncryptedFile } from '../../utils/FileManagerService';
import { ThemeContext } from '../../theme';
import { SeamlessVideoStreamingService } from './HLSStreamingService';

// Conditionally import HLS.js for web platform
let Hls: any = null;
if (Platform.OS === 'web') {
  try {
    const hlsModule = require('hls.js');
    Hls = hlsModule.default || hlsModule;
  } catch (e) {
    console.warn('[EnhancedSeamlessVideoPlayer] HLS.js not available:', e);
  }
}

// Conditionally import react-native-video for native platforms
let Video: any = null;
if (Platform.OS !== 'web') {
  try {
    const RNVideo = require('react-native-video');
    Video = RNVideo.default || RNVideo;
  } catch (e) {
    console.warn('[EnhancedSeamlessVideoPlayer] react-native-video not available:', e);
  }
}

interface EnhancedSeamlessVideoPlayerProps {
  file: EncryptedFile;
  onError?: (error: string) => void;
  bufferAhead?: number; // Number of segments to buffer ahead
  maxBufferSize?: number; // Maximum buffer size in seconds
  enableAdaptiveStreaming?: boolean; // Enable adaptive quality based on network
}

const EnhancedSeamlessVideoPlayer: React.FC<EnhancedSeamlessVideoPlayerProps> = ({ 
  file, 
  onError, 
  bufferAhead = 5, // Increased default buffer
  maxBufferSize = 60, // Increased default buffer size
  enableAdaptiveStreaming = true
}) => {
  const fileManagerService = useFileManagerService();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  
  // Video player refs
  const videoRef = useRef<any>(null);
  const hlsRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Enhanced streaming state
  const [streamingService, setStreamingService] = useState<any>(null);
  const [totalSegments, setTotalSegments] = useState(0);
  const [cachedSegments, setCachedSegments] = useState(0);
  const [currentSegment, setCurrentSegment] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [mediaSource, setMediaSource] = useState<any>(null);
  const [sourceBuffer, setSourceBuffer] = useState<any>(null);
  
  // Performance metrics
  const [averageLoadTime, setAverageLoadTime] = useState(0);
  const [networkSpeed, setNetworkSpeed] = useState('unknown');
  const [adaptiveQuality, setAdaptiveQuality] = useState('auto');
  
  const { theme } = React.useContext(ThemeContext);

  useEffect(() => {
    initializeEnhancedPlayer();
    return cleanup;
  }, [file.uuid]);

  useEffect(() => {
    // Update streaming stats periodically
    if (streamingService) {
      const interval = setInterval(updateStreamingStats, 1000);
      return () => clearInterval(interval);
    }
  }, [streamingService]);

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (mediaSource) {
      try {
        if (mediaSource.readyState !== 'closed') {
          mediaSource.endOfStream();
        }
      } catch (e) {
        console.warn('[EnhancedSeamlessVideoPlayer] Error ending media source:', e);
      }
    }
    if (file.uuid) {
      SeamlessVideoStreamingService.destroyStreaming(file.uuid);
    }
  }, [mediaSource, file.uuid]);

  const initializeEnhancedPlayer = async () => {
    try {
      setLoading(true);
      setError(null);
      setProgress(0);
      
      abortControllerRef.current = new AbortController();
      
      console.log('[EnhancedSeamlessVideoPlayer] Initializing enhanced player for:', file.uuid);
      
      // Load metadata to verify HLS video
      const metadata = await fileManagerService.loadFileMetadata(file.uuid);
      const isHLS = (metadata as any).isHLS === true && (metadata as any).version === '3.0';
      
      if (!isHLS) {
        throw new Error('EnhancedSeamlessVideoPlayer only supports HLS videos');
      }
      
      // Initialize the streaming service
      const streaming = await SeamlessVideoStreamingService.initializeStreaming(
        file.uuid,
        await getEncryptionKey(), // You'll need to provide the key
        bufferAhead,
        Math.max(bufferAhead * 2, 10)
      );
      
      setStreamingService(streaming);
      setTotalSegments(streaming.totalSegments);
      
      // Preload initial segments
      setProgress(10);
      await streaming.preloadSegments(0, Math.min(bufferAhead, streaming.totalSegments));
      setProgress(30);
      
      if (Platform.OS === 'web') {
        await initializeEnhancedWebPlayer(streaming);
      } else {
        await initializeEnhancedNativePlayer(streaming);
      }
      
      setProgress(100);
      console.log('[EnhancedSeamlessVideoPlayer] Enhanced player initialized successfully');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize enhanced player';
      console.error('[EnhancedSeamlessVideoPlayer] Initialization error:', err);
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getEncryptionKey = async (): Promise<Uint8Array> => {
    // You'll need to implement this based on your key management system
    // This is a placeholder - replace with your actual key retrieval logic
    const { PasswordContext } = require('../../context/PasswordContext');
    // Return the encryption key from your context or storage
    throw new Error('Encryption key retrieval not implemented');
  };

  const initializeEnhancedWebPlayer = async (streaming: any) => {
    const supportsHLS = Hls && Hls.isSupported();
    const supportsMSE = typeof (global as any).MediaSource !== 'undefined';
    
    if (supportsHLS) {
      console.log('[EnhancedSeamlessVideoPlayer] Using enhanced HLS.js streaming');
      await setupEnhancedHLSJS(streaming);
    } else if (supportsMSE) {
      console.log('[EnhancedSeamlessVideoPlayer] Using enhanced MSE streaming');
      await setupEnhancedMSE(streaming);
    } else {
      throw new Error('No supported streaming method available for web');
    }
  };

  const setupEnhancedHLSJS = async (streaming: any) => {
    if (!Hls) return;
    
    const hls = new Hls({
      debug: false,
      enableWorker: true,
      lowLatencyMode: true,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 5,
      liveDurationInfinity: true,
      backBufferLength: 30,
      maxBufferLength: maxBufferSize,
      maxMaxBufferLength: maxBufferSize * 2,
      maxBufferHole: 0.5,
      highBufferWatchdogPeriod: 2,
      nudgeOffset: 0.1,
      nudgeMaxRetry: 3,
      maxLoadingDelay: 4,
      maxBufferSize: 60 * 1000 * 1000, // 60MB
    });
    
    hlsRef.current = hls;
    
    // Create a custom loader for seamless segment loading
    const originalLoader = hls.config.loader;
    hls.config.loader = class extends originalLoader {
      load(context: any, config: any, callbacks: any) {
        if (context.type === 'segment') {
          // Use our streaming service for segment loading
          handleCustomSegmentLoad(context, callbacks, streaming);
        } else {
          // Use default loader for playlist and other resources
          super.load(context, config, callbacks);
        }
      }
    };
    
    // Set up enhanced event listeners
    setupHLSEventListeners(hls, streaming);
    
    if (videoRef.current) {
      hls.attachMedia(videoRef.current);
    }
    
    // Create and load a basic playlist - segments will be loaded on-demand
    const basicPlaylist = await createBasicPlaylist(streaming.totalSegments);
    const playlistBlob = new (global as any).Blob([basicPlaylist], { type: 'application/vnd.apple.mpegurl' });
    const playlistUrl = (global as any).URL.createObjectURL(playlistBlob);
    
    hls.loadSource(playlistUrl);
  };

  const setupEnhancedMSE = async (streaming: any) => {
    const MediaSourceClass = (global as any).MediaSource;
    if (!MediaSourceClass) return;
    
    const ms = new MediaSourceClass();
    setMediaSource(ms);
    
    const videoUrl = (global as any).URL.createObjectURL(ms);
    setVideoUrl(videoUrl);
    
    ms.addEventListener('sourceopen', async () => {
      try {
        // Try different codecs
        const codecs = [
          'video/mp4; codecs="avc1.64002a,mp4a.40.2"',
          'video/mp2t; codecs="avc1.64002a,mp4a.40.2"',
          'video/mp2t'
        ];
        
        let sb = null;
        for (const codec of codecs) {
          if (MediaSourceClass.isTypeSupported(codec)) {
            sb = ms.addSourceBuffer(codec);
            break;
          }
        }
        
        if (!sb) {
          throw new Error('No supported codec found');
        }
        
        setSourceBuffer(sb);
        
        // Enhanced buffer management
        sb.addEventListener('updateend', () => handleBufferUpdate(streaming));
        sb.addEventListener('error', handleBufferError);
        
        // Start streaming initial segments
        await startEnhancedStreaming(sb, streaming);
        
      } catch (err) {
        console.error('[EnhancedSeamlessVideoPlayer] MSE setup error:', err);
        setError('Failed to setup enhanced video streaming');
      }
    });
    
    if (videoRef.current) {
      videoRef.current.src = videoUrl;
    }
  };

  const handleCustomSegmentLoad = async (context: any, callbacks: any, streaming: any) => {
    try {
      // Extract segment index from URL
      const url = context.url;
      const segmentMatch = url.match(/segment(\d+)/);
      const segmentIndex = segmentMatch ? parseInt(segmentMatch[1]) : 0;
      
      setBuffering(true);
      const startTime = Date.now();
      
      // Use streaming service to get segment
      const segmentData = await streaming.getSegment(segmentIndex);
      
      const loadTime = Date.now() - startTime;
      updatePerformanceMetrics(loadTime, segmentData.length);
      
      setBuffering(false);
      
      // Return segment data to HLS.js
      callbacks.onSuccess({
        data: segmentData.buffer,
        url: context.url
      }, {}, context);
      
    } catch (error) {
      setBuffering(false);
      console.error('[EnhancedSeamlessVideoPlayer] Custom segment load error:', error);
      callbacks.onError({ code: 2, text: 'Segment load failed' }, context);
    }
  };

  const initializeEnhancedNativePlayer = async (streaming: any) => {
    console.log('[EnhancedSeamlessVideoPlayer] Setting up enhanced native streaming');
    
    // For native, we'll use a progressive loading approach
    // Load initial segments and create a playable file
    const initialSegmentCount = Math.min(bufferAhead, streaming.totalSegments);
    const initialSegments: Uint8Array[] = [];
    
    for (let i = 0; i < initialSegmentCount; i++) {
      const segmentData = await streaming.getSegment(i);
      initialSegments.push(segmentData);
      setProgress(30 + (i / initialSegmentCount) * 40);
    }
    
    // Create initial concatenated video
    const totalBytes = initialSegments.reduce((sum, seg) => sum + seg.length, 0);
    const concatenatedVideo = new Uint8Array(totalBytes);
    let offset = 0;
    
    for (const segment of initialSegments) {
      concatenatedVideo.set(segment, offset);
      offset += segment.length;
    }
    
    // Create temp file for native playback
    const FileManagerService = require('../../utils/FileManagerService').FileManagerService;
    const tempPath = await FileManagerService.createTempFile(concatenatedVideo, 'enhanced_streaming_video.ts');
    setVideoUrl(`file://${tempPath}`);
    
    // Start background loading of remaining segments
    startBackgroundNativeStreaming(streaming, initialSegmentCount);
  };

  const startBackgroundNativeStreaming = async (streaming: any, startIndex: number) => {
    // Continue loading segments in background for native
    for (let i = startIndex; i < streaming.totalSegments; i++) {
      try {
        await streaming.getSegment(i);
        // Update progress
        const progress = 70 + (i / streaming.totalSegments) * 30;
        setProgress(progress);
      } catch (err) {
        console.warn(`[EnhancedSeamlessVideoPlayer] Background loading failed for segment ${i}:`, err);
      }
    }
  };

  const createBasicPlaylist = async (segmentCount: number): Promise<string> => {
    let playlist = '#EXTM3U\n';
    playlist += '#EXT-X-VERSION:3\n';
    playlist += '#EXT-X-TARGETDURATION:10\n';
    
    for (let i = 0; i < segmentCount; i++) {
      playlist += '#EXTINF:10.0,\n';
      playlist += `segment${i}.ts\n`;
    }
    
    playlist += '#EXT-X-ENDLIST\n';
    return playlist;
  };

  const setupHLSEventListeners = (hls: any, streaming: any) => {
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('[EnhancedSeamlessVideoPlayer] Enhanced HLS manifest parsed');
      setProgress(80);
    });
    
    hls.on(Hls.Events.FRAG_LOADING, (event: any, data: any) => {
      setBuffering(true);
    });
    
    hls.on(Hls.Events.FRAG_LOADED, (event: any, data: any) => {
      setBuffering(false);
      // Trigger preloading of next segments
      streaming.preloadSegments(data.frag.sn + 1, bufferAhead);
    });
    
    hls.on(Hls.Events.ERROR, (event: any, data: any) => {
      console.error('[EnhancedSeamlessVideoPlayer] HLS error:', data);
      if (data.fatal) {
        setError(`HLS playback error: ${data.details}`);
      }
    });
  };

  const startEnhancedStreaming = async (sourceBuffer: any, streaming: any) => {
    // Load first segment to start playback
    const firstSegment = await streaming.getSegment(0);
    await appendToSourceBuffer(sourceBuffer, firstSegment);
    setCurrentSegment(1);
    
    // Start continuous streaming
    startContinuousStreaming(sourceBuffer, streaming);
  };

  const startContinuousStreaming = async (sourceBuffer: any, streaming: any) => {
    let currentSegmentIndex = 1;
    
    const streamLoop = async () => {
      if (!sourceBuffer || sourceBuffer.updating || currentSegmentIndex >= streaming.totalSegments) {
        return;
      }
      
      try {
        const segmentData = await streaming.getSegment(currentSegmentIndex);
        await appendToSourceBuffer(sourceBuffer, segmentData);
        currentSegmentIndex++;
        setCurrentSegment(currentSegmentIndex);
        
        // Continue streaming
        setTimeout(streamLoop, 100);
        
      } catch (err) {
        console.error('[EnhancedSeamlessVideoPlayer] Continuous streaming error:', err);
        setTimeout(streamLoop, 1000); // Retry after 1 second
      }
    };
    
    streamLoop();
  };

  const appendToSourceBuffer = (sourceBuffer: any, data: Uint8Array): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (sourceBuffer.updating) {
        setTimeout(() => appendToSourceBuffer(sourceBuffer, data).then(resolve).catch(reject), 10);
        return;
      }
      
      const onUpdateEnd = () => {
        sourceBuffer.removeEventListener('updateend', onUpdateEnd);
        sourceBuffer.removeEventListener('error', onError);
        resolve();
      };
      
      const onError = (e: Event) => {
        sourceBuffer.removeEventListener('updateend', onUpdateEnd);
        sourceBuffer.removeEventListener('error', onError);
        reject(e);
      };
      
      sourceBuffer.addEventListener('updateend', onUpdateEnd);
      sourceBuffer.addEventListener('error', onError);
      
      try {
        sourceBuffer.appendBuffer(data.buffer);
      } catch (err) {
        sourceBuffer.removeEventListener('updateend', onUpdateEnd);
        sourceBuffer.removeEventListener('error', onError);
        reject(err);
      }
    });
  };

  const handleBufferUpdate = (streaming: any) => {
    // Manage buffer health and preload next segments
    if (videoRef.current && streaming) {
      const video = videoRef.current;
      const currentTime = video.currentTime || 0;
      const buffered = video.buffered;
      
      if (buffered && buffered.length > 0) {
        const bufferedEnd = buffered.end(buffered.length - 1);
        const bufferRemaining = bufferedEnd - currentTime;
        
        // If buffer is getting low, preload more segments
        if (bufferRemaining < 15) {
          const nextSegmentIndex = Math.floor(bufferedEnd / 10); // Assuming 10s segments
          streaming.preloadSegments(nextSegmentIndex, bufferAhead);
        }
      }
    }
  };

  const handleBufferError = (e: Event) => {
    console.error('[EnhancedSeamlessVideoPlayer] Buffer error:', e);
    setBuffering(false);
  };

  const updatePerformanceMetrics = (loadTime: number, dataSize: number) => {
    setAverageLoadTime(prev => prev === 0 ? loadTime : (prev + loadTime) / 2);
    
    // Calculate approximate network speed
    const speedKbps = (dataSize * 8) / (loadTime / 1000) / 1024;
    if (speedKbps > 1000) {
      setNetworkSpeed('fast');
    } else if (speedKbps > 500) {
      setNetworkSpeed('medium');
    } else {
      setNetworkSpeed('slow');
    }
    
    // Adjust streaming parameters based on performance
    if (enableAdaptiveStreaming) {
      adjustStreamingParameters(speedKbps);
    }
  };

  const adjustStreamingParameters = (speedKbps: number) => {
    if (speedKbps < 300) {
      // Slow connection - reduce buffer ahead
      setAdaptiveQuality('low');
    } else if (speedKbps > 1000) {
      // Fast connection - increase buffer ahead
      setAdaptiveQuality('high');
    } else {
      setAdaptiveQuality('medium');
    }
  };

  const updateStreamingStats = () => {
    if (streamingService && file.uuid) {
      const stats = SeamlessVideoStreamingService.getStreamingStats(file.uuid);
      if (stats) {
        setCachedSegments(stats.cachedSegments);
        setCurrentSegment(stats.currentSegment);
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
    }
  };

  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleError = (e: any) => {
    console.error('[EnhancedSeamlessVideoPlayer] Video error:', e);
    const errorMessage = 'Enhanced video playback error';
    setError(errorMessage);
    onError?.(errorMessage);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Loading enhanced video player... {Math.round(progress)}%
        </Text>
        <Text style={[styles.statusText, { color: theme.textSecondary }]}>
          Network: {networkSpeed} | Quality: {adaptiveQuality}
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
        {buffering && (
          <View style={styles.bufferingOverlay}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={styles.bufferingText}>Buffering...</Text>
          </View>
        )}
        <View style={styles.enhancedDebugInfo}>
          <Text style={[styles.debugText, { color: theme.text }]}>
            Segments: {currentSegment}/{totalSegments} | Cached: {cachedSegments}
          </Text>
          <Text style={[styles.debugText, { color: theme.text }]}>
            Time: {Math.round(currentTime)}s/{Math.round(duration)}s | 
            Network: {networkSpeed} | Quality: {adaptiveQuality}
          </Text>
          <Text style={[styles.debugText, { color: theme.text }]}>
            Avg Load Time: {Math.round(averageLoadTime)}ms
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
        }}
        onProgress={(data: any) => {
          setCurrentTime(data.currentTime);
        }}
        onPlay={handlePlay}
        onPause={handlePause}
        onError={handleError}
        onBuffer={(data: any) => {
          setBuffering(data.isBuffering);
        }}
        paused={false}
        bufferConfig={{
          minBufferMs: 15000,
          maxBufferMs: maxBufferSize * 1000,
          bufferForPlaybackMs: 2500,
          bufferForPlaybackAfterRebufferMs: 5000,
        }}
      />
      {buffering && (
        <View style={styles.bufferingOverlay}>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.bufferingText}>Buffering...</Text>
        </View>
      )}
      <View style={styles.enhancedDebugInfo}>
        <Text style={[styles.debugText, { color: theme.text }]}>
          Segments: {currentSegment}/{totalSegments} | Cached: {cachedSegments}
        </Text>
        <Text style={[styles.debugText, { color: theme.text }]}>
          Time: {Math.round(currentTime)}s/{Math.round(duration)}s | Quality: {adaptiveQuality}
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
  statusText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    padding: 16,
  },
  bufferingOverlay: {
    position: 'absolute',
    top: '40%',
    left: '50%',
    transform: [{ translateX: -25 }, { translateY: -25 }],
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bufferingText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 14,
  },
  enhancedDebugInfo: {
    position: 'absolute',
    bottom: 50,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 12,
    borderRadius: 8,
  },
  debugText: {
    fontSize: 11,
    color: '#fff',
    textAlign: 'center',
    marginVertical: 1,
  },
});

export default EnhancedSeamlessVideoPlayer;
