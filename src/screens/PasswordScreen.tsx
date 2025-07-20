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
import { pickDirectory, getWebDirectoryHandle } from '../utils/FileSystem';
import { useNavigation } from '@react-navigation/native';
import { ThemeContext } from '../theme';
import { showAlert } from '../utils/AlertUtils';

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
  const navigation = useNavigation();
  const { theme } = React.useContext(ThemeContext);

  // Track folder selection state and directory handle for web
  const [folderSelected, setFolderSelected] = useState(() => !!getWebDirectoryHandle());
  const [currentFolderName, setCurrentFolderName] = useState(() => getWebDirectoryHandle()?.name || 'Not selected');

  React.useEffect(() => {
    if (salt) setInputSalt(salt);
  }, [salt]);

  // Update folderSelected and currentFolderName if directory handle changes (web)
  React.useEffect(() => {
    if (Platform.OS === 'web') {
      const handle = getWebDirectoryHandle();
      setFolderSelected(!!handle);
      setCurrentFolderName(handle?.name || 'Not selected');
    }
  }, []);

  const styles = getStyles(theme);

  const handleSubmit = () => {
    if (!inputPassword.trim()) {
      showAlert('Error', 'Please enter a password');
      return;
    }
    if (!inputSalt.trim()) {
      showAlert('Error', 'Please enter a salt');
      return;
    }
    // On web, require folder selection
    if (Platform.OS === 'web' && !getWebDirectoryHandle()) {
      showAlert('Error', 'Please select a storage folder');
      return;
    }
    setSalt(inputSalt.trim());
    setPassword(inputPassword.trim());
    navigation.navigate('Main' as never);
  };

  const handlePickFolder = async () => {
    try {
      await pickDirectory();
      const handle = getWebDirectoryHandle();
      setFolderSelected(!!handle);
      setCurrentFolderName(handle?.name || 'Not selected');
    } catch (e) {
      showAlert('Error', 'Failed to pick folder: ' + (e as Error).message);
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
          <Text style={styles.subtitle}>Enter a password and salt to continue.</Text>

          {/* Password & Salt Description */}
          <Text style={{ color: theme.textSecondary, fontSize: 14, marginBottom: 24, textAlign: 'center', width: '100%' }}>
            Your <Text style={{ fontWeight: 'bold', color: theme.text }}>password</Text> and <Text style={{ fontWeight: 'bold', color: theme.text }}>salt</Text> are used to encrypt and decrypt your files. <br />Choose a strong password and a unique salt for best security.<br />The salt will be saved on this device, while the password should be kept private and secure.<br/>Without your password or salt, you will not be able to access your files.
          </Text>

          <TextInput
            style={styles.input}
            secureTextEntry
            value={inputPassword}
            onChangeText={setInputPassword}
            placeholder="Password (should be private and secure)"
            placeholderTextColor={theme.textSecondary}
          />
          <TextInput
            style={styles.input}
            secureTextEntry
            value={inputSalt}
            onChangeText={setInputSalt}
            placeholder="Salt (will be saved on this device)"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
          />

          {/* Storage Folder (Web only) */}
          {Platform.OS === 'web' && (
            <>
              <Text style={{ color: theme.textSecondary, fontSize: 14, marginBottom: 8, textAlign: 'center', width: '100%' }}>
                <Text style={{ fontWeight: 'bold', color: theme.text }}>Storage Folder</Text> is where all your encrypted files are saved. <br />
                To access your files in the future, you must choose the same folder. <br />
                Click the button below to select a folder for storage. <br />
                You can only access your files in the future if you select the same folder.
              </Text>

              <Text style={{ color: theme.textSecondary, fontSize: 14, marginBottom: 24, textAlign: 'center', width: '100%' }}>
                Current folder: <Text style={{ fontWeight: 'bold', color: theme.text }}>{currentFolderName}</Text>
              </Text>

              <TouchableOpacity
                style={[
                  styles.input,
                  {
                    backgroundColor: folderSelected ? theme.inputBackground : theme.accent,
                    borderColor: theme.inputBorder,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    marginBottom: 24,
                  },
                ]}
                onPress={handlePickFolder}
                activeOpacity={0.8}
              >
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: 'bold' }}>
                  {folderSelected ? 'Choose a Different Storage Folder' : 'Choose Storage Folder'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Continue Button */}
          <TouchableOpacity style={[styles.button, { marginTop: 8, width: '100%' }]} onPress={handleSubmit}>
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default PasswordScreen;
