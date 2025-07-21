import React, { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePasswordContext } from './PasswordContext';
import { FileManagerService, EncryptedFile } from '../utils/FileManagerService';

export type SortOption = 'name' | 'lastModified' | 'uuid' | 'size';

interface FileContextType {
  encryptedFiles: EncryptedFile[];
  setEncryptedFiles: (files: EncryptedFile[]) => void;
  refreshFileList: () => Promise<void>;
  currentFolderPath: string[];
  setCurrentFolderPath: (path: string[]) => void;
  filesInCurrentFolder: EncryptedFile[];
  subfolders: string[];
  loading: boolean;
  sortBy: SortOption;
  setSortBy: (sortBy: SortOption) => void;
}

const FileContext = createContext<FileContextType | undefined>(undefined);

interface FileProviderProps {
  children: ReactNode;
}

const SORT_BY_STORAGE_KEY = '@FileManager:sortBy';

export function FileProvider({ children }: FileProviderProps) {
  const { derivedKey } = usePasswordContext();
  const [encryptedFiles, setEncryptedFiles] = useState<EncryptedFile[]>([]);
  const [currentFolderPath, setCurrentFolderPath] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortByState] = useState<SortOption>('name');

  // Load sort preference from storage
  useEffect(() => {
    const loadSortPreference = async () => {
      try {
        const savedSortBy = await AsyncStorage.getItem(SORT_BY_STORAGE_KEY);
        if (savedSortBy && ['name', 'lastModified', 'uuid'].includes(savedSortBy)) {
          setSortByState(savedSortBy as SortOption);
        }
      } catch (error) {
        console.error('Failed to load sort preference:', error);
      }
    };
    loadSortPreference();
  }, []);

  // Save sort preference to storage
  const setSortBy = async (newSortBy: SortOption) => {
    try {
      setSortByState(newSortBy);
      await AsyncStorage.setItem(SORT_BY_STORAGE_KEY, newSortBy);
    } catch (error) {
      console.error('Failed to save sort preference:', error);
    }
  };

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

  // Sort files function
  const sortFiles = (files: EncryptedFile[], sortOption: SortOption): EncryptedFile[] => {
    const sortedFiles = [...files];
    
    switch (sortOption) {
      case 'name':
        return sortedFiles.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
      case 'lastModified':
        return sortedFiles.sort((a, b) => {
          const aDate = new Date(a.metadata.encryptedAt);
          const bDate = new Date(b.metadata.encryptedAt);
          return bDate.getTime() - aDate.getTime(); // Most recent first
        });
      case 'uuid':
        return sortedFiles.sort((a, b) => a.uuid.localeCompare(b.uuid));
      case 'size':
        return sortedFiles.sort((a, b) => b.metadata.size - a.metadata.size); // Largest first
      default:
        return sortedFiles;
    }
  };

  // Filter and sort files in current folder
  const filesInCurrentFolder = useMemo(() => {
    const filteredFiles = FileManagerService.filterFilesByPath(encryptedFiles, currentFolderPath);
    return sortFiles(filteredFiles, sortBy);
  }, [encryptedFiles, currentFolderPath, sortBy]);

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
    loading,
    sortBy,
    setSortBy
  }), [
    encryptedFiles,
    currentFolderPath,
    filesInCurrentFolder,
    subfolders,
    loading,
    sortBy
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
