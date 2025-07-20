// file viewer main component and error boundaries
import React from 'react';
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
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
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
}) => {
  // Local state for displayed metadata
  const [viewerMetadata, setViewerMetadata] = React.useState<FileMetadata>(metadata);
  React.useEffect(() => {
    setViewerMetadata(metadata);
  }, [metadata]);
  React.useEffect(() => {
    console.log('[FileViewer] mounted');
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
  const { derivedKey } = usePasswordContext();
  
  // State for handling image preview/full loading
  const [imageFullData, setImageFullData] = React.useState<Uint8Array | null>(null);
  const [isLoadingFullImage, setIsLoadingFullImage] = React.useState(false);

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
      
      if (!derivedKey) {
        console.log('[FileViewer] No derived key available for full image load');
        return;
      }

      try {
        console.log('[FileViewer] Starting full image load for:', viewerMetadata.uuid);
        setIsLoadingFullImage(true);
        const result = await FileManagerService.loadEncryptedFile(viewerMetadata.uuid, derivedKey);
        console.log('[FileViewer] Full image loaded, size:', result.fileData.length);
        setImageFullData(result.fileData);
      } catch (error) {
        console.error('[FileViewer] Error loading full image data:', error);
      } finally {
        setIsLoadingFullImage(false);
      }
    };

    loadFullImage();
  }, [metadata.type, isPreviewData, viewerMetadata?.uuid, derivedKey]);

  const renderFileContent = () => {
    const mimeType = metadata.type;
    let rendered;
    if (mimeType.startsWith('image/')) {
      // Use full image if loaded, otherwise use the provided data (which could be preview or full)
      const displayData = imageFullData || fileData;
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
            style={{ backgroundColor: theme.surface, borderRadius: 8, flex: 1 }} 
          />
          {isLoadingFullImage && isShowingPreview && (
            <View style={{
              position: 'absolute',
              top: 16,
              right: 16,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              padding: 6,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
        </View>
      );
    } else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      rendered = <TextFile fileData={fileData} />;
    } else if (mimeType.startsWith('audio/')) {
      rendered = <AudioFile fileData={fileData} mimeType={mimeType} fileName={metadata.name} />;
    } else if (mimeType.startsWith('video/')) {
      rendered = <VideoFile fileData={fileData} mimeType={mimeType} fileName={metadata.name} />;
    } else if (mimeType === 'application/pdf') {
      rendered = <PDFFile fileData={fileData} mimeType={mimeType} fileName={metadata.name} />;
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
    if (!derivedKey) {
      showAlert('Error', 'No derived key available.');
      return;
    }
    try {
      await FileManagerService.updateFileMetadata(
        metadata.uuid,
        {
          name: metaEditor.name,
          folderPath: metaEditor.folderPath.split('/').filter(Boolean),
          tags: metaEditor.tags,
        },
        derivedKey
      );
      // Reload updated metadata from disk
      const updatedMetadata = await FileManagerService.loadFileMetadata(metadata.uuid, derivedKey);
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
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityLabel="Close">
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
                  <Text style={styles.detailValue}>{new Date(viewerMetadata.encryptedAt).toLocaleDateString()}</Text>
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
});

export default FileViewer;
