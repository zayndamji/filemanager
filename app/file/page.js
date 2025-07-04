'use client'

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { useFileContext } from '@/context/FileContext';

export default function FilePage() {
  const searchParams = useSearchParams();
  const path = searchParams.get('path');

  const { fileList } = useFileContext();
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
        <p>Please select a folder to provide access to your files.</p>
      )}

      <p>Select a <Link href={`/`} className="text-blue-300 hover:underline">new folder</Link></p>
      <p>View <Link href={`/folder`} className="text-blue-300 hover:underline">other files</Link></p>
    </div>
  );
}