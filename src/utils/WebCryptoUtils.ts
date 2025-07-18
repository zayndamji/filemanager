import { gcm } from '@noble/ciphers/aes';
import 'react-native-get-random-values';
import { Platform } from 'react-native';

// Try to use native crypto for better performance on native platforms
let RNSimpleCrypto: any = null;
if (Platform.OS !== 'web') {
  try {
    const RNSimpleCryptoModule = require('react-native-simple-crypto');
    // Check if it's a default export
    if (RNSimpleCryptoModule.default) {
      RNSimpleCrypto = RNSimpleCryptoModule.default;
    } else {
      RNSimpleCrypto = RNSimpleCryptoModule;
    }
    console.log('[WebCryptoUtils] RNSimpleCrypto loaded for AES operations');
  } catch (e) {
    console.warn('[WebCryptoUtils] Failed to load react-native-simple-crypto, using JS implementation');
    RNSimpleCrypto = null;
  }
}

// encryption constants
const ivLength = 12; // AES-GCM uses 12 bytes IV

// generates UUID
export const generateUUID = (): string =>
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: any) =>
    (
      c ^ (global.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (parseInt(c, 10) / 4)))
    ).toString(16)
  );

// encrypts data using AES-GCM (key should already be derived)
export const encryptData = async (
  data: Uint8Array | ArrayBuffer,
  key: Uint8Array,
  iv?: Uint8Array
): Promise<Uint8Array> => {
  try {
    // Generate random IV if not provided
    const _iv = iv || (() => { const v = new Uint8Array(ivLength); global.crypto.getRandomValues(v); return v; })();
    
    // Convert data to Uint8Array if it's ArrayBuffer
    const dataBytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    
    // Try native AES-GCM first for better performance
    if (RNSimpleCrypto && RNSimpleCrypto.AES && Platform.OS !== 'web') {
      try {
        // Note: react-native-simple-crypto only supports AES-128-CBC, not AES-GCM
        // So we'll fall back to the JS implementation for now
        console.log('[WebCryptoUtils] RNSimpleCrypto AES available but only supports CBC, using JS implementation');
        
        // Fall back to JS implementation
        const cipher = gcm(key, _iv);
        const encrypted = cipher.encrypt(dataBytes);
        
        // combine iv + encrypted data (no salt needed since key is pre-derived)
        const output = new Uint8Array(ivLength + encrypted.byteLength);
        output.set(_iv, 0);
        output.set(encrypted, ivLength);
        return output;
      } catch (nativeError) {
        console.warn('[WebCryptoUtils] Native AES-GCM failed, falling back to JS:', nativeError);
        
        // Fall back to JS implementation
        const cipher = gcm(key, _iv);
        const encrypted = cipher.encrypt(dataBytes);
        
        // combine iv + encrypted data (no salt needed since key is pre-derived)
        const output = new Uint8Array(ivLength + encrypted.byteLength);
        output.set(_iv, 0);
        output.set(encrypted, ivLength);
        return output;
      }
    }
    
    // Use @noble/ciphers for AES-GCM encryption (fallback)
    const cipher = gcm(key, _iv);
    const encrypted = cipher.encrypt(dataBytes);
    
    // combine iv + encrypted data (no salt needed since key is pre-derived)
    const output = new Uint8Array(ivLength + encrypted.byteLength);
    output.set(_iv, 0);
    output.set(encrypted, ivLength);
    return output;
  } catch (e) {
    console.error('encryptData: error', e);
    throw e;
  }
};

// decrypts data using AES-GCM (key should already be derived)
export const decryptData = async (
  data: Uint8Array,
  key: Uint8Array
): Promise<ArrayBuffer> => {
  try {
    // Extract iv and encrypted data (no salt since key is pre-derived)
    const iv = data.slice(0, ivLength);
    const encrypted = data.slice(ivLength);
    
    // Try native AES-GCM first for better performance
    if (RNSimpleCrypto && RNSimpleCrypto.AES && Platform.OS !== 'web') {
      try {
        // Convert to ArrayBuffer for react-native-simple-crypto
        const keyBuffer = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength);
        const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength);
        const encryptedBuffer = encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength);
        
        // Note: react-native-simple-crypto only supports AES-128-CBC, not AES-GCM
        // So we'll fall back to the JS implementation for now
        console.log('[WebCryptoUtils] RNSimpleCrypto AES available but only supports CBC, using JS implementation');
        
        // Fall back to JS implementation
        const cipher = gcm(key, iv);
        const decrypted = cipher.decrypt(encrypted);
        return decrypted.buffer.slice(decrypted.byteOffset, decrypted.byteOffset + decrypted.byteLength);
      } catch (nativeError) {
        console.warn('[WebCryptoUtils] Native AES-GCM failed, falling back to JS:', nativeError);
        
        // Fall back to JS implementation
        const cipher = gcm(key, iv);
        const decrypted = cipher.decrypt(encrypted);
        return decrypted.buffer.slice(decrypted.byteOffset, decrypted.byteOffset + decrypted.byteLength);
      }
    }
    
    // Use @noble/ciphers for AES-GCM decryption (fallback)
    const cipher = gcm(key, iv);
    const decrypted = cipher.decrypt(encrypted);
    return decrypted.buffer.slice(decrypted.byteOffset, decrypted.byteOffset + decrypted.byteLength);
  } catch (e) {
    console.error('decryptData: error', e);
    throw e;
  }
};
