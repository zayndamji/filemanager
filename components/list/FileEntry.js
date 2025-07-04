import Link from "next/link";

export default function FileEntry({ path, file }) {
  return (
    <div>
      <Link href={`/file?path=${encodeURIComponent(path)}`} className="text-blue-300 hover:underline">
        {path}
      </Link>

      <span> ({file.size} B)</span>
    </div>
  );
}