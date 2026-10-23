import type { Metadata } from 'next';
import './globals.css';
import './layout.css';
import '../shared/ui/illustration.css';
import { GlobalHeader } from '../shared/layout/global-header';
import Script from 'next/script';
import { styles } from '../features/workspace/generated';
import { GeistSans } from "geist/font/sans";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: 'ParcelCare',
  applicationName: 'ParcelCare',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", GeistSans.variable)}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/favicon-32x32.png" sizes="32x32" type="image/png" />
        <link rel="icon" href="/favicon.png" sizes="512x512" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <style dangerouslySetInnerHTML={{ __html: styles }} />
        <link rel="stylesheet" href="/vendor/leaflet.css" />
      </head>
      <body style={{ fontFamily: 'var(--font-sans)', background: 'var(--background)', color: 'var(--foreground)' }}><GlobalHeader />{children}<Script src="/language.js" strategy="afterInteractive" /></body>
    </html>
  );
}
