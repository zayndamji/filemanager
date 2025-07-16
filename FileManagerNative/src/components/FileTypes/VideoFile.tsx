import React from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import Video from 'react-native-video';

export interface VideoFileProps {
  fileData: Uint8Array;
  mimeType: string;
  fileName?: string;
}

const VideoFileNative: React.FC<VideoFileProps> = ({ fileData, mimeType, fileName = 'video.mp4' }) => {
  let base64String = '';
  if (fileData && fileData.length > 0) {
    base64String = Buffer.from(fileData).toString('base64');
  }
  const videoUri = base64String ? `data:${mimeType};base64,${base64String}` : undefined;
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

const VideoFileWeb: React.FC<VideoFileProps> = ({ fileData, mimeType, fileName = 'video.mp4' }) => {
  let base64String = '';
  if (fileData && fileData.length > 0) {
    base64String = Buffer.from(fileData).toString('base64');
  }
  const videoUri = base64String ? `data:${mimeType};base64,${base64String}` : undefined;
  return (
    <div style={{ padding: 24, background: '#fff', borderRadius: 12, textAlign: 'center' }}>
      <div style={{ fontWeight: 'bold', marginBottom: 8 }}>{fileName}</div>
      <div style={{ color: '#666', marginBottom: 4 }}>Type: {mimeType}</div>
      <div style={{ color: '#666', marginBottom: 4 }}>Size: {(fileData.length / 1024).toFixed(1)} KB</div>
      {videoUri ? (
        <video src={videoUri} controls style={{ width: '100%', maxWidth: 480, height: 240, borderRadius: 12, marginTop: 16, background: '#000' }} />
      ) : (
        <div style={{ color: '#999', marginTop: 16 }}>Video preview is not supported in this viewer.</div>
      )}
    </div>
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

const VideoFile: React.FC<VideoFileProps> = (props) => {
  if (Platform.OS === 'web') return <VideoFileWeb {...props} />;
  return <VideoFileNative {...props} />;
};

export default VideoFile;