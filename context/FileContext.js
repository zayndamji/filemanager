'use client'

import { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { usePasswordContext } from './PasswordContext';

const FileContext = createContext();

export function FileProvider({ children }) {
  const { password } = usePasswordContext();

  const [fileList, setFileList] = useState([]);
  const [handle, setHandle] = useState(null);

  const refreshFileList = async () => {
    console.log('Refreshing file list...');

    if (!handle) return;
    
    const files = [];
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        files.push(entry);
      }
    }

    if (files.length !== fileList.length) {
      setFileList(files);
    }
  };

  useEffect(() => {
    refreshFileList();
  }, [handle, password]);

  // memoize context value
  const contextValue = useMemo(() => ({
    fileList,
    setFileList,
    handle,
    setHandle,
    refreshFileList
  }), [fileList, setFileList, handle, setHandle, refreshFileList]);

  return (
    <FileContext.Provider value={contextValue}>
      {children}
    </FileContext.Provider>
  );
}

export function useFileContext() {
  return useContext(FileContext);
}