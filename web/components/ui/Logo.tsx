import Image from 'next/image';
import Link from 'next/link';

export function Logo({
  href = '/',
  size = 32,
}: {
  href?: string;
  size?: number;
  /** @deprecated kept for backwards compatibility */
  withWord?: boolean;
}) {
  return (
    <Link href={href} className="flex items-center">
      <Image
        src="/brand/logo-combined.png"
        alt="blink ugc"
        width={size * 4}
        height={size}
        priority
        style={{ height: size, width: 'auto' }}
      />
    </Link>
  );
}
