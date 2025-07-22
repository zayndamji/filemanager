import { gcm } from '@noble/ciphers/aes';
import 'react-native-get-random-values';
import { Platform } from 'react-native';
import { Buffer } from 'buffer';
import { AsyncCrypto } from './AsyncCrypto';

// Try to use native crypto for better performance on native platforms
let RNSimpleCrypto: any = null;
let RNAesGcmCrypto: any = null;

if (Platform.OS !== 'web') {
  // Try react-native-aes-gcm-crypto first (specifically designed for AES-GCM)
  try {
    RNAesGcmCrypto = require('react-native-aes-gcm-crypto').default;
    console.log('[WebCryptoUtils] react-native-aes-gcm-crypto loaded - checking features:');
    console.log('- AesGcm available:', !!RNAesGcmCrypto);
    console.log('- encrypt available:', typeof RNAesGcmCrypto.encrypt === 'function');
    console.log('- decrypt available:', typeof RNAesGcmCrypto.decrypt === 'function');
  } catch (e) {
    console.warn('[WebCryptoUtils] Failed to load react-native-aes-gcm-crypto:', e);
    RNAesGcmCrypto = null;
  }

  // Fallback to react-native-simple-crypto
  if (!RNAesGcmCrypto) {
    try {
      const RNSimpleCryptoModule = require('react-native-simple-crypto');
      // Check if it's a default export
      if (RNSimpleCryptoModule.default) {
        RNSimpleCrypto = RNSimpleCryptoModule.default;
      } else {
        RNSimpleCrypto = RNSimpleCryptoModule;
      }
      
      console.log('[WebCryptoUtils] RNSimpleCrypto loaded as fallback');
    } catch (e) {
      console.warn('[WebCryptoUtils] Failed to load react-native-simple-crypto, using JS implementation');
      RNSimpleCrypto = null;
    }
  }
}

// encryption constants - use 12 bytes for GCM IV consistently
const ivLength = 12; // AES-GCM uses 12 bytes IV
const useNativeCrypto = Platform.OS !== 'web' && (RNAesGcmCrypto || RNSimpleCrypto?.AES);

// generates UUID
export const generateUUID = (): string =>
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: any) =>
    (
      c ^ (global.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (parseInt(c, 10) / 4)))
    ).toString(16)
  );

// encrypts data using AES-GCM
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
    
    // Try native AES-GCM with react-native-aes-gcm-crypto first (specifically designed for AES-GCM)
    if (RNAesGcmCrypto && Platform.OS !== 'web') {
      try {
        console.log('[WebCryptoUtils] Attempting native AES-GCM encryption with react-native-aes-gcm-crypto');
        
        // Convert key to Base64 (react-native-aes-gcm-crypto expects Base64 keys)
        const keyBase64 = Buffer.from(key).toString('base64');
        
        // Convert data to Base64 for binary encryption
        const dataBase64 = Buffer.from(dataBytes).toString('base64');
        
        // Use react-native-aes-gcm-crypto for AES-GCM encryption
        const result = await RNAesGcmCrypto.encrypt(dataBase64, true, keyBase64);
        
        // result contains: { iv: string, tag: string, content: string }
        // Convert hex strings back to Uint8Array
        const ivFromResult = new Uint8Array(result.iv.match(/.{2}/g)!.map((byte: string) => parseInt(byte, 16)));
        const tagFromResult = new Uint8Array(result.tag.match(/.{2}/g)!.map((byte: string) => parseInt(byte, 16)));
        const encryptedContent = new Uint8Array(Buffer.from(result.content, 'base64'));
        
        // Combine IV + encrypted data + auth tag (our format)
        const output = new Uint8Array(ivFromResult.length + encryptedContent.length + tagFromResult.length);
        output.set(ivFromResult, 0);
        output.set(encryptedContent, ivFromResult.length);
        output.set(tagFromResult, ivFromResult.length + encryptedContent.length);
        
        console.log('[WebCryptoUtils] Native AES-GCM encryption with react-native-aes-gcm-crypto completed');
        return output;
      } catch (nativeError) {
        console.warn('[WebCryptoUtils] Native AES-GCM failed with react-native-aes-gcm-crypto, falling back:', nativeError);
        // Fall through to next option
      }
    }
    
    // Try native AES-GCM with react-native-simple-crypto as fallback
    if (RNSimpleCrypto && Platform.OS !== 'web') {
      try {
        console.log('[WebCryptoUtils] Attempting native AES-GCM encryption with react-native-simple-crypto');
        
        // Convert to base64 for react-native-simple-crypto
        const keyBuffer = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength);
        const ivBuffer = _iv.buffer.slice(_iv.byteOffset, _iv.byteOffset + _iv.byteLength);
        const dataBuffer = dataBytes.buffer.slice(dataBytes.byteOffset, dataBytes.byteOffset + dataBytes.byteLength);
        
        const keyBase64 = RNSimpleCrypto.utils.convertArrayBufferToBase64(keyBuffer);
        const ivBase64 = RNSimpleCrypto.utils.convertArrayBufferToBase64(ivBuffer);
        const dataBase64 = RNSimpleCrypto.utils.convertArrayBufferToBase64(dataBuffer);
        
        // Use native AES-GCM encryption if available
        let encryptedBase64: string;
        
        // Check if the library supports GCM mode
        if (RNSimpleCrypto.AES.gcm && typeof RNSimpleCrypto.AES.gcm.encrypt === 'function') {
          // Modern API with GCM support
          encryptedBase64 = await RNSimpleCrypto.AES.gcm.encrypt(dataBase64, keyBase64, ivBase64);
          console.log('[WebCryptoUtils] Used native AES-GCM encryption');
        } else if (RNSimpleCrypto.AES.encrypt_gcm && typeof RNSimpleCrypto.AES.encrypt_gcm === 'function') {
          // Alternative GCM API
          encryptedBase64 = await RNSimpleCrypto.AES.encrypt_gcm(dataBase64, keyBase64, ivBase64);
          console.log('[WebCryptoUtils] Used native AES-GCM encryption (alt API)');
        } else {
          // No GCM support available
          throw new Error('Native AES-GCM not available in this version of react-native-simple-crypto');
        }
        
        // Convert back to Uint8Array
        const encryptedBuffer = RNSimpleCrypto.utils.convertBase64ToArrayBuffer(encryptedBase64);
        const encrypted = new Uint8Array(encryptedBuffer);
        
        // Combine IV + encrypted data (GCM includes auth tag automatically)
        const output = new Uint8Array(ivLength + encrypted.length);
        output.set(_iv, 0);
        output.set(encrypted, ivLength);
        
        console.log('[WebCryptoUtils] Used native AES-GCM encryption with react-native-simple-crypto');
        return output;
      } catch (nativeError) {
        console.warn('[WebCryptoUtils] Native AES-GCM failed with react-native-simple-crypto, falling back to JS:', nativeError);
        // Fall through to JS implementation
      }
    }
    
    // Use @noble/ciphers for AES-GCM encryption (fallback for web or if native fails)
    console.log('[WebCryptoUtils] Using JS AES-GCM encryption');
    const cipher = gcm(key, _iv);
    const encrypted = cipher.encrypt(dataBytes);
    
    // combine iv + encrypted data (no salt needed since key is pre-derived)
    const output = new Uint8Array(12 + encrypted.byteLength); // GCM uses 12-byte IV
    output.set(_iv, 0);
    output.set(encrypted, 12);
    return output;
  } catch (e) {
    console.error('encryptData: error', e);
    throw e;
  }
};

// decrypts data using native AES-GCM (for performance) or JS AES-GCM (fallback)
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

    // Try native AES-GCM with react-native-aes-gcm-crypto first for better performance
    if (RNAesGcmCrypto && Platform.OS !== 'web' && data.length > 0) {
      try {
        console.log('[WebCryptoUtils] Attempting native AES-GCM decryption with react-native-aes-gcm-crypto');
        
        // Our format: IV (12 bytes) + encrypted data + auth tag (16 bytes)
        const iv = data.slice(0, 12);
        const encryptedAndTag = data.slice(12);
        const encrypted = encryptedAndTag.slice(0, -16); // All except last 16 bytes
        const tag = encryptedAndTag.slice(-16); // Last 16 bytes
        
        console.log('[WebCryptoUtils] About to decrypt with react-native-aes-gcm-crypto GCM', { 
          ivLength: iv.length, 
          encryptedLength: encrypted.length,
          tagLength: tag.length 
        });
        
        // Convert to formats expected by react-native-aes-gcm-crypto
        const keyBase64 = Buffer.from(key).toString('base64');
        const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
        const tagHex = Array.from(tag).map(b => b.toString(16).padStart(2, '0')).join('');
        const encryptedBase64 = Buffer.from(encrypted).toString('base64');
        
        // Use react-native-aes-gcm-crypto for AES-GCM decryption
        const decryptedBase64 = await RNAesGcmCrypto.decrypt(
          encryptedBase64,
          keyBase64,
          ivHex,
          tagHex,
          true // isBinary = true to get Base64 result for binary data
        );
        
        // Convert back to ArrayBuffer
        const decrypted = Buffer.from(decryptedBase64, 'base64');
        const decryptedBuffer = decrypted.buffer.slice(decrypted.byteOffset, decrypted.byteOffset + decrypted.byteLength);
        
        const end = Date.now();
        console.log('[WebCryptoUtils] decryptData: SUCCESS (react-native-aes-gcm-crypto)', { 
          durationMs: end - start, 
          resultLength: decryptedBuffer.byteLength,
          timestamp: end 
        });
        
        return decryptedBuffer;
      } catch (nativeError) {
        console.warn('[WebCryptoUtils] Native AES-GCM failed with react-native-aes-gcm-crypto, falling back:', nativeError);
        // Fall through to next option
      }
    }
    
    // Try native AES-GCM with react-native-simple-crypto as fallback
    if (RNSimpleCrypto && Platform.OS !== 'web' && data.length > 0) {
      try {
        console.log('[WebCryptoUtils] Attempting native AES-GCM decryption with react-native-simple-crypto');
        
        // Extract IV and encrypted data
        const iv = data.slice(0, 12); // GCM uses 12-byte IV
        const encrypted = data.slice(12);
        
        console.log('[WebCryptoUtils] About to decrypt with native GCM', { ivLength: iv.length, encryptedLength: encrypted.length });
        
        // Convert to base64 for react-native-simple-crypto
        const keyBuffer = key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength);
        const ivBuffer = iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength);
        const encryptedBuffer = encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength);
        
        const keyBase64 = RNSimpleCrypto.utils.convertArrayBufferToBase64(keyBuffer);
        const ivBase64 = RNSimpleCrypto.utils.convertArrayBufferToBase64(ivBuffer);
        const encryptedBase64 = RNSimpleCrypto.utils.convertArrayBufferToBase64(encryptedBuffer);
        
        // Use native AES-GCM decryption if available
        let decryptedBase64: string;
        
        // Check if the library supports GCM mode
        if (RNSimpleCrypto.AES.gcm && typeof RNSimpleCrypto.AES.gcm.decrypt === 'function') {
          // Modern API with GCM support
          decryptedBase64 = await RNSimpleCrypto.AES.gcm.decrypt(encryptedBase64, keyBase64, ivBase64);
          console.log('[WebCryptoUtils] Used native AES-GCM decryption');
        } else if (RNSimpleCrypto.AES.decrypt_gcm && typeof RNSimpleCrypto.AES.decrypt_gcm === 'function') {
          // Alternative GCM API
          decryptedBase64 = await RNSimpleCrypto.AES.decrypt_gcm(encryptedBase64, keyBase64, ivBase64);
          console.log('[WebCryptoUtils] Used native AES-GCM decryption (alt API)');
        } else {
          // No GCM support available
          throw new Error('Native AES-GCM not available in this version of react-native-simple-crypto');
        }
        
        // Convert back to ArrayBuffer
        const decryptedBuffer = RNSimpleCrypto.utils.convertBase64ToArrayBuffer(decryptedBase64);
        
        const end = Date.now();
        console.log('[WebCryptoUtils] decryptData: SUCCESS (react-native-simple-crypto)', { 
          durationMs: end - start, 
          resultLength: decryptedBuffer.byteLength,
          timestamp: end 
        });
        
        return decryptedBuffer;
        
      } catch (nativeError) {
        console.warn('[WebCryptoUtils] Native AES-GCM failed, falling back to JS:', nativeError);
        // Fall through to JS implementation
      }
    }
    
    // Fallback to JS AES-GCM implementation
    console.log('[WebCryptoUtils] Using JS AES-GCM decryption');
    
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
