import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// Conditionally import native-only libraries
let DocumentPicker: any = null;
let launchImageLibrary: any = null;
let RNFS: any = null;

if (Platform.OS !== 'web') {
  try {
    DocumentPicker = require('react-native-document-picker').default;
    const ImagePicker = require('react-native-image-picker');
    launchImageLibrary = ImagePicker.launchImageLibrary;
    RNFS = require('react-native-fs');
  } catch (e) {
    console.warn('Failed to load native libraries:', e);
  }
}

import { useFileContext } from '../context/FileContext';
import { usePasswordContext } from '../context/PasswordContext';
import { FileManagerService } from '../utils/FileManagerService';
import * as FileSystem from '../utils/FileSystem';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { ThemeContext } from '../theme';
import MetadataEditor from '../components/MetadataEditor/MetadataEditor';
import { useMetadataEditor } from '../components/MetadataEditor/useMetadataEditor';

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
  content: {
    flex: 1,
  },
  uploadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: theme.surface,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  uploadingText: {
    fontSize: 16,
    color: theme.textSecondary,
    marginTop: 12,
  },
  optionsContainer: {
    padding: 20,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    padding: 20,
    marginBottom: 12,
    borderRadius: 12,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    backgroundColor: theme.surface,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 4,
  },
  optionSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  chevron: {
    marginLeft: 8,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.surface,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoText: {
    fontSize: 14,
    color: theme.textSecondary,
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
  folderInputContainer: {
    backgroundColor: theme.surface,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    padding: 12,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  folderInput: {
    fontSize: 14,
    color: theme.text,
    backgroundColor: theme.inputBackground,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: theme.inputBorder,
    marginBottom: 8,
  },
  folderPathPreview: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 2,
    marginBottom: 2,
  },
  folderSelectorContainer: {
    backgroundColor: theme.surface,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    padding: 12,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  folderSelectorLabel: {
    color: theme.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
  },
  folderChip: {
    alignItems: 'center',
    backgroundColor: theme.chipBackground,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 4,
  },
  selectedFolderChip: {
    backgroundColor: theme.accent,
  },
  folderChipText: {
    color: theme.chipText,
    fontSize: 13,
    marginRight: 4,
  },
  selectedFolderChipText: {
    color: theme.chipText,
    fontWeight: '600',
  },
  addTagButton: {
    marginLeft: 8,
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.chipBackground,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 8,
  },
  tagChipText: {
    color: theme.chipText,
    fontSize: 13,
    marginRight: 4,
  },
  removeTagButton: {
    backgroundColor: theme.accent,
    borderRadius: 10,
    padding: 2,
    marginLeft: 2,
  },
  tagsInputContainer: {
    backgroundColor: theme.surface,
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 8,
    borderRadius: 12,
    padding: 12,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  tagsInputLabel: {
    fontSize: 14,
    color: theme.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
  },
  tagsInput: {
    flex: 1,
    fontSize: 14,
    color: theme.text,
    backgroundColor: theme.inputBackground,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: theme.inputBorder,
  },
  pendingFilesContainer: {
    backgroundColor: theme.surface,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    padding: 16,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  pendingFilesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.text,
    marginBottom: 8,
  },
  pendingFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  pendingFileName: {
    fontSize: 14,
    color: theme.text,
    marginLeft: 8,
    flex: 1,
  },
  pendingFileType: {
    fontSize: 12,
    color: theme.textSecondary,
    marginLeft: 8,
  },
  uploadAllButton: {
    backgroundColor: theme.accent,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  uploadAllButtonText: {
    color: theme.chipText,
    fontSize: 16,
    fontWeight: '600',
  },
});

const UploadScreen = () => {
  const { refreshFileList, encryptedFiles } = useFileContext();
  const { password, derivedKey } = usePasswordContext();
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Array<{ uri: string; name: string; type: string; size?: number; webFile?: File }>>([]);
  // Use unified metadata editor for folder path and tags
  const metaEditor = useMetadataEditor({
    initialName: '', // not used in upload
    initialFolderPath: '',
    initialTags: [],
  });
  const { theme } = React.useContext(ThemeContext);
  const styles = getStyles(theme);

  const handleDocumentPicker = async () => {
    // Use strict platform detection - only web if Platform.OS is explicitly 'web'
    if (Platform.OS === 'web') {
      console.log('[UploadScreen] Using web document picker');
      // On web, use HTML file input for document selection
      const win: any = (global as any).window || (global as any);
      if (win && win.document) {
        const input = win.document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.onchange = (event: any) => {
          const files = Array.from(event.target.files || []);
          if (files.length > 0) {
            const newFiles = files.map((file: any) => ({
              name: file.name,
              type: file.type,
              size: file.size,
              uri: '', // Will be handled differently on web
              webFile: file, // Store the actual File object for web
            }));
            setPendingFiles(prev => [...prev, ...newFiles]);
          }
        };
        input.click();
      } else {
        Alert.alert('Error', 'File picker not available in this environment');
      }
      return;
    }

    if (!DocumentPicker) {
      Alert.alert('Error', 'Document picker not available on this platform');
      return;
    }

    try {
      const result = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.allFiles],
      });
      setPendingFiles(prev => [...prev, {
        uri: result.uri,
        name: result.name || 'unknown',
        type: result.type || 'application/octet-stream',
      }]);
    } catch (error) {
      if (DocumentPicker.isCancel(error)) {
        console.log('User cancelled document picker');
      } else {
        console.error('DocumentPicker Error:', error);
        Alert.alert('Error', 'Failed to pick document');
      }
    }
  };

  const handleImagePicker = () => {
    // Debug log to check platform detection
    console.log('[UploadScreen] handleImagePicker called, Platform.OS:', Platform.OS);
    
    // Use strict platform detection - only web if Platform.OS is explicitly 'web'
    if (Platform.OS === 'web') {
      console.log('[UploadScreen] Using web file picker');
      // On web, use HTML file input for image selection
      const win: any = (global as any).window || (global as any);
      if (win && win.document) {
        const input = win.document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = (event: any) => {
          const files = Array.from(event.target.files || []);
          if (files.length > 0) {
            const newFiles = files.map((file: any) => ({
              name: file.name,
              type: file.type,
              size: file.size,
              uri: '', // Will be handled differently on web
              webFile: file, // Store the actual File object for web
            }));
            setPendingFiles(prev => [...prev, ...newFiles]);
          }
        };
        input.click();
      } else {
        Alert.alert('Error', 'File picker not available in this environment');
      }
      return;
    }

    console.log('[UploadScreen] Using native image picker, launchImageLibrary available:', !!launchImageLibrary);
    
    if (!launchImageLibrary) {
      Alert.alert('Error', 'Image picker not available on this platform');
      return;
    }

    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.5,
        includeBase64: false,
        selectionLimit: 0,
      },
      // @ts-ignore
      (response) => {
        if (response.didCancel) {
          // User cancelled image picker
          return;
        }
        if (response.errorCode) {
          Alert.alert('Error', 'Image picker error: ' + response.errorMessage);
          return;
        }
        if (Array.isArray(response.assets) && response.assets.length > 0) {
          setPendingFiles(prev => [
            ...prev, // @ts-ignore
            ...response.assets?.filter(asset => asset && asset.uri) // @ts-ignore
              .map(asset => ({
                uri: asset.uri!,
                name: asset.fileName || 'image.jpg',
                type: asset.type || 'image/jpeg',
              })) ?? []
          ]);
        }
      }
    );
  };

  const handleVideoPicker = () => {
    // Debug log to check platform detection
    console.log('[UploadScreen] handleVideoPicker called, Platform.OS:', Platform.OS);
    
    // Use strict platform detection - only web if Platform.OS is explicitly 'web'
    if (Platform.OS === 'web') {
      console.log('[UploadScreen] Using web video picker');
      // On web, use HTML file input for video selection
      const win: any = (global as any).window || (global as any);
      if (win && win.document) {
        const input = win.document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*';
        input.multiple = true;
        input.onchange = (event: any) => {
          const files = Array.from(event.target.files || []);
          if (files.length > 0) {
            const newFiles = files.map((file: any) => ({
              name: file.name,
              type: file.type,
              size: file.size,
              uri: '', // Will be handled differently on web
              webFile: file, // Store the actual File object for web
            }));
            setPendingFiles(prev => [...prev, ...newFiles]);
          }
        };
        input.click();
      } else {
        Alert.alert('Error', 'File picker not available in this environment');
      }
      return;
    }

    console.log('[UploadScreen] Using native video picker, launchImageLibrary available:', !!launchImageLibrary);
    
    if (!launchImageLibrary) {
      Alert.alert('Error', 'Video picker not available on this platform');
      return;
    }

    launchImageLibrary(
      {
        mediaType: 'video',
        quality: 0.8,
        includeBase64: false,
      },
      // @ts-ignore
      (response) => {
        if (response.assets && response.assets[0]) {
          const asset = response.assets[0];
          setPendingFiles(prev => [...prev, {
            uri: asset.uri!,
            name: asset.fileName || 'video.mp4',
            type: asset.type || 'video/mp4',
          }]);
        }
      }
    );
  };

  const encryptAndSaveAllFiles = async () => {
    if (!derivedKey) {
      Alert.alert('Error', 'No derived key available. Please enter your password.');
      return;
    }
    setUploading(true);
    try {
      for (const file of pendingFiles) {
        // Read file data using cross-platform approach
        let fileData: Uint8Array;
        
        if ((Platform as any).OS === 'web' && file.webFile) {
          // On web, read from the File object directly
          try {
            const arrayBuffer = await file.webFile.arrayBuffer();
            fileData = new Uint8Array(arrayBuffer);
          } catch (error) {
            console.error('Failed to read web file:', error);
            fileData = new Uint8Array();
          }
        } else if (file.uri) {
          if ((Platform as any).OS === 'web') {
            // On web, URI might be a blob URL from file picker
            try {
              const response = await fetch(file.uri);
              const arrayBuffer = await response.arrayBuffer();
              fileData = new Uint8Array(arrayBuffer);
            } catch (error) {
              console.error('Failed to read file on web:', error);
              // Fallback to empty data
              fileData = new Uint8Array();
            }
          } else {
            // On native, use RNFS to read the file
            try {
              if (RNFS) {
                const base64 = await RNFS.readFile(file.uri, 'base64');
                fileData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
              } else {
                console.error('RNFS not available on native platform');
                fileData = new Uint8Array();
              }
            } catch (error) {
              console.error('Failed to read file on native:', error);
              fileData = new Uint8Array();
            }
          }
        } else {
          fileData = new Uint8Array();
        }
        await FileManagerService.saveEncryptedFile(
          fileData,
          file.name,
          file.type,
          derivedKey,
          metaEditor.folderPath.split('/').filter(Boolean),
          metaEditor.tags
        );
      }
      Alert.alert('Success', `Uploaded and encrypted ${pendingFiles.length} file(s) successfully`);
      setPendingFiles([]);
      metaEditor.setTags([]);
      metaEditor.setFolderPath('');
      await refreshFileList();
    } catch (error) {
      console.error('File upload error:', error);
      Alert.alert('Error', 'Failed to upload and encrypt files');
    } finally {
      setUploading(false);
    }
  };

  const uploadOptions = [
    {
      id: 'document',
      title: 'Documents',
      subtitle: 'Upload PDFs, text files, and other documents',
      icon: 'description',
      color: '#007AFF',
      onPress: handleDocumentPicker,
    },
    {
      id: 'image',
      title: 'Images',
      subtitle: 'Upload photos and images from your gallery',
      icon: 'image',
      color: '#34C759',
      onPress: handleImagePicker,
    },
    {
      id: 'video',
      title: 'Videos',
      subtitle: 'Upload video files from your gallery',
      icon: 'video-library',
      color: '#FF9500',
      onPress: handleVideoPicker,
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Upload Files</Text>
        <Text style={styles.subtitle}>
          Files will be encrypted and saved to: /{metaEditor.folderPath.split('/').filter(Boolean).join('/')}
        </Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {uploading && (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="large" color={theme.accent} />
            <Text style={styles.uploadingText}>Encrypting and uploading files...</Text>
          </View>
        )}

        <View style={styles.optionsContainer}>
          {uploadOptions.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[styles.optionCard, { opacity: uploading ? 0.5 : 1 }]}
              onPress={option.onPress}
              disabled={uploading}
            >
              <View style={[styles.optionIcon, { backgroundColor: option.color }]}> 
                <Icon name={option.icon} size={28} color={theme.chipText} />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
              </View>
              <View style={styles.chevron}>
                <Icon name="chevron-right" size={20} color="#ccc" />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Unified MetadataEditor for folder path and tags */}
        {pendingFiles.length > 0 && (
          <>
            <MetadataEditor
              folderPath={metaEditor.folderPath}
              tags={metaEditor.tags}
              onFolderPathChange={metaEditor.setFolderPath}
              onTagsChange={metaEditor.setTags}
              editable={!uploading}
              // name and onNameChange omitted for upload
            />
            {/* Folder path preview now handled inside MetadataEditor */}
            <View style={styles.pendingFilesContainer}>
              <Text style={styles.pendingFilesTitle}>Files to upload:</Text>
              {pendingFiles.map((file, idx) => (
                <View key={file.uri + idx} style={styles.pendingFileRow}>
                  <Icon name="insert-drive-file" size={20} color={theme.accent} />
                  <Text style={styles.pendingFileName}>{file.name}</Text>
                  <Text style={styles.pendingFileType}>{file.type}</Text>
                </View>
              ))}
              <TouchableOpacity
                style={styles.uploadAllButton}
                onPress={encryptAndSaveAllFiles}
                disabled={uploading}
              >
                <Text style={styles.uploadAllButtonText}>Upload & Encrypt All</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <View style={styles.infoContainer}>
          <Icon name="security" size={20} color={theme.accentSecondary} />
          <Text style={styles.infoText}>
            All files are automatically encrypted with AES-256 encryption before being stored. 
            Your files are secured with your password and cannot be accessed without it.
          </Text>
        </View>

        <View style={styles.infoContainer}>
          <Icon name="info" size={20} color={theme.textSecondary} />
          <Text style={styles.infoText}>
            Files are stored locally on your device in encrypted format. 
            Make sure to remember your password as it cannot be recovered.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default UploadScreen;
