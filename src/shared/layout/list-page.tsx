'use client';
import Link from 'next/link';
import {usePathname,useSearchParams} from 'next/navigation';
import {CaretLeftIcon,CaretRightIcon} from '@phosphor-icons/react';
export function pageWindow(total:number,page:number,size:number){const pages=Math.max(1,Math.ceil(total/size));const current=Math.min(Math.max(1,page),pages);return {current,pages,start:(current-1)*size};}
export function useListPage(){
 const params=useSearchParams(),path=usePathname();
 const size=[10,20,50].includes(Number(params.get('size')))?Number(params.get('size')):10;
 const page=Math.max(1,Math.floor(Number(params.get('page'))||1));
 const update=(values:Record<string,string>)=>{const next=new URLSearchParams(window.location.search);for(const [key,value] of Object.entries(values)){if(value)next.set(key,value);else next.delete(key);}window.history.replaceState(null,'',`${path}?${next}`);};
 return {page,size,search:params.get('q')||'',setSearch:(q:string)=>update({q,page:''}),update,slice:<T,>(items:T[])=>{const {start}=pageWindow(items.length,page,size);return items.slice(start,start+size);},detail:(href:string)=>`${href}?from=${encodeURIComponent(`${path}${params.size?'?'+params.toString():''}`)}`};
}
export function ListPager({paging,total}:{paging:ReturnType<typeof useListPage>;total:number}){const {current,pages,start}=pageWindow(total,paging.page,paging.size);return <nav aria-label="Pagination" className="listPager"><span role="status">{total?start+1:0}–{Math.min(start+paging.size,total)} of {total}</span><label>Rows <select value={paging.size} onChange={e=>paging.update({size:e.target.value,page:''})}>{[10,20,50].map(n=><option key={n}>{n}</option>)}</select></label><button disabled={current===1} onClick={()=>paging.update({page:String(current-1)})}><CaretLeftIcon aria-hidden/> Previous</button><span>{current} / {pages}</span><button disabled={current===pages} onClick={()=>paging.update({page:String(current+1)})}>Next <CaretRightIcon aria-hidden/></button></nav>}
export function ListBack({href}:{href:string}){const params=useSearchParams();const from=params.get('from');const target=from&&(from===href||from.startsWith(href+'?'))?from:href;return <Link className="inventoryLink" href={target}>← Back to list</Link>}
