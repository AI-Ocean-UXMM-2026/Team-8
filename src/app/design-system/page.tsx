'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, type FormEvent } from 'react';
import { ArrowLeftIcon, ArrowUpRightIcon, CheckCircleIcon, SlidersHorizontalIcon, TruckIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const shipments = [
  ['PC-1042', 'Golden Bloom', 'Inbound', 'Awaiting receipt'],
  ['PC-1041', 'Lotus Living', 'In-house', 'In transit'],
  ['PC-1040', 'Mandalay Goods', 'Third-party', 'Handed over'],
];

export default function DesignSystemPage() {
  const [threshold, setThreshold] = useState(25);
  const [warehouse, setWarehouse] = useState<string | null>('yangon');
  const [confirmation, setConfirmation] = useState(false);
  const [saved, setSaved] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmation(true);
  }
  return (
    <div className="min-h-screen bg-muted/50 text-sm">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight"><Image src="/brand/parcelcare-logo.png" alt="ParcelCare" width={2171} height={724} className="h-auto w-40 sm:w-48" priority /><span className="ml-3 border-l pl-3 font-normal text-muted-foreground">Design system</span></Link>
          <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground"><ArrowLeftIcon aria-hidden="true" />Back to workspace</Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-8 px-6 py-10 md:py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-3"><Badge variant="outline">shadcn/ui · Vega</Badge><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Clarity in every operation.</h1><p className="max-w-xl leading-6 text-muted-foreground">Neutral surfaces. Teal and yellow accents. One consistent language for your warehouse, SMEs and riders.</p></div>
          <Badge variant="secondary">Interactive component reference · Demo data</Badge>
        </div>
        <Tabs defaultValue="preview" className="gap-6">
          <TabsList aria-label="Design system views"><TabsTrigger value="preview">Workspace preview</TabsTrigger><TabsTrigger value="foundations">Foundations</TabsTrigger></TabsList>
          <TabsContent value="preview" className="space-y-6">
            <div className="grid items-start gap-6 lg:grid-cols-3">
              <Card>
                <CardHeader><CardTitle>Shipment activity</CardTitle><CardDescription>Illustrative weekly warehouse volume</CardDescription></CardHeader>
                <CardContent className="space-y-6">
                  <div><span className="text-4xl font-semibold tracking-tight tabular-nums">1,248</span><p className="mt-2 text-xs text-muted-foreground">Shipments processed this month</p></div>
                  <div className="flex h-44 items-end justify-between gap-3" role="img" aria-label="Sample shipment volumes: Monday 64, Tuesday 92, Wednesday 78, Thursday 120, Friday 105">
                    {[64, 92, 78, 120, 105].map((value, index) => <div key={index} className="flex h-full flex-1 flex-col justify-end gap-3 text-center"><div className="w-full rounded-t-sm bg-primary/85" style={{ height: `${value / 1.4}%` }} /><span className="text-xs text-muted-foreground">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][index]}</span></div>)}
                  </div>
                  <div className="grid grid-cols-2 gap-3"><div className="rounded-md bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Inbound</p><p className="mt-2 text-xl font-semibold tabular-nums">842</p></div><div className="rounded-md bg-muted/60 p-4"><p className="text-xs text-muted-foreground">Outbound</p><p className="mt-2 text-xl font-semibold tabular-nums">406</p></div></div>
                </CardContent>
                <CardFooter><Button variant="outline" className="w-full" render={<Link href="/" />}>Open workspace<ArrowUpRightIcon aria-hidden="true" /></Button></CardFooter>
              </Card>
              <Card>
                <CardHeader><CardTitle>Low-stock threshold</CardTitle><CardDescription>Choose when an inventory alert should appear.</CardDescription></CardHeader>
                <CardContent>
                  <form id="threshold-form" className="space-y-6" onSubmit={submit}>
                    <div className="space-y-2"><Label htmlFor="warehouse-select">Warehouse</Label><Select value={warehouse} onValueChange={setWarehouse} items={{ yangon: 'Yangon fulfilment hub', mandalay: 'Mandalay fulfilment hub' }}><SelectTrigger className="w-full" id="warehouse-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yangon">Yangon fulfilment hub</SelectItem><SelectItem value="mandalay">Mandalay fulfilment hub</SelectItem></SelectContent></Select></div>
                    <div className="space-y-3"><div className="flex items-center justify-between"><Label htmlFor="threshold">Minimum available stock</Label><output htmlFor="threshold" className="text-2xl font-semibold tabular-nums">{threshold}<span className="ml-1 text-xs font-normal text-muted-foreground">units</span></output></div><Input id="threshold" type="range" min="5" max="100" value={threshold} onChange={event => { setThreshold(Number(event.target.value)); setSaved(false); }} className="h-4 border-0 p-0 accent-primary shadow-none" /><div className="flex justify-between text-xs text-muted-foreground"><span>5 units (min)</span><span>100 units (max)</span></div></div>
                    <div className="space-y-2"><Label htmlFor="threshold-notes">Notes</Label><Textarea id="threshold-notes" placeholder="Add context for the warehouse team…" className="min-h-28" /></div>
                    <Button type="submit" className="w-full"><SlidersHorizontalIcon aria-hidden="true" />Save threshold</Button>
                    {saved && <p role="status" className="flex items-center gap-2 text-xs text-primary-800 dark:text-primary-200"><CheckCircleIcon aria-hidden="true" />Preview updated. No production settings changed.</p>}
                  </form>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>At a glance</CardTitle><CardDescription>Keep operational states distinct and readable.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  {[['Awaiting receipt', '18', 'Inbound shipments ready for review', 65], ['Active deliveries', '12', 'Assigned in-house deliveries', 42], ['Needs a decision', '04', 'Cases awaiting SME confirmation', 24]].map(([label, value, description, progress]) => <div key={label} className="space-y-3 rounded-md bg-muted/60 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-3xl font-semibold tabular-nums">{value}</p><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div><p className="text-xs text-muted-foreground">{description}</p></div>)}
                </CardContent>
              </Card>
            </div>
            <Card><CardHeader><CardTitle>Recent shipments</CardTitle><CardDescription>Clear type, quiet borders and room for the details that matter.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Reference</TableHead><TableHead>SME</TableHead><TableHead>Delivery mode</TableHead><TableHead className="text-right">Status</TableHead></TableRow></TableHeader><TableBody>{shipments.map(([reference, sme, mode, status]) => <TableRow key={reference}><TableCell className="font-medium">{reference}</TableCell><TableCell>{sme}</TableCell><TableCell><span className="inline-flex items-center gap-2"><TruckIcon aria-hidden="true" className="text-muted-foreground" />{mode}</span></TableCell><TableCell className="text-right"><Badge variant="secondary">{status}</Badge></TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
          </TabsContent>
          <TabsContent value="foundations" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2"><Card><CardHeader><CardTitle>Semantic colors</CardTitle><CardDescription>Use shared tokens throughout every feature.</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-4">{[['Primary', 'bg-primary'], ['Muted', 'bg-muted'], ['Foreground', 'bg-foreground'], ['Border', 'bg-border']].map(([label, color]) => <div key={label}><div className={`mb-2 h-20 rounded-md border ${color}`} /><span className="text-xs">{label}</span></div>)}</CardContent></Card><Card><CardHeader><CardTitle>Geist, with purpose</CardTitle><CardDescription>Consistent hierarchy, from summaries to operational details.</CardDescription></CardHeader><CardContent className="space-y-5"><p className="text-3xl font-semibold tracking-tight">Every parcel, accounted for.</p><p className="text-base">Readable details. Clear next steps.</p><p className="text-xs text-muted-foreground">Vega · Neutral · Sky · Phosphor · Small radius</p><div className="flex flex-wrap gap-2"><Button>Primary</Button><Button variant="outline">Outline</Button><Button variant="secondary">Secondary</Button><Button disabled>Disabled</Button></div></CardContent></Card></div>
          </TabsContent>
        </Tabs>
        <footer className="flex flex-wrap justify-between gap-3 border-t pt-6 text-xs text-muted-foreground"><span>ParcelCare · Every parcel, accounted for.</span><span>Preset b5JNedagS</span></footer>
      </main>
      <Dialog open={confirmation} onOpenChange={setConfirmation}><DialogContent><DialogHeader><DialogTitle>Update preview threshold?</DialogTitle><DialogDescription>This component preview will show a threshold of {threshold} units. It does not change warehouse records.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmation(false)}>Cancel</Button><Button onClick={() => { setSaved(true); setConfirmation(false); }}>Confirm preview</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
