import { Suspense } from "react";
import FileManagerClient from "./FileManagerClient";

export default function FileManagerHome() {
  return (
    <Suspense fallback={<div className="p-4">Loading...</div>}>
      <FileManagerClient />
    </Suspense>
  );
}