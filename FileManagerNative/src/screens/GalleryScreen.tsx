import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
  RefreshControl,
  Modal,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFileContext } from '../context/FileContext';
import { usePasswordContext } from '../context/PasswordContext';
import { FileManagerService, EncryptedFile } from '../utils/FileManagerService';
import FileViewer from '../components/FileViewer';
import Icon from 'react-native-vector-icons/MaterialIcons';

const { width } = Dimensions.get('window');
const itemSize = (width - 48) / 3; // 3 columns with spacing

const GalleryScreen = () => {
  const { encryptedFiles, refreshFileList, loading } = useFileContext();
  const { password, derivedKey } = usePasswordContext();
  const [imageFiles, setImageFiles] = useState<EncryptedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<EncryptedFile | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [maxPreviews, setMaxPreviews] = useState(18);

  useEffect(() => {
    const images = encryptedFiles.filter(file => {
      return file.metadata.type.startsWith('image/');
    });
    setImageFiles(images);
    loadThumbnails(images);
  }, [encryptedFiles]);

  const loadThumbnails = async (images: EncryptedFile[]) => {
    if (!derivedKey) return;
    const start = Date.now();
    const newThumbnails = new Map<string, string>();

    for (const image of images) {
      const thumbStart = Date.now();
      try {
        // Try to load preview first, fallback to full image
        let imageData = await FileManagerService.getFilePreview(image.uuid, derivedKey);
        if (!imageData) {
          // Load full image if no preview
          const result = await FileManagerService.loadEncryptedFile(image.uuid, derivedKey);
          imageData = result.fileData;
        }
        if (imageData) {
          const base64String = Buffer.from(imageData).toString('base64');
          const dataUri = `data:${image.metadata.type};base64,${base64String}`;
          newThumbnails.set(image.uuid, dataUri);
        }
        const thumbEnd = Date.now();
        console.log('[GalleryScreen] Loaded thumbnail for', image.metadata.name, { uuid: image.uuid, durationMs: thumbEnd - thumbStart, timestamp: thumbEnd });
      } catch (error) {
        console.warn('[GalleryScreen] Failed to load thumbnail for', image.metadata.name, error);
      }
    }

    setThumbnails(newThumbnails);

    const end = Date.now();
    console.log('[GalleryScreen] loadThumbnails: END', { count: images.length, durationMs: end - start, timestamp: end });
  };

  const handleImagePress = async (image: EncryptedFile) => {
    if (!derivedKey) {
      Alert.alert('Error', 'No derived key available. Please enter your password.');
      return;
    }
    try {
      const result = await FileManagerService.loadEncryptedFile(image.uuid, derivedKey);
      setSelectedFile(image);
      setFileData(result.fileData);
      setViewerVisible(true);
    } catch (error) {
      console.error('Error loading image:', error);
      Alert.alert('Error', 'Failed to load image. Please check your password.');
    }
  };

  const renderImageItem = ({ item }: { item: EncryptedFile }) => {
    const thumbnailUri = thumbnails.get(item.uuid);
    
    return (
      <TouchableOpacity
        style={styles.imageItem}
        onPress={() => handleImagePress(item)}
      >
        <View style={styles.imageContainer}>
          {thumbnailUri ? (
            <Image
              source={{ uri: thumbnailUri }}
              style={styles.image}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.loadingContainer}>
              <Icon name="image" size={32} color="#ccc" />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          )}
          
          {/* Encrypted badge */}
          <View style={styles.encryptedBadge}>
            <Icon name="lock" size={12} color="#fff" />
          </View>
        </View>
        <Text style={styles.imageName} numberOfLines={1}>
          {item.metadata.name}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="photo-library" size={64} color="#ccc" />
      <Text style={styles.emptyText}>No images found</Text>
      <Text style={styles.emptySubtext}>Upload some images to see them here</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Gallery</Text>
        <Text style={styles.subtitle}>{imageFiles.length} encrypted images</Text>
        <View style={styles.inputRow}>
          <Text style={styles.inputLabel}>Max previews:</Text>
          <TextInput
            style={styles.input}
            value={maxPreviews.toString()}
            keyboardType="number-pad"
            onChangeText={text => {
              let val = parseInt(text, 10);
              if (isNaN(val)) val = 0;
              if (val < 0) val = 0;
              if (val > 40) val = 40;
              setMaxPreviews(val);
            }}
            maxLength={2}
          />
        </View>
      </View>

      <FlatList
        data={imageFiles.slice(0, maxPreviews)}
        renderItem={renderImageItem}
        keyExtractor={(item) => item.uuid}
        numColumns={3}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshFileList} />
        }
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={imageFiles.length === 0 ? styles.emptyContainer : styles.listContainer}
        columnWrapperStyle={imageFiles.length > 0 ? styles.row : undefined}
      />

      {/* Image Viewer Modal */}
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
  listContainer: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  row: {
    justifyContent: 'space-between',
  },
  imageItem: {
    width: itemSize,
    marginBottom: 16,
  },
  imageContainer: {
    width: itemSize,
    height: itemSize,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    width: '100%',
    height: '100%',
  },
  loadingText: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  encryptedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
    borderRadius: 8,
    padding: 2,
  },
  encryptedOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    width: '100%',
    height: '100%',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
  },
  encryptedText: {
    fontSize: 12,
    color: '#FF3B30',
    marginTop: 4,
    fontWeight: '600',
  },
  imageName: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 60,
    fontSize: 14,
    color: '#333',
  },
});

export default GalleryScreen;
