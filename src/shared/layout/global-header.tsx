'use client';
import Link from 'next/link';
import {LanguageMenu,ProfileMenu} from './account-menu';
import {usePathname} from 'next/navigation';
import {useEffect,useState} from 'react';
import {ListIcon,PackageIcon,HouseIcon,MapPinIcon,WarningCircleIcon,GearIcon,TruckIcon,ClockIcon} from '@phosphor-icons/react';

export function NavLabel({name,count}:{name:string;count?:number}){const Icon=({Overview:HouseIcon,Inventory:PackageIcon,Shipments:TruckIcon,'GPS tracking':MapPinIcon,'Report Cases':WarningCircleIcon,'Delivery Orders':TruckIcon,'Open cases':WarningCircleIcon,'Admin settings':GearIcon,'Case deadlines':ClockIcon,'My deliveries':TruckIcon} as Record<string,typeof HouseIcon>)[name]||PackageIcon;return <><span className="navIcon" aria-hidden="true"><Icon size={20}/>{count!==undefined&&count>0&&<span className="warehouseCaseCount">{count>99?'99+':count}</span>}</span><span className="navText">{name}</span></>;}
export function GlobalHeader(){
 const pathname=usePathname(),demo=pathname==='/demo'||pathname.startsWith('/demo/');
 const [collapsed,setCollapsed]=useState(false);
 useEffect(()=>{try{setCollapsed(localStorage.getItem('parcelcare.sidebar.collapsed')==='true')}catch{}},[]);
 useEffect(()=>{document.documentElement.classList.toggle('sidebarCollapsed',collapsed);try{localStorage.setItem('parcelcare.sidebar.collapsed',String(collapsed))}catch{}},[collapsed]);
 useEffect(()=>{const toggle=()=>{if(window.innerWidth<768)document.querySelector<HTMLButtonElement>('.warehouseMenuToggle,#workspaceMenu')?.click();else setCollapsed(v=>!v)};window.addEventListener('parcelcare:toggle-sidebar',toggle);return()=>window.removeEventListener('parcelcare:toggle-sidebar',toggle)},[]);
 const manager=pathname==='/demo/workspace'||pathname.startsWith('/demo/manager');
 return <header className={`globalHeader ${demo?'globalHeaderDemo':''}`}><button className="sidebarToggle" aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} aria-expanded={!collapsed} onClick={()=>{if(window.innerWidth<768){const menu=document.querySelector<HTMLButtonElement>('.warehouseMenuToggle,#workspaceMenu');menu?.click();}else setCollapsed(v=>!v)}}><ListIcon size={22}/></button><div id="workspace-controls">{manager&&<><select aria-label="Workspace" value="manager" onChange={e=>window.location.assign('/demo/'+e.target.value)}><option value="manager">Manager</option><option value="warehouse">Warehouse</option><option value="sme">SME</option><option value="courier">Courier</option></select><span>Warehouse · Yangon Hub</span><div className="topAccount"><ProfileMenu role="Manager" actorId="Demo account" context="Warehouse · Yangon Hub" accountHref="/demo/manager/account" signOut={async()=>{window.location.assign('/login')}}/></div></>}</div><div className="topUtilities">{demo&&<Link href="/demo" className="globalDemoBadge">Demo Data</Link>}<LanguageMenu/></div></header>;
}
