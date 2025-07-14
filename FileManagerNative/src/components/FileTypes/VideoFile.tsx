import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Video from 'react-native-video';

export interface VideoFileProps {
  fileData: Uint8Array;
  mimeType: string;
  fileName?: string;
}

const VideoFile: React.FC<VideoFileProps> = ({ fileData, mimeType, fileName = 'video.mp4' }) => {
  // Convert Uint8Array to base64 string
  let base64String = '';
  if (fileData && fileData.length > 0) {
    // Buffer is available in React Native via polyfill
    base64String = Buffer.from(fileData).toString('base64');
  }
  const videoUri = base64String
    ? `data:${mimeType};base64,${base64String}`
    : undefined;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{fileName}</Text>
      <Text style={styles.subtitle}>Type: {mimeType}</Text>
      <Text style={styles.subtitle}>Size: {(fileData.length / 1024).toFixed(1)} KB</Text>
      {videoUri ? (
        <Video
          source={{ uri: videoUri }}
          style={styles.video}
          controls
          resizeMode="contain"
          paused={false}
        />
      ) : (
        <Text style={styles.noteText}>Video preview is not supported in this viewer.</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  noteText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
  },
  video: {
    width: '100%',
    height: 240,
    backgroundColor: '#000',
    borderRadius: 12,
    marginTop: 16,
  },
});

export default VideoFile;