import React, { useState, useRef, useEffect, useContext } from 'react';
import { Platform, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { VideoStreamingService } from '../../utils/VideoStreamingService';
import { usePasswordContext } from '../../context/PasswordContext';
import { FileManagerService } from '../../utils/FileManagerService';
import { ThemeContext } from '../../theme';

// Conditionally import Video for native platforms only
let Video: any = null;
if (Platform.OS !== 'web') {
  try {
    Video = require('react-native-video').default || require('react-native-video');
  } catch (e) {
    console.warn('[StreamingVideoFile] Failed to load react-native-video:', e);
  }
}

export interface StreamingVideoFileProps {
  uuid: string;
  mimeType: string;
  fileName?: string;
  totalSize?: number;
  fileData?: Uint8Array; // Optional pre-decrypted file data to avoid double decryption
  onLoadStart?: () => void;
  onLoadComplete?: () => void;
  onError?: (error: string) => void;
}

const StreamingVideoFileNative: React.FC<StreamingVideoFileProps> = ({ 
  uuid, 
  mimeType, 
  fileName = 'video.mp4',
  totalSize = 0,
  fileData, // Pre-decrypted data
  onLoadStart,
  onLoadComplete,
  onError
}) => {
  const { derivedKey } = usePasswordContext();
  const { theme } = useContext(ThemeContext);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [cacheStats, setCacheStats] = useState({ cachedChunks: 0, memorySizeKB: 0, fullFilesCached: 0 });
  const [tempFilePath, setTempFilePath] = useState<string>('');
  const abortControllerRef = useRef<AbortController | null>(null);
  
  useEffect(() => {
    const loadVideo = async () => {
      if (!derivedKey) {
        setError('No encryption key available');
        return;
      }

      setLoading(true);
      setError(null);
      onLoadStart?.();

      // Cancel any existing loading
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        console.log('[StreamingVideoFile] Starting streaming video load for web:', uuid);
        
        // Check if the video is already cached
        const cacheStats = VideoStreamingService.getCacheStats();
        if (cacheStats.fullFilesCached > 0 || fileData) {
          console.log('[StreamingVideoFile] Video already available - fast loading');
        }
        
        // Get the video data (either from passed fileData or load it)
        let videoData: Uint8Array;
        if (fileData && fileData.length > 0) {
          console.log('[StreamingVideoFile] Using provided file data');
          videoData = fileData;
          setLoadingProgress(100);
        } else {
          console.log('[StreamingVideoFile] Loading video data via streaming service');
          // Use complete video blob loading with progress reporting
          const videoBlob = await VideoStreamingService.createProgressiveVideoBlob(
            uuid,
            derivedKey,
            (loaded, total) => {
              const progress = Math.round((loaded / total) * 100);
              setLoadingProgress(progress);
              console.log(`[StreamingVideoFile] Native loading progress: ${progress}%`);
            },
            abortController.signal
          );

          if (abortController.signal.aborted) {
            return;
          }

          if (!videoBlob) {
            throw new Error('Failed to load video data');
          }

          // Convert blob to Uint8Array if needed
          if (videoBlob.startsWith('data:')) {
            // Data URI - extract base64 and convert
            const base64Data = videoBlob.split(',')[1];
            const binaryString = atob(base64Data);
            videoData = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              videoData[i] = binaryString.charCodeAt(i);
            }
          } else {
            throw new Error('Unexpected video blob format for native platform');
          }
        }

        // Always use temp file approach for better compatibility
        console.log('[StreamingVideoFile] Creating temp file for video playback');
        const tempPath = await FileManagerService.createTempFile(videoData, fileName);
        setTempFilePath(tempPath);
        setVideoUri(`file://${tempPath}`);
        console.log('[StreamingVideoFile] Temp file created for video:', tempPath);

        if (abortController.signal.aborted) {
          return;
        }

        // Update cache stats
        const stats = VideoStreamingService.getCacheStats();
        setCacheStats(stats);
        
        onLoadComplete?.();
      } catch (error) {
        console.error('[StreamingVideoFile] Video loading error:', error);
        if (!abortController.signal.aborted) {
          setError(error instanceof Error ? error.message : 'Failed to load video');
          onError?.(error instanceof Error ? error.message : 'Failed to load video');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadVideo();

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      cleanupTempFile();
    };
  }, [uuid, derivedKey, fileData, onLoadStart, onLoadComplete, onError]);

  const cleanupTempFile = async () => {
    if (tempFilePath) {
      try {
        await FileManagerService.deleteTempFile(tempFilePath);
        console.log('[StreamingVideoFile] Cleaned up temp file:', tempFilePath);
        setTempFilePath('');
      } catch (cleanupError) {
        console.warn('[StreamingVideoFile] Failed to cleanup temp file:', cleanupError);
      }
    }
  };

  // Update cache stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = VideoStreamingService.getCacheStats();
      setCacheStats(stats);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            {cacheStats.fullFilesCached > 0 ? 'Loading cached video...' : 'Decrypting video...'}
          </Text>
          {loadingProgress > 0 && (
            <Text style={[styles.progressText, { color: theme.textSecondary }]}>{loadingProgress}% loaded</Text>
          )}
          {cacheStats.cachedChunks > 0 && (
            <Text style={[styles.cacheText, { color: theme.textSecondary }]}>
              {cacheStats.fullFilesCached > 0 ? '🎥 Full video cached' : '⚡ Streaming mode'} ({cacheStats.memorySizeKB} KB)
            </Text>
          )}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface }]}>
        <View style={[styles.errorContainer, { backgroundColor: theme.surface }]}>
          <Text style={[styles.errorText, { color: theme.error }]}>⚠️ {error}</Text>
          <Text style={[styles.errorSubtext, { color: theme.textSecondary }]}>
            Large videos may take time to decrypt. Please wait or try again.
          </Text>
        </View>
      </View>
    );
  }

  if (!Video) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface }]}>
        <Text style={[styles.errorText, { color: theme.error }]}>Video player not available on this platform</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      {videoUri ? (
        <View style={styles.videoContainer}>
          <Video
            source={{ uri: videoUri }}
            style={styles.video}
            controls
            resizeMode="contain"
            paused={false}
            fullscreen={false}
            allowsExternalPlayback={false}
            playWhenInactive={false}
            playInBackground={false}
            onLoad={() => {
              console.log('[StreamingVideoFile] Video loaded successfully');
              setLoadingProgress(100);
            }}
            onError={(error: any) => {
              console.error('[StreamingVideoFile] Video playback error:', error);
              setError('Video playback failed');
            }}
            onFullscreenPlayerWillPresent={() => {
              console.warn('[StreamingVideoFile] Fullscreen not supported - preventing crash');
              return false;
            }}
            onFullscreenPlayerDidPresent={() => {
              console.warn('[StreamingVideoFile] Fullscreen presented but should be disabled');
            }}
          />
          
          {cacheStats.cachedChunks > 0 && (
            <View style={styles.statsContainer}>
              <Text style={[styles.statsText, { color: theme.textSecondary }]}>
                📦 {cacheStats.cachedChunks} chunks • 💾 {cacheStats.memorySizeKB} KB cached
              </Text>
            </View>
          )}
        </View>
      ) : (
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Video preview is not available.</Text>
      )}
    </View>
  );
};

const StreamingVideoFileWeb: React.FC<StreamingVideoFileProps> = ({ 
  uuid, 
  mimeType, 
  fileName = 'video.mp4',
  totalSize = 0,
  fileData, // Pre-decrypted data
  onLoadStart,
  onLoadComplete,
  onError
}) => {
  const { derivedKey } = usePasswordContext();
  const { theme } = useContext(ThemeContext);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [cacheStats, setCacheStats] = useState({ cachedChunks: 0, memorySizeKB: 0, fullFilesCached: 0 });
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const loadVideo = async () => {
      if (!derivedKey) {
        setError('No encryption key available');
        return;
      }

      setLoading(true);
      setError(null);
      onLoadStart?.();

      // Cancel any existing loading
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        console.log('[StreamingVideoFile] Starting streaming video load for web:', uuid);
        
        // Check if the video is already cached
        const cacheStats = VideoStreamingService.getCacheStats();
        if (cacheStats.fullFilesCached > 0) {
          console.log('[StreamingVideoFile] Video already cached - fast loading');
        }
        
        // Use complete video blob loading with progress reporting
        const videoBlob = await VideoStreamingService.createProgressiveVideoBlob(
          uuid,
          derivedKey,
          (loaded, total) => {
            const progress = Math.round((loaded / total) * 100);
            setLoadingProgress(progress);
            console.log(`[StreamingVideoFile] Web loading progress: ${progress}%`);
          },
          abortController.signal
        );

        if (abortController.signal.aborted) {
          return;
        }

        if (videoBlob) {
          console.log('[StreamingVideoFile] Web video blob ready for playback');
          setVideoUri(videoBlob);
          setLoadingProgress(100);
          
          const stats = VideoStreamingService.getCacheStats();
          setCacheStats(stats);
        } else {
          setError('Failed to prepare video for playback');
        }
        
        onLoadComplete?.();
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        
        const errorMessage = error instanceof Error ? error.message : 'Failed to load video';
        setError(errorMessage);
        onError?.(errorMessage);
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
        abortControllerRef.current = null;
      }
    };

    loadVideo();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [uuid, derivedKey, fileData, onLoadStart, onLoadComplete, onError]);

  // Update cache stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      const stats = VideoStreamingService.getCacheStats();
      setCacheStats(stats);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div style={{ 
        padding: 16, 
        backgroundColor: theme.surface, 
        borderRadius: 12, 
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 240
      }}>
        <div style={{ color: theme.text, marginBottom: 8 }}>
          {cacheStats.fullFilesCached > 0 ? '⏳ Loading cached video...' : '🔓 Decrypting video...'}
        </div>
        {loadingProgress > 0 && (
          <div style={{ color: theme.textSecondary, marginBottom: 4 }}>{loadingProgress}% loaded</div>
        )}
        {cacheStats.cachedChunks > 0 && (
          <div style={{ color: theme.textSecondary, fontSize: 12 }}>
            {cacheStats.fullFilesCached > 0 ? '🎥 Full video cached' : '⚡ Streaming mode'} ({cacheStats.memorySizeKB} KB)
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: 16, 
        backgroundColor: theme.surface, 
        borderRadius: 12, 
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 240
      }}>
        <div style={{ color: theme.error, marginBottom: 8 }}>⚠️ {error}</div>
        <div style={{ color: theme.textSecondary, fontSize: 14 }}>
          Large videos may take time to decrypt. Please wait or try again.
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: 16, 
      backgroundColor: theme.surface, 
      borderRadius: 12, 
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 240
    }}>
      {videoUri ? (
        <>
          <video 
            src={videoUri} 
            controls 
            style={{ 
              width: '100%', 
              maxWidth: '100%', 
              height: 'auto',
              maxHeight: 400,
              borderRadius: 8, 
              backgroundColor: '#000' 
            }}
            onLoadStart={() => console.log('[StreamingVideoFile] Web video load started')}
            onCanPlay={() => {
              console.log('[StreamingVideoFile] Web video can play');
              setLoadingProgress(100);
            }}
            onError={(e) => {
              console.error('[StreamingVideoFile] Web video error:', e);
              setError('Video playback failed');
            }}
          />
          
          {cacheStats.cachedChunks > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
              📦 {cacheStats.cachedChunks} chunks • 💾 {cacheStats.memorySizeKB} KB cached
            </div>
          )}
        </>
      ) : (
        <div style={{ color: '#999', marginTop: 16 }}>Video preview is not available.</div>
      )}
    </div>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center',
  },
  videoContainer: {
    width: '100%',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: 240,
    backgroundColor: '#000',
    borderRadius: 12,
    marginTop: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  loadingText: {
    fontSize: 14,
    color: '#007AFF',
    marginTop: 12,
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  cacheText: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  errorContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#ff6b6b',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  noteText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
  },
  statsContainer: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    borderRadius: 8,
  },
  statsText: {
    fontSize: 11,
    color: '#007AFF',
    textAlign: 'center',
  },
});

const StreamingVideoFile: React.FC<StreamingVideoFileProps> = (props) => {
  if (Platform.OS === 'web') return <StreamingVideoFileWeb {...props} />;
  return <StreamingVideoFileNative {...props} />;
};

export default StreamingVideoFile;
