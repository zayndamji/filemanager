'use client';

import { useEffect, useState, useMemo } from 'react';
import { decryptData } from '@/utils/crypto';
import GalleryImage from "@/components/Gallery/GalleryImage";

export default function GalleryGrid({ fileList, password }) {
  const [previews, setPreviews] = useState([]);
  const [maxImages, setMaxImages] = useState(40);
  const [allTags, setAllTags] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState(null);

  useEffect(() => {
    let canceled = false;

    const loadPreviews = async () => {
      if (!fileList || !password) return;

      const found = [];
      const collectedTags = new Set();

      for (const entry of fileList) {
        if (entry.kind === 'file' && entry.name.endsWith('.metadata.preview.enc')) {
          const uuid = entry.name.replace('.metadata.preview.enc', '');
          try {
            const metadataFile = await entry.getFile();
            const metadataData = new Uint8Array(await metadataFile.arrayBuffer());
            const decryptedMetadataBuffer = await decryptData(metadataData, password);
            const metadata = JSON.parse(new TextDecoder().decode(decryptedMetadataBuffer));

            if (metadata.type?.startsWith('image/')) {
              found.push({ uuid, meta: metadata });
              (metadata.tags || []).forEach(tag => collectedTags.add(tag.toLowerCase()));
            }
          } catch (err) {
            console.warn(`Error decrypting metadata for ${entry.name}:`, err);
          }
        }
      }

      found.sort((a, b) =>
        (a.meta.name || '').localeCompare(b.meta.name || '') || a.uuid.localeCompare(b.uuid)
      );

      if (!canceled) {
        setPreviews(found.slice(0, maxImages));
        setAllTags([...collectedTags].sort());
      }
    };

    loadPreviews();
    return () => { canceled = true; };
  }, [fileList, password, maxImages]);

  // filter tags for display under search bar
  const filteredTagSuggestions = useMemo(() => {
    const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
    const words = normalize(searchQuery).split(/[\s]+/).filter(Boolean);

    let suggestions;

    if (!searchQuery) {
      suggestions = allTags.slice(0, 7);
    } else {
      suggestions = allTags.filter(tag => {
        const normalizedTag = normalize(tag);
        return words.some(word => normalizedTag.includes(word));
      }).slice(0, 7);
    }

    // selectedTag will always be visible
    if (selectedTag && !suggestions.includes(selectedTag)) {
      suggestions = [selectedTag, ...suggestions.filter(tag => tag !== selectedTag)];
    }

    return suggestions;
  }, [allTags, searchQuery, selectedTag]);

  // filter previews by selected tag
  const visiblePreviews = useMemo(() => {
    if (!selectedTag) return previews;
    return previews.filter(p => (p.meta.tags || []).map(t => t.toLowerCase()).includes(selectedTag));
  }, [previews, selectedTag]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <input
          type="text"
          placeholder="Search tags..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full border px-3 py-2 rounded-md"
        />
        <div className="flex flex-wrap gap-2">
          {filteredTagSuggestions.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`px-3 py-1 rounded-full border text-sm ${
                selectedTag === tag
                  ? 'bg-blue-500 text-white border-blue-600'
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="maxImages" className="text-sm">Show</label>
        <input
          id="maxImages"
          type="number"
          min={1}
          max={200}
          value={maxImages}
          onChange={e => setMaxImages(Number(e.target.value))}
          className="border px-2 py-1 w-20"
        />
        <span className="text-sm">images</span>
      </div>

      <div
        className="
          grid gap-4
          grid-cols-2
          sm:grid-cols-2
          md:grid-cols-3
          lg:grid-cols-4
          xl:grid-cols-4
        "
      >
        {visiblePreviews.map(({ uuid, meta }) => (
          <GalleryImage
            key={uuid}
            uuid={uuid}
            meta={meta}
            password={password}
            fileList={fileList}
          />
        ))}
      </div>
    </div>
  );
}