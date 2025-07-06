'use client'

import { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { usePasswordContext } from './PasswordContext';

const FileContext = createContext();

export function FileProvider({ children }) {
  const { password } = usePasswordContext();

  const [fileList, setFileList] = useState([]);
  const [handle, setHandle] = useState(null);

  useEffect(() => {
    if (!handle) return;

    const refreshFileList = async () => {
      console.log('Refreshing file list...');
      
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

    refreshFileList();
  }, [handle, password]);

  // memoize context value
  const contextValue = useMemo(() => ({
    fileList,
    setFileList,
    handle,
    setHandle
  }), [fileList, setFileList, handle, setHandle]);

  return (
    <FileContext.Provider value={contextValue}>
      {children}
    </FileContext.Provider>
  );
}

export function useFileContext() {
  return useContext(FileContext);
}