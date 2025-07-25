import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useFileManagerService } from '../hooks/useFileManagerService';
import { EncryptedFile } from '../utils/FileManagerService';
import { ThemeContext } from '../theme';

// Conditionally import SeamlessVideoPlayer only for non-web platforms
let SeamlessVideoPlayer: any = null;
if (Platform.OS !== 'web') {
  try {
    SeamlessVideoPlayer = require('./SeamlessVideoPlayer').default;
  } catch (e) {
    console.warn('[AdaptiveVideoPlayer] SeamlessVideoPlayer not available:', e);
  }
}

// Conditionally import VideoFile for fallback
let VideoFile: any = null;
try {
  VideoFile = require('./FileTypes/VideoFile').default;
} catch (e) {
  console.warn('[AdaptiveVideoPlayer] VideoFile not available:', e);
}

interface AdaptiveVideoPlayerProps {
  file: EncryptedFile;
  onError?: (error: string) => void;
  preferSeamless?: boolean;
  bufferAhead?: number;
  maxBufferSize?: number;
}

export const AdaptiveVideoPlayer: React.FC<AdaptiveVideoPlayerProps> = ({ 
  file, 
  onError, 
  preferSeamless = true,
  bufferAhead = 3,
  maxBufferSize = 30
}) => {
  const fileManagerService = useFileManagerService();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Helper function to detect web platform
  const isWebPlatform = () => {
    return Platform.OS === 'web' || 
           (typeof globalThis !== 'undefined' && typeof (globalThis as any).window !== 'undefined') || 
           (typeof globalThis !== 'undefined' && typeof (globalThis as any).navigator !== 'undefined');
  };
  
  const [playerType, setPlayerType] = useState<'seamless' | 'standard' | 'unknown'>(
    isWebPlatform() ? 'standard' : 'unknown'
  );
  const [metadata, setMetadata] = useState<any>(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 2;
  
  const { theme } = React.useContext(ThemeContext);

  console.log('🎯 [AdaptiveVideoPlayer] Component initialized with file:', file.uuid, 'Platform:', Platform.OS, 'preferSeamless:', preferSeamless);
  console.log('🎯 [AdaptiveVideoPlayer] Platform check result:', Platform.OS === 'web', 'typeof Platform.OS:', typeof Platform.OS);

  useEffect(() => {
    determinePlayerType();
  }, [file.uuid]);

  const determinePlayerType = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('[AdaptiveVideoPlayer] Determining optimal player type for:', file.uuid);
      console.log('[AdaptiveVideoPlayer] determinePlayerType START:', { 
        platformOS: Platform.OS, 
        isWeb: Platform.OS === 'web',
        platformType: typeof Platform.OS
      });
      
      // For web platform, always use standard player due to MediaSource API issues
      // Check multiple ways to detect web platform
      const webDetected = isWebPlatform();
      
      console.log('[AdaptiveVideoPlayer] Web platform detection:', {
        platformOS: Platform.OS,
        platformOSIsWeb: Platform.OS === 'web',
        hasWindow: typeof (globalThis as any).window !== 'undefined',
        hasNavigator: typeof (globalThis as any).navigator !== 'undefined',
        webDetected
      });
                           
      if (webDetected) {
        console.log('🌐 [AdaptiveVideoPlayer] WEB PLATFORM DETECTED - SeamlessVideoPlayer is DISABLED for web. Using StandardVideoPlayer directly.');
        setPlayerType('standard');
        setLoading(false);
        return;
      }
      
      // Load metadata to determine video type
      const fileMetadata = await fileManagerService.loadFileMetadata(file.uuid);
      setMetadata(fileMetadata);
      
      const isHLS = (fileMetadata as any).isHLS === true && (fileMetadata as any).version === '3.0';
      const isChunked = (fileMetadata as any).isChunked === true;
      const isStandardVideo = fileMetadata.type?.startsWith('video/') && !isHLS && !isChunked;
      
      console.log('[AdaptiveVideoPlayer] Video analysis:', {
        isHLS,
        isChunked,
        isStandardVideo,
        type: fileMetadata.type,
        preferSeamless,
        platform: Platform.OS
      });
      
      // Determine the best player type
      // On web platform OR if SeamlessVideoPlayer is not available, always use standard
      if (webDetected || !SeamlessVideoPlayer) {
        console.log('[AdaptiveVideoPlayer] Using standard player (web platform or SeamlessVideoPlayer unavailable)');
        setPlayerType('standard');
      } else if (isHLS && preferSeamless) {
        console.log('[AdaptiveVideoPlayer] Using seamless player for HLS video');
        setPlayerType('seamless');
      } else if (isHLS || isChunked || isStandardVideo) {
        console.log('[AdaptiveVideoPlayer] Using standard player for video');
        setPlayerType('standard');
      } else {
        throw new Error(`Unsupported video type: ${fileMetadata.type}`);
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to determine player type';
      console.error('[AdaptiveVideoPlayer] Error determining player type:', err);
      
      // Try fallback if we haven't exhausted retries
      if (retryCount < maxRetries) {
        console.log(`[AdaptiveVideoPlayer] Retrying with fallback (attempt ${retryCount + 1}/${maxRetries})`);
        setRetryCount(prev => prev + 1);
        setPlayerType('standard'); // Try standard player as fallback
      } else {
        setError(errorMessage);
        onError?.(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSeamlessError = (error: string) => {
    console.warn('[AdaptiveVideoPlayer] Seamless player error, falling back to standard:', error);
    
    if (retryCount < maxRetries) {
      setRetryCount(prev => prev + 1);
      setPlayerType('standard');
      setError(null);
    } else {
      setError(error);
      onError?.(error);
    }
  };

  const handleStandardError = (error: string) => {
    console.error('🚨 [AdaptiveVideoPlayer] Standard player error:', error);
    
    // For web platform, don't fall back to seamless player due to MediaSource issues
    if (isWebPlatform()) {
      console.log('[AdaptiveVideoPlayer] Web platform - not falling back to seamless player (disabled for web)');
      setError(error);
      onError?.(error);
      return;
    }
    
    // Check if this is a video element timeout error
    if (error.includes('Video element not ready after') && retryCount < maxRetries) {
      console.log(`[AdaptiveVideoPlayer] Video timeout detected, trying seamless fallback (attempt ${retryCount + 1}/${maxRetries})`);
      setRetryCount(prev => prev + 1);
      setPlayerType('seamless');
      setError(null);
      return;
    }
    
    setError(error);
    onError?.(error);
  };

  const renderPlayer = () => {
    // Force standard player for web platform regardless of playerType state
    if (isWebPlatform()) {
      console.log('🌐 [AdaptiveVideoPlayer] renderPlayer: Forcing StandardVideoPlayer for web platform');
      if (!VideoFile) {
        return (
          <View style={[styles.errorContainer, { backgroundColor: theme.surface }]}>
            <Text style={[styles.errorText, { color: theme.error }]}>
              Standard video player not available
            </Text>
          </View>
        );
      }
      
      return (
        <VideoFile
          file={file}
          onError={handleStandardError}
        />
      );
    }
    
    switch (playerType) {
      case 'seamless':
        // SeamlessVideoPlayer is disabled for web platform
        if (!SeamlessVideoPlayer) {
          console.log('[AdaptiveVideoPlayer] SeamlessVideoPlayer not available, falling back to standard');
          if (!VideoFile) {
            return (
              <View style={[styles.errorContainer, { backgroundColor: theme.surface }]}>
                <Text style={[styles.errorText, { color: theme.error }]}>
                  No video player available
                </Text>
              </View>
            );
          }
          
          return (
            <VideoFile
              file={file}
              onError={handleStandardError}
            />
          );
        }
        
        return (
          <SeamlessVideoPlayer
            file={file}
            onError={handleSeamlessError}
            bufferAhead={bufferAhead}
            maxBufferSize={maxBufferSize}
          />
        );
        
      case 'standard':
        if (!VideoFile) {
          return (
            <View style={[styles.errorContainer, { backgroundColor: theme.surface }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>
                Standard video player not available
              </Text>
            </View>
          );
        }
        
        return (
          <VideoFile
            file={file}
            onError={handleStandardError}
          />
        );
        
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface }]}>
        <ActivityIndicator size="large" color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.text }]}>
          Initializing adaptive video player...
        </Text>
        <Text style={[styles.statusText, { color: theme.textSecondary }]}>
          Analyzing video format and selecting optimal player
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: theme.surface }]}>
        <Text style={[styles.errorText, { color: theme.error }]}>
          {error}
        </Text>
        <Text style={[styles.retryText, { color: theme.textSecondary }]}>
          Tried {retryCount} fallback{retryCount !== 1 ? 's' : ''}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      {renderPlayer()}
      
      {/* Player type indicator */}
      <View style={styles.playerTypeIndicator}>
        <Text style={[styles.playerTypeText, { color: theme.text }]}>
          {isWebPlatform() ? '📹 Standard Player (Web Mode)' : 
           playerType === 'seamless' ? '🚀 Seamless Player' : '📹 Standard Player'}
          {retryCount > 0 && ` (Fallback ${retryCount})`}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  statusText: {
    marginTop: 8,
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '500',
  },
  retryText: {
    fontSize: 14,
    textAlign: 'center',
  },
  playerTypeIndicator: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 8,
    borderRadius: 6,
  },
  playerTypeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
});

export default AdaptiveVideoPlayer;
