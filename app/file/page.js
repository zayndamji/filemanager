'use client'

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { useFileContext } from '@/context/FileContext';
import { usePasswordContext } from '@/context/PasswordContext';

import FileViewer from "@/components/FileViewer";
import DownloadButton from "@/components/DownloadButton";

import { decryptData } from '@/utils/crypto';

export default function FilePage() {
  const searchParams = useSearchParams();
  const uuid = searchParams.get("uuid");
  const { handle } = useFileContext();
  const { password } = usePasswordContext();

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

        // Decrypt file
        const fileHandle = await handle.getFileHandle(`${uuid}.enc`);
        const file = await fileHandle.getFile();
        const fileData = new Uint8Array(await file.arrayBuffer());
        const decrypted = await decryptData(fileData, password);

        // Decrypt metadata
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
        console.error(e);
        setFileBlob(null);
        setFileMeta(null);
      }
    })();
  }, [uuid, handle, password]);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <Link href="/" className="text-blue-500 hover:underline">&larr; Back to Home</Link>
      <h2 className="text-2xl font-bold">File Viewer</h2>
      <div className="text-sm text-gray-600">{(!fileBlob || !fileMeta) && status}</div>

      {fileBlob && fileMeta && (
        <div>
          <FileViewer file={new File([fileBlob], fileMeta.name, { type: fileMeta.type })} />
          <DownloadButton fileBlob={fileBlob} fileMeta={fileMeta} />
        </div>
      )}
    </div>
  );
}