// image file renderer component
import React from 'react';
import { Platform, View, StyleSheet, Dimensions, ActivityIndicator, Text } from 'react-native';
import { Image } from 'react-native';
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
  
  return (
    <View style={[styles.container, style, { flex: 1 }]}>
      <Image
        source={{ uri: dataUri }}
        style={styles.image}
        resizeMode="contain"
        onLoadEnd={() => setLoading(false)}
      />
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
});

export default ImageFile;
