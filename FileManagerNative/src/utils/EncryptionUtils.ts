import { generateUUID, encryptData, decryptData } from './WebCryptoUtils';

interface FileMetadata {
  name: string;
  type: string;
  size: number;
  folderPath: string[];
  tags: string[];
  uuid: string;
  encryptedAt: string;
  version: string;
}

export class EncryptionUtils {
  // generates a UUID v4
  static generateUUID(): string {
    return generateUUID();
  }

  // encrypts data using AES-GCM with PBKDF2 key derivation
  static async encryptData(data: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    const start = Date.now();
    console.log('[EncryptionUtils] encryptData: START', { dataLength: data?.length, keyLength: key?.length, timestamp: start });

    const result = await encryptData(data, key);

    const end = Date.now();
    console.log('[EncryptionUtils] encryptData: END', { resultLength: result?.length, durationMs: end - start, timestamp: end });
    return result;
  }

  // decrypts data using AES-GCM with derived key
  static async decryptData(data: Uint8Array, key: Uint8Array): Promise<ArrayBuffer> {
    const start = Date.now();
    console.log('[EncryptionUtils] decryptData: START', { dataLength: data?.length, keyLength: key?.length, timestamp: start });

    const result = await decryptData(data, key);

    const end = Date.now();
    console.log('[EncryptionUtils] decryptData: END', { durationMs: end - start, timestamp: end });
    return result;
  }

  // encrypts a file with metadata
  static async encryptFile(
    fileData: Uint8Array,
    fileName: string,
    mimeType: string,
    key: Uint8Array,
    folderPath: string[] = [],
    tags: string[] = []
  ): Promise<{
    encryptedFile: Uint8Array;
    encryptedMetadata: Uint8Array;
    encryptedPreview: Uint8Array | null;
    uuid: string;
  }> {
    const uuid = this.generateUUID();
    const start = Date.now();
    console.log('[EncryptionUtils] encryptFile: START', { uuid, timestamp: start });
    
    // Create metadata
    const metadata: FileMetadata = {
      name: fileName,
      type: mimeType,
      size: fileData.length,
      folderPath,
      tags,
      uuid,
      encryptedAt: new Date().toISOString(),
      version: '1.0'
    };

    // Encrypt file data
    const encryptedFile = await this.encryptData(fileData, key);
    console.log('[EncryptionUtils] encryptFile: encryptedFile length', encryptedFile.length);
    
    // Encrypt metadata
    const metadataString = JSON.stringify(metadata);
    const metadataBuffer = new TextEncoder().encode(metadataString);
    const encryptedMetadata = await this.encryptData(metadataBuffer, key);
    console.log('[EncryptionUtils] encryptFile: encryptedMetadata length', encryptedMetadata.length);

    // Create preview for images
    let encryptedPreview: Uint8Array | null = null;
    if (mimeType.startsWith('image/')) {
      const previewStart = Date.now();
      try {
        const preview = await this.createImagePreview(fileData, mimeType);
        if (preview) {
          encryptedPreview = await this.encryptData(preview, key);
          const previewEnd = Date.now();
          console.log('[EncryptionUtils] encryptFile: encryptedPreview length', encryptedPreview.length, 'previewDurationMs', previewEnd - previewStart);
        }
      } catch (error) {
        console.warn('[EncryptionUtils] Failed to create preview:', error);
      }
    }

    const end = Date.now();
    console.log('[EncryptionUtils] encryptFile: END', { uuid, durationMs: end - start, timestamp: end });
    return {
      encryptedFile,
      encryptedMetadata,
      encryptedPreview,
      uuid
    };
  }

  // decrypts a file and returns metadata and file data
  static async decryptFile(
    encryptedFile: Uint8Array,
    encryptedMetadata: Uint8Array,
    key: Uint8Array
  ): Promise<{
    fileData: Uint8Array;
    metadata: FileMetadata;
  }> {
    const start = Date.now();
    console.log('[EncryptionUtils] decryptFile: START', { encryptedFileLength: encryptedFile?.length, encryptedMetadataLength: encryptedMetadata?.length, keyLength: key?.length, timestamp: start });
    // Decrypt metadata
    const metadataBuffer = await this.decryptData(encryptedMetadata, key);
    const metadataString = new TextDecoder().decode(metadataBuffer);
    const metadata: FileMetadata = JSON.parse(metadataString);

    // Decrypt file data
    const fileBuffer = await this.decryptData(encryptedFile, key);
    const fileData = new Uint8Array(fileBuffer);

    const end = Date.now();
    console.log('[EncryptionUtils] decryptFile: END', { uuid: metadata?.uuid, durationMs: end - start, timestamp: end });
    return { fileData, metadata };
  }

  // creates a preview image
  private static async createImagePreview(
    imageData: Uint8Array,
    mimeType: string
  ): Promise<Uint8Array | null> {
    // Resize and compress image to max 400px width, scaled height
    try {
      const ImageResizer = require('react-native-image-resizer').default;
      // Convert Uint8Array to base64 string
      const base64 = Buffer.from(imageData).toString('base64');
      const uri = `data:${mimeType};base64,${base64}`;

      // Resize and compress
      const resized = await ImageResizer.createResizedImage(
        uri,
        400, // max width
        400, // max height (will scale)
        'JPEG', // output format
        70 // quality
      );

      // Read resized image as base64
      const RNFS = require('react-native-fs');
      const resizedBase64 = await RNFS.readFile(resized.uri, 'base64');
      return new Uint8Array(Buffer.from(resizedBase64, 'base64'));
    } catch (err) {
      console.warn('[EncryptionUtils] Failed to resize/compress preview, using original image', err);
      return imageData;
    }
  }

  // legacy methods for backward compatibility
  static async encryptFileSimple(data: string, key: Uint8Array): Promise<string> {
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    const encrypted = await this.encryptData(dataBytes, key);
    
    // Convert to base64 for string representation
    return btoa(String.fromCharCode(...encrypted));
  }

  static async decryptFileSimple(encryptedData: string, key: Uint8Array): Promise<string> {
    // Convert from base64
    const encrypted = new Uint8Array(
      atob(encryptedData).split('').map(char => char.charCodeAt(0))
    );
    
    const decryptedBuffer = await this.decryptData(encrypted, key);
    const decoder = new TextDecoder();
    const decryptedString = decoder.decode(decryptedBuffer);
    
    if (!decryptedString) {
      throw new Error('Invalid key or corrupted data');
    }
    
    return decryptedString;
  }

  // generates metadata for a file
  static generateMetadata(
    fileName: string, 
    fileSize: number, 
    mimeType: string,
    folderPath: string[] = [],
    tags: string[] = []
  ): FileMetadata {
    return {
      name: fileName,
      type: mimeType,
      size: fileSize,
      folderPath,
      tags,
      uuid: this.generateUUID(),
      encryptedAt: new Date().toISOString(),
      version: '1.0',
    };
  }
}

export default EncryptionUtils;
