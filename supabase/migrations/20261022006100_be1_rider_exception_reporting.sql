begin;
-- A narrow rider-only command: do not grant riders general case access.
create function public.rider_report(p_shipment uuid,p_key uuid,p_body jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.shipments; a public.delivery_assignments; c public.exception_cases;
 old private.workflow_commands; req jsonb; result jsonb; note text:=btrim(p_body->>'note'); issue text:=p_body->>'type';
begin
 if auth.uid() is null or p_key is null or p_correlation is null or p_body is null then raise exception 'forbidden' using errcode='42501'; end if;
 perform set_config('parcelcare.correlation_id',p_correlation::text,true);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'rider_report'||p_key::text,0));
 select * into s from public.shipments where id=p_shipment for update;
 select d.* into a from public.delivery_assignments d join public.riders r on r.id=d.rider_id
 where d.shipment_id=p_shipment and d.cancelled_at is null and d.completed_at is null and r.active
 and r.profile_id=auth.uid() and private.is_assigned_rider(p_shipment)
 order by d.assigned_at desc limit 1 for update of d;
 if s.id is null or a.id is null then raise exception 'forbidden' using errcode='42501'; end if;
 req:=jsonb_build_object('entity',p_shipment,'body',p_body);
 -- Replays remain scoped to the caller's current active assignment.
 select * into old from private.workflow_commands where actor_id=auth.uid() and key=p_key and kind='rider_report';
 if old.key is not null then
  if old.request<>req then raise exception 'idempotency_conflict' using errcode='22023'; end if;
  return old.result;
 end if;
 if a.accepted_at is null or s.direction<>'outbound' or s.delivery_mode<>'in_house' or s.status in ('delivered','cancelled')
 then raise exception 'report_not_allowed' using errcode='22023'; end if;
 if coalesce(length(note),0) not between 1 and 2000 or issue is null or issue not in ('recipient_unavailable','delivery_failed','transit_damage','courier_delay')
 or jsonb_typeof(p_body->'evidence_ids') is distinct from 'array' then raise exception 'invalid_report' using errcode='22023'; end if;
 if jsonb_array_length(p_body->'evidence_ids')>100 then raise exception 'invalid_evidence' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_body->'evidence_ids') x where not exists(
  select 1 from public.evidence e join storage.objects o on o.bucket_id='parcelcare-evidence' and o.name=e.object_path
  where e.id::text=x.value and e.shipment_id=s.id and private.can_read_evidence(e.id))) then raise exception 'invalid_evidence' using errcode='22023'; end if;
 insert into public.exception_cases(shipment_id,warehouse_id,sme_id,stage,type,summary)
 values(s.id,s.warehouse_id,s.sme_id,'outbound',issue,note)
 on conflict(shipment_id,stage,type) where status not in ('resolved','closed') do nothing returning * into c;
 if c.id is null then select * into c from public.exception_cases where shipment_id=s.id and stage='outbound' and type=issue and status not in ('resolved','closed') for update; end if;
 update public.exception_cases set version=version+1 where id=c.id;
 insert into public.case_events(case_id,warehouse_id,sme_id,actor_id,actor_type,type,payload,sme_visible)
 values(c.id,s.warehouse_id,s.sme_id,auth.uid(),'rider','report',p_body||jsonb_build_object('assignment_id',a.id),true);
 perform private.audit(s.warehouse_id,s.sme_id,'case.rider_report',c.id,p_body);
 insert into public.outbox_events(warehouse_id,sme_id,event_type,entity_id,idempotency_key,payload,actor_id,correlation_id)
 values(s.warehouse_id,s.sme_id,'case.report',c.id,'rider-report:'||auth.uid()::text||':'||p_key::text,
 jsonb_build_object('case_id',c.id,'actor_id',auth.uid(),'schema_version',1,'occurred_at',now()),auth.uid(),p_correlation);
 result:=jsonb_build_object('id',c.id,'shipment_id',s.id,'stage','outbound','type',issue);
 insert into private.workflow_commands(actor_id,key,kind,request,result) values(auth.uid(),p_key,'rider_report',req,result);
 return result;
end $$;
revoke all on function public.rider_report(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.rider_report(uuid,uuid,jsonb,uuid) to authenticated;
commit;
