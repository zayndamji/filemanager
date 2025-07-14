import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { sha256 } from '@noble/hashes/sha256';
import RNSimpleCrypto from 'react-native-simple-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PasswordContextType {
  password: string;
  derivedKey: Uint8Array | null;
  setPassword: (password: string) => void;
}

const PasswordContext = createContext<PasswordContextType | undefined>(undefined);

interface PasswordProviderProps {
  children: ReactNode;
}

const SALT_KEY = 'filemanager_salt';

export function PasswordProvider({ children }: PasswordProviderProps) {
  const [password, setPassword] = useState<string>('');
  const [derivedKey, setDerivedKey] = useState<Uint8Array | null>(null);
  const [salt, setSalt] = useState<Uint8Array | null>(null);

  useEffect(() => {
    if (!password) {
      setDerivedKey(null);
      return;
    }
    // Load or generate salt (not tied to password)
    const derive = async () => {
      let loadedSalt: Uint8Array | null = null;
      try {
        const saltHex = await AsyncStorage.getItem(SALT_KEY);
        if (saltHex) {
          loadedSalt = Uint8Array.from(Buffer.from(saltHex, 'hex'));
        } else {
          // Generate random salt
          const randomSalt = await RNSimpleCrypto.utils.randomBytes(16);
          loadedSalt = new Uint8Array(randomSalt);
          await AsyncStorage.setItem(SALT_KEY, Buffer.from(loadedSalt).toString('hex'));
        }
        setSalt(loadedSalt);
      } catch (err) {
        console.error('[PasswordContext] Salt error:', err);
        loadedSalt = new Uint8Array(16); // fallback to zeroed salt
        setSalt(loadedSalt);
      }
      // Derive key once per password using native PBKDF2
      const encoder = new TextEncoder();
      const passwordBytes = encoder.encode(password);
      console.log('[PasswordContext] Deriving key for password: [REDACTED], length:', passwordBytes.length);
      try {
        const keyArray = await RNSimpleCrypto.PBKDF2.hash(
          password,
          loadedSalt,
          20000,
          32,
          'SHA256'
        );
        // keyArray is ArrayBuffer, convert to Uint8Array
        const key = new Uint8Array(keyArray);
        console.log('[PasswordContext] Derived key:', key && key.length);
        setDerivedKey(key);
      } catch (err) {
        console.error('[PasswordContext] PBKDF2 error:', err);
        setDerivedKey(null);
      }
    };
    derive();
  }, [password]);

  return (
    <PasswordContext.Provider value={{ password, derivedKey, setPassword }}>
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
