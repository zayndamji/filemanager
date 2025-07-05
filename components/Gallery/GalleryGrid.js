'use client';

import { useEffect, useState } from 'react';
import { decryptData } from '@/utils/crypto';
import GalleryImage from "@/components/Gallery/GalleryImage";

export default function GalleryGrid({ fileList, password }) {
  const [previews, setPreviews] = useState([]);
  const [maxImages, setMaxImages] = useState(40);

  useEffect(() => {
    const loadPreviews = async () => {
      setPreviews([]);
      if (!fileList || !password) return;

      const found = [];

      for (const entry of fileList) {
        if (entry.kind === 'file' && entry.name.endsWith('.metadata.preview.enc')) {
          const uuid = entry.name.replace('.metadata.preview.enc', '');
          try {
            const metadataFile = await entry.getFile();
            const metadataData = new Uint8Array(await metadataFile.arrayBuffer());
            const decryptedMetadataBuffer = await decryptData(metadataData, password);
            const metadata = JSON.parse(new TextDecoder().decode(decryptedMetadataBuffer));
            if (metadata.type?.startsWith('image/')) {
              found.push({ uuid, meta: metadata });
            }
          } catch {
            // Ignore corrupt/decryption-failed entries
          }
        }
      }

      found.sort((a, b) => (a.meta.name || '').localeCompare(b.meta.name || '') || a.uuid.localeCompare(b.uuid));
      setPreviews(found.slice(0, maxImages));
    };

    loadPreviews();
  }, [fileList, password, maxImages]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label htmlFor="maxImages" className="text-sm">Show</label>
        <input
          id="maxImages"
          type="number"
          min={1}
          max={200}
          value={maxImages}
          onChange={e => setMaxImages(Number(e.target.value))}
          className="border px-2 py-1 w-20"
        />
        <span className="text-sm">images</span>
      </div>

      <div
        className="
          grid gap-4
          grid-cols-2
          sm:grid-cols-2
          md:grid-cols-3
          lg:grid-cols-4
          xl:grid-cols-4
        "
      >
        {previews.map(({ uuid, meta }) => (
          <GalleryImage
            key={uuid}
            uuid={uuid}
            meta={meta}
            password={password}
            fileList={fileList}
          />
        ))}
      </div>
    </div>
  );
}