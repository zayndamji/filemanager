'use client';

import { useState } from "react";

import FolderPicker from '@/components/FolderPicker';
import FileList from '@/components/list/FileList';

export default function Home() {
  const [files, setFiles] = useState([]);

  return (
    <div className="p-4">
      <FolderPicker onOpen={setFiles} />
      <FileList files={files} />
    </div>
  );
}
