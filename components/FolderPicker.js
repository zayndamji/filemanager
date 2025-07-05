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
    <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full cursor-pointer" onClick={openFolder}>
      Open Folder
    </button>
  );
}