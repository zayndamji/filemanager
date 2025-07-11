import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { sha256 } from '@noble/hashes/sha256';
const crypto = require('crypto');

interface PasswordContextType {
  password: string;
  derivedKey: Uint8Array | null;
  setPassword: (password: string) => void;
}

const PasswordContext = createContext<PasswordContextType | undefined>(undefined);

interface PasswordProviderProps {
  children: ReactNode;
}

const salt = new Uint8Array(16); // you may want to persist/generate per user/session

export function PasswordProvider({ children }: PasswordProviderProps) {
  const [password, setPassword] = useState<string>('');
  const [derivedKey, setDerivedKey] = useState<Uint8Array | null>(null);

  useEffect(() => {
    if (!password) {
      setDerivedKey(null);
      return;
    }
    // Derive key once per password
    const encoder = new TextEncoder();
    const passwordBytes = encoder.encode(password);
    console.log('[PasswordContext] Deriving key for password: [REDACTED], length:', passwordBytes.length);
    crypto.pbkdf2(
      Buffer.from(passwordBytes),
      Buffer.from(salt),
      100000,
      32,
      'sha256',
      (err: Error | null, key: Buffer) => {
        if (err) {
          console.error('[PasswordContext] PBKDF2 error:', err);
          setDerivedKey(null);
        } else {
          console.log('[PasswordContext] Derived key:', key && key.length);
          setDerivedKey(new Uint8Array(key));
        }
      }
    );
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
