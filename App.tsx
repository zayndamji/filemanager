// encrypted file manager app
// @format

// Import polyfills first - MUST be at the very top
import './src/utils/polyfills.ts';

import React from 'react';
import { StatusBar, useColorScheme, Platform, View, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FileProvider } from './src/context/FileContext';
import { PasswordProvider } from './src/context/PasswordContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ThemeProvider } from './src/theme';
import { FileManagerService } from './src/utils/FileManagerService';

// Conditionally import GestureHandlerRootView
let GestureHandlerRootView: React.ComponentType<any> = View;
if (Platform.OS !== 'web') {
  try {
    const { GestureHandlerRootView: GHRootView } = require('react-native-gesture-handler');
    GestureHandlerRootView = GHRootView;
  } catch (e) {
    // Fallback to regular View if gesture handler is not available
    console.warn('GestureHandlerRootView not available, using regular View');
  }
}

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  React.useEffect(() => {
    // Clean up temp files on app startup
    FileManagerService.cleanupAllTempFiles().catch((error) => {
      console.warn('[App] Failed to cleanup temp files on startup:', error);
    });

    // Handle app state changes for cleanup
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        // Clean up temp files when app goes to background
        FileManagerService.cleanupAllTempFiles().catch((error) => {
          console.warn('[App] Failed to cleanup temp files on background:', error);
        });
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    // Cleanup function
    return () => {
      appStateSubscription?.remove();
      // Final cleanup on unmount
      FileManagerService.cleanupAllTempFiles().catch((error) => {
        console.warn('[App] Failed to cleanup temp files on unmount:', error);
      });
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}

export default App;
