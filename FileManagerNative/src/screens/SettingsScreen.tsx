declare const document: any;
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
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
          setExporting(false);
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
          // Native: generate base64 and write directly
          const content = await zip.generateAsync({ type: 'base64' });
          console.log('[SettingsScreen] Export: ZIP created (native, base64)');
          
          if ((Platform as any).OS === 'web') {
            // Web: Use File System Access API with already selected directory
            await FileSystem.writeFile('exported_files.zip', content, 'base64');
          } else {
            // Native: Use DocumentDirectoryPath
            const filesDir = await FileSystem.pickDirectory();
            const zipPath = `${filesDir}/exported_files.zip`;
            await FileSystem.writeFile(zipPath, content, 'base64');
          }
          Alert.alert('Export Complete', 'ZIP file saved successfully');
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
    // Use cross-platform FileSystem utility for import
    try {
      console.log('[SettingsScreen] Import: Starting import process');
      // Prompt user for ZIP file (web: file input, native: file picker)
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
        // Use FileSystem.pickDirectory to get path, then prompt for file (simulate DocumentPicker)
        // For simplicity, assume user provides path to ZIP file (could be improved)
        Alert.alert('Import', 'Please place your ZIP file in the app storage and enter the filename.');
        return; // Implement native picker as needed
      }
      // Unzip and write files
      const zip = await JSZip.loadAsync(zipData!);
      console.log('[SettingsScreen] Import: ZIP loaded, files:', Object.keys(zip.files));
      let importedCount = 0;
      let importedSize = 0;
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        if (!name.endsWith('.enc') && !name.endsWith('.metadata.enc') && !name.endsWith('.preview.enc')) continue;
        const fileData = await entry.async('uint8array');
        await FileSystem.writeFile(name, fileData);
        importedCount++;
        importedSize += fileData.length;
        console.log('[SettingsScreen] Import: Wrote file', name, 'size', fileData.length);
      }
      await refreshFileList();
      Alert.alert('Import Complete', `${importedCount} file${importedCount === 1 ? '' : 's'} imported. Total size: ${(importedSize / (1024 * 1024)).toFixed(2)} MB.`);
    } catch (err) {
      console.error('[SettingsScreen] Import: Error', err);
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
        disabled={exporting}
      >
        <Icon name="unarchive" size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>Import from ZIP</Text>
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
      {deleting && <ActivityIndicator size="large" color={theme.error} style={{ marginTop: 16 }} />}
    </View>
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
