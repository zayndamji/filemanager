export default function FileEntry({ path, file }) {
  return (
    <div>
      {path} | <strong>{file.size} bytes</strong>
    </div>
  );
}