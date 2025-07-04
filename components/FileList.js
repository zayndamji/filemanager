import React from "react";

export default function FileList({ fileList, onFileClick }) {
  return (
    <div>
      {fileList.length > 0 && (
        <div className="mt-4">
          <div className="list-disc pl-5 mt-2 space-y-1">
            {fileList.map(({ name, uuid }, index) => (
              <div key={uuid || index}>
                <button
                  className="text-blue-500 hover:underline"
                  onClick={() => onFileClick?.({ name, uuid })}
                >
                  {name}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {fileList.length === 0 && (
        <div className="text-gray-400">No files found or wrong password.</div>
      )}
    </div>
  );
}