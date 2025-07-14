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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentPicker from 'react-native-document-picker';
import { launchImageLibrary } from 'react-native-image-picker';
import { useFileContext } from '../context/FileContext';
import { usePasswordContext } from '../context/PasswordContext';
import { FileManagerService } from '../utils/FileManagerService';
import Icon from 'react-native-vector-icons/MaterialIcons';
import RNFS from 'react-native-fs';
import { ThemeContext } from '../theme';

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

const FolderPathSelector = ({ encryptedFiles, selectedPath, setSelectedPath, disabled, styles }: {
  encryptedFiles: any[],
  selectedPath: string[],
  setSelectedPath: (path: string[]) => void,
  disabled?: boolean,
  styles: ReturnType<typeof getStyles>
}) => {
  const [paths, setPaths] = useState<string[][]>([]);
  useEffect(() => {
    // Collect all folder paths from file metadata
    const allPaths: Set<string> = new Set();
    encryptedFiles.forEach(file => {
      if (Array.isArray(file.metadata.folderPath)) {
        allPaths.add('/' + file.metadata.folderPath.join('/'));
      } else if (typeof file.metadata.folderPath === 'string') {
        allPaths.add(file.metadata.folderPath);
      }
    });
    // Always include root
    allPaths.add('/');
    // Convert to array of arrays
    setPaths(Array.from(allPaths).map(p => p === '/' ? [] : p.replace(/^\//, '').split('/')));
  }, [encryptedFiles]);

  return (
    <View style={styles.folderSelectorContainer}>
      <Text style={styles.folderSelectorLabel}>Upload to folder:</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
        {paths.map((pathArr, idx) => {
          const isSelected = JSON.stringify(pathArr) === JSON.stringify(selectedPath);
          const display = pathArr.length === 0 ? '/' : '/' + pathArr.join('/');
          return (
            <TouchableOpacity
              key={display + idx}
              style={[styles.folderChip, isSelected && styles.selectedFolderChip]}
              onPress={() => setSelectedPath(pathArr)}
              disabled={disabled}
            >
              <Text style={[styles.folderChipText, isSelected && styles.selectedFolderChipText]}>{display}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const UploadScreen = () => {
  const { refreshFileList, encryptedFiles } = useFileContext();
  const { password, derivedKey } = usePasswordContext();
  const [uploading, setUploading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<Array<{ uri: string; name: string; type: string }>>([]);
  const [tagInput, setTagInput] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string[]>([]);
  const [folderPathInput, setFolderPathInput] = useState('');
  const { theme } = React.useContext(ThemeContext);
  const styles = getStyles(theme);

  const handleDocumentPicker = async () => {
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
    launchImageLibrary(
      {
        mediaType: 'photo',
        quality: 0.5,
        includeBase64: false,
        selectionLimit: 0,
      },
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
            ...prev,
            ...response.assets?.filter(asset => asset && asset.uri)
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
    launchImageLibrary(
      {
        mediaType: 'video',
        quality: 0.8,
        includeBase64: false,
      },
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
        // Read file data
        const fileData = await RNFS.readFile(file.uri, 'base64');
        const uint8Array = new Uint8Array(
          atob(fileData)
            .split('')
            .map(char => char.charCodeAt(0))
        );
        await FileManagerService.saveEncryptedFile(
          uint8Array,
          file.name,
          file.type,
          derivedKey,
          selectedFolderPath,
          tags
        );
      }
      Alert.alert('Success', `Uploaded and encrypted ${pendingFiles.length} file(s) successfully`);
      setPendingFiles([]);
      setTags([]);
      setTagInput('');
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
          Files will be encrypted and saved to: /{selectedFolderPath.length === 0 ? '' : selectedFolderPath.join('/')}
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

        {/* Folder path input above tags input */}
        {pendingFiles.length > 0 && (
          <>
            <View style={styles.folderInputContainer}>
              <Text style={styles.folderSelectorLabel}>Folder path:</Text>
              <TextInput
                style={styles.folderInput}
                value={folderPathInput}
                onChangeText={text => {
                  // Only allow /, A-Z, a-z, 0-9
                  const filtered = text.replace(/[^A-Za-z0-9\/]/g, '');
                  setFolderPathInput(filtered);
                  // Split by /, filter out empty
                  const arr = filtered.split('/').filter(Boolean);
                  setSelectedFolderPath(arr);
                }}
                placeholder="e.g. photos/2025"
                editable={!uploading}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
              />
              <Text style={styles.folderPathPreview}>
                Uploading to: /{selectedFolderPath.join('/')}
              </Text>
            </View>
            <View style={styles.tagsInputContainer}>
              <Text style={styles.tagsInputLabel}>Tags:</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name="label" size={20} color={theme.accentSecondary} />
                <TextInput
                  style={styles.tagsInput}
                  value={tagInput}
                  onChangeText={setTagInput}
                  placeholder="Add a tag and press +"
                  editable={!uploading}
                  onSubmitEditing={() => {
                    const newTag = tagInput.trim();
                    if (newTag && !tags.includes(newTag)) {
                      setTags([...tags, newTag]);
                      setTagInput('');
                    }
                  }}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={styles.addTagButton}
                  onPress={() => {
                    const newTag = tagInput.trim();
                    if (newTag && !tags.includes(newTag)) {
                      setTags([...tags, newTag]);
                      setTagInput('');
                    }
                  }}
                  disabled={uploading || !tagInput.trim()}
                >
                  <Icon name="add" size={24} color={uploading || !tagInput.trim() ? theme.disabled : theme.accent} />
                </TouchableOpacity>
              </View>
              {/* Show tags as chips/list */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                {tags.map((tag, idx) => (
                  <View key={tag + idx} style={styles.tagChip}>
                    <Text style={styles.tagChipText}>{tag}</Text>
                    <TouchableOpacity
                      onPress={() => setTags(tags.filter((t, i) => i !== idx))}
                      style={styles.removeTagButton}
                      disabled={uploading}
                    >
                      <Icon name="close" size={16} color={theme.chipText} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
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

        <FolderPathSelector
          encryptedFiles={encryptedFiles}
          selectedPath={selectedFolderPath}
          setSelectedPath={setSelectedFolderPath}
          disabled={uploading}
          styles={styles}
        />

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
