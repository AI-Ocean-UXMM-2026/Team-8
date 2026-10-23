'use client';
import Link from 'next/link';
import {usePathname,useSearchParams} from 'next/navigation';
import {useEffect,useState,type ReactNode} from 'react';
import {Card,Button} from '../../shared/ui';
import {canEnterDemo,demoRoleKey,demoRouteRole,demoRole,demoHomes,type DemoRole} from './demo-access';

// This gate isolates fictitious demo workspaces. Live authorization uses verified
// memberships and database policies, never this browser preference.
export function DemoGate({children}:{children:ReactNode}){
  const pathname=usePathname(),params=useSearchParams();
  const route=pathname+'?'+params.toString();
  const [check,setCheck]=useState<{route:string;role:DemoRole|null;allowed:boolean;error:boolean}|null>(null);
  useEffect(()=>{
    const verify=()=>{
      try{
        const role=demoRole(sessionStorage.getItem(demoRoleKey));
        setCheck({route,role,allowed:canEnterDemo(role,demoRouteRole(pathname,new URLSearchParams(params.toString()))),error:false});
      }catch{setCheck({route,role:null,allowed:false,error:true});}
    };
    verify();window.addEventListener('pageshow',verify);
    return()=>window.removeEventListener('pageshow',verify);
  },[pathname,route,params]);
  if(pathname==='/demo')return children;
  if(check?.route!==route)return <main className="mx-auto max-w-xl p-6 pt-24"><p role="status">Checking demo access…</p></main>;
  if(check.allowed)return children;
  return <main className="mx-auto max-w-xl p-6 pt-24"><Card><h1 className="text-2xl font-semibold">Demo access required</h1><p role="alert" className="my-4">{check.error?'Browser session storage is unavailable. Enable it to use a demo.':check.role?'This page is outside your selected demo role.':'Choose a demo role before opening a workspace.'}</p><div className="flex flex-wrap gap-3"><Button asChild><Link href="/demo">Choose demo role</Link></Button>{check.role&&<Button asChild variant="outline"><Link href={demoHomes[check.role]}>Back to my demo</Link></Button>}</div></Card></main>;
}

export function DemoSelection(){
  const [error,setError]=useState('');
  const choices:Array<{role:DemoRole;label:string;description:string}>=[
    {role:'rider',label:'Rider demo',description:'Your assigned deliveries, routes, GPS sharing and issue reports'},
    {role:'sme',label:'SME demo',description:'Your business stock, orders, tracking and report cases'},
    {role:'warehouse',label:'Warehouse demo',description:'Your warehouse stock, shipments, GPS and case operations'},
    {role:'manager',label:'Manager demo',description:'Warehouse manager reports and review work'},
  ];
  function enter(role:DemoRole){
    try{sessionStorage.setItem(demoRoleKey,role);window.location.assign(demoHomes[role]);}
    catch{setError('Unable to save your demo role. Enable browser session storage and try again.');}
  }
  return <main className="mx-auto max-w-4xl p-5 pt-24 md:p-10 md:pt-24"><h1 className="text-3xl font-semibold">Choose your demo role</h1><p className="my-4">Pick the role you want to try. Return to this page to change your role.</p><p className="mb-6 text-sm text-muted">Fictitious demo data. Each workspace is limited to the role you choose.</p>{error&&<p role="alert" className="mb-4">{error}</p>}<div className="grid gap-4 sm:grid-cols-2">{choices.map(c=><Card key={c.role}><h2 className="text-xl font-semibold">{c.label}</h2><p className="my-4 leading-7">{c.description}</p><Button onClick={()=>enter(c.role)}>Enter {c.label}</Button></Card>)}</div><Link className="mt-6 inline-flex min-h-11 items-center text-brand underline" href="/login">Sign in to your account →</Link></main>;
}
