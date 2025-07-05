import { useEffect, useState } from 'react';

export default function AudioFile({ file }) {
  const [audioSrc, setAudioSrc] = useState(null);

  useEffect(() => {
    if (!file) return;

    const objectUrl = URL.createObjectURL(file);
    setAudioSrc(objectUrl);

    // revoke it when the audio file is removed/changes
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div>
      <audio controls src={audioSrc} style={{width: "96%", margin: "2%"}}>
        Your browser does not support the audio element.
      </audio>
    </div>
  )
}