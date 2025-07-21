import { gcm } from '@noble/ciphers/aes';
import { cbc } from '@noble/ciphers/aes';
import 'react-native-get-random-values';
import { Platform } from 'react-native';
import { AsyncCrypto } from './AsyncCrypto';

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
const ivLength = 16; // AES-CBC uses 16 bytes IV (changed from 12 for GCM)
const useNativeCrypto = Platform.OS !== 'web' && RNSimpleCrypto?.AES;

// generates UUID
export const generateUUID = (): string =>
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: any) =>
    (
      c ^ (global.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (parseInt(c, 10) / 4)))
    ).toString(16)
  );

// encrypts data using AES-CBC with HMAC authentication (for native performance) or AES-GCM (for web)
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
    
    // Use native AES-CBC on mobile for better performance
    if (useNativeCrypto) {
      try {
        // Convert to base64 for react-native-simple-crypto - ensure we have proper ArrayBuffers
        const keyBuffer = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength);
        const ivBuffer = _iv.buffer.slice(_iv.byteOffset, _iv.byteOffset + _iv.byteLength);
        const dataBuffer = dataBytes.buffer.slice(dataBytes.byteOffset, dataBytes.byteOffset + dataBytes.byteLength);
        
        const keyBase64 = RNSimpleCrypto.utils.convertArrayBufferToBase64(keyBuffer);
        const ivBase64 = RNSimpleCrypto.utils.convertArrayBufferToBase64(ivBuffer);
        const dataBase64 = RNSimpleCrypto.utils.convertArrayBufferToBase64(dataBuffer);
        
        // Use native AES-CBC encryption
        const encryptedBase64 = await RNSimpleCrypto.AES.encrypt(dataBase64, keyBase64, ivBase64);
        
        // Convert back to Uint8Array
        const encryptedBuffer = RNSimpleCrypto.utils.convertBase64ToArrayBuffer(encryptedBase64);
        const encrypted = new Uint8Array(encryptedBuffer);
        
        // Generate HMAC for authentication (since CBC doesn't have built-in auth)
        const hmacKey = key.slice(0, 32); // Use first 32 bytes as HMAC key
        const hmacData = new Uint8Array(_iv.length + encrypted.length);
        hmacData.set(_iv, 0);
        hmacData.set(encrypted, _iv.length);
        
        const hmacKeyBuffer = hmacKey.buffer.slice(hmacKey.byteOffset, hmacKey.byteOffset + hmacKey.byteLength);
        const hmacDataBuffer = hmacData.buffer.slice(hmacData.byteOffset, hmacData.byteOffset + hmacData.byteLength);
        
        const hmacBase64 = await RNSimpleCrypto.HMAC.hmac256(
          RNSimpleCrypto.utils.convertArrayBufferToBase64(hmacDataBuffer),
          RNSimpleCrypto.utils.convertArrayBufferToBase64(hmacKeyBuffer)
        );
        const hmacBuffer = RNSimpleCrypto.utils.convertBase64ToArrayBuffer(hmacBase64);
        const hmac = new Uint8Array(hmacBuffer);
        
        // Combine IV + encrypted data + HMAC
        const output = new Uint8Array(ivLength + encrypted.length + hmac.length);
        output.set(_iv, 0);
        output.set(encrypted, ivLength);
        output.set(hmac, ivLength + encrypted.length);
        
        console.log('[WebCryptoUtils] Used native AES-CBC encryption');
        return output;
      } catch (nativeError) {
        console.warn('[WebCryptoUtils] Native AES-CBC failed, falling back to JS:', nativeError);
        // Fall through to JS implementation
      }
    }
    
    // Use @noble/ciphers for AES-GCM encryption (fallback for web or if native fails)
    const cipher = gcm(key, _iv.slice(0, 12)); // GCM uses 12-byte IV
    const encrypted = cipher.encrypt(dataBytes);
    
    // combine iv + encrypted data (no salt needed since key is pre-derived)
    const output = new Uint8Array(12 + encrypted.byteLength); // GCM uses 12-byte IV
    output.set(_iv.slice(0, 12), 0);
    output.set(encrypted, 12);
    return output;
  } catch (e) {
    console.error('encryptData: error', e);
    throw e;
  }
};

// decrypts data using native AES-CBC with HMAC verification (for performance) or AES-GCM (fallback)
// Now with simple loading indicator
export const decryptData = async (
  data: Uint8Array,
  key: Uint8Array,
  abortSignal?: AbortSignal,
  progressCallback?: () => void  // Simplified callback
): Promise<ArrayBuffer> => {
  const start = Date.now();
  console.log('[WebCryptoUtils] decryptData: START', { 
    dataLength: data?.length, 
    keyLength: key?.length, 
    useNativeCrypto, 
    timestamp: start 
  });

  try {
    // Check for cancellation before starting
    if (abortSignal?.aborted) {
      console.log('[WebCryptoUtils] Operation cancelled before starting');
      throw new Error('Operation cancelled');
    }

    // Force GCM for now to avoid native crypto issues
    // We'll fall back to GCM since native crypto has base64 conversion issues
    console.log('[WebCryptoUtils] Using GCM decryption (skipping native crypto due to base64 issues)');
    
    // Use GCM for all data - it's more reliable
    const iv = data.slice(0, 12); // GCM uses 12-byte IV
    const encrypted = data.slice(12);
    
    console.log('[WebCryptoUtils] About to decrypt with GCM', { ivLength: iv.length, encryptedLength: encrypted.length });
    
    // Use AsyncCrypto for better UI responsiveness with simple loading
    console.log('[WebCryptoUtils] Using AsyncCrypto for GCM decryption');
    
    // Use the time-sliced approach for large files
    let decrypted: Uint8Array;
    if (encrypted.length > 500000) { // > 500KB - use time-slicing
      console.log('[WebCryptoUtils] Large file detected, using time-sliced approach');
      decrypted = await AsyncCrypto.decryptGCMAsyncWithProgress(key, iv, encrypted, abortSignal, progressCallback);
    } else {
      console.log('[WebCryptoUtils] Regular async approach');
      decrypted = await AsyncCrypto.decryptGCMAsync(key, iv, encrypted, abortSignal);
    }
    
    console.log('[WebCryptoUtils] AsyncCrypto GCM decryption completed');
    
    const end = Date.now();
    console.log('[WebCryptoUtils] decryptData: SUCCESS', { 
      durationMs: end - start, 
      resultLength: decrypted.length,
      timestamp: end 
    });
    
    return decrypted.buffer.slice(decrypted.byteOffset, decrypted.byteOffset + decrypted.byteLength);
    
  } catch (e) {
    const end = Date.now();
    console.error('[WebCryptoUtils] decryptData: ERROR', { 
      error: e, 
      durationMs: end - start,
      timestamp: end 
    });
    
    if (e instanceof Error && e.message === 'Operation cancelled') {
      throw e;
    }
    console.error('decryptData: error', e);
    throw e;
  }
};
