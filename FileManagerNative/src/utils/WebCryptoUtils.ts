
import RNSimpleCrypto from 'react-native-simple-crypto';
import { Buffer } from 'buffer';
import 'react-native-get-random-values';

const ivLength = 16; // AES-CBC uses 16 bytes IV

// generates UUID
export const generateUUID = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });


// encrypts data using native AES-256-CBC
export const encryptData = async (
  data: Uint8Array | ArrayBuffer,
  key: Uint8Array,
  iv?: Uint8Array
): Promise<Uint8Array> => {
  try {
    // Generate random IV if not provided
    let _iv: Uint8Array;
    if (iv) {
      _iv = iv;
    } else {
      _iv = crypto.getRandomValues(new Uint8Array(ivLength));
    }
    
    const dataBytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    
    // Use react-native-simple-crypto for AES-256-CBC encryption
    const encryptedData = await RNSimpleCrypto.AES.encrypt(
      dataBytes,
      key,
      _iv
    );
    
    // Store IV + encrypted data
    const encryptedBuffer = Buffer.concat([
      Buffer.from(_iv),
      Buffer.from(encryptedData)
    ]);
    return new Uint8Array(encryptedBuffer);
  } catch (e) {
    console.error('encryptData: error', e);
    throw e;
  }
};


// decrypts data using native AES-256-CBC
export const decryptData = async (
  data: Uint8Array,
  key: Uint8Array
): Promise<ArrayBuffer> => {
  try {
    // Extract IV and encrypted data
    const iv = data.slice(0, ivLength);
    const encryptedBytes = data.slice(ivLength);
    
    // Use react-native-simple-crypto for AES-256-CBC decryption
    const decryptedData = await RNSimpleCrypto.AES.decrypt(
      encryptedBytes,
      key,
      iv
    );
    
    return Buffer.from(decryptedData).buffer;
  } catch (e) {
    console.error('decryptData: error', e);
    throw e;
  }
};
