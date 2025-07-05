'use client'

import { useState, useEffect, useCallback, useRef } from "react";

import { useFileContext } from '@/context/FileContext';
import { usePasswordContext } from '@/context/PasswordContext';
import FolderPicker from "@/components/FolderPicker";
import FileList from "@/components/FileList";

const generateUUID = () =>
  ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );

const saltLength = 16;
const ivLength = 12;
const iterations = 100000;

// Memoized deriveKey with caching
const deriveKey = (() => {
  const cache = new Map();
  return async (password, salt) => {
    const cacheKey = password + Array.from(salt).join(',');
    if (cache.has(cacheKey)) {
      console.log("deriveKey: Returning cached key");
      return cache.get(cacheKey);
    }

    console.log("deriveKey: Deriving new key...");
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    cache.set(cacheKey, key);
    return key;
  };
})();

const encryptData = async (data, password) => {
  const salt = window.crypto.getRandomValues(new Uint8Array(saltLength));
  const iv = window.crypto.getRandomValues(new Uint8Array(ivLength));

  console.log("encryptData: Deriving key...");
  const key = await deriveKey(password, salt);
  console.log("encryptData: Key derived.");

  console.log("encryptData: Starting encryption...");
  const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data.buffer || data);
  console.log("encryptData: Encryption complete.");

  const output = new Uint8Array(saltLength + ivLength + encrypted.byteLength);
  output.set(salt, 0);
  output.set(iv, saltLength);
  output.set(new Uint8Array(encrypted), saltLength + ivLength);

  return output;
};

const decryptData = async (data, password) => {
  const salt = data.slice(0, saltLength);
  const iv = data.slice(saltLength, saltLength + ivLength);
  const encrypted = data.slice(saltLength + ivLength);
  const key = await deriveKey(password, salt);

  return window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted.buffer || encrypted);
};

export default function FileManager() {
  console.log("FileManager: render");

  const { password, setPassword } = usePasswordContext();
  const [uploadFiles, setUploadFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [decryptedFiles, setDecryptedFiles] = useState([]);
  const { handle, fileList, refreshFileList } = useFileContext();

  // Ref to track last decrypted files for stable update check
  const lastDecryptedFilesRef = useRef([]);

  const refreshAndDecryptFileList = useCallback(async () => {
    console.log("refreshAndDecryptFileList: start");

    if (!handle || !password) {
      console.log("refreshAndDecryptFileList: missing handle or password");
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
        const metadataJson = new TextDecoder().decode(decryptedMetadataBuffer);
        const metadata = JSON.parse(metadataJson);
        return { uuid, name: metadata.name, entry };
      } catch (e) {
        console.warn(`Failed to decrypt metadata: ${entry.name}`, e);
        return null;
      }
    }));

    // Filter out nulls, sort by name and uuid for stable ordering
    const filtered = decrypted.filter(Boolean);
    filtered.sort((a, b) => {
      const nameCmp = a.name.localeCompare(b.name);
      if (nameCmp !== 0) return nameCmp;
      return a.uuid.localeCompare(b.uuid);
    });

    // Prevent unnecessary state updates causing re-renders
    const lastFiles = lastDecryptedFilesRef.current;
    const isSame = filtered.length === lastFiles.length &&
      filtered.every((file, idx) =>
        file.uuid === lastFiles[idx].uuid && file.name === lastFiles[idx].name
      );

    if (!isSame) {
      console.log("refreshAndDecryptFileList: setting decryptedFiles", filtered);
      lastDecryptedFilesRef.current = filtered;
      setDecryptedFiles(filtered);
    } else {
      console.log("refreshAndDecryptFileList: decryptedFiles unchanged, skipping setState");
    }
  }, [handle, password, refreshFileList]);

  // useEffect to trigger refresh only when handle or password actually changes
  useEffect(() => {
    console.log("useEffect: handle or password changed");
    refreshAndDecryptFileList();
  }, [handle, password, refreshAndDecryptFileList]);

  const handleEncryptUpload = async () => {
    console.log("handleEncryptUpload: start");

    if (!uploadFiles.length || !password || !handle) {
      setStatus("Provide file(s), password, and grant folder access.");
      console.warn("Missing files, password, or handle.");
      console.log(uploadFiles, password, handle);
      return;
    }

    console.log("Starting encryption for files:", uploadFiles);
    setStatus("Starting encryption...");

    let successCount = 0;
    let failCount = 0;

    for (const uploadFile of uploadFiles) {
      console.log(`Encrypting file: ${uploadFile.name}`);
      setStatus(`Encrypting "${uploadFile.name}"...`);

      try {
        const uuid = generateUUID();
        console.log(`Generated UUID for ${uploadFile.name}: ${uuid}`);

        const fileData = await uploadFile.arrayBuffer();
        console.log(`Read ${fileData.byteLength} bytes from ${uploadFile.name}`);

        const encryptedFile = await encryptData(fileData, password);
        console.log(`Encrypted data for ${uploadFile.name} (size: ${encryptedFile.byteLength})`);

        const metadata = { name: uploadFile.name, type: uploadFile.type, uuid };
        const metadataJson = JSON.stringify(metadata);
        const metadataBuffer = new TextEncoder().encode(metadataJson);
        const encryptedMetadata = await encryptData(metadataBuffer, password);
        console.log(`Encrypted metadata for ${uploadFile.name}`);

        const fileHandle = await handle.getFileHandle(`${uuid}.enc`, { create: true });
        const writableFile = await fileHandle.createWritable();
        await writableFile.write(encryptedFile);
        await writableFile.close();
        console.log(`Saved encrypted file: ${uuid}.enc`);

        const metadataHandle = await handle.getFileHandle(`${uuid}.metadata.enc`, { create: true });
        const writableMetadata = await metadataHandle.createWritable();
        await writableMetadata.write(encryptedMetadata);
        await writableMetadata.close();
        console.log(`Saved metadata file: ${uuid}.metadata.enc`);

        successCount++;
        setStatus(`Successfully encrypted: ${uploadFile.name}`);
      } catch (e) {
        console.error(`Encryption failed for ${uploadFile.name}`, e);
        failCount++;
        setStatus(`Failed to encrypt: ${uploadFile.name}`);
      }
    }

    const result = [];
    if (successCount) result.push(`${successCount} file(s) encrypted`);
    if (failCount) result.push(`${failCount} failed`);
    setStatus(result.length ? result.join(", ") : "No files processed.");

    console.log(`Encryption summary: ${successCount} succeeded, ${failCount} failed.`);

    setUploadFiles([]);
    await refreshAndDecryptFileList();
  };

  const handleDecryptDownload = async (uuid) => {
    console.log(`handleDecryptDownload: ${uuid}`);

    if (!password || !handle) {
      setStatus("Provide password and folder access.");
      return;
    }

    try {
      const fileHandle = await handle.getFileHandle(`${uuid}.enc`);
      const file = await fileHandle.getFile();
      const fileData = new Uint8Array(await file.arrayBuffer());
      const decrypted = await decryptData(fileData, password);

      const metadataHandle = await handle.getFileHandle(`${uuid}.metadata.enc`);
      const metadataFile = await metadataHandle.getFile();
      const metadataData = new Uint8Array(await metadataFile.arrayBuffer());
      const decryptedMetadataBuffer = await decryptData(metadataData, password);
      const metadataJson = new TextDecoder().decode(decryptedMetadataBuffer);
      const metadata = JSON.parse(metadataJson);

      const originalName = metadata.name || `decrypted-${uuid}`;

      const blob = new Blob([decrypted]);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = originalName;
      link.click();

      setStatus(`File decrypted and downloaded as: ${originalName}`);
    } catch (e) {
      setStatus("Decryption failed: Invalid password or missing metadata.");
      console.error(e);
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold">Encrypt File Manager</h2>
      
      <FolderPicker />

      <div className="my-4">
        <input
          type="file"
          multiple
          onChange={e => setUploadFiles(Array.from(e.target.files))}
          className="bg-blue-500 hover:bg-blue-700 text-white py-2 px-4 rounded-full mb-2 cursor-pointer"
        />

        <button
          onClick={handleEncryptUpload}
          className="bg-blue-500 text-white px-4 py-2 rounded ml-2 cursor-pointer"
          disabled={!uploadFiles.length || !password || !handle}
        >
          Encrypt & Upload
        </button>
      </div>

      <div className="text-sm text-gray-600">{status}</div>

      <div className="mt-6">
        <h3 className="font-semibold mb-2">Files</h3>
        <FileList
          fileList={decryptedFiles}
          onFileClick={file => handleDecryptDownload(file.uuid)}
        />
      </div>
    </div>
  );
}
