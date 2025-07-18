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
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFileContext } from '../context/FileContext';
import { usePasswordContext } from '../context/PasswordContext';
import { FileManagerService, EncryptedFile } from '../utils/FileManagerService';
import { uint8ArrayToBase64 } from '../utils/Base64Utils';
import FileViewer from '../components/FileViewer';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { ThemeContext } from '../theme';
import { showAlert } from '../utils/AlertUtils';

const { width } = Dimensions.get('window');
const itemSize = (width - 48) / 3; // 3 columns with spacing
const tallItemHeight = itemSize * 1.5; // Make images tall (1.5x aspect ratio)

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
    height: tallItemHeight,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: theme.surface,
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
    backgroundColor: theme.surface,
    width: '100%',
    height: '100%',
  },
  loadingText: {
    fontSize: 10,
    color: theme.textSecondary,
    marginTop: 4,
  },
  encryptedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: theme.error,
    borderRadius: 8,
    padding: 2,
  },
  encryptedOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.surface,
    width: '100%',
    height: '100%',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 8,
  },
  encryptedText: {
    fontSize: 12,
    color: theme.error,
    marginTop: 4,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 14,
    color: theme.textSecondary,
    marginRight: 8,
  },
  input: {
    backgroundColor: theme.inputBackground,
    borderWidth: 1,
    borderColor: theme.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    width: 60,
    fontSize: 14,
    color: theme.text,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
    width: '100%',
  },
  searchBarInput: {
    backgroundColor: theme.inputBackground,
    borderWidth: 1,
    borderColor: theme.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: theme.text,
    flex: 1,
  },
  tagSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 8,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.chipBackground,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 4,
  },
  selectedTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.chipBackground,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 4, // match tagChip
  },
  tagChipText: {
    color: theme.chipText,
    fontSize: 13,
    marginRight: 4,
  },
});

const GalleryScreen = () => {
  const { encryptedFiles, refreshFileList, loading } = useFileContext();
  const { password, derivedKey } = usePasswordContext();
  const [imageFiles, setImageFiles] = useState<EncryptedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<EncryptedFile | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [maxPreviews, setMaxPreviews] = useState(18);
  const [tagSearch, setTagSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const { theme } = React.useContext(ThemeContext);
  const styles = getStyles(theme);

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
          const base64String = uint8ArrayToBase64(imageData);
          const dataUri = `data:${image.metadata.type};base64,${base64String}`;
          newThumbnails.set(image.uuid, dataUri);
        }
        const thumbEnd = Date.now();
        console.log('[GalleryScreen] Loaded thumbnail for', { uuid: image.uuid, durationMs: thumbEnd - thumbStart, timestamp: thumbEnd });
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
      showAlert('Error', 'No derived key available. Please enter your password.');
      return;
    }
    try {
      const result = await FileManagerService.loadEncryptedFile(image.uuid, derivedKey);
      setSelectedFile(image);
      setFileData(result.fileData);
      setViewerVisible(true);
    } catch (error) {
      console.error('Error loading image:', error);
      showAlert('Error', 'Failed to load image. Please check your password.');
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
        </View>
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
        {/* Tag search bar */}
        <View style={styles.searchBarRow}>
          <TextInput
            style={styles.searchBarInput}
            value={tagSearch}
            onChangeText={setTagSearch}
            placeholder="Search tags..."
            editable={true}
          />
        </View>
        {/* Tag selector chips */}
        <View style={styles.tagSelectorRow}>
          {(() => {
            // Collect all tags from imageFiles
            const allTags: string[] = [];
            imageFiles.forEach(file => {
              if (Array.isArray(file.metadata.tags)) {
                allTags.push(...file.metadata.tags);
              }
            });
            // Count tag frequency
            const tagCounts: { [tag: string]: number } = {};
            allTags.forEach(tag => {
              tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            });

            // Selected tags row (always shown)
            const selectedTagChips: React.ReactNode[] = selectedTags.map(tag => (
              <TouchableOpacity
                key={tag}
                style={styles.selectedTagChip}
                onPress={() => {
                  setSelectedTags(selectedTags.filter(t => t !== tag));
                }}
              >
                <Text style={styles.tagChipText}>{tag}</Text>
                <Icon name="check" size={14} color="#fff" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            ));

            // Filter available tags:
            // - Not already selected
            // - Adding this tag to selectedTags would still match at least one image
            const possibleTags = Object.keys(tagCounts)
              .filter(tag => {
                if (selectedTags.includes(tag)) return false;
                if (!tag.toLowerCase().includes(tagSearch.toLowerCase())) return false;
                // If this tag is added, would any image match all selectedTags + this tag?
                const tagsToTest = [...selectedTags, tag];
                return imageFiles.some(file =>
                  Array.isArray(file.metadata.tags) && tagsToTest.every(t => file.metadata.tags.includes(t))
                );
              })
              .sort((a, b) => tagCounts[b] - tagCounts[a]);

            // Unselected tags row (fit to one line)
            const unselectedTagChips: React.ReactNode[] = [];
            let totalWidth = 0;
            const chipPadding = 20; // estimated: horizontal padding + margin
            const charWidth = 8; // estimated average width per character
            for (const tag of possibleTags) {
              const tagWidth = tag.length * charWidth + chipPadding;
              if (totalWidth + tagWidth > width) break;
              unselectedTagChips.push(
                <TouchableOpacity
                  key={tag}
                  style={styles.tagChip}
                  onPress={() => {
                    setSelectedTags([...selectedTags, tag]);
                  }}
                >
                  <Text style={styles.tagChipText}>{tag}</Text>
                </TouchableOpacity>
              );
              totalWidth += tagWidth;
            }

            // Only show selected tags row if there are selected tags
            if (selectedTagChips.length > 0) {
              return (
                <>
                  {/* Selected tags row (always first row) */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 }}>
                    {selectedTagChips}
                  </View>
                  {/* Unselected tags row (always second row, max one line) */}
                  <View style={{ flexDirection: 'row', flexWrap: 'nowrap' }}>
                    {unselectedTagChips}
                  </View>
                </>
              );
            } else {
              // Only unselected tags row if no selected tags
              return (
                <View style={{ flexDirection: 'row', flexWrap: 'nowrap' }}>
                  {unselectedTagChips}
                </View>
              );
            }
          })()}
        </View>
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
        data={
          imageFiles
            .filter(file =>
              selectedTags.length === 0
                ? true
                : Array.isArray(file.metadata.tags) && selectedTags.every(tag => file.metadata.tags.includes(tag))
            )
            .slice(0, maxPreviews)
        }
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
            onMetadataUpdated={refreshFileList}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
};

export default GalleryScreen;
