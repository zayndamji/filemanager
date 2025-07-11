import { Suspense } from "react";
import GalleryPageClient from "./GalleryPageClient";

export default function GalleryPage() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <GalleryPageClient />
    </Suspense>
  );
}