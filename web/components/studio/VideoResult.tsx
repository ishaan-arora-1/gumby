'use client';
import { LoopingVideo } from '@/components/ui/LoopingVideo';
import { Button } from '@/components/ui/Button';
import { downloadVideo } from '@/lib/utils';
import { Download, RotateCcw, Share2 } from 'lucide-react';

interface Props {
  videoUrl: string;
  posterUrl?: string;
  onRegenerate?: () => void;
}

export function VideoResult({ videoUrl, posterUrl, onRegenerate }: Props) {
  const handleDownload = () =>
    downloadVideo(videoUrl, `blink-ugc-${Date.now()}.mp4`);

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
        >
          <Download className="w-3.5 h-3.5" /> Download
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
