'use client'

import { createContext, useContext } from 'react';
import { useState } from 'react';

const FileContext = createContext();

export function FileProvider({ children }) {
  const [fileList, setFileList] = useState([]);
  const [handle, setHandle] = useState(null);

  return (
    <FileContext.Provider value={{ fileList, setFileList, handle, setHandle }}>
      {children}
    </FileContext.Provider>
  );
}

export function useFileContext() {
  return useContext(FileContext);
};