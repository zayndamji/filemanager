import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useFileContext } from '../context/FileContext';
import { usePasswordContext } from '../context/PasswordContext';
import { FileManagerService } from '../utils/FileManagerService';
import Icon from 'react-native-vector-icons/MaterialIcons';

const SettingsScreen = () => {
  const { encryptedFiles, refreshFileList } = useFileContext();
  const { derivedKey } = usePasswordContext();
  const [deleting, setDeleting] = useState(false);

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
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <TouchableOpacity
        style={[styles.deleteButton, deleting && styles.deleteButtonDisabled]}
        onPress={handleDeleteAll}
        disabled={deleting}
      >
        <Icon name="delete-forever" size={24} color="#fff" />
        <Text style={styles.deleteButtonText}>Delete All Files</Text>
      </TouchableOpacity>
      {deleting && <ActivityIndicator size="large" color="#ff3b30" style={{ marginTop: 16 }} />}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 32,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff3b30',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
});

export default SettingsScreen;
