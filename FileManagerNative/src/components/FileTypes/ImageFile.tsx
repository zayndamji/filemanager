// image file renderer component
import React from 'react';
import { View, StyleSheet, Dimensions, ActivityIndicator, Text } from 'react-native';
import { Image } from 'react-native';

// props for image file renderer
interface ImageFileProps {
  fileData: Uint8Array | ArrayBuffer; // image data as bytes
  mimeType: string; // mime type of image
  isPreview?: boolean; // whether to render as preview
  style?: any; // optional style for root View
}

const { width, height } = Dimensions.get('window');

// image file renderer
const ImageFile: React.FC<ImageFileProps> = ({ fileData, mimeType, isPreview = false, style }) => {
  const [loading, setLoading] = React.useState(true);

  // log start of image render
  console.log('[ImageFile] rendering image preview', { mimeType, isPreview, fileDataLength: fileData?.byteLength });

  // compress preview if isPreview
  let dataUri: string;
  if (isPreview) {
    // reduce preview size for faster rendering
    let uint8 = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
    if (uint8.length > 20000) {
      uint8 = uint8.slice(0, 20000); // very rough downsample
      console.log('[ImageFile] downsampled preview to 20k bytes');
    }
    const base64String = Buffer.from(uint8).toString('base64');
    dataUri = `data:${mimeType};base64,${base64String}`;
  } else {
    const uint8 = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
    const base64String = Buffer.from(uint8).toString('base64');
    dataUri = `data:${mimeType};base64,${base64String}`;
  }

  // fallback: never return a string/number, always a valid react element
  if (!dataUri || typeof dataUri !== 'string') {
    console.error('[ImageFile] invalid dataUri, returning fallback');
    return (
      <View style={styles.container}>
        <Text style={{ color: 'red', padding: 16 }}>image could not be rendered (invalid dataUri)</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Image
        source={{ uri: dataUri }}
        style={styles.image}
        resizeMode="contain"
        onLoadEnd={() => {
          setLoading(false);
          console.log('[ImageFile] image loaded', { mimeType });
        }}
      />
      {loading && <ActivityIndicator style={styles.loader} size="small" color="#888" />}
    </View>
  );
};

// styles for image file renderer
const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },

  image: {
    maxWidth: width * 0.9,
    maxHeight: height * 0.7,
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
