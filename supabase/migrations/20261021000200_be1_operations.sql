begin;
create table public.products (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null,
  sme_id uuid not null,
  sku text not null check (length(trim(sku)) between 1 and 100),
  name text not null,
  available_qty integer not null default 0 check (available_qty >= 0),
  quarantined_qty integer not null default 0 check (quarantined_qty >= 0),
  created_at timestamptz not null default now(),
  foreign key (sme_id,warehouse_id) references public.smes(id,warehouse_id),
  unique(sme_id,sku), unique(id,warehouse_id,sme_id)
);
create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null,
  sme_id uuid not null,
  reference text not null,
  direction text not null check (direction in ('inbound','outbound')),
  status text not null default 'expected' check (status in
    ('expected','partially_received','received','received_with_discrepancies','ready','assigned','picked_up','in_transit','delayed','failed','delivered','cancelled','handed_over')),
  expected_at timestamptz,
  delivery_mode text check (delivery_mode in ('in_house','third_party')),
  courier_name text, waybill text,
  tracking_url text check (tracking_url is null or tracking_url ~ '^https://[^[:space:]]+$'),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  check ((direction = 'inbound' and delivery_mode is null) or (direction = 'outbound' and delivery_mode is not null)),
  foreign key (sme_id,warehouse_id) references public.smes(id,warehouse_id),
  unique(warehouse_id,reference), unique(id,warehouse_id,sme_id)
);
create table public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null,
  warehouse_id uuid not null, sme_id uuid not null,
  product_id uuid not null,
  expected_qty integer not null check (expected_qty > 0),
  received_qty integer not null default 0 check (received_qty >= 0),
  damaged_qty integer not null default 0 check (damaged_qty between 0 and received_qty),
  foreign key(shipment_id,warehouse_id,sme_id) references public.shipments(id,warehouse_id,sme_id),
  foreign key(product_id,warehouse_id,sme_id) references public.products(id,warehouse_id,sme_id),
  unique(shipment_id,product_id)
);
create table public.shipment_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null,
  warehouse_id uuid not null, sme_id uuid not null,
  type text not null, details jsonb not null default '{}',
  source text not null check (source in ('staff','rider','sme','system')),
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key(shipment_id,warehouse_id,sme_id) references public.shipments(id,warehouse_id,sme_id)
);
create table public.riders (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id),
  profile_id uuid not null references public.profiles(id),
  active boolean not null default true,
  unique(warehouse_id,profile_id), unique(id,warehouse_id)
);
create table public.delivery_assignments (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null,
  warehouse_id uuid not null, sme_id uuid not null,
  rider_id uuid not null,
  assigned_at timestamptz not null default now(), accepted_at timestamptz,
  picked_up_at timestamptz, completed_at timestamptz, cancelled_at timestamptz,
  foreign key(shipment_id,warehouse_id,sme_id) references public.shipments(id,warehouse_id,sme_id),
  foreign key(rider_id,warehouse_id) references public.riders(id,warehouse_id),
  unique(id,shipment_id,rider_id),
  check (completed_at is null or picked_up_at is not null)
);
create unique index assignment_active_unique on public.delivery_assignments(shipment_id)
  where completed_at is null and cancelled_at is null;
create table public.tracking_sessions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null,
  warehouse_id uuid not null, sme_id uuid not null,
  rider_id uuid not null, assignment_id uuid not null,
  status text not null default 'active' check (status in ('active','stopped','completed','cancelled')),
  consent_at timestamptz not null, started_at timestamptz not null default now(),
  ended_at timestamptz, last_location_at timestamptz,
  foreign key(shipment_id,warehouse_id,sme_id) references public.shipments(id,warehouse_id,sme_id),
  foreign key(rider_id,warehouse_id) references public.riders(id,warehouse_id),
  foreign key(assignment_id,shipment_id,rider_id) references public.delivery_assignments(id,shipment_id,rider_id),
  check ((status = 'active' and ended_at is null) or (status <> 'active' and ended_at is not null))
);
create unique index tracking_active_unique on public.tracking_sessions(shipment_id) where status='active';
create table public.rider_locations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.tracking_sessions(id),
  latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  accuracy_m double precision not null check(accuracy_m >= 0 and accuracy_m < 'Infinity'::float8),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  unique(session_id,recorded_at)
);
create index location_latest_idx on public.rider_locations(session_id,recorded_at desc);
create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null,
  warehouse_id uuid not null, sme_id uuid not null,
  uploaded_by uuid not null references public.profiles(id),
  object_path text not null unique,
  mime_type text not null check(mime_type in ('image/jpeg','image/png','application/pdf')),
  size_bytes bigint not null check(size_bytes between 1 and 10485760),
  sme_visible boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key(shipment_id,warehouse_id,sme_id) references public.shipments(id,warehouse_id,sme_id),
  unique(id,shipment_id)
);
create table public.handover_records (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null,
  warehouse_id uuid not null, sme_id uuid not null,
  courier_name text not null, waybill text not null, accepted_at timestamptz not null,
  package_condition text not null, package_count integer not null check(package_count > 0),
  evidence_id uuid not null, recorded_by uuid not null references public.profiles(id),
  foreign key(shipment_id,warehouse_id,sme_id) references public.shipments(id,warehouse_id,sme_id),
  foreign key(evidence_id,shipment_id) references public.evidence(id,shipment_id)
);
create table public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null,
  warehouse_id uuid not null, sme_id uuid not null,
  submitted_by uuid not null references public.profiles(id),
  received_by text not null check(length(trim(received_by)) > 0),
  evidence_id uuid not null,
  confirmed_by uuid references public.profiles(id), confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((confirmed_by is null) = (confirmed_at is null)),
  foreign key(shipment_id,warehouse_id,sme_id) references public.shipments(id,warehouse_id,sme_id),
  foreign key(evidence_id,shipment_id) references public.evidence(id,shipment_id)
);
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null,
  warehouse_id uuid not null, sme_id uuid not null,
  idempotency_key uuid not null,
  payload jsonb not null, result jsonb,
  is_final boolean not null, notes text not null default '',
  recorded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key(shipment_id,warehouse_id,sme_id) references public.shipments(id,warehouse_id,sme_id),
  unique(shipment_id,idempotency_key), unique(id,warehouse_id,sme_id)
);
create unique index receipt_final_unique on public.receipts(shipment_id) where is_final;
-- Initial append-only record of receipts/corrections; reservation accounting remains future work.
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null, sme_id uuid not null, product_id uuid not null,
  receipt_id uuid,
  available_delta integer not null, quarantined_delta integer not null,
  previous_available integer not null, updated_available integer not null check(updated_available >= 0),
  previous_quarantined integer not null, updated_quarantined integer not null check(updated_quarantined >= 0),
  reason text not null, actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key(product_id,warehouse_id,sme_id) references public.products(id,warehouse_id,sme_id),
  foreign key(receipt_id,warehouse_id,sme_id) references public.receipts(id,warehouse_id,sme_id),
  check(updated_available = previous_available + available_delta),
  check(updated_quarantined = previous_quarantined + quarantined_delta)
);
commit;
