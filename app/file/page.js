'use client'

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

import { useFileContext } from '@/context/FileContext';
import FileViewer from '@/components/FileViewer';

export default function FilePage() {
  const searchParams = useSearchParams();
  const path = searchParams.get('path');

  const { fileList } = useFileContext();
  const entry = fileList.find(e => e.path == path);

  return (
    <div className="p-4">
      <h1 className="text-center text-xl font-extrabold mb-4">{path}</h1>

      {entry ? (
        <FileViewer file={entry.file} />
      ) : (
        <p>Please select a folder to provide access to your files.</p>
      )}

      <p>Select a <Link href={`/`} className="text-blue-300 hover:underline">new folder</Link></p>
      <p>View <Link href={`/folder`} className="text-blue-300 hover:underline">other files</Link></p>
    </div>
  );
}