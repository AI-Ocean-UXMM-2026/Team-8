'use client';
import {usePathname} from 'next/navigation';
export function GlobalHeader(){
 const pathname=usePathname();
 const demo=pathname.startsWith('/demo/warehouse')||pathname.startsWith('/demo/courier');
 return <header className={`globalHeader ${demo?'globalHeaderDemo':''}`}>
  {demo&&<span className="globalDemoBadge">Demo Data</span>}
  <div id="language-switch" role="group" aria-label="Choose language"><button type="button" disabled data-language-choice="en" aria-pressed="true" lang="en">English</button><button type="button" disabled data-language-choice="my" aria-pressed="false" lang="my">မြန်မာ</button></div>
 </header>;
}
