'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFileContext } from '@/context/FileContext';
import { usePasswordContext } from '@/context/PasswordContext';
import { decryptData } from '@/utils/crypto';

export default function GalleryPage() {
  const { handle, refreshFileList } = useFileContext();
  const { password } = usePasswordContext();
  const [previews, setPreviews] = useState([]);
  const [maxImages, setMaxImages] = useState(40);

  useEffect(() => {
    const loadPreviews = async () => {
      setPreviews([]);
      if (!handle || !password) return;

      await refreshFileList();
      const found = [];

      for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.metadata.preview.enc')) {
          const uuid = entry.name.replace('.metadata.preview.enc', '');
          try {
            const metadataFile = await entry.getFile();
            const metadataData = new Uint8Array(await metadataFile.arrayBuffer());
            const decryptedMetadataBuffer = await decryptData(metadataData, password);
            const metadata = JSON.parse(new TextDecoder().decode(decryptedMetadataBuffer));
            if (metadata.type && metadata.type.startsWith('image/')) {
              found.push({ uuid, meta: metadata });
            }
          } catch {
            // skip files that can't be decrypted
          }
        }
      }
      // Sort by name or uuid for consistency
      found.sort((a, b) => (a.meta.name || '').localeCompare(b.meta.name || '') || a.uuid.localeCompare(b.uuid));
      setPreviews(found.slice(0, maxImages));
    };

    loadPreviews();
  }, [handle, password, refreshFileList, maxImages]);

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/" className="text-blue-500 hover:underline">&larr; Back to Home</Link>
      </div>
      <h2 className="text-2xl font-bold mb-4">Image Gallery</h2>
      <div className="mb-4 flex items-center gap-2">
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
      <GalleryGrid previews={previews} password={password} handle={handle} />
    </div>
  );
}

function GalleryGrid({ previews, password, handle }) {
  return (
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
          handle={handle}
        />
      ))}
    </div>
  );
}

function GalleryImage({ uuid, meta, password, handle }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let url = null;
    const load = async () => {
      if (!handle || !password) return;
      try {
        const previewHandle = await handle.getFileHandle(`${uuid}.preview.enc`);
        const previewFile = await previewHandle.getFile();
        const previewData = new Uint8Array(await previewFile.arrayBuffer());
        const decrypted = await decryptData(previewData, password);
        const blob = new Blob([decrypted], { type: meta.type });
        url = URL.createObjectURL(blob);
        setSrc(url);
      } catch {
        setSrc(null);
      }
    };
    load();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [handle, password, uuid, meta.type]);

  return (
    <Link
      href={`/file?uuid=${encodeURIComponent(uuid)}`}
      title={meta.name}
      className="block group"
      style={{ aspectRatio: '1/1' }}
    >
      {src ? (
        <img
          src={src}
          alt={meta.name}
          className="object-cover w-full h-full rounded shadow group-hover:opacity-80 transition"
          style={{ aspectRatio: '1/1', background: '#eee' }}
        />
      ) : (
        <div className="bg-gray-200 w-full h-full rounded animate-pulse" style={{ aspectRatio: '1/1' }} />
      )}
    </Link>
  );
}