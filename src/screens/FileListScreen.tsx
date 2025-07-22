import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFileContext } from '../context/FileContext';
import { EncryptedFile } from '../utils/FileManagerService';
import { useFileManagerService } from '../hooks/useFileManagerService';
import FileViewer from '../components/FileViewer';
import WebCompatibleIcon from '../components/WebCompatibleIcon';
import SortDropdown from '../components/SortDropdown';
import { ThemeContext } from '../theme';
import { showAlert } from '../utils/AlertUtils';

const getStyles = (theme: typeof import('../theme').darkTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    padding: 20,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  titleContainer: {
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.text,
  },
  subtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 4,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  breadcrumbLabel: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  breadcrumbPath: {
    fontSize: 12,
    color: theme.accent,
    fontFamily: 'Menlo',
  },
  upButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: theme.surface,
    borderRadius: 4,
  },
  upButtonText: {
    fontSize: 12,
    color: theme.accent,
    marginLeft: 4,
  },
  listContainer: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  fileIcon: {
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 4,
  },
  fileDetails: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 2,
  },
  fileDate: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  encryptedBadge: {
    marginLeft: 8,
  },
  chevron: {
    marginLeft: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 8,
  },
});

const FileListScreen = () => {
  const { 
    encryptedFiles, 
    refreshFileList, 
    currentFolderPath, 
    setCurrentFolderPath, 
    loading,
    sortBy,
    setSortBy,
    filesInCurrentFolder,
    subfolders
  } = useFileContext();
  const fileManagerService = useFileManagerService();
  const [selectedFile, setSelectedFile] = useState<EncryptedFile | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [isPreviewData, setIsPreviewData] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);
  const { theme } = React.useContext(ThemeContext);
  const styles = getStyles(theme);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    switch (type.toLowerCase().split('/')[0]) {
      case 'image':
        return 'image';
      case 'video':
        return 'video-library';
      case 'audio':
        return 'music-note';
      case 'application':
        if (type.includes('pdf')) return 'picture-as-pdf';
        return 'description';
      case 'text':
        return 'text-snippet';
      default:
        return 'insert-drive-file';
    }
  };

  // Navigation functions for file viewer
  const navigateToNextFile = () => {
    if (filesInCurrentFolder.length === 0) return;
    
    const nextIndex = (currentFileIndex + 1) % filesInCurrentFolder.length;
    const nextFile = filesInCurrentFolder[nextIndex];
    setCurrentFileIndex(nextIndex);
    handleFilePress(nextFile);
  };

  const navigateToPrevFile = () => {
    if (filesInCurrentFolder.length === 0) return;
    
    const prevIndex = currentFileIndex === 0 ? filesInCurrentFolder.length - 1 : currentFileIndex - 1;
    const prevFile = filesInCurrentFolder[prevIndex];
    setCurrentFileIndex(prevIndex);
    handleFilePress(prevFile);
  };

  const handleFilePress = async (file: EncryptedFile) => {
    // Set the current file index for navigation
    const fileIndex = filesInCurrentFolder.findIndex(f => f.uuid === file.uuid);
    if (fileIndex >= 0) {
      setCurrentFileIndex(fileIndex);
    }
    
    const start = Date.now();
    
    // For all video files, skip loading here and let FileViewer handle it
    const isVideo = file.metadata.type.startsWith('video/');
    
    if (isVideo) {
      console.log('[FileListScreen] Opening video file in viewer without pre-loading:', file.metadata.name);
      setSelectedFile(file);
      setFileData(new Uint8Array(0)); // Empty data, FileViewer will handle loading
      setIsPreviewData(false);
      setViewerVisible(true);
      return;
    }

    try {
      // For image files, try to load preview first for faster initial display
      if (file.metadata.type.startsWith('image/')) {
        const previewData = await fileManagerService.getFilePreview(file.uuid);
        if (previewData) {
          setSelectedFile(file);
          setFileData(previewData);
          setIsPreviewData(true);
          setViewerVisible(true);
          const end = Date.now();
          console.log('[FileListScreen] handleFilePress: Loaded image preview', { uuid: file.uuid, durationMs: end - start, timestamp: end });
          return;
        }
      }
      
      // Fallback to loading full file for non-videos/non-images or when preview is not available
      const result = await fileManagerService.loadEncryptedFile(file.uuid);
      setSelectedFile(file);
      setFileData(result.fileData);
      setIsPreviewData(false);
      setViewerVisible(true);
      const end = Date.now();
      console.log('[FileListScreen] handleFilePress: Loaded file', { uuid: file.uuid, durationMs: end - start, timestamp: end });
    } catch (error) {
      console.error('[FileListScreen] Error loading file:', error);
      showAlert('Error', 'Failed to load file. Please check your password.');
    }
  };  const handleDeleteFile = async (file: EncryptedFile) => {
    const start = Date.now();
    try {
      const success = await fileManagerService.deleteEncryptedFile(file.uuid);
      if (success) {
        showAlert('Success', 'File deleted successfully');
        await refreshFileList();
        const end = Date.now();
        console.log('[FileListScreen] handleDeleteFile: Deleted file', { uuid: file.uuid, durationMs: end - start, timestamp: end });
      } else {
        showAlert('Error', 'Failed to delete file');
      }
    } catch (error) {
      console.error('[FileListScreen] Error deleting file:', error);
      showAlert('Error', 'Failed to delete file');
    }
  };

  const handleFileLongPress = (file: EncryptedFile) => {
    let folderPathArr: string[] = [];
    const folderPathValue = file.metadata.folderPath;
    if (Array.isArray(folderPathValue)) {
      folderPathArr = folderPathValue;
    } else if (typeof folderPathValue === 'string' && (folderPathValue as string).length > 0) {
      folderPathArr = (folderPathValue as string).replace(/^\//, '').split('/');
    }
    showAlert(
      file.metadata.name,
      `Size: ${formatFileSize(file.metadata.size)}\nType: ${file.metadata.type}\nFolder: /${folderPathArr.join('/')}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'View', onPress: () => handleFilePress(file) },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteFile(file) },
      ]
    );
  };

  const navigateToSubfolder = (folderName: string) => {
    setCurrentFolderPath([...currentFolderPath, folderName]);
  };

  const navigateUp = () => {
    setCurrentFolderPath(currentFolderPath.slice(0, -1));
  };

  const renderFileItem = ({ item }: { item: EncryptedFile }) => (
    <TouchableOpacity
      style={styles.fileItem}
      onPress={() => handleFilePress(item)}
      onLongPress={() => handleFileLongPress(item)}
    >
      <View style={styles.fileIcon}>
        <WebCompatibleIcon
          name={getFileIcon(item.metadata.type)}
          size={24}
          color="#007AFF"
        />
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {item.metadata.name}
        </Text>
        <Text style={styles.fileDetails}>
          {formatFileSize(item.metadata.size)} • {item.metadata.type.split('/')[0].toUpperCase()}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderFolderItem = ({ item }: { item: string }) => (
    <TouchableOpacity
      style={styles.folderItem}
      onPress={() => navigateToSubfolder(item)}
    >
      <View style={styles.fileIcon}>
        <WebCompatibleIcon name="folder" size={24} color="#34C759" />
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName}>{item}</Text>
        <Text style={styles.fileDetails}>Folder</Text>
      </View>
      <View style={styles.chevron}>
        <WebCompatibleIcon name="chevron-right" size={20} color="#ccc" />
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <WebCompatibleIcon name="folder-open" size={64} color="#ccc" />
      <Text style={styles.emptyText}>No files found</Text>
      <Text style={styles.emptySubtext}>Upload some files to get started</Text>
    </View>
  );

  const allItems = [
    ...subfolders.map(folder => ({ type: 'folder', name: folder })),
    ...filesInCurrentFolder.map(file => ({ type: 'file', data: file }))
  ];

  const renderItem = ({ item }: { item: any }) => {
    if (item.type === 'folder') {
      return renderFolderItem({ item: item.name });
    } else {
      return renderFileItem({ item: item.data });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Files</Text>
          <Text style={styles.subtitle}>
            {encryptedFiles.length} encrypted files
          </Text>
        </View>
        
        {/* Breadcrumb */}
        <View style={styles.breadcrumb}>
          <Text style={styles.breadcrumbLabel}>Path: </Text>
          <Text style={styles.breadcrumbPath}>
            /{currentFolderPath.join('/')}
          </Text>
          {currentFolderPath.length > 0 && (
            <TouchableOpacity onPress={navigateUp} style={styles.upButton}>
              <WebCompatibleIcon name="arrow-upward" size={16} color="#007AFF" />
              <Text style={styles.upButtonText}>Up</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Header Controls */}
        <View style={styles.headerControls}>
          <View /> {/* Empty spacer for alignment */}
          <SortDropdown 
            sortBy={sortBy}
            onSortChange={setSortBy}
            theme={theme}
          />
        </View>
      </View>

      <FlatList
        data={allItems}
        renderItem={renderItem}
        keyExtractor={(item, index) => 
          item.type === 'folder' ? `folder-${(item as any).name}` : `file-${(item as any).data.uuid}`
        }
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshFileList} />
        }
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={allItems.length === 0 ? styles.emptyContainer : styles.listContainer}
      />

      {/* File Viewer Modal */}
      <Modal
        visible={viewerVisible}
        animationType="slide"
        onRequestClose={() => setViewerVisible(false)}
      >
        {selectedFile && fileData && (
          <FileViewer
            fileData={fileData}
            metadata={selectedFile.metadata}
            onClose={() => setViewerVisible(false)}
            onDelete={() => {
              setViewerVisible(false);
              handleDeleteFile(selectedFile);
            }}
            onMetadataUpdated={refreshFileList}
            isPreviewData={isPreviewData}
            onNavigateNext={navigateToNextFile}
            onNavigatePrev={navigateToPrevFile}
            hasNext={filesInCurrentFolder.length > 1}
            hasPrev={filesInCurrentFolder.length > 1}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
};

export default FileListScreen;
