'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';

import { useFileContext } from '@/context/FileContext';
import { usePasswordContext } from '@/context/PasswordContext';
import { decryptData } from '@/utils/crypto';

export default function FileList() {
  const { fileList, refreshFileList } = useFileContext();
  const { password } = usePasswordContext();
  const searchParams = useSearchParams();

  const [decryptedFiles, setDecryptedFiles] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);
  const lastDecryptedFilesRef = useRef([]);

  // Sync currentPath from URL
  useEffect(() => {
    const rawPath = searchParams.get("path") || "/";
    const parsedPath = rawPath
      .split('/')
      .map(segment => segment.trim())
      .filter(Boolean);
    setCurrentPath(parsedPath);
  }, [searchParams]);

  const navigateToSubfolder = (folderName) => {
    const newPath = [...currentPath, folderName];
    setCurrentPath(newPath);
  };

  const navigateUp = () => {
    const newPath = currentPath.slice(0, -1);
    setCurrentPath(newPath);
  };

  const refreshAndDecryptFileList = useCallback(async () => {
    if (!password) {
      setDecryptedFiles([]);
      return;
    }

    await refreshFileList();
    const metadataEntries = [];

    for await (const entry of fileList) {
      if (entry.kind === "file" && entry.name.endsWith(".metadata.enc")) {
        metadataEntries.push(entry);
      }
    }

    const decrypted = await Promise.all(metadataEntries.map(async (entry) => {
      const uuid = entry.name.replace(".metadata.enc", "");
      try {
        const metadataFile = await entry.getFile();
        const metadataData = new Uint8Array(await metadataFile.arrayBuffer());
        const decryptedMetadataBuffer = await decryptData(metadataData, password);
        const metadata = JSON.parse(new TextDecoder().decode(decryptedMetadataBuffer));
        return {
          uuid,
          name: metadata.name,
          type: metadata.type,
          folderPath: metadata.folderPath,
          tags: metadata.tags || [],
          entry
        };
      } catch {
        return null;
      }
    }));

    const filtered = decrypted.filter(Boolean);
    filtered.sort((a, b) => a.name.localeCompare(b.name) || a.uuid.localeCompare(b.uuid));

    const lastFiles = lastDecryptedFilesRef.current;
    const isSame = filtered.length === lastFiles.length &&
      filtered.every((f, i) => f.uuid === lastFiles[i].uuid && f.name === lastFiles[i].name);

    if (!isSame) {
      lastDecryptedFilesRef.current = filtered;
      setDecryptedFiles(filtered);
    }
  }, [fileList, password, refreshFileList]);

  useEffect(() => {
    refreshAndDecryptFileList();
  }, [fileList, password, refreshAndDecryptFileList]);

  // Filter files in current folder
  const filesInCurrentFolder = decryptedFiles.filter(file => {
    return file.folderPath.join('/') === currentPath.join('/');
  });

  // Discover subfolders
  const subfolders = new Set();
  for (const file of decryptedFiles) {
    const path = file.folderPath;
    if (path.length > currentPath.length) {
      const isInCurrent = currentPath.every((p, i) => p === path[i]);
      if (isInCurrent) {
        subfolders.add(path[currentPath.length]);
      }
    }
  }

  return (
    <div className="mt-6 space-y-2">
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-600">Current path:</span>
        <span className="text-sm font-mono text-blue-700">/{currentPath.join('/')}</span>
        {currentPath.length > 0 && (
          <button onClick={navigateUp} className="text-blue-500 underline text-sm ml-2 cursor-pointer">Up</button>
        )}
      </div>

      {subfolders.size === 0 && filesInCurrentFolder.length === 0 && (
        <p className="text-sm text-gray-500">No files or folders found.</p>
      )}

      <ul className="space-y-1">
        {[...subfolders].sort().map(folder => (
          <li key={folder}>
            📁&nbsp;
            <button
              onClick={() => navigateToSubfolder(folder)}
              className="text-green-600 hover:text-green-800 font-medium cursor-pointer"
            >
              {folder}
            </button>
          </li>
        ))}

        {filesInCurrentFolder.map(file => (
          <li key={file.uuid}>
            📄&nbsp; 
            <Link
              href={`/file?uuid=${file.uuid}`}
              className="text-blue-500 underline hover:text-blue-700 cursor-pointer"
            >
              {file.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}