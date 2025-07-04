'use client';

import Link from 'next/link';

import FileList from '@/components/FileList';
import { useFileContext } from '@/context/FileContext';

export default function FolderPage() {
  const { fileList } = useFileContext();

  return (
    <div className="p-4">
      <p>Select a <Link href={`/`} className="text-blue-300 hover:underline">new folder</Link></p>
          
      <br />

      <FileList fileList={fileList} />
    </div>
  );
}