import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { sha256 } from '@noble/hashes/sha256';
import RNSimpleCrypto from 'react-native-simple-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
      } catch (err) {
        console.error('[PasswordContext] Could not load salt:', err);
      }
    };
    loadSalt();
  }, []);

  // Persist salt when changed
  React.useEffect(() => {
    if (salt) {
      AsyncStorage.setItem(SALT_KEY, salt).catch(err => {
        console.error('[PasswordContext] Could not save salt:', err);
      });
    }
  }, [salt]);

  // Derive key when password or salt changes
  React.useEffect(() => {
    if (!password || !salt) {
      setDerivedKey(null);
      return;
    }
    const derive = async () => {
      try {
        const encoder = new TextEncoder();
        const saltBytes = encoder.encode(salt);
        const keyArray = await RNSimpleCrypto.PBKDF2.hash(
          password,
          saltBytes,
          20000,
          32,
          'SHA256'
        );
        const key = new Uint8Array(keyArray);
        setDerivedKey(key);
      } catch (err) {
        console.error('[PasswordContext] PBKDF2 error:', err);
        setDerivedKey(null);
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
