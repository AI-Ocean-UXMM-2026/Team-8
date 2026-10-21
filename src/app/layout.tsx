import type { Metadata } from 'next';
import './foundation.css';
import Script from 'next/script';
import { styles } from '../features/workspace/generated';

export const metadata: Metadata = { title: 'ParcelCare · Operations workspace' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script src="/vendor/browser-css-runtime.js" strategy="beforeInteractive" />
        <style dangerouslySetInnerHTML={{ __html: styles }} />
        <link rel="stylesheet" href="/vendor/leaflet.css" />
      </head>
      <body><div id="language-switch" role="group" aria-labelledby="language-label"><span id="language-label">Language</span><button type="button" disabled data-language-choice="en" aria-pressed="true" lang="en">English</button><button type="button" disabled data-language-choice="my" aria-pressed="false" lang="my">မြန်မာ</button></div>{children}<Script src="/language.js" strategy="afterInteractive" /></body>
    </html>
  );
}
