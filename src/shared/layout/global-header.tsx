'use client';
import Link from 'next/link';
import {demoRoleKey} from '../../features/auth/demo-access';
import {LanguageMenu,ProfileMenu} from './account-menu';
import {usePathname} from 'next/navigation';
import {useEffect,useState} from 'react';
import {SidebarSimpleIcon,PackageIcon,HouseIcon,MapPinIcon,WarningCircleIcon,GearIcon,TruckIcon,ClockIcon,ArrowsLeftRightIcon,CheckCircleIcon} from '@phosphor-icons/react';

export function NavLabel({name,count}:{name:string;count?:number}){const Icon=({Overview:HouseIcon,'Total Stock in Warehouse':PackageIcon,Inventory:PackageIcon,Shipments:TruckIcon,'GPS tracking':MapPinIcon,'Report Cases':WarningCircleIcon,'Delivery Orders':TruckIcon,'Stock Release Requests':TruckIcon,'SME-Owned Inventory':PackageIcon,'Exceptions':WarningCircleIcon,'Open cases':WarningCircleIcon,'Admin settings':GearIcon,'Case deadlines':ClockIcon,'My deliveries':TruckIcon,'Change demo role':ArrowsLeftRightIcon,'New request':CheckCircleIcon,'Request history':ClockIcon} as Record<string,typeof HouseIcon>)[name]||PackageIcon;return <><span className="navIcon" aria-hidden="true"><Icon size={20}/>{count!==undefined&&count>0&&<span className="warehouseCaseCount">{count>99?'99+':count}</span>}</span><span className="navText">{name}</span></>;}
export function GlobalHeader(){
 const pathname=usePathname(),demo=pathname==='/demo'||pathname.startsWith('/demo/');
 const [collapsed,setCollapsed]=useState(false);
 useEffect(()=>{try{setCollapsed(localStorage.getItem('parcelcare.sidebar.collapsed')==='true')}catch{}},[]);
 useEffect(()=>{document.documentElement.classList.toggle('sidebarCollapsed',collapsed);try{localStorage.setItem('parcelcare.sidebar.collapsed',String(collapsed))}catch{}},[collapsed]);
 useEffect(()=>{const toggle=()=>{if(window.innerWidth<768)document.querySelector<HTMLButtonElement>('.warehouseMenuToggle,#workspaceMenu')?.click();else setCollapsed(v=>!v)};window.addEventListener('parcelcare:toggle-sidebar',toggle);return()=>window.removeEventListener('parcelcare:toggle-sidebar',toggle)},[]);
 const [demoManager,setDemoManager]=useState(false);
 useEffect(()=>{try{setDemoManager(sessionStorage.getItem(demoRoleKey)==='manager')}catch{setDemoManager(false)}},[pathname]);
 const manager=demoManager&&(pathname==='/demo/workspace'||pathname.startsWith('/demo/manager'));
 if(pathname==='/login')return <div className="loginLanguageToggle"><LanguageMenu/></div>;
  return <header className={`globalHeader ${demo?'globalHeaderDemo':''}`}><Link href="/" className="globalHeaderBrand" aria-label="ParcelCare home"><img src="/brand/parcelcare-logo.png" alt="ParcelCare" width="2171" height="724"/></Link><button className="sidebarToggle" aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} aria-expanded={!collapsed} onClick={()=>{if(window.innerWidth<768){const menu=document.querySelector<HTMLButtonElement>('.warehouseMenuToggle,#workspaceMenu');menu?.click();}else setCollapsed(v=>!v)}}><SidebarSimpleIcon size={20}/></button><div id="workspace-controls">{manager&&<><span>Manager</span><Link className="hidden text-sm text-brand underline md:inline-flex" href="/demo">Change demo role</Link><span>Warehouse · Yangon Hub</span></>}</div><div className="topUtilities">{demo&&<Link href="/demo" className="globalDemoBadge">Demo Data</Link>}<LanguageMenu/></div></header>;
}

