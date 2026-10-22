'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
export function GlobalHeader(){
 const pathname=usePathname();
 const demo=pathname==='/demo'||pathname.startsWith('/demo/');
 return <header className={`globalHeader ${demo?'globalHeaderDemo':''}`}>
  {demo&&<Link href="/demo" className="globalDemoBadge" aria-label="Open demo home">Demo Data</Link>}
  <div id="language-switch" role="group" aria-label="Choose language"><button type="button" disabled data-language-choice="en" aria-pressed="true" lang="en">English</button><button type="button" disabled data-language-choice="my" aria-pressed="false" lang="my">မြန်မာ</button></div>
 </header>;
}
