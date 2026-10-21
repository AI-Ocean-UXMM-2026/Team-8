begin;
create function private.is_assigned_rider(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.delivery_assignments a join public.riders r on r.id=a.rider_id
    join public.memberships m on m.profile_id=r.profile_id and m.warehouse_id=r.warehouse_id
    where a.shipment_id=s and a.cancelled_at is null and r.active and m.active
      and m.role='rider' and r.profile_id=(select auth.uid()));
$$;
create function private.can_read_shipment(s uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.shipments x where x.id=s and
    (private.can_read_tenant(x.warehouse_id,x.sme_id) or private.is_assigned_rider(x.id)));
$$;
create function private.can_read_tracking(t uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.tracking_sessions x
    join public.shipments s on s.id=x.shipment_id
    join public.delivery_assignments a on a.id=x.assignment_id
    join public.riders r on r.id=x.rider_id
    where x.id=t and x.status='active' and x.ended_at is null
      and s.delivery_mode='in_house' and s.status not in ('delivered','cancelled')
      and a.completed_at is null and a.cancelled_at is null and r.active
      and (private.can_read_tenant(x.warehouse_id,x.sme_id) or private.is_assigned_rider(x.shipment_id)));
$$;
create function private.can_read_evidence(e uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.evidence x where x.id=e and
    (private.is_staff(x.warehouse_id) or (x.sme_visible and private.is_sme(x.warehouse_id,x.sme_id))
      or (x.uploaded_by=(select auth.uid()) and private.is_assigned_rider(x.shipment_id))));
$$;

-- Only SELECT is granted to browser/user clients. All domain writes go through
-- narrowly scoped RPCs (next migration) or authorized server-side services.
do $$
declare t text;
begin
  foreach t in array array['warehouses','profiles','smes','memberships','products','shipments',
    'shipment_items','shipment_events','riders','delivery_assignments','tracking_sessions','rider_locations',
    'evidence','handover_records','delivery_proofs','receipts','stock_movements','exception_cases',
    'case_events','approvals','notifications','notification_reads','resolution_policies','ai_analyses',
    'action_executions','analysis_jobs','audit_records','outbox_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
grant usage on schema public to authenticated;

create policy warehouses_read on public.warehouses for select to authenticated using
  (exists(select 1 from public.memberships m where m.warehouse_id=warehouses.id and m.profile_id=(select auth.uid()) and m.active));
create policy profiles_read on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy memberships_read on public.memberships for select to authenticated using
  (profile_id=(select auth.uid()) or private.is_staff(warehouse_id));
create policy smes_read on public.smes for select to authenticated using(private.can_read_tenant(warehouse_id,id));
create policy products_read on public.products for select to authenticated using(private.can_read_tenant(warehouse_id,sme_id));
create policy shipments_read on public.shipments for select to authenticated using(private.can_read_shipment(id));
create policy items_read on public.shipment_items for select to authenticated using(private.can_read_shipment(shipment_id));
create policy shipment_events_read on public.shipment_events for select to authenticated using(private.can_read_shipment(shipment_id));
create policy riders_read on public.riders for select to authenticated using
  (private.is_staff(warehouse_id) or (profile_id=(select auth.uid()) and active));
create policy assignments_read on public.delivery_assignments for select to authenticated using
  (private.is_staff(warehouse_id) or private.is_assigned_rider(shipment_id));
create policy sessions_read on public.tracking_sessions for select to authenticated using
  (private.is_staff(warehouse_id) or private.can_read_tracking(id));
-- Raw coordinate history is never directly exposed to a browser. The audited
-- get_live_location RPC returns at most one current coordinate.
revoke select on public.rider_locations from authenticated;
create policy evidence_read on public.evidence for select to authenticated using(private.can_read_evidence(id));
create policy handovers_read on public.handover_records for select to authenticated using(private.can_read_tenant(warehouse_id,sme_id));
create policy proofs_read on public.delivery_proofs for select to authenticated using(private.can_read_shipment(shipment_id));
create policy receipts_read on public.receipts for select to authenticated using(private.can_read_tenant(warehouse_id,sme_id));
create policy stock_read on public.stock_movements for select to authenticated using(private.is_staff(warehouse_id));
create policy cases_read on public.exception_cases for select to authenticated using(private.can_read_tenant(warehouse_id,sme_id));
create policy case_events_read on public.case_events for select to authenticated using
  (private.is_staff(warehouse_id) or (sme_visible and private.is_sme(warehouse_id,sme_id)));
create policy approvals_read on public.approvals for select to authenticated using(private.can_read_tenant(warehouse_id,sme_id));
create policy notifications_read on public.notifications for select to authenticated using(private.can_read_tenant(warehouse_id,sme_id));
create policy notification_reads_read on public.notification_reads for select to authenticated using(profile_id=(select auth.uid()));
create policy policies_read on public.resolution_policies for select to authenticated using(private.can_read_tenant(warehouse_id,sme_id));
create policy analyses_read on public.ai_analyses for select to authenticated using(private.is_staff(warehouse_id));
create policy actions_read on public.action_executions for select to authenticated using(private.is_staff(warehouse_id));
create policy jobs_read on public.analysis_jobs for select to authenticated using(private.is_staff(warehouse_id));
create policy audit_read on public.audit_records for select to authenticated using(private.is_staff(warehouse_id));
-- Outbox has no user policy; workers only. AI payloads and internal jobs are not SME-visible.

-- Private storage: reserve a metadata record via register_evidence first, then
-- upload exactly that path using the user's JWT. No overwrite/delete grants.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('parcelcare-evidence','parcelcare-evidence',false,10485760,array['image/jpeg','image/png','application/pdf']);
create function private.storage_can_read(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.evidence e where e.object_path=p and private.can_read_evidence(e.id));
$$;
create function private.storage_can_upload(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.evidence e where e.object_path=p and e.uploaded_by=(select auth.uid())
    and private.can_read_shipment(e.shipment_id));
$$;
create policy parcelcare_evidence_read on storage.objects for select to authenticated
  using(bucket_id='parcelcare-evidence' and private.storage_can_read(name));
create policy parcelcare_evidence_upload on storage.objects for insert to authenticated
  with check(bucket_id='parcelcare-evidence' and private.storage_can_upload(name));

-- Tenant/status lookups used by RLS and operational screens.
do $$
declare t text;
begin
  foreach t in array array['products','shipments','shipment_items','shipment_events','delivery_assignments',
    'tracking_sessions','evidence','handover_records','delivery_proofs','receipts','stock_movements',
    'exception_cases','case_events','approvals','notifications','resolution_policies','ai_analyses',
    'action_executions','analysis_jobs','audit_records','outbox_events'] loop
    execute format('create index %I on public.%I(warehouse_id,sme_id)',t || '_tenant_idx',t);
  end loop;
end $$;
create index case_timeline_idx on public.case_events(case_id,created_at);
create index shipment_timeline_idx on public.shipment_events(shipment_id,created_at);
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;
commit;
