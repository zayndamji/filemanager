'use client'

import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const FileContext = createContext();

export function FileProvider({ children }) {
  const [fileList, setFileList] = useState([]);
  const [handle, setHandle] = useState(null);

  const refreshFileList = useCallback(async () => {
    if (!handle) return;
    
    const files = [];
    for await (const entry of handle.values()) {
      if (entry.kind === 'file') {
        console.log('file');
        files.push(entry);
      }
    }

    // only update if changed
    if (
      files.length !== fileList.length
    ) {
      setFileList(files);
    }
  }, [handle, fileList]);

  // memoize context value
  const contextValue = useMemo(() => ({
    fileList,
    setFileList,
    handle,
    setHandle,
    refreshFileList,
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