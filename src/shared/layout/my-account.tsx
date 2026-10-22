'use client';
import Link from 'next/link';
import {useSession} from '../../features/auth/session';
import {useMyanmar} from './account-menu';
import {Card, Illustration} from '../ui';
export function MyAccount(){
 const session=useSession(),my=useMyanmar();
 if(session.status!=='ready'||!session.identity)return <p role="status">Checking your session…</p>;
 const role=session.audience==='rider'?'courier':session.audience;
 const base=`${session.demo?'/demo':''}/${role}`;
 return <AccountInfo actorId={session.identity.actor_id} memberships={session.identity.memberships} base={base} my={my}/>;
}
export function ManagerAccount(){const my=useMyanmar();return <main className="managerAccountPage"><AccountInfo actorId="Demo account" memberships={[]} base="/demo/manager" my={my} manager/></main>}
function AccountInfo({actorId,memberships,base,my,manager=false}:{actorId:string;memberships:ReadonlyArray<{role:string;warehouse_id:string;sme_id?:string|null}>;base:string;my:boolean;manager?:boolean}){
 return <section className="myAccountPage" translate="no"><div className="pc-illustrated-heading myAccountHeading"><div><Link href={base} className="accountBack">← {my?'လုပ်ငန်းခွင်သို့ ပြန်သွားရန်':'Back to workspace'}</Link><h1>{my?'ကျွန်ုပ်၏အကောင့်':'My account'}</h1><p>{my?'သင့်အကောင့်နှင့် အသုံးပြုခွင့် အချက်အလက်များ။ ဤနေရာတွင် ပြင်ဆင်၍မရပါ။':'Your account and workspace access. These details are read-only.'}</p></div><Illustration kind="parcel" size="small" className="myAccountIllustration"/></div><div className="myAccountCards"><Card><h2>{my?'အကောင့်အချက်အလက်':'Account information'}</h2><dl><dt>{my?'အကောင့်အမှတ်':'Account ID'}</dt><dd data-user-content>{actorId}</dd>{manager&&<><dt>{my?'အခန်းကဏ္ဍ':'Role'}</dt><dd>Manager · Demo</dd><dt>Warehouse</dt><dd>Yangon Hub · Demo</dd></>}</dl>{manager&&<p>{my?'ဤအကောင့်သည် စမ်းသပ်ပြသရန်သာ ဖြစ်ပါသည်။':'This is a separate demo account for the manager prototype.'}</p>}</Card>{!manager&&<Card><h2>{my?'အသုံးပြုခွင့်များ':'Memberships'}</h2>{memberships.length?<ul>{memberships.map((m,index)=><li key={`${m.warehouse_id}:${m.role}:${m.sme_id}:${index}`}><dl><dt>{my?'အခန်းကဏ္ဍ':'Role'}</dt><dd data-user-content>{m.role}</dd><dt>Warehouse</dt><dd data-user-content>{m.warehouse_id}</dd>{m.sme_id&&<><dt>SME</dt><dd data-user-content>{m.sme_id}</dd></>}</dl></li>)}</ul>:<p>{my?'အသုံးပြုခွင့် မရှိပါ။':'No memberships recorded.'}</p>}</Card>}</div></section>;
}
