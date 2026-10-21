begin;
create function public.review_case(p_case uuid,p_key uuid,p_body jsonb,p_correlation uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.exception_cases; old private.workflow_commands; req jsonb; result jsonb; party text:=p_body->>'responsible_party'; v_owner_id uuid:=(p_body->>'owner_id')::uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||'review'||p_key::text,0));
 select * into c from public.exception_cases where id=p_case for update;
 if c.id is null or not private.is_staff(c.warehouse_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if p_key is null or p_correlation is null then raise exception 'invalid_command' using errcode='22023'; end if;
 req:=jsonb_build_object('entity',p_case,'body',p_body);
 select * into old from private.workflow_commands where actor_id=auth.uid() and key=p_key and kind='review';
 if old.key is not null then
  if old.request<>req then raise exception 'idempotency_conflict' using errcode='22023'; end if;
  return old.result;
 end if;
 if (p_body->>'expected_version')::integer is distinct from c.version or p_body->>'source_version' is distinct from private.case_source(c)
 then raise exception 'stale_version' using errcode='22023'; end if;
 if c.status in ('closed','resolved') or coalesce(length(btrim(p_body->>'note')),0) not between 1 and 2000 then raise exception 'invalid_review' using errcode='22023'; end if;
 if p_body->>'kind'='owner' then
  if v_owner_id is not null and not exists(select 1 from public.memberships where warehouse_id=c.warehouse_id and profile_id=v_owner_id and active and role in ('owner','staff'))
  then raise exception 'invalid_owner' using errcode='22023'; end if;
  update public.exception_cases set owner_id=v_owner_id where id=c.id;
 elsif p_body->>'kind'='responsibility' then
  if party not in ('WAREHOUSE','THIRD_PARTY_COURIER','UNDETERMINED') or
   (party<>'UNDETERMINED' and (coalesce(length(btrim(p_body->>'basis')),0)=0 or jsonb_array_length(coalesce(p_body->'evidence_ids','[]'))=0))
   or exists(select 1 from jsonb_array_elements_text(coalesce(p_body->'evidence_ids','[]')) x where not exists(
    select 1 from public.evidence e join storage.objects o on o.bucket_id='parcelcare-evidence' and o.name=e.object_path
    where e.id=x.value::uuid and e.shipment_id=c.shipment_id and private.can_read_evidence(e.id)))
  then raise exception 'invalid_responsibility_basis' using errcode='22023'; end if;
  update public.exception_cases set responsible_party=party,responsibility_basis=nullif(btrim(p_body->>'basis'),'') where id=c.id;
 else raise exception 'invalid_review' using errcode='22023'; end if;
 perform set_config('parcelcare.correlation_id',p_correlation::text,true);
 update public.exception_cases set version=version+1 where id=c.id returning * into c;
 insert into public.case_events(case_id,warehouse_id,sme_id,actor_id,actor_type,type,payload,sme_visible)
  values(c.id,c.warehouse_id,c.sme_id,auth.uid(),'staff','review',p_body,p_body->>'kind'='responsibility');
 perform private.emit_domain_event(c.warehouse_id,c.sme_id,'case.reviewed',c.id,'review:'||auth.uid()::text||':'||p_key::text,p_body);
 result:=private.case_detail(c);
 insert into private.workflow_commands(actor_id,key,kind,request,result) values(auth.uid(),p_key,'review',req,result);
 return result;
end $$;
revoke all on function public.review_case(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.review_case(uuid,uuid,jsonb,uuid) to authenticated;
commit;
