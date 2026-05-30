'use client';
import Image from 'next/image';
import Link from 'next/link';

export function Logo({
  href = '/',
  size = 32,
  onClick,
}: {
  href?: string;
  size?: number;
  /** @deprecated kept for backwards compatibility */
  withWord?: boolean;
  /** When provided, the Logo renders as a button instead of a Link and
   *  invokes this handler. Used by AppShell to intercept clicks while
   *  the user is already on /studio (so the page can reset to a fresh
   *  welcome state instead of being a same-route no-op). */
  onClick?: () => void;
}) {
  const img = (
    <Image
      src="/brand/logo-combined.png"
      alt="blink ugc"
      width={size * 4}
      height={size}
      priority
      style={{ height: size, width: 'auto' }}
    />
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center"
        aria-label="blink ugc home"
      >
        {img}
      </button>
    );
  }

  return (
    <Link href={href} className="flex items-center">
      {img}
    </Link>
  );
}
