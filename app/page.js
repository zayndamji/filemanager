'use client';

import FolderPicker from '@/components/FolderPicker';

export default function Home() {
  return (
    <div className="p-4">
      <h1>Welcome to File Manager! Start by selecting a folder to view.</h1>
      <br />
      <FolderPicker />
    </div>
  );
}
