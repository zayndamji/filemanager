// audio file renderer component
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Sound from 'react-native-sound';
import RNFS from 'react-native-fs';

// props for audio file renderer
interface AudioFileProps {
  fileData: Uint8Array; // audio data as bytes
  mimeType: string; // mime type of audio
  fileName?: string; // name of audio file
  onClose?: () => void; // callback for closing
  onDelete?: () => void; // callback for delete
}

// audio file renderer
const AudioFile: React.FC<AudioFileProps> = ({ 
  fileData, 
  mimeType, 
  fileName = 'audio.mp3',
  onClose, 
  onDelete 
}) => {
  const [sound, setSound] = useState<Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [tempFilePath, setTempFilePath] = useState<string>('');

  useEffect(() => {
    initializeAudio();
    return () => {
      cleanup();
    };
  }, [fileData]);

  // initialize audio playback from fileData
  const initializeAudio = async () => {
    try {
      Sound.setCategory('Playback');

      // create a temporary file for the audio data
      const tempPath = `${RNFS.CachesDirectoryPath}/${Date.now()}_${fileName}`;

      // convert Uint8Array to base64 and write to temp file
      const base64String = btoa(String.fromCharCode(...fileData));
      await RNFS.writeFile(tempPath, base64String, 'base64');

      setTempFilePath(tempPath);

      // create sound instance
      const soundInstance = new Sound(tempPath, '', (error) => {
        if (error) {
          console.error('failed to load audio:', error);
          Alert.alert('error', 'failed to load audio file');
          return;
        }

        setSound(soundInstance);
        setDuration(soundInstance.getDuration());
      });

    } catch (error) {
      console.error('error initializing audio:', error);
      Alert.alert('error', 'failed to initialize audio');
    }
  };

  // cleanup temp file and sound instance
  const cleanup = async () => {
    if (sound) {
      sound.release();
    }
    if (tempFilePath) {
      try {
        await RNFS.unlink(tempFilePath);
      } catch (error) {
        console.log('error cleaning up temp file:', error);
      }
    }
  };

  const togglePlayPause = () => {
    if (!sound) return;

    if (isPlaying) {
      sound.pause();
      setIsPlaying(false);
      setIsPaused(true);
    } else {
      sound.play((success) => {
        if (success) {
          setIsPlaying(false);
          setIsPaused(false);
          setCurrentTime(0);
        }
      });
      setIsPlaying(true);
      setIsPaused(false);
    }
  };

  const stopPlayback = () => {
    if (!sound) return;

    sound.stop();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentTime(0);
  };

  const formatTime = (timeInSeconds: number) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Audio File',
      `Are you sure you want to delete "${fileName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: () => {
            stopPlayback();
            onDelete && onDelete();
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {(onClose || onDelete) && (
        <View style={styles.header}>
          <Text style={styles.fileName}>{fileName}</Text>
          <View style={styles.headerActions}>
            {onDelete && (
              <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
                <Icon name="delete" size={24} color="#FF4444" />
              </TouchableOpacity>
            )}
            {onClose && (
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Icon name="close" size={24} color="#666" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <View style={styles.audioPlayer}>
        <View style={styles.audioIcon}>
          <Icon name="audiotrack" size={80} color="#4CAF50" />
        </View>

        <Text style={styles.title}>{fileName}</Text>
        <Text style={styles.subtitle}>Type: {mimeType}</Text>

        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity 
            onPress={togglePlayPause} 
            style={[styles.controlButton, styles.playButton]}
            disabled={!sound}
          >
            <Icon 
              name={isPlaying ? 'pause' : 'play-arrow'} 
              size={32} 
              color="#FFF" 
            />
          </TouchableOpacity>

          <TouchableOpacity 
            onPress={stopPlayback} 
            style={styles.controlButton}
            disabled={!sound}
          >
            <Icon name="stop" size={28} color="#666" />
          </TouchableOpacity>
        </View>

        <Text style={styles.fileInfo}>
          Size: {(fileData.length / 1024).toFixed(1)} KB
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  fileName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 16,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  deleteButton: {
    padding: 8,
  },
  closeButton: {
    padding: 8,
  },
  audioPlayer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  audioIcon: {
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  timeContainer: {
    marginBottom: 24,
  },
  timeText: {
    fontSize: 16,
    color: '#666',
    fontFamily: 'monospace',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },
  controlButton: {
    padding: 12,
    borderRadius: 24,
    backgroundColor: '#FFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  playButton: {
    backgroundColor: '#4CAF50',
  },
  fileInfo: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});

export default AudioFile;
