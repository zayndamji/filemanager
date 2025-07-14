// file viewer main component and error boundaries
import React from 'react';
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
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';

// file type renderers
import ImageFile from './FileTypes/ImageFile';
import TextFile from './FileTypes/TextFile';
import AudioFile from './FileTypes/AudioFile';
import PDFFile from './FileTypes/PDFFile';
import VideoFile from './FileTypes/VideoFile';
import { FileMetadata } from '../utils/FileManagerService';

// props for file viewer
interface FileViewerProps {
  fileData: Uint8Array; // file data as bytes
  metadata: FileMetadata; // file metadata
  onClose: () => void; // callback for closing viewer
  onDownload?: () => void; // callback for download
  onDelete?: () => void; // callback for delete
  showDetails?: boolean; // whether to show file details
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
}) => {
  // log when mounted
  React.useEffect(() => {
    console.log('[FileViewer] mounted');
  }, []);

  // log when metadata changes
  React.useEffect(() => {
    console.log('[FileViewer] metadata changed:', { uuid: metadata?.uuid });
  }, [metadata]);

  const insets = useSafeAreaInsets();

  // format file size for display
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // handle download button click
  const handleDownload = async () => {
    if (onDownload) {
      onDownload();
    }
  };

  // render file content based on mime type
  const renderFileContent = () => {
    const mimeType = metadata.type;
    let rendered;

    // show image file
    if (mimeType.startsWith('image/')) {
      console.log('[FileViewer] rendering ImageFile');
      const isPreview = !!(fileData && fileData.byteLength < 100 * 1024);
      rendered = <ImageFile fileData={fileData} mimeType={mimeType} isPreview={isPreview} />;
    }
    // show text file
    else if (mimeType.startsWith('text/') || mimeType === 'application/json') {
      console.log('[FileViewer] rendering TextFile');
      rendered = <TextFile fileData={fileData} />;
    }
    // show audio file
    else if (mimeType.startsWith('audio/')) {
      console.log('[FileViewer] rendering AudioFile');
      rendered = <AudioFile fileData={fileData} mimeType={mimeType} fileName={metadata.name} />;
    }
    // show video file
    else if (mimeType.startsWith('video/')) {
      console.log('[FileViewer] rendering VideoFile');
      rendered = <VideoFile fileData={fileData} mimeType={mimeType} fileName={metadata.name} />;
    }
    // show pdf file
    else if (mimeType === 'application/pdf') {
      console.log('[FileViewer] rendering PDFFile');
      rendered = <PDFFile fileData={fileData} mimeType={mimeType} fileName={metadata.name} />;
    }
    // unsupported file type
    else {
      console.log('[FileViewer] rendering unsupported file type');
      rendered = (
        <View style={styles.unsupportedContainer}>
          <Icon name="insert-drive-file" size={64} color="#ccc" />
          <Text style={styles.unsupportedText}>
            unsupported file type: {mimeType}
          </Text>
          <Text style={styles.unsupportedSubtext}>
            <Text>{formatFileSize(metadata.size)}</Text>
          </Text>
        </View>
      );
    }

    // fallback: wrap primitive in text if needed
    if (typeof rendered === 'string' || typeof rendered === 'number') {
      console.error('[FileViewer] renderFileContent returned primitive!', { rendered });
      return <Text style={{ color: 'red', padding: 16 }}>file content could not be rendered (primitive returned)</Text>;
    }

    return rendered;
  };

  // handle delete button click
  const handleDelete = () => {
    Alert.alert(
      'Delete File',
      `Are you sure you want to delete "${metadata.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: onDelete 
        },
      ]
    );
  };

  // render main file viewer layout
  return (
    <GlobalErrorBoundary>
      <FileViewerErrorBoundary>
        <View style={styles.container}>
          {/* header section with close, filename, and actions */}
          <View style={[styles.header, { paddingTop: insets.top || 16, minHeight: 56 + (insets.top || 16), flexDirection: 'row', alignItems: 'center' }]}> 
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityLabel="Close">
              <Icon name="close" size={24} color="#666" />
            </Pressable>

            <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">{metadata.name}</Text>

            <View style={styles.headerActions}>
              {onDelete && (
                <Pressable onPress={handleDelete} style={styles.actionButton} accessibilityLabel="Delete">
                  <Icon name="delete" size={24} color="#FF4444" />
                </Pressable>
              )}
              {onDownload && (
                <Pressable onPress={handleDownload} style={styles.actionButton} accessibilityLabel="Download">
                  <Icon name="download" size={24} color="#666" />
                </Pressable>
              )}
            </View>
          </View>

          {/* file content and details section */}
          <ScrollView style={styles.content} contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
            {renderFileContent()}

            {!!showDetails ? (
              <View style={styles.detailsContainer}>
                <Text style={styles.detailsTitle}>File Details</Text>

                {/* file details rows */}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Name:</Text>
                  <Text style={styles.detailValue}>{metadata.name}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Size:</Text>
                  <Text style={styles.detailValue}>{formatFileSize(metadata.size)}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Type:</Text>
                  <Text style={styles.detailValue}>{metadata.type}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>UUID:</Text>
                  <Text style={styles.detailValue}>{metadata.uuid}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Folder:</Text>
                  <Text style={styles.detailValue}>
                    /{metadata.folderPath.join('/') || ''}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Encrypted:</Text>
                  <Text style={styles.detailValue}>
                    {new Date(metadata.encryptedAt).toLocaleDateString()}
                  </Text>
                </View>

                {!!(metadata.tags && metadata.tags.length > 0) ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Tags:</Text>
                    <Text style={styles.detailValue}>
                      {metadata.tags.join(', ')}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
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
    backgroundColor: '#fff',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#f9f9f9',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    // height and paddingTop set dynamically
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
    color: '#333',
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
    backgroundColor: '#fff',
  },

  unsupportedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },

  unsupportedText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
  },

  unsupportedSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },

  detailsContainer: {
    backgroundColor: '#fff',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },

  detailsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },

  detailRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },

  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    width: 80,
  },

  detailValue: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
});

export default FileViewer;
