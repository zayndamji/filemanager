'use client'

import { useState } from 'react';

import { generateUUID, encryptData } from '@/utils/crypto';

export default function EncryptUploader({ handle, password, setStatus, refreshAndDecryptFileList }) {
  const [uploadFiles, setUploadFiles] = useState([]);

  const handleEncryptUpload = async () => {
    if (!uploadFiles.length || !password || !handle) {
      setStatus("Provide file(s), password, and grant folder access.");
      return;
    }

    setStatus("Starting encryption...");
    let successCount = 0;
    let failCount = 0;

    for (const uploadFile of uploadFiles) {
      try {
        const uuid = generateUUID();
        const fileData = await uploadFile.arrayBuffer();
        const encryptedFile = await encryptData(fileData, password);

        const metadata = { name: uploadFile.name, type: uploadFile.type, uuid };
        const metadataJson = JSON.stringify(metadata);
        const metadataBuffer = new TextEncoder().encode(metadataJson);
        const encryptedMetadata = await encryptData(metadataBuffer, password);

        const fileHandle = await handle.getFileHandle(`${uuid}.enc`, { create: true });
        const writableFile = await fileHandle.createWritable();
        await writableFile.write(encryptedFile);
        await writableFile.close();

        const metadataHandle = await handle.getFileHandle(`${uuid}.metadata.enc`, { create: true });
        const writableMetadata = await metadataHandle.createWritable();
        await writableMetadata.write(encryptedMetadata);
        await writableMetadata.close();

        successCount++;
      } catch (e) {
        failCount++;
        console.error(e);
      }
    }

    const result = [];
    if (successCount) result.push(`${successCount} file(s) encrypted`);
    if (failCount) result.push(`${failCount} failed`);
    setStatus(result.length ? result.join(", ") : "No files processed.");

    setUploadFiles([]);
    await refreshAndDecryptFileList();
  };

  return (
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
  );
}