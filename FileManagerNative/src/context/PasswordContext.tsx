import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { sha256 } from '@noble/hashes/sha256';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Conditionally import RNSimpleCrypto only on native platforms
let RNSimpleCrypto: any = null;
if (Platform.OS !== 'web') {
  try {
    RNSimpleCrypto = require('react-native-simple-crypto');
  } catch (e) {
    console.warn('Failed to load react-native-simple-crypto:', e);
  }
}

// Web-native PBKDF2 using SubtleCrypto
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
    const derive = async () => {
      try {
        const encoder = new TextEncoder();
        const saltBytes = encoder.encode(salt);
        let key: Uint8Array;
        
        if (Platform.OS === 'web') {
          key = await pbkdf2Web(password, saltBytes, 20000, 32, 'SHA-256');
        } else {
          // Use RNSimpleCrypto.PBKDF2.hash for native
          if (RNSimpleCrypto) {
            const keyArray = await RNSimpleCrypto.PBKDF2.hash(
              password,
              saltBytes,
              20000,
              32,
              'SHA256'
            );
            key = new Uint8Array(keyArray);
          } else {
            // Fallback to web implementation if RNSimpleCrypto failed to load
            key = await pbkdf2Web(password, saltBytes, 20000, 32, 'SHA-256');
          }
        }
        
        setDerivedKey(key);
        console.log('[PasswordContext] derivedKey set.');
      } catch (err) {
        console.error('[PasswordContext] PBKDF2 error:', err);
        setDerivedKey(null);
        console.log('[PasswordContext] derivedKey set to null (PBKDF2 error)');
      }
    };
    derive();
  }, [password, salt]);

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
