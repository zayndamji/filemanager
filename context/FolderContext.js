'use client'

import { createContext, useContext } from 'react';
import { useState } from 'react';

const FolderContext = createContext();

export function FolderProvider({ children }) {
  const [fileList, setFileList] = useState([]);
  const [folderHandle, setFolderHandle] = useState(null);

  return (
    <FolderContext.Provider value={{ fileList, setFileList, folderHandle, setFolderHandle }}>
      {children}
    </FolderContext.Provider>
  );
}

export function useFolderContext() {
  return useContext(FolderContext);;
};