'use client'

import Link from 'next/link';

import FileList from "@/components/FileList";

export default function FileManagerClient() {
  return (
    <div className="p-4 max-w-4xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold">Encrypt File Manager</h2>

      <div>
        <Link href="/upload" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-full cursor-pointer">Upload Files</Link> &nbsp;
        <Link href="/gallery" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2.5 px-4 rounded-full cursor-pointer">View Gallery</Link>
      </div>

      <FileList />
    </div>
  );
}