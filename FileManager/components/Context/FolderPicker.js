'use client';

import { useFileContext } from '@/context/FileContext';

export default function FolderPicker() {
  const { setHandle } = useFileContext();

  const openFolder = async () => {
    try {
      const pickerHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      console.log("Setting handle:", pickerHandle);
      setHandle(pickerHandle);
    } catch (error) {
      console.error("Error accessing folder:", error);
    }
  };

  return (
    <button className="bg-black text-white font-bold py-2 px-4 block border cursor-pointer" onClick={openFolder}>
      Select Folder
    </button>
  );
}