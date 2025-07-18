import { useState } from 'react';

export interface UseMetadataEditorOptions {
  initialName?: string;
  initialFolderPath?: string;
  initialTags?: string[];
}

export function useMetadataEditor({ initialName = '', initialFolderPath = '', initialTags = [] }: UseMetadataEditorOptions) {
  const [name, setName] = useState(initialName);
  const [folderPath, setFolderPath] = useState(initialFolderPath);
  const [tags, setTags] = useState<string[]>(initialTags);

  const reset = (opts: UseMetadataEditorOptions) => {
    setName(opts.initialName || '');
    setFolderPath(opts.initialFolderPath || '');
    setTags(opts.initialTags || []);
  };

  return {
    name,
    setName,
    folderPath,
    setFolderPath,
    tags,
    setTags,
    reset,
  };
}
