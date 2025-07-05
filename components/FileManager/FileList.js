'use client'
import Link from 'next/link';

export default function FileList({ fileList }) {
  return (
    <div className="mt-6">
      <h3 className="font-semibold mb-2">Files</h3>
      <ul className="space-y-1">
        {fileList.map(file => (
          <li key={file.uuid}>
            <Link
              href={`/file?uuid=${file.uuid}`}
              className="text-blue-500 underline hover:text-blue-700"
            >
              {file.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}