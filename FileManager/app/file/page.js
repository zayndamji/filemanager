import { Suspense } from "react";
import FilePageClient from "./FilePageClient";

export default function FilePage() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <FilePageClient />
    </Suspense>
  );
}