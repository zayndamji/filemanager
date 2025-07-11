import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Alert, Share } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import RNFS from 'react-native-fs';

interface DownloadButtonProps {
  fileData: Uint8Array;
  fileName: string;
  mimeType: string;
  downloadSymbol?: string;
}

const DownloadButton: React.FC<DownloadButtonProps> = ({
  fileData,
  fileName,
  mimeType,
  downloadSymbol = "Download"
}) => {
  const handleDownload = async () => {
    try {
      // Create a temporary file to share
      const tempPath = `${RNFS.CachesDirectoryPath}/${Date.now()}_${fileName}`;
      
      // Convert Uint8Array to base64
      const base64String = Array.from(fileData, (byte) => String.fromCharCode(byte)).join('');
      const base64Data = btoa(base64String);
      
      // Write to temporary file
      await RNFS.writeFile(tempPath, base64Data, 'base64');
      
      // Share the file
      await Share.share({
        url: `file://${tempPath}`,
        title: `Download ${fileName}`,
        message: `File: ${fileName}`,
      });
      
      // Clean up temporary file after a delay
      setTimeout(async () => {
        try {
          await RNFS.unlink(tempPath);
        } catch (error) {
          console.log('Cleanup error:', error);
        }
      }, 5000);
      
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to download file');
    }
  };

  return (
    <TouchableOpacity style={styles.downloadButton} onPress={handleDownload}>
      <Icon name="download" size={20} color="#FFF" />
      <Text style={styles.downloadText}>{downloadSymbol}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  downloadText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default DownloadButton;
