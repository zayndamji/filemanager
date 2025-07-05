export default function DownloadButton({ fileBlob, fileMeta }) {
  const handleDownload = () => {
    if (!fileBlob || !fileMeta) return;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(fileBlob);
    link.download = fileMeta.name || "file";
    link.click();
  };

  return (
    <button
      onClick={handleDownload}
      className="bg-green-500 text-white px-4 py-2 rounded mt-2 cursor-pointer"
    >
      Download
    </button>
  );
}