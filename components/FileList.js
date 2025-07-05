import Link from "next/link";

export default function FileList({ fileList }) {
  return (
    <div>
      {fileList.length > 0 && (
        <div className="mt-4">
          <div className="list-disc pl-5 mt-2 space-y-1">
            {fileList.map(({ name, uuid }, index) => (
              <div key={uuid || index}>
                <Link
                  className="text-blue-500 hover:underline"
                  href={`/file?uuid=${encodeURIComponent(uuid)}`}
                >
                  {name}
                </Link>
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