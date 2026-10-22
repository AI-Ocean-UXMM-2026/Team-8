import Script from 'next/script';
import '../../../features/workspace/manager-shell.css';
import { shell, styles } from '../../../features/workspace/generated';

export default async function WorkspacePage({searchParams}:{searchParams:Promise<{workspace?:string}>}) {
  const manager=(await searchParams).workspace==='manager';
  const markup=manager?shell.replace('</nav>', '</nav><nav class="managerRoleLinks" aria-label="Demo workspaces"><a href="/demo/warehouse">Warehouse dashboard →</a><a href="/demo/sme">SME dashboard →</a><a href="/demo/courier">Courier dashboard →</a></nav>'):shell;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `@scope (#parcelcare-workspace) { ${styles} }` }} />
      {/* Trusted repository markup, never user input. Preserve the original UI
          while feature owners progressively replace its DOM-based runtime. */}
      <div className={manager?'managerWorkspace':undefined} id="parcelcare-workspace" dangerouslySetInnerHTML={{ __html: markup }} />
      <Script src="/workspace.js" strategy="afterInteractive" />
    </>
  );
}

