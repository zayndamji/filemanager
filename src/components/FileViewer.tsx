// file viewer main component and error boundaries
import React, { useState } from 'react';
import { Platform } from 'react-native';
import { showAlert } from '../utils/AlertUtils';
// catches errors in the parent tree and displays a fallback ui
class GlobalErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  // catch errors and update error state
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  // log error details for debugging
  componentDidCatch(error: Error, info: any) {
    console.error('[GlobalErrorBoundary] Caught error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      // show error message if rendering fails
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Text style={{ color: 'red', fontSize: 16, textAlign: 'center' }}>
            global rendering error:\n{this.state.error?.toString()}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}
// react native and icon imports
import { Component, ErrorInfo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, InteractionManager } from 'react-native';
import MetadataEditor from './MetadataEditor/MetadataEditor';
import { useMetadataEditor } from './MetadataEditor/useMetadataEditor';
import { darkTheme, ThemeContext } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebCompatibleIcon from './WebCompatibleIcon';

// file type renderers
import ImageFile from './FileTypes/ImageFile';
import TextFile from './FileTypes/TextFile';
import { AudioFile } from './FileTypes/AudioFile';
import PDFFile from './FileTypes/PDFFile';
import VideoFile from './FileTypes/VideoFile';
import { FileMetadata, FileManagerService } from '../utils/FileManagerService';
import { useFileManagerService } from '../hooks/useFileManagerService';
import { usePasswordContext } from '../context/PasswordContext';

// props for file viewer
interface FileViewerProps {
  fileData: Uint8Array; // file data as bytes
  metadata: FileMetadata; // file metadata
  onClose: () => void; // callback for closing viewer
  onDownload?: () => void; // callback for download
  onDelete?: () => void; // callback for delete
  showDetails?: boolean; // whether to show file details
  onMetadataUpdated?: () => void; // callback after metadata is updated
  isPreviewData?: boolean; // whether the fileData is just preview data
  onNavigateNext?: () => void; // callback for navigating to next file
  onNavigatePrev?: () => void; // callback for navigating to previous file
  hasNext?: boolean; // whether there is a next file
  hasPrev?: boolean; // whether there is a previous file
}

// catches errors in file viewer only
class FileViewerErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  // catch errors and update error state
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  // log error details for debugging
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[FileViewerErrorBoundary] Caught error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      // show error message if rendering fails
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Text style={{ color: 'red', fontSize: 16, textAlign: 'center' }}>
            fileviewer rendering error:
            {this.state.error?.toString()}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// main file viewer component
const FileViewer: React.FC<FileViewerProps> = ({
  fileData,
  metadata,
  onClose,
  onDownload,
  onDelete,
  showDetails = true,
  onMetadataUpdated,
  isPreviewData = false,
  onNavigateNext,
  onNavigatePrev,
  hasNext = false,
  hasPrev = false,
}) => {
  // Local state for displayed metadata
  const [viewerMetadata, setViewerMetadata] = React.useState<FileMetadata>(metadata);
  React.useEffect(() => {
    console.log('[FileViewer] mounted');
    
    // Cleanup on unmount
    return () => {
      console.log('[FileViewer] unmounting, cleaning up temp files');
      FileManagerService.cleanupAllTempFiles().catch((error) => {
        console.warn('[FileViewer] Failed to cleanup temp files on unmount:', error);
      });
    };
  }, []);
  React.useEffect(() => {
    console.log('[FileViewer] metadata changed:', { uuid: viewerMetadata?.uuid });
  }, [viewerMetadata]);

  // Use unified metadata editor state
  const metaEditor = useMetadataEditor({
    initialName: viewerMetadata.name,
    initialFolderPath: viewerMetadata.folderPath.join('/'),
    initialTags: viewerMetadata.tags || [],
  });
  const insets = useSafeAreaInsets();
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  const handleDownload = async () => {
    if (onDownload) {
      onDownload();
    }
  };
  const { theme } = React.useContext(ThemeContext);
  const fileManagerService = useFileManagerService();
  
  // State for handling image preview/full loading
  const [imageFullData, setImageFullData] = React.useState<Uint8Array | null>(null);
  const [isLoadingFullImage, setIsLoadingFullImage] = useState(false);
  const abortControllerRef = React.useRef<AbortController | null>(null);
  
  // State for handling file loading (for large videos that weren't pre-loaded)
  const [actualFileData, setActualFileData] = React.useState<Uint8Array>(fileData);
  const [isLoadingFile, setIsLoadingFile] = React.useState(false);
  const [fileLoadError, setFileLoadError] = React.useState<string | null>(null);
  
  // Load file if fileData is empty (for large videos)
  React.useEffect(() => {
    // Don't load file data for videos if we're going to pass UUID to VideoFile for decryption
    const isVideo = viewerMetadata.type.startsWith('video/');
    const shouldLoadFile = fileData.length === 0 && !isPreviewData && viewerMetadata.uuid && !isVideo;
    
    if (shouldLoadFile) {
      console.log('[FileViewer] File data is empty, loading file:', viewerMetadata.name);
      loadFileData();
    } else {
      setActualFileData(fileData);
    }
  }, [fileData, isPreviewData, viewerMetadata.uuid, viewerMetadata.type]);
  
  const loadFileData = async () => {
    if (isLoadingFile) return;
    
    setIsLoadingFile(true);
    setFileLoadError(null);
    
    try {
      console.log('[FileViewer] Loading file data for:', viewerMetadata.name);
      const result = await fileManagerService.loadEncryptedFile(viewerMetadata.uuid);
      setActualFileData(result.fileData);
      console.log('[FileViewer] File data loaded successfully');
    } catch (error) {
      console.error('[FileViewer] Failed to load file data:', error);
      setFileLoadError(error instanceof Error ? error.message : 'Failed to load file');
    } finally {
      setIsLoadingFile(false);
    }
  };
  
  // Navigation debouncing
  const navigationTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const [isNavigating, setIsNavigating] = React.useState(false);

  // Cleanup function to cancel ongoing image loading
  const cancelImageLoading = React.useCallback(() => {
    if (abortControllerRef.current) {
      console.log('[FileViewer] Cancelling image loading...');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      // Immediately update loading state to provide instant feedback
      setIsLoadingFullImage(false);
      // Clear any loaded full image data to prevent stale data display
      setImageFullData(null);
    }
  }, []);

  // Cancel loading when component unmounts or navigation happens
  React.useEffect(() => {
    return () => {
      cancelImageLoading();
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, [cancelImageLoading]);

  // Debounced navigation functions
  const handleNavigateNext = React.useCallback(() => {
    if (isNavigating) return; // Prevent rapid clicking
    
    setIsNavigating(true);
    cancelImageLoading();
    
    // Clear any existing timeout
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }
    
    // Debounce navigation to prevent rapid successive calls
    navigationTimeoutRef.current = setTimeout(() => {
      onNavigateNext?.();
      // Reset navigation state after a brief delay
      setTimeout(() => setIsNavigating(false), 100);
    }, 50);
  }, [isNavigating, cancelImageLoading, onNavigateNext]);

  const handleNavigatePrev = React.useCallback(() => {
    if (isNavigating) return; // Prevent rapid clicking
    
    setIsNavigating(true);
    cancelImageLoading();
    
    // Clear any existing timeout
    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }
    
    // Debounce navigation to prevent rapid successive calls
    navigationTimeoutRef.current = setTimeout(() => {
      onNavigatePrev?.();
      // Reset navigation state after a brief delay
      setTimeout(() => setIsNavigating(false), 100);
    }, 50);
  }, [isNavigating, cancelImageLoading, onNavigatePrev]);

  const handleClose = React.useCallback(() => {
    cancelImageLoading();
    // Clean up any temporary files when closing the viewer
    FileManagerService.cleanupAllTempFiles().catch((error) => {
      console.warn('[FileViewer] Failed to cleanup temp files on close:', error);
    });
    onClose();
  }, [cancelImageLoading, onClose]);

  // Handle metadata changes (navigation) - cancel loading and reset image state
  React.useEffect(() => {
    if (metadata.uuid !== viewerMetadata.uuid) {
      console.log('[FileViewer] Metadata UUID changed, cancelling operations and resetting state');
      cancelImageLoading();
      setImageFullData(null);
      setIsNavigating(false); // Reset navigation state on metadata change
      
      // Clear any pending navigation timeouts
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
        navigationTimeoutRef.current = null;
      }
    }
    setViewerMetadata(metadata);
  }, [metadata, viewerMetadata.uuid, cancelImageLoading]);

  // Load full image for image files when we only have preview data
  React.useEffect(() => {
    const loadFullImage = async () => {
      if (!metadata.type.startsWith('image/') || !isPreviewData || !viewerMetadata?.uuid) {
        console.log('[FileViewer] Skipping full image load:', { 
          isImage: metadata.type.startsWith('image/'), 
          isPreviewData, 
          hasUuid: !!viewerMetadata?.uuid 
        });
        return;
      }
      
      // Cancel any existing loading operation
      cancelImageLoading();

      // Don't start loading if navigation is in progress
      if (isNavigating) {
        console.log('[FileViewer] Skipping full image load - navigation in progress');
        return;
      }

      // Don't start loading if this is a stale effect (UUID changed during render)
      if (metadata.uuid !== viewerMetadata.uuid) {
        console.log('[FileViewer] Skipping full image load - UUID changed during render');
        return;
      }

      try {
        console.log('[FileViewer] Starting full image load for:', viewerMetadata.uuid);
        
        // Create new abort controller for this operation
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        const currentUuid = viewerMetadata.uuid; // Capture current UUID
        
        setIsLoadingFullImage(true);
        
        // Use a more aggressive time-slicing approach
        const timeSlicedLoad = async () => {
          console.log('[FileViewer] Using time-sliced loading approach');
          
          // First, yield immediately to ensure UI updates
          await new Promise(resolve => {
            console.log('[FileViewer] Initial yield for UI update');
            setTimeout(resolve, 10);
          });
          
          if (abortController.signal.aborted || currentUuid !== viewerMetadata.uuid || isNavigating) {
            console.log('[FileViewer] Cancelled during initial yield');
            return null;
          }
          
          // Use requestIdleCallback-like pattern with setTimeout
          return new Promise<{ fileData: Uint8Array; metadata: any } | null>((resolve, reject) => {
            const startTime = Date.now();
            console.log('[FileViewer] Starting time-sliced file load at', startTime);
            
            // Break the work into smaller time slices
            const performWork = async () => {
              try {
                console.log('[FileViewer] About to call FileManagerService.loadEncryptedFile');
                
                // Simple progress callback - just indicates loading
                const progressCallback = () => {
                  // No-op - just indicates activity
                };
                
                const result = await fileManagerService.loadEncryptedFile(
                  viewerMetadata.uuid, 
                  abortController.signal,
                  progressCallback
                );
                console.log('[FileViewer] FileManagerService.loadEncryptedFile completed');
                resolve(result);
              } catch (error) {
                console.log('[FileViewer] FileManagerService.loadEncryptedFile failed:', error);
                reject(error);
              }
            };
            
            // Start the work after a small delay to ensure UI responsiveness
            setTimeout(() => {
              console.log('[FileViewer] Starting actual file load work');
              performWork();
            }, 16); // One frame delay
          });
        };
        
        const result = await timeSlicedLoad();
        
        if (!result) {
          console.log('[FileViewer] Time-sliced load returned null (cancelled)');
          return;
        }
        
        // Check if operation was cancelled or UUID changed while loading
        if (abortController.signal.aborted || currentUuid !== viewerMetadata.uuid || isNavigating) {
          console.log('[FileViewer] Image loading was cancelled or UUID changed after completion');
          return;
        }
        
        console.log('[FileViewer] Full image loaded successfully, size:', result.fileData.length);
        setImageFullData(result.fileData);
      } catch (error) {
        // Check if we were cancelled during the operation
        if (abortControllerRef.current?.signal.aborted || (error instanceof Error && error.message?.includes('cancelled'))) {
          console.log('[FileViewer] Image loading was cancelled during operation:', error instanceof Error ? error.message : error);
        } else {
          console.error('[FileViewer] Error loading full image data:', error);
        }
      } finally {
        // Only update loading state if not cancelled
        if (!abortControllerRef.current?.signal.aborted && !isNavigating) {
          console.log('[FileViewer] Setting loading state to false');
          setIsLoadingFullImage(false);
        }
        abortControllerRef.current = null;
      }
    };

    loadFullImage();
  }, [metadata.type, isPreviewData, viewerMetadata?.uuid, cancelImageLoading, isNavigating]);

  const renderFileContent = () => {
    const mimeType = metadata.type;
    
    // Show loading state if file is being loaded
    if (isLoadingFile) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Loading {metadata.name}...</Text>
          <Text style={styles.loadingSubtext}>Decrypting file ({formatFileSize(metadata.size)})</Text>
        </View>
      );
    }
    
    // Show error if file loading failed
    if (fileLoadError) {
      return (
        <View style={styles.errorContainer}>
          <WebCompatibleIcon name="error" size={64} color="#ff6b6b" />
          <Text style={styles.errorText}>Failed to load file</Text>
          <Text style={styles.errorSubtext}>{fileLoadError}</Text>
          <Pressable style={styles.retryButton} onPress={loadFileData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      );
    }
    
    let rendered;
    if (mimeType.startsWith('image/')) {
      // Use full image if loaded, otherwise use the provided data (which could be preview or full)
      const displayData = imageFullData || actualFileData;
      const isShowingPreview = isPreviewData && !imageFullData;
      
      rendered = (
        <View style={{
          backgroundColor: theme.surface,
          borderRadius: 12,
          margin: 16,
          padding: 16,
          borderWidth: 2,
          borderColor: theme.border,
          position: 'relative',
          flex: 1, // Take up available space
          maxHeight: '65%', // Limit image container height to fit most of the viewport and hide file details
        }}>
          <ImageFile 
            fileData={displayData} 
            mimeType={mimeType} 
            isPreview={isShowingPreview}
            showZoomControls={false}
            style={{ backgroundColor: theme.surface, borderRadius: 8, flex: 1 }} 
          />
          {isLoadingFullImage && isShowingPreview && (
            <View style={{
              position: 'absolute',
              top: 16,
              right: 16,
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              borderRadius: 12,
              padding: 8,
            }}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
        </View>
      );
    } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      rendered = <TextFile fileData={actualFileData} />;
    } else if (mimeType.startsWith('audio/')) {
      rendered = <AudioFile fileData={actualFileData} mimeType={mimeType} fileName={metadata.name} />;
    } else if (mimeType.startsWith('video/')) {
      console.log('[FileViewer] Using VideoFile for video:', metadata.name, 'Size:', formatFileSize(metadata.size));
      // For videos, always pass UUID for decryption to avoid duplicate decryption in FileViewer
      // VideoFile component will handle the decryption
      if (actualFileData.length > 0) {
        rendered = <VideoFile fileData={actualFileData} mimeType={mimeType} fileName={metadata.name} onClose={onClose} />;
      } else {
        rendered = <VideoFile uuid={metadata.uuid} mimeType={mimeType} fileName={metadata.name} totalSize={metadata.size} onClose={onClose} />;
      }
    } else if (mimeType === 'application/pdf') {
      rendered = <PDFFile fileData={actualFileData} mimeType={mimeType} fileName={metadata.name} />;
    } else {
      rendered = (
        <View style={styles.unsupportedContainer}>
          <WebCompatibleIcon name="insert-drive-file" size={64} color="#ccc" />
          <Text style={styles.unsupportedText}>unsupported file type: {mimeType}</Text>
          <Text style={styles.unsupportedSubtext}><Text>{formatFileSize(metadata.size)}</Text></Text>
        </View>
      );
    }
    if (typeof rendered === 'string' || typeof rendered === 'number') {
      return <Text style={{ color: 'red', padding: 16 }}>file content could not be rendered (primitive returned)</Text>;
    }
    return rendered;
  };
  const handleDelete = () => {
    showAlert(
      'Delete File',
      `Are you sure you want to delete "${metadata.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete },
      ]
    );
  };

  // --- Edit Metadata State ---
  const [editing, setEditing] = React.useState(false);
  // Reset metaEditor state when opening edit mode or metadata changes
  React.useEffect(() => {
    if (editing) {
      metaEditor.reset({
        initialName: viewerMetadata.name,
        initialFolderPath: viewerMetadata.folderPath.join('/'),
        initialTags: viewerMetadata.tags || [],
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, viewerMetadata]);

  // --- Save Metadata Handler ---
  const handleSaveMetadata = async () => {
    try {
      await fileManagerService.updateFileMetadata(
        metadata.uuid,
        {
          name: metaEditor.name,
          folderPath: metaEditor.folderPath.split('/').filter(Boolean),
          tags: metaEditor.tags,
        }
      );
      // Reload updated metadata from disk
      const updatedMetadata = await fileManagerService.loadFileMetadata(metadata.uuid);
      setViewerMetadata(updatedMetadata);
      setEditing(false);
      if (onMetadataUpdated) {
        onMetadataUpdated();
      }
    } catch (error) {
      console.error('[FileViewer] Failed to update metadata:', error);
      showAlert('Error', 'Failed to update file metadata');
    }
  };

  // --- Main Render ---
  return (
    <GlobalErrorBoundary>
      <FileViewerErrorBoundary>
        <View style={[styles.container, { backgroundColor: theme.background }]}> 
          {/* header section with close, filename, and actions */}
          <View style={[styles.header, { paddingTop: insets.top || 16, minHeight: 56 + (insets.top || 16), flexDirection: 'row', alignItems: 'center' }]}> 
            <Pressable onPress={handleClose} style={styles.closeButton} accessibilityLabel="Close">
              <WebCompatibleIcon name="close" size={24} color="#666" />
            </Pressable>

            <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">{viewerMetadata.name}</Text>

            <View style={styles.headerActions}>
              {onDelete && (
                <Pressable onPress={handleDelete} style={styles.actionButton} accessibilityLabel="Delete">
                  <WebCompatibleIcon name="delete" size={24} color="#FF4444" />
                </Pressable>
              )}
              {onDownload && (
                <Pressable onPress={handleDownload} style={styles.actionButton} accessibilityLabel="Download">
                  <WebCompatibleIcon name="download" size={24} color="#666" />
                </Pressable>
              )}
            </View>
          </View>

          {/* file content and details section */}
          <ScrollView style={[styles.content, { backgroundColor: theme.background }]} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
            {renderFileContent()}

            {!!showDetails && !editing && (
              <View style={styles.detailsContainer}>
                <Text style={styles.detailsTitle}>File Details</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Name:</Text>
                  <Text style={styles.detailValue}>{viewerMetadata.name}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Size:</Text>
                  <Text style={styles.detailValue}>{formatFileSize(viewerMetadata.size)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Type:</Text>
                  <Text style={styles.detailValue}>{viewerMetadata.type}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>UUID:</Text>
                  <Text style={styles.detailValue}>{viewerMetadata.uuid}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Folder:</Text>
                  <Text style={styles.detailValue}>/{viewerMetadata.folderPath.join('/') || ''}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Encrypted:</Text>
                  <Text style={styles.detailValue}>{new Date(viewerMetadata.encryptedAt).toLocaleString()}</Text>
                </View>
                {!!(viewerMetadata.tags && viewerMetadata.tags.length > 0) ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Tags:</Text>
                    <Text style={styles.detailValue}>{viewerMetadata.tags.join(', ')}</Text>
                  </View>
                ) : null}
                {/* Edit Metadata Button */}
                <Pressable
                  style={{ marginTop: 20, padding: 12, backgroundColor: '#007AFF', borderRadius: 8, alignItems: 'center' }}
                  onPress={() => setEditing(true)}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Edit Metadata</Text>
                </Pressable>
              </View>
            )}

            {/* Edit Metadata Form */}
            {editing && (
              <View style={styles.detailsContainer}>
                <Text style={styles.detailsTitle}>Edit Metadata</Text>
                <MetadataEditor
                  name={metaEditor.name}
                  folderPath={metaEditor.folderPath}
                  tags={metaEditor.tags}
                  onNameChange={metaEditor.setName}
                  onFolderPathChange={metaEditor.setFolderPath}
                  onTagsChange={metaEditor.setTags}
                  editable={true}
                />
                {/* Save/Cancel buttons */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
                  <Pressable
                    style={{ backgroundColor: '#eee', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, marginRight: 8 }}
                    onPress={() => setEditing(false)}
                  >
                    <Text style={{ color: '#666', fontWeight: '600', fontSize: 15 }}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={{ backgroundColor: '#007AFF', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 }}
                    onPress={handleSaveMetadata}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Save</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Navigation arrows for image files only */}
          {(onNavigatePrev || onNavigateNext) && metadata.type.startsWith('image/') && (
            <>
              {/* Left arrow */}
              {onNavigatePrev && hasPrev && (
                <Pressable
                  style={[styles.navArrowLeft, isNavigating && styles.navArrowDisabled]}
                  onPress={handleNavigatePrev}
                  disabled={isNavigating}
                  accessibilityLabel="Previous file"
                >
                  <WebCompatibleIcon 
                    name="keyboard-arrow-left" 
                    size={28} 
                    color={isNavigating ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.9)"} 
                  />
                </Pressable>
              )}
              
              {/* Right arrow */}
              {onNavigateNext && hasNext && (
                <Pressable
                  style={[styles.navArrowRight, isNavigating && styles.navArrowDisabled]}
                  onPress={handleNavigateNext}
                  disabled={isNavigating}
                  accessibilityLabel="Next file"
                >
                  <WebCompatibleIcon 
                    name="keyboard-arrow-right" 
                    size={28} 
                    color={isNavigating ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.9)"} 
                  />
                </Pressable>
              )}
            </>
          )}
        </View>
      </FileViewerErrorBoundary>
    </GlobalErrorBoundary>
  );
};

// styles for file viewer
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: darkTheme.surface,
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.border,
  },
  closeButton: {
    marginRight: 12,
    backgroundColor: 'transparent',
    padding: 4,
  },
  fileName: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: darkTheme.text,
    marginHorizontal: 48,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  actionButton: {
    marginLeft: 12,
    backgroundColor: 'transparent',
    padding: 8,
  },
  content: {
    flex: 1,
    backgroundColor: darkTheme.background,
  },
  unsupportedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  unsupportedText: {
    fontSize: 16,
    color: darkTheme.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
  unsupportedSubtext: {
    fontSize: 14,
    color: darkTheme.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  detailsContainer: {
    backgroundColor: darkTheme.surface,
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: darkTheme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: darkTheme.text,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: darkTheme.border,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: darkTheme.textSecondary,
    width: 80,
  },
  detailValue: {
    fontSize: 14,
    color: darkTheme.text,
    flex: 1,
  },
  navArrowLeft: {
    position: 'absolute',
    left: 32,
    top: '50%',
    marginTop: -24,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 24,
    padding: 12,
    zIndex: 10,
    opacity: 0.8,
  },
  navArrowRight: {
    position: 'absolute',
    right: 32,
    top: '50%',
    marginTop: -24,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 24,
    padding: 12,
    zIndex: 10,
    opacity: 0.8,
  },
  navArrowDisabled: {
    opacity: 0.3,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: darkTheme.text,
    marginTop: 16,
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 14,
    color: darkTheme.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ff6b6b',
    marginTop: 16,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: 14,
    color: darkTheme.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default FileViewer;
