'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';
import { Badge, Button, Card, Input } from '../../shared/ui';
import type { Schemas } from '../../shared/api';
import { selectClass } from './shell';
import { Empty, ErrorPanel, Loading, PageTitle, useFilters, useResource } from './shared';
import './inventory.css';
import { ProductCategorization } from '../categorization/product-categorization';

export function Inventory() {
  const { api, warehouseId, demo } = useSession(); const { params, set } = useFilters();
  const smeId=params.get('sme_id')||'',stock=params.get('stock_status')||'';
  const [search,setSearch]=useState(''),[selected,setSelected]=useState('');
  const productTrigger=useRef<HTMLElement|null>(null);
  const openProduct=(id:string,trigger:HTMLElement)=>{productTrigger.current=trigger;setSelected(id);};
  const resource=useResource(warehouseId,async signal=>{
    const directory=await api!.getWarehouseDirectory(warehouseId,signal);
    const items:Schemas['InventoryItem'][]=[];const cursors=new Set<string>();let cursor:string|undefined;
    do{const page=await api!.listInventory({warehouseId,cursor,limit:100,signal});items.push(...page.items);cursor=page.next_cursor||undefined;if(cursor&&cursors.has(cursor))throw new Error('Inventory pagination did not advance.');if(cursor)cursors.add(cursor);}while(cursor);
    return {items,directory};
  });
  useEffect(()=>{const refresh=()=>resource.reload();window.addEventListener('parcelcare:warehouse-changed',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('parcelcare:warehouse-changed',refresh);window.removeEventListener('focus',refresh)}},[warehouseId]);
  if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
  if(!resource.data)return <Loading/>;
  const {items,directory}=resource.data,base=demo?'/demo/warehouse':'/warehouse';
  const smeName=(id:string)=>directory.smes.find(s=>s.id===id)?.name||'SME';
  const scoped=items.filter(i=>!smeId||i.sme_id===smeId);
  const visible=scoped.filter(i=>(!stock||(stock==='available'?i.available_qty>0:stock==='quarantined'?i.quarantined_qty>0:i.available_qty===0))&&[i.id,i.name,i.sku,i.sme_id,smeName(i.sme_id)].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
  const current=items.find(i=>i.id===selected),out=scoped.filter(i=>i.available_qty===0).length,held=scoped.filter(i=>i.quarantined_qty>0).length;
  return <div className="inventoryWorkspace"><PageTitle title="Inventory" my="ပစ္စည်းစာရင်း" description="Find products, check usable stock and review items on hold."/>
    {(out>0||held>0)&&<div className="inventoryWarning" role="status"><strong>Stock needs attention</strong><p><span>No available stock</span>: {out} · <span>Stock on hold</span>: {held} <span>products</span></p><span>Counts reflect the selected SME. Held units cannot be used until verified.</span></div>}
    <Card className="inventoryPanel"><div className="inventoryFilters"><label>Search inventory<Input aria-label="Search inventory" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Product ID, name, SKU or SME"/></label><div><label htmlFor="inventory-sme">SME</label><select id="inventory-sme" className={selectClass} value={smeId} onChange={e=>set('sme_id',e.target.value)}><option value="">All SMEs</option>{directory.smes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div><div><label htmlFor="stock-status">Stock status</label><select id="stock-status" className={selectClass} value={stock} onChange={e=>set('stock_status',e.target.value)}><option value="">All stock</option><option value="available">In stock</option><option value="out">Out of stock</option><option value="quarantined">Stock on hold</option></select></div><Button variant="outline" onClick={()=>{setSearch('');set('sme_id','');set('stock_status','')}}>Clear filters</Button></div>
      <p className="inventoryCount" role="status"><span>Showing</span> {visible.length} / {scoped.length} <span>products</span></p>
      {visible.length?<div className="inventoryTableWrap" tabIndex={0} aria-label="Inventory table"><table className="inventoryTable"><caption className="sr-only">SME product inventory</caption><thead><tr><th scope="col">Product / SKU</th><th scope="col">SME</th><th scope="col">Stock status</th><th scope="col">Stock quantities</th><th scope="col">Shipments / Details</th></tr></thead><tbody>{visible.map(item=><tr key={item.id} className={selected===item.id?'inventorySelected':undefined}><td data-label="Product / SKU"><button type="button" className="inventoryProduct inventoryProductButton" aria-expanded={selected===item.id} aria-controls={selected===item.id?'inventory-product-panel':undefined} onClick={e=>openProduct(item.id,e.currentTarget)} data-user-content>{item.name}</button><span className="inventorySku" data-user-content>{item.sku}</span></td><td data-label="SME" data-user-content>{smeName(item.sme_id)}</td><td data-label="Stock status"><Badge className={item.available_qty>0?'inventoryInStock':'inventoryOut'}>{item.available_qty>0?'In stock':'Out of stock'}</Badge>{item.quarantined_qty>0&&<Badge className="inventoryHeld">Review required</Badge>}</td><td data-label="Stock quantities"><dl className="inventoryQuantities"><div><dt>Available</dt><dd>{item.available_qty}</dd></div><div><dt>On hold</dt><dd>{item.quarantined_qty}</dd></div></dl></td><td data-label="Shipments / Details"><button className="inventoryLink" onClick={e=>openProduct(item.id,e.currentTarget)}>View details</button>{item.shipment_ids.length?<Link className="inventoryLink" href={`${base}/shipments/${item.shipment_ids[0]}`}>View shipment →</Link>:<span className="text-xs text-muted">No linked shipments</span>}</td></tr>)}</tbody></table></div>:<Empty text="No products match these filters."/>}
    </Card>
    {current&&<ProductDetails key={`${warehouseId}:${current.id}`} item={current} sme={smeName(current.sme_id)} base={base} close={()=>{setSelected('');productTrigger.current?.focus()}}/>}
  </div>;
}
function ProductDetails({item,sme,base,close}:{item:Schemas['InventoryItem'];sme:string;base:string;close:()=>void}){
 const {api,warehouseId}=useSession();
 useEffect(()=>{document.getElementById('inventory-product-detail')?.focus()},[item.id]);
 const related=useResource(`${warehouseId}:${item.id}`,async signal=>{const cases:Schemas['CaseSummary'][]=[];let cursor:string|undefined;const seen=new Set<string>();do{const page=await api!.listCases({warehouseId,status:'all',limit:100,cursor,signal});cases.push(...page.items.filter(c=>item.shipment_ids.includes(c.shipment_id)));cursor=page.next_cursor||undefined;if(cursor&&seen.has(cursor))throw new Error('Case pagination did not advance.');if(cursor)seen.add(cursor);}while(cursor);return cases;});
 return <Card className="inventoryDetail" id="inventory-product-panel" aria-labelledby="inventory-product-detail"><div className="inventoryDetailHeading"><div><h2 id="inventory-product-detail" tabIndex={-1} className="text-lg font-semibold" data-user-content>{item.name}</h2><p className="text-sm text-muted" data-user-content>{item.sku} · {sme}</p></div><Button variant="outline" onClick={close}>Close details</Button></div><p className="inventoryProductId">Product ID: <span data-user-content>{item.id}</span></p><ProductCategorization productId={item.id}/><div className="inventoryDetailGrid"><section><h3>Stock details</h3><dl className="inventoryDetailQuantities"><div><dt>Available</dt><dd>{item.available_qty}</dd></div><div><dt>Stock on hold</dt><dd>{item.quarantined_qty}</dd></div></dl><p className="text-sm text-muted">Available stock can be used. Held stock is excluded from available quantities.</p></section><section><h3>Stock on hold details</h3><Badge className={item.quarantined_qty>0?'inventoryHeld':'inventoryInStock'}>{item.quarantined_qty>0?'Review required':'No stock on hold'}</Badge><p className="mt-3 text-sm text-muted">Stock on hold is separated from usable stock until a warehouse check is complete.</p>{item.quarantined_qty>0&&<div className="inventoryHoldHelp"><h4>Review stock on hold</h4><p>Open the linked shipment to inspect the receipt, evidence and required checks. Product details do not release held stock.</p></div>}</section><section><h3>Linked shipments</h3>{item.shipment_ids.map((id,i)=><Link className="inventoryLink" key={id} href={`${base}/shipments/${id}`}>Shipment {i+1} · {id.slice(-8)} →</Link>)}{!item.shipment_ids.length&&<p>No linked shipments</p>}</section><section><h3>Related shipment cases</h3><p className="text-sm text-muted">Cases belong to linked shipments and may cover other products.</p>{related.error?<ErrorPanel error={related.error} retry={related.reload}/>:!related.data?<Loading/>:related.data.length?related.data.map(c=><Link key={c.id} className="inventoryLink" href={`${base}/exceptions/${c.id}`}>{c.type.replaceAll('_',' ')} · {c.id.slice(-8)} →</Link>):<p>No related cases recorded.</p>}</section></div></Card>;
}
