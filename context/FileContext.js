'use client'

import { createContext, useContext, useState, useCallback } from 'react';

const FileContext = createContext();

export function FileProvider({ children }) {
  const [fileList, setFileList] = useState([]);
  const [handle, setHandle] = useState(null);

  const refreshFileList = useCallback(async () => {
    if (!handle) return;
    const files = [];

    async function scanDirectory(directoryHandle, path = '') {
      for await (const entry of directoryHandle.values()) {
        const entryPath = `${path}${entry.name}`;
        if (entry.kind === 'file') {
          // Add the file handle along with its full relative path
          files.push({ handle: entry, path: entryPath });
        } else if (entry.kind === 'directory') {
          await scanDirectory(entry, `${entryPath}/`);
        }
      }
    }

    await scanDirectory(handle);
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