'use client'

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { useFileContext } from '@/context/FileContext';
import { usePasswordContext } from '@/context/PasswordContext';

import FolderPicker from "@/components/FolderPicker";
import FileList from "@/components/FileManager/FileList";

import { decryptData } from '@/utils/crypto';

export default function FileManagerHome() {
  const { password } = usePasswordContext();
  const { handle, refreshFileList } = useFileContext();

  const [decryptedFiles, setDecryptedFiles] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);

  const lastDecryptedFilesRef = useRef([]);
  const searchParams = useSearchParams();

  // Sync currentPath from URL
  useEffect(() => {
    const rawPath = searchParams.get("path") || "/";
    const parsedPath = rawPath
      .split('/')
      .map(segment => segment.trim())
      .filter(Boolean);
    setCurrentPath(parsedPath);
  }, [searchParams]);

  const refreshAndDecryptFileList = useCallback(async () => {
    if (!handle || !password) {
      setDecryptedFiles([]);
      return;
    }

    await refreshFileList();
    const metadataEntries = [];

    for await (const entry of handle.values()) {
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
  }, [handle, password, refreshFileList]);

  useEffect(() => {
    refreshAndDecryptFileList();
  }, [handle, password, refreshAndDecryptFileList]);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold">Encrypt File Manager</h2>

      <div>
        <Link href="/upload" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-full cursor-pointer">Upload Files</Link>
      </div>

      <FolderPicker />

      <FileList
        fileList={decryptedFiles}
        currentPath={currentPath}
        setCurrentPath={setCurrentPath}
      />
    </div>
  );
}