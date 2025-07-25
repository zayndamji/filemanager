import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useFileManagerService } from '../../hooks/useFileManagerService';
import { EncryptedFile } from '../../utils/FileManagerService';
import { ThemeContext } from '../../theme';
import { waitForVideoElement, waitForVideoMediaReady, safeVideoOperation } from './VideoUtils';

// Global accessors for web APIs
const getGlobalBlob = () => {
  if (Platform.OS === 'web') {
    return (global as any).Blob || (global as any).window?.Blob;
  }
  return null;
};

const getGlobalURL = () => {
  if (Platform.OS === 'web') {
    return (global as any).URL || (global as any).window?.URL;
  }
  return null;
};

// Conditionally import Video component for React Native
let Video: any = null;
if (Platform.OS !== 'web') {
  try {
    Video = require('react-native-video').default;
  } catch (e) {
    console.warn('[StandardVideoPlayer] react-native-video not available:', e);
  }
}

// Conditionally import HLS.js for web platform
let Hls: any = null;
if (Platform.OS === 'web') {
  try {
    const hlsModule = require('hls.js');
    Hls = hlsModule.default || hlsModule;
    console.log('[StandardVideoPlayer] HLS.js loaded:', !!Hls);
  } catch (e) {
    console.warn('[StandardVideoPlayer] HLS.js not available:', e);
  }
}

interface StandardVideoPlayerProps {
  file: EncryptedFile;
  onError?: (error: string) => void;
}

const StandardVideoPlayer: React.FC<StandardVideoPlayerProps> = ({ file, onError }) => {
  const fileManagerService = useFileManagerService();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoSource, setVideoSource] = useState<string | null>(null);
  const [isHLSVideo, setIsHLSVideo] = useState(false);
  const [blobUrls, setBlobUrls] = useState<string[]>([]); // Track blob URLs for cleanup
  const videoRef = useRef<any>(null);
  const hlsRef = useRef<any>(null);
  
  const { theme } = React.useContext(ThemeContext);

  // Track component mounting state
  const [isMounted, setIsMounted] = useState(false);
  
  useLayoutEffect(() => {
    setIsMounted(true);
    console.log('[StandardVideoPlayer] Component layout effect - marked as mounted');
    return () => {
      setIsMounted(false);
      console.log('[StandardVideoPlayer] Component unmounting');
    };
  }, []);

  useEffect(() => {
    if (!isMounted) {
      console.log('[StandardVideoPlayer] Component not yet mounted, skipping video load');
      return;
    }
    
    // Additional delay to ensure video element is properly rendered
    const timer = setTimeout(() => {
      console.log('[StandardVideoPlayer] Starting delayed video load after mount');
      loadVideo();
    }, 300); // Increased delay to 300ms
    
    // Cleanup on unmount or file change
    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, [file.uuid, isMounted]);

  const cleanup = () => {
    if (hlsRef.current) {
      console.log('[StandardVideoPlayer] Destroying HLS instance on unmount');
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    // Clean up blob URLs
    const URLClass = getGlobalURL();
    if (URLClass && blobUrls.length > 0) {
      console.log('[StandardVideoPlayer] Cleaning up', blobUrls.length, 'blob URLs');
      blobUrls.forEach(url => {
        try {
          URLClass.revokeObjectURL(url);
        } catch (error) {
          console.warn('[StandardVideoPlayer] Failed to revoke blob URL:', url, error);
        }
      });
      setBlobUrls([]);
    }
    // Clear video source if it's a blob URL
    if (videoSource && videoSource.startsWith('blob:')) {
      const URLClass = getGlobalURL();
      if (URLClass) {
        URLClass.revokeObjectURL(videoSource);
      }
    }
  };

  const loadVideo = async () => {
    console.log('[StandardVideoPlayer] loadVideo START:', {
      fileUuid: file.uuid,
      videoRefExists: !!videoRef,
      videoRefCurrent: !!videoRef.current,
      timestamp: Date.now()
    });
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('[StandardVideoPlayer] Loading video:', file.uuid);
      
      // Check if this is an HLS video
      const metadata = await fileManagerService.loadFileMetadata(file.uuid);
      const isHLS = (metadata as any).isHLS === true;
      
      const BlobClass = getGlobalBlob();
      const URLClass = getGlobalURL();
      
      if (!BlobClass || !URLClass) {
        throw new Error('Web APIs not available');
      }
      
      if (isHLS) {
        // Load HLS video
        setIsHLSVideo(true);
        const hlsData = await fileManagerService.loadEncryptedHLSVideo(file.uuid);
        if (hlsData && hlsData.playlistData) {
          // For HLS videos, we need to handle segment loading differently
          // Create a modified playlist that uses blob URLs for segments
          await setupHLSWithSegmentProxy(hlsData);
        } else {
          throw new Error('HLS manifest not available');
        }
      } else {
        // Load regular video file
        setIsHLSVideo(false);
        const videoFileData = await fileManagerService.loadEncryptedFile(file.uuid);
        const videoBlob = new BlobClass([videoFileData.fileData.buffer], { type: metadata.type });
        const videoUrl = URLClass.createObjectURL(videoBlob);
        
        console.log('[StandardVideoPlayer] Loading standard video:', videoUrl);
        setVideoSource(videoUrl);
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load video';
      console.error('[StandardVideoPlayer] Error loading video:', err);
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const setupHLSPlayback = async (manifestUrl: string) => {
    if (Platform.OS === 'web') {
      await setupWebHLS(manifestUrl);
    } else {
      // For React Native, just set the HLS URL directly
      setVideoSource(manifestUrl);
    }
  };

  const setupHLSWithSegmentProxy = async (hlsData: any) => {
    console.log('[StandardVideoPlayer] Setting up HLS with segment proxy');
    
    const BlobClass = getGlobalBlob();
    const URLClass = getGlobalURL();
    
    if (!BlobClass || !URLClass) {
      throw new Error('Web APIs not available');
    }

    // Create blob URLs for all segments
    const segmentBlobUrls: string[] = [];
    console.log('[StandardVideoPlayer] Creating blob URLs for', hlsData.metadata.segmentCount, 'segments');
    
    for (let i = 0; i < hlsData.metadata.segmentCount; i++) {
      try {
        const segmentData = await hlsData.getSegment(i);
        const segmentBlob = new BlobClass([segmentData.buffer], { type: 'video/mp2t' });
        const segmentUrl = URLClass.createObjectURL(segmentBlob);
        segmentBlobUrls.push(segmentUrl);
        console.log(`[StandardVideoPlayer] Created blob URL for segment ${i}:`, segmentUrl);
      } catch (error) {
        console.error(`[StandardVideoPlayer] Failed to create blob URL for segment ${i}:`, error);
        throw error;
      }
    }

    // Modify the playlist to use blob URLs
    const playlistText = new TextDecoder().decode(hlsData.playlistData);
    console.log('[StandardVideoPlayer] Original playlist:', playlistText);
    
    // Replace segment references with blob URLs
    let modifiedPlaylist = playlistText;
    
    // Find all .ts references and replace them with blob URLs
    const tsPattern = /^([^#].*\.ts)$/gm;
    let segmentIndex = 0;
    
    modifiedPlaylist = modifiedPlaylist.replace(tsPattern, (match, segmentName) => {
      if (segmentIndex < segmentBlobUrls.length) {
        const blobUrl = segmentBlobUrls[segmentIndex];
        console.log(`[StandardVideoPlayer] Replacing ${segmentName} with ${blobUrl}`);
        segmentIndex++;
        return blobUrl;
      }
      return match;
    });

    console.log('[StandardVideoPlayer] Modified playlist:', modifiedPlaylist);

    // Create blob URL for the modified playlist
    const modifiedPlaylistBlob = new BlobClass([new TextEncoder().encode(modifiedPlaylist)], { type: 'application/x-mpegURL' });
    const manifestUrl = URLClass.createObjectURL(modifiedPlaylistBlob);
    
    console.log('[StandardVideoPlayer] Created manifest blob URL:', manifestUrl);
    
    // Store ALL blob URLs for cleanup - but don't set them in state immediately
    // to avoid triggering cleanup during setup
    const allBlobUrls = [...segmentBlobUrls, manifestUrl];
    
    // Set video source first
    setVideoSource(manifestUrl);
    
    // Then store blob URLs for cleanup (this might trigger a re-render, but source is already set)
    setBlobUrls(prev => {
      const newUrls = [...prev, ...allBlobUrls];
      console.log('[StandardVideoPlayer] Stored', newUrls.length, 'blob URLs for cleanup');
      return newUrls;
    });
  };

  const setupWebHLS = async (manifestUrl: string) => {
    console.log('[StandardVideoPlayer] setupWebHLS START:', manifestUrl);
    
    if (!Hls) {
      throw new Error('HLS.js not available for web playback');
    }

    if (!Hls.isSupported()) {
      throw new Error('HLS not supported in this browser');
    }

    console.log('[StandardVideoPlayer] Setting video source for web HLS playback');
    
    // Just set the video source - HLS setup will happen when video element is ready
    setVideoSource(manifestUrl);
    
    console.log('[StandardVideoPlayer] setupWebHLS END - video source set to:', manifestUrl);
  };

  // Setup HLS when video element is available (for web HLS videos)
  const setupHLSWhenReady = async (video: any, manifestUrl: string) => {
    if (!Hls || !video) return;
    
    console.log('[StandardVideoPlayer] Setting up HLS for mounted video element');
    
    // Clean up existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
    }

    // Create new HLS instance
    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      backBufferLength: 90,
    });

    hlsRef.current = hls;

    // Setup HLS event handlers
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('[StandardVideoPlayer] HLS manifest parsed');
      video.play().catch((e: any) => {
        console.warn('[StandardVideoPlayer] Autoplay failed:', e);
      });
    });

    hls.on(Hls.Events.ERROR, (event: any, data: any) => {
      console.error('[StandardVideoPlayer] HLS error:', data);
      if (data.fatal) {
        const errorMsg = `HLS playback error: ${data.type} - ${data.details}`;
        setError(errorMsg);
        onError?.(errorMsg);
      }
    });

    // Load the manifest
    try {
      console.log('[StandardVideoPlayer] Loading HLS source:', manifestUrl);
      hls.loadSource(manifestUrl);
      hls.attachMedia(video);
      console.log('[StandardVideoPlayer] HLS setup complete');
    } catch (error) {
      console.error('[StandardVideoPlayer] HLS setup failed:', error);
      throw error;
    }
  };

  const handleVideoError = (errorEvent: any) => {
    console.error('[StandardVideoPlayer] Video playback error:', errorEvent);
    const errorMsg = 'Video playback failed';
    setError(errorMsg);
    onError?.(errorMsg);
  };

  const renderWebVideo = () => {
    console.log('[StandardVideoPlayer] Rendering web video element:', {
      videoSource: !!videoSource,
      isHLSVideo,
      videoSourceLength: videoSource?.length || 0,
      videoRefExists: !!videoRef,
      timestamp: Date.now()
    });
    
    return (
      <video
        ref={(el) => {
          console.log('[StandardVideoPlayer] Video ref callback called:', {
            element: !!el,
            elementType: typeof el,
            elementTagName: (el as any)?.tagName,
            currentRefValue: !!videoRef.current,
            isHLSVideo,
            timestamp: Date.now()
          });
          
          // Ensure we're setting the ref properly
          if (el) {
            videoRef.current = el;
            console.log('[StandardVideoPlayer] Video ref set successfully:', !!videoRef.current);
            
            // If this is an HLS source, set up HLS.js
            if (isHLSVideo && videoSource) {
              console.log('[StandardVideoPlayer] Setting up HLS for element');
              // Small delay to ensure element is fully ready
              setTimeout(() => {
                setupHLSWhenReady(el, videoSource).catch((error) => {
                  console.error('[StandardVideoPlayer] HLS setup failed:', error);
                  setError(`HLS setup failed: ${error.message}`);
                  onError?.(`HLS setup failed: ${error.message}`);
                });
              }, 100);
            }
          } else {
            videoRef.current = null;
            console.log('[StandardVideoPlayer] Video ref cleared (element is null)');
          }
        }}
        style={styles.video}
        controls
        preload="metadata"
        onError={handleVideoError}
        onLoadStart={() => console.log('[StandardVideoPlayer] Video load started')}
        onLoadedMetadata={() => console.log('[StandardVideoPlayer] Video metadata loaded')}
        onCanPlay={() => console.log('[StandardVideoPlayer] Video can play')}
        onLoadedData={() => console.log('[StandardVideoPlayer] Video data loaded')}
        onCanPlayThrough={() => console.log('[StandardVideoPlayer] Video can play through')}
        src={!isHLSVideo ? videoSource || undefined : undefined}
        crossOrigin="anonymous"
      >
        Your browser does not support the video tag.
      </video>
    );
  };

  const renderNativeVideo = () => {
    if (!Video) {
      return (
        <View style={[styles.errorContainer, { backgroundColor: theme.surface }]}>
          <Text style={[styles.errorText, { color: theme.error }]}>
            Video player not available
          </Text>
        </View>
      );
    }

    return (
      <Video
        source={{ uri: videoSource }}
        style={styles.video}
        controls={true}
        resizeMode="contain"
        onError={handleVideoError}
        onLoad={() => console.log('[StandardVideoPlayer] Video loaded')}
        // Basic buffer configuration
        bufferConfig={{
          minBufferMs: 15000,
          maxBufferMs: 50000,
          bufferForPlaybackMs: 2500,
          bufferForPlaybackAfterRebufferMs: 5000,
        }}
      />
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: theme.surface }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Loading video...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: theme.surface }]}>
        <Text style={[styles.errorText, { color: theme.error }]}>
          {error}
        </Text>
      </View>
    );
  }

  if (!videoSource) {
    return (
      <View style={[styles.container, styles.centerContent, { backgroundColor: theme.surface }]}>
        <Text style={[styles.errorText, { color: theme.error }]}>
          No video source available
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      {Platform.OS === 'web' ? renderWebVideo() : renderNativeVideo()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default StandardVideoPlayer;
