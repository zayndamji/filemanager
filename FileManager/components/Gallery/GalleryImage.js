import { useState, useEffect } from "react";
import Link from "next/link";
import { decryptData } from "@/utils/crypto";

export default function GalleryImage({ uuid, meta, password, fileList, wide }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let url = null;
    const load = async () => {
      if (!fileList || !password) return;

      try {
        const previewEntry = fileList.find(
          (entry) => entry.kind === "file" && entry.name === `${uuid}.preview.enc`
        );
        if (!previewEntry) return setSrc(null);

        const previewFile = await previewEntry.getFile();
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
  }, [fileList, password, uuid, meta.type]);

  return (
    <Link
      href={`/file?uuid=${encodeURIComponent(uuid)}`}
      title={meta.name}
      className="block overflow-hidden w-full h-full"
    >
      {src ? (
        <img
          src={src}
          alt={meta.name}
          className={`object-cover w-full h-full ${wide ? 'aspect-[2/1]' : 'aspect-[1/2]'}`}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div className="bg-gray-200 animate-pulse w-full h-full" />
      )}
    </Link>
  );
}