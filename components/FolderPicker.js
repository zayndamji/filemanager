import { useFileContext } from '@/context/FileContext';

export default function FolderPicker() {
  const { setFileList, setHandle } = useFileContext();

  const openFolder = async () => {
    try {
      const pickerHandle = await window.showDirectoryPicker();
      const fileList = [];

      for await (const [name, handle] of pickerHandle.entries()) {
        if (handle.kind === "file") {
          const file = await handle.getFile();
          fileList.push({ file, path: name });
        }
        
        else if (handle.kind === "directory") {
          await readDirectoryRecursive(handle, name, fileList);
        }
      }

      setHandle(pickerHandle);
      setFileList(fileList.filter(e => e.file.name !== '.DS_Store'));
    } catch (error) {
      console.error("Error accessing folder:", error);
    }
  };

  const readDirectoryRecursive = async (directory, basePath, fileList) => {
    for await (const [name, handle] of directory.entries()) {
      const fullPath = `${basePath}/${name}`;
      
      if (handle.kind === "file") {
        const file = await handle.getFile();
        fileList.push({ file, path: fullPath });
      }
      
      else if (handle.kind === "directory") {
        await readDirectoryRecursive(handle, fullPath, fileList);
      }
    }
  };

  return (
    <button className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full" onClick={openFolder}>
      Open Folder
    </button>
  );
}
