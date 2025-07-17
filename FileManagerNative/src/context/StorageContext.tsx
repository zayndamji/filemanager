import React, { createContext, useContext, useState, ReactNode } from 'react';

interface StorageContextType {
  webDirectoryHandle: any;
  setWebDirectoryHandle: (handle: any) => void;
}

const StorageContext = createContext<StorageContextType | undefined>(undefined);

export function StorageProvider({ children }: { children: ReactNode }) {
  const [webDirectoryHandle, setWebDirectoryHandle] = useState<any>(null);
  return (
    <StorageContext.Provider value={{ webDirectoryHandle, setWebDirectoryHandle }}>
      {children}
    </StorageContext.Provider>
  );
}

export function useStorageContext(): StorageContextType {
  const context = useContext(StorageContext);
  if (!context) {
    throw new Error('useStorageContext must be used within a StorageProvider');
  }
  return context;
}
