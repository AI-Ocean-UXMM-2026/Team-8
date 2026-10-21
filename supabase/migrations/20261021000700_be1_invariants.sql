begin;
-- Guards also apply to privileged server writers. They are structural business
-- invariants, not substitutes for API identity/transition checks.
create function private.validate_assignment_mode() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.shipments s where s.id=new.shipment_id and s.direction='outbound' and s.delivery_mode='in_house')
    then raise exception 'assignment_requires_in_house_outbound' using errcode='23514'; end if;
  return new;
end $$;
create trigger assignment_mode_guard before insert or update on public.delivery_assignments
  for each row execute function private.validate_assignment_mode();

create function private.validate_handover_mode() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.shipments s where s.id=new.shipment_id and s.direction='outbound' and s.delivery_mode='third_party')
    then raise exception 'handover_requires_external_outbound' using errcode='23514'; end if;
  return new;
end $$;
create trigger handover_mode_guard before insert or update on public.handover_records
  for each row execute function private.validate_handover_mode();

create function private.prevent_mode_change_after_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.delivery_mode is distinct from old.delivery_mode or new.direction<>old.direction) and
    (exists(select 1 from public.delivery_assignments a where a.shipment_id=old.id)
      or exists(select 1 from public.handover_records h where h.shipment_id=old.id))
    then raise exception 'delivery_mode_has_operational_history' using errcode='23514'; end if;
  return new;
end $$;
create trigger shipment_mode_guard before update of direction,delivery_mode on public.shipments
  for each row execute function private.prevent_mode_change_after_assignment();

create unique index approval_pending_unique on public.approvals(case_id,kind) where status='pending';
revoke all on function private.validate_assignment_mode(),private.validate_handover_mode(),private.prevent_mode_change_after_assignment() from public,anon,authenticated;
commit;
