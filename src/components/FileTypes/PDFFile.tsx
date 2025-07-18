// Placeholder for PDF file renderer
interface PDFFileProps {
  fileData: Uint8Array;
  mimeType: string;
  fileName: string;
}

const PDFFile: React.FC<PDFFileProps> = ({ fileData, mimeType, fileName }) => {
  return null;
};

export default PDFFile;