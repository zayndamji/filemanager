import React, { useState, useEffect, useContext, useRef } from 'react';
import { Platform, View, Text, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';
import { FileManagerService } from '../../utils/FileManagerService';
import { ThemeContext } from '../../theme';
import { usePasswordContext } from '../../context/PasswordContext';
import { useFileManagerService } from '../../hooks/useFileManagerService';

const { width, height } = Dimensions.get('window');

// Conditionally import Video for native platforms only
let Video: any = null;
if (Platform.OS !== 'web') {
  Video = require('react-native-video').default || require('react-native-video');
}

export interface VideoFileProps {
  fileData?: Uint8Array; // Optional - for backward compatibility
  mimeType: string;
  fileName?: string;
  uuid?: string; // Optional - for direct decryption
  totalSize?: number; // Optional - for progress display
  onClose?: () => void; // Optional - called when video is closed/deleted
}

const VideoFileNative: React.FC<VideoFileProps> = ({ 
  fileData, 
  mimeType, 
  fileName = 'video.mp4',
  uuid,
  totalSize = 0,
  onClose
}) => {
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [tempFilePath, setTempFilePath] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { theme } = useContext(ThemeContext);
  const { derivedKey } = usePasswordContext();
  const fileManagerService = useFileManagerService();

  useEffect(() => {
    console.log('[VideoFile] useEffect triggered', { 
      hasFileData: !!(fileData && fileData.length > 0), 
      hasUuid: !!uuid, 
      tempFilePath: tempFilePath 
    });
    
    // Only initialize if we don't already have a video URI and we have data to work with
    if (!videoUri && !loading && ((fileData && fileData.length > 0) || (uuid && derivedKey))) {
      initializeVideo();
    }
    
    return () => {
      cleanup();
    };
    // eslint-disable-next-line
  }, [fileData, uuid, derivedKey]);

  // Clean up when component unmounts or onClose is called
  useEffect(() => {
    return () => {
      if (onClose && tempFilePath) {
        // Cleanup will be handled by the cleanup() function
        cleanup();
      }
    };
  }, [onClose, tempFilePath]);

  const initializeVideo = async () => {
    try {
      console.log('[VideoFile] Initializing video for playback using temp file approach');
      
      // Create abort controller for this operation
      abortControllerRef.current = new AbortController();
      
      // Cleanup any existing temp file first
      if (tempFilePath) {
        console.log('[VideoFile] Cleaning up existing temp file before creating new one:', tempFilePath);
        await cleanup();
      }
      
      let videoData: Uint8Array;
      
      // Determine if we need to decrypt the file or use provided data
      if (fileData && fileData.length > 0) {
        // Use provided file data (backward compatibility)
        console.log('[VideoFile] Using provided file data');
        videoData = fileData;
      } else if (uuid && derivedKey) {
        // Check if this is a chunked video first
        console.log('[VideoFile] Loading video file metadata:', uuid);
        setLoading(true);
        setError(null);
        setLoadingProgress(null);
        
        try {
          const metadata = await fileManagerService.loadFileMetadata(uuid);
          const chunkedMetadata = metadata as any;
          
          if (chunkedMetadata.isChunked && chunkedMetadata.version === '2.0') {
            // This is a chunked video - use chunked loading with progress
            console.log('[VideoFile] Detected chunked video, loading chunks:', uuid);
            setLoadingProgress({ current: 0, total: chunkedMetadata.totalChunks });
            
            const result = await fileManagerService.loadEncryptedVideoChunked(
              uuid, 
              abortControllerRef.current?.signal, // Pass abort signal
              (chunkIndex, totalChunks) => {
                console.log(`[VideoFile] Loading chunk ${chunkIndex}/${totalChunks}`);
                setLoadingProgress({ current: chunkIndex, total: totalChunks });
              }
            );
            
            if (result.fileData) {
              videoData = result.fileData;
              console.log('[VideoFile] Chunked video loaded successfully');
            } else {
              throw new Error('Failed to load chunked video data');
            }
          } else {
            // Legacy single-file video
            console.log('[VideoFile] Loading legacy single-file video:', uuid);
            const result = await fileManagerService.loadEncryptedFile(
              uuid, 
              abortControllerRef.current?.signal
            );
            videoData = result.fileData;
            console.log('[VideoFile] Legacy video file decrypted successfully');
          }
        } catch (metadataError) {
          if (abortControllerRef.current?.signal.aborted) {
            console.log('[VideoFile] Video loading was cancelled');
            return;
          }
          console.warn('[VideoFile] Could not load metadata, trying legacy loading:', metadataError);
          // Fallback to legacy loading if metadata fails
          const result = await fileManagerService.loadEncryptedFile(
            uuid, 
            abortControllerRef.current?.signal
          );
          videoData = result.fileData;
          console.log('[VideoFile] Fallback video file decrypted successfully');
        }
      } else {
        throw new Error('No file data provided and no UUID/key available for decryption');
      }
      
      // Check if operation was cancelled
      if (abortControllerRef.current?.signal.aborted) {
        console.log('[VideoFile] Video initialization was cancelled');
        return;
      }
      
      // Always use temp file approach for better compatibility
      const tempPath = await FileManagerService.createTempFile(videoData, fileName);
      setTempFilePath(tempPath);
      setVideoUri(`file://${tempPath}`);
      console.log('[VideoFile] Temp file created for video:', tempPath);
    } catch (error) {
      if (abortControllerRef.current?.signal.aborted) {
        console.log('[VideoFile] Video initialization was cancelled');
        return;
      }
      console.error('[VideoFile] Error initializing video:', error);
      setError('Failed to initialize video for playback');
    } finally {
      setLoading(false);
      setLoadingProgress(null);
      abortControllerRef.current = null;
    }
  };

  const cleanup = async () => {
    // Cancel any ongoing operations
    if (abortControllerRef.current) {
      console.log('[VideoFile] Aborting ongoing video loading operation');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Clean up temp file
    if (tempFilePath) {
      try {
        await FileManagerService.deleteTempFile(tempFilePath);
        console.log('[VideoFile] Cleaned up temp file:', tempFilePath);
        setTempFilePath('');
      } catch (cleanupError) {
        console.warn('[VideoFile] Failed to cleanup temp file:', cleanupError);
      }
    }
    
    // Reset state
    setVideoUri(null);
    setLoading(false);
    setLoadingProgress(null);
    setError(null);
  };
  
  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.text }]}>
            {loadingProgress 
              ? `Decrypting video chunks... (${loadingProgress.current}/${loadingProgress.total})`
              : 'Decrypting video...'
            }
          </Text>
          {loadingProgress && (
            <View style={styles.progressContainer}>
              <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      backgroundColor: theme.accent,
                      width: `${(loadingProgress.current / loadingProgress.total) * 100}%`
                    }
                  ]} 
                />
              </View>
              <Text style={[styles.progressText, { color: theme.textSecondary }]}>
                {((loadingProgress.current / loadingProgress.total) * 100).toFixed(0)}%
              </Text>
            </View>
          )}
          {totalSize > 0 && (
            <Text style={[styles.progressText, { color: theme.textSecondary }]}>
              Size: {(totalSize / (1024 * 1024)).toFixed(1)} MB
            </Text>
          )}
        </View>
      ) : error ? (
        <View style={[styles.errorContainer, { backgroundColor: theme.surface }]}>
          <Text style={[styles.errorText, { color: theme.error }]}>⚠️ Video playback failed</Text>
          <Text style={[styles.errorSubtext, { color: theme.textSecondary }]}>Format may not be supported</Text>
        </View>
      ) : videoUri ? (
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
            console.log('[VideoFile] Video loaded successfully');
          }}
          onError={(error: any) => {
            console.error('[VideoFile] Video playback error:', error);
            setError('Video playback failed - format may not be supported');
          }}
          onLoadStart={() => {
            console.log('[VideoFile] Video load started');
          }}
          onFullscreenPlayerWillPresent={() => {
            console.warn('[VideoFile] Fullscreen not supported - preventing crash');
            return false;
          }}
          onFullscreenPlayerDidPresent={() => {
            console.warn('[VideoFile] Fullscreen presented but should be disabled');
          }}
        />
      ) : (
        <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading video...</Text>
      )}
    </View>
  );
};

const VideoFileWeb: React.FC<VideoFileProps> = ({ 
  fileData, 
  mimeType, 
  fileName = 'video.mp4',
  uuid,
  totalSize = 0,
  onClose
}) => {
  const { theme } = useContext(ThemeContext);
  const { derivedKey } = usePasswordContext();
  const fileManagerService = useFileManagerService();
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<{ current: number; total: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    console.log('[VideoFileWeb] useEffect triggered', { 
      hasFileData: !!(fileData && fileData.length > 0), 
      hasUuid: !!uuid, 
      hasVideoUri: !!videoUri 
    });
    
    // Only initialize if we don't already have a video URI and we have data to work with
    if (!videoUri && !loading && ((fileData && fileData.length > 0) || (uuid && derivedKey))) {
      const initializeVideo = async () => {
        try {
          // Create abort controller for this operation
          abortControllerRef.current = new AbortController();
          
          // Cleanup any existing video URI first
          if (videoUri) {
            console.log('[VideoFileWeb] Cleaning up existing video URI');
            (globalThis as any).URL.revokeObjectURL(videoUri);
            setVideoUri(null);
          }
          
          let videoData: Uint8Array;
          
          // Determine if we need to decrypt the file or use provided data
          if (fileData && fileData.length > 0) {
            // Use provided file data (backward compatibility)
            console.log('[VideoFileWeb] Using provided file data');
            videoData = fileData;
          } else if (uuid && derivedKey) {
            // Check if this is a chunked video first
            console.log('[VideoFileWeb] Loading video file metadata:', uuid);
            setLoading(true);
            setError(null);
            setLoadingProgress(null);
            
            try {
              const metadata = await fileManagerService.loadFileMetadata(uuid);
              const chunkedMetadata = metadata as any;
              
              if (chunkedMetadata.isChunked && chunkedMetadata.version === '2.0') {
                // This is a chunked video - use chunked loading with progress
                console.log('[VideoFileWeb] Detected chunked video, loading chunks:', uuid);
                setLoadingProgress({ current: 0, total: chunkedMetadata.totalChunks });
                
                const result = await fileManagerService.loadEncryptedVideoChunked(
                  uuid, 
                  abortControllerRef.current?.signal, // Pass abort signal
                  (chunkIndex, totalChunks) => {
                    console.log(`[VideoFileWeb] Loading chunk ${chunkIndex}/${totalChunks}`);
                    setLoadingProgress({ current: chunkIndex, total: totalChunks });
                  }
                );
                
                if (result.fileData) {
                  videoData = result.fileData;
                  console.log('[VideoFileWeb] Chunked video loaded successfully');
                } else {
                  throw new Error('Failed to load chunked video data');
                }
              } else {
                // Legacy single-file video
                console.log('[VideoFileWeb] Loading legacy single-file video:', uuid);
                const result = await fileManagerService.loadEncryptedFile(
                  uuid, 
                  abortControllerRef.current?.signal
                );
                videoData = result.fileData;
                console.log('[VideoFileWeb] Legacy video file decrypted successfully');
              }
            } catch (metadataError) {
              if (abortControllerRef.current?.signal.aborted) {
                console.log('[VideoFileWeb] Video loading was cancelled');
                return;
              }
              console.warn('[VideoFileWeb] Could not load metadata, trying legacy loading:', metadataError);
              // Fallback to legacy loading if metadata fails
              const result = await fileManagerService.loadEncryptedFile(
                uuid, 
                abortControllerRef.current?.signal
              );
              videoData = result.fileData;
              console.log('[VideoFileWeb] Fallback video file decrypted successfully');
            }
          } else {
            throw new Error('No file data provided and no UUID/key available for decryption');
          }
          
          // Check if operation was cancelled
          if (abortControllerRef.current?.signal.aborted) {
            console.log('[VideoFileWeb] Video initialization was cancelled');
            return;
          }
          
          // For web, create blob URL instead of data URI for better performance
          try {
            const blob = new (globalThis as any).Blob([videoData], { type: mimeType });
            const url = (globalThis as any).URL.createObjectURL(blob);
            setVideoUri(url);
            
            // Cleanup function will be handled by useEffect cleanup
          } catch (blobError) {
            console.warn('[VideoFileWeb] Failed to create blob, loading may be slow:', blobError);
            setVideoUri(null);
          }
        } catch (error) {
          if (abortControllerRef.current?.signal.aborted) {
            console.log('[VideoFileWeb] Video initialization was cancelled');
            return;
          }
          console.error('[VideoFileWeb] Error initializing video:', error);
          setError('Failed to initialize video for playback');
        } finally {
          setLoading(false);
          setLoadingProgress(null);
          abortControllerRef.current = null;
        }
      };

      initializeVideo();
    }
    
    // Cleanup function
    return () => {
      // Cancel any ongoing operations
      if (abortControllerRef.current) {
        console.log('[VideoFileWeb] Aborting ongoing video loading operation');
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      
      if (videoUri) {
        (globalThis as any).URL.revokeObjectURL(videoUri);
      }
    };
  }, [fileData, uuid, mimeType, derivedKey]);

  // Clean up when component unmounts or onClose is called
  useEffect(() => {
    return () => {
      if (onClose && videoUri) {
        // Cleanup will be handled by the cleanup function above
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      }
    };
  }, [onClose, videoUri]);

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
      {loading ? (
        <>
          <div style={{ color: theme.text, marginBottom: 8 }}>
            {loadingProgress 
              ? `Decrypting video chunks... (${loadingProgress.current}/${loadingProgress.total})`
              : 'Decrypting video...'
            }
          </div>
          {loadingProgress && (
            <div style={{ width: '80%', marginBottom: 8 }}>
              <div style={{ 
                width: '100%', 
                height: 6, 
                backgroundColor: theme.border, 
                borderRadius: 3, 
                overflow: 'hidden',
                marginBottom: 4
              }}>
                <div 
                  style={{ 
                    height: '100%', 
                    backgroundColor: theme.accent,
                    width: `${(loadingProgress.current / loadingProgress.total) * 100}%`,
                    borderRadius: 3
                  }} 
                />
              </div>
              <div style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center' }}>
                {((loadingProgress.current / loadingProgress.total) * 100).toFixed(0)}%
              </div>
            </div>
          )}
          {totalSize > 0 && (
            <div style={{ color: theme.textSecondary, fontSize: 12 }}>
              Size: {(totalSize / (1024 * 1024)).toFixed(1)} MB
            </div>
          )}
        </>
      ) : error ? (
        <>
          <div style={{ color: theme.error, marginBottom: 8 }}>⚠️ Video playback failed</div>
          <div style={{ color: theme.textSecondary, fontSize: 12 }}>Format may not be supported</div>
        </>
      ) : videoUri ? (
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
        />
      ) : (
        <div style={{ color: theme.textSecondary }}>Loading video...</div>
      )}
    </div>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    minHeight: height * 0.65, // Match ImageFile container height
  },
  video: {
    width: '100%',
    maxWidth: width * 0.9, // Match ImageFile sizing
    height: height * 0.7, // Match ImageFile height (70% of screen height)
    maxHeight: height * 0.7,
    backgroundColor: '#000',
    borderRadius: 8,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fed7d7',
  },
  errorText: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  errorSubtext: {
    fontSize: 12,
    textAlign: 'center',
  },
  loadingText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  progressText: {
    fontSize: 12,
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  progressBar: {
    width: '80%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
});

const VideoFile: React.FC<VideoFileProps> = (props) => {
  if (Platform.OS === 'web') return <VideoFileWeb {...props} />;
  return <VideoFileNative {...props} />;
};

export default VideoFile;