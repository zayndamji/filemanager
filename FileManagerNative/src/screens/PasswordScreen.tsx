import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePasswordContext } from '../context/PasswordContext';
import { useStorageContext } from '../context/StorageContext';
import { pickDirectory } from '../utils/FileSystem';
import { useNavigation } from '@react-navigation/native';
import { ThemeContext } from '../theme';

const getStyles = (theme: typeof import('../theme').darkTheme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.text,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: theme.textSecondary,
    marginBottom: 32,
  },
  input: {
    width: '100%',
    backgroundColor: theme.inputBackground,
    color: theme.text,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.inputBorder,
    padding: 12,
    fontSize: 18,
    marginBottom: 24,
  },
  button: {
    backgroundColor: theme.accent,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: theme.chipText,
    fontSize: 18,
    fontWeight: 'bold',
  },
});

const PasswordScreen = () => {
  const [inputPassword, setInputPassword] = useState('');
  const [inputSalt, setInputSalt] = useState('');
  const { setPassword, salt, setSalt } = usePasswordContext();
  const { webDirectoryHandle, setWebDirectoryHandle } = useStorageContext();
  const navigation = useNavigation();
  const { theme } = React.useContext(ThemeContext);

  React.useEffect(() => {
    if (salt) setInputSalt(salt);
  }, [salt]);

  const styles = getStyles(theme);

  const handleSubmit = () => {
    if (!inputPassword.trim()) {
      Alert.alert('Error', 'Please enter a password');
      return;
    }
    if (!inputSalt.trim()) {
      Alert.alert('Error', 'Please enter a salt');
      return;
    }
    // On web, require folder selection
    if (Platform.OS === 'web' && !webDirectoryHandle) {
      Alert.alert('Error', 'Please select a storage folder');
      return;
    }
    setSalt(inputSalt.trim());
    setPassword(inputPassword.trim());
    navigation.navigate('Main' as never);
  };

  const handlePickFolder = async () => {
    try {
      const handle = await pickDirectory();
      setWebDirectoryHandle(handle);
    } catch (e) {
      Alert.alert('Error', 'Failed to pick folder: ' + (e as Error).message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <Text style={styles.title}>Encrypted File Manager</Text>
          <Text style={styles.subtitle}>Enter your password to continue</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={inputPassword}
            onChangeText={setInputPassword}
            placeholder="Password"
            placeholderTextColor={theme.textSecondary}
          />
          <TextInput
            style={styles.input}
            secureTextEntry
            value={inputSalt}
            onChangeText={setInputSalt}
            placeholder="Salt (required, can be edited)"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
          />
          {Platform.OS === 'web' && (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: webDirectoryHandle ? theme.accent : '#888' }]}
              onPress={handlePickFolder}
            >
              <Text style={styles.buttonText}>
                {webDirectoryHandle ? 'Folder Selected' : 'Choose Storage Folder'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.button} onPress={handleSubmit}>
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default PasswordScreen;
