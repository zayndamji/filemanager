'use client';

import Link from 'next/link';

import { useFileContext } from '@/context/FileContext';
import { usePasswordContext } from '@/context/PasswordContext';
import GalleryGrid from '@/components/Gallery/GalleryGrid';
import FolderPicker from '@/components/FolderPicker';

export default function GalleryPage() {
  const { handle } = useFileContext();
  const { password } = usePasswordContext();

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <div>
        <Link href="/" className="text-blue-500 hover:underline">&larr; Back to Home</Link>
      </div>

      <FolderPicker />

      <h2 className="text-2xl font-bold mb-4">Image Gallery</h2>
      
      <GalleryGrid handle={handle} password={password} />
    </div>
  );
}