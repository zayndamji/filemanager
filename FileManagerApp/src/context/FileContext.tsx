import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react';
import { usePasswordContext } from './PasswordContext';
import { FileManagerService, EncryptedFile } from '../utils/FileManagerService';

interface FileContextType {
  encryptedFiles: EncryptedFile[];
  setEncryptedFiles: (files: EncryptedFile[]) => void;
  refreshFileList: () => Promise<void>;
  currentFolderPath: string[];
  setCurrentFolderPath: (path: string[]) => void;
  filesInCurrentFolder: EncryptedFile[];
  subfolders: string[];
  loading: boolean;
}

const FileContext = createContext<FileContextType | undefined>(undefined);

interface FileProviderProps {
  children: ReactNode;
}

export function FileProvider({ children }: FileProviderProps) {
  const { derivedKey } = usePasswordContext();
  const [encryptedFiles, setEncryptedFiles] = useState<EncryptedFile[]>([]);
  const [currentFolderPath, setCurrentFolderPath] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshFileList = async () => {
    if (!derivedKey) {
      setEncryptedFiles([]);
      return;
    }

    console.log('[FileContext] Refreshing encrypted file list...');
    setLoading(true);
    try {
      const files = await FileManagerService.listEncryptedFiles(derivedKey);
      setEncryptedFiles(files);
    } catch (error) {
      console.error('Error refreshing file list:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshFileList();
  }, [derivedKey]);

  // Filter files in current folder
  const filesInCurrentFolder = useMemo(() => {
    return FileManagerService.filterFilesByPath(encryptedFiles, currentFolderPath);
  }, [encryptedFiles, currentFolderPath]);

  // Get subfolders
  const subfolders = useMemo(() => {
    return FileManagerService.getSubfolders(encryptedFiles, currentFolderPath);
  }, [encryptedFiles, currentFolderPath]);

  const contextValue = useMemo(() => ({
    encryptedFiles,
    setEncryptedFiles,
    refreshFileList,
    currentFolderPath,
    setCurrentFolderPath,
    filesInCurrentFolder,
    subfolders,
    loading
  }), [
    encryptedFiles,
    currentFolderPath,
    filesInCurrentFolder,
    subfolders,
    loading
  ]);

  return (
    <FileContext.Provider value={contextValue}>
      {children}
    </FileContext.Provider>
  );
}

export function useFileContext(): FileContextType {
  const context = useContext(FileContext);
  if (!context) {
    throw new Error('useFileContext must be used within a FileProvider');
  }
  return context;
}
