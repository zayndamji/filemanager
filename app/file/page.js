'use client'

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function FilePage() {
  const searchParams = useSearchParams();
  const path = searchParams.get('path');

  return (
    <div className="p-4">
      {path ? (
        <div className='mb-4'>
          <h1 className="text-center text-xl font-extrabold mb-4">{path}</h1>

          <br />

          <div>
            <p><strong>Path:</strong> {path}</p>
          </div>
        </div>
      ) : (
        <p>No file selected. Please go back to Home to select a file.</p>
      )}

      <p>Go to <Link href={`/`} className="text-blue-300 hover:underline">Home</Link></p>
    </div>
  );
}