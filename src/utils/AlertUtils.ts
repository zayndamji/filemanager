import { Platform } from 'react-native';

// Cross-platform alert function
export const showAlert = (title: string, message: string, buttons?: Array<{text: string, style?: 'default' | 'cancel' | 'destructive', onPress?: () => void}>) => {
  if (Platform.OS === 'web') {
    if (buttons && buttons.length > 1) {
      const confirmButton = buttons.find(btn => btn.style === 'destructive') || buttons[buttons.length - 1];
      if ((globalThis as any).window?.confirm(`${title}\n\n${message}`)) {
        confirmButton.onPress?.();
      }
    } else {
      (globalThis as any).window?.alert(`${title}\n\n${message}`);
      buttons?.[0]?.onPress?.();
    }
  } else {
    const Alert = require('react-native').Alert;
    Alert.alert(title, message, buttons);
  }
};
