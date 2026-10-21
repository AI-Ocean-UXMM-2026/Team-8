import type { Metadata } from 'next';
import Script from 'next/script';
import { styles } from '../features/workspace/generated';

export const metadata: Metadata = { title: 'ParcelCare · Operations workspace' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script src="/vendor/tailwind.js" strategy="beforeInteractive" />
        <style dangerouslySetInnerHTML={{ __html: styles }} />
        <link rel="stylesheet" href="/vendor/leaflet.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
