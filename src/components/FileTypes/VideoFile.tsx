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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isProgressiveLoading, setIsProgressiveLoading] = useState(false);
  const [backgroundLoading, setBackgroundLoading] = useState(false);
  const videoRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressMonitorRef = useRef<NodeJS.Timeout | null>(null);
  const currentProgressRef = useRef<number>(0);
  const totalChunksRef = useRef<number>(0);
  const savedTimeRef = useRef<number>(0);
  const lastRefreshTimeRef = useRef<number>(0);
  const lastValidSeekTime = useRef<number>(0);
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
      
      // Determine if we need to decrypt the file or use provided data
      let videoData: Uint8Array;
      
      if (fileData && fileData.length > 0) {
        // Use provided file data (backward compatibility)
        console.log('[VideoFile] Using provided file data');
        videoData = fileData;
        
        // Check if operation was cancelled
        if (abortControllerRef.current?.signal.aborted) {
          console.log('[VideoFile] Video initialization was cancelled');
          return;
        }
        
        // Always use temp file approach for better compatibility
        const tempPath = await FileManagerService.createTempFile(videoData, fileName);
        setTempFilePath(tempPath);
        setVideoUri(`file://${tempPath}?t=${Date.now()}`);
        console.log('[VideoFile] Temp file created for video:', tempPath);
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
            // This is a chunked video - determine loading strategy based on file size
            const fileSizeMB = chunkedMetadata.originalSize / (1024 * 1024);
            const useProgressiveLoading = fileSizeMB > 50; // Use progressive for files larger than 50MB
            
            console.log('[VideoFile] Detected chunked video:', { 
              uuid, 
              sizeMB: fileSizeMB.toFixed(2), 
              useProgressiveLoading,
              totalChunks: chunkedMetadata.totalChunks 
            });
            
            setLoadingProgress({ current: 0, total: chunkedMetadata.totalChunks });
            
            if (useProgressiveLoading) {
              // For large files, load first 10% to start playback quickly
              const initialChunksCount = Math.max(8, Math.ceil(chunkedMetadata.totalChunks * 0.1));
              
              console.log('[VideoFile] Using progressive loading with', initialChunksCount, 'initial chunks');
              setIsProgressiveLoading(true);
              
              try {
                const result = await fileManagerService.loadEncryptedVideoProgressive(
                  uuid, 
                  abortControllerRef.current?.signal,
                  (chunkIndex: number, totalChunks: number) => {
                    console.log(`[VideoFile] Progressive loading chunk ${chunkIndex}/${totalChunks}`);
                    setLoadingProgress({ current: chunkIndex, total: totalChunks });
                    currentProgressRef.current = chunkIndex;
                    totalChunksRef.current = totalChunks;
                  },
                  initialChunksCount
                );
                
                if (result.tempFilePath) {
                  setTempFilePath(result.tempFilePath);
                  setVideoUri(`file://${result.tempFilePath}?t=${Date.now()}`);
                  console.log('[VideoFile] Progressive video started - initial chunks loaded');
                  
                  // Continue background loading
                  setBackgroundLoading(true);
                  
                  // Set up periodic progress monitoring
                  currentProgressRef.current = initialChunksCount;
                  totalChunksRef.current = result.totalChunks;
                  let lastProgressUpdate = initialChunksCount;
                  
                  progressMonitorRef.current = setInterval(() => {
                    const currentProgress = currentProgressRef.current;
                    if (currentProgress > lastProgressUpdate + 8) {
                      // Significant progress made (8+ more chunks), update video source smoothly
                      console.log(`[VideoFile] Significant progress detected: ${currentProgress}/${totalChunksRef.current}, updating video source`);
                      lastProgressUpdate = currentProgress;
                      
                      // Update video source without black flash
                      updateVideoSource(result.tempFilePath, true);
                    }
                  }, 3000); // Check every 3 seconds, less frequent for better performance
                  
                  result.backgroundLoadingPromise.then(() => {
                    console.log('[VideoFile] Background loading completed');
                    if (progressMonitorRef.current) {
                      clearInterval(progressMonitorRef.current);
                      progressMonitorRef.current = null;
                    }
                    setLoadingProgress({ current: result.totalChunks, total: result.totalChunks });
                    setBackgroundLoading(false);
                    // Final update when complete - preserve time
                    updateVideoSource(result.tempFilePath, true);
                  }).catch((bgError: any) => {
                    if (progressMonitorRef.current) {
                      clearInterval(progressMonitorRef.current);
                      progressMonitorRef.current = null;
                    }
                    if (!abortControllerRef.current?.signal.aborted) {
                      console.warn('[VideoFile] Background loading failed:', bgError);
                      setBackgroundLoading(false);
                    }
                  });
                  
                  return; // Early return
                } else {
                  throw new Error('Failed to load progressive video data');
                }
              } catch (progressiveError) {
                console.warn('[VideoFile] Progressive loading failed, falling back to regular chunked loading:', progressiveError);
                setIsProgressiveLoading(false);
                // Fall through to regular chunked loading
              }
            }
            
            // Use optimized chunked loading (either as fallback or for smaller files)
            const result = await fileManagerService.loadEncryptedVideoChunked(
              uuid, 
              abortControllerRef.current?.signal,
              (chunkIndex: number, totalChunks: number) => {
                console.log(`[VideoFile] Loading chunk ${chunkIndex}/${totalChunks}`);
                setLoadingProgress({ current: chunkIndex, total: totalChunks });
                currentProgressRef.current = chunkIndex;
                totalChunksRef.current = totalChunks;
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
        
        // Check if operation was cancelled
        if (abortControllerRef.current?.signal.aborted) {
          console.log('[VideoFile] Video initialization was cancelled');
          return;
        }
        
        // Always use temp file approach for better compatibility
        const tempPath = await FileManagerService.createTempFile(videoData, fileName);
        setTempFilePath(tempPath);
        setVideoUri(`file://${tempPath}?t=${Date.now()}`);
        console.log('[VideoFile] Temp file created for video:', tempPath);
      } else {
        throw new Error('No file data provided and no UUID/key available for decryption');
      }
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
    
    // Clear progress monitor interval
    if (progressMonitorRef.current) {
      clearInterval(progressMonitorRef.current);
      progressMonitorRef.current = null;
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
    setIsProgressiveLoading(false);
    setBackgroundLoading(false);
    setCurrentTime(0);
    setDuration(0);
  };

  // Function to smoothly update video source without black flash
  const updateVideoSource = (newTempFilePath: string, preserveTime: boolean = true) => {
    // Save current playback time if requested - use the most recent currentTime value
    if (preserveTime) {
      savedTimeRef.current = currentTime; // Use the state value which is updated in onProgress
      console.log(`[VideoFile] Saving current playback time: ${savedTimeRef.current}s`);
    }
    
    // Debounce rapid updates (prevent updates more than once every 3 seconds)
    const now = Date.now();
    if (now - lastRefreshTimeRef.current < 3000) {
      console.log('[VideoFile] Skipping video source update due to debouncing');
      return;
    }
    lastRefreshTimeRef.current = now;
    
    // Update video source with timestamp to force reload
    const newUri = `file://${newTempFilePath}?t=${now}`;
    console.log(`[VideoFile] Updating video source to: ${newUri}`);
    setVideoUri(newUri);
  };

  // Function to restore playback position after source update
  const restorePlaybackPosition = () => {
    if (savedTimeRef.current > 0 && videoRef.current) {
      console.log(`[VideoFile] Restoring playback position to: ${savedTimeRef.current}s`);
      
      // For progressive loading, ensure we don't seek beyond loaded content
      const targetTime = savedTimeRef.current;
      const playableDuration = getPlayableDuration();
      
      if (isProgressiveLoading && targetTime > playableDuration) {
        console.log(`[VideoFile] Adjusting restore time from ${targetTime}s to ${playableDuration - 0.5}s (within loaded content)`);
        const adjustedTime = Math.max(0, playableDuration - 0.5);
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.seek(adjustedTime);
            lastValidSeekTime.current = adjustedTime;
            savedTimeRef.current = 0; // Reset saved time
          }
        }, 300);
      } else {
        // Normal restoration
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.seek(targetTime);
            lastValidSeekTime.current = targetTime;
            savedTimeRef.current = 0; // Reset saved time
          }
        }, 300);
      }
    }
  };

  // Calculate how much of the video is actually loaded
  const getLoadedPercentage = () => {
    if (!isProgressiveLoading || !loadingProgress) return 100;
    return (loadingProgress.current / loadingProgress.total) * 100;
  };

  // Calculate how much of the video timeline corresponds to loaded chunks
  const getLoadedDuration = () => {
    if (!isProgressiveLoading || !loadingProgress || !duration) return duration;
    
    // For progressive loading, we're updating the temp file, so the loaded duration
    // should be based on the actual progress, not just the initial chunks
    const actualLoadedPercentage = (loadingProgress.current / loadingProgress.total);
    return actualLoadedPercentage * duration;
  };

  // Get the exact playable duration with safety buffer
  const getPlayableDuration = () => {
    if (!isProgressiveLoading || !backgroundLoading) return duration;
    
    const loadedDuration = getLoadedDuration();
    // Use a more aggressive 3-second safety buffer to prevent lag
    const buffer = Math.min(3, loadedDuration * 0.1); // 3 seconds or 10% of loaded content, whichever is smaller
    return Math.max(0, loadedDuration - buffer);
  };

  // Pre-emptive seeking prevention - correct invalid seeks after they happen
  const handleSeekRequest = (seekTime: number) => {
    console.log(`[VideoFile] Seek detected to: ${seekTime}s`);
    
    if (isProgressiveLoading && backgroundLoading) {
      const playableDuration = getPlayableDuration();
      
      if (seekTime > playableDuration) {
        console.log(`[VideoFile] CORRECTING invalid seek: ${seekTime}s > ${playableDuration.toFixed(1)}s`);
        
        // Immediately seek back to the last valid position or the edge of loaded content
        const correctedTime = Math.min(playableDuration, lastValidSeekTime.current);
        console.log(`[VideoFile] Seeking back to valid position: ${correctedTime.toFixed(1)}s`);
        
        if (videoRef.current) {
          setTimeout(() => {
            videoRef.current.seek(correctedTime);
          }, 50); // Small delay to avoid conflict
        }
        
        // Don't update currentTime state for invalid seeks
        return false;
      } else {
        // Valid seek - remember this position
        lastValidSeekTime.current = seekTime;
      }
    }
    
    // Update current time for valid seeks
    setCurrentTime(seekTime);
    return true;
  };

  // Handle progress update
  const onProgress = (data: any) => {
    // Always update our current time state with the most recent value
    setCurrentTime(data.currentTime);
    
    // Update last valid seek time with current playback position
    if (isProgressiveLoading && backgroundLoading) {
      const playableDuration = getPlayableDuration();
      if (data.currentTime <= playableDuration) {
        lastValidSeekTime.current = data.currentTime;
      }
    } else {
      lastValidSeekTime.current = data.currentTime;
    }
    
    // If approaching the end of loaded content, handle more gracefully
    if (isProgressiveLoading && backgroundLoading && videoRef.current) {
      const playableDuration = getPlayableDuration();
      const buffer = 0.5; // Small buffer for smooth transitions
      
      // Only pause if we're very close to the end and still loading
      if (data.currentTime > playableDuration - buffer && getLoadedPercentage() < 95) {
        console.log(`[VideoFile] Approaching end of loaded content at ${data.currentTime.toFixed(1)}s, playable up to ${playableDuration.toFixed(1)}s`);
        
        // Seek back to a safe position instead of pausing
        const safePosition = Math.max(0, playableDuration - 1);
        console.log(`[VideoFile] Seeking back to safe position: ${safePosition.toFixed(1)}s`);
        
        if (videoRef.current) {
          videoRef.current.seek(safePosition);
          lastValidSeekTime.current = safePosition;
        }
      }
    }
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
        <View style={{ width: '100%', alignItems: 'center' }}>
          <Video
            ref={videoRef}
            source={{ uri: videoUri }}
            style={styles.video}
            controls
            resizeMode="contain"
            paused={false}
            fullscreen={false}
            allowsExternalPlayback={false}
            playWhenInactive={false}
            playInBackground={false}
            onLoad={(data: any) => {
              console.log('[VideoFile] Video loaded successfully');
              setDuration(data.duration);
              // Initialize last valid seek time
              lastValidSeekTime.current = 0;
              // Restore playback position if we had saved one
              restorePlaybackPosition();
            }}
            onProgress={onProgress}
            onSeek={(data: any) => handleSeekRequest(data.currentTime)}
            onError={(error: any) => {
              console.error('[VideoFile] Video playback error:', error);
              
              // If this is a progressive loading video and we hit an error, 
              // it might be because we reached the end of loaded content
              if (isProgressiveLoading && backgroundLoading) {
                const errorCode = error?.error?.code;
                const errorDomain = error?.error?.domain;
                
                // Check for specific iOS video errors that indicate seeking beyond available data
                if (errorCode === -11880 && errorDomain === 'AVFoundationErrorDomain') {
                  console.log('[VideoFile] Error indicates seeking beyond loaded content - ignoring error');
                  // Don't set error state for this specific case - just ignore it
                  return;
                }
                
                // For progressive loading, be more lenient with errors to prevent app slowdown
                console.log('[VideoFile] Error during progressive loading - ignoring to maintain performance');
                return;
              }
              
              // Only set error state for non-progressive loading or critical errors
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
          
          {/* Show loading progress indicator below the video player */}
          {isProgressiveLoading && backgroundLoading && (
            <View style={styles.progressiveIndicator}>
              <View style={[styles.progressiveBar, { backgroundColor: theme.border }]}>
                <View 
                  style={[
                    styles.progressiveFill, 
                    { 
                      backgroundColor: theme.accent,
                      width: `${getLoadedPercentage()}%`
                    }
                  ]} 
                />
              </View>
              <Text style={[styles.progressiveText, { color: theme.text }]}>
                Loading video: {getLoadedPercentage().toFixed(0)}% complete
              </Text>
              <Text style={[styles.progressiveText, { color: theme.textSecondary, fontSize: 10 }]}>
                {loadingProgress?.current || 0}/{loadingProgress?.total || 0} chunks • Playable up to {getPlayableDuration().toFixed(0)}s
              </Text>
            </View>
          )}
        </View>
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
  progressiveIndicator: {
    width: '100%',
    marginTop: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  progressiveBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressiveFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressiveText: {
    fontSize: 12,
    textAlign: 'center',
  },
});

const VideoFile: React.FC<VideoFileProps> = (props) => {
  if (Platform.OS === 'web') return <VideoFileWeb {...props} />;
  return <VideoFileNative {...props} />;
};

export default VideoFile;