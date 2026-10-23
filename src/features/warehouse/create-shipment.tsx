'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ApiError, type Schemas } from '../../shared/api';
import { isUUID } from '../../shared/api/transport';
import { Button, Card, Input } from '../../shared/ui';
import { useSession } from '../auth/session';
import { useCommand } from './command';
import { ErrorPanel, Loading, useResource } from './shared';
import { CaretDownIcon, TruckIcon } from '@phosphor-icons/react';

export function CreateOutboundShipment({smes,refresh}:{smes:{id:string;name:string}[];refresh:()=>void}) {
  const {api,warehouseId,identity}=useSession();
  const [sme,setSme]=useState(''),[reference,setReference]=useState('');
  const [pool,setPool]=useState<'common'|'legacy'>('common');
  const [mode,setMode]=useState<'in_house'|'third_party'>('in_house');
  const [quantities,setQuantities]=useState<Record<string,string>>({});
  const [error,setError]=useState(''),[review,setReview]=useState(false);
  const inventory=useResource(`${warehouseId}:${sme}:${pool}`,async signal=>{
    if(!sme)return [];
    if(pool==='common')return api!.getWarehouseCatalog(warehouseId,signal);
    const products:Schemas['InventoryItem'][]=[];let cursor:string|undefined;
    const seen=new Set<string>();
    do {
      const page=await api!.listInventory({warehouseId,smeId:sme,limit:100,cursor,signal});
      products.push(...page.items);cursor=page.next_cursor??undefined;
      if(cursor&&seen.has(cursor))throw new Error('Inventory pagination did not advance');
      if(cursor)seen.add(cursor);
    } while(cursor);
    return products;
  });
  const command=useCommand<Schemas['CreateShipment'],Schemas['Shipment']>(`outbound-create:${identity!.actor_id}:${warehouseId}`,async(body,key)=>{
    const result=await api!.createShipment(body,{warehouseId,idempotencyKey:key});
    if(!result||!isUUID(result.id)||!Number.isSafeInteger(result.version)||result.version<1||result.warehouse_id!==warehouseId||result.sme_id!==body.sme_id||result.direction!=='outbound'||result.delivery_mode!==body.delivery_mode||result.reference!==body.reference||result.status!=='ready')throw new ApiError(502,'INVALID_RESPONSE','Shipment creation could not be confirmed. Retry the saved request.');
    return result;
  },()=>{setReview(false);setQuantities({});setReference('');refresh();});
  const lines=Object.entries(quantities).filter(([,qty])=>qty!==''&&Number(qty)!==0).map(([product_id,qty])=>({product_id,expected_qty:Number(qty)}));
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError('');
    if(!sme||!reference.trim()||!lines.length||lines.length>100||lines.some(line=>!Number.isSafeInteger(line.expected_qty)||line.expected_qty<=0||!inventory.data?.some(p=>p.id===line.product_id&&line.expected_qty<=p.available_qty))){setError('Choose an SME, reference and whole quantities within available stock.');return;}
    if(!review){setReview(true);return;}
    void command.execute({sme_id:sme,reference:reference.trim(),direction:'outbound',delivery_mode:mode,lines});
  }
  return <Card className="my-5"><details className="createShipment">
    <summary className="createShipmentToggle">
      <span className="createShipmentIcon" aria-hidden="true"><TruckIcon size={20} weight="bold"/></span>
      <span className="createShipmentCopy"><strong>Create outbound shipment</strong></span>
      <span className="createShipmentChevron" aria-hidden="true"><CaretDownIcon size={18} weight="bold"/></span>
    </summary>
    <div className="createShipmentBody">
    <p className="createShipmentHint">For warehouse-created shipments. After saving, open delivery management to set the destination and arrange pickup or carrier handover. Stock is checked and deducted at dispatch or handover.</p>
    {command.result&&<p role="status" className="createShipmentSuccess">Shipment created. <Link className="text-brand underline" href={`/warehouse/shipments/${command.result.id}`}>Open {command.result.reference} →</Link></p>}
    {(error||command.error)&&<p role="alert" className="createShipmentAlert">{error||command.error}</p>}
    {command.pending&&<div className="createShipmentPending"><p>Creation is awaiting confirmation: {command.pending.body.reference}. Retry the saved request before creating another shipment.</p><Button disabled={command.busy} onClick={()=>void command.execute()}>Retry shipment creation</Button></div>}
    <form onSubmit={submit}><fieldset disabled={!command.ready||command.busy||!!command.pending} className="createShipmentFields">
      <div className="createShipmentGrid">
        <label>Shipment SME<select required aria-label="Shipment SME" value={sme} onChange={e=>{setSme(e.target.value);setQuantities({});setReview(false);}}><option value="">Select SME</option>{smes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Stock pool<select aria-label="Stock pool" value={pool} onChange={e=>{setPool(e.target.value as typeof pool);setQuantities({});setReview(false);}}><option value="common">Warehouse common stock</option><option value="legacy">Legacy SME stock</option></select></label>
        <label>Delivery mode<select aria-label="Shipment delivery mode" value={mode} onChange={e=>{setMode(e.target.value as typeof mode);setReview(false);}}><option value="in_house">In-house rider</option><option value="third_party">Third-party courier</option></select></label>
        <label>Shipment reference<Input required maxLength={120} value={reference} onChange={e=>{setReference(e.target.value);setReview(false);}}/></label>
      </div>
      {inventory.error?<ErrorPanel error={inventory.error} retry={inventory.reload}/>:inventory.loading?<Loading/>:sme&&inventory.data?.length?<div className="createShipmentItems">{inventory.data.map(p=><div className="createShipmentItem" key={p.id}><span className="createShipmentItemInfo"><strong data-user-content>{p.name}</strong><small data-user-content>{p.sku}</small></span><span className="createShipmentStock">{p.available_qty} available</span><label className="createShipmentQty"><span>Qty</span><Input aria-label={`Shipment quantity for ${p.name}`} type="number" min={0} max={p.available_qty} step={1} value={quantities[p.id]??''} onChange={e=>{setQuantities(q=>({...q,[p.id]:e.target.value}));setReview(false);}}/></label></div>)}</div>:sme&&<p>No stock available in the selected pool.</p>}
      {review&&<section aria-label="Outbound shipment review" className="createShipmentReview"><p>{reference} · {smes.find(s=>s.id===sme)?.name} · {mode==='in_house'?'In-house rider':'Third-party courier'}</p>{lines.map(l=><p key={l.product_id}>{inventory.data?.find(p=>p.id===l.product_id)?.name} × {l.expected_qty}</p>)}<p>Stock is not reserved by direct shipment creation. Set the delivery destination before arranging delivery.</p></section>}
      <Button type="submit" disabled={!!inventory.error||inventory.loading}>{review?'Confirm create shipment':'Review outbound shipment'}</Button>
    </fieldset></form>
    </div>
  </details></Card>;
}
