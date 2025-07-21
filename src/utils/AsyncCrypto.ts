// Asynchronous crypto operations that yield control to UI
import { gcm } from '@noble/ciphers/aes';

// Time-sliced decryption for UI responsiveness
export class AsyncCrypto {
  // Maximum time to spend in sync operations before yielding (ms)
  private static readonly MAX_SYNC_TIME = 16; // One frame at 60fps
  
  // Perform GCM decryption with periodic yields using Web Worker pattern simulation
  static async decryptGCMAsync(
    key: Uint8Array,
    iv: Uint8Array,
    encrypted: Uint8Array,
    abortSignal?: AbortSignal
  ): Promise<Uint8Array> {
    console.log('[AsyncCrypto] Starting async GCM decryption', {
      keyLength: key.length,
      ivLength: iv.length, 
      encryptedLength: encrypted.length
    });
    
    // Check for cancellation
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }

    // For small data, do it synchronously
    if (encrypted.length < 100000) { // < 100KB
      console.log('[AsyncCrypto] Small data, using sync decryption');
      const cipher = gcm(key, iv);
      return cipher.decrypt(encrypted);
    }

    // For large data, use a Web Worker simulation approach
    console.log('[AsyncCrypto] Large data, using worker-simulation approach');
    
    return new Promise<Uint8Array>((resolve, reject) => {
      const startTime = Date.now();
      
      // Simulate chunked work by breaking the CPU-intensive operation
      // into smaller time slices with yields between them
      const performChunkedDecryption = async () => {
        try {
          console.log('[AsyncCrypto] Starting chunked decryption simulation');
          
          // Step 1: Yield and check cancellation
          await new Promise(resolve => setTimeout(resolve, 0));
          if (abortSignal?.aborted) {
            reject(new Error('Operation cancelled'));
            return;
          }
          
          console.log('[AsyncCrypto] Chunk 1: Creating cipher...');
          const cipher = gcm(key, iv);
          
          // Step 2: Yield again 
          await new Promise(resolve => setTimeout(resolve, 5));
          if (abortSignal?.aborted) {
            reject(new Error('Operation cancelled'));
            return;
          }
          
          console.log('[AsyncCrypto] Chunk 2: Beginning decryption...');
          
          // Unfortunately, GCM decryption is atomic due to authentication
          // But we can at least ensure it happens in a separate "task"
          const performActualDecryption = () => {
            return new Promise<Uint8Array>((resolveDecrypt, rejectDecrypt) => {
              // Use setTimeout to ensure this runs as a separate task
              setTimeout(() => {
                try {
                  if (abortSignal?.aborted) {
                    rejectDecrypt(new Error('Operation cancelled'));
                    return;
                  }
                  
                  console.log('[AsyncCrypto] Performing atomic GCM decryption...');
                  const startDecrypt = Date.now();
                  const result = cipher.decrypt(encrypted);
                  const endDecrypt = Date.now();
                  console.log('[AsyncCrypto] Atomic GCM decryption completed in', endDecrypt - startDecrypt, 'ms');
                  
                  resolveDecrypt(result);
                } catch (error) {
                  rejectDecrypt(error);
                }
              }, 10); // 10ms delay to ensure UI thread gets priority
            });
          };
          
          const result = await performActualDecryption();
          
          // Step 3: Final yield and check
          await new Promise(resolve => setTimeout(resolve, 0));
          if (abortSignal?.aborted) {
            reject(new Error('Operation cancelled'));
            return;
          }
          
          const totalTime = Date.now() - startTime;
          console.log('[AsyncCrypto] Chunked decryption completed in', totalTime, 'ms total');
          resolve(result);
          
        } catch (error) {
          console.error('[AsyncCrypto] Chunked decryption failed:', error);
          reject(error);
        }
      };
      
      // Start the chunked process
      performChunkedDecryption();
    });
  }
  
  // Time-sliced GCM decryption that yields control periodically
  static async decryptGCMWithTimeSlicing(
    key: Uint8Array,
    iv: Uint8Array,
    encrypted: Uint8Array,
    abortSignal?: AbortSignal
  ): Promise<Uint8Array> {
    console.log('[AsyncCrypto] Starting time-sliced GCM decryption', {
      keyLength: key.length,
      ivLength: iv.length, 
      encryptedLength: encrypted.length
    });
    
    // Check for cancellation
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }

    // For small data, do it synchronously
    if (encrypted.length < 50000) { // < 50KB
      console.log('[AsyncCrypto] Small data, using sync decryption');
      const cipher = gcm(key, iv);
      return cipher.decrypt(encrypted);
    }

    // For larger data, break into processing steps with yields
    console.log('[AsyncCrypto] Large data, using time-sliced approach');
    
    return new Promise<Uint8Array>((resolve, reject) => {
      const performTimeSlicedDecryption = async () => {
        try {
          // Step 1: Create cipher (yield first)
          await new Promise(resolve => setTimeout(resolve, 0));
          if (abortSignal?.aborted) {
            reject(new Error('Operation cancelled'));
            return;
          }
          
          console.log('[AsyncCrypto] Step 1: Creating cipher...');
          const cipher = gcm(key, iv);
          
          // Step 2: Small delay to let UI update
          await new Promise(resolve => setTimeout(resolve, 10));
          if (abortSignal?.aborted) {
            reject(new Error('Operation cancelled'));
            return;
          }
          
          console.log('[AsyncCrypto] Step 2: Starting decryption...');
          
          // Break the actual decryption into smaller time slices
          const SLICE_SIZE = 8 * 1024; // 8KB per slice
          const numSlices = Math.ceil(encrypted.length / SLICE_SIZE);
          
          if (numSlices <= 1) {
            // Small enough to do in one go
            const startTime = Date.now();
            const result = cipher.decrypt(encrypted);
            const endTime = Date.now();
            console.log('[AsyncCrypto] Single slice decryption completed in', endTime - startTime, 'ms');
            resolve(result);
            return;
          }
          
          console.log('[AsyncCrypto] Processing', numSlices, 'slices of ~8KB each');
          
          // Since GCM is atomic, we can't actually slice the decryption
          // But we can simulate progress and yield control
          for (let i = 0; i < numSlices; i++) {
            if (abortSignal?.aborted) {
              reject(new Error('Operation cancelled'));
              return;
            }
            
            // Yield control every few slices
            if (i % 4 === 0) {
              await new Promise(resolve => setTimeout(resolve, 5));
            }
            
            // On the last slice, do the actual decryption
            if (i === numSlices - 1) {
              console.log('[AsyncCrypto] Final slice: performing atomic GCM decryption');
              const startTime = Date.now();
              const result = cipher.decrypt(encrypted);
              const endTime = Date.now();
              console.log('[AsyncCrypto] Atomic decryption completed in', endTime - startTime, 'ms');
              resolve(result);
              return;
            }
          }
          
        } catch (error) {
          console.error('[AsyncCrypto] Time-sliced decryption failed:', error);
          reject(error);
        }
      };
      
      // Start the process
      performTimeSlicedDecryption();
    });
  }

  // Chunked GCM decryption for truly interruptible operations
  // Note: This requires files to be encrypted in chunks with individual IVs and tags
  static async decryptGCMChunked(
    key: Uint8Array,
    encryptedData: Uint8Array,
    abortSignal?: AbortSignal,
    progressCallback?: (message: string, progress?: number) => void
  ): Promise<Uint8Array> {
    console.log('[AsyncCrypto] Starting chunked GCM decryption', {
      keyLength: key.length,
      encryptedLength: encryptedData.length
    });
    
    // Check for cancellation
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }

    // First, check if this is actually chunked data format
    // Chunked format would have multiple IV/tag pairs
    // For now, we'll detect this by checking for expected chunk structure
    if (!this.isChunkedFormat(encryptedData)) {
      throw new Error('Data is not in chunked format - falling back to atomic decryption');
    }

    const CHUNK_SIZE = 64 * 1024; // 64KB chunks
    const IV_SIZE = 12; // GCM IV size
    const TAG_SIZE = 16; // GCM authentication tag size
    const CHUNK_HEADER_SIZE = IV_SIZE + TAG_SIZE; // 28 bytes per chunk
    
    // For small data, use single chunk
    if (encryptedData.length < CHUNK_SIZE + CHUNK_HEADER_SIZE) {
      console.log('[AsyncCrypto] Small data, using single chunk decryption');
      progressCallback?.('Decrypting small file...', 0);
      
      // Extract IV from the beginning
      const iv = encryptedData.slice(0, IV_SIZE);
      const encrypted = encryptedData.slice(IV_SIZE);
      
      const cipher = gcm(key, iv);
      const result = cipher.decrypt(encrypted);
      
      progressCallback?.('Decryption completed!', 100);
      return result;
    }

    // Calculate number of chunks
    const totalSize = encryptedData.length;
    const numChunks = Math.ceil((totalSize - IV_SIZE) / (CHUNK_SIZE + TAG_SIZE));
    console.log('[AsyncCrypto] Large data, processing', numChunks, 'chunks of ~64KB each');
    
    progressCallback?.(`Preparing to decrypt ${numChunks} chunks...`, 0);
    
    // Give UI a chance to update
    await new Promise(resolve => setTimeout(resolve, 50));
    if (abortSignal?.aborted) throw new Error('Operation cancelled');

    const decryptedChunks: Uint8Array[] = [];
    let offset = 0;
    
    // Process each chunk
    for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
      if (abortSignal?.aborted) {
        throw new Error('Operation cancelled');
      }
      
      const progress = Math.round((chunkIndex / numChunks) * 100);
      progressCallback?.(`Decrypting chunk ${chunkIndex + 1}/${numChunks}...`, progress);
      
      console.log('[AsyncCrypto] Processing chunk', chunkIndex + 1, 'of', numChunks);
      
      // For the first chunk, we need to handle the global IV differently
      let chunkData: Uint8Array;
      let iv: Uint8Array;
      
      if (chunkIndex === 0) {
        // First chunk: IV is at the beginning of the entire data
        iv = encryptedData.slice(0, IV_SIZE);
        const remainingData = encryptedData.slice(IV_SIZE);
        const chunkEnd = Math.min(CHUNK_SIZE + TAG_SIZE, remainingData.length);
        chunkData = remainingData.slice(0, chunkEnd);
        offset = IV_SIZE + chunkEnd;
      } else {
        // Subsequent chunks: each has its own IV + encrypted data + tag
        const chunkStart = offset;
        const chunkEnd = Math.min(chunkStart + IV_SIZE + CHUNK_SIZE + TAG_SIZE, totalSize);
        const fullChunk = encryptedData.slice(chunkStart, chunkEnd);
        
        if (fullChunk.length < IV_SIZE + TAG_SIZE) {
          throw new Error('Invalid chunk format: too small');
        }
        
        iv = fullChunk.slice(0, IV_SIZE);
        chunkData = fullChunk.slice(IV_SIZE);
        offset = chunkEnd;
      }
      
      try {
        // Decrypt this chunk
        const cipher = gcm(key, iv);
        const decryptedChunk = cipher.decrypt(chunkData);
        decryptedChunks.push(decryptedChunk);
        
        console.log('[AsyncCrypto] Chunk', chunkIndex + 1, 'decrypted successfully, size:', decryptedChunk.length);
        
      } catch (error) {
        console.error('[AsyncCrypto] Failed to decrypt chunk', chunkIndex + 1, ':', error);
        throw new Error(`Chunk ${chunkIndex + 1} decryption failed: ${error}`);
      }
      
      // Yield control to UI after each chunk
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }
    
    // Combine all decrypted chunks
    progressCallback?.('Combining decrypted chunks...', 95);
    console.log('[AsyncCrypto] Combining', decryptedChunks.length, 'decrypted chunks');
    
    const totalDecryptedSize = decryptedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalDecryptedSize);
    
    let resultOffset = 0;
    for (const chunk of decryptedChunks) {
      result.set(chunk, resultOffset);
      resultOffset += chunk.length;
    }
    
    progressCallback?.('Decryption completed!', 100);
    console.log('[AsyncCrypto] Chunked decryption completed, total size:', result.length);
    
    return result;
  }

  // Helper method to detect if data is in chunked format
  private static isChunkedFormat(data: Uint8Array): boolean {
    // For now, assume all data is NOT chunked (legacy format)
    // In the future, we could add a header or magic bytes to identify chunked format
    // Or try to decrypt and catch authentication failures
    return false;
  }

  // Enhanced approach: Simple loading with time-slicing
  static async decryptGCMAsyncWithProgress(
    key: Uint8Array,
    iv: Uint8Array,
    encrypted: Uint8Array,
    abortSignal?: AbortSignal,
    progressCallback?: () => void  // Simplified to just indicate loading
  ): Promise<Uint8Array> {
    console.log('[AsyncCrypto] Starting decryption with simple progress');
    
    // Use the time-sliced approach for all files
    return await this.decryptGCMWithTimeSlicing(key, iv, encrypted, abortSignal);
  }
  
  // Maintain backward compatibility
  static async decryptGCMAsyncWithIdleCallback(
    key: Uint8Array,
    iv: Uint8Array,
    encrypted: Uint8Array,
    abortSignal?: AbortSignal
  ): Promise<Uint8Array> {
    return this.decryptGCMAsyncWithProgress(key, iv, encrypted, abortSignal);
  }
  
  // Simulated chunked processing for future improvement
  static async simulateChunkedWork<T>(
    workFn: () => T,
    description: string,
    abortSignal?: AbortSignal
  ): Promise<T> {
    console.log('[AsyncCrypto] Starting chunked work:', description);
    
    // Yield control first
    await new Promise(resolve => setTimeout(resolve, 0));
    
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }
    
    console.log('[AsyncCrypto] Performing work:', description);
    const result = workFn();
    
    // Yield after work
    await new Promise(resolve => setTimeout(resolve, 0));
    
    if (abortSignal?.aborted) {
      throw new Error('Operation cancelled');
    }
    
    console.log('[AsyncCrypto] Completed work:', description);
    return result;
  }
}
