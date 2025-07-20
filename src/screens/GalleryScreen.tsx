import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  TextInput,
  Button,
  ScrollView,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFileContext } from '../context/FileContext';
import { usePasswordContext } from '../context/PasswordContext';
import { FileManagerService, EncryptedFile } from '../utils/FileManagerService';
import { uint8ArrayToBase64 } from '../utils/Base64Utils';
import FileViewer from '../components/FileViewer';
import WebCompatibleIcon from '../components/WebCompatibleIcon';
import { ThemeContext } from '../theme';
import { showAlert } from '../utils/AlertUtils';

const { width } = Dimensions.get('window');

// Responsive column calculation
const getNumColumns = (screenWidth: number) => {
  if (screenWidth < 480) return 2;      // Small phones
  if (screenWidth < 768) return 3;      // Large phones
  if (screenWidth < 1024) return 4;     // Tablets
  if (screenWidth < 1440) return 5;     // Small desktop
  return 6;                             // Large desktop
};

const numColumns = getNumColumns(width);
const itemSize = (width - 16 * 2 - (numColumns - 1) * 16) / numColumns; // Account for padding and gaps
const tallItemHeight = itemSize * 1.2; // Make images slightly tall (1.2x aspect ratio)

const getStyles = (theme: typeof import('../theme').darkTheme, screenData: { width: number, numColumns: number, itemSize: number, tallItemHeight: number }) => StyleSheet.create({
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
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  galleryContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    justifyContent: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  imageItem: {
    width: screenData.itemSize,
    marginHorizontal: 8,
    marginVertical: 4,
  },
  imageContainer: {
    width: screenData.itemSize,
    height: screenData.tallItemHeight,
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
  const [isPreviewData, setIsPreviewData] = useState(false);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [visibleItems, setVisibleItems] = useState<Set<string>>(new Set());
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(new Set());
  const [maxPreviews, setMaxPreviews] = useState(18);
  const [tagSearch, setTagSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [screenData, setScreenData] = useState(() => {
    const { width } = Dimensions.get('window');
    const cols = getNumColumns(width);
    return {
      width,
      numColumns: cols,
      itemSize: (width - 16 * 2 - (cols - 1) * 16) / cols,
      tallItemHeight: ((width - 16 * 2 - (cols - 1) * 16) / cols) * 1.2
    };
  });

  const { theme } = React.useContext(ThemeContext);
  const styles = getStyles(theme, screenData);

  // Refs to access current state in stable callbacks
  const thumbnailsRef = useRef(thumbnails);
  const loadingThumbnailsRef = useRef(loadingThumbnails);
  const derivedKeyRef = useRef(derivedKey);
  const loadThumbnailRef = useRef<((image: EncryptedFile, useBackground?: boolean) => Promise<void>) | null>(null);

  // Update refs when state changes
  useEffect(() => {
    thumbnailsRef.current = thumbnails;
  }, [thumbnails]);

  useEffect(() => {
    loadingThumbnailsRef.current = loadingThumbnails;
  }, [loadingThumbnails]);

  useEffect(() => {
    derivedKeyRef.current = derivedKey;
  }, [derivedKey]);

  useEffect(() => {
    const images = encryptedFiles.filter(file => {
      return file.metadata.type.startsWith('image/');
    });
    setImageFiles(images);
    loadThumbnails(images);
  }, [encryptedFiles]);

  // Listen for screen dimension changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      const cols = getNumColumns(window.width);
      setScreenData({
        width: window.width,
        numColumns: cols,
        itemSize: (window.width - 16 * 2 - (cols - 1) * 16) / cols,
        tallItemHeight: ((window.width - 16 * 2 - (cols - 1) * 16) / cols) * 1.2
      });
    });

    return () => subscription?.remove();
  }, []);

  // Cleanup effect to clear thumbnails when component unmounts
  useEffect(() => {
    return () => {
      // Clear thumbnails to free memory
      setThumbnails(new Map());
      setLoadingThumbnails(new Set());
    };
  }, []);

  // Lazy load individual thumbnails for visible items with optional background processing
  const loadThumbnail = useCallback(async (image: EncryptedFile, useBackground = false) => {
    if (!derivedKeyRef.current || thumbnailsRef.current.has(image.uuid) || loadingThumbnailsRef.current.has(image.uuid)) {
      return;
    }

    const newLoadingThumbnails = new Set(loadingThumbnailsRef.current);
    newLoadingThumbnails.add(image.uuid);
    setLoadingThumbnails(newLoadingThumbnails);

    const doLoad = async () => {
      try {
        const thumbStart = Date.now();
        // Load preview only - no fallback to full image for performance
        const imageData = await FileManagerService.getFilePreview(image.uuid, derivedKeyRef.current!);
        if (imageData) {
          const base64String = uint8ArrayToBase64(imageData);
          const dataUri = `data:${image.metadata.type};base64,${base64String}`;
          
          setThumbnails(prev => {
            const newThumbnails = new Map(prev);
            newThumbnails.set(image.uuid, dataUri);
            
            // Limit cache size to prevent memory issues (max 20 thumbnails)
            if (newThumbnails.size > 20) {
              const firstKey = newThumbnails.keys().next().value;
              if (firstKey) {
                newThumbnails.delete(firstKey);
              }
            }
            
            return newThumbnails;
          });
          
          const thumbEnd = Date.now();
          console.log('[GalleryScreen] Loaded thumbnail for', { uuid: image.uuid, durationMs: thumbEnd - thumbStart, timestamp: thumbEnd });
        }
      } catch (error) {
        console.warn('[GalleryScreen] Failed to load thumbnail for', image.metadata.name, error);
      } finally {
        setLoadingThumbnails(prev => {
          const newSet = new Set(prev);
          newSet.delete(image.uuid);
          return newSet;
        });
      }
    };

    // Use InteractionManager only for background loading, immediate for visible items
    if (useBackground) {
      InteractionManager.runAfterInteractions(doLoad);
    } else {
      doLoad();
    }
  }, []);

  // Store loadThumbnail in ref for stable access
  loadThumbnailRef.current = loadThumbnail;

  // Handle viewable items changed with minimal debouncing for responsiveness
  // Use refs to avoid recreating the callback and causing FlatList errors
  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: any[] }) => {
    const newVisibleItems = new Set(viewableItems.map(item => item.item.uuid));
    setVisibleItems(newVisibleItems);
    
    // Very minimal debounce to avoid excessive calls but stay highly responsive
    setTimeout(() => {
      viewableItems.forEach(({ item }) => {
        // Check current state using refs to avoid stale closures
        if (!thumbnailsRef.current.has(item.uuid) && !loadingThumbnailsRef.current.has(item.uuid) && derivedKeyRef.current && loadThumbnailRef.current) {
          loadThumbnailRef.current(item);
        }
      });
    }, 25); // Reduced to 25ms debounce for maximum responsiveness
  }, []); // Empty dependency array to keep callback stable

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 5, // Load when just 5% visible (very sensitive)
    minimumViewTime: 50, // Wait only 50ms to avoid excessive calls
    waitForInteraction: false, // Don't wait - load immediately when visible
  };

  // Simplified initial load - don't load ANY thumbnails initially for fastest startup
  const loadThumbnails = async (images: EncryptedFile[]) => {
    // Do nothing - all thumbnails will be loaded lazily when they become visible
    console.log('[GalleryScreen] Lazy loading enabled for', images.length, 'images');
  };

  const handleImagePress = async (image: EncryptedFile) => {
    if (!derivedKey) {
      showAlert('Error', 'No derived key available. Please enter your password.');
      return;
    }
    try {
      // For image files, try to load preview first for faster initial display
      const previewData = await FileManagerService.getFilePreview(image.uuid, derivedKey);
      if (previewData) {
        setSelectedFile(image);
        setFileData(previewData);
        setIsPreviewData(true);
        setViewerVisible(true);
        return;
      }
      
      // Fallback to loading full image if preview is not available
      const result = await FileManagerService.loadEncryptedFile(image.uuid, derivedKey);
      setSelectedFile(image);
      setFileData(result.fileData);
      setIsPreviewData(false);
      setViewerVisible(true);
    } catch (error) {
      console.error('Error loading image:', error);
      showAlert('Error', 'Failed to load image. Please check your password.');
    }
  };

  const renderImageItem = useCallback(({ item }: { item: EncryptedFile }) => {
    const thumbnailUri = thumbnails.get(item.uuid);
    const isLoading = loadingThumbnails.has(item.uuid);
    
    return (
      <TouchableOpacity
        style={styles.imageItem}
        onPress={() => {
          if (thumbnailUri) {
            handleImagePress(item);
          } else if (!isLoading) {
            // Load thumbnail on tap if not already loading
            loadThumbnail(item);
          }
        }}
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
              <WebCompatibleIcon 
                name={isLoading ? "hourglass-empty" : "image"} 
                size={32} 
                color={isLoading ? "#007AFF" : "#ccc"} 
              />
              <Text style={styles.loadingText}>
                {isLoading ? 'Loading...' : 'Tap to load'}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  }, [thumbnails, loadingThumbnails, styles]);

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <WebCompatibleIcon name="photo-library" size={64} color="#ccc" />
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
                <WebCompatibleIcon name="check" size={14} color="#fff" />
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
        numColumns={screenData.numColumns}
        key={`columns-${screenData.numColumns}`} // Force re-render when columns change
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        removeClippedSubviews={true}
        maxToRenderPerBatch={8}
        initialNumToRender={8}
        windowSize={5}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refreshFileList} />
        }
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={imageFiles.length === 0 ? styles.emptyContainer : styles.galleryContainer}
        columnWrapperStyle={screenData.numColumns > 1 ? styles.row : { justifyContent: 'center', marginBottom: 16 }}
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
            isPreviewData={isPreviewData}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
};

export default GalleryScreen;
