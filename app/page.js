'use client';

import FolderPicker from '@/components/FolderPicker';
import FileList from '@/components/list/FileList';
import { useFileContext } from '@/context/FileContext';

export default function Home() {
  const { fileList } = useFileContext();

  return (
    <div className="p-4">
      <FolderPicker />
      <FileList fileList={fileList} />
    </div>
  );
}
