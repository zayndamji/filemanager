import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useFileContext } from '../context/FileContext';
import { usePasswordContext } from '../context/PasswordContext';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { FileManagerService } from '../utils/FileManagerService';
import { ThemeContext, darkTheme, lightTheme } from '../theme';
import RNFS from 'react-native-fs';
import { zip, unzip } from 'react-native-zip-archive';
import Share from 'react-native-share';
import DocumentPicker from 'react-native-document-picker';
import Icon from 'react-native-vector-icons/MaterialIcons';

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
      // Find all .enc files and .metadata.enc files
      const filesDir = RNFS.DocumentDirectoryPath;
      const files = await RNFS.readDir(filesDir);
      const encFiles = files.filter(f => f.name.endsWith('.enc'));
      // Only include files with decryptable .metadata.enc
      const filesToExport = [];
      for (const file of encFiles) {
        if (file.name.endsWith('.metadata.enc')) {
          // Only check metadata.enc files
          const ok = await isDecryptable(file.path, derivedKey);
          if (ok) {
            // Add metadata.enc and its corresponding file
            const baseName = file.name.replace('.metadata.enc', '');
            const filePath = `${filesDir}/${baseName}.enc`;
            const previewPath = `${filesDir}/${baseName}.preview.enc`;
            // Check if file exists
            const exists = await RNFS.exists(filePath);
            if (exists) {
              filesToExport.push(file.path);
              filesToExport.push(filePath);
              // If .preview.enc exists, add it
              const previewExists = await RNFS.exists(previewPath);
              if (previewExists) {
                filesToExport.push(previewPath);
              }
            }
          }
        }
      }
      if (filesToExport.length === 0) {
        Alert.alert('No files', 'No decryptable files found.');
        setExporting(false);
        return;
      }
      // Create temp export folder
      const exportDir = `${filesDir}/export_temp`;
      await RNFS.mkdir(exportDir);
      // Copy files to export folder
      for (const src of filesToExport) {
        const dest = `${exportDir}/${src.split('/').pop()}`;
        await RNFS.copyFile(src, dest);
      }
      // Zip the export folder
      const zipPath = `${filesDir}/exported_files.zip`;
      await zip(exportDir, zipPath);
      // Remove temp folder
      await RNFS.unlink(exportDir);

      // Open share sheet for ZIP file
      try {
        await Share.open({
          url: 'file://' + zipPath,
          type: 'application/zip',
          failOnCancel: false,
        });
      } catch (e) {
        Alert.alert('Export Cancelled', 'No destination selected.');
      }
    } catch (err) {
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
    try {
      // Pick ZIP file
      const res = await DocumentPicker.pick({
        type: [DocumentPicker.types.zip],
      });
      if (!res || !res[0] || !res[0].uri) {
        Alert.alert('Import Cancelled', 'No ZIP file selected.');
        return;
      }
      const zipUri = res[0].uri.replace('file://', '');
      const filesDir = RNFS.DocumentDirectoryPath;
      const importDir = `${filesDir}/import_temp`;
      await RNFS.mkdir(importDir);
      // Unzip
      await unzip(zipUri, importDir);
      // List all files in import temp dir
      const importFiles = await RNFS.readDir(importDir);
      // Find all .metadata.enc files
      const metadataFiles = importFiles.filter(f => f.name.endsWith('.metadata.enc'));
      let importedCount = 0;
      let importedSize = 0;
      for (const file of metadataFiles) {
        const baseName = file.name.replace('.metadata.enc', '');
        const encPath = `${importDir}/${baseName}.enc`;
        const metaPath = file.path;
        const previewPath = `${importDir}/${baseName}.preview.enc`;
        // Destination paths
        const destEnc = `${filesDir}/${baseName}.enc`;
        const destMeta = `${filesDir}/${baseName}.metadata.enc`;
        const destPreview = `${filesDir}/${baseName}.preview.enc`;

        // Check existence in destination
        const encExists = await RNFS.exists(destEnc);
        const metaExists = await RNFS.exists(destMeta);
        const destPreviewExists = await RNFS.exists(destPreview);
        // Check if preview exists in import temp
        const previewExistsInImport = await RNFS.exists(previewPath);

        // Only skip if all destination files exist (and preview only if present in import)
        if (encExists && metaExists && (!previewExistsInImport || destPreviewExists)) {
          console.log(`[Import] All files already exist, skipping: UUID=${baseName}, encPath=${destEnc}`);
          continue;
        }

        let copied = false;
        // Copy missing .enc
        if (!encExists) {
          const encSourceExists = await RNFS.exists(encPath);
          if (encSourceExists) {
            try {
              await RNFS.copyFile(encPath, destEnc);
              importedSize += (await RNFS.stat(encPath)).size;
              console.log(`[Import] Copied: UUID=${baseName}, encPath=${destEnc}`);
              copied = true;
            } catch (err) {
              console.error(`[Import] Failed to copy .enc: ${encPath} -> ${destEnc}`);
            }
          } else {
            console.error(`[Import] Source .enc missing: ${encPath}`);
          }
        } else {
          console.log(`[Import] .enc already exists, skipping: UUID=${baseName}, encPath=${destEnc}`);
        }
        // Copy missing .metadata.enc
        if (!metaExists) {
          const metaSourceExists = await RNFS.exists(metaPath);
          if (metaSourceExists) {
            try {
              await RNFS.copyFile(metaPath, destMeta);
              importedSize += (await RNFS.stat(metaPath)).size;
              // No logging for metadata file path or contents
              copied = true;
            } catch (err) {
              console.error(`[Import] Failed to copy .metadata.enc for UUID=${baseName}`);
            }
          } else {
            console.error(`[Import] Source .metadata.enc missing for UUID=${baseName}`);
          }
        } else {
          // No logging for metadata file path or contents
        }
        // Copy missing .preview.enc if present in import
        if (previewExistsInImport) {
          if (!destPreviewExists) {
            try {
              await RNFS.copyFile(previewPath, destPreview);
              importedSize += (await RNFS.stat(previewPath)).size;
              console.log(`[Import] Copied: ${destPreview}`);
              copied = true;
            } catch (err) {
              console.error(`[Import] Failed to copy .preview.enc: ${previewPath} -> ${destPreview}`, err);
            }
          } else {
            console.log(`[Import] .preview.enc already exists, skipping: ${destPreview}`);
          }
        }
        if (copied) importedCount++;
      }
      // Clean up temp folder
      await RNFS.unlink(importDir);
      // Refresh file list
      await refreshFileList();
      Alert.alert('Import Complete', `${importedCount} file${importedCount === 1 ? '' : 's'} imported. Total size: ${(importedSize / (1024 * 1024)).toFixed(2)} MB.`);
    } catch (err) {
      Alert.alert('Error', 'Import failed.');
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

  return (
    <View style={getStyles(theme).container}>
      <Text style={getStyles(theme).title}>Settings</Text>
      <TouchableOpacity
        style={[getStyles(theme).deleteButton, deleting && getStyles(theme).deleteButtonDisabled]}
        onPress={handleDeleteAll}
        disabled={deleting}
      >
        <Icon name="delete-forever" size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>Delete All Files</Text>
      </TouchableOpacity>
      {deleting && <ActivityIndicator size="large" color={theme.error} style={{ marginTop: 16 }} />}
      <TouchableOpacity
        style={[getStyles(theme).deleteButton, { backgroundColor: theme.accent, marginTop: 24 }]}
        onPress={handleLogout}
      >
        <Icon name="logout" size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>Log Out</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[getStyles(theme).deleteButton, { backgroundColor: theme.card, marginTop: 24 }]}
        onPress={handleToggleTheme}
      >
        <Icon name={isDark ? 'brightness-4' : 'brightness-7'} size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>{isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[getStyles(theme).deleteButton, { backgroundColor: theme.accentSecondary, marginTop: 24 }]} 
        onPress={handleExport}
        disabled={exporting}
      >
        <Icon name="archive" size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>{exporting ? 'Exporting...' : 'Export Encrypted Files (ZIP)'}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[getStyles(theme).deleteButton, { backgroundColor: theme.accentSecondary, marginTop: 24 }]} 
        onPress={handleImport}
        disabled={exporting}
      >
        <Icon name="unarchive" size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>Import Encrypted Files (ZIP)</Text>
      </TouchableOpacity>
    </View>
  );
};

const getStyles = (theme: typeof darkTheme) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.background,
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
});

export default SettingsScreen;
