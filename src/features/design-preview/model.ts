export type Role = 'warehouse' | 'sme' | 'rider';
export type ViewState = 'normal' | 'empty' | 'loading' | 'error' | 'exception';
export type Screen = { id: string; role: Role; name: string; path: string; kind: 'overview' | 'shipments' | 'shipment' | 'inventory' | 'exceptions' | 'case' | 'deliveries' | 'tasks' | 'task'; parent?: string };
export const screens: Screen[] = [
  { id: 'W01', role: 'warehouse', name: 'Overview', path: '/warehouse', kind: 'overview' },
  { id: 'W02', role: 'warehouse', name: 'Shipments', path: '/warehouse/shipments', kind: 'shipments' },
  { id: 'W03', role: 'warehouse', name: 'Shipment detail', path: '/warehouse/shipments/[id]', kind: 'shipment', parent: 'W02' },
  { id: 'W04', role: 'warehouse', name: 'Inventory', path: '/warehouse/inventory', kind: 'inventory' },
  { id: 'W05', role: 'warehouse', name: 'AI Exception Queue', path: '/warehouse/exceptions', kind: 'exceptions' },
  { id: 'W06', role: 'warehouse', name: 'Case detail', path: '/warehouse/exceptions/[id]', kind: 'case', parent: 'W05' },
  { id: 'W07', role: 'warehouse', name: 'Deliveries', path: '/warehouse/deliveries', kind: 'deliveries' },
  { id: 'S01', role: 'sme', name: 'Overview', path: '/sme', kind: 'overview' },
  { id: 'S02', role: 'sme', name: 'Inventory', path: '/sme/inventory', kind: 'inventory' },
  { id: 'S03', role: 'sme', name: 'Shipments', path: '/sme/shipments', kind: 'shipments' },
  { id: 'S04', role: 'sme', name: 'Shipment tracking', path: '/sme/shipments/[id]', kind: 'shipment', parent: 'S03' },
  { id: 'S05', role: 'sme', name: 'Exceptions', path: '/sme/exceptions', kind: 'exceptions' },
  { id: 'S06', role: 'sme', name: 'Case detail', path: '/sme/exceptions/[id]', kind: 'case', parent: 'S05' },
  { id: 'R01', role: 'rider', name: 'My Deliveries', path: '/rider', kind: 'tasks' },
  { id: 'R02', role: 'rider', name: 'Delivery detail', path: '/rider/deliveries/[id]', kind: 'task', parent: 'R01' },
];
export const states: ViewState[] = ['normal', 'empty', 'loading', 'error', 'exception'];
export const cases = [
  { id: 'EX-104', title: 'Receipt quantity mismatch', shipment: 'IN-204', sme: 'Lotus Retail', priority: 'High', escalation: 'Needs SME', stage: 'Awaiting SME', gap: '100 expected / 90 received' },
  { id: 'EX-105', title: 'SME location closed', shipment: 'OUT-301', sme: 'Lotus Retail', priority: 'Critical', escalation: 'Needs Warehouse', stage: 'Human Review', gap: 'Retry time needs capacity confirmation' },
  { id: 'EX-106', title: 'Courier delay', shipment: 'OUT-302', sme: 'Harbor Supply', priority: 'Normal', escalation: 'Needs Courier', stage: 'Awaiting courier confirmation', gap: 'No verified ETA' },
];
export const shipments = [
  { id: 'OUT-301', sme: 'Lotus Retail', direction: 'Outbound', mode: 'In-house', status: 'In Transit', items: 'SKU-01 · 20 units' },
  { id: 'IN-204', sme: 'Lotus Retail', direction: 'Inbound', mode: 'Receiving', status: 'Expected', items: 'SKU-01 · 100 expected' },
  { id: 'OUT-302', sme: 'Harbor Supply', direction: 'Outbound', mode: 'Third-party', status: 'Handed over', items: 'SKU-02 · 12 units' },
];
