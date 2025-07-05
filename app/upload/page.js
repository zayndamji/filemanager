'use client'

import { useState } from 'react';
import Link from 'next/link';

import FolderPicker from "@/components/FolderPicker";
import EncryptUploader from "@/components/FileManager/EncryptUploader";

export default function UploadPage() {
  const [status, setStatus] = useState("");

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/" className="text-blue-500 hover:underline">&larr; Back to Home</Link>
      </div>

      <FolderPicker />

      <h2 className="text-2xl font-bold">Upload Encrypted Files</h2>

      <EncryptUploader
        setStatus={setStatus}
      />

      <div className="text-sm text-gray-600">{status}</div>
    </div>
  );
}