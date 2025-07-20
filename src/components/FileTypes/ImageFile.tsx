// image file renderer component
import React from 'react';
import { Platform, View, StyleSheet, Dimensions, ActivityIndicator, Text, TouchableOpacity } from 'react-native';
import { Image } from 'react-native';
import { ResumableZoom } from 'react-native-zoom-toolkit';
import { uint8ArrayToBase64 } from '../../utils/Base64Utils';

// props for image file renderer
interface ImageFileProps {
  fileData: Uint8Array | ArrayBuffer; // image data as bytes
  mimeType: string; // mime type of image
  isPreview?: boolean; // whether to render as preview
  style?: any; // optional style for root View
}

const { width, height } = Dimensions.get('window');

// Native implementation
const ImageFileNative: React.FC<ImageFileProps> = ({ fileData, mimeType, isPreview = false, style }) => {
  const [loading, setLoading] = React.useState(true);
  const zoomRef = React.useRef<any>(null);
  
  // Convert file data to data URI
  const uint8 = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
  const base64String = uint8ArrayToBase64(uint8);
  const dataUri = `data:${mimeType};base64,${base64String}`;
  
  if (!dataUri || typeof dataUri !== 'string') {
    return (
      <View style={styles.container}>
        <Text style={{ color: 'red', padding: 16 }}>image could not be rendered (invalid dataUri)</Text>
      </View>
    );
  }

  const handleZoomIn = () => {
    if (zoomRef.current) {
      const currentScale = zoomRef.current.getCurrentScale?.() || 1;
      const newScale = Math.min(currentScale * 1.5, 5);
      zoomRef.current.zoom(newScale);
    }
  };

  const handleZoomOut = () => {
    if (zoomRef.current) {
      const currentScale = zoomRef.current.getCurrentScale?.() || 1;
      const newScale = Math.max(currentScale / 1.5, 1.0);
      zoomRef.current.zoom(newScale);
    }
  };

  const handleResetZoom = () => {
    if (zoomRef.current) {
      zoomRef.current.reset();
    }
  };
  
  return (
    <View style={[styles.container, style, { flex: 1 }]}>
      <ResumableZoom
        ref={zoomRef}
        minScale={1.0}
        maxScale={5}
        style={styles.container}
      >
        <Image
          source={{ uri: dataUri }}
          style={styles.image}
          resizeMode="contain"
          onLoadEnd={() => setLoading(false)}
        />
      </ResumableZoom>
      
      {/* Zoom Controls */}
      <View style={styles.zoomControls}>
        <TouchableOpacity style={styles.zoomButton} onPress={handleZoomOut}>
          <Text style={styles.zoomButtonText}>-</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomButton} onPress={handleResetZoom}>
          <Text style={styles.zoomButtonText}>1:1</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomButton} onPress={handleZoomIn}>
          <Text style={styles.zoomButtonText}>+</Text>
        </TouchableOpacity>
      </View>
      
      {loading ? <ActivityIndicator style={styles.loader} size="small" color="#888" /> : null}
    </View>
  );
};

// Web implementation
const ImageFileWeb: React.FC<ImageFileProps> = ({ fileData, mimeType, isPreview = false, style }) => {
  // Convert file data to data URI
  const uint8 = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
  const base64String = uint8ArrayToBase64(uint8);
  const dataUri = `data:${mimeType};base64,${base64String}`;
  
  if (!dataUri || typeof dataUri !== 'string') {
    return <div style={{ color: 'red', padding: 16 }}>image could not be rendered (invalid dataUri)</div>;
  }
  
  return (
    <div style={{ 
      ...style, 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      borderRadius: 12, 
      padding: 16,
      minHeight: 'calc(75vh - 100px)' // Minimum height for image container to fit most of the viewport
    }}>
      <img src={dataUri} alt="image" style={{ 
        maxWidth: '100%', 
        maxHeight: 'calc(75vh - 100px)', // Limit image height to fit within container and hide file details
        borderRadius: 8,
        objectFit: 'contain'
      }} />
    </div>
  );
};

// Platform switch
const ImageFile: React.FC<ImageFileProps> = (props) => {
  if (Platform.OS === 'web') return <ImageFileWeb {...props} />;
  return <ImageFileNative {...props} />;
};

// styles for image file renderer
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    minHeight: height * 0.65, // Minimum height for image container to fit most of the viewport
    overflow: 'hidden', // Clip content to keep image within bounds
  },

  image: {
    maxWidth: width * 0.9,
    maxHeight: height * 0.7, // Limit image height to fit within container and hide file details
    width: width * 0.9,
    height: height * 0.7,
    resizeMode: 'contain',
  },

  loader: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -10,
    marginTop: -10,
  },

  zoomControls: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    padding: 8,
    gap: 8,
  },

  zoomButton: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  zoomButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default ImageFile;
