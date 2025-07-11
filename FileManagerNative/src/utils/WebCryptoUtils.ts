import { gcm } from '@noble/ciphers/aes';
import { sha256 } from '@noble/hashes/sha256';

// encryption constants
const saltLength = 16;
const ivLength = 12;
const iterations = 100000; // Secure, production value

const crypto = require('crypto');

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
  salt?: Uint8Array,
  iv?: Uint8Array
): Promise<Uint8Array> => {
  try {
    // If salt/iv not provided, generate them
    const _salt = salt || (() => { const s = new Uint8Array(saltLength); global.crypto.getRandomValues(s); return s; })();
    const _iv = iv || (() => { const v = new Uint8Array(ivLength); global.crypto.getRandomValues(v); return v; })();
    // Convert data to Uint8Array if it's ArrayBuffer
    const dataBytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
    // Use @noble/ciphers for AES-GCM encryption
    const cipher = gcm(key, _iv);
    const encrypted = cipher.encrypt(dataBytes);
    // combine salt + iv + encrypted data
    const output = new Uint8Array(saltLength + ivLength + encrypted.byteLength);
    output.set(_salt, 0);
    output.set(_iv, saltLength);
    output.set(encrypted, saltLength + ivLength);
    return output;
  } catch (e) {
    console.error('encryptData: error', e);
    throw e;
  }
};

// decrypts data using AES-GCM
export const decryptData = async (
  data: Uint8Array,
  key: Uint8Array
): Promise<ArrayBuffer> => {
  try {
    // Extract salt, iv, and encrypted data exactly like web app
    const salt = data.slice(0, saltLength);
    const iv = data.slice(saltLength, saltLength + ivLength);
    const encrypted = data.slice(saltLength + ivLength);
    // Use @noble/ciphers for AES-GCM decryption
    const cipher = gcm(key, iv);
    const decrypted = cipher.decrypt(encrypted);
    return decrypted.buffer.slice(decrypted.byteOffset, decrypted.byteOffset + decrypted.byteLength);
  } catch (e) {
    console.error('decryptData: error', e);
    throw e;
  }
};
