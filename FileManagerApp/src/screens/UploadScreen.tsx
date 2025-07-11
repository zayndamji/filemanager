import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentPicker from 'react-native-document-picker';
import { launchImageLibrary } from 'react-native-image-picker';
import { useFileContext } from '../context/FileContext';
import { usePasswordContext } from '../context/PasswordContext';
import { FileManagerService } from '../utils/FileManagerService';
import Icon from 'react-native-vector-icons/MaterialIcons';
import RNFS from 'react-native-fs';

const UploadScreen = () => {
  const { refreshFileList, currentFolderPath } = useFileContext();
  const { password, derivedKey } = usePasswordContext();
  const [uploading, setUploading] = useState(false);

  const handleDocumentPicker = async () => {
    try {
      const result = await DocumentPicker.pickSingle({
        type: [DocumentPicker.types.allFiles],
      });
      
      await encryptAndSaveFile(result.uri, result.name || 'unknown', result.type || 'application/octet-stream');
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
        quality: 0.8,
        includeBase64: false,
      },
      (response) => {
        if (response.assets && response.assets[0]) {
          const asset = response.assets[0];
          encryptAndSaveFile(
            asset.uri!, 
            asset.fileName || 'image.jpg', 
            asset.type || 'image/jpeg'
          );
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
          encryptAndSaveFile(
            asset.uri!, 
            asset.fileName || 'video.mp4', 
            asset.type || 'video/mp4'
          );
        }
      }
    );
  };

  const encryptAndSaveFile = async (sourceUri: string, fileName: string, mimeType: string) => {
    if (!derivedKey) {
      Alert.alert('Error', 'No derived key available. Please enter your password.');
      return;
    }
    setUploading(true);
    try {
      // Read file data
      const fileData = await RNFS.readFile(sourceUri, 'base64');
      const uint8Array = new Uint8Array(
        atob(fileData)
          .split('')
          .map(char => char.charCodeAt(0))
      );

    // Encrypt and save file
    await FileManagerService.saveEncryptedFile(
      uint8Array,
      fileName, // original filename preserved in metadata
      mimeType,
      derivedKey,
      currentFolderPath, // Save to current folder
      [] // No tags for now
    );
      
      Alert.alert('Success', `File "${fileName}" uploaded and encrypted successfully`);
      await refreshFileList();
    } catch (error) {
      console.error('File upload error:', error);
      Alert.alert('Error', 'Failed to upload and encrypt file');
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
          Files will be encrypted and saved to: /{currentFolderPath.join('/')}
        </Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {uploading && (
          <View style={styles.uploadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.uploadingText}>Encrypting and uploading file...</Text>
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
                <Icon name={option.icon} size={28} color="#fff" />
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

        <View style={styles.infoContainer}>
          <Icon name="security" size={20} color="#34C759" />
          <Text style={styles.infoText}>
            All files are automatically encrypted with AES-256 encryption before being stored. 
            Your files are secured with your password and cannot be accessed without it.
          </Text>
        </View>

        <View style={styles.infoContainer}>
          <Icon name="info" size={20} color="#666" />
          <Text style={styles.infoText}>
            Files are stored locally on your device in encrypted format. 
            Make sure to remember your password as it cannot be recovered.
          </Text>
        </View>
      </ScrollView>
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
  content: {
    flex: 1,
  },
  uploadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  uploadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
  optionsContainer: {
    padding: 20,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    marginBottom: 12,
    borderRadius: 12,
    shadowColor: '#000',
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
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  optionSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  chevron: {
    marginLeft: 8,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
});

export default UploadScreen;
