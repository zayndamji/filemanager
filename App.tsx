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

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  React.useEffect(() => {
    // Vector icons no longer needed - using WebCompatibleIcon with Unicode symbols
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
