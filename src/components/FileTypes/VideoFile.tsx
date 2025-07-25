import React from 'react';
import { EncryptedFile } from '../../utils/FileManagerService';
import StandardVideoPlayer from '../VideoPlayer/StandardVideoPlayer';

interface VideoFileProps {
  file: EncryptedFile;
  onError?: (error: string) => void;
}

/**
 * Legacy VideoFile component - now redirects to StandardVideoPlayer
 * This exists for backward compatibility with existing code
 */
const VideoFile: React.FC<VideoFileProps> = ({ file, onError }) => {
  console.log('[VideoFile] Legacy VideoFile redirecting to StandardVideoPlayer for:', file.uuid);
  
  return (
    <StandardVideoPlayer 
      file={file} 
      onError={onError}
    />
  );
};

export default VideoFile;
