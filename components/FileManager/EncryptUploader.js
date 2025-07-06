'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { generateUUID, encryptData } from '@/utils/crypto';

import { useFileContext } from '@/context/FileContext';
import { usePasswordContext } from '@/context/PasswordContext';

export default function EncryptUploader({ setStatus }) {
  const { password } = usePasswordContext();
  const { handle, refreshFileList } = useFileContext();

  const [uploadFiles, setUploadFiles] = useState([]);
  const [folderPath, setFolderPath] = useState([]);
  const [tagsInput, setTagsInput] = useState('');
  const [customFileName, setCustomFileName] = useState('');
  const [extension, setExtension] = useState('');

  const router = useRouter();

  useEffect(() => {
    if (uploadFiles.length > 0) {
      const firstFile = uploadFiles[0];
      const nameParts = firstFile.name.split('.');
      if (nameParts.length > 1) {
        setExtension(nameParts.pop());
      } else {
        setExtension('');
      }
    } else {
      setExtension('');
    }
  }, [uploadFiles]);

  const handleEncryptUpload = async () => {
    if (!uploadFiles.length || !password || !handle) {
      setStatus("Provide file(s), password, and grant folder access.");
      return;
    }

    setStatus("Starting encryption...");
    let successCount = 0;
    let failCount = 0;

    const tags = tagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0);

    for (const uploadFile of uploadFiles) {
      try {
        const uuid = generateUUID();
        const fileData = await uploadFile.arrayBuffer();
        const encryptedFile = await encryptData(fileData, password);

        let finalName = uploadFile.name;
        if (customFileName.trim()) {
          const base = customFileName.trim();
          finalName = base + (extension ? `.${extension}` : '');
        }

        if (uploadFile.type.startsWith("image/")) {
          try {
            const imageBitmap = await createImageBitmap(uploadFile);
            const canvas = new OffscreenCanvas(400, 400);
            const ctx = canvas.getContext('2d');

            const size = Math.min(imageBitmap.width, imageBitmap.height);
            const sx = (imageBitmap.width - size) / 2;
            const sy = (imageBitmap.height - size) / 2;

            ctx.drawImage(imageBitmap, sx, sy, size, size, 0, 0, 400, 400);
            const blob = await canvas.convertToBlob({ type: 'image/jpeg' });
            const previewBuffer = await blob.arrayBuffer();
            const encryptedPreview = await encryptData(previewBuffer, password);

            const previewHandle = await handle.getFileHandle(`${uuid}.preview.enc`, { create: true });
            const writablePreview = await previewHandle.createWritable();
            await writablePreview.write(encryptedPreview);
            await writablePreview.close();

            const previewMetadata = {
              name: `preview-${finalName}`,
              type: 'image/jpeg',
              uuid,
              folderPath,
              tags,
              isPreview: true
            };

            const previewMetadataJson = JSON.stringify(previewMetadata);
            const previewMetadataBuffer = new TextEncoder().encode(previewMetadataJson);
            const encryptedPreviewMetadata = await encryptData(previewMetadataBuffer, password);

            const previewMetaHandle = await handle.getFileHandle(`${uuid}.metadata.preview.enc`, { create: true });
            const writablePreviewMeta = await previewMetaHandle.createWritable();
            await writablePreviewMeta.write(encryptedPreviewMetadata);
            await writablePreviewMeta.close();
          } catch (previewErr) {
            console.warn("Preview generation failed:", previewErr);
          }
        }

        const metadata = {
          name: finalName,
          type: uploadFile.type,
          uuid,
          folderPath,
          tags
        };

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
    setFolderPath([]);
    setTagsInput('');
    setCustomFileName('');
    setExtension('');

    refreshFileList();
    router.push('/');
  };

  return (
    <div className="my-4 space-y-3">
      <input
        type="file"
        multiple
        onChange={e => setUploadFiles(Array.from(e.target.files))}
        className="bg-blue-500 hover:bg-blue-700 text-white py-2 px-4 rounded-full cursor-pointer"
      />

      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="File name (default: original name)"
          value={customFileName}
          onChange={e => setCustomFileName(e.target.value)}
          className="flex-grow px-3 py-2 border rounded-md"
        />
        <span className="text-gray-600">.</span>
        <input
          type="text"
          value={extension}
          onChange={e => setExtension(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
          placeholder="ext"
          className="w-[10ch] px-3 py-2 border rounded-md text-center"
        />
      </div>

      <input
        type="text"
        placeholder="Folder path (e.g., /images/subfolder) (default: /)"
        onChange={e => {
          const raw = e.target.value.trim();
          const parts = raw
            .split('/')
            .map(p => p.trim())
            .filter(p => p.length > 0);
          setFolderPath(parts);
        }}
        className="w-full px-3 py-2 border rounded-md"
      />

      <input
        type="text"
        placeholder="Tags (separated by commas, e.g., tag1,tag2,tag3)"
        value={tagsInput}
        onChange={e => setTagsInput(e.target.value)}
        className="w-full px-3 py-2 border rounded-md"
      />

      <button
        onClick={handleEncryptUpload}
        className="bg-blue-500 text-white px-4 py-2 rounded cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed"
        disabled={!uploadFiles.length || !password || !handle}
      >
        Encrypt & Upload
      </button>
    </div>
  );
}