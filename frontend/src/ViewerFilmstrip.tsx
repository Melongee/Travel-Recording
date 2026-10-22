import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Photo } from './model';

interface ViewerFilmstripProps {
  photos: Photo[];
  activeId: string;
  onSelect: (id: string) => void;
  renderThumbnail: (photo: Photo) => ReactNode;
}

export default function ViewerFilmstrip({ photos, activeId, onSelect, renderThumbnail }: ViewerFilmstripProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [canScroll, setCanScroll] = useState({ previous: false, next: false });

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const previous = track.scrollLeft > 1;
    const next = track.scrollLeft + track.clientWidth < track.scrollWidth - 1;
    setCanScroll((current) => current.previous === previous && current.next === next ? current : { previous, next });
  }, []);

  const revealActive = useCallback(() => {
    const track = trackRef.current;
    const active = activeRef.current;
    if (!track || !active) return;
    // 只滚动缩略图容器，避免影响大图、信息栏或背后的页面。
    const offset = active.getBoundingClientRect().left - track.getBoundingClientRect().left;
    track.scrollTo({ left: track.scrollLeft + offset - (track.clientWidth - active.offsetWidth) / 2 });
  }, []);

  useEffect(() => {
    revealActive();
    updateScrollState();
  }, [activeId, photos, revealActive, updateScrollState]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(() => {
      revealActive();
      updateScrollState();
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, [revealActive, updateScrollState]);

  const scroll = (direction: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * Math.max(84, track.clientWidth * 0.75) });
    updateScrollState();
  };

  return <div className="viewer-filmstrip">
    <button type="button" className="filmstrip-scroll" aria-label="向左滚动缩略图" disabled={!canScroll.previous} onClick={() => scroll(-1)}>
      <ChevronLeft size={18} />
    </button>
    <div className="viewer-thumbnails" ref={trackRef} role="group" aria-label="当前相册的照片缩略图" onScroll={updateScrollState}>
      {photos.map((photo, index) => <button
        type="button"
        key={photo.id}
        ref={photo.id === activeId ? activeRef : undefined}
        className={`viewer-thumbnail${photo.id === activeId ? ' is-active' : ''}`}
        aria-label={`查看第 ${index + 1} 张照片：${photo.fileName}`}
        aria-current={photo.id === activeId ? 'true' : undefined}
        title={photo.fileName}
        onClick={() => onSelect(photo.id)}
      >
        {renderThumbnail(photo)}
        <span className="viewer-thumbnail-number">{index + 1}</span>
      </button>)}
    </div>
    <button type="button" className="filmstrip-scroll" aria-label="向右滚动缩略图" disabled={!canScroll.next} onClick={() => scroll(1)}>
      <ChevronRight size={18} />
    </button>
  </div>;
}
