import Script from 'next/script';
import { shell } from '../features/workspace/generated';

export default function WorkspacePage() {
  return (
    <>
      {/* Trusted repository markup, never user input. Preserve the original UI
          while feature owners progressively replace its DOM-based runtime. */}
      <div id="parcelcare-workspace" dangerouslySetInnerHTML={{ __html: shell }} />
      <Script src="/workspace.js" strategy="afterInteractive" />
    </>
  );
}
