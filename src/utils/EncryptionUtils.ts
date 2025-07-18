import { generateUUID, encryptData, decryptData } from './WebCryptoUtils';
import { Platform } from 'react-native';
import { uint8ArrayToBase64, base64ToUint8Array } from './Base64Utils';

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
  }  // encrypts data using secure AES-GCM encryption
  static async encryptData(data: Uint8Array, key: Uint8Array): Promise<Uint8Array> {
    const start = Date.now();
    console.log('[EncryptionUtils] encryptData: START', { dataLength: data?.length, keyLength: key?.length, timestamp: start });
    const result = await encryptData(data, key);
    const end = Date.now();
    console.log('[EncryptionUtils] encryptData: END', { resultLength: result?.length, durationMs: end - start, timestamp: end });
    return result;
  }

  // decrypts data using secure AES-GCM decryption
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

    // Create preview for images
    let encryptedPreview: Uint8Array | null = null;
    if (mimeType.startsWith('image/')) {
      const previewStart = Date.now();
      try {
        const preview = await this.createImagePreview(fileData, mimeType); // Create compressed preview
        if (preview) {
          encryptedPreview = await this.encryptData(preview, key); // Encrypt the preview
          const previewEnd = Date.now();
          console.log('[EncryptionUtils] encryptFile: encryptedPreview length', encryptedPreview.length, 'previewDurationMs', previewEnd - previewStart);
        }
      } catch (error) {
        console.warn('[EncryptionUtils] Failed to create preview:', error);
      }
    }

    // Encrypt original file data without modification
    const encryptedFile = await this.encryptData(fileData, key);
    console.log('[EncryptionUtils] encryptFile: encryptedFile length', encryptedFile.length);
    
    // Encrypt metadata
    const metadataString = JSON.stringify(metadata);
    const metadataBuffer = new TextEncoder().encode(metadataString);
    const encryptedMetadata = await this.encryptData(metadataBuffer, key);
    console.log('[EncryptionUtils] encryptFile: encryptedMetadata length', encryptedMetadata.length);

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
    if (Platform.OS === 'web') {
      // Web implementation using Canvas API for resizing
      return new Promise<Uint8Array | null>((resolve) => {
        try {
          const base64 = uint8ArrayToBase64(imageData);
          const img = new (globalThis as any).Image();
          
          img.onload = () => {
            const canvas = (globalThis as any).document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            if (!ctx) {
              console.warn('[EncryptionUtils] Failed to get canvas context');
              resolve(imageData); // Fallback to original
              return;
            }
            
            // Calculate new dimensions (max 800px for thumbnails - more aggressive compression)
            const maxWidth = 800;
            const maxHeight = 800;
            let { width, height } = img;
            
            if (width > height) {
              if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
              }
            } else {
              if (height > maxHeight) {
                width = (width * maxHeight) / height;
                height = maxHeight;
              }
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // Draw and compress the image
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert to blob with compression (90% quality for better visual quality)
            canvas.toBlob((blob: Blob | null) => {
              if (!blob) {
                console.warn('[EncryptionUtils] Failed to create blob from canvas');
                resolve(imageData); // Fallback to original
                return;
              }
              
              const reader = new FileReader();
              reader.onload = () => {
                const arrayBuffer = reader.result as ArrayBuffer;
                resolve(new Uint8Array(arrayBuffer));
              };
              reader.onerror = () => {
                console.warn('[EncryptionUtils] Failed to read blob');
                resolve(imageData); // Fallback to original
              };
              reader.readAsArrayBuffer(blob);
            }, 'image/jpeg', 0.7); // 70% quality for smaller file size
          };
          
          img.onerror = () => {
            console.warn('[EncryptionUtils] Failed to load image for preview');
            resolve(imageData); // Fallback to original
          };
          
          img.src = `data:${mimeType};base64,${base64}`;
        } catch (error) {
          console.warn('[EncryptionUtils] Error in web preview creation:', error);
          resolve(imageData); // Fallback to original
        }
      });
    }
    
    // Native implementation using react-native-image-resizer
    try {
      const ImageResizer = require('react-native-image-resizer').default;
      // Convert Uint8Array to base64 string
      const base64 = uint8ArrayToBase64(imageData);
      const uri = `data:${mimeType};base64,${base64}`;

      // Resize and compress to max 800px for thumbnails - more aggressive compression
      const resized = await ImageResizer.createResizedImage(
        uri,
        800, // Max width 800px for smaller thumbnails
        800, // Max height 800px for smaller thumbnails
        'JPEG', // output format
        70 // 70% quality for smaller file size
      );

      // Read resized image as base64
      const RNFS = require('react-native-fs');
      const resizedBase64 = await RNFS.readFile(resized.uri, 'base64');
      return base64ToUint8Array(resizedBase64);
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
