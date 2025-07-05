import { useState, useEffect } from "react";
import Link from "next/link";
import { decryptData } from "@/utils/crypto";

export default function GalleryImage({ uuid, meta, password, handle }) {
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