'use client'

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { useFileContext } from '@/context/FileContext';
import { usePasswordContext } from '@/context/PasswordContext';
import FileViewer from "@/components/FileViewer";

const saltLength = 16;
const ivLength = 12;
const iterations = 100000;

const deriveKey = async (password, salt) => {
  const encoder = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
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
};

const decryptData = async (data, password) => {
  const salt = data.slice(0, saltLength);
  const iv = data.slice(saltLength, saltLength + ivLength);
  const encrypted = data.slice(saltLength + ivLength);
  const key = await deriveKey(password, salt);

  return window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
};

export default function FilePage() {
  const searchParams = useSearchParams();
  const uuid = searchParams.get("uuid");
  const { handle } = useFileContext();
  const { password, setPassword } = usePasswordContext();

  const [fileBlob, setFileBlob] = useState(null);
  const [fileMeta, setFileMeta] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setFileBlob(null);
    setFileMeta(null);
    setStatus("");
    if (!uuid || !handle || !password) return;

    (async () => {
      try {
        setStatus("Decrypting...");
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

        setFileBlob(new Blob([decrypted]));
        setFileMeta(metadata);
        setStatus("File decrypted.");
      } catch (e) {
        setStatus("Failed to decrypt file. Wrong password or missing file.");
        setFileBlob(null);
        setFileMeta(null);
      }
    })();
  }, [uuid, handle, password]);

  const handleDownload = () => {
    if (!fileBlob || !fileMeta) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(fileBlob);
    link.download = fileMeta.name || "file";
    link.click();
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <Link href="/" className="text-blue-500 hover:underline">&larr; Back to Home</Link>
      <h2 className="text-2xl font-bold">File Viewer</h2>
      <div className="text-sm text-gray-600">{(!fileBlob || !fileMeta) && status}</div>
      {fileBlob && fileMeta && (
        <div>
          <FileViewer file={new File([fileBlob], fileMeta.name, { type: fileMeta.type })} />

          <button
            onClick={handleDownload}
            className="bg-green-500 text-white px-4 py-2 rounded mt-2"
          >
            Download
          </button>
        </div>
      )}
    </div>
  );
}