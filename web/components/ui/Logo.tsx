import Image from 'next/image';
import Link from 'next/link';

export function Logo({ href = '/', size = 28, withWord = true }: { href?: string; size?: number; withWord?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 group">
      <Image
        src="/brand/logo.png"
        alt="Create UGC"
        width={size}
        height={size}
        className="rounded-md transition-transform group-hover:scale-105"
        priority
      />
      {withWord && (
        <span className="font-bold tracking-tight text-[15px]">
          Create<span className="text-gradient">UGC</span>
        </span>
      )}
    </Link>
  );
}
