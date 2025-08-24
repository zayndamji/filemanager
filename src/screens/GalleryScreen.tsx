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
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFileContext, SortOption } from '../context/FileContext';
import { usePasswordContext } from '../context/PasswordContext';
import { EncryptedFile } from '../utils/FileManagerService';
import { useFileManagerService } from '../hooks/useFileManagerService';
import { uint8ArrayToBase64 } from '../utils/Base64Utils';
import FileViewer from '../components/FileViewer';
import WebCompatibleIcon from '../components/WebCompatibleIcon';
import SortDropdown from '../components/SortDropdown';
import { ThemeContext } from '../theme';
import { showAlert } from '../utils/AlertUtils';

// Interface for expanded image items (individual images from ImageSets)
interface ExpandedImageItem {
  uuid: string; // Original file UUID (for ImageSet) or individual image UUID
  imageIndex?: number; // Index within ImageSet (undefined for regular images)
  metadata: {
    name: string;
    type: string;
    size: number;
    tags: string[];
    encryptedAt: string;
  };
  isImageSet: boolean;
  originalFile: EncryptedFile; // Reference to the original file
  imageUuid?: string; // UUID of individual image file (for new ImageSet format)
}

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
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
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
  imageSetBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    padding: 4,
    flexDirection: 'row',
    alignItems: 'center',
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
    marginTop: 8,
    marginBottom: 8,
    height: 40, // Fixed height for horizontal scrolling
  },
  tagScrollContainer: {
    paddingRight: 16, // Add padding to the right for better scrolling
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
  const { encryptedFiles, refreshFileList, loading, sortBy, setSortBy } = useFileContext();
  const { password } = usePasswordContext();
  const fileManagerService = useFileManagerService();
  const [imageFiles, setImageFiles] = useState<EncryptedFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<EncryptedFile | null>(null);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [fileData, setFileData] = useState<Uint8Array | null>(null);
  const [isPreviewData, setIsPreviewData] = useState(false);
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map());
  const [visibleItems, setVisibleItems] = useState<Set<string>>(new Set());
  const [loadingThumbnails, setLoadingThumbnails] = useState<Set<string>>(new Set());
  const [maxPreviews, setMaxPreviews] = useState(40);
  const [tagSearch, setTagSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number>(0); // For ImageSet initial position
  const [expandedImages, setExpandedImages] = useState<ExpandedImageItem[]>([]);
  const [expandedImageData, setExpandedImageData] = useState<Map<string, any>>(new Map()); // Cache for ImageSet data
  const [screenData, setScreenData] = useState(() => {
    const { width } = Dimensions.get('window');
    const cols = getNumColumns(width);
    return {
      width,
      numColumns: cols,
      itemSize: (width - 16 * 2 - (cols - 1) * 16) / cols,
      tallItemHeight: ((width - 16 * 2 - (cols - 1) * 16) / cols) * 2
    };
  });

  const { theme } = React.useContext(ThemeContext);
  const styles = getStyles(theme, screenData);

  // Refs to access current state in stable callbacks
  const thumbnailsRef = useRef(thumbnails);
  const loadingThumbnailsRef = useRef(loadingThumbnails);
  const loadThumbnailRef = useRef<((image: EncryptedFile, useBackground?: boolean) => Promise<void>) | null>(null);

  // Update refs when state changes
  useEffect(() => {
    thumbnailsRef.current = thumbnails;
  }, [thumbnails]);

  useEffect(() => {
    loadingThumbnailsRef.current = loadingThumbnails;
  }, [loadingThumbnails]);

  // Sort files function (same as in FileContext but for images only)
  const sortImageFiles = (files: EncryptedFile[], sortOption: SortOption): EncryptedFile[] => {
    const sortedFiles = [...files];
    
    switch (sortOption) {
      case 'name':
        return sortedFiles.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
      case 'lastModified':
        return sortedFiles.sort((a, b) => {
          const aDate = new Date(a.metadata.encryptedAt);
          const bDate = new Date(b.metadata.encryptedAt);
          return bDate.getTime() - aDate.getTime(); // Most recent first
        });
      case 'uuid':
        return sortedFiles.sort((a, b) => a.uuid.localeCompare(b.uuid));
      case 'size':
        return sortedFiles.sort((a, b) => b.metadata.size - a.metadata.size); // Largest first
      default:
        return sortedFiles;
    }
  };

  // Function to show only primary images from ImageSets (instead of all individual images)
  const expandImageSets = async (files: EncryptedFile[]): Promise<ExpandedImageItem[]> => {
    const expandedItems: ExpandedImageItem[] = [];
    
    for (const file of files) {
      if (file.metadata.type === 'application/imageset') {
        // For ImageSet containers, find their individual images
        const imageSetImages = files.filter(f => f.metadata.parentImageSet === file.uuid);
        
        if (imageSetImages.length > 0) {
          // Sort the individual images the same way as in ImageSet component
          const sortedImageSetImages = sortImageFiles(imageSetImages, sortBy);
          
          // Only use the first (primary) image from the ImageSet
          console.log('[GalleryScreen] Found', imageSetImages.length, 'individual images for ImageSet:', file.uuid, '- showing only primary image');
          const primaryImage = sortedImageSetImages[0];
          if (primaryImage) {
            expandedItems.push({
              uuid: primaryImage.uuid, // Use the actual individual image UUID
              imageIndex: 0, // Always 0 since we're showing the primary image
              metadata: {
                name: file.metadata.name, // Use ImageSet name instead of individual image name
                type: primaryImage.metadata.type,
                size: primaryImage.metadata.size,
                tags: file.metadata.tags, // Use ImageSet tags
                encryptedAt: primaryImage.metadata.encryptedAt,
              },
              isImageSet: true,
              originalFile: file, // Keep reference to ImageSet container
              imageUuid: primaryImage.uuid // Store the individual image UUID for loading
            });
          }
        } else {
          // Fallback for old ImageSet format - load and parse the data
          console.log('[GalleryScreen] No individual images found, loading old format ImageSet:', file.uuid);
          if (!expandedImageData.has(file.uuid)) {
            try {
              // Load and parse the ImageSet data
              const result = await fileManagerService.loadEncryptedFile(file.uuid);
              const jsonString = new TextDecoder().decode(result.fileData);
              const imageSetData = JSON.parse(jsonString);
              
              // Cache the data
              const newExpandedImageData = new Map(expandedImageData);
              newExpandedImageData.set(file.uuid, imageSetData);
              setExpandedImageData(newExpandedImageData);
              
              // Only add the first (primary) image from this ImageSet
              if (imageSetData.images && imageSetData.images.length > 0) {
                const primaryImg = imageSetData.images[0];
                expandedItems.push({
                  uuid: `${file.uuid}_0`, // Virtual UUID for old format primary image
                  imageIndex: 0,
                  metadata: {
                    name: file.metadata.name, // Use ImageSet name
                    type: primaryImg.mimeType,
                    size: 0,
                    tags: file.metadata.tags,
                    encryptedAt: file.metadata.encryptedAt,
                  },
                  isImageSet: true,
                  originalFile: file
                });
              }
            } catch (error) {
              console.error('[GalleryScreen] Failed to load old ImageSet:', file.uuid, error);
              // Add as a single item if parsing fails
              expandedItems.push({
                uuid: file.uuid,
                metadata: file.metadata,
                isImageSet: true,
                originalFile: file
              });
            }
          } else {
            // Use cached data for old format - only show primary image
            const imageSetData = expandedImageData.get(file.uuid);
            if (imageSetData && imageSetData.images && imageSetData.images.length > 0) {
              const primaryImg = imageSetData.images[0];
              expandedItems.push({
                uuid: `${file.uuid}_0`,
                imageIndex: 0,
                metadata: {
                  name: file.metadata.name, // Use ImageSet name
                  type: primaryImg.mimeType,
                  size: 0,
                  tags: file.metadata.tags,
                  encryptedAt: file.metadata.encryptedAt,
                },
                isImageSet: true,
                originalFile: file
              });
            }
          }
        }
      } else if (file.metadata.parentImageSet) {
        // Skip individual ImageSet images here - they're handled above
        console.log('[GalleryScreen] Skipping individual ImageSet image:', file.uuid, 'parent:', file.metadata.parentImageSet);
        continue;
      } else {
        // Regular image file
        expandedItems.push({
          uuid: file.uuid,
          metadata: file.metadata,
          isImageSet: false,
          originalFile: file
        });
      }
    }
    
    console.log('[GalleryScreen] expandImageSets completed (showing primary images only):', {
      inputFiles: files.length,
      outputItems: expandedItems.length,
      breakdown: expandedItems.reduce((acc, item) => {
        const type = item.isImageSet ? 'imageset-primary' : 'regular-image';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    });
    
    return expandedItems;
  };

  useEffect(() => {
    const loadAllImageFiles = async () => {
      try {
        // Get all files including individual ImageSet images
        const allFiles = await fileManagerService.listEncryptedFiles();
        
        // Filter for images (individual images + ImageSet containers)
        const images = allFiles.filter(file => {
          return file.metadata.type.startsWith('image/') || file.metadata.type === 'application/imageset';
        });
        
        console.log('[GalleryScreen] All image files loaded:', {
          totalFiles: allFiles.length,
          imageFiles: images.length,
          breakdown: images.reduce((acc, file) => {
            const type = file.metadata.type === 'application/imageset' ? 'imageset' : 
                       file.metadata.parentImageSet ? 'imageset-image' : 'regular-image';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        });
        
        const sortedImages = sortImageFiles(images, sortBy);
        setImageFiles(sortedImages);
        
        // Expand ImageSets and set expanded images
        expandImageSets(sortedImages).then(expanded => {
          setExpandedImages(expanded);
        });
      } catch (error) {
        console.error('[GalleryScreen] Failed to load image files:', error);
      }
    };
    
    loadAllImageFiles();
  }, [sortBy, expandedImageData]); // Removed encryptedFiles dependency since we load all files directly

  // Trigger initial thumbnail loading when expandedImages is populated
  React.useEffect(() => {
    if (expandedImages.length > 0 && imageFiles.length > 0) {
      console.log('[GalleryScreen] Triggering initial thumbnail loading for', expandedImages.length, 'expanded images');
      loadThumbnails(imageFiles);
    }
  }, [expandedImages.length, imageFiles.length]);

  // Listen for screen dimension changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      const cols = getNumColumns(window.width);
      setScreenData({
        width: window.width,
        numColumns: cols,
        itemSize: (window.width - 16 * 2 - (cols - 1) * 16) / cols,
        tallItemHeight: ((window.width - 16 * 2 - (cols - 1) * 16) / cols) * 2
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
    console.log('[GalleryScreen] loadThumbnail called for:', {
      uuid: image.uuid,
      name: image.metadata.name,
      type: image.metadata.type,
      useBackground,
      currentlyHasThumbnail: thumbnailsRef.current.has(image.uuid),
      currentlyLoading: loadingThumbnailsRef.current.has(image.uuid)
    });
    
    if (thumbnailsRef.current.has(image.uuid) || loadingThumbnailsRef.current.has(image.uuid)) {
      console.log('[GalleryScreen] Skipping loadThumbnail - already exists or loading');
      return;
    }

    const newLoadingThumbnails = new Set(loadingThumbnailsRef.current);
    newLoadingThumbnails.add(image.uuid);
    setLoadingThumbnails(newLoadingThumbnails);
    console.log('[GalleryScreen] Set loading state for:', image.uuid);

    const doLoad = async () => {
      try {
        const thumbStart = Date.now();
        console.log('[GalleryScreen] Starting getFilePreview for:', image.uuid);
        
        // For individual images (including those from ImageSets), load preview directly
        const imageData = await fileManagerService.getFilePreview(image.uuid);
        console.log('[GalleryScreen] getFilePreview result:', {
          uuid: image.uuid,
          hasData: !!imageData,
          dataLength: imageData?.length
        });
        
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
            
            console.log('[GalleryScreen] Thumbnail stored for:', image.uuid, 'total thumbnails:', newThumbnails.size);
            return newThumbnails;
          });
          
          const thumbEnd = Date.now();
          console.log('[GalleryScreen] Loaded thumbnail for', { uuid: image.uuid, durationMs: thumbEnd - thumbStart, timestamp: thumbEnd });
        } else {
          console.warn('[GalleryScreen] No preview data returned for:', image.uuid);
        }
      } catch (error) {
        console.warn('[GalleryScreen] Failed to load thumbnail for', image.metadata.name, error);
      } finally {
        setLoadingThumbnails(prev => {
          const newSet = new Set(prev);
          newSet.delete(image.uuid);
          console.log('[GalleryScreen] Cleared loading state for:', image.uuid);
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
    console.log('[GalleryScreen] onViewableItemsChanged called with', viewableItems.length, 'items');
    const newVisibleItems = new Set(viewableItems.map(item => item.item.uuid));
    setVisibleItems(newVisibleItems);
    
    // Very minimal debounce to avoid excessive calls but stay highly responsive
    setTimeout(() => {
      viewableItems.forEach(({ item }) => {
        // Use individual image UUID for new ImageSet format, or original file UUID for regular images and old ImageSets
        const thumbnailKey = item.imageUuid || item.originalFile.uuid;
        
        console.log('[GalleryScreen] Processing viewable item:', {
          itemUuid: item.uuid,
          thumbnailKey,
          imageUuid: item.imageUuid,
          isImageSet: item.isImageSet,
          imageIndex: item.imageIndex,
          hasThumbnail: thumbnailsRef.current.has(thumbnailKey),
          isLoading: loadingThumbnailsRef.current.has(thumbnailKey),
          hasLoadFunction: !!loadThumbnailRef.current
        });
        
        // Check current state using refs to avoid stale closures
        if (!thumbnailsRef.current.has(thumbnailKey) && !loadingThumbnailsRef.current.has(thumbnailKey) && loadThumbnailRef.current) {
          console.log('[GalleryScreen] Starting thumbnail load for:', thumbnailKey);
          
          // For new ImageSet format, create individual image file reference
          if (item.imageUuid) {
            const individualImageFile: EncryptedFile = {
              uuid: item.imageUuid,
              metadata: {
                name: item.metadata.name,
                type: item.metadata.type,
                size: item.metadata.size,
                folderPath: item.originalFile.metadata.folderPath,
                tags: item.metadata.tags,
                uuid: item.imageUuid,
                encryptedAt: item.metadata.encryptedAt,
                version: '2.0'
              },
              filePath: '',
              metadataPath: '',
              isEncrypted: true
            };
            loadThumbnailRef.current(individualImageFile);
          } else {
            // Fallback to original file for old format
            loadThumbnailRef.current(item.originalFile);
          }
        } else {
          console.log('[GalleryScreen] Skipping thumbnail load for:', thumbnailKey, {
            alreadyHasThumbnail: thumbnailsRef.current.has(thumbnailKey),
            alreadyLoading: loadingThumbnailsRef.current.has(thumbnailKey),
            noLoadFunction: !loadThumbnailRef.current
          });
        }
      });
    }, 25); // Reduced to 25ms debounce for maximum responsiveness
  }, []); // Empty dependency array to keep callback stable

  const viewabilityConfig = {
    itemVisiblePercentThreshold: 5, // Load when just 5% visible (very sensitive)
    minimumViewTime: 50, // Wait only 50ms to avoid excessive calls
    waitForInteraction: false, // Don't wait - load immediately when visible
  };

  // Simplified initial load - load thumbnails for first few visible items to kickstart the gallery
  const loadThumbnails = async (images: EncryptedFile[]) => {
    console.log('[GalleryScreen] Initial loading for first visible items from', images.length, 'total images');
    
    if (!loadThumbnailRef.current || expandedImages.length === 0) {
      console.log('[GalleryScreen] No thumbnail function or expanded images available yet');
      return;
    }

    // Load thumbnails for the first row of items (based on numColumns)
    const initialLoadCount = Math.min(numColumns * 2, expandedImages.length); // Load 2 rows initially
    
    for (let i = 0; i < initialLoadCount; i++) {
      const item = expandedImages[i];
      const thumbnailKey = item.imageUuid || item.originalFile.uuid;
      
      // Skip if already loaded or loading
      if (thumbnailsRef.current.has(thumbnailKey) || loadingThumbnailsRef.current.has(thumbnailKey)) {
        continue;
      }
      
      console.log('[GalleryScreen] Loading initial thumbnail for:', thumbnailKey);
      
      // For new ImageSet format, create individual image file reference
      if (item.imageUuid) {
        const individualImageFile: EncryptedFile = {
          uuid: item.imageUuid,
          metadata: {
            name: item.metadata.name,
            type: item.metadata.type,
            size: item.metadata.size,
            folderPath: item.originalFile.metadata.folderPath,
            tags: item.metadata.tags,
            uuid: item.imageUuid,
            encryptedAt: item.metadata.encryptedAt,
            version: '2.0'
          },
          filePath: '',
          metadataPath: '',
          isEncrypted: true
        };
        loadThumbnailRef.current(individualImageFile, true); // Use background loading for initial load
      } else {
        // Fallback to original file for old format
        loadThumbnailRef.current(item.originalFile, true);
      }
    }
  };

  // Get filtered expanded images for navigation
  const filteredImages = expandedImages.filter(item =>
    selectedTags.length === 0
      ? true
      : Array.isArray(item.metadata.tags) && selectedTags.every(tag => item.metadata.tags.includes(tag))
  );

  // Navigation functions for gallery viewer
  const navigateToNextImage = () => {
    if (filteredImages.length === 0) return;
    
    const nextIndex = (currentImageIndex + 1) % filteredImages.length;
    const nextImage = filteredImages[nextIndex];
    setCurrentImageIndex(nextIndex);
    handleImagePress(nextImage);
  };

  const navigateToPrevImage = () => {
    if (filteredImages.length === 0) return;
    
    const prevIndex = currentImageIndex === 0 ? filteredImages.length - 1 : currentImageIndex - 1;
    const prevImage = filteredImages[prevIndex];
    setCurrentImageIndex(prevIndex);
    handleImagePress(prevImage);
  };

  const handleImagePress = async (expandedItem: ExpandedImageItem) => {
    // Set the current image index for navigation
    const imageIndex = filteredImages.findIndex(img => img.uuid === expandedItem.uuid);
    if (imageIndex >= 0) {
      setCurrentImageIndex(imageIndex);
    }
    
    try {
      if (expandedItem.isImageSet && expandedItem.imageIndex !== undefined) {
        // For ImageSet items, open the FileViewer with the ImageSet and specific image index
        const result = await fileManagerService.loadEncryptedFile(expandedItem.originalFile.uuid);
        setSelectedFile(expandedItem.originalFile);
        setFileData(result.fileData);
        setIsPreviewData(false);
        setSelectedImageIndex(expandedItem.imageIndex); // Set the initial image index
        setViewerVisible(true);
      } else {
        // Regular image file - try to load preview first for faster initial display
        const previewData = await fileManagerService.getFilePreview(expandedItem.originalFile.uuid);
        if (previewData) {
          setSelectedFile(expandedItem.originalFile);
          setFileData(previewData);
          setIsPreviewData(true);
          setViewerVisible(true);
          return;
        }
        
        // Fallback to loading full image if preview is not available
        const result = await fileManagerService.loadEncryptedFile(expandedItem.originalFile.uuid);
        setSelectedFile(expandedItem.originalFile);
        setFileData(result.fileData);
        setIsPreviewData(false);
        setViewerVisible(true);
      }
    } catch (error) {
      console.error('Error loading image:', error);
      showAlert('Error', 'Failed to load image. Please check your password.');
    }
  };

  const renderImageItem = useCallback(({ item }: { item: ExpandedImageItem }) => {
    // For thumbnails, use the individual image UUID for new ImageSet format, or original file UUID for regular images and old ImageSets
    const thumbnailKey = item.imageUuid || item.originalFile.uuid;
    
    const thumbnailUri = thumbnails.get(thumbnailKey);
    const isLoading = loadingThumbnails.has(thumbnailKey);
    
    console.log('[GalleryScreen] renderImageItem:', {
      itemUuid: item.uuid,
      thumbnailKey,
      imageUuid: item.imageUuid,
      hasThumbnail: !!thumbnailUri,
      isLoading,
      isImageSet: item.isImageSet,
      imageIndex: item.imageIndex
    });
    
    return (
      <TouchableOpacity
        style={styles.imageItem}
        onPress={() => {
          if (thumbnailUri) {
            handleImagePress(item);
          } else if (!isLoading) {
            console.log('[GalleryScreen] Manual thumbnail load triggered for:', thumbnailKey);
            // Load thumbnail on tap if not already loading
            if (loadThumbnailRef.current) {
              // For new ImageSet format, we need to create a mock EncryptedFile for the individual image
              if (item.imageUuid) {
                const individualImageFile: EncryptedFile = {
                  uuid: item.imageUuid,
                  metadata: {
                    name: item.metadata.name,
                    type: item.metadata.type,
                    size: item.metadata.size,
                    folderPath: item.originalFile.metadata.folderPath,
                    tags: item.metadata.tags,
                    uuid: item.imageUuid,
                    encryptedAt: item.metadata.encryptedAt,
                    version: '2.0'
                  },
                  filePath: '', // Will be resolved by FileManagerService
                  metadataPath: '',
                  isEncrypted: true
                };
                loadThumbnailRef.current(individualImageFile, false);
              } else {
                // Fallback to original file for old format
                loadThumbnailRef.current(item.originalFile, false);
              }
            }
          }
        }}
      >
        <View style={styles.imageContainer}>
          {thumbnailUri ? (
            <>
              <Image
                source={{ uri: thumbnailUri }}
                style={styles.image}
                resizeMode="cover"
              />
              {/* Show badge for ImageSets to indicate multiple images */}
              {item.isImageSet && (
                <View style={styles.imageSetBadge}>
                  <WebCompatibleIcon name="collections" size={16} color="#fff" />
                </View>
              )}
            </>
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
      {Platform.OS !== 'web' ? (
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1 }}>
            <View style={styles.header}>
              <Text style={styles.title}>Gallery</Text>
              <Text style={styles.subtitle}>{imageFiles.length} encrypted images</Text>
              
              {/* Header Controls with Sort Dropdown */}
              <View style={styles.headerControls}>
                <View /> {/* Empty spacer for alignment */}
                <SortDropdown 
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  theme={theme}
                />
              </View>
              
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
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tagScrollContainer}
              >
                {(() => {
                  // Collect all tags from expandedImages (avoiding duplicates)
                  const allTags: string[] = [];
                  const seenTags = new Set<string>();
                  expandedImages.forEach(item => {
                    if (Array.isArray(item.metadata.tags)) {
                      item.metadata.tags.forEach(tag => {
                        if (!seenTags.has(tag)) {
                          allTags.push(tag);
                          seenTags.add(tag);
                        }
                      });
                    }
                  });
                  // Count tag frequency
                  const tagCounts: { [tag: string]: number } = {};
                  allTags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                  });

                  // Selected tags (always shown first)
                  const selectedTagChips: React.ReactNode[] = selectedTags.map(tag => (
                    <TouchableOpacity
                      key={`selected-${tag}`}
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
                  // - Match search filter
                  // - Adding this tag to selectedTags would still match at least one image
                  const availableTags = Object.keys(tagCounts)
                    .filter(tag => {
                      if (selectedTags.includes(tag)) return false;
                      if (!tag.toLowerCase().includes(tagSearch.toLowerCase())) return false;
                      // If this tag is added, would any image match all selectedTags + this tag?
                      const tagsToTest = [...selectedTags, tag];
                      return expandedImages.some(item =>
                        Array.isArray(item.metadata.tags) && tagsToTest.every(t => item.metadata.tags.includes(t))
                      );
                    })
                    .sort((a, b) => tagCounts[b] - tagCounts[a]);

                  // Unselected tags
                  const unselectedTagChips: React.ReactNode[] = availableTags.map(tag => (
                    <TouchableOpacity
                      key={`unselected-${tag}`}
                      style={styles.tagChip}
                      onPress={() => {
                        setSelectedTags([...selectedTags, tag]);
                      }}
                    >
                      <Text style={styles.tagChipText}>{tag}</Text>
                    </TouchableOpacity>
                  ));

                  // Combine selected and unselected tags
                  return [...selectedTagChips, ...unselectedTagChips];
                })()}
              </ScrollView>
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
                  if (val > 200) val = 200;
                  setMaxPreviews(val);
                }}
                maxLength={3}
              />
            </View>
          </View>

          <FlatList<ExpandedImageItem>
            data={filteredImages.slice(0, maxPreviews)}
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
            contentContainerStyle={filteredImages.length === 0 ? styles.emptyContainer : styles.galleryContainer}
            columnWrapperStyle={screenData.numColumns > 1 ? styles.row : { justifyContent: 'center', marginBottom: 16 }}
          />
        </View>
      </TouchableWithoutFeedback>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.header}>
            <Text style={styles.title}>Gallery</Text>
            <Text style={styles.subtitle}>{imageFiles.length} encrypted images</Text>
            
            {/* Header Controls with Sort Dropdown */}
            <View style={styles.headerControls}>
              <View /> {/* Empty spacer for alignment */}
              <SortDropdown 
                sortBy={sortBy}
                onSortChange={setSortBy}
                theme={theme}
              />
            </View>
            
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
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tagScrollContainer}
              >
                {(() => {
                  // Collect all tags from expandedImages (avoiding duplicates)
                  const allTags: string[] = [];
                  const seenTags = new Set<string>();
                  expandedImages.forEach(item => {
                    if (Array.isArray(item.metadata.tags)) {
                      item.metadata.tags.forEach(tag => {
                        if (!seenTags.has(tag)) {
                          allTags.push(tag);
                          seenTags.add(tag);
                        }
                      });
                    }
                  });
                  // Count tag frequency
                  const tagCounts: { [tag: string]: number } = {};
                  allTags.forEach(tag => {
                    tagCounts[tag] = (tagCounts[tag] || 0) + 1;
                  });

                  // Selected tags (always shown first)
                  const selectedTagChips: React.ReactNode[] = selectedTags.map(tag => (
                    <TouchableOpacity
                      key={`selected-${tag}`}
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
                  // - Match search filter
                  // - Adding this tag to selectedTags would still match at least one image
                  const availableTags = Object.keys(tagCounts)
                    .filter(tag => {
                      if (selectedTags.includes(tag)) return false;
                      if (!tag.toLowerCase().includes(tagSearch.toLowerCase())) return false;
                      // If this tag is added, would any image match all selectedTags + this tag?
                      const tagsToTest = [...selectedTags, tag];
                      return expandedImages.some(item =>
                        Array.isArray(item.metadata.tags) && tagsToTest.every(t => item.metadata.tags.includes(t))
                      );
                    })
                    .sort((a, b) => tagCounts[b] - tagCounts[a]);

                  // Unselected tags
                  const unselectedTagChips: React.ReactNode[] = availableTags.map(tag => (
                    <TouchableOpacity
                      key={`unselected-${tag}`}
                      style={styles.tagChip}
                      onPress={() => {
                        setSelectedTags([...selectedTags, tag]);
                      }}
                    >
                      <Text style={styles.tagChipText}>{tag}</Text>
                    </TouchableOpacity>
                  ));

                  // Combine selected and unselected tags
                  return [...selectedTagChips, ...unselectedTagChips];
                })()}
              </ScrollView>
            </View>
            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>Max previews:</Text>
              <TextInput
                style={styles.input}
                value={maxPreviews.toString()}
                keyboardType="number-pad"
                onChangeText={text => {
                  let val = parseInt(text, 10);
                  if (isNaN(val)) val = 5;
                  if (val < 5) val = 5;
                  if (val > 150) val = 150;
                  setMaxPreviews(val);
                }}
                maxLength={2}
              />
            </View>
          </View>

          <FlatList<ExpandedImageItem>
            data={filteredImages.slice(0, maxPreviews)}
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
            contentContainerStyle={filteredImages.length === 0 ? styles.emptyContainer : styles.galleryContainer}
            columnWrapperStyle={screenData.numColumns > 1 ? styles.row : { justifyContent: 'center', marginBottom: 16 }}
          />
        </View>
      )}

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
            onClose={() => {
              setViewerVisible(false);
              setSelectedImageIndex(0); // Reset to first image
            }}
            onMetadataUpdated={refreshFileList}
            isPreviewData={isPreviewData}
            onNavigateNext={navigateToNextImage}
            onNavigatePrev={navigateToPrevImage}
            hasNext={filteredImages.length > 1}
            hasPrev={filteredImages.length > 1}
            initialImageIndex={selectedImageIndex}
          />
        )}
      </Modal>
    </SafeAreaView>
  );
};

export default GalleryScreen;
