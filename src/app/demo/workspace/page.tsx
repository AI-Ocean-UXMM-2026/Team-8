import Script from 'next/script';
import {redirect} from 'next/navigation';
import '../../../features/workspace/manager-shell.css';
import { shell, styles } from '../../../features/workspace/generated';

export default async function WorkspacePage({searchParams}:{searchParams:Promise<{workspace?:string}>}) {
  const workspace=(await searchParams).workspace;
  if(workspace!=='manager')redirect(workspace==='warehouse'?'/demo/warehouse':workspace==='rider'?'/demo/courier':'/demo/sme');
  const manager=true;
  const markup=shell.replace(/<select id="role"[\s\S]*?<\/select>/,'<p class="text-sm mb-6">Manager workspace</p>').replace('</nav>','</nav><nav class="managerRoleLinks" aria-label="Demo role"><a href="/demo">Change demo role →</a></nav>');
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

