'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect,useRef,useState} from 'react';
import {Menu} from '@base-ui/react/menu';
import {Dialog} from '@base-ui/react/dialog';
import {localizedText} from '../i18n/text';
import {CaretDownIcon,UserCircleIcon,SignOutIcon,SidebarSimpleIcon,XIcon,TranslateIcon,CheckIcon,MapPinIcon} from '@phosphor-icons/react';

export function useMyanmar(){
 const [my,setMy]=useState(false);
 useEffect(()=>{const update=()=>setMy(document.documentElement.lang==='my');update();const observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});return()=>observer.disconnect();},[]);
 return my;
}
const avatarPalette=[['#CFF9FA','#052D33'],['#FFE9CC','#7C2D12'],['#FCE4F1','#831843'],['#DBEEFF','#0C4A6E'],['#E6E4FF','#4C1D95'],['#DDF5E3','#14532D']];
export function avatarColors(seed:string){let hash=0;for(let i=0;i<seed.length;i++)hash=(hash*31+seed.charCodeAt(i))>>>0;const pair=avatarPalette[hash%avatarPalette.length];return {background:pair[0],color:pair[1]} as const;}
export function avatarInitials(name:string){return name.trim().split(/\s+/).slice(0,2).map(word=>word[0]??'').join('').toUpperCase()||'PC';}
function useHeaderMenu(id:string){
 const [open,setOpen]=useState(false);const pathname=usePathname();const restoreFocus=useRef(true);
 useEffect(()=>{setOpen(false)},[pathname]);
 useEffect(()=>{const close=(event:Event)=>{if((event as CustomEvent).detail!==id){restoreFocus.current=false;setOpen(false)}};window.addEventListener('parcelcare:header-menu',close);return()=>window.removeEventListener('parcelcare:header-menu',close)},[id]);
 return [open,(value:boolean)=>{if(value){restoreFocus.current=true;window.dispatchEvent(new CustomEvent('parcelcare:header-menu',{detail:id}));}setOpen(value)},restoreFocus] as const;
}
function useMobile(){const [mobile,setMobile]=useState(false);useEffect(()=>{const media=matchMedia('(max-width:767px)');const update=()=>setMobile(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update)},[]);return mobile;}

export function LanguageMenu(){
 const my=useMyanmar();const trigger=useRef<HTMLButtonElement>(null);const [open,setOpen,restoreFocus]=useHeaderMenu('language');const [ready,setReady]=useState(false);
 useEffect(()=>{const update=()=>setReady(!!document.documentElement.dataset.language);update();const observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-language']});return()=>observer.disconnect()},[]);
 const choose=(language:string)=>{window.dispatchEvent(new CustomEvent('parcelcare:set-language',{detail:language}));setOpen(false)};
 return <div id="language-switch" translate="no"><Menu.Root modal={false} open={open} onOpenChange={setOpen}><Menu.Trigger ref={trigger} disabled={!ready} className="headerTrigger languageTrigger" aria-label={my?'ဘာသာစကား ရွေးရန်':'Choose language'}><TranslateIcon size={19} aria-hidden/><span>{my?'မြန်မာ':'English'}</span><CaretDownIcon size={12} aria-hidden/></Menu.Trigger><Menu.Portal><Menu.Positioner align="end" sideOffset={8} className="headerMenuPositioner"><Menu.Popup className="headerPopup languagePopup" finalFocus={()=>restoreFocus.current?trigger.current:false} aria-label="Language" translate="no">{[['en','English'],['my','မြန်မာ']].map(([id,label])=><Menu.Item key={id} className="accountMenuItem" onClick={()=>choose(id)} ><span>{label}</span>{(my?id==='my':id==='en')&&<CheckIcon aria-hidden size={16}/>}</Menu.Item>)}</Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root></div>;
}

import {useSession} from '../../features/auth/session';

type ProfileProps={role:string;name?:string;actorId:string;context:string;accountHref:string;signOut:()=>Promise<void>;placement?:'header'|'sidebar'};
export function ProfileMenu({role,name,actorId,context,accountHref,signOut,placement='header'}:ProfileProps){
 const my=useMyanmar(),mobile=useMobile();const [open,setOpen,restoreFocus]=useHeaderMenu('profile');const [ready,setReady]=useState(false);useEffect(()=>setReady(true),[]);
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const trigger=useRef<HTMLButtonElement>(null),cancel=useRef<HTMLButtonElement>(null);
 const [collapsed,setCollapsed]=useState(false);
 useEffect(()=>{const update=()=>setCollapsed(document.documentElement.classList.contains('sidebarCollapsed'));update();const observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:['class']});return()=>observer.disconnect()},[]);
 const t=(en:string,mm:string)=>my?mm:en;
 const roleLabel=localizedText(role,my?'my':'en');
 const displayName=name||roleLabel;
 const shortAccount=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(actorId)?`…${actorId.slice(-8)}`:actorId;
 const shortContext=context.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,id=>`…${id.slice(-8)}`);
 const startSignOut=()=>{setOpen(false);setError('');setConfirm(true)};
 const toggleSidebar=()=>{window.dispatchEvent(new Event('parcelcare:toggle-sidebar'));setOpen(false)};
 const logout=async()=>{if(busy)return;setBusy(true);setError('');try{await signOut();setConfirm(false)}catch{setError(t('Unable to sign out. Please try again.','အကောင့်မှ ထွက်၍မရပါ။ ထပ်မံကြိုးစားပါ။'))}finally{setBusy(false)}};
 const identity=<div className="accountIdentity" translate="no"><span className="profileAvatar" style={avatarColors(actorId)} aria-hidden>{avatarInitials(displayName)}</span><div><strong data-user-content>{displayName}</strong><p>{roleLabel} · {t('Account','အကောင့်')} · <span data-user-content>{shortAccount}</span></p><p className="accountContext"><MapPinIcon size={13} aria-hidden/><span data-user-content>{shortContext}</span></p></div></div>;
 const isSidebar=placement==='sidebar';
 const button=isSidebar?(
   <><span className="profileAvatar" style={avatarColors(actorId)} aria-hidden>{avatarInitials(displayName)}</span><span className="sidebarProfileInfo"><strong className="sidebarProfileName" data-user-content>{displayName}</strong><small className="sidebarProfileSub">{roleLabel}</small></span><CaretDownIcon size={13} className="sidebarProfileCaret" aria-hidden/></>
 ):(
   <><span className="profileAvatar" style={avatarColors(actorId)} aria-hidden>{avatarInitials(displayName)}</span><span className="profileRole">{roleLabel}</span><CaretDownIcon size={13} aria-hidden/></>
 );
 const triggerClass=isSidebar?'sidebarProfileTrigger':'headerTrigger profileTrigger';
 const accountLabel=t('My account','ကျွန်ုပ်၏အကောင့်'),sidebarLabel=mobile?t('Open navigation','လမ်းညွှန်မီနူး ဖွင့်ရန်'):collapsed?t('Expand sidebar','ဘေးမီနူး ဖြန့်ရန်'):t('Collapse sidebar','ဘေးမီနူး ခေါက်ရန်'),signOutLabel=t('Sign out','ထွက်ရန်');
 return <div className={isSidebar?'sidebarProfileControl':'profileControl'} translate="no">
 {mobile?<Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Trigger disabled={!ready} ref={trigger} className={triggerClass} aria-label={t('Profile','ပရိုဖိုင်')}>{button}</Dialog.Trigger><Dialog.Portal><Dialog.Backdrop className="accountBackdrop"/><Dialog.Popup className="profileDrawer" finalFocus={trigger} translate="no"><div className="drawerHeading"><Dialog.Title>{t('Profile','ပရိုဖိုင်')}</Dialog.Title><Dialog.Close className="iconButton" aria-label={t('Close profile','ပရိုဖိုင် ပိတ်ရန်')}><XIcon size={22}/></Dialog.Close></div>{identity}<Link className="accountMenuItem" href={accountHref} onClick={()=>setOpen(false)}><UserCircleIcon size={19} aria-hidden/><span className="accountActionCopy"><span>{accountLabel}</span><small>{t('Account details & access','အကောင့်နှင့် အသုံးပြုခွင့်များ')}</small></span></Link><button className="accountMenuItem" onClick={toggleSidebar}><SidebarSimpleIcon size={19} aria-hidden/>{sidebarLabel}</button><button className="accountMenuItem signOutItem" onClick={startSignOut}><SignOutIcon size={19} aria-hidden/>{signOutLabel}</button></Dialog.Popup></Dialog.Portal></Dialog.Root>:
 <Menu.Root modal={false} open={open} onOpenChange={setOpen}><Menu.Trigger disabled={!ready} ref={trigger} className={triggerClass} aria-label={t('Profile','ပရိုဖိုင်')}>{button}</Menu.Trigger><Menu.Portal><Menu.Positioner side={isSidebar?'top':'bottom'} align={isSidebar?'start':'end'} sideOffset={isSidebar?10:8} className="headerMenuPositioner"><Menu.Popup className="headerPopup profilePopup" finalFocus={()=>confirm||!restoreFocus.current?false:trigger.current} translate="no" aria-label={t('Profile','ပရိုဖိုင်')}>{identity}<Menu.LinkItem render={<Link href={accountHref}/>} className="accountMenuItem"><UserCircleIcon size={19} aria-hidden/><span className="accountActionCopy"><span>{accountLabel}</span><small>{t('Account details & access','အကောင့်နှင့် အသုံးပြုခွင့်များ')}</small></span></Menu.LinkItem><Menu.Item className="accountMenuItem signOutItem" onClick={startSignOut}><SignOutIcon size={19} aria-hidden/>{signOutLabel}</Menu.Item></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root>}
 <Dialog.Root open={confirm} disablePointerDismissal onOpenChange={(value)=>{if(!busy)setConfirm(value)}}><Dialog.Portal><Dialog.Backdrop className="accountBackdrop"/><Dialog.Popup className="signOutDialog" initialFocus={cancel} finalFocus={trigger} translate="no"><Dialog.Title>{t('Are you sure you want to sign out?','Sign out လုပ်မှာ သေချာပါသလား?')}</Dialog.Title><Dialog.Description>{t('You will need to sign in again to access your workspace.','လုပ်ငန်းခွင်ကို ပြန်သုံးရန် အကောင့်ပြန်ဝင်ရပါမည်။')}</Dialog.Description>{error&&<p role="alert" className="signOutError">{error}</p>}<div className="confirmActions"><Dialog.Close ref={cancel} disabled={busy} className="accountButton">{t('Cancel','မလုပ်တော့ပါ')}</Dialog.Close><button disabled={busy} className="accountButton dangerButton" onClick={()=>void logout()}>{busy?t('Signing out…','ထွက်နေသည်…'):error?t('Retry sign out','ထပ်မံထွက်ရန်'):signOutLabel}</button></div>{busy&&<p role="status">{t('Signing out…','ထွက်နေသည်…')}</p>}</Dialog.Popup></Dialog.Portal></Dialog.Root>
 </div>;
}

export function SidebarProfile(){
 const session=useSession();
 const [warehouseName,setWarehouseName]=useState(''),[smeName,setSmeName]=useState('');
 useEffect(()=>{
  if(session.status!=='ready'||!session.api)return;
  const controller=new AbortController(),signal=controller.signal;
  void session.api.getWarehouseDirectory(session.warehouseId,signal).then(d=>{
   setWarehouseName(d.name);
   setSmeName(d.smes.find(s=>s.id===session.smeId)?.name??'');
  }).catch(()=>{});
  return()=>controller.abort();
 },[session.status,session.api,session.warehouseId,session.smeId]);
 if(session.status!=='ready'||!session.identity)return null;
 const audience=session.audience==='rider'?'courier':session.audience;
 const isOwner=session.identity.memberships.some(m=>m.warehouse_id===session.warehouseId&&m.role==='owner');
 const role=audience==='sme'?'SME':audience==='warehouse'?(isOwner?'Warehouse owner':'Warehouse staff'):'In-house courier';
 const name=audience==='sme'?(smeName||`SME · …${session.smeId.slice(-8)}`):audience==='warehouse'?(warehouseName||`Warehouse · …${session.warehouseId.slice(-8)}`):`…${session.identity.actor_id.slice(-8)}`;
 const context=audience==='sme'?`SME · …${session.smeId.slice(-8)}`:session.warehouseId?`Warehouse · …${session.warehouseId.slice(-8)}`:'ParcelCare';
 const accountHref=`${session.demo?'/demo':''}/${audience}/account`;
 return (
   <div className="sidebarProfileCard" translate="no">
     <ProfileMenu
       role={role}
       name={name}
       actorId={session.identity.actor_id}
       context={context}
       accountHref={accountHref}
       signOut={session.signOut}
       placement="sidebar"
     />
   </div>
 );
}

