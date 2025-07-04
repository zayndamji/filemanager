'use client';

import FolderPicker from '@/components/FolderPicker';

export default function Home() {
  return (
    <div className="p-4">
      <h1 className="text-3xl font-extrabold mb-4">
        File Manager
      </h1>

      <p className="text-xl mb-6">Welcome to File Manager! Start by selecting a folder.</p>
      
      <FolderPicker />
    </div>
  );
}
