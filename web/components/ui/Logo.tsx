import Image from 'next/image';
import Link from 'next/link';

export function Logo({ href = '/', size = 32, withWord = false }: { href?: string; size?: number; withWord?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 group">
      <Image
        src="/brand/logo.png"
        alt="blink ugc"
        width={size}
        height={size}
        className="transition-transform group-hover:scale-105"
        priority
      />
      {withWord && (
        <span className="font-bold tracking-tight text-[15px]">
          blink<span className="text-gradient">ugc</span>
        </span>
      )}
    </Link>
  );
}
