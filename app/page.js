'use client'

import { useEffect, useRef, useCallback, useState } from 'react';

import { useFileContext } from '@/context/FileContext';
import { usePasswordContext } from '@/context/PasswordContext';

import FolderPicker from "@/components/FolderPicker";
import EncryptUploader from "@/components/FileManager/EncryptUploader";
import FileList from "@/components/FileManager/FileList";

import { decryptData } from '@/utils/crypto';

export default function FileManager() {
  const { password } = usePasswordContext();
  const { handle, refreshFileList } = useFileContext();
  const [status, setStatus] = useState("");
  const [decryptedFiles, setDecryptedFiles] = useState([]);
  const lastDecryptedFilesRef = useRef([]);

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
        return { uuid, name: metadata.name, entry };
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

      <FolderPicker />

      <EncryptUploader
        handle={handle}
        password={password}
        setStatus={setStatus}
        refreshAndDecryptFileList={refreshAndDecryptFileList}
      />
      
      <div className="text-sm text-gray-600">{status}</div>

      <FileList fileList={decryptedFiles} />
    </div>
  );
}
