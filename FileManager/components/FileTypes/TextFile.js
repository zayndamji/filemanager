import { useEffect, useState } from 'react';

export default function TextFile({ file }) {
  const [content, setContent] = useState('');

  useEffect(() => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => setContent(e.target.result);
    reader.readAsText(file);
  }, [file]);

  return (
    <div style={{ width: '96%', margin: '2%' }}>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{content}</pre>
    </div>
  );
}
