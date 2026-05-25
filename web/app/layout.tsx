import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';

export const metadata: Metadata = {
  title: 'Create UGC — AI-generated creator videos for your brand',
  description:
    'Cast AI creators, write scripts in seconds, and ship lip-synced UGC ads that look exactly like the real thing. Built for founders who move fast.',
  openGraph: {
    title: 'Create UGC',
    description: 'AI-generated UGC ads. Lip-synced, on-brand, in minutes.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-black text-white antialiased min-h-screen">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
