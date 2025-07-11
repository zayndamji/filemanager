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
  const [customFileName, setCustomFileName] = useState('');
  const [extension, setExtension] = useState('');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');

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

  const addTag = (tag) => {
    const cleaned = tag.trim();
    if (cleaned.length && !tags.includes(cleaned)) {
      setTags(prev => [...prev, cleaned]);
    }
  };

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(tagInput);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleEncryptUpload = async () => {
    if (!uploadFiles.length || !password || !handle) {
      setStatus("Provide file(s), password, and grant folder access.");
      return;
    }

    setStatus("Starting encryption...");
    let successCount = 0;
    let failCount = 0;

    const tagsToUse = [...tags];

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
            const originalWidth = imageBitmap.width;
            const originalHeight = imageBitmap.height;

            const previewWidth = 400;
            const previewHeight = Math.round((originalHeight / originalWidth) * previewWidth);

            const canvas = new OffscreenCanvas(previewWidth, previewHeight);
            const ctx = canvas.getContext('2d');

            // Draw the entire image scaled to the new size
            ctx.drawImage(imageBitmap, 0, 0, originalWidth, originalHeight, 0, 0, previewWidth, previewHeight);

            const blob = await canvas.convertToBlob({ type: 'image/jpeg' });
            const previewBuffer = await blob.arrayBuffer();
            const encryptedPreview = await encryptData(previewBuffer, password);

            const previewFilename = `${uuid}.preview.enc`;
            const previewHandle = await handle.getFileHandle(previewFilename, { create: true });
            const writablePreview = await previewHandle.createWritable();
            await writablePreview.write(encryptedPreview);
            await writablePreview.close();

            const previewMetadata = {
              name: `preview-${finalName}`,
              type: 'image/jpeg',
              uuid,
              folderPath,
              tags: tagsToUse,
              isPreview: true,
              dimensions: { width: previewWidth, height: previewHeight }
            };

            const previewMetadataJson = JSON.stringify(previewMetadata);
            const previewMetadataBuffer = new TextEncoder().encode(previewMetadataJson);
            const encryptedPreviewMetadata = await encryptData(previewMetadataBuffer, password);

            const previewMetaFilename = `${uuid}.metadata.preview.enc`;
            const previewMetaHandle = await handle.getFileHandle(previewMetaFilename, { create: true });
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
          tags: tagsToUse
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
    setCustomFileName('');
    setExtension('');
    setTags([]);
    setTagInput('');

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

      <div>
        <input
          type="text"
          placeholder="Enter tags (press Enter or comma)"
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          className="w-full px-3 py-2 border rounded-md"
        />

        <div className="flex flex-wrap gap-2 mt-2">
          {tags.map((tag, idx) => (
            <div
              key={idx}
              className="border bg-black text-white px-3 py-1 rounded-full flex items-center gap-2"
            >
              <span>{tag}</span>
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="text-white hover:text-red-400 font-bold"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

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