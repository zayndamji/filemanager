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
import { showAlert } from '../utils/AlertUtils';

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
import { useFileManagerService } from '../hooks/useFileManagerService';
import WebCompatibleIcon from '../components/WebCompatibleIcon';
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
  const fileManagerService = useFileManagerService();
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

  // Add state to prevent multiple concurrent picker operations
  const [isPickerActive, setIsPickerActive] = useState(false);

  console.log('[UploadScreen] Component rendered, pendingFiles count:', pendingFiles.length);

  // Cleanup function to remove temporary files created by ImagePicker
  const cleanupTempFiles = async () => {
    if (Platform.OS === 'web' || !RNFS) return;
    
    try {
      // Clean up react-native-image-picker temp files from the app's temp directory
      // ImagePicker stores files directly in TemporaryDirectoryPath, not in a subdirectory
      const tempDir = RNFS.TemporaryDirectoryPath;
      const tempDirExists = await RNFS.exists(tempDir);
      
      if (tempDirExists) {
        const files = await RNFS.readDir(tempDir);
        
        // Filter for image picker temp files (they usually have specific patterns)
        const imagePickerFiles = files.filter((file: any) => 
          // Image picker files typically have these patterns:
          file.name.includes('react-native-image-picker') ||
          file.name.includes('image_picker_') ||
          file.name.startsWith('tmp_') ||
          // Also clean up any image files that might be temporary
          (file.isFile() && /\.(jpg|jpeg|png|gif|heic|webp|mp4|mov|avi)$/i.test(file.name))
        );
        
        console.log(`[UploadScreen] Cleaning up ${imagePickerFiles.length} temporary files from ImagePicker`);
        
        // Delete the filtered temp files
        for (const file of imagePickerFiles) {
          try {
            await RNFS.unlink(file.path);
            console.log(`[UploadScreen] Deleted temp file: ${file.name}`);
          } catch (error) {
            console.warn(`[UploadScreen] Failed to delete temp file ${file.name}:`, error);
          }
        }
      }
    } catch (error) {
      console.warn('[UploadScreen] Error during temp file cleanup:', error);
    }
  };

  // Cleanup temp files when component unmounts
  useEffect(() => {
    return () => {
      cleanupTempFiles();
    };
  }, []);

  const handleDocumentPicker = async () => {
    console.log('[UploadScreen] handleDocumentPicker called, isPickerActive:', isPickerActive);
    
    // Prevent multiple concurrent picker operations
    if (isPickerActive) {
      console.log('[UploadScreen] Picker already active, ignoring request');
      return;
    }

    try {
      setIsPickerActive(true);
      console.log('[UploadScreen] Set picker active to true');

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
            console.log('[UploadScreen] Web document picker onChange triggered');
            const files = Array.from(event.target.files || []);
            console.log('[UploadScreen] Selected files count:', files.length);
            if (files.length > 0) {
              const newFiles = files.map((file: any) => ({
                name: file.name,
                type: file.type,
                size: file.size,
                uri: '', // Will be handled differently on web
                webFile: file, // Store the actual File object for web
              }));
              console.log('[UploadScreen] Adding files to pending list:', newFiles.map(f => f.name));
              setPendingFiles(prev => [...prev, ...newFiles]);
            }
            setIsPickerActive(false);
          };
          input.click();
        } else {
          console.error('[UploadScreen] Web environment not available');
          showAlert('Error', 'File picker not available in this environment');
          setIsPickerActive(false);
        }
        return;
      }

      if (!DocumentPicker) {
        console.error('[UploadScreen] DocumentPicker not available');
        showAlert('Error', 'Document picker not available on this platform');
        setIsPickerActive(false);
        return;
      }

      console.log('[UploadScreen] Launching native document picker');
      const result = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.allFiles],
      });
      
      console.log('[UploadScreen] Document picker result:', {
        uri: result.uri,
        name: result.name,
        type: result.type,
        size: result.size
      });
      
      setPendingFiles(prev => [...prev, {
        uri: result.uri,
        name: result.name || 'unknown',
        type: result.type || 'application/octet-stream',
      }]);
      
      console.log('[UploadScreen] Document added to pending files');
    } catch (error) {
      console.log('[UploadScreen] Document picker error or cancellation:', error);
      if (DocumentPicker && DocumentPicker.isCancel && DocumentPicker.isCancel(error)) {
        console.log('[UploadScreen] User cancelled document picker');
      } else {
        console.error('[UploadScreen] DocumentPicker Error:', error);
        showAlert('Error', 'Failed to pick document');
      }
    } finally {
      setIsPickerActive(false);
      console.log('[UploadScreen] Set picker active to false');
    }
  };

  const handleImagePicker = () => {
    // Debug log to check platform detection
    console.log('[UploadScreen] handleImagePicker called, Platform.OS:', Platform.OS, 'isPickerActive:', isPickerActive);
    
    // Prevent multiple concurrent picker operations
    if (isPickerActive) {
      console.log('[UploadScreen] Picker already active, ignoring image picker request');
      return;
    }

    try {
      setIsPickerActive(true);
      console.log('[UploadScreen] Set image picker active to true');

      // Use strict platform detection - only web if Platform.OS is explicitly 'web'
      if (Platform.OS === 'web') {
        console.log('[UploadScreen] Using web file picker for images');
        // On web, use HTML file input for image selection
        const win: any = (global as any).window || (global as any);
        if (win && win.document) {
          const input = win.document.createElement('input');
          input.type = 'file';
          input.accept = 'image/*';
          input.multiple = true;
          input.onchange = (event: any) => {
            console.log('[UploadScreen] Web image picker onChange triggered');
            const files = Array.from(event.target.files || []);
            console.log('[UploadScreen] Selected image files count:', files.length);
            if (files.length > 0) {
              const newFiles = files.map((file: any) => ({
                name: file.name,
                type: file.type,
                size: file.size,
                uri: '', // Will be handled differently on web
                webFile: file, // Store the actual File object for web
              }));
              console.log('[UploadScreen] Adding image files to pending list:', newFiles.map(f => f.name));
              setPendingFiles(prev => [...prev, ...newFiles]);
            }
            setIsPickerActive(false);
            console.log('[UploadScreen] Web image picker completed, set active to false');
          };
          input.click();
        } else {
          console.error('[UploadScreen] Web environment not available for image picker');
          showAlert('Error', 'File picker not available in this environment');
          setIsPickerActive(false);
        }
        return;
      }

      console.log('[UploadScreen] Using native image picker, launchImageLibrary available:', !!launchImageLibrary);
      
      if (!launchImageLibrary) {
        console.error('[UploadScreen] launchImageLibrary not available');
        showAlert('Error', 'Image picker not available on this platform');
        setIsPickerActive(false);
        return;
      }

      console.log('[UploadScreen] Launching native image picker with options:', {
        mediaType: 'photo',
        quality: 0.5,
        includeBase64: false,
        selectionLimit: 0,
      });

      launchImageLibrary(
        {
          mediaType: 'photo',
          quality: 0.5,
          includeBase64: false,
          selectionLimit: 0,
        },
        // @ts-ignore
        (response) => {
          console.log('[UploadScreen] Image picker callback triggered');
          console.log('[UploadScreen] Image picker response:', {
            didCancel: response.didCancel,
            errorCode: response.errorCode,
            errorMessage: response.errorMessage,
            assetsCount: response.assets ? response.assets.length : 0
          });

          try {
            if (response.didCancel) {
              console.log('[UploadScreen] User cancelled image picker');
              return;
            }
            if (response.errorCode) {
              console.error('[UploadScreen] Image picker error:', response.errorCode, response.errorMessage);
              showAlert('Error', 'Image picker error: ' + response.errorMessage);
              return;
            }
            if (Array.isArray(response.assets) && response.assets.length > 0) {
              console.log('[UploadScreen] Processing', response.assets.length, 'image assets');
              const validAssets = response.assets.filter((asset: any) => asset && asset.uri);
              console.log('[UploadScreen] Valid assets count:', validAssets.length);
              
              const newFiles = validAssets.map((asset: any) => ({
                uri: asset.uri!,
                name: asset.fileName || 'image.jpg',
                type: asset.type || 'image/jpeg',
              }));
              
              console.log('[UploadScreen] Adding image assets to pending files:', newFiles.map((f: any) => f.name));
              setPendingFiles(prev => [...prev, ...newFiles]);
            } else {
              console.log('[UploadScreen] No valid image assets in response');
            }
          } catch (callbackError) {
            console.error('[UploadScreen] Error in image picker callback:', callbackError);
            showAlert('Error', 'Error processing selected images');
          } finally {
            setIsPickerActive(false);
            console.log('[UploadScreen] Image picker completed, set active to false');
          }
        }
      );
    } catch (error) {
      console.error('[UploadScreen] Error launching image picker:', error);
      showAlert('Error', 'Failed to launch image picker');
      setIsPickerActive(false);
    }
  };

  const handleVideoPicker = () => {
    // Debug log to check platform detection
    console.log('[UploadScreen] handleVideoPicker called, Platform.OS:', Platform.OS, 'isPickerActive:', isPickerActive);
    
    // Prevent multiple concurrent picker operations
    if (isPickerActive) {
      console.log('[UploadScreen] Picker already active, ignoring video picker request');
      return;
    }

    try {
      setIsPickerActive(true);
      console.log('[UploadScreen] Set video picker active to true');

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
            console.log('[UploadScreen] Web video picker onChange triggered');
            const files = Array.from(event.target.files || []);
            console.log('[UploadScreen] Selected video files count:', files.length);
            if (files.length > 0) {
              const newFiles = files.map((file: any) => ({
                name: file.name,
                type: file.type,
                size: file.size,
                uri: '', // Will be handled differently on web
                webFile: file, // Store the actual File object for web
              }));
              console.log('[UploadScreen] Adding video files to pending list:', newFiles.map((f: any) => f.name));
              setPendingFiles(prev => [...prev, ...newFiles]);
            }
            setIsPickerActive(false);
            console.log('[UploadScreen] Web video picker completed, set active to false');
          };
          input.click();
        } else {
          console.error('[UploadScreen] Web environment not available for video picker');
          showAlert('Error', 'File picker not available in this environment');
          setIsPickerActive(false);
        }
        return;
      }

      console.log('[UploadScreen] Using native video picker, launchImageLibrary available:', !!launchImageLibrary);
      
      if (!launchImageLibrary) {
        console.error('[UploadScreen] launchImageLibrary not available for video');
        showAlert('Error', 'Video picker not available on this platform');
        setIsPickerActive(false);
        return;
      }

      console.log('[UploadScreen] Launching native video picker with options:', {
        mediaType: 'video',
        quality: 0.8,
        includeBase64: false,
      });

      // Use a flag to ensure callback is only processed once
      let callbackProcessed = false;
      
      // Add a timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        if (!callbackProcessed) {
          console.warn('[UploadScreen] Video picker timeout reached, resetting picker state');
          callbackProcessed = true;
          setIsPickerActive(false);
        }
      }, 30000); // 30 second timeout

      launchImageLibrary(
        {
          mediaType: 'video',
          quality: 0.8,
          includeBase64: false,
        },
        // @ts-ignore
        (response) => {
          console.log('[UploadScreen] Video picker callback triggered, callbackProcessed:', callbackProcessed);
          
          // Clear the timeout since callback was received
          clearTimeout(timeoutId);
          
          // Prevent multiple callback executions
          if (callbackProcessed) {
            console.warn('[UploadScreen] Video picker callback already processed, ignoring duplicate call');
            return;
          }
          callbackProcessed = true;

          console.log('[UploadScreen] Video picker response:', {
            didCancel: response.didCancel,
            errorCode: response.errorCode,
            errorMessage: response.errorMessage,
            assetsCount: response.assets ? response.assets.length : 0
          });

          try {
            if (response.didCancel) {
              console.log('[UploadScreen] User cancelled video picker');
              return;
            }
            if (response.errorCode) {
              console.error('[UploadScreen] Video picker error:', response.errorCode, response.errorMessage);
              showAlert('Error', 'Video picker error: ' + response.errorMessage);
              return;
            }
            if (response.assets && response.assets[0]) {
              console.log('[UploadScreen] Processing video asset');
              const asset = response.assets[0];
              console.log('[UploadScreen] Video asset details:', {
                uri: asset.uri,
                fileName: asset.fileName,
                type: asset.type,
                fileSize: asset.fileSize
              });
              
              const newFile = {
                uri: asset.uri!,
                name: asset.fileName || 'video.mp4',
                type: asset.type || 'video/mp4',
              };
              
              console.log('[UploadScreen] Adding video asset to pending files:', newFile.name);
              setPendingFiles(prev => [...prev, newFile]);
            } else {
              console.log('[UploadScreen] No valid video asset in response');
            }
          } catch (callbackError) {
            console.error('[UploadScreen] Error in video picker callback:', callbackError);
            showAlert('Error', 'Error processing selected video');
          } finally {
            setIsPickerActive(false);
            console.log('[UploadScreen] Video picker completed, set active to false');
          }
        }
      );
    } catch (error) {
      console.error('[UploadScreen] Error launching video picker:', error);
      showAlert('Error', 'Failed to launch video picker');
      setIsPickerActive(false);
    }
  };

  const encryptAndSaveAllFiles = async () => {
    console.log('[UploadScreen] encryptAndSaveAllFiles started, pendingFiles count:', pendingFiles.length);
    
    if (pendingFiles.length === 0) {
      console.log('[UploadScreen] No pending files to upload');
      showAlert('Info', 'No files selected for upload');
      return;
    }

    setUploading(true);
    console.log('[UploadScreen] Set uploading state to true');
    
    try {
      for (let i = 0; i < pendingFiles.length; i++) {
        const file = pendingFiles[i];
        console.log(`[UploadScreen] Processing file ${i + 1}/${pendingFiles.length}: ${file.name}`);
        console.log(`[UploadScreen] File details:`, {
          name: file.name,
          type: file.type,
          size: file.size,
          hasUri: !!file.uri,
          hasWebFile: !!file.webFile,
          platform: Platform.OS
        });

        // Read file data using cross-platform approach
        let fileData: Uint8Array;
        
        if ((Platform as any).OS === 'web' && file.webFile) {
          console.log(`[UploadScreen] Reading web file: ${file.name}`);
          // On web, read from the File object directly
          try {
            const arrayBuffer = await file.webFile.arrayBuffer();
            fileData = new Uint8Array(arrayBuffer);
            console.log(`[UploadScreen] Successfully read web file, size: ${fileData.length} bytes`);
          } catch (error) {
            console.error(`[UploadScreen] Failed to read web file ${file.name}:`, error);
            fileData = new Uint8Array();
          }
        } else if (file.uri) {
          console.log(`[UploadScreen] Reading file from URI: ${file.uri}`);
          if ((Platform as any).OS === 'web') {
            // On web, URI might be a blob URL from file picker
            try {
              console.log(`[UploadScreen] Fetching web blob from URI: ${file.uri}`);
              const response = await fetch(file.uri);
              const arrayBuffer = await response.arrayBuffer();
              fileData = new Uint8Array(arrayBuffer);
              console.log(`[UploadScreen] Successfully read web blob, size: ${fileData.length} bytes`);
            } catch (error) {
              console.error(`[UploadScreen] Failed to read file on web from URI ${file.uri}:`, error);
              // Fallback to empty data
              fileData = new Uint8Array();
            }
          } else {
            // On native, use RNFS to read the file
            try {
              console.log(`[UploadScreen] Reading native file with RNFS from: ${file.uri}`);
              if (RNFS) {
                const base64 = await RNFS.readFile(file.uri, 'base64');
                console.log(`[UploadScreen] Read base64 data, length: ${base64.length}`);
                fileData = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                console.log(`[UploadScreen] Successfully converted to Uint8Array, size: ${fileData.length} bytes`);
              } else {
                console.error('[UploadScreen] RNFS not available on native platform');
                fileData = new Uint8Array();
              }
            } catch (error) {
              console.error(`[UploadScreen] Failed to read native file ${file.name} from ${file.uri}:`, error);
              fileData = new Uint8Array();
            }
          }
        } else {
          console.error(`[UploadScreen] No valid data source for file: ${file.name}`);
          fileData = new Uint8Array();
        }

        if (fileData.length === 0) {
          console.error(`[UploadScreen] File ${file.name} has no data, skipping`);
          continue;
        }

        console.log(`[UploadScreen] Encrypting and saving file: ${file.name}, data size: ${fileData.length} bytes`);
        console.log(`[UploadScreen] Folder path: ${metaEditor.folderPath}, tags: ${metaEditor.tags.join(', ')}`);
        
        // Check if this is a large video file that might benefit from streaming
        const isLargeVideo = file.type.startsWith('video/') && fileData.length > 10 * 1024 * 1024;
        if (isLargeVideo) {
          console.log(`[UploadScreen] Large video detected (${(fileData.length / (1024 * 1024)).toFixed(1)}MB), will prepare for streaming after upload`);
        }
        
        try {
          const savedMetadata = await fileManagerService.saveEncryptedFile(
            fileData,
            file.name,
            file.type,
            metaEditor.folderPath.split('/').filter(Boolean),
            metaEditor.tags
          );
          console.log(`[UploadScreen] Successfully saved encrypted file: ${file.name}`);
          
          // For large video files, prepare streaming metadata in the background
          if (isLargeVideo && savedMetadata?.uuid && derivedKey) {
            console.log(`[UploadScreen] Preparing streaming metadata for large video: ${file.name}`);
            try {
              const { VideoStreamingService } = await import('../utils/VideoStreamingService');
              
              // Prepare streaming in the background without blocking the upload process
              VideoStreamingService.prepareVideoForStreaming(
                savedMetadata.uuid, 
                fileData, 
                file.type, 
                file.name, 
                derivedKey
              )
                .then(() => {
                  console.log(`[UploadScreen] Streaming preparation completed for: ${file.name}`);
                })
                .catch((error) => {
                  console.warn(`[UploadScreen] Streaming preparation failed for ${file.name}:`, error);
                });
            } catch (importError) {
              console.warn(`[UploadScreen] Failed to import streaming dependencies:`, importError);
            }
          }
        } catch (saveError) {
          console.error(`[UploadScreen] Failed to save encrypted file ${file.name}:`, saveError);
          throw saveError;
        }
      }
      
      console.log(`[UploadScreen] Successfully uploaded and encrypted ${pendingFiles.length} file(s)`);
      showAlert('Success', `Uploaded and encrypted ${pendingFiles.length} file(s) successfully`);
      
      // Clean up temporary files after successful upload
      console.log('[UploadScreen] Starting cleanup of temporary files');
      await cleanupTempFiles();
      
      console.log('[UploadScreen] Clearing pending files and metadata');
      setPendingFiles([]);
      metaEditor.setTags([]);
      metaEditor.setFolderPath('');
      
      console.log('[UploadScreen] Refreshing file list');
      await refreshFileList();
      
      console.log('[UploadScreen] Upload process completed successfully');
    } catch (error) {
      console.error('[UploadScreen] File upload error:', error);
      showAlert('Error', 'Failed to upload and encrypt files: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setUploading(false);
      console.log('[UploadScreen] Set uploading state to false');
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
              style={[styles.optionCard, { opacity: (uploading || isPickerActive) ? 0.5 : 1 }]}
              onPress={option.onPress}
              disabled={uploading || isPickerActive}
            >
              <View style={[styles.optionIcon, { backgroundColor: option.color }]}> 
                <WebCompatibleIcon name={option.icon} size={28} color={theme.chipText} />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
              </View>
              <View style={styles.chevron}>
                <WebCompatibleIcon name="chevron-right" size={20} color="#ccc" />
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
                  <WebCompatibleIcon name="insert-drive-file" size={20} color={theme.accent} />
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
          <WebCompatibleIcon name="security" size={20} color={theme.accentSecondary} />
          <Text style={styles.infoText}>
            All files are automatically encrypted with AES-256 encryption before being stored. 
            Your files are secured with your password and cannot be accessed without it.
          </Text>
        </View>

        <View style={styles.infoContainer}>
          <WebCompatibleIcon name="info" size={20} color={theme.textSecondary} />
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
