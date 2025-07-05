'use client'

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { useFileContext } from '@/context/FileContext';
import { usePasswordContext } from '@/context/PasswordContext';

import FileViewer from "@/components/FileViewer";
import DownloadButton from "@/components/DownloadButton";

import { decryptData } from '@/utils/crypto';

export default function FilePageClient() {
  const searchParams = useSearchParams();
  const uuid = searchParams.get("uuid");
  const { handle } = useFileContext();
  const { password } = usePasswordContext();

  const [fileBlob, setFileBlob] = useState(null);
  const [fileMeta, setFileMeta] = useState(null);
  const [filePreviewBlob, setFilePreviewBlob] = useState(null);
  const [filePreviewMeta, setFilePreviewMeta] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setFileBlob(null);
    setFileMeta(null);
    setFilePreviewBlob(null);
    setFilePreviewMeta(null);
    setStatus("");

    if (!uuid || !handle || !password) return;

    (async () => {
      try {
        setStatus("Decrypting...");

        // Main file
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

        // Preview file (if available)
        try {
          const previewHandle = await handle.getFileHandle(`${uuid}.preview.enc`);
          const previewFile = await previewHandle.getFile();
          const previewData = new Uint8Array(await previewFile.arrayBuffer());
          const decryptedPreview = await decryptData(previewData, password);
          setFilePreviewBlob(new Blob([decryptedPreview]));
        } catch (err) {
          console.warn("No preview file found or failed to decrypt preview:", err);
        }

        try {
          const previewMetaHandle = await handle.getFileHandle(`${uuid}.metadata.preview.enc`);
          const previewMetaFile = await previewMetaHandle.getFile();
          const previewMetaData = new Uint8Array(await previewMetaFile.arrayBuffer());
          const decryptedPreviewMetaBuffer = await decryptData(previewMetaData, password);
          const previewMetaJson = new TextDecoder().decode(decryptedPreviewMetaBuffer);
          setFilePreviewMeta(JSON.parse(previewMetaJson));
        } catch (err) {
          console.warn("No preview metadata found or failed to decrypt:", err);
        }

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
      <div className="space-y-1">
        {fileMeta ? (
          <Link
            href={`/?path=${encodeURIComponent(fileMeta.folderPath.join('/'))}`}
            className="text-blue-500 hover:underline block"
          >
            &larr; Go Back to /{fileMeta.folderPath.join('/')}
          </Link>
        ) : (
          <Link href="/" className="text-blue-500 hover:underline block">&larr; Go Back Home</Link>
        )}
      </div>

      <h2 className="text-2xl font-bold">
        {fileMeta ? fileMeta.name : "Loading..."}
      </h2>

      <div className="text-sm text-gray-600">{(!fileBlob || !fileMeta) && status}</div>

      {fileBlob && fileMeta && (
        <div className="space-y-6">
          <FileViewer fileBlob={fileBlob} fileMeta={fileMeta} />
          <DownloadButton fileBlob={fileBlob} fileMeta={fileMeta} downloadSymbol={"Download"} />

          {filePreviewBlob && filePreviewMeta && (
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-2">Preview</h3>
              <FileViewer
                fileBlob={filePreviewBlob}
                fileMeta={filePreviewMeta}
                showDetails={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}