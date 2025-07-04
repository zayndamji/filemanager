'use client'

import { createContext, useContext, useState, useCallback } from 'react';

const FileContext = createContext();

export function FileProvider({ children }) {
  const [fileList, setFileList] = useState([]);
  const [handle, setHandle] = useState(null);

  // Add this function to scan the folder
  const refreshFileList = useCallback(async () => {
    if (!handle) return;
    const files = [];
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        files.push(entry);
      }
    }
    setFileList(files);
  }, [handle]);

  return (
    <FileContext.Provider value={{ fileList, setFileList, handle, setHandle, refreshFileList }}>
      {children}
    </FileContext.Provider>
  );
}

export function useFileContext() {
  return useContext(FileContext);
}