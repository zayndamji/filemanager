import { FileManagerService, EncryptedFile } from './FileManagerService';
import { decryptData, encryptData } from './WebCryptoUtils';
import * as FileSystem from './FileSystem';
import { Platform } from 'react-native';
import { uint8ArrayToBase64 } from './Base64Utils';

// migration utility for encrypted file formats
export class MigrationUtils {
  
  // exports an encrypted file in a compatible format
  static async exportToWebFormat(
    uuid: string,
    key: Uint8Array
  ): Promise<{
    encryptedFile: Uint8Array;
    encryptedMetadata: Uint8Array;
    encryptedPreview?: Uint8Array;
    filename: string;
  }> {
    // load the encrypted file from storage
    const { fileData, metadata } = await FileManagerService.loadEncryptedFile(uuid, key);
    // re-encrypt using web crypto compatible implementation
    const encryptedFile = await encryptData(fileData, key);
    // re-encrypt metadata
    const metadataString = JSON.stringify(metadata);
    const metadataBuffer = new TextEncoder().encode(metadataString);
    const encryptedMetadata = await encryptData(metadataBuffer, key);
    // re-encrypt preview if it exists
    let encryptedPreview: Uint8Array | undefined;
    const previewData = await FileManagerService.getFilePreview(uuid, key);
    if (previewData) {
      encryptedPreview = await encryptData(previewData, key);
    }
    
    return {
      encryptedFile,
      encryptedMetadata,
      encryptedPreview,
      filename: metadata.name
    };
  }
  
  // imports an encrypted file from compatible format
  static async importFromWebFormat(
    encryptedFile: Uint8Array,
    encryptedMetadata: Uint8Array,
    encryptedPreview: Uint8Array | undefined,
    key: Uint8Array
  ): Promise<EncryptedFile> {
    // decrypt the metadata to get file information
    const metadataBuffer = await decryptData(encryptedMetadata, key);
    const metadataString = new TextDecoder().decode(metadataBuffer);
    const metadata = JSON.parse(metadataString);
    // decrypt the file data
    const fileBuffer = await decryptData(encryptedFile, key);
    const fileData = new Uint8Array(fileBuffer);
    // save using the file manager service
    // Write fileData to a temp file using FileSystem utility (cross-platform)
    const tempFileName = 'migration-temp-file';
    await FileSystem.writeFile(tempFileName, fileData, 'base64');
    // Save using the file manager service (pass fileData directly if possible)
    const savedFile = await FileManagerService.saveEncryptedFile(
      fileData,
      metadata.name,
      metadata.type,
      key,
      metadata.folderPath || [],
      metadata.tags || []
    );
    // Clean up temp file if needed (FileSystem utility should handle platform differences)
    try { await FileSystem.deleteFile?.(tempFileName); } catch {}
    // if there's a preview, save it separately
    if (encryptedPreview) {
      const previewBuffer = await decryptData(encryptedPreview, key);
      const previewData = new Uint8Array(previewBuffer);
      // save the preview using the existing file path structure
      const previewFileName = `${savedFile.uuid}.preview.enc`;
      const previewBase64 = uint8ArrayToBase64(await encryptData(previewData, key));
      await FileSystem.writeFile(previewFileName, previewBase64, 'base64');
      savedFile.previewPath = previewFileName;
    }
    return savedFile;
  }
  
  /**
   * Validates that an encrypted file is compatible between platforms
   */
  static async validateCompatibility(
    encryptedData: Uint8Array,
    key: Uint8Array
  ): Promise<boolean> {
    try {
      // try to decrypt using our crypto implementation
      const decryptedBuffer = await decryptData(encryptedData, key);
      // if we can decrypt it, it's compatible
      return decryptedBuffer.byteLength > 0;
    } catch (error) {
      console.error('compatibility validation failed:', error);
      return false;
    }
  }
  
  /**
   * Creates a backup of all encrypted files in web-compatible format
   */
  static async createWebCompatibleBackup(key: Uint8Array): Promise<{
    files: Array<{
      uuid: string;
      filename: string;
      encryptedFile: Uint8Array;
      encryptedMetadata: Uint8Array;
      encryptedPreview?: Uint8Array;
    }>;
    timestamp: string;
  }> {
    const allFiles = await FileManagerService.listEncryptedFiles(key);
    const backupFiles = [];
    for (const file of allFiles) {
      try {
        const webFormat = await this.exportToWebFormat(file.uuid, key);
        backupFiles.push({
          uuid: file.uuid,
          filename: webFormat.filename,
          encryptedFile: webFormat.encryptedFile,
          encryptedMetadata: webFormat.encryptedMetadata,
          encryptedPreview: webFormat.encryptedPreview
        });
      } catch (error) {
        console.error(`Failed to export file ${file.uuid}:`, error);
      }
    }
    return {
      files: backupFiles,
      timestamp: new Date().toISOString()
    };
  }
}

export default MigrationUtils;
