'use client';
import { useEffect, useRef, useState } from 'react';
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
  /**
   * Called when we wanted to play with sound but the browser blocked
   * unmuted autoplay, so we fell back to muted playback. Lets the parent
   * sync its own mute UI (e.g. the speaker icon) with reality.
   */
  onAutoMuted?: () => void;
}

/**
 * Viewport-aware looping video.
 *
 * A grid of these used to mount ~25 autoplaying <video> elements at once —
 * every one downloading and decoding simultaneously, which made /studio
 * visibly lag on load. Now:
 *
 *   - Until a card first scrolls near the viewport, only the poster <img>
 *     renders (zero video network/decode cost).
 *   - The <video> mounts when the card is ~200px from view and starts
 *     playing when visible.
 *   - Scrolling away pauses playback (the element stays mounted so coming
 *     back doesn't re-download); scrolling back resumes.
 */
export function LoopingVideo({
  src,
  poster,
  className,
  muted = true,
  controls = false,
  autoplay = true,
  cover = true,
  onClick,
  onAutoMuted,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Mounts the <video> the first time the card approaches the viewport,
  // and never unmounts it after (avoids re-fetching on every scroll pass).
  const [everNear, setEverNear] = useState(!autoplay);
  const [visible, setVisible] = useState(!autoplay);

  useEffect(() => {
    if (!autoplay) return;
    const el = containerRef.current;
    if (!el) return;
    // No IntersectionObserver (very old browser / SSR edge) → just load.
    if (typeof IntersectionObserver === 'undefined') {
      setEverNear(true);
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setEverNear(true);
        setVisible(entry.isIntersecting);
      },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoplay]);

  // Play only while visible; pause the moment the card leaves the viewport.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (visible && autoplay) {
      const tryPlay = () => {
        v.play().catch(() => {
          // Unmuted autoplay blocked by the browser → fall back to muted so
          // the clip still plays; tell the parent so its speaker icon is honest.
          if (!v.muted) {
            v.muted = true;
            onAutoMuted?.();
            v.play().catch(() => {});
          }
        });
      };
      tryPlay();
      v.addEventListener('loadedmetadata', tryPlay);
      return () => v.removeEventListener('loadedmetadata', tryPlay);
    }
    v.pause();
  }, [visible, autoplay, everNear, onAutoMuted]);

  return (
    <div
      ref={containerRef}
      className={cn('relative overflow-hidden bg-black', className)}
      onClick={onClick}
    >
      {everNear ? (
        <video
          ref={videoRef}
          key={src}
          src={src}
          poster={poster}
          muted={muted}
          loop
          playsInline
          controls={controls}
          preload="metadata"
          className={cn(
            'w-full h-full block',
            cover ? 'object-cover' : 'object-contain'
          )}
        />
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          loading="lazy"
          className={cn(
            'w-full h-full block',
            cover ? 'object-cover' : 'object-contain'
          )}
        />
      ) : null}
    </div>
  );
}
