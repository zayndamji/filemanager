import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFileContext } from '../context/FileContext';
import { usePasswordContext } from '../context/PasswordContext';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';

const HomeScreen = () => {
  const { encryptedFiles } = useFileContext();
  const { password } = usePasswordContext();
  const navigation = useNavigation();

  const totalFiles = encryptedFiles.length;
  const encryptedFilesCount = encryptedFiles.length; // All files are encrypted
  const totalSize = encryptedFiles.reduce((sum, file) => sum + file.metadata.size, 0);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const stats = [
    { label: 'Encrypted Files', value: encryptedFilesCount.toString(), icon: 'security' },
    { label: 'Total Size', value: formatFileSize(totalSize), icon: 'storage' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>File Manager</Text>
          <Text style={styles.subtitle}>Secure encrypted file storage</Text>
        </View>

        <View style={styles.statsContainer}>
          {stats.map((stat, index) => (
            <View key={index} style={styles.statCard}>
              <Icon name={stat.icon} size={32} color="#007AFF" />
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionCard} onPress={() => (navigation as any).navigate('Upload')}>
            <Icon name="cloud-upload" size={32} color="#34C759" />
            <Text style={styles.actionTitle}>Upload Files</Text>
            <Text style={styles.actionSubtitle}>Add new files to your secure storage</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => (navigation as any).navigate('Gallery')}>
            <Icon name="photo-library" size={32} color="#FF9500" />
            <Text style={styles.actionTitle}>Gallery</Text>
            <Text style={styles.actionSubtitle}>View your images and photos</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => (navigation as any).navigate('Files')}>
            <Icon name="folder" size={32} color="#5856D6" />
            <Text style={styles.actionTitle}>Browse Files</Text>
            <Text style={styles.actionSubtitle}>Manage your encrypted files</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
    marginBottom: 30,
  },
  statCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 140,
    flex: 1,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  actionsContainer: {
    paddingHorizontal: 20,
  },
  actionCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
  },
  actionSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
});

export default HomeScreen;
