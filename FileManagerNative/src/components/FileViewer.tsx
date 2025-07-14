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
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';

// file type renderers
import ImageFile from './FileTypes/ImageFile';
import TextFile from './FileTypes/TextFile';
import AudioFile from './FileTypes/AudioFile';
import PDFFile from './FileTypes/PDFFile';
import VideoFile from './FileTypes/VideoFile';
import { FileMetadata, FileManagerService } from '../utils/FileManagerService';

// props for file viewer
interface FileViewerProps {
  fileData: Uint8Array; // file data as bytes
  metadata: FileMetadata; // file metadata
  onClose: () => void; // callback for closing viewer
  onDownload?: () => void; // callback for download
  onDelete?: () => void; // callback for delete
  showDetails?: boolean; // whether to show file details
  onMetadataUpdated?: () => void; // callback after metadata is updated
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
  const renderFileContent = () => {
    const mimeType = metadata.type;
    let rendered;
    if (mimeType.startsWith('image/')) {
      const isPreview = !!(fileData && fileData.byteLength < 100 * 1024);
      rendered = <ImageFile fileData={fileData} mimeType={mimeType} isPreview={isPreview} />;
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
          <Icon name="insert-drive-file" size={64} color="#ccc" />
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
    Alert.alert(
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
  const [editName, setEditName] = React.useState(viewerMetadata.name);
  const [editFolderPathInput, setEditFolderPathInput] = React.useState(viewerMetadata.folderPath.join('/'));
  const [editFolderPath, setEditFolderPath] = React.useState<string[]>(viewerMetadata.folderPath);
  const [editTagInput, setEditTagInput] = React.useState('');
  const [editTags, setEditTags] = React.useState<string[]>(viewerMetadata.tags || []);

  // Reset edit fields when opening edit mode or metadata changes
  React.useEffect(() => {
    if (editing) {
      setEditName(viewerMetadata.name);
      setEditFolderPathInput(viewerMetadata.folderPath.join('/'));
      setEditFolderPath(viewerMetadata.folderPath);
      setEditTags(viewerMetadata.tags || []);
      setEditTagInput('');
    }
  }, [editing, viewerMetadata]);

  // --- Save Metadata Handler ---
  const { derivedKey } = require('../context/PasswordContext').usePasswordContext();
  const handleSaveMetadata = async () => {
    try {
      await FileManagerService.updateFileMetadata(
        metadata.uuid,
        {
          name: editName,
          folderPath: editFolderPath,
          tags: editTags,
        },
        derivedKey
      );
      // Reload updated metadata from disk
      const updatedMetadata = await FileManagerService.loadFileMetadata(metadata.uuid, derivedKey);
      setViewerMetadata(updatedMetadata);
      setEditName(updatedMetadata.name);
      setEditFolderPathInput(updatedMetadata.folderPath.join('/'));
      setEditFolderPath(updatedMetadata.folderPath);
      setEditTags(updatedMetadata.tags || []);
      setEditing(false);
      if (onMetadataUpdated) {
        onMetadataUpdated();
      }
    } catch (error) {
      console.error('[FileViewer] Failed to update metadata:', error);
      Alert.alert('Error', 'Failed to update file metadata');
    }
  };

  // --- Main Render ---
  return (
    <GlobalErrorBoundary>
      <FileViewerErrorBoundary>
        <View style={styles.container}>
          {/* header section with close, filename, and actions */}
          <View style={[styles.header, { paddingTop: insets.top || 16, minHeight: 56 + (insets.top || 16), flexDirection: 'row', alignItems: 'center' }]}> 
            <Pressable onPress={onClose} style={styles.closeButton} accessibilityLabel="Close">
              <Icon name="close" size={24} color="#666" />
            </Pressable>

            <Text style={styles.fileName} numberOfLines={1} ellipsizeMode="middle">{viewerMetadata.name}</Text>

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
                {/* Name input */}
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>Name:</Text>
                  <TextInput
                    style={{ fontSize: 14, color: '#333', backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#e0e0e0' }}
                    value={editName}
                    onChangeText={setEditName}
                    editable={true}
                  />
                </View>
                {/* Folder path input */}
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>Folder path:</Text>
                  <TextInput
                    style={{ fontSize: 14, color: '#333', backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#e0e0e0' }}
                    value={editFolderPathInput}
                    onChangeText={text => {
                      const filtered = text.replace(/[^A-Za-z0-9\/]/g, '');
                      setEditFolderPathInput(filtered);
                      const arr = filtered.split('/').filter(Boolean);
                      setEditFolderPath(arr);
                    }}
                    placeholder="e.g. photos/2025"
                    editable={true}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={{ fontSize: 13, color: '#666', marginTop: 2, marginBottom: 2 }}>
                    /{editFolderPath.join('/')}
                  </Text>
                </View>
                {/* Tags input */}
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, color: '#666', marginBottom: 4 }}>Tags:</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Icon name="label" size={20} color="#34C759" />
                    <TextInput
                      style={{ flex: 1, fontSize: 14, color: '#333', backgroundColor: '#f5f5f5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginLeft: 8, borderWidth: 1, borderColor: '#e0e0e0' }}
                      value={editTagInput}
                      onChangeText={setEditTagInput}
                      placeholder="Add a tag and press +"
                      editable={true}
                      onSubmitEditing={() => {
                        const newTag = editTagInput.trim();
                        if (newTag && !editTags.includes(newTag)) {
                          setEditTags([...editTags, newTag]);
                          setEditTagInput('');
                        }
                      }}
                      returnKeyType="done"
                    />
                    <Pressable
                      style={{ marginLeft: 8, backgroundColor: '#f5f5f5', borderRadius: 20, padding: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e0e0e0' }}
                      onPress={() => {
                        const newTag = editTagInput.trim();
                        if (newTag && !editTags.includes(newTag)) {
                          setEditTags([...editTags, newTag]);
                          setEditTagInput('');
                        }
                      }}
                    >
                      <Icon name="add" size={24} color={editTagInput.trim() ? '#007AFF' : '#ccc'} />
                    </Pressable>
                  </View>
                  {/* Show tags as chips/list */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                    {editTags.map((tag, idx) => (
                      <View key={tag + idx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#007AFF', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, marginRight: 8, marginBottom: 8 }}>
                        <Text style={{ color: '#fff', fontSize: 13, marginRight: 4 }}>{tag}</Text>
                        <Pressable
                          onPress={() => setEditTags(editTags.filter((t, i) => i !== idx))}
                          style={{ backgroundColor: '#007AFF', borderRadius: 10, padding: 2, marginLeft: 2 }}
                        >
                          <Icon name="close" size={16} color="#fff" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </View>
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
