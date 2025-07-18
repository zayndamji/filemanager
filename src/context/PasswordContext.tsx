import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { sha256 } from '@noble/hashes/sha256';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Conditionally import RNSimpleCrypto only on native platforms
let RNSimpleCrypto: any = null;
if (Platform.OS !== 'web') {
  try {
    const RNSimpleCryptoModule = require('react-native-simple-crypto');
    console.log('[PasswordContext] RNSimpleCrypto loaded, checking structure:', Object.keys(RNSimpleCryptoModule));
    
    // Check if it's a default export
    if (RNSimpleCryptoModule.default) {
      RNSimpleCrypto = RNSimpleCryptoModule.default;
      console.log('[PasswordContext] Using default export, checking structure:', Object.keys(RNSimpleCrypto));
      console.log('[PasswordContext] RNSimpleCrypto.PBKDF2:', RNSimpleCrypto.PBKDF2);
      console.log('[PasswordContext] RNSimpleCrypto.AES:', RNSimpleCrypto.AES);
      console.log('[PasswordContext] RNSimpleCrypto.SHA:', RNSimpleCrypto.SHA);
      console.log('[PasswordContext] RNSimpleCrypto.HMAC:', RNSimpleCrypto.HMAC);
      console.log('[PasswordContext] RNSimpleCrypto.utils:', RNSimpleCrypto.utils);
    } else {
      RNSimpleCrypto = RNSimpleCryptoModule;
      console.log('[PasswordContext] Using direct export, checking structure:', Object.keys(RNSimpleCrypto));
      console.log('[PasswordContext] RNSimpleCrypto.PBKDF2:', RNSimpleCrypto.PBKDF2);
    }
    
    // Check for different API structures
    if (RNSimpleCrypto?.PBKDF2?.hash) {
      console.log('[PasswordContext] RNSimpleCrypto.PBKDF2.hash available');
    } else if (RNSimpleCrypto?.PBKDF2) {
      console.log('[PasswordContext] RNSimpleCrypto.PBKDF2 available but checking type:', typeof RNSimpleCrypto.PBKDF2);
    } else if (RNSimpleCrypto?.pbkdf2) {
      console.log('[PasswordContext] RNSimpleCrypto.pbkdf2 available (lowercase)');
    } else {
      console.warn('[PasswordContext] RNSimpleCrypto.PBKDF2 not available');
      console.log('[PasswordContext] Available methods:', Object.keys(RNSimpleCrypto || {}));
      RNSimpleCrypto = null;
    }
  } catch (e) {
    console.warn('[PasswordContext] Failed to load react-native-simple-crypto:', e);
    RNSimpleCrypto = null;
  }
}

// Cross-platform PBKDF2 using @noble/hashes (more reliable)
function pbkdf2Noble(password: string, salt: Uint8Array, iterations: number, keyLen: number): Uint8Array {
  const passwordBytes = new TextEncoder().encode(password);
  return pbkdf2(sha256, passwordBytes, salt, { c: iterations, dkLen: keyLen });
}

// Web-native PBKDF2 using SubtleCrypto (backup)
async function pbkdf2Web(password: string, salt: Uint8Array, iterations: number, keyLen: number, hash: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );
  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: iterations,
      hash: hash,
    },
    keyMaterial,
    keyLen * 8
  );
  return new Uint8Array(derivedBits);
}

// CRITICAL: Consistent PBKDF2 iterations across ALL platforms for cross-compatibility
const PBKDF2_ITERATIONS = 50000;


interface PasswordContextType {
  password: string;
  salt: string;
  derivedKey: Uint8Array | null;
  setPassword: (password: string) => void;
  setSalt: (salt: string) => void;
}

const PasswordContext = createContext<PasswordContextType | undefined>(undefined);

interface PasswordProviderProps {
  children: ReactNode;
}

const SALT_KEY = 'filemanager_salt';

export function PasswordProvider({ children }: PasswordProviderProps) {
  const [password, setPassword] = useState<string>('');
  const [salt, setSalt] = useState<string>('');
  const [derivedKey, setDerivedKey] = useState<Uint8Array | null>(null);
  const [isDerivingKey, setIsDerivingKey] = useState<boolean>(false);

  // Load salt from AsyncStorage on mount
  React.useEffect(() => {
    const loadSalt = async () => {
      try {
        const savedSalt = await AsyncStorage.getItem(SALT_KEY);
        if (savedSalt) setSalt(savedSalt);
        console.log('[PasswordContext] Loaded salt from storage.');
      } catch (err) {
        console.error('[PasswordContext] Could not load salt:', err);
      }
    };
    loadSalt();
  }, []);

  // Persist salt when changed
  React.useEffect(() => {
    if (salt) {
      console.log('[PasswordContext] Saving salt to storage.');
      AsyncStorage.setItem(SALT_KEY, salt).catch(err => {
        console.error('[PasswordContext] Could not save salt:', err);
      });
    }
  }, [salt]);

  // Derive key when password or salt changes
  React.useEffect(() => {
    console.log('[PasswordContext] password or salt changed.');
    if (!password || !salt) {
      setDerivedKey(null);
      console.log('[PasswordContext] derivedKey set to null (missing password or salt)');
      return;
    }
    
    // Avoid re-deriving if already in progress
    if (isDerivingKey) {
      console.log('[PasswordContext] Key derivation already in progress, skipping');
      return;
    }
    
    const derive = async () => {
      setIsDerivingKey(true);
      const startTime = Date.now();
      try {
        let key: Uint8Array | null = null;
        
        if (Platform.OS === 'web') {
          console.log('[PasswordContext] Using web SubtleCrypto PBKDF2');
          const encoder = new TextEncoder();
          const saltBytes = encoder.encode(salt);
          // Use consistent iteration count across all platforms
          key = await pbkdf2Web(password, saltBytes, PBKDF2_ITERATIONS, 32, 'SHA-256');
        } else {
          // Try multiple approaches for native platforms
          let useNoble = false;
          
          if (RNSimpleCrypto) {
            try {
              console.log('[PasswordContext] Attempting RNSimpleCrypto PBKDF2');
              let keyArray;
              
              // Try different API structures
              if (RNSimpleCrypto.PBKDF2 && RNSimpleCrypto.PBKDF2.hash) {
                // API structure: RNSimpleCrypto.PBKDF2.hash(password, salt, iterations, keyLength, hashAlgorithm)
                // Use consistent iteration count across all platforms
                keyArray = await RNSimpleCrypto.PBKDF2.hash(
                  password,
                  salt, // Use salt as string, not bytes
                  PBKDF2_ITERATIONS,
                  32,
                  'SHA256'
                );
              } else if (RNSimpleCrypto.pbkdf2) {
                // API structure: RNSimpleCrypto.pbkdf2 (lowercase)
                keyArray = await RNSimpleCrypto.pbkdf2(
                  password,
                  salt,
                  PBKDF2_ITERATIONS,
                  32,
                  'SHA256'
                );
              } else if (RNSimpleCrypto.PBKDF2) {
                // API structure: RNSimpleCrypto.PBKDF2 (direct function)
                keyArray = await RNSimpleCrypto.PBKDF2(
                  password,
                  salt,
                  PBKDF2_ITERATIONS,
                  32,
                  'SHA256'
                );
              } else {
                throw new Error('No supported PBKDF2 method found');
              }
              
              // Convert result to Uint8Array
              if (keyArray instanceof ArrayBuffer) {
                key = new Uint8Array(keyArray);
              } else if (Array.isArray(keyArray)) {
                key = new Uint8Array(keyArray);
              } else {
                key = new Uint8Array(keyArray);
              }
              
              console.log('[PasswordContext] RNSimpleCrypto PBKDF2 succeeded');
            } catch (err) {
              console.warn('[PasswordContext] RNSimpleCrypto PBKDF2 failed:', err);
              useNoble = true;
            }
          } else {
            console.log('[PasswordContext] RNSimpleCrypto not available');
            useNoble = true;
          }
          
          if (useNoble) {
            console.log('[PasswordContext] Using @noble/hashes PBKDF2');
            const encoder = new TextEncoder();
            const saltBytes = encoder.encode(salt);
            // Use consistent iteration count across all platforms
            key = pbkdf2Noble(password, saltBytes, PBKDF2_ITERATIONS, 32);
          }
        }
        
        if (key) {
          setDerivedKey(key);
          const endTime = Date.now();
          console.log('[PasswordContext] derivedKey set successfully in', endTime - startTime, 'ms');
        } else {
          throw new Error('Failed to derive key with all methods');
        }
      } catch (err) {
        console.error('[PasswordContext] PBKDF2 error:', err);
        setDerivedKey(null);
        console.log('[PasswordContext] derivedKey set to null (PBKDF2 error)');
      } finally {
        setIsDerivingKey(false);
      }
    };
    derive();
  }, [password, salt]); // ✅ Removed isDerivingKey dependency to prevent loop

  return (
    <PasswordContext.Provider value={{ password, salt, derivedKey, setPassword, setSalt }}>
      {children}
    </PasswordContext.Provider>
  );
}

export function usePasswordContext(): PasswordContextType {
  const context = useContext(PasswordContext);
  if (!context) {
    throw new Error('usePasswordContext must be used within a PasswordProvider');
  }
  return context;
}
