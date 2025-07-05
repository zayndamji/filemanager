import AudioFile from "./FileTypes/AudioFile";
import TextFile from "./FileTypes/TextFile";
import ImageFile from "./FileTypes/ImageFile";

export default function FileViewer({ fileBlob, fileMeta, showDetails = true }) {
  return (
    <div>
      {fileMeta.type && (
        <div className='mb-4'>
          {fileMeta.type.startsWith('audio') ? (
            <AudioFile file={fileBlob} />
          ) : (fileMeta.type.startsWith('text') || fileMeta.type === 'application/json') ? (
            <TextFile file={fileBlob} />
          ) : fileMeta.type.startsWith('image') ? (
            <ImageFile file={fileBlob} />
          ) : (
            <p>Unsupported file type: {fileMeta.type}</p>
          )}
        </div>
      )}

      {showDetails && (
        <div className='mb-4'>
          <p><strong>Name:</strong> {fileMeta.name}</p>
          <p><strong>Size:</strong> {fileMeta.size} bytes</p>
          <p><strong>Type:</strong> {fileMeta.type || 'Unknown'}</p>
          <p><strong>UUID:</strong> {fileMeta.uuid}</p>
          <p><strong>Folder Path:</strong> {fileMeta.folderPath?.length ? `/${fileMeta.folderPath.join('/')}` : '/'}</p>
          {fileMeta.tags && fileMeta.tags.length > 0 && (
            <p><strong>Tags:</strong> {fileMeta.tags.join(', ')}</p>
          )}
        </div>
      )}
    </div>
  );
}