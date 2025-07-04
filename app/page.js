'use client';

import FolderPicker from '@/components/FolderPicker';
import FileList from '@/components/list/FileList';
import { useFolderContext } from '@/context/FolderContext';

export default function Home() {
  const { fileList } = useFolderContext();

  return (
    <div className="p-4">
      <FolderPicker />
      <FileList fileList={fileList} />
    </div>
  );
}
