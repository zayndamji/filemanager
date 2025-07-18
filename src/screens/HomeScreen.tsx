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
import WebCompatibleIcon from '../components/WebCompatibleIcon';
import { useNavigation } from '@react-navigation/native';
import { ThemeContext } from '../theme';

const getStyles = (theme: typeof import('../theme').darkTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: theme.background,
  },
  header: {
    padding: 24,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: theme.textSecondary,
    marginBottom: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 24,
  },
  statCard: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    width: 140,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.accent,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 4,
  },
  actionsContainer: {
    marginTop: 16,
    marginBottom: 32,
  },
  actionCard: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.text,
    marginTop: 8,
  },
  actionSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
});

const HomeScreen = () => {
  const { encryptedFiles } = useFileContext();
  const { password } = usePasswordContext();
  const navigation = useNavigation();
  const { theme } = React.useContext(ThemeContext);
  const styles = getStyles(theme);

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
              <WebCompatibleIcon name={stat.icon} size={32} color="#007AFF" />
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.actionCard} onPress={() => (navigation as any).navigate('Upload')}>
            <WebCompatibleIcon name="cloud-upload" size={32} color="#34C759" />
            <Text style={styles.actionTitle}>Upload Files</Text>
            <Text style={styles.actionSubtitle}>Add new files to your secure storage</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => (navigation as any).navigate('Gallery')}>
            <WebCompatibleIcon name="photo-library" size={32} color="#FF9500" />
            <Text style={styles.actionTitle}>Gallery</Text>
            <Text style={styles.actionSubtitle}>View your images and photos</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => (navigation as any).navigate('Files')}>
            <WebCompatibleIcon name="folder" size={32} color="#5856D6" />
            <Text style={styles.actionTitle}>Browse Files</Text>
            <Text style={styles.actionSubtitle}>Manage your encrypted files</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default HomeScreen;
