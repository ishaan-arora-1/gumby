'use client';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  src: string;
  poster?: string;
  className?: string;
  muted?: boolean;
  controls?: boolean;
  autoplay?: boolean;
  cover?: boolean;
  onClick?: () => void;
}

export function LoopingVideo({
  src,
  poster,
  className,
  muted = true,
  controls = false,
  autoplay = true,
  cover = true,
  onClick,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v || !autoplay) return;
    // Some browsers require an explicit play() call after src changes
    const tryPlay = () => v.play().catch(() => {});
    tryPlay();
    v.addEventListener('loadedmetadata', tryPlay);
    return () => v.removeEventListener('loadedmetadata', tryPlay);
  }, [src, autoplay]);

  return (
    <div
      className={cn('relative overflow-hidden bg-black', className)}
      onClick={onClick}
    >
      <video
        ref={ref}
        key={src}
        src={src}
        poster={poster}
        muted={muted}
        loop
        playsInline
        autoPlay={autoplay}
        controls={controls}
        preload="metadata"
        className={cn(
          'w-full h-full block',
          cover ? 'object-cover' : 'object-contain'
        )}
      />
    </div>
  );
}
