'use client';
import { useState } from 'react';
import { PackageIcon, TruckIcon, WarningCircleIcon, SquaresFourIcon } from '@phosphor-icons/react';
import { Badge, Button, Card } from '../../shared/ui';
import './illustrated.css';

const shipments = [
  {ref:'PC-IN-001',sme:'Golden Bloom',direction:'Inbound',status:'Receiving',units:100},
  {ref:'PC-OUT-002',sme:'Lotus Retail',direction:'Outbound',status:'Ready',units:48},
  {ref:'PC-OUT-003',sme:'Harbor Supply',direction:'Outbound',status:'In transit',units:24},
];
export function IllustratedPreview() {
  const [empty,setEmpty] = useState(false);
  const [query,setQuery] = useState('');
  const rows = empty ? [] : shipments.filter(s=>`${s.ref} ${s.sme}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="illustratedPreview pc-workspace">
    <aside className="ipSidebar" aria-label="Preview sidebar"><a href="#preview-main" className="ipBrand"><img src="/brand/parcelcare-logo.png" alt="ParcelCare" width="2171" height="724"/></a><p className="ipEyebrow">WAREHOUSE WORKSPACE</p><nav aria-label="Preview sections"><a href="#preview-main" aria-current="page"><SquaresFourIcon size={19}/>Overview</a><a href="#preview-shipments"><TruckIcon size={19}/>Shipments</a><a href="#preview-summary"><PackageIcon size={19}/>Summary</a></nav><div className="ipSidebarNote"><span className="ipHubDot"/>Yangon Hub<p>Design preview · Sample data</p></div></aside>
    <main id="preview-main" className="ipMain"><div className="ipTopline"><div><p className="ipEyebrow">DESIGN PREVIEW / WAREHOUSE</p><h1>Warehouse overview</h1></div><label className="ipStateSwitch">Preview state<select aria-label="Preview state" value={empty?'empty':'normal'} onChange={e=>{setEmpty(e.target.value==='empty');setQuery('');}}><option value="normal">Normal</option><option value="empty">Empty</option></select></label></div>
      <section className="ipWelcome" aria-labelledby="welcome-title"><div><span className="ipWelcomeLabel">A little care, in every parcel.</span><h2 id="welcome-title">A clear view of<br/>your warehouse.</h2><p>Keep shipments moving and give every exception the attention it needs.</p><a href="#preview-shipments" className="ipWelcomeLink">Review today’s shipments <span aria-hidden="true">→</span></a></div><img className="ipHeroArt" src="/illustrations/canva/truck-forklift.png" width="1600" height="1181" alt="" aria-hidden="true"/></section>
      <div id="preview-summary" className="ipSummary">{[
        {label:'Unique SKUs',value:empty?'0':'128',detail:'Products in your warehouse',Icon:PackageIcon},
        {label:'Inbound shipments',value:empty?'0':'12',detail:'Expected and receiving',Icon:TruckIcon},
        {label:'Outbound shipments',value:empty?'0':'24',detail:'Ready and in transit',Icon:TruckIcon},
        {label:'Open cases',value:empty?'0':'3',detail:'Need your attention',Icon:WarningCircleIcon},
      ].map(({label,value,detail,Icon},i)=><Card className={`ipMetric ${i===3?'ipAttention':''}`} key={label}><div><span>{label}</span><Icon size={20} aria-hidden="true"/></div><strong>{value}</strong><p>{detail}</p></Card>)}</div>
      <Card id="preview-shipments" className="ipShipments"><div className="ipSectionHeading"><div><h2>Recent shipments</h2><p>Sample records for this design preview.</p></div><label>Search shipments<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Reference or SME"/></label></div>
        {rows.length?<div className="ipTableScroll" role="region" aria-label="Recent shipments" tabIndex={0}><table><thead><tr><th scope="col">Reference</th><th scope="col">SME</th><th scope="col">Direction</th><th scope="col">Units</th><th scope="col">Status</th></tr></thead><tbody>{rows.map(s=><tr key={s.ref}><td data-user-content>{s.ref}</td><td data-user-content>{s.sme}</td><td>{s.direction}</td><td>{s.units}</td><td><Badge>{s.status}</Badge></td></tr>)}</tbody></table></div>:<div className="ipEmpty" role="status"><img src="/illustrations/canva/parcel-pallet.png" width="800" height="708" alt="" aria-hidden="true"/><h3>{query?'No matching shipments':'Your next shipment starts here'}</h3><p>{query?'Try a different reference or SME name.':'New shipment records will appear here when they are added.'}</p>{query&&<Button variant="outline" onClick={()=>setQuery('')}>Clear search</Button>}</div>}
      </Card><footer className="ipFooter">Original Canva artwork · Preview only · No operational records are changed.</footer>
    </main>
  </div>;
}
