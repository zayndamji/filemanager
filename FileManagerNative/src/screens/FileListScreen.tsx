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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFileContext } from '../context/FileContext';
import { usePasswordContext } from '../context/PasswordContext';
import { FileManagerService, EncryptedFile } from '../utils/FileManagerService';
import FileViewer from '../components/FileViewer';
import Icon from 'react-native-vector-icons/MaterialIcons';

const FileListScreen = () => {
  const { 
    encryptedFiles, 
    refreshFileList, 
    currentFolderPath, 
    setCurrentFolderPath, 
    loading 
  } = useFileContext();

  // Compute subfolders and files in current folder from encryptedFiles and currentFolderPath
  const currentPathStr = '/' + currentFolderPath.join('/');
  const normalizedCurrentPath = currentFolderPath.length === 0 ? '/' : currentPathStr;
  // Find all subfolders in current folder
  const subfoldersSet = new Set<string>();
  const filesInCurrentFolder: EncryptedFile[] = [];
  encryptedFiles.forEach(file => {
    let folderPathArr: string[] = [];
    const folderPathValue = file.metadata.folderPath;
    if (Array.isArray(folderPathValue)) {
      folderPathArr = folderPathValue;
    } else if (typeof folderPathValue === 'string' && (folderPathValue as string).length > 0) {
      folderPathArr = (folderPathValue as string).replace(/^\//, '').split('/');
    }
    const folderPathStr = '/' + folderPathArr.join('/');
    // If file is in current folder
    if (folderPathStr === normalizedCurrentPath) {
      filesInCurrentFolder.push(file);
    }
    // If file is in a subfolder of current folder, add subfolder name
    if (
      folderPathArr.length > currentFolderPath.length &&
      folderPathArr.slice(0, currentFolderPath.length).join('/') === currentFolderPath.join('/')
    ) {
      // Next subfolder name
      const nextFolder = folderPathArr[currentFolderPath.length];
      if (nextFolder) subfoldersSet.add(nextFolder);
    }
  });
  const subfolders = Array.from(subfoldersSet).sort();
  const { derivedKey } = usePasswordContext();
  const [selectedFile, setSelectedFile] = useState<EncryptedFile | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [fileData, setFileData] = useState<Uint8Array | null>(null);

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

  const handleFilePress = async (file: EncryptedFile) => {
    if (!derivedKey) {
      Alert.alert('Error', 'No derived key available. Please enter your password.');
      return;
    }
    const start = Date.now();
    try {
      const result = await FileManagerService.loadEncryptedFile(file.uuid, derivedKey);
      setSelectedFile(file);
      setFileData(result.fileData);
      setViewerVisible(true);
      const end = Date.now();
      console.log('[FileListScreen] handleFilePress: Loaded file', { uuid: file.uuid, durationMs: end - start, timestamp: end });
    } catch (error) {
      console.error('[FileListScreen] Error loading file:', error);
      Alert.alert('Error', 'Failed to load file. Please check your password.');
    }
  };

  const handleDeleteFile = async (file: EncryptedFile) => {
    const start = Date.now();
    try {
      const success = await FileManagerService.deleteEncryptedFile(file.uuid);
      if (success) {
        Alert.alert('Success', 'File deleted successfully');
        await refreshFileList();
        const end = Date.now();
        console.log('[FileListScreen] handleDeleteFile: Deleted file', { uuid: file.uuid, durationMs: end - start, timestamp: end });
      } else {
        Alert.alert('Error', 'Failed to delete file');
      }
    } catch (error) {
      console.error('[FileListScreen] Error deleting file:', error);
      Alert.alert('Error', 'Failed to delete file');
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
    Alert.alert(
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
        <Icon
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
        <Icon name="folder" size={24} color="#34C759" />
      </View>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName}>{item}</Text>
        <Text style={styles.fileDetails}>Folder</Text>
      </View>
      <View style={styles.chevron}>
        <Icon name="chevron-right" size={20} color="#ccc" />
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="folder-open" size={64} color="#ccc" />
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
              <Icon name="arrow-upward" size={16} color="#007AFF" />
              <Text style={styles.upButtonText}>Up</Text>
            </TouchableOpacity>
          )}
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
          />
        )}
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  titleContainer: {
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  breadcrumbLabel: {
    fontSize: 12,
    color: '#666',
  },
  breadcrumbPath: {
    fontSize: 12,
    color: '#007AFF',
    fontFamily: 'Menlo',
  },
  upButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
  },
  upButtonText: {
    fontSize: 12,
    color: '#007AFF',
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
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: '#000',
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
    color: '#333',
    marginBottom: 4,
  },
  fileDetails: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  fileDate: {
    fontSize: 12,
    color: '#999',
  },
  encryptedBadge: {
    marginLeft: 8,
  },
  chevron: {
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
});

export default FileListScreen;
