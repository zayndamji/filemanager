import AudioFile from "./AudioFile";

export default function FileViewer({ file }) {
  return (
    <div>
      {file.type && (
        <div className='mb-4'>
          {file.type.startsWith('audio') ? (
            <AudioFile file={file} />
          ) : file.type.startsWith('text') ? (
            <pre>{file.type}</pre>
          ) : (
            <p>Unsupported file type: {file.type}</p>
          )}
        </div>
      )}

      <div className='mb-4'>
        <p><strong>Name:</strong> {file.name}</p>
        <p><strong>Size:</strong> {file.size} bytes</p>
        <p><strong>Type:</strong> {file.type || 'Unknown'}</p>
      </div>
    </div>
  )
}