// ImageSet file renderer component
import React, { useState, useContext } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions, ActivityIndicator, Image } from 'react-native';
import { ThemeContext } from '../../theme';
import ImageFile from './ImageFile';
import WebCompatibleIcon from '../WebCompatibleIcon';
import { useFileManagerService } from '../../hooks/useFileManagerService';
import { useFileContext, SortOption } from '../../context/FileContext';
import { uint8ArrayToBase64 } from '../../utils/Base64Utils';

const { width } = Dimensions.get('window');

// Props for ImageSet renderer
interface ImageSetProps {
  fileData: Uint8Array; // The ImageSet metadata (contains references to individual images)
  mimeType: string; // Should be 'application/imageset'
  isPreview?: boolean;
  style?: any;
  initialImageIndex?: number; // Optional - which image to start with
  metadata?: any; // File metadata containing imageSetImages references
}

interface ImageSetData {
  metadata: {
    name: string;
    description?: string;
    totalImages: number;
  };
  imageRefs?: Array<{ // References to individual image files (new format)
    uuid: string;
    name: string;
    mimeType: string;
    size: number;
  }>;
  images?: Array<{ // Embedded image data (old format fallback)
    name: string;
    mimeType: string;
    data: Uint8Array;
  }>;
}

interface LoadedImage {
  name: string;
  mimeType: string;
  previewData: Uint8Array | null; // Preview data (loaded first)
  fullData: Uint8Array | null; // Full data (loaded on demand)
  isLoadingPreview: boolean;
  isLoadingFull: boolean;
  error?: string;
}

const ImageSet: React.FC<ImageSetProps> = ({ 
  fileData, 
  mimeType, 
  isPreview = false, 
  style,
  initialImageIndex = 0,
  metadata
}) => {
  const { theme } = useContext(ThemeContext);
  const { sortBy } = useFileContext();
  const fileManagerService = useFileManagerService();
  const [selectedImageIndex, setSelectedImageIndex] = useState(initialImageIndex);
  const [imageSetData, setImageSetData] = useState<ImageSetData | null>(null);
  const [loadedImages, setLoadedImages] = useState<Map<number, LoadedImage>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [selectedImageUuid, setSelectedImageUuid] = useState<string | null>(null); // Track selected image by UUID

  // Sort images function (same logic as GalleryScreen)
  const sortImageRefs = (imageRefs: Array<{ uuid: string; name: string; mimeType: string; size: number }>, sortOption: SortOption) => {
    const sortedRefs = [...imageRefs];
    
    switch (sortOption) {
      case 'name':
        return sortedRefs.sort((a, b) => a.name.localeCompare(b.name));
      case 'size':
        return sortedRefs.sort((a, b) => b.size - a.size); // Largest first
      case 'uuid':
        return sortedRefs.sort((a, b) => a.uuid.localeCompare(b.uuid));
      case 'lastModified':
        // For individual images, we don't have lastModified, so fall back to name
        return sortedRefs.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return sortedRefs;
    }
  };

  // Initialize ImageSet when fileData or metadata changes
  React.useEffect(() => {
    try {
      // For new format, use metadata.imageSetImages if available
      if (metadata?.imageSetImages && Array.isArray(metadata.imageSetImages)) {
        console.log('[ImageSet] Using new format with imageSetImages from metadata:', metadata.imageSetImages.length);
        
        // Sort the image references based on current sort option
        const sortedImageRefs = sortImageRefs(metadata.imageSetImages, sortBy);
        
        const data: ImageSetData = {
          metadata: {
            name: metadata.name || 'ImageSet',
            description: `Image set containing ${sortedImageRefs.length} images`,
            totalImages: sortedImageRefs.length
          },
          imageRefs: sortedImageRefs
        };
        setImageSetData(data);
        setError(null);

        // Preserve selected image when sorting changes, or use initial index for first load
        let newSelectedIndex = 0;
        if (selectedImageUuid) {
          // Find the new index of the previously selected image
          const foundIndex = sortedImageRefs.findIndex(ref => ref.uuid === selectedImageUuid);
          newSelectedIndex = foundIndex >= 0 ? foundIndex : 0;
        } else {
          // First load - use initial image index or default to 0
          if (initialImageIndex >= 0 && initialImageIndex < sortedImageRefs.length) {
            newSelectedIndex = initialImageIndex;
          }
          // Set the initial selectedImageUuid
          if (sortedImageRefs.length > 0) {
            setSelectedImageUuid(sortedImageRefs[newSelectedIndex].uuid);
          }
        }
        setSelectedImageIndex(newSelectedIndex);
      } else {
        // Fallback: parse ImageSet data from fileData (old format)
        console.log('[ImageSet] Using old format, parsing fileData');
        const jsonString = new TextDecoder().decode(fileData);
        const data: ImageSetData = JSON.parse(jsonString);
        
        // Sort imageRefs if available
        if (data.imageRefs) {
          data.imageRefs = sortImageRefs(data.imageRefs, sortBy);
        }
        
        setImageSetData(data);
        setError(null);

        // Preserve selected image when sorting changes for old format
        let newSelectedIndex = 0;
        if (selectedImageUuid && data.imageRefs) {
          // Find the new index of the previously selected image
          const foundIndex = data.imageRefs.findIndex(ref => ref.uuid === selectedImageUuid);
          newSelectedIndex = foundIndex >= 0 ? foundIndex : 0;
        } else {
          // First load - use initial image index or default to 0
          const totalImages = data.imageRefs?.length || data.images?.length || 0;
          if (initialImageIndex >= 0 && initialImageIndex < totalImages) {
            newSelectedIndex = initialImageIndex;
          }
          // Set the initial selectedImageUuid for old format
          if (data.imageRefs && data.imageRefs.length > 0) {
            setSelectedImageUuid(data.imageRefs[newSelectedIndex].uuid);
          }
        }
        setSelectedImageIndex(newSelectedIndex);
      }
    } catch (err) {
      console.error('[ImageSet] Failed to parse ImageSet data:', err);
      setError('Failed to load ImageSet');
    }
  }, [fileData, initialImageIndex, metadata, sortBy]); // Added sortBy to dependencies

  // Load individual image when needed (for new format)
  const loadImage = async (index: number, loadFull: boolean = false) => {
    if (!imageSetData?.imageRefs) {
      return;
    }

    const imageRef = imageSetData.imageRefs[index];
    const currentImage = loadedImages.get(index);

    // If loading preview and we already have it, skip
    if (!loadFull && currentImage?.previewData) {
      return;
    }

    // If loading full and we already have it, skip
    if (loadFull && currentImage?.fullData) {
      return;
    }

    // If already loading the requested type, skip
    if ((!loadFull && currentImage?.isLoadingPreview) || (loadFull && currentImage?.isLoadingFull)) {
      return;
    }

    // Update loading state
    setLoadedImages(prev => {
      const existing = prev.get(index) || {
        name: imageRef.name,
        mimeType: imageRef.mimeType,
        previewData: null,
        fullData: null,
        isLoadingPreview: false,
        isLoadingFull: false
      };
      
      return new Map(prev.set(index, {
        ...existing,
        isLoadingPreview: !loadFull ? true : existing.isLoadingPreview,
        isLoadingFull: loadFull ? true : existing.isLoadingFull
      }));
    });

    try {
      let result;
      if (loadFull) {
        console.log('[ImageSet] Loading full image:', imageRef.uuid);
        result = await fileManagerService.loadEncryptedFile(imageRef.uuid);
      } else {
        console.log('[ImageSet] Loading preview image:', imageRef.uuid);
        try {
          const previewData = await fileManagerService.getFilePreview(imageRef.uuid);
          if (previewData) {
            result = { fileData: previewData };
          } else {
            throw new Error('No preview data available');
          }
        } catch (previewError) {
          console.warn('[ImageSet] Preview failed, loading full image:', previewError);
          result = await fileManagerService.loadEncryptedFile(imageRef.uuid);
        }
      }
      
      setLoadedImages(prev => {
        const existing = prev.get(index) || {
          name: imageRef.name,
          mimeType: imageRef.mimeType,
          previewData: null,
          fullData: null,
          isLoadingPreview: false,
          isLoadingFull: false,
          isImageLoaded: false
        };
        
        return new Map(prev.set(index, {
          ...existing,
          previewData: !loadFull ? result.fileData : existing.previewData,
          fullData: loadFull ? result.fileData : existing.fullData,
          isLoadingPreview: !loadFull ? false : existing.isLoadingPreview,
          isLoadingFull: loadFull ? false : existing.isLoadingFull
        }));
      });
    } catch (error) {
      console.error('[ImageSet] Failed to load image:', imageRef.uuid, error);
      setLoadedImages(prev => {
        const existing = prev.get(index) || {
          name: imageRef.name,
          mimeType: imageRef.mimeType,
          previewData: null,
          fullData: null,
          isLoadingPreview: false,
          isLoadingFull: false
        };
        
        return new Map(prev.set(index, {
          ...existing,
          isLoadingPreview: false,
          isLoadingFull: false,
          error: loadFull ? 'Failed to load full image' : 'Failed to load preview'
        }));
      });
    }
  };

  // Load the currently selected image (preview first, then full image)
  React.useEffect(() => {
    if (imageSetData?.imageRefs && selectedImageIndex >= 0) {
      // Load preview first
      loadImage(selectedImageIndex, false);
      
      // Then load full image after a short delay (to show preview quickly)
      const fullImageTimer = setTimeout(() => {
        loadImage(selectedImageIndex, true);
      }, 300); // Increased delay slightly to let preview show
      
      return () => clearTimeout(fullImageTimer);
    }
  }, [selectedImageIndex, imageSetData]);

  if (error) {
    return (
      <View style={[styles.container, style, { backgroundColor: theme.surface }]}>
        <View style={styles.errorContainer}>
          <WebCompatibleIcon name="error" size={48} color={theme.error} />
          <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
        </View>
      </View>
    );
  }

  if (!imageSetData) {
    return (
      <View style={[styles.container, style, { backgroundColor: theme.surface }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading ImageSet...</Text>
        </View>
      </View>
    );
  }

  // Get current image data
  let currentImageData: Uint8Array | null = null;
  let currentImageType: string = 'image/jpeg';
  let currentImageName: string = 'Image';
  let isCurrentImageLoading = false;
  let isShowingPreview = false;
  let showImageLoading = false; // Show loading spinner over the image (only for data loading, not image rendering)

  if (imageSetData.imageRefs) {
    // New format: get from loaded images
    const loadedImage = loadedImages.get(selectedImageIndex);
    if (loadedImage) {
      // Prefer full data, fallback to preview data
      currentImageData = loadedImage.fullData || loadedImage.previewData;
      currentImageType = loadedImage.mimeType;
      currentImageName = loadedImage.name;
      // Only show loading if we have no data at all, or if we're loading preview and have no data
      isCurrentImageLoading = (!loadedImage.previewData && !loadedImage.fullData) && (loadedImage.isLoadingPreview || loadedImage.isLoadingFull);
      isShowingPreview = !loadedImage.fullData && !!loadedImage.previewData;
      // Show image loading spinner only when loading full image while showing preview (to indicate upgrade in progress)
      showImageLoading = isShowingPreview && loadedImage.isLoadingFull;
    } else {
      isCurrentImageLoading = true;
    }
  } else if (imageSetData.images && selectedImageIndex < imageSetData.images.length) {
    // Old format: get from embedded images
    const image = imageSetData.images[selectedImageIndex];
    currentImageData = image.data;
    currentImageType = image.mimeType;
    currentImageName = image.name;
  }

  const totalImages = imageSetData.imageRefs?.length || imageSetData.images?.length || 0;

  return (
    <View style={[styles.container, style, { backgroundColor: theme.surface }]}>
      {/* Image selector - similar to tags selector in GalleryScreen */}
      <View style={[styles.selectorContainer, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
        <View style={styles.selectorHeader}>
          <Text style={[styles.imageCounter, { color: theme.textSecondary }]}>
            {selectedImageIndex + 1} of {totalImages}
          </Text>
        </View>
        
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.imageSelector}
          contentContainerStyle={styles.imageSelectorContent}
        >
          {Array.from({ length: totalImages }, (_, index) => {
            const imageName = imageSetData.imageRefs?.[index]?.name || imageSetData.images?.[index]?.name || `Image ${index + 1}`;
            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.imageSelectorChip,
                  { 
                    backgroundColor: index === selectedImageIndex ? theme.accent : theme.surface,
                    borderColor: index === selectedImageIndex ? theme.accent : theme.border
                  }
                ]}
                onPress={() => {
                  setSelectedImageIndex(index);
                  // Update the selected image UUID to preserve selection across sorts
                  const imageRef = imageSetData.imageRefs?.[index];
                  if (imageRef) {
                    setSelectedImageUuid(imageRef.uuid);
                  }
                }}
              >
                <Text style={[
                  styles.imageSelectorText,
                  { 
                    color: index === selectedImageIndex ? theme.chipText : theme.text
                  }
                ]}>
                  {imageName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Image viewer */}
      <View style={styles.imageContainer}>
        {isCurrentImageLoading ? (
          <View style={styles.loadingContainer}>
            <WebCompatibleIcon name="hourglass-empty" size={48} color={theme.textSecondary} />
            <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
              Loading image...
            </Text>
          </View>
        ) : currentImageData ? (
          <View style={{ flex: 1, position: 'relative' }}>
            {/* Use ImageFile component for zoom functionality */}
            <ImageFile
              fileData={currentImageData}
              mimeType={currentImageType}
              showZoomControls={true}
              style={{ flex: 1, backgroundColor: 'transparent' }}
            />
            
            {/* Loading spinner overlay (like ImageFile) */}
            {showImageLoading && (
              <View style={styles.imageLoadingOverlay}>
                <ActivityIndicator size="large" color={theme.accent} />
              </View>
            )}
          </View>
        ) : (
          <View style={styles.errorContainer}>
            <WebCompatibleIcon name="error" size={48} color={theme.error} />
            <Text style={[styles.errorText, { color: theme.error }]}>Failed to load image</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageContainer: {
    flex: 1,
    minHeight: 400, // Increased from 250 to provide more space for images
  },
  selectorContainer: {
    padding: 16,
    borderBottomWidth: 1,
    maxHeight: 120,
  },
  selectorHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 12,
  },
  imageCounter: {
    fontSize: 14,
    fontWeight: '500',
  },
  imageSelector: {
    maxHeight: 40,
  },
  imageSelectorContent: {
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  imageSelectorChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginHorizontal: 4,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
  },
  imageSelectorText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    marginTop: 12,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    fontSize: 16,
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ImageSet;
