'use client';
import { useState } from 'react';
import { LoopingVideo } from '@/components/ui/LoopingVideo';
import { Button } from '@/components/ui/Button';
import { Download, RotateCcw, Share2 } from 'lucide-react';

interface Props {
  videoUrl: string;
  posterUrl?: string;
  onRegenerate?: () => void;
}

export function VideoResult({ videoUrl, posterUrl, onRegenerate }: Props) {
  const [downloading, setDownloading] = useState(false);

  // Browsers ignore the HTML `download` attribute on cross-origin URLs
  // (which our Supabase-hosted videos are), so a plain <a download> opens
  // the file in a new tab instead of saving it. We fetch the bytes into a
  // blob and trigger the save off a same-origin blob: URL — that always
  // produces a real "Save As" without leaving the page.
  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(videoUrl, { mode: 'cors', cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const filename = (() => {
        try {
          const u = new URL(videoUrl);
          const last = u.pathname.split('/').pop() || '';
          if (last.includes('.')) return last;
        } catch {}
        return `create-ugc-${Date.now()}.mp4`;
      })();

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Give the browser a beat to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (e) {
      // Fallback: open the raw URL so the user can right-click → Save As
      // rather than getting stuck with a dead button.
      window.open(videoUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="max-w-xs mx-auto">
      <div className="relative aspect-[9/16] rounded-card overflow-hidden gradient-border bg-black">
        <LoopingVideo
          src={videoUrl}
          poster={posterUrl}
          controls
          autoplay
          className="w-full h-full"
        />
      </div>
      <div className="mt-4 flex gap-2">
        <Button
          variant="primary"
          size="md"
          className="flex-1"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? (
            <>
              <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Downloading…
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" /> Download
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="md"
          onClick={() => {
            if (navigator.share) {
              navigator.share({ url: videoUrl }).catch(() => {});
            } else {
              navigator.clipboard.writeText(videoUrl);
            }
          }}
        >
          <Share2 className="w-3.5 h-3.5" />
        </Button>
        {onRegenerate && (
          <Button variant="outline" size="md" onClick={onRegenerate}>
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
