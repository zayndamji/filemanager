import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useFileManagerService } from '../../hooks/useFileManagerService';
import { EncryptedFile } from '../../utils/FileManagerService';
import { ThemeContext } from '../../theme';
import { waitForVideoElement, safeVideoOperation } from './VideoUtils';
import HLSVideoPlayer from './HLSVideoPlayer';

// Conditionally import StandardVideoPlayer for fallback
let StandardVideoPlayer: any = null;
try {
  StandardVideoPlayer = require('./StandardVideoPlayer').default;
} catch (e) {
  console.warn('[AdaptiveVideoPlayer] StandardVideoPlayer not available:', e);
}

interface AdaptiveVideoPlayerProps {
  file: EncryptedFile;
  onError?: (error: string) => void;
  preferSeamless?: boolean;
  bufferAhead?: number;
  maxBufferSize?: number;
}

const AdaptiveVideoPlayer: React.FC<AdaptiveVideoPlayerProps> = ({ 
  file, 
  onError, 
  preferSeamless = true,
  bufferAhead = 3,
  maxBufferSize = 30
}) => {
  console.log('🎯 [AdaptiveVideoPlayer] Component initialized with file:', file?.uuid, 'preferSeamless:', preferSeamless);
  
  const fileManagerService = useFileManagerService();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerType, setPlayerType] = useState<'seamless' | 'standard' | 'unknown'>('unknown');
  const [metadata, setMetadata] = useState<any>(null);
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 2;
  
  const { theme } = React.useContext(ThemeContext);

  useEffect(() => {
    // Small delay to ensure component is mounted before determining player type
    const timer = setTimeout(() => {
      determinePlayerType();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [file.uuid]);

  const determinePlayerType = async () => {
    console.log('[AdaptiveVideoPlayer] determinePlayerType START:', {
      fileUuid: file?.uuid,
      preferSeamless,
      retryCount,
      timestamp: Date.now()
    });
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('[AdaptiveVideoPlayer] Determining optimal player type for:', file.uuid);
      
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
        preferSeamless
      });
      
      // Determine the best player type
      if (isHLS && preferSeamless) {
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
    console.error('[AdaptiveVideoPlayer] Standard player error:', error);
    setError(error);
    onError?.(error);
  };

  const renderPlayer = () => {
    switch (playerType) {
      case 'seamless':
        console.log('[AdaptiveVideoPlayer] Rendering HLSVideoPlayer component');
        try {
          return (
            <HLSVideoPlayer
              file={file}
              onError={handleSeamlessError}
              bufferAhead={bufferAhead}
              maxBufferSize={maxBufferSize}
            />
          );
        } catch (error) {
          console.error('[AdaptiveVideoPlayer] Error rendering HLSVideoPlayer:', error);
          // Fall back to standard player
          return (
            <StandardVideoPlayer
              file={file}
              onError={handleStandardError}
            />
          );
        }
        
      case 'standard':
        if (!StandardVideoPlayer) {
          return (
            <View style={[styles.errorContainer, { backgroundColor: theme.surface }]}>
              <Text style={[styles.errorText, { color: theme.error }]}>
                Standard video player not available
              </Text>
            </View>
          );
        }
        
        return (
          <StandardVideoPlayer
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
          {playerType === 'seamless' ? '🚀 Seamless Player' : '📹 Standard Player'}
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
