export default function File({ path, file }) {
  return (
    <li>
      <strong>{path}</strong> - {file.size} bytes
    </li>
  );
}