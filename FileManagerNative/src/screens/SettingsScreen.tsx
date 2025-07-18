declare const document: any;
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useFileContext } from '../context/FileContext';
import { usePasswordContext } from '../context/PasswordContext';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { FileManagerService } from '../utils/FileManagerService';
import { ThemeContext, darkTheme, lightTheme } from '../theme';
import JSZip from 'jszip';
import { Platform } from 'react-native';
import * as FileSystem from '../utils/FileSystem';
import Icon from 'react-native-vector-icons/MaterialIcons';

// Conditionally import native libraries
let Share: any = null;
let DocumentPicker: any = null;
if (Platform.OS !== 'web') {
  try {
    Share = require('react-native-share').default;
    console.log('[SettingsScreen] react-native-share loaded successfully');
  } catch (e) {
    console.warn('Failed to load react-native-share:', e);
  }
  try {
    DocumentPicker = require('react-native-document-picker').default;
    console.log('[SettingsScreen] react-native-document-picker loaded successfully');
  } catch (e) {
    console.warn('Failed to load react-native-document-picker:', e);
  }
}

// Ensure atob is available (should be from polyfills, but double-check)
const atob = globalThis.atob || ((str: string) => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64').toString('binary');
  }
  throw new Error('atob not available and Buffer not found');
});

type RootStackParamList = {
  Password: undefined;
  Main: undefined;
};

const SettingsScreen = () => {
  const { encryptedFiles, refreshFileList } = useFileContext();
  const { derivedKey, setPassword } = usePasswordContext();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { theme, setTheme } = React.useContext(ThemeContext);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  
  // Helper: Check if metadata.enc is decryptable
  async function isDecryptable(metadataPath: string, derivedKey: Uint8Array) {
    try {
      // Extract UUID from metadataPath
      const uuid = (metadataPath.split('/').pop() ?? '').replace('.metadata.enc', '');
      await FileManagerService.loadFileMetadata(uuid, derivedKey);
      return true;
    } catch {
      return false;
    }
  }

  // Export all decryptable files and their metadata.enc to a ZIP
  const handleExport = async () => {
    if (!derivedKey) {
      Alert.alert('Error', 'No password set.');
      return;
    }
    setExporting(true);
    try {
      console.log('[SettingsScreen] Export: Starting export process');
      // Use cross-platform FileSystem utility for export
      try {
        // Get files list (web returns string[], native returns object[])
        const filesList = await FileSystem.listFiles();
        console.log('[SettingsScreen] Export: Files listed', filesList);
        console.log('[SettingsScreen] Export: First file structure:', filesList[0]);
        // Include all encrypted files that exist (more permissive approach)
        const filesToExport: { name: string; data: string }[] = [];
        for (const file of filesList) {
          // Handle both string[] (web) and {name, path}[] (native) formats
          const name = typeof file === 'string' ? file : file.name;
          const path = typeof file === 'string' ? file : (file.path || file.name);
          console.log('[SettingsScreen] Export: Processing file:', name, 'Type:', typeof file);
          if (typeof name === 'string' && (name.endsWith('.enc') || name.endsWith('.metadata.enc') || name.endsWith('.preview.enc')) && !name.startsWith('.')) {
            try {
              console.log('[SettingsScreen] Export: Adding file', name);
              const fileData = await FileSystem.readFile(path, 'base64');
              filesToExport.push({ name, data: fileData });
            } catch (readError) {
              const errorMessage = readError instanceof Error ? readError.message : String(readError);
              console.warn('[SettingsScreen] Export: Failed to read file', name, 'Error:', errorMessage);
            }
          }
        }
        console.log('[SettingsScreen] Export: Files to export', filesToExport.map(f => f.name));
        if (filesToExport.length === 0) {
          Alert.alert('No files', 'No decryptable files found.');
          return;
        }
        // Create ZIP
        const zip = new JSZip();
        for (const { name, data } of filesToExport) {
          zip.file(name, data, { base64: true });
        }
        console.log('[SettingsScreen] Export: Creating ZIP...');
        if (Platform.OS === 'web') {
          const content = await zip.generateAsync({ type: 'blob' });
          console.log('[SettingsScreen] Export: ZIP created (web)');
          const url = URL.createObjectURL(content);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'exported_files.zip';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 100);
          Alert.alert('Export Complete', 'ZIP file downloaded.');
        } else {
          // Native: Use Share API to let user save/share the ZIP file
          const content = await zip.generateAsync({ type: 'base64' });
          console.log('[SettingsScreen] Export: ZIP created (native, base64)');
          
          if (Share && Share.open) {
            // Write ZIP to documents directory temporarily
            const tempFileName = `exported_files_${Date.now()}.zip`;
            await FileSystem.writeFile(tempFileName, content, 'base64');
            
            // Get the full path for sharing
            let tempZipPath: string;
            try {
              const RNFS = require('react-native-fs');
              tempZipPath = `${RNFS.DocumentDirectoryPath}/${tempFileName}`;
            } catch (e) {
              // Fallback if RNFS not available
              tempZipPath = tempFileName;
            }
            
            // Use Share API to let user save/share the file
            const shareOptions = {
              title: 'Export Encrypted Files',
              message: 'Your encrypted files have been exported to a ZIP archive.',
              url: `file://${tempZipPath}`,
              type: 'application/zip',
              filename: 'exported_files.zip'
            };
            
            try {
              const result = await Share.open(shareOptions);
              Alert.alert('Export Complete', 'ZIP file ready to save or share.');
            } catch (shareErr: any) {
              console.error('[SettingsScreen] Share error:', shareErr);
              if (shareErr && shareErr.message && shareErr.message.indexOf('cancelled') === -1) {
                Alert.alert('Share Error', 'Failed to share the export file. File saved to documents instead.');
              }
              // User cancelled sharing - this is normal, don't show error
            }
            
            // Clean up temp file after a delay
            setTimeout(async () => {
              try {
                await FileSystem.deleteFile(tempFileName);
              } catch (e) {
                console.warn('Failed to clean up temp export file:', e);
              }
            }, 30000); // 30 seconds delay
          } else {
            // Fallback: save to documents directory
            const zipFileName = `exported_files_${Date.now()}.zip`;
            await FileSystem.writeFile(zipFileName, content, 'base64');
            Alert.alert('Export Complete', `ZIP file saved to documents as ${zipFileName}`);
          }
        }
      } catch (err) {
        console.error('[SettingsScreen] Export: Error', err);
        Alert.alert('Error', 'Export failed.');
      }
    } catch (err) {
      console.error('[SettingsScreen] Export: Outer error', err);
      Alert.alert('Error', 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  // Import ZIP archive and add decryptable files
  const handleImport = async () => {
    if (!derivedKey) {
      Alert.alert('Error', 'No password set.');
      return;
    }
    setImporting(true);
    // Use cross-platform FileSystem utility for import
    try {
      console.log('[SettingsScreen] Import: Starting import process');
      // Prompt user for ZIP file (web: file input, native: document picker)
      let zipData: Uint8Array | null = null;
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip,application/zip';
        zipData = await new Promise<Uint8Array | null>((resolve) => {
          input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return resolve(null);
            const arrayBuffer = await file.arrayBuffer();
            resolve(new Uint8Array(arrayBuffer));
          };
          input.click();
        });
        if (!zipData) {
          Alert.alert('Import Cancelled', 'No ZIP file selected.');
          return;
        }
        console.log('[SettingsScreen] Import: ZIP file selected, size:', zipData.length);
      } else {
        // Native: Use DocumentPicker to select ZIP file
        if (DocumentPicker && DocumentPicker.pick) {
          try {
            const result = await DocumentPicker.pick({
              type: [DocumentPicker.types.zip],
              allowMultiSelection: false,
            });
            
            if (result && result.length > 0) {
              const pickedFile = result[0];
              console.log('[SettingsScreen] Import: File picked:', pickedFile.name, 'URI:', pickedFile.uri);
              
              // Read the file content
              let fileContent: string;
              try {
                const RNFS = require('react-native-fs');
                fileContent = await RNFS.readFile(pickedFile.uri, 'base64');
              } catch (e) {
                console.error('Failed to load RNFS or read file:', e);
                Alert.alert('Error', 'Failed to read the selected file.');
                return;
              }
              
              // Convert base64 to Uint8Array properly
              try {
                const Buffer = require('buffer').Buffer;
                const buffer = Buffer.from(fileContent, 'base64');
                zipData = new Uint8Array(buffer);
                console.log('[SettingsScreen] Import: ZIP file loaded, size:', zipData.length);
              } catch (conversionErr) {
                console.error('[SettingsScreen] Import: Buffer conversion error:', conversionErr);
                Alert.alert('Error', 'Failed to process the selected file.');
                return;
              }
            } else {
              Alert.alert('Import Cancelled', 'No ZIP file selected.');
              return;
            }
          } catch (err: any) {
            if (DocumentPicker.isCancel && DocumentPicker.isCancel(err)) {
              Alert.alert('Import Cancelled', 'File selection was cancelled.');
              return;
            } else {
              console.error('[SettingsScreen] Import: DocumentPicker error:', err);
              Alert.alert('Error', 'Failed to select file.');
              return;
            }
          }
        } else {
          Alert.alert('Error', 'File picker not available on this device.');
          return;
        }
      }
      
      // Unzip and write files
      try {
        const zip = await JSZip.loadAsync(zipData!);
        console.log('[SettingsScreen] Import: ZIP loaded, files:', Object.keys(zip.files));
        let importedCount = 0;
        let importedSize = 0;
        for (const [name, entry] of Object.entries(zip.files)) {
          if (entry.dir) continue;
          if (!name.endsWith('.enc') && !name.endsWith('.metadata.enc') && !name.endsWith('.preview.enc')) continue;
          try {
            const fileData = await entry.async('uint8array');
            // Convert Uint8Array to base64 string for cross-platform compatibility
            let dataToWrite: string | Uint8Array;
            if (Platform.OS === 'web') {
              dataToWrite = fileData; // Web can handle Uint8Array directly
            } else {
              // Native needs base64 string
              const Buffer = require('buffer').Buffer;
              const buffer = Buffer.from(fileData);
              dataToWrite = buffer.toString('base64');
            }
            
            await FileSystem.writeFile(name, dataToWrite, Platform.OS === 'web' ? 'utf8' : 'base64');
            importedCount++;
            importedSize += fileData.length;
            console.log('[SettingsScreen] Import: Wrote file', name, 'size', fileData.length);
          } catch (fileErr) {
            console.error('[SettingsScreen] Import: Failed to write file', name, fileErr);
          }
        }
        await refreshFileList();
        Alert.alert('Import Complete', `${importedCount} file${importedCount === 1 ? '' : 's'} imported. Total size: ${(importedSize / (1024 * 1024)).toFixed(2)} MB.`);
      } catch (zipErr) {
        console.error('[SettingsScreen] Import: ZIP processing error:', zipErr);
        Alert.alert('Error', 'Failed to extract ZIP file. The file may be corrupted or not a valid ZIP archive.');
        return;
      }
    } catch (err) {
      console.error('[SettingsScreen] Import: Error', err);
      Alert.alert('Error', 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const [isDark, setIsDark] = useState(theme === darkTheme);

  const handleLogout = () => {
    setPassword('');
    navigation.reset({ index: 0, routes: [{ name: 'Password' }] });
  };

  const handleToggleTheme = async () => {
    const newTheme = isDark ? lightTheme : darkTheme;
    setTheme(newTheme);
    setIsDark(!isDark);
  };

  const handleDeleteAll = async () => {
    Alert.alert(
      'Delete All Files',
      'Are you sure you want to permanently delete ALL files in the app storage? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              if (!derivedKey) throw new Error('No password set');
              const deletedCount = await FileManagerService.deleteAllFiles(derivedKey);
              await refreshFileList();
              Alert.alert('Success', `${deletedCount} file${deletedCount === 1 ? '' : 's'} deleted.`);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete all files.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleClearCorrupted = async () => {
    if (!derivedKey) {
      Alert.alert('Error', 'No password set.');
      return;
    }
    
    Alert.alert(
      'Clear Corrupted Files',
      'This will remove files that cannot be decrypted (usually from before recent fixes). This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Corrupted',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const files = await FileSystem.listFiles();
              let deletedCount = 0;
              
              for (const file of files) {
                const fileName = typeof file === 'string' ? file : file.name;
                if (fileName.endsWith('.metadata.enc')) {
                  const uuid = fileName.replace('.metadata.enc', '');
                  try {
                    await FileManagerService.loadFileMetadata(uuid, derivedKey);
                    // If we get here, metadata is fine
                  } catch (e) {
                    // This metadata file is corrupted, delete the entire file set
                    try {
                      await FileSystem.deleteFile(fileName);
                      deletedCount++;
                      try {
                        await FileSystem.deleteFile(`${uuid}.enc`);
                        deletedCount++;
                      } catch (e) { /* ignore if doesn't exist */ }
                      try {
                        await FileSystem.deleteFile(`${uuid}.preview.enc`);
                        deletedCount++;
                      } catch (e) { /* ignore if doesn't exist */ }
                    } catch (deleteErr) {
                      console.warn('Failed to delete corrupted file:', fileName, deleteErr);
                    }
                  }
                }
              }
              
              await refreshFileList();
              Alert.alert('Success', `Cleared ${deletedCount} corrupted file${deletedCount === 1 ? '' : 's'}.`);
            } catch (error) {
              console.error('Error clearing corrupted files:', error);
              Alert.alert('Error', 'Failed to clear corrupted files.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={getStyles(theme).container} contentContainerStyle={getStyles(theme).contentContainer}>
      <Text style={getStyles(theme).title}>Settings</Text>

      {/* Log Out (standalone) */}
      <TouchableOpacity
        style={[getStyles(theme).deleteButton, { backgroundColor: theme.accent, marginBottom: 32 }]}
        onPress={handleLogout}
      >
        <Icon name="logout" size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>Log Out</Text>
      </TouchableOpacity>

      {/* Theme Section */}
      <Text style={getStyles(theme).sectionHeader}>Theme</Text>
      <TouchableOpacity
        style={[getStyles(theme).deleteButton, { backgroundColor: theme.card, marginTop: 12 }]}
        onPress={handleToggleTheme}
      >
        <Icon name={isDark ? 'brightness-4' : 'brightness-7'} size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>{isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</Text>
      </TouchableOpacity>

      {/* Export/Import Section */}
      <Text style={getStyles(theme).sectionHeader}>Export / Import</Text>
      <TouchableOpacity
        style={[getStyles(theme).deleteButton, { backgroundColor: theme.accentSecondary, marginTop: 12 }]}
        onPress={handleExport}
        disabled={exporting}
      >
        <Icon name="archive" size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>{exporting ? 'Exporting...' : 'Export to ZIP'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[getStyles(theme).deleteButton, { backgroundColor: theme.accentSecondary, marginTop: 12 }]}
        onPress={handleImport}
        disabled={exporting || importing}
      >
        <Icon name="unarchive" size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>{importing ? 'Importing...' : 'Import from ZIP'}</Text>
      </TouchableOpacity>

      {/* Danger Zone Section */}
      <Text style={[getStyles(theme).sectionHeader, { color: theme.error, marginTop: 32 }]}>Danger Zone</Text>
      <TouchableOpacity
        style={[getStyles(theme).deleteButton, deleting && getStyles(theme).deleteButtonDisabled, { marginTop: 12 }]}
        onPress={handleDeleteAll}
        disabled={deleting}
      >
        <Icon name="delete-forever" size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>Delete All Files</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[getStyles(theme).deleteButton, deleting && getStyles(theme).deleteButtonDisabled, { marginTop: 12 }, getStyles(theme).clearCorruptedButton]}
        onPress={handleClearCorrupted}
        disabled={deleting}
      >
        <Icon name="warning" size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>Clear Corrupted Files</Text>
      </TouchableOpacity>
      {deleting && <ActivityIndicator size="large" color={theme.error} style={{ marginTop: 16 }} />}
    </ScrollView>
  );
};

const getStyles = (theme: typeof darkTheme) => StyleSheet.create({
  sectionHeader: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textSecondary,
    marginTop: 24,
    marginBottom: 4,
    alignSelf: 'center',
    textAlign: 'center',
    width: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  contentContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: 32,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.error,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  deleteButtonDisabled: {
    backgroundColor: theme.disabled,
    opacity: 0.6,
  },
  deleteButtonText: {
    color: theme.chipText,
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  clearCorruptedButton: {
    backgroundColor: '#ff6b6b', // Red color for destructive action
  },
});

export default SettingsScreen;
