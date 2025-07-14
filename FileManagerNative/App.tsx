// encrypted file manager app
// @format

// Import polyfills first - MUST be at the very top
import './src/utils/polyfills.ts';

import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FileProvider } from './src/context/FileContext';
import { PasswordProvider } from './src/context/PasswordContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ThemeProvider } from './src/theme';
import Icon from 'react-native-vector-icons/MaterialIcons';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  React.useEffect(() => {
    Icon.loadFont(); // Ensure MaterialIcons font is loaded
  }, []);

  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <PasswordProvider>
          <FileProvider>
            <NavigationContainer>
              <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
              <AppNavigator />
            </NavigationContainer>
          </FileProvider>
        </PasswordProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

export default App;
