export default function ImageFile({ file }) {
  const src = URL.createObjectURL(file);

  return (
    <img
      src={src}
      alt={file.name}
      style={{
        maxHeight: '75vh',
        maxWidth: '70vw',
        objectFit: 'contain',
        display: 'block',
      }}
      onLoad={() => URL.revokeObjectURL(src)} // clean up memory
    />
  );
}