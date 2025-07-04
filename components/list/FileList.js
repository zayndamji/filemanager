import FileEntry from '@/components/list/FileEntry';

export default function FileList({ fileList }) {
  return (
    <div>
      {fileList.length > 0 && (
        <div className="mt-4">
          <h2 className="font-bold">Files:</h2>
          <div className="list-disc pl-5 mt-2">
            {fileList.map(({ file, path }, index) => (
              <FileEntry file={file} path={path} key={index} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}