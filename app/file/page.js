'use client'

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { useFolderContext } from '@/context/FolderContext';

export default function FilePage() {
  const searchParams = useSearchParams();
  const path = searchParams.get('path');

  const { fileList } = useFolderContext();
  const entry = fileList.find(e => e.path == path);

  return (
    <div className="p-4">
      <h1 className="text-center text-xl font-extrabold mb-4">{path}</h1>

      {entry ? (
        <div className='mb-4'>
          <p><strong>Name:</strong> {entry.file.name}</p>
          <p><strong>Size:</strong> {entry.file.size} bytes</p>
          <p><strong>Type:</strong> {entry.file.type || 'Unknown'}</p>
        </div>
      ) : (
        <p>No file selected. Please go back to Home to select a file.</p>
      )}

      <p>Go to <Link href={`/`} className="text-blue-300 hover:underline">Home</Link></p>
    </div>
  );
}