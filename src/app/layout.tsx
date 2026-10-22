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
    icon: { url: '/brand/parcelcare-icon.png', type: 'image/png' },
    apple: '/brand/parcelcare-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", GeistSans.variable)}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: styles }} />
        <link rel="stylesheet" href="/vendor/leaflet.css" />
      </head>
      <body style={{ fontFamily: 'var(--font-sans)', background: 'var(--background)', color: 'var(--foreground)' }}><GlobalHeader />{children}<Script src="/language.js" strategy="afterInteractive" /></body>
    </html>
  );
}
