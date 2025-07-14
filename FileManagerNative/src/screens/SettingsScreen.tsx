import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useFileContext } from '../context/FileContext';
import { usePasswordContext } from '../context/PasswordContext';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { FileManagerService } from '../utils/FileManagerService';
import { ThemeContext, darkTheme, lightTheme } from '../theme';
import Icon from 'react-native-vector-icons/MaterialIcons';

type RootStackParamList = {
  Password: undefined;
  Main: undefined;
};

const SettingsScreen = () => {
  const { encryptedFiles, refreshFileList } = useFileContext();
  const { derivedKey, setPassword } = usePasswordContext();
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { theme, setTheme } = React.useContext(ThemeContext);
  const [deleting, setDeleting] = useState(false);
  const [isDark, setIsDark] = useState(theme === darkTheme);

  const handleLogout = () => {
    setPassword('');
    navigation.reset({ index: 0, routes: [{ name: 'Password' }] });
  };

  const handleToggleTheme = async () => {
    const newTheme = isDark ? lightTheme : darkTheme;
    setTheme(newTheme);
    setIsDark(!isDark);
  };

  const handleDeleteAll = async () => {
    Alert.alert(
      'Delete All Files',
      'Are you sure you want to permanently delete ALL files in the app storage? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              if (!derivedKey) throw new Error('No password set');
              const deletedCount = await FileManagerService.deleteAllFiles(derivedKey);
              await refreshFileList();
              Alert.alert('Success', `${deletedCount} file${deletedCount === 1 ? '' : 's'} deleted.`);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete all files.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={getStyles(theme).container}>
      <Text style={getStyles(theme).title}>Settings</Text>
      <TouchableOpacity
        style={[getStyles(theme).deleteButton, deleting && getStyles(theme).deleteButtonDisabled]}
        onPress={handleDeleteAll}
        disabled={deleting}
      >
        <Icon name="delete-forever" size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>Delete All Files</Text>
      </TouchableOpacity>
      {deleting && <ActivityIndicator size="large" color={theme.error} style={{ marginTop: 16 }} />}
      <TouchableOpacity
        style={[getStyles(theme).deleteButton, { backgroundColor: theme.accent, marginTop: 24 }]}
        onPress={handleLogout}
      >
        <Icon name="logout" size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>Log Out</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[getStyles(theme).deleteButton, { backgroundColor: theme.card, marginTop: 24 }]}
        onPress={handleToggleTheme}
      >
        <Icon name={isDark ? 'brightness-4' : 'brightness-7'} size={24} color={theme.chipText} />
        <Text style={getStyles(theme).deleteButtonText}>{isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const getStyles = (theme: typeof darkTheme) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.background,
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: 32,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.error,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  deleteButtonDisabled: {
    backgroundColor: theme.disabled,
    opacity: 0.6,
  },
  deleteButtonText: {
    color: theme.chipText,
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
});

export default SettingsScreen;
