'use client';

import { useEffect, useState, useMemo } from 'react';
import { decryptData } from '@/utils/crypto';
import GalleryImage from "@/components/Gallery/GalleryImage";

export default function GalleryGrid({ fileList, password }) {
  const [previews, setPreviews] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [viewportWidth, setViewportWidth] = useState(1200);
  const [maxImages, setMaxImages] = useState(40);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const columns = viewportWidth >= 1024 ? 4 : viewportWidth >= 768 ? 3 : 2;
  const rowHeight = columns === 4 ? 400 : columns === 3 ? 600 : 800;

  useEffect(() => {
    setMaxImages(columns * 10);
  }, [columns]);

  useEffect(() => {
    let canceled = false;

    const shuffleArray = arr => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

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

      const shuffled = shuffleArray(found);

      if (!canceled) {
        setPreviews(shuffled);
        setAllTags([...collectedTags].sort());
      }
    };

    loadPreviews();
    return () => { canceled = true; };
  }, [fileList, password]);

  const normalize = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');

  const visiblePreviews = useMemo(() => {
    return previews.filter(p => {
      const imageTags = (p.meta.tags || []).map(t => normalize(t));
      return selectedTags.every(tag => imageTags.includes(tag));
    }).slice(0, maxImages);
  }, [previews, selectedTags, maxImages]);

  const filteredTagSuggestions = useMemo(() => {
    const words = normalize(searchQuery).split(/\s+/).filter(Boolean);

    // Get tags from currently matching images
    const matchingImages = previews.filter(p => {
      const imageTags = (p.meta.tags || []).map(t => normalize(t));
      return selectedTags.every(tag => imageTags.includes(tag));
    });

    const validTags = new Set();
    matchingImages.forEach(p => {
      (p.meta.tags || []).forEach(tag => validTags.add(normalize(tag)));
    });

    let suggestions = [...validTags].filter(tag => {
      if (selectedTags.includes(tag)) return false;
      if (searchQuery) {
        return words.some(word => tag.includes(word));
      }
      return true;
    });

    return suggestions.slice(0, 7);
  }, [previews, selectedTags, allTags, searchQuery]);

  const combinedPreviews = useMemo(() => {
    return visiblePreviews.map(({ uuid, meta }) => {
      const width = meta.dimensions?.width || 0;
      const height = meta.dimensions?.height || 0;
      const isWide = width > height;

      return {
        uuid,
        meta,
        wide: isWide,
      };
    });
  }, [visiblePreviews]);

  const toggleTag = tag => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

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
          {selectedTags.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className="px-3 py-1 rounded-full border bg-blue-500 text-white border-blue-600 text-sm"
            >
              {tag} ✕
            </button>
          ))}
          {filteredTagSuggestions.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className="px-3 py-1 rounded-full border bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm"
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
        className="grid w-full gap-[6px]"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridAutoRows: `${rowHeight / 2}px`,
        }}
      >
        {combinedPreviews.map(({ uuid, meta, wide }) => {
          const colSpan = wide ? 2 : 1;
          const rowSpan = wide ? 1 : 2;

          return (
            <div
              key={uuid}
              className="overflow-hidden border border-white rounded"
              style={{
                gridColumn: `span ${colSpan} / span ${colSpan}`,
                gridRow: `span ${rowSpan} / span ${rowSpan}`,
                height: '100%',
              }}
            >
              <GalleryImage
                uuid={uuid}
                meta={meta}
                password={password}
                fileList={fileList}
                wide={wide}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}