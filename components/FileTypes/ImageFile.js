export default function ImageFile({ file }) {
  const src = URL.createObjectURL(file);

  return (
    <img
      src={src}
      alt={file.name}
      style={{ height: '75vh' }}
      onLoad={() => URL.revokeObjectURL(src)} // clean up memory
    />
  );
}