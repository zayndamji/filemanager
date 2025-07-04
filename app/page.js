'use client';

import { useState } from "react";

import File from './components/file';

export default function Home() {
  const [files, setFiles] = useState([]);

  const openFolder = async () => {
    try {
      const directory = await window.showDirectoryPicker();
      const fileList = [];

      for await (const [name, handle] of directory.entries()) {
        if (handle.kind === "file") {
          const file = await handle.getFile();
          fileList.push({ file, path: name });
        } else if (handle.kind === "directory") {
          await readDirectoryRecursive(handle, name, fileList);
        }
      }

      setFiles(fileList.filter(e => e.file.name != '.DS_Store'));
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
      } else if (handle.kind === "directory") {
        await readDirectoryRecursive(handle, fullPath, fileList);
      }
    }
  };

  return (
    <div className="p-4">
      <button
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full"
        onClick={openFolder}
      >
        Open Folder
      </button>

      {files.length > 0 && (
        <div className="mt-4">
          <h2 className="font-bold">Files in Folder:</h2>
          <ul className="list-disc pl-5 mt-2">
            {files.map(({ file, path }, index) => (
              <File file={file} path={path} key={index} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
