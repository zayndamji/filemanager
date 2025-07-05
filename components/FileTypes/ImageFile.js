export default function ImageFile({ file }) {
  const src = URL.createObjectURL(file);

  return (
    <img
      src={src}
      alt={file.name}
      style={{ height: '100%', width: '100%', maxHeight: '75vh', maxWidth: '70vw' }}
      onLoad={() => URL.revokeObjectURL(src)} // clean up memory
    />
  );
}