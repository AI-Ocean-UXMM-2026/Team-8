begin;
create table public.exception_cases (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null, warehouse_id uuid not null, sme_id uuid not null,
  stage text not null check(stage in ('inbound','warehouse','outbound')),
  type text not null check(type in ('quantity_mismatch','damaged_goods','missing_stock','wrong_pick','short_pick','courier_delay','delivery_failed','recipient_unavailable','transit_damage','transit_loss')),
  priority text not null default 'normal' check(priority in ('low','normal','high','critical')),
  status text not null default 'new' check(status in ('new','investigating','processing','awaiting_information','awaiting_sme_decision','awaiting_courier_confirmation','awaiting_verification','resolved','closed')),
  handling_mode text not null default 'human' check(handling_mode in ('ai','human')),
  owner_id uuid references public.profiles(id),
  responsible_party text not null default 'UNDETERMINED' check(responsible_party in ('WAREHOUSE','THIRD_PARTY_COURIER','UNDETERMINED')),
  responsibility_basis text, summary text not null default '',
  resolution_note text, verified_by uuid references public.profiles(id), verified_at timestamptz,
  created_at timestamptz not null default now(), closed_at timestamptz,
  foreign key(shipment_id,warehouse_id,sme_id) references public.shipments(id,warehouse_id,sme_id),
  check((status='closed') = (closed_at is not null)),
  check(status not in ('resolved','closed') or (verified_by is not null and verified_at is not null and resolution_note is not null and length(trim(resolution_note)) > 0)),
  unique(id,warehouse_id,sme_id), unique(id,shipment_id)
);
create unique index case_active_unique on public.exception_cases(shipment_id,stage,type) where status not in ('resolved','closed');
create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null, warehouse_id uuid not null, sme_id uuid not null,
  actor_id uuid references public.profiles(id),
  actor_type text not null check(actor_type in ('staff','sme','rider','system','ai')),
  type text not null, payload jsonb not null default '{}',
  sme_visible boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key(case_id,warehouse_id,sme_id) references public.exception_cases(id,warehouse_id,sme_id)
);
create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null, warehouse_id uuid not null, sme_id uuid not null,
  kind text not null check(kind in ('partial_receipt','retry_time','proposed_correction','general')),
  options jsonb not null check(jsonb_typeof(options)='array' and jsonb_array_length(options)>0),
  status text not null default 'pending' check(status in ('pending','decided','cancelled')),
  decision text, note text,
  requested_by uuid references public.profiles(id), decided_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), decided_at timestamptz,
  check((status='decided') = (decision is not null and decided_by is not null and decided_at is not null)),
  foreign key(case_id,warehouse_id,sme_id) references public.exception_cases(id,warehouse_id,sme_id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null, warehouse_id uuid not null, sme_id uuid not null,
  message text not null, dedupe_key text not null,
  created_at timestamptz not null default now(),
  foreign key(case_id,warehouse_id,sme_id) references public.exception_cases(id,warehouse_id,sme_id),
  unique(case_id,dedupe_key)
);
-- Read state is per user, not a shared SME flag.
create table public.notification_reads (
  notification_id uuid not null references public.notifications(id),
  profile_id uuid not null references public.profiles(id),
  read_at timestamptz not null default now(), primary key(notification_id,profile_id)
);
create table public.resolution_policies (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null, sme_id uuid not null,
  version integer not null check(version > 0),
  allowed_actions jsonb not null check(jsonb_typeof(allowed_actions)='array'),
  rules jsonb not null default '{}', created_at timestamptz not null default now(),
  foreign key(sme_id,warehouse_id) references public.smes(id,warehouse_id),
  unique(sme_id,version), unique(id,warehouse_id,sme_id)
);
create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null, warehouse_id uuid not null, sme_id uuid not null,
  policy_id uuid not null,
  model text not null, source_version text not null,
  output jsonb not null, input_tokens integer check(input_tokens >= 0), output_tokens integer check(output_tokens >= 0),
  created_at timestamptz not null default now(),
  foreign key(case_id,warehouse_id,sme_id) references public.exception_cases(id,warehouse_id,sme_id),
  foreign key(policy_id,warehouse_id,sme_id) references public.resolution_policies(id,warehouse_id,sme_id)
);
create table public.action_executions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null, warehouse_id uuid not null, sme_id uuid not null,
  action text not null check(action in ('save_summary','notify_sme','request_information','request_sme_decision','propose_correction','escalate','update_workflow')),
  idempotency_key uuid not null,
  status text not null default 'requested' check(status in ('requested','accepted','pending','completed','failed')),
  actor_id uuid references public.profiles(id), result jsonb,
  created_at timestamptz not null default now(),
  foreign key(case_id,warehouse_id,sme_id) references public.exception_cases(id,warehouse_id,sme_id),
  unique(case_id,idempotency_key)
);
create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null, warehouse_id uuid not null, sme_id uuid not null,
  idempotency_key uuid not null,
  status text not null default 'queued' check(status in ('queued','running','completed','failed')),
  attempts integer not null default 0 check(attempts >= 0),
  requested_by uuid not null references public.profiles(id),
  available_at timestamptz not null default now(), last_error text,
  created_at timestamptz not null default now(),
  foreign key(case_id,warehouse_id,sme_id) references public.exception_cases(id,warehouse_id,sme_id),
  unique(case_id,idempotency_key)
);
create table public.audit_records (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id), sme_id uuid,
  actor_id uuid references public.profiles(id), action text not null,
  entity_id uuid not null, details jsonb not null default '{}',
  created_at timestamptz not null default now(),
  foreign key(sme_id,warehouse_id) references public.smes(id,warehouse_id)
);
create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses(id), sme_id uuid not null,
  event_type text not null, entity_id uuid not null, idempotency_key text not null unique,
  payload jsonb not null, created_at timestamptz not null default now(), processed_at timestamptz,
  foreign key(sme_id,warehouse_id) references public.smes(id,warehouse_id)
);
create index outbox_pending_idx on public.outbox_events(created_at) where processed_at is null;
create index jobs_pending_idx on public.analysis_jobs(available_at) where status='queued';
commit;
