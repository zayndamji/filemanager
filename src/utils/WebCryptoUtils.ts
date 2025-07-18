import { gcm } from '@noble/ciphers/aes';
import 'react-native-get-random-values';

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
    
    // Use @noble/ciphers for AES-GCM encryption
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
    
    // Use @noble/ciphers for AES-GCM decryption
    const cipher = gcm(key, iv);
    const decrypted = cipher.decrypt(encrypted);
    return decrypted.buffer.slice(decrypted.byteOffset, decrypted.byteOffset + decrypted.byteLength);
  } catch (e) {
    console.error('decryptData: error', e);
    throw e;
  }
};
