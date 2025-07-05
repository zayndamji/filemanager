'use client'

import { useState } from 'react';
import Link from 'next/link';

import { useFileContext } from '@/context/FileContext';
import { usePasswordContext } from '@/context/PasswordContext';

import FolderPicker from "@/components/FolderPicker";
import EncryptUploader from "@/components/FileManager/EncryptUploader";

export default function UploadPage() {
  const { handle } = useFileContext();
  const { password } = usePasswordContext();
  const [status, setStatus] = useState("");

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold">Upload Encrypted Files</h2>

      <div>
        <Link href="/" className="text-blue-500 hover:underline">&larr; Back to Home</Link>
      </div>

      <FolderPicker />

      <EncryptUploader
        handle={handle}
        password={password}
        setStatus={setStatus}
        refreshAndDecryptFileList={() => {}}
      />

      <div className="text-sm text-gray-600">{status}</div>
    </div>
  );
}