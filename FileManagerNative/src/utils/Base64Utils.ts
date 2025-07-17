import { Platform } from 'react-native';

/**
 * Cross-platform base64 encoding utilities
 * Uses native browser APIs on web, Buffer on native
 */

export const uint8ArrayToBase64 = (uint8Array: Uint8Array): string => {
  if (Platform.OS === 'web') {
    // Use native browser API on web
    const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('');
    return btoa(binaryString);
  } else {
    // Use Buffer on native
    return Buffer.from(uint8Array).toString('base64');
  }
};

export const base64ToUint8Array = (base64: string): Uint8Array => {
  if (Platform.OS === 'web') {
    // Use native browser API on web
    const binaryString = atob(base64);
    return new Uint8Array(Array.from(binaryString, char => char.charCodeAt(0)));
  } else {
    // Use Buffer on native
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
};

export const stringToBase64 = (str: string): string => {
  if (Platform.OS === 'web') {
    return btoa(str);
  } else {
    return Buffer.from(str, 'utf8').toString('base64');
  }
};

export const base64ToString = (base64: string): string => {
  if (Platform.OS === 'web') {
    return atob(base64);
  } else {
    return Buffer.from(base64, 'base64').toString('utf8');
  }
};
