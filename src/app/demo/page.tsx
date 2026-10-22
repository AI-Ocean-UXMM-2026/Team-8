import Link from 'next/link';
import {Card} from '../../shared/ui';
export default function Page(){return <main className="mx-auto min-h-screen max-w-6xl px-5 pb-10 pt-20"><Link href="/login" className="text-brand underline">Sign in to your live workspace →</Link><h1 className="mt-6 text-3xl font-semibold">ParcelCare demo dashboards</h1><p className="my-5 text-sm text-muted">Explore the three roles. Demo data never starts real GPS sharing or sends a routing request.</p><div className="grid gap-5 md:grid-cols-3">{[
 {name:'Warehouse',description:'Track this warehouse’s shipments, review stock and manage exceptions.',href:'/demo/warehouse/tracking',action:'Open warehouse GPS'},
 {name:'SME owner',description:'Track shipments belonging to your SME only.',href:'/demo/sme',action:'Open SME GPS'},
 {name:'Courier',description:'View assigned deliveries, choose a delivery route and review GPS-sharing controls.',href:'/demo/courier',action:'Open courier route & GPS'},
].map(role=><Card key={role.name}><h2 className="text-xl font-semibold">{role.name}</h2><p className="my-4 text-sm text-muted">{role.description}</p><Link className="inline-flex min-h-11 items-center font-semibold text-brand underline" href={role.href}>{role.action} →</Link></Card>)}</div></main>}
