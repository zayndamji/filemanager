import Link from "next/link"

export default function FileList({ fileList }) {
  return (
    <div>
      {fileList.length > 0 && (
        <div className="mt-4">
          <h2 className="font-bold">Files:</h2>
          <div className="list-disc pl-5 mt-2">
            {fileList.map(({ file, path }, index) => (
              <div key={index}>
                <Link href={`/file?path=${encodeURIComponent(path)}`} className="text-blue-300 hover:underline">
                  {path}
                </Link>

                <span> ({file.size} B)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}