import type { Metadata, Viewport } from 'next';
import { Sora, Archivo } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';

const sora = Sora({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sora',
  display: 'swap',
});

const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-archivo',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Blink UGC — The fastest way to create AI UGC videos',
  description:
    'Powered by Kling 3.0 Pro. Cast AI creators, write scripts in seconds, and ship lip-synced UGC ads that look exactly like the real thing. Built for founders who move fast.',
  openGraph: {
    title: 'Blink UGC',
    description: 'AI-generated UGC ads, powered by Kling 3.0 Pro. Lip-synced, on-brand, in minutes.',
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
    <html lang="en" className={`dark ${sora.variable} ${archivo.variable}`}>
      <body className="bg-black text-white antialiased min-h-screen">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
