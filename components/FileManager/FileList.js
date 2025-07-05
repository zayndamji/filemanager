'use client';

import Link from 'next/link';

export default function FileList({ fileList, currentPath, setCurrentPath }) {
  // Filter files in the current folder
  const filesInCurrentFolder = fileList.filter(file => {
    const folderMatch = file.folderPath.join('/') === currentPath.join('/');
    return folderMatch;
  });

  // Discover all immediate subfolders within the current folder
  const subfolders = new Set();
  for (const file of fileList) {
    const path = file.folderPath;
    if (path.length > currentPath.length) {
      const isInCurrent = currentPath.every((p, i) => p === path[i]);
      if (isInCurrent) {
        subfolders.add(path[currentPath.length]);
      }
    }
  }

  const navigateToSubfolder = (folderName) => {
    setCurrentPath([...currentPath, folderName]);
  };

  const navigateUp = () => {
    setCurrentPath(currentPath.slice(0, -1));
  };

  return (
    <div className="mt-6 space-y-2">
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-600">Current path:</span>
        <span className="text-sm font-mono text-blue-700">/{currentPath.join('/')}</span>
        {currentPath.length > 0 && (
          <button onClick={navigateUp} className="text-blue-500 underline text-sm ml-2 cursor-pointer">Up</button>
        )}
      </div>

      {subfolders.size === 0 && filesInCurrentFolder.length === 0 && (
        <p className="text-sm text-gray-500">No files or folders found.</p>
      )}

      <ul className="space-y-1">
        {[...subfolders].sort().map(folder => (
          <li key={folder}>
            📁&nbsp;
            <button
              onClick={() => navigateToSubfolder(folder)}
              className="text-green-600 hover:text-green-800 font-medium cursor-pointer"
            >
              {folder}
            </button>
          </li>
        ))}
        
        {filesInCurrentFolder.map(file => (
          <li key={file.uuid}>
            📄&nbsp; 
            <Link
              href={`/file?uuid=${file.uuid}`}
              className="text-blue-500 underline hover:text-blue-700 cursor-pointer"
            >
              {file.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}